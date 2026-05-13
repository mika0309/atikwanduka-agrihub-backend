const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const pool = require("../db");

const emptyToNull = (value) => {
    if (value === "" || value === undefined) {
        return null;
    }

    return typeof value === "string" ? value.trim() : value;
};

const firstValue = (...values) => {
    for (const value of values) {
        const normalizedValue = emptyToNull(value);

        if (normalizedValue !== null) {
            return normalizedValue;
        }
    }

    return null;
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
        const password = firstValue(body.password);

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

        const hashedPassword = await bcrypt.hash(password, 10);

        const newFarmer = await pool.query(
            `INSERT INTO farmers 
            (full_name, phone, national_id, region, district, ward, village, farm_size, main_crop, password)
            
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
            
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
                hashedPassword
            ]
        );

        res.status(201).json({
            message: "Farmer registered successfully",
            farmer: newFarmer.rows[0]
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
            error: "Server error",
            details: err.message
        });
    }
};

exports.loginFarmer = async (req, res) => {
    try {
        const body = req.body || {};

        const phone = firstValue(body.phone, body.phone_number, body.phoneNumber);
        const password = firstValue(body.password);

        const missingFields = [];
        if (!phone) missingFields.push("phone");
        if (!password) missingFields.push("password");

        if (missingFields.length > 0) {
            return res.status(400).json({
                error: "Required fields are missing",
                missingFields,
                receivedFields: Object.keys(body)
            });
        }

        const farmerResult = await pool.query(
            `SELECT id, full_name, phone, region, district, role, password
             FROM farmers
             WHERE phone = $1`,
            [phone]
        );

        if (farmerResult.rows.length === 0) {
            return res.status(401).json({
                error: "Invalid phone or password"
            });
        }

        const farmer = farmerResult.rows[0];
        const passwordMatches = await bcrypt.compare(password, farmer.password);

        if (!passwordMatches) {
            return res.status(401).json({
                error: "Invalid phone or password"
            });
        }

        const token = jwt.sign(
            {
                farmer_id: farmer.id,
                phone: farmer.phone,
                role: farmer.role
            },
            process.env.JWT_SECRET || "development_secret",
            { expiresIn: "1d" }
        );

        delete farmer.password;

        res.status(200).json({
            message: "Farmer logged in successfully",
            token,
            farmer
        });
    } catch (err) {
        console.error(err.message);

        res.status(500).json({
            error: "Server error",
            details: err.message
        });
    }
};

exports.getMyProfile = async (req, res) => {
    try {
        const farmerId = req.farmer && req.farmer.farmer_id;

        if (!farmerId) {
            return res.status(401).json({
                error: "Invalid token payload"
            });
        }

        const farmerResult = await pool.query(
            `SELECT id, full_name, phone, national_id, region, district, ward, village,
                    farm_size, main_crop, created_at
             FROM farmers
             WHERE id = $1`,
            [farmerId]
        );

        if (farmerResult.rows.length === 0) {
            return res.status(404).json({
                error: "Farmer not found"
            });
        }

        res.status(200).json({
            farmer: farmerResult.rows[0]
        });
    } catch (err) {
        console.error(err.message);

        res.status(500).json({
            error: "Server error",
            details: err.message
        });
    }
};
