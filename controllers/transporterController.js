const pool = require("../db");
const { toPositiveNumber, trimString } = require("../utils/validation");

async function getTransporterProfileId(user) {
    if (!user || user.role !== "transporter") {
        return null;
    }

    if (user.profileId) {
        return user.profileId;
    }

    if (!user.userId) {
        return null;
    }

    const transporterResult = await pool.query(
        `SELECT id FROM transporters WHERE user_id = $1`,
        [user.userId]
    );

    return transporterResult.rows[0]?.id || null;
}

const deliverySelect = `
    SELECT
        d.*,
        mo.id AS order_id,
        mo.buyer_name,
        mo.buyer_phone,
        mo.quantity_requested,
        mo.total_price,
        mo.status AS order_status,
        pl.crop_name,
        pl.unit,
        pl.location,
        pl.price_per_unit,
        f.full_name AS farmer_name,
        f.phone AS farmer_phone
    FROM deliveries d
    JOIN market_orders mo ON d.order_id = mo.id
    JOIN produce_listings pl ON mo.listing_id = pl.id
    LEFT JOIN farmers f ON pl.farmer_id = f.id
`;

exports.getMyDeliveries = async (req, res) => {
    try {
        const transporterProfileId = await getTransporterProfileId(req.user);

        if (!transporterProfileId) {
            return res.status(404).json({
                error: "Transporter profile not found"
            });
        }

        const result = await pool.query(
            `${deliverySelect}
             WHERE d.transporter_id = $1
             ORDER BY d.assigned_at DESC`,
            [transporterProfileId]
        );

        res.json({ deliveries: result.rows });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: "Server error" });
    }
};

exports.getMyDeliveryById = async (req, res) => {
    try {
        const transporterProfileId = await getTransporterProfileId(req.user);

        if (!transporterProfileId) {
            return res.status(404).json({
                error: "Transporter profile not found"
            });
        }

        const result = await pool.query(
            `${deliverySelect}
             WHERE d.id = $1
             AND d.transporter_id = $2`,
            [req.params.deliveryId, transporterProfileId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                error: "Delivery not found"
            });
        }

        res.json({ delivery: result.rows[0] });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: "Server error" });
    }
};

exports.registerTransporter = async (req, res) => {
    try {
        const {
            full_name,
            phone,
            vehicle_type,
            plate_number,
            operating_region,
            capacity_kg
        } = req.body;

        const capacity = capacity_kg === undefined || capacity_kg === null || capacity_kg === ""
            ? null
            : toPositiveNumber(capacity_kg);

        if (!trimString(full_name) || !trimString(phone) || !trimString(vehicle_type) || !trimString(plate_number) || !trimString(operating_region)) {
            return res.status(400).json({
                error: "Missing required fields"
            });
        }

        if (capacity_kg !== undefined && capacity_kg !== null && capacity_kg !== "" && !capacity) {
            return res.status(400).json({
                error: "Capacity must be greater than zero"
            });
        }

        const result = await pool.query(
            `INSERT INTO transporters
             (full_name, phone, vehicle_type, plate_number, operating_region, capacity_kg)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING *`,
            [
                trimString(full_name),
                trimString(phone),
                trimString(vehicle_type),
                trimString(plate_number),
                trimString(operating_region),
                capacity
            ]
        );

        res.status(201).json({
            message: "Transporter registered successfully",
            transporter: result.rows[0]
        });
    } catch (err) {
        if (err.code === "23505") {
            return res.status(400).json({
                error: "Transporter already exists"
            });
        }

        console.error(err.message);

        res.status(500).json({
            error: "Server error"
        });
    }
};

