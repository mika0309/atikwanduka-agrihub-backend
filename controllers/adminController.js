const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const pool = require("../db");
const config = require("../config/env");

exports.login = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                error: "Email and password are required"
            });
        }

        const result = await pool.query(
            `SELECT *
             FROM admins
             WHERE email = $1`,
            [email]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({
                error: "Invalid credentials"
            });
        }

        const admin = result.rows[0];
        const valid = await bcrypt.compare(password, admin.password_hash);

        if (!valid) {
            return res.status(401).json({
                error: "Invalid credentials"
            });
        }

        const token = jwt.sign(
            {
                userId: admin.user_id || admin.id,
                email: admin.email,
                role: "admin"
            },
            config.getJwtSecret(),
            { expiresIn: "1d" }
        );

        res.json({
            token,
            admin: {
                id: admin.id,
                full_name: admin.full_name,
                email: admin.email,
                role: "admin"
            }
        });
    } catch (err) {
        console.error(err.message);

        res.status(500).json({
            error: "Server error"
        });
    }
};

exports.getFarmers = async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT id, full_name, phone, region, district, farm_size, main_crop, role, created_at
             FROM farmers
             ORDER BY created_at DESC`
        );

        res.json({ farmers: result.rows });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: "Server error" });
    }
};

exports.getBuyers = async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT id, full_name, phone, email, region, district, created_at
             FROM buyers
             ORDER BY created_at DESC`
        );

        res.json({ buyers: result.rows });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: "Server error" });
    }
};

exports.getTransporters = async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT id, full_name, phone, vehicle_type, plate_number, operating_region, capacity_kg, status, created_at
             FROM transporters
             ORDER BY created_at DESC`
        );

        res.json({ transporters: result.rows });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: "Server error" });
    }
};

exports.getMarketplaceListings = async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT
                pl.*,
                f.full_name AS farmer_name,
                f.phone AS farmer_phone,
                COUNT(mo.id) AS order_count
             FROM produce_listings pl
             LEFT JOIN farmers f
               ON pl.farmer_id = f.id
             LEFT JOIN market_orders mo
               ON mo.listing_id = pl.id
             GROUP BY pl.id, f.full_name, f.phone
             ORDER BY pl.created_at DESC`
        );

        res.json({ listings: result.rows });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: "Server error" });
    }
};

exports.getConfirmedOrders = async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT
                mo.id,
                mo.buyer_name,
                mo.buyer_phone,
                mo.quantity_requested,
                mo.total_price,
                mo.status,
                mo.created_at,
                pl.crop_name,
                pl.unit,
                pl.location,
                f.full_name AS farmer_name,
                d.id AS delivery_id,
                d.transporter_id,
                d.delivery_status,
                t.full_name AS transporter_name
             FROM market_orders mo
             JOIN produce_listings pl
               ON mo.listing_id = pl.id
             LEFT JOIN farmers f
               ON pl.farmer_id = f.id
             LEFT JOIN deliveries d
               ON d.order_id = mo.id
             LEFT JOIN transporters t
               ON d.transporter_id = t.id
             WHERE mo.status = 'confirmed'
             ORDER BY mo.created_at DESC`
        );

        res.json({ orders: result.rows });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: "Server error" });
    }
};

exports.getDeliveries = async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT
                d.*,
                mo.buyer_name,
                mo.buyer_phone,
                mo.quantity_requested,
                mo.total_price,
                mo.status AS order_status,
                pl.crop_name,
                pl.unit,
                pl.location,
                f.full_name AS farmer_name,
                t.full_name AS transporter_name,
                t.phone AS transporter_phone,
                t.plate_number
             FROM deliveries d
             JOIN market_orders mo
               ON d.order_id = mo.id
             JOIN produce_listings pl
               ON mo.listing_id = pl.id
             LEFT JOIN farmers f
               ON pl.farmer_id = f.id
             LEFT JOIN transporters t
               ON d.transporter_id = t.id
             ORDER BY d.assigned_at DESC`
        );

        res.json({ deliveries: result.rows });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: "Server error" });
    }
};

exports.getVouchers = async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT sv.*, f.full_name as farmer_name, f.phone as farmer_phone
             FROM subsidy_vouchers sv
             JOIN farmers f ON sv.farmer_id = f.id
             ORDER BY sv.issued_at DESC`
        );

        res.json({ vouchers: result.rows });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: "Server error" });
    }
};

exports.getNotifications = async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT
                n.*,
                f.full_name AS farmer_name,
                u.email AS user_email,
                u.phone AS user_phone,
                u.role AS user_role
             FROM notifications n
             LEFT JOIN farmers f
               ON n.farmer_id = f.id
             LEFT JOIN users u
               ON n.user_id = u.id
             ORDER BY n.created_at DESC
             LIMIT 100`
        );

        res.json({ notifications: result.rows });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: "Server error" });
    }
};

exports.getReports = async (req, res) => {
    try {
        const [
            users,
            marketplace,
            deliveries,
            vouchers,
            production,
            recentOrders
        ] = await Promise.all([
            pool.query(
                `SELECT
                    (SELECT COUNT(*) FROM farmers) AS farmers,
                    (SELECT COUNT(*) FROM buyers) AS buyers,
                    (SELECT COUNT(*) FROM transporters) AS transporters,
                    (SELECT COUNT(*) FROM admins) AS admins`
            ),
            pool.query(
                `SELECT
                    COUNT(DISTINCT pl.id) AS listings,
                    COUNT(DISTINCT mo.id) AS orders,
                    COALESCE(SUM(mo.total_price), 0) AS order_value,
                    COALESCE(SUM(CASE WHEN mo.status = 'confirmed' THEN mo.total_price ELSE 0 END), 0) AS confirmed_value,
                    COALESCE(SUM(CASE WHEN mo.status = 'pending' THEN mo.total_price ELSE 0 END), 0) AS pending_value
                 FROM produce_listings pl
                 LEFT JOIN market_orders mo
                   ON mo.listing_id = pl.id`
            ),
            pool.query(
                `SELECT
                    COUNT(*) AS total,
                    COUNT(*) FILTER (WHERE delivery_status = 'delivered') AS delivered,
                    COUNT(*) FILTER (WHERE delivery_status <> 'delivered') AS active
                 FROM deliveries`
            ),
            pool.query(
                `SELECT
                    COUNT(*) AS total,
                    COUNT(*) FILTER (WHERE status = 'issued') AS issued,
                    COUNT(*) FILTER (WHERE status = 'redeemed') AS redeemed,
                    COALESCE(SUM(amount), 0) AS total_amount
                 FROM subsidy_vouchers`
            ),
            pool.query(
                `SELECT
                    COUNT(*) AS records,
                    COALESCE(SUM(quantity_harvested), 0) AS quantity_harvested,
                    COALESCE(SUM(estimated_value), 0) AS estimated_value
                 FROM production_records`
            ),
            pool.query(
                `SELECT
                    mo.id,
                    mo.status,
                    mo.total_price,
                    mo.created_at,
                    pl.crop_name,
                    mo.buyer_name
                 FROM market_orders mo
                 JOIN produce_listings pl
                   ON mo.listing_id = pl.id
                 ORDER BY mo.created_at DESC
                 LIMIT 10`
            )
        ]);

        res.json({
            users: users.rows[0],
            marketplace: marketplace.rows[0],
            deliveries: deliveries.rows[0],
            vouchers: vouchers.rows[0],
            production: production.rows[0],
            recent_orders: recentOrders.rows
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: "Server error" });
    }
};
