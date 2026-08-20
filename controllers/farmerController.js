const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const pool = require("../db");
const config = require("../config/env");

const emptyToNull = (value) => {
    if (value === "" || value === undefined) {
        return null;
    }

    return typeof value === "string" ? value.trim() : value;
};

const firstValue = (...values) => {
    return values.find((value) => emptyToNull(value) !== null) || null;
};

exports.registerFarmer = async (req, res) => {
    try {
        const body = req.body || {};

        const fullName = firstValue(body.full_name, body.fullName, body.name);
        const phone = firstValue(body.phone, body.phone_number, body.phoneNumber);
        const nationalId = firstValue(body.national_id, body.nationalId);
        const region = firstValue(body.region);
        const district = firstValue(body.district);
        const farmSize = firstValue(body.farm_size, body.farmSize);
        const mainCrop = firstValue(body.main_crop, body.mainCrop);
        const password = firstValue(body.password, body.password_hash);

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

        if (typeof password !== "string" || password.length < 8) {
            return res.status(400).json({
                error: "Password must be at least 8 characters"
            });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const newFarmer = await pool.query(
            `INSERT INTO farmers
            (full_name, phone, national_id, region, district, ward, village, farm_size, main_crop, password, role)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
            RETURNING *`,
            [
                fullName,
                phone,
                emptyToNull(nationalId),
                region,
                district,
                emptyToNull(body.ward),
                emptyToNull(body.village),
                emptyToNull(farmSize),
                emptyToNull(mainCrop),
                hashedPassword,
                "farmer"
            ]
        );

        const farmer = newFarmer.rows[0];
        delete farmer.password;

        res.status(201).json({
            message: "Farmer registered successfully",
            farmer
        });

    } catch (err) {

        // Duplicate phone or national_id
        if (err.code === "23505") {
            return res.status(400).json({
                error: "Farmer already exists"
            });
        }

        console.error(err.message);

        res.status(500).json({
            error: "Server error"
        });
    }
};
exports.loginFarmer = async (req, res) => {

    try {

        const { phone, password } = req.body;

        // Check farmer exists
        const farmer = await pool.query(
            "SELECT * FROM farmers WHERE phone = $1",
            [phone]
        );

        if (farmer.rows.length === 0) {
            return res.status(401).json({
                error: "Invalid credentials"
            });
        }

        const validPassword = await bcrypt.compare(
            password,
            farmer.rows[0].password
        );

        if (!validPassword) {
            return res.status(401).json({
                error: "Invalid credentials"
            });
        }

        const userRecord = farmer.rows[0];
        const token = jwt.sign(
            {
                farmer_id: userRecord.id,
                role: userRecord.role || "farmer",
                subject: "farmer"
            },
            config.getJwtSecret(),
            {
                expiresIn: "1d"
            }
        );

        res.json({
            message: "Login successful",
            token,
            farmer: {
                id: userRecord.id,
                full_name: userRecord.full_name,
                phone: userRecord.phone,
                region: userRecord.region,
                district: userRecord.district,
                role: userRecord.role || "farmer"
            }
        });

    } catch (err) {

        console.error(err.message);

        res.status(500).json({
            error: "Server error"
        });
    }
};
exports.getMyProfile = async (req, res) => {
    try {
        // Use farmer profile ID first (for unified auth: profileId = farmers.id)
        // Fall back to req.user.userId (which may be users.id — handle carefully)
        const farmerId = (req.farmer && req.farmer.farmer_id) || (req.user && req.user.userId);

        if (!farmerId) {
            return res.status(401).json({ error: "Unauthorized" });
        }

        const result = await pool.query(
            `SELECT id, full_name, phone, national_id, region, district, ward, village, farm_size, main_crop, role
             FROM farmers WHERE id = $1`,
            [farmerId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Farmer not found" });
        }

        res.json({ farmer: result.rows[0] });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: "Server error" });
    }
};
