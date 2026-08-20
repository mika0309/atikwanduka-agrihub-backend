const pool = require("../db");
const { toPositiveNumber, trimString } = require("../utils/validation");

exports.assignVoucher = async (req, res) => {
    const client = await pool.connect();

    try {
        const {
            farmer_id,
            subsidy_type,
            amount
        } = req.body;

        const voucherAmount = toPositiveNumber(amount);

        if (!farmer_id || !trimString(subsidy_type) || !voucherAmount) {
            return res.status(400).json({
                error: "Farmer, subsidy type, and positive amount are required"
            });
        }

        await client.query("BEGIN");

        const voucherCode =
            "AGRI-" +
            Math.random()
                .toString(36)
                .substring(2, 10)
                .toUpperCase();

        const result = await client.query(
            `INSERT INTO subsidy_vouchers
             (farmer_id, voucher_code, subsidy_type, amount, status)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING *`,
            [
                farmer_id,
                voucherCode,
                trimString(subsidy_type),
                voucherAmount,
                "issued"
            ]
        );

        await client.query(
            `INSERT INTO notifications
             (farmer_id, message)
             VALUES ($1, $2)`,
            [
                farmer_id,
                `Your subsidy voucher ${voucherCode} has been assigned.`
            ]
        );

        await client.query("COMMIT");

        res.status(201).json({
            message: "Voucher assigned successfully",
            voucher: result.rows[0]
        });
    } catch (err) {
        await client.query("ROLLBACK").catch(() => {});
        console.error(err.message);

        res.status(500).json({
            error: "Server error"
        });
    } finally {
        client.release();
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

exports.redeemVoucher = async (req, res) => {
    try {
        const farmerId = req.farmer.farmer_id;
        const { voucher_code } = req.body;

        if (!voucher_code) {
            return res.status(400).json({
                error: "Voucher code is required"
            });
        }

        const voucherCheck = await pool.query(
            `SELECT *
             FROM subsidy_vouchers
             WHERE farmer_id = $1
             AND voucher_code = $2`,
            [farmerId, voucher_code]
        );

        if (voucherCheck.rows.length === 0) {
            return res.status(404).json({
                error: "Voucher not found or does not belong to you"
            });
        }

        const voucher = voucherCheck.rows[0];

        if (voucher.status === "redeemed") {
            return res.status(400).json({
                error: "This voucher has already been redeemed"
            });
        }

        const updatedVoucher = await pool.query(
            `UPDATE subsidy_vouchers
             SET status = 'redeemed',
                 redeemed_at = CURRENT_TIMESTAMP
             WHERE id = $1
             RETURNING *`,
            [voucher.id]
        );

        res.json({
            message: "Voucher redeemed successfully",
            voucher: updatedVoucher.rows[0]
        });
    } catch (err) {
        console.error(err.message);

        res.status(500).json({
            error: "Server error"
        });
    }
};
