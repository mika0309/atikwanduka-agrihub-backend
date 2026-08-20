const pool = require("../db");

exports.getMyNotifications = async (req, res) => {
    try {
        const role = req.user?.role || req.farmer?.role;
        const userId = req.user?.userId || null;
        const farmerId = req.farmer?.farmer_id || null;

        const values = [];
        const conditions = [];

        if (role === "farmer" && farmerId) {
            values.push(farmerId);
            conditions.push(`farmer_id = $${values.length}`);
        }

        if (userId) {
            values.push(userId);
            conditions.push(`user_id = $${values.length}`);
        }

        if (conditions.length === 0) {
            return res.status(404).json({
                error: "Notification profile not found"
            });
        }

        const result = await pool.query(
            `SELECT *
             FROM notifications
             WHERE ${conditions.join(" OR ")}
             ORDER BY created_at DESC`,
            values
        );

        res.json({
            count: result.rows.length,
            notifications: result.rows
        });
    } catch (err) {
        console.error(err.message);

        res.status(500).json({
            error: "Server error"
        });
    }
};

exports.markNotificationAsRead = async (req, res) => {
    try {
        const role = req.user?.role || req.farmer?.role;
        const userId = req.user?.userId || null;
        const farmerId = req.farmer?.farmer_id || null;
        const { id } = req.params;
        const values = [id];
        const conditions = [];

        if (role === "farmer" && farmerId) {
            values.push(farmerId);
            conditions.push(`farmer_id = $${values.length}`);
        }

        if (userId) {
            values.push(userId);
            conditions.push(`user_id = $${values.length}`);
        }

        if (conditions.length === 0) {
            return res.status(404).json({
                error: "Notification profile not found"
            });
        }

        const result = await pool.query(
            `UPDATE notifications
             SET is_read = TRUE
             WHERE id = $1
             AND (${conditions.join(" OR ")})
             RETURNING *`,
            values
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                error: "Notification not found"
            });
        }

        res.json({
            message: "Notification marked as read",
            notification: result.rows[0]
        });
    } catch (err) {
        console.error(err.message);

        res.status(500).json({
            error: "Server error"
        });
    }
};