exports.assignTransporter = async (req, res) => {
    const client = await pool.connect();

    try {
        const { order_id, transporter_id } = req.body;

        const orderId = toPositiveNumber(order_id);
        const transporterId = toPositiveNumber(transporter_id);

        if (!orderId || !transporterId) {
            return res.status(400).json({
                error: "order_id and transporter_id are required"
            });
        }

        await client.query("BEGIN");

        const orderCheck = await client.query(
            `SELECT mo.*, pl.crop_name
             FROM market_orders mo
             JOIN produce_listings pl
               ON mo.listing_id = pl.id
            WHERE mo.id = $1
             AND mo.status = 'confirmed'
             FOR UPDATE`,
            [orderId]
        );

        if (orderCheck.rows.length === 0) {
            await client.query("ROLLBACK");

            return res.status(404).json({
                error: "Confirmed order not found"
            });
        }

        const existingDelivery = await client.query(
            `SELECT id
            FROM deliveries
             WHERE order_id = $1`,
            [orderId]
        );

        if (existingDelivery.rows.length > 0) {
            await client.query("ROLLBACK");

            return res.status(400).json({
                error: "Order already has an assigned transporter"
            });
        }

        const order = orderCheck.rows[0];

        const transporterCheck = await client.query(
            `SELECT *
             FROM transporters
             WHERE id = $1
             AND status = 'available'
             FOR UPDATE`,
            [transporterId]
        );

        if (transporterCheck.rows.length === 0) {
            await client.query("ROLLBACK");

            return res.status(404).json({
                error: "Available transporter not found"
            });
        }

        const transporter = transporterCheck.rows[0];

        if (
            transporter.capacity_kg !== null &&
            Number(order.quantity_requested) > Number(transporter.capacity_kg)
        ) {
            await client.query("ROLLBACK");

            return res.status(400).json({
                error: "Transporter capacity insufficient"
            });
        }

        const deliveryResult = await client.query(
            `INSERT INTO deliveries
             (order_id, transporter_id)
             VALUES ($1, $2)
             RETURNING *`,
            [orderId, transporterId]
        );

        await client.query(
            `UPDATE transporters
             SET status = 'busy'
             WHERE id = $1`,
            [transporterId]
        );

        if (order.buyer_user_id) {
            await client.query(
                `INSERT INTO notifications
                 (user_id, recipient_role, message)
                 VALUES ($1, $2, $3)`,
                [
                    order.buyer_user_id,
                    "buyer",
                    `A transporter has been assigned to your ${order.crop_name} order.`
                ]
            );
        }

        if (transporter.user_id) {
            await client.query(
                `INSERT INTO notifications
                 (user_id, recipient_role, message)
                 VALUES ($1, $2, $3)`,
                [
                    transporter.user_id,
                    "transporter",
                    `You have been assigned to deliver ${order.crop_name} for order #${order.id}.`
                ]
            );
        }

        await client.query("COMMIT");

        res.status(201).json({
            message: "Transporter assigned successfully",
            delivery: deliveryResult.rows[0]
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

exports.updateDeliveryStatus = async (req, res) => {
    const client = await pool.connect();

    try {
        const { deliveryId } = req.params;
        const { delivery_status } = req.body;

        const allowedStatuses = ["accepted", "picked_up", "in_transit", "delivered"];

        if (!allowedStatuses.includes(delivery_status)) {
            return res.status(400).json({
                error: "Status must be accepted, picked_up, in_transit, or delivered"
            });
        }

        await client.query("BEGIN");

        const deliveryCheck = await client.query(
            `SELECT *
             FROM deliveries
             WHERE id = $1
             FOR UPDATE`,
            [deliveryId]
        );

        if (deliveryCheck.rows.length === 0) {
            await client.query("ROLLBACK");

            return res.status(404).json({
                error: "Delivery not found"
            });
        }

        const delivery = deliveryCheck.rows[0];

        if (req.user?.role === "transporter") {
            const transporterProfileId = await getTransporterProfileId(req.user);

            if (!transporterProfileId || Number(delivery.transporter_id) !== Number(transporterProfileId)) {
                await client.query("ROLLBACK");

                return res.status(403).json({
                    error: "Access denied. Delivery is not assigned to this transporter."
                });
            }
        }

        if (delivery.delivery_status === "delivered") {
            await client.query("ROLLBACK");

            return res.status(400).json({
                error: "Delivery already completed"
            });
        }

        const allowedTransitions = {
            assigned: ["accepted"],
            accepted: ["picked_up"],
            picked_up: ["in_transit"],
            in_transit: ["delivered"]
        };

        if (!allowedTransitions[delivery.delivery_status]?.includes(delivery_status)) {
            await client.query("ROLLBACK");

            return res.status(400).json({
                error: `Cannot move delivery from ${delivery.delivery_status} to ${delivery_status}`
            });
        }

        let updatedDelivery;

        if (delivery_status === "delivered") {
            updatedDelivery = await client.query(
                `UPDATE deliveries
                 SET delivery_status = 'delivered',
                     delivered_at = CURRENT_TIMESTAMP
                 WHERE id = $1
                 RETURNING *`,
                [deliveryId]
            );

            await client.query(
                `UPDATE transporters
                 SET status = 'available'
                 WHERE id = $1`,
                [delivery.transporter_id]
            );

            const farmerResult = await client.query(
                `SELECT pl.farmer_id, pl.crop_name, mo.buyer_user_id
                 FROM deliveries d
                 JOIN market_orders mo
                   ON d.order_id = mo.id
                 JOIN produce_listings pl
                   ON mo.listing_id = pl.id
                 WHERE d.id = $1`,
                [deliveryId]
            );

            if (farmerResult.rows.length > 0) {
                const farmerDelivery = farmerResult.rows[0];

                await client.query(
                    `INSERT INTO notifications
                     (farmer_id, recipient_role, message)
                     VALUES ($1, $2, $3)`,
                    [
                        farmerDelivery.farmer_id,
                        "farmer",
                        `Delivery for your ${farmerDelivery.crop_name} order has been completed.`
                    ]
                );

                if (farmerDelivery.buyer_user_id) {
                    await client.query(
                        `INSERT INTO notifications
                         (user_id, recipient_role, message)
                         VALUES ($1, $2, $3)`,
                        [
                            farmerDelivery.buyer_user_id,
                            "buyer",
                            `Your ${farmerDelivery.crop_name} order has been delivered.`
                        ]
                    );
                }
            }
        } else {
            const buyerResult = await client.query(
                `SELECT pl.crop_name, mo.buyer_user_id
                 FROM deliveries d
                 JOIN market_orders mo
                   ON d.order_id = mo.id
                 JOIN produce_listings pl
                   ON mo.listing_id = pl.id
                 WHERE d.id = $1`,
                [deliveryId]
            );

            if (buyerResult.rows[0]?.buyer_user_id) {
                const statusText = delivery_status.replace("_", " ");

                await client.query(
                    `INSERT INTO notifications
                     (user_id, recipient_role, message)
                     VALUES ($1, $2, $3)`,
                    [
                        buyerResult.rows[0].buyer_user_id,
                        "buyer",
                        `Your ${buyerResult.rows[0].crop_name} order is ${statusText}.`
                    ]
                );
            }
        }

        if (delivery_status !== "delivered") {
            const timestampColumn = {
                accepted: "accepted_at",
                picked_up: "picked_up_at",
                in_transit: "in_transit_at"
            }[delivery_status];

            updatedDelivery = await client.query(
                `UPDATE deliveries
                 SET delivery_status = $1,
                     ${timestampColumn} = COALESCE(${timestampColumn}, CURRENT_TIMESTAMP)
                 WHERE id = $2
                 RETURNING *`,
                [delivery_status, deliveryId]
            );
        }

        await client.query("COMMIT");

        res.json({
            message: `Delivery marked as ${delivery_status}`,
            delivery: updatedDelivery.rows[0]
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
