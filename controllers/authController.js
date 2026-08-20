const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const pool = require("../db");
const config = require("../config/env");
const { toPositiveNumber, trimString } = require("../utils/validation");

/**
 * Unified Auth Controller
 * 
 * All JWT tokens follow the same payload structure:
 * {
 *   userId: number,
 *   email: string | null,
 *   phone: string | null,
 *   role: string
 * }
 * 
 * This ensures consistent role checking across all middleware.
 */

const JWT_SECRET = () => config.getJwtSecret();
const JWT_EXPIRY = "1d";

function isValidPassword(password) {
    return typeof password === "string" && password.length >= 8;
}

/**
 * Register a new farmer (creates both users + farmers records)
 */
exports.registerFarmer = async (req, res) => {
    try {
        const body = req.body || {};

        const fullName = body.full_name || body.fullName || body.name;
        const phone = body.phone || body.phone_number || body.phoneNumber;
        const nationalId = body.national_id || body.nationalId;
        const region = body.region;
        const district = body.district;
        const farmSize = body.farm_size || body.farmSize;
        const mainCrop = body.main_crop || body.mainCrop;
        const password = body.password;
        const email = body.email || null;
        const ward = body.ward || null;
        const village = body.village || null;

        // Basic validation
        const missingFields = [];
        if (!fullName) missingFields.push("full_name");
        if (!phone) missingFields.push("phone");
        if (!region) missingFields.push("region");
        if (!district) missingFields.push("district");
        if (!password) missingFields.push("password");

        if (missingFields.length > 0) {
            return res.status(400).json({
                error: "Required fields are missing",
                missingFields,
                receivedFields: Object.keys(body)
            });
        }

        if (!isValidPassword(password)) {
            return res.status(400).json({
                error: "Password must be at least 8 characters"
            });
        }

        const parsedFarmSize = farmSize === null || farmSize === undefined || farmSize === ""
            ? null
            : toPositiveNumber(farmSize);

        if (farmSize !== null && farmSize !== undefined && farmSize !== "" && !parsedFarmSize) {
            return res.status(400).json({
                error: "Farm size must be greater than zero"
            });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        // Use a transaction to create both users record and farmer profile
        const client = await pool.connect();

        try {
            await client.query("BEGIN");

            // 1. Create the unified user record
            const userResult = await client.query(
                `INSERT INTO users (username, email, phone, password_hash, role)
                 VALUES ($1, $2, $3, $4, 'farmer')
                 RETURNING id, email, phone, role, created_at`,
                [phone, email, phone, hashedPassword]
            );

            const user = userResult.rows[0];

            // 2. Create the farmer profile
            const farmerResult = await client.query(
                `INSERT INTO farmers 
                (user_id, full_name, phone, national_id, region, district, ward, village, farm_size, main_crop, password, role)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'farmer')
                RETURNING *`,
                [
                    user.id,
                    fullName,
                    phone,
                    nationalId || null,
                    region,
                    district,
                    ward,
                    village,
                    parsedFarmSize,
                    trimString(mainCrop) || null,
                    hashedPassword
                ]
            );

            await client.query("COMMIT");

            const farmer = farmerResult.rows[0];

            // Generate consistent JWT
            const token = jwt.sign(
                {
                    userId: user.id,
                    email: user.email,
                    phone: user.phone,
                    role: "farmer",
                    profileId: farmer.id
                },
                JWT_SECRET(),
                { expiresIn: JWT_EXPIRY }
            );

            delete farmer.password;

            res.status(201).json({
                message: "Farmer registered successfully",
                token,
                farmer,
                profile: farmer,
                user: {
                    id: user.id,
                    email: user.email,
                    role: user.role
                }
            });

        } catch (err) {
            await client.query("ROLLBACK");
            throw err;
        } finally {
            client.release();
        }

    } catch (err) {
        // Duplicate phone or email
        if (err.code === "23505") {
            const detail = err.detail || "";
            if (detail.includes("phone")) {
                return res.status(400).json({ error: "Phone number already registered" });
            }
            if (detail.includes("email")) {
                return res.status(400).json({ error: "Email already registered" });
            }
            return res.status(400).json({ error: "User already exists" });
        }

        console.error("Registration error:", err.message);

        res.status(500).json({
            error: "Server error"
        });
    }
};

/**
 * Unified login for all roles
 * Accepts phone + password OR email + password
 * 
 * Supports both:
 * 1. Unified auth users (stored in `users` table with password_hash)
 * 2. Legacy auth users (stored in `farmers` table with password column)
 */
exports.login = async (req, res) => {
    try {
        const body = req.body || {};
        const phone = body.phone || body.phone_number || body.phoneNumber || null;
        const email = body.email || null;
        const password = body.password;

        if (!password) {
            return res.status(400).json({ error: "Password is required" });
        }

        if (!phone && !email) {
            return res.status(400).json({ error: "Phone or email is required" });
        }

        let user;

        if (email) {
            const result = await pool.query(
                `SELECT id, email, phone, password_hash, role FROM users WHERE email = $1`,
                [email]
            );
            user = result.rows[0];
        } else {
            const result = await pool.query(
                `SELECT id, email, phone, password_hash, role FROM users WHERE phone = $1`,
                [phone]
            );
            user = result.rows[0];
        }

        // Fallback: If not found in users table, check legacy farmers table
        if (!user && phone) {
            const farmerResult = await pool.query(
                `SELECT id, full_name, phone, region, district, password, role
                 FROM farmers WHERE phone = $1`,
                [phone]
            );
            if (farmerResult.rows.length > 0) {
                const farmer = farmerResult.rows[0];
                const passwordMatches = await bcrypt.compare(password, farmer.password);
                if (passwordMatches) {
                    // Generate JWT matching the legacy format expected by middleware
                    const token = jwt.sign(
                        {
                            farmer_id: farmer.id,
                            role: farmer.role || "farmer",
                            subject: "farmer"
                        },
                        JWT_SECRET(),
                        { expiresIn: JWT_EXPIRY }
                    );
                    delete farmer.password;
                    return res.json({
                        message: "Login successful",
                        token,
                        farmer
                    });
                }
            }
        }

        if (!user && email) {
            const adminResult = await pool.query(
                `SELECT id, user_id, full_name, email, password_hash
                 FROM admins
                 WHERE email = $1`,
                [email]
            );

            if (adminResult.rows.length > 0) {
                const admin = adminResult.rows[0];
                const adminPasswordMatches = await bcrypt.compare(password, admin.password_hash);

                if (!adminPasswordMatches) {
                    return res.status(401).json({ error: "Invalid credentials" });
                }

                let userId = admin.user_id;

                if (!userId) {
                    const userResult = await pool.query(
                        `INSERT INTO users (username, email, password_hash, role)
                         VALUES ($1, $2, $3, 'admin')
                         ON CONFLICT (email)
                         DO UPDATE SET password_hash = EXCLUDED.password_hash, role = 'admin'
                         RETURNING id, email, phone, role`,
                        [email, email, admin.password_hash]
                    );

                    userId = userResult.rows[0].id;

                    await pool.query(
                        `UPDATE admins
                         SET user_id = $1
                         WHERE id = $2`,
                        [userId, admin.id]
                    );
                }

                const token = jwt.sign(
                    {
                        userId,
                        email: admin.email,
                        phone: null,
                        role: "admin",
                        profileId: admin.id
                    },
                    JWT_SECRET(),
                    { expiresIn: JWT_EXPIRY }
                );

                return res.status(200).json({
                    message: "Login successful",
                    token,
                    user: {
                        id: userId,
                        email: admin.email,
                        phone: null,
                        role: "admin"
                    },
                    profile: {
                        id: admin.id,
                        full_name: admin.full_name,
                        email: admin.email
                    }
                });
            }
        }

        if (!user) {
            return res.status(401).json({ error: "Invalid credentials" });
        }

        const passwordMatches = await bcrypt.compare(password, user.password_hash);

        if (!passwordMatches) {
            return res.status(401).json({ error: "Invalid credentials" });
        }

        // Generate consistent JWT
        // Fetch role-specific profile
        let profile = null;
        let profileId = null;

        if (user.role === "farmer") {
            const profileResult = await pool.query(
                `SELECT id, full_name, phone, region, district, ward, village, farm_size, main_crop
                 FROM farmers WHERE user_id = $1`,
                [user.id]
            );
            if (profileResult.rows.length > 0) {
                profile = profileResult.rows[0];
                profileId = profile.id;
            }
        } else if (user.role === "admin") {
            const profileResult = await pool.query(
                `SELECT id, full_name, email FROM admins WHERE user_id = $1`,
                [user.id]
            );
            if (profileResult.rows.length > 0) {
                profile = profileResult.rows[0];
            }
        } else if (user.role === "transporter") {
            const profileResult = await pool.query(
                `SELECT id, full_name, phone, vehicle_type, plate_number, operating_region, capacity_kg, status
                 FROM transporters WHERE user_id = $1`,
                [user.id]
            );
            if (profileResult.rows.length > 0) {
                profile = profileResult.rows[0];
                profileId = profile.id;
            }
        } else if (user.role === "buyer") {
            const profileResult = await pool.query(
                `SELECT id, full_name, phone, email, region, district
                 FROM buyers WHERE user_id = $1`,
                [user.id]
            );
            if (profileResult.rows.length > 0) {
                profile = profileResult.rows[0];
                profileId = profile.id;
            }
        }

        const token = jwt.sign(
            {
                userId: user.id,
                email: user.email,
                phone: user.phone,
                role: user.role,
                profileId: profileId || user.id
            },
            JWT_SECRET(),
            { expiresIn: JWT_EXPIRY }
        );

        res.status(200).json({
            message: "Login successful",
            token,
            user: {
                id: user.id,
                email: user.email,
                phone: user.phone,
                role: user.role
            },
            profile
        });

    } catch (err) {
        console.error("Login error:", err.message);

        res.status(500).json({
            error: "Server error"
        });
    }
};

/**
 * Register a new buyer
 */
exports.registerBuyer = async (req, res) => {
    try {
        const { full_name, phone, email, region, district, password } = req.body;

        if (!full_name || !phone || !password) {
            return res.status(400).json({
                error: "Required fields: full_name, phone, password"
            });
        }

        if (!isValidPassword(password)) {
            return res.status(400).json({
                error: "Password must be at least 8 characters"
            });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const client = await pool.connect();

        try {
            await client.query("BEGIN");

            const userResult = await client.query(
                `INSERT INTO users (username, email, phone, password_hash, role)
                 VALUES ($1, $2, $3, $4, 'buyer')
                 RETURNING id, email, phone, role`,
                [trimString(phone), trimString(email) || null, trimString(phone), hashedPassword]
            );

            const user = userResult.rows[0];

            const buyerResult = await client.query(
                `INSERT INTO buyers (user_id, full_name, phone, email, region, district)
                 VALUES ($1, $2, $3, $4, $5, $6)
                 RETURNING *`,
                [user.id, trimString(full_name), trimString(phone), trimString(email) || null, trimString(region) || null, trimString(district) || null]
            );

            await client.query("COMMIT");

            const token = jwt.sign(
                {
                    userId: user.id,
                    email: user.email,
                    phone: user.phone,
                    role: "buyer",
                    profileId: buyerResult.rows[0].id
                },
                JWT_SECRET(),
                { expiresIn: JWT_EXPIRY }
            );

            const buyerProfile = buyerResult.rows[0];

            res.status(201).json({
                message: "Buyer registered successfully",
                token,
                buyer: buyerProfile,
                profile: buyerProfile,
                user: { id: user.id, email: user.email, phone: user.phone, role: user.role }
            });

        } catch (err) {
            await client.query("ROLLBACK");
            throw err;
        } finally {
            client.release();
        }

    } catch (err) {
        if (err.code === "23505") {
            return res.status(400).json({ error: "Phone or email already registered" });
        }

        console.error("Buyer registration error:", err.message);
        res.status(500).json({ error: "Server error" });
    }
};

/**
 * Register a new transporter
 */
exports.registerTransporter = async (req, res) => {
    try {
        const { full_name, phone, vehicle_type, plate_number, operating_region, capacity_kg, password } = req.body;

        const missingFields = [];
        if (!full_name) missingFields.push("full_name");
        if (!phone) missingFields.push("phone");
        if (!vehicle_type) missingFields.push("vehicle_type");
        if (!plate_number) missingFields.push("plate_number");
        if (!operating_region) missingFields.push("operating_region");
        if (!password) missingFields.push("password");

        if (missingFields.length > 0) {
            return res.status(400).json({
                error: "Missing required fields",
                missingFields
            });
        }

        if (!isValidPassword(password)) {
            return res.status(400).json({
                error: "Password must be at least 8 characters"
            });
        }

        const parsedCapacity = capacity_kg === undefined || capacity_kg === null || capacity_kg === ""
            ? null
            : toPositiveNumber(capacity_kg);

        if (capacity_kg !== undefined && capacity_kg !== null && capacity_kg !== "" && !parsedCapacity) {
            return res.status(400).json({
                error: "Capacity must be greater than zero"
            });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const client = await pool.connect();

        try {
            await client.query("BEGIN");

            const userResult = await client.query(
                `INSERT INTO users (username, phone, password_hash, role)
                 VALUES ($1, $2, $3, 'transporter')
                 RETURNING id, phone, role`,
                [trimString(phone), trimString(phone), hashedPassword]
            );

            const user = userResult.rows[0];

            const transporterResult = await client.query(
                `INSERT INTO transporters
                 (user_id, full_name, phone, vehicle_type, plate_number, operating_region, capacity_kg, password_hash, role)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'transporter')
                 RETURNING *`,
                [
                    user.id, trimString(full_name), trimString(phone), trimString(vehicle_type),
                    trimString(plate_number), trimString(operating_region), parsedCapacity,
                    hashedPassword
                ]
            );

            await client.query("COMMIT");

            const token = jwt.sign(
                {
                    userId: user.id,
                    phone: user.phone,
                    role: "transporter",
                    profileId: transporterResult.rows[0].id
                },
                JWT_SECRET(),
                { expiresIn: JWT_EXPIRY }
            );

            const transporterProfile = transporterResult.rows[0];
            delete transporterProfile.password_hash;

            res.status(201).json({
                message: "Transporter registered successfully",
                token,
                transporter: transporterProfile,
                profile: transporterProfile,
                user: { id: user.id, phone: user.phone, role: user.role }
            });

        } catch (err) {
            await client.query("ROLLBACK");
            throw err;
        } finally {
            client.release();
        }

    } catch (err) {
        if (err.code === "23505") {
            const detail = err.detail || "";
            if (detail.includes("phone")) {
                return res.status(400).json({ error: "Phone number already registered" });
            }
            if (detail.includes("plate")) {
                return res.status(400).json({ error: "Plate number already registered" });
            }
            return res.status(400).json({ error: "Transporter already exists" });
        }

        console.error("Transporter registration error:", err.message);
        res.status(500).json({ error: "Server error" });
    }
};
