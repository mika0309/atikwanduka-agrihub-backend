const pool = require("../db");
const { toPositiveNumber, trimString } = require("../utils/validation");

exports.addProductionRecord = async (req, res) => {
    try {
        const farmerId = req.farmer.farmer_id;

        const {
            crop_name,
            season,
            quantity_harvested,
            estimated_value
        } = req.body;

        const quantityHarvested = toPositiveNumber(quantity_harvested);
        const estimatedValue = estimated_value === undefined || estimated_value === null || estimated_value === ""
            ? null
            : toPositiveNumber(estimated_value);

        if (!trimString(crop_name) || !quantityHarvested) {
            return res.status(400).json({
                error: "Crop name and a positive quantity are required"
            });
        }

        if (estimated_value !== undefined && estimated_value !== null && estimated_value !== "" && !estimatedValue) {
            return res.status(400).json({
                error: "Estimated value must be greater than zero"
            });
        }

        const newRecord = await pool.query(
            `INSERT INTO production_records
             (farmer_id, crop_name, season, quantity_harvested, estimated_value)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING *`,
            [
                farmerId,
                trimString(crop_name),
                trimString(season),
                quantityHarvested,
                estimatedValue
            ]
        );

        res.status(201).json({
            message: "Production record added successfully",
            record: newRecord.rows[0]
        });
    } catch (err) {
        console.error(err.message);

        res.status(500).json({
            error: "Server error"
        });
    }
};

exports.getMyProductionRecords = async (req, res) => {
    try {
        const farmerId = req.farmer.farmer_id;

        const records = await pool.query(
            `SELECT *
             FROM production_records
             WHERE farmer_id = $1
             ORDER BY recorded_at DESC`,
            [farmerId]
        );

        res.json({
            count: records.rows.length,
            records: records.rows
        });
    } catch (err) {
        console.error(err.message);

        res.status(500).json({
            error: "Server error"
        });
    }
};
