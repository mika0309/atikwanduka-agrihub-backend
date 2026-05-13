const pool = require("../db");

exports.assignVoucher = async (req, res) => {
    try {
        const {
            farmer_id,
            subsidy_type,
            amount
        } = req.body;

        if (!farmer_id || !subsidy_type || !amount) {
            return res.status(400).json({
                error: "Missing required fields"
            });
        }

        const voucherCode =
            "AGRI-" +
            Math.random()
                .toString(36)
                .substring(2, 10)
                .toUpperCase();

        const result = await pool.query(
            `INSERT INTO subsidy_vouchers
             (farmer_id, voucher_code, subsidy_type, amount, status)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING *`,
            [
                farmer_id,
                voucherCode,
                subsidy_type,
                amount,
                "issued"
            ]
        );

        res.status(201).json({
            message: "Voucher assigned successfully",
            voucher: result.rows[0]
        });
    } catch (err) {
        console.error(err.message);

        res.status(500).json({
            error: "Server error"
        });
    }
};

exports.getMyVouchers = async (req, res) => {
    try {
        const farmerId = req.farmer.farmer_id;

        const result = await pool.query(
            `SELECT *
             FROM subsidy_vouchers
             WHERE farmer_id = $1
             ORDER BY issued_at DESC`,
            [farmerId]
        );

        res.json({
            count: result.rows.length,
            vouchers: result.rows
        });
    } catch (err) {
        console.error(err.message);

        res.status(500).json({
            error: "Server error"
        });
    }
};
