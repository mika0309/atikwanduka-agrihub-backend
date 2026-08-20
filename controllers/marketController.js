const pool = require("../db");
const { isAllowedValue, toPositiveNumber, trimString } = require("../utils/validation");

const PAYMENT_METHODS = ["MOBILE_MONEY", "CASH_ON_DELIVERY", "BANK_TRANSFER"];
const DEFAULT_PAYMENT_METHOD = "MOBILE_MONEY";
const DEFAULT_PAYMENT_STATUS = "PENDING";

function normalizePaymentMethod(value) {
    if (!value) {
        return DEFAULT_PAYMENT_METHOD;
    }

    return trimString(value).toUpperCase();
}

async function getBuyerProfile(client, user) {
    if (!user || user.role !== "buyer") {
        return null;
    }

    const values = [];
    const conditions = [];

    if (user.profileId) {
        values.push(user.profileId);
        conditions.push(`id = $${values.length}`);
    }

    if (user.userId) {
        values.push(user.userId);
        conditions.push(`user_id = $${values.length}`);
    }

    if (conditions.length === 0) {
        return null;
    }

    const result = await client.query(
        `SELECT id, user_id, full_name, phone, email, region, district
         FROM buyers
         WHERE ${conditions.join(" OR ")}
         LIMIT 1`,
        values
    );

    return result.rows[0] || null;
}

async function createNotification(client, {
    farmerId = null,
    userId = null,
    orderId = null,
    eventType = null,
    recipientRole = null,
    message
}) {
    await client.query(
        `INSERT INTO notifications
         (farmer_id, user_id, order_id, event_type, recipient_role, message)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT DO NOTHING`,
        [farmerId, userId, orderId, eventType, recipientRole, message]
    );
}

exports.createListing = async (req, res) => {
    try {
        const farmerId = req.farmer.farmer_id;
        const {
            crop_name,
            quantity_available,
            price_per_unit,
            unit,
            location
        } = req.body;
        const quantityAvailable = toPositiveNumber(quantity_available);
        const pricePerUnit = toPositiveNumber(price_per_unit);

        if (!trimString(crop_name) || !quantityAvailable || !pricePerUnit || !trimString(unit)) {
            return res.status(400).json({
                error: "Crop name, positive quantity, positive price, and unit are required"
            });
        }

        const result = await pool.query(
            `INSERT INTO produce_listings
             (farmer_id, crop_name, quantity_available,
              price_per_unit, unit, location)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING *`,
            [
                farmerId,
                trimString(crop_name),
                quantityAvailable,
                pricePerUnit,
                trimString(unit),
                trimString(location)
            ]
        );

        res.status(201).json({
            message: "Produce listing created successfully",
            listing: result.rows[0]
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({
            error: "Server error"
        });
    }
};

exports.getListings = async (req, res) => {
    try {
        const cropName = typeof req.query.crop_name === "string"
            ? req.query.crop_name.trim()
            : "";
        const location = typeof req.query.location === "string"
            ? req.query.location.trim()
            : "";
        const minPrice = Number(req.query.min_price);
        const maxPrice = Number(req.query.max_price);

        const conditions = ["status = 'available'"];
        const values = [];

        if (cropName) {
            values.push(`%${cropName}%`);
            conditions.push(`crop_name ILIKE $${values.length}`);
        }

        if (location) {
            values.push(`%${location}%`);
            conditions.push(`location ILIKE $${values.length}`);
        }

        if (Number.isFinite(minPrice) && minPrice >= 0) {
            values.push(minPrice);
            conditions.push(`price_per_unit >= $${values.length}`);
        }

        if (Number.isFinite(maxPrice) && maxPrice >= 0) {
            values.push(maxPrice);
            conditions.push(`price_per_unit <= $${values.length}`);
        }

        const result = await pool.query(
            `SELECT *
             FROM produce_listings
             WHERE ${conditions.join(" AND ")}
             ORDER BY created_at DESC`,
            values
        );

        res.json({
            count: result.rows.length,
            listings: result.rows
        });

    } catch (err) {
        console.error(err.message);

        res.status(500).json({
            error: "Server error"
        });
    }
};

exports.getListingById = async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT
                pl.*,
                f.full_name AS farmer_name,
                f.phone AS farmer_phone,
                f.region AS farmer_region,
                f.district AS farmer_district
             FROM produce_listings pl
             LEFT JOIN farmers f
               ON pl.farmer_id = f.id
             WHERE pl.id = $1`,
            [req.params.listingId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                error: "Listing not found"
            });
        }

        res.json({
            listing: result.rows[0]
        });
    } catch (err) {
        console.error(err.message);

        res.status(500).json({
            error: "Server error"
        });
    }
};

exports.placeOrder = async (req, res) => {
    const client = await pool.connect();

    try {
        const {
            listing_id,
            buyer_name,
            buyer_phone,
            quantity_requested,
            payment_method,
            payment_terms
        } = req.body;

        if (!listing_id || !quantity_requested) {
            return res.status(400).json({
                error: "Missing required fields"
            });
        }

        const requestedQuantity = toPositiveNumber(quantity_requested);

        if (!requestedQuantity) {
            return res.status(400).json({
                error: "Quantity requested must be greater than zero"
            });
        }

        const normalizedPaymentMethod = normalizePaymentMethod(payment_method);
        const normalizedPaymentTerms = trimString(payment_terms) || null;

        if (!isAllowedValue(normalizedPaymentMethod, PAYMENT_METHODS)) {
            return res.status(400).json({
                error: "Invalid payment method"
            });
        }

        if (normalizedPaymentTerms && normalizedPaymentTerms.length > 500) {
            return res.status(400).json({
                error: "Payment terms must be 500 characters or fewer"
            });
        }

        await client.query("BEGIN");

        const buyerProfile = await getBuyerProfile(client, req.user);
        const resolvedBuyerName = buyerProfile?.full_name || buyer_name;
        const resolvedBuyerPhone = buyerProfile?.phone || buyer_phone || req.user?.phone;

        if (!resolvedBuyerName || !resolvedBuyerPhone) {
            await client.query("ROLLBACK");

            return res.status(400).json({
                error: "Buyer profile is incomplete"
            });
        }

        const listingResult = await client.query(
            `SELECT *
             FROM produce_listings
             WHERE id = $1
             AND status = 'available'
             FOR UPDATE`,
            [listing_id]
        );

        if (listingResult.rows.length === 0) {
            await client.query("ROLLBACK");

            return res.status(404).json({
                error: "Listing not found"
            });
        }

        const listing = listingResult.rows[0];
        const availableQuantity = Number(listing.quantity_available);

        if (requestedQuantity > availableQuantity) {
            await client.query("ROLLBACK");

            return res.status(400).json({
                error: "Requested quantity exceeds available stock"
            });
        }

        const totalPrice = requestedQuantity * Number(listing.price_per_unit);

        const orderResult = await client.query(
            `INSERT INTO market_orders
             (listing_id, buyer_id, buyer_user_id, buyer_name, buyer_phone,
              quantity_requested, total_price, payment_method, payment_status, payment_terms)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
             RETURNING *`,
            [
                listing_id,
                buyerProfile?.id || null,
                buyerProfile?.user_id || req.user?.userId || null,
                resolvedBuyerName,
                resolvedBuyerPhone,
                requestedQuantity,
                totalPrice,
                normalizedPaymentMethod,
                DEFAULT_PAYMENT_STATUS,
                normalizedPaymentTerms
            ]
        );

        const remaining = availableQuantity - requestedQuantity;
        const newStatus = remaining === 0 ? "sold" : "available";

        await client.query(
            `UPDATE produce_listings
             SET quantity_available = $1,
                 reserved_quantity = reserved_quantity + $2,
                 status = $3
             WHERE id = $4`,
            [
                remaining,
                requestedQuantity,
                newStatus,
                listing_id
            ]
        );

        await createNotification(client, {
            farmerId: listing.farmer_id,
            orderId: orderResult.rows[0].id,
            eventType: "order_placed",
            recipientRole: "farmer",
            message: `Order #${orderResult.rows[0].id}: ${resolvedBuyerName} placed an order for ${requestedQuantity} ${listing.unit} of ${listing.crop_name}.`
        });

        if (buyerProfile?.user_id || req.user?.userId) {
            await createNotification(client, {
                userId: buyerProfile?.user_id || req.user.userId,
                orderId: orderResult.rows[0].id,
                eventType: "order_submitted",
                recipientRole: "buyer",
                message: `Order #${orderResult.rows[0].id}: Your order for ${requestedQuantity} ${listing.unit} of ${listing.crop_name} was submitted.`
            });
        }

        await client.query("COMMIT");

        res.status(201).json({
            message: "Order placed successfully",
            order: orderResult.rows[0],
            remaining_quantity: remaining
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

exports.getBuyerOrders = async (req, res) => {
    try {
        const buyerPhone = typeof req.query.buyer_phone === "string"
            ? req.query.buyer_phone.trim()
            : "";
        const buyerProfile = req.user?.role === "buyer"
            ? await getBuyerProfile(pool, req.user)
            : null;

        if (!buyerProfile && !buyerPhone) {
            return res.status(400).json({
                error: "buyer_phone is required"
            });
        }

        const values = [];
        const conditions = [];

        if (buyerProfile?.id) {
            values.push(buyerProfile.id);
            conditions.push(`mo.buyer_id = $${values.length}`);
        }

        if (req.user?.role === "buyer" && req.user.userId) {
            values.push(req.user.userId);
            conditions.push(`mo.buyer_user_id = $${values.length}`);
        }

        if (buyerPhone) {
            values.push(buyerPhone);
            conditions.push(`mo.buyer_phone = $${values.length}`);
        }

        const result = await pool.query(
            `SELECT
                mo.*,
                pl.crop_name,
                pl.unit,
                pl.location,
                pl.price_per_unit,
                f.full_name AS farmer_name,
                d.delivery_status,
                d.assigned_at,
                d.delivered_at
             FROM market_orders mo
             JOIN produce_listings pl
               ON mo.listing_id = pl.id
             LEFT JOIN farmers f
               ON pl.farmer_id = f.id
             LEFT JOIN deliveries d
               ON d.order_id = mo.id
             WHERE ${conditions.join(" OR ")}
             ORDER BY mo.created_at DESC`,
            values
        );

        res.json({
            count: result.rows.length,
            orders: result.rows
        });
    } catch (err) {
        console.error(err.message);

        res.status(500).json({
            error: "Server error"
        });
    }
};

exports.getMyListings = async (req, res) => {
    try {
        const farmerId = req.farmer.farmer_id;

        const result = await pool.query(
            `SELECT *
             FROM produce_listings
             WHERE farmer_id = $1
             ORDER BY created_at DESC`,
            [farmerId]
        );

        res.json({
            count: result.rows.length,
            listings: result.rows
        });
    } catch (err) {
        console.error(err.message);

        res.status(500).json({
            error: "Server error"
        });
    }
};

exports.updateListing = async (req, res) => {
    try {
        const farmerId = req.farmer.farmer_id;
        const {
            crop_name,
            quantity_available,
            price_per_unit,
            unit,
            location,
            status
        } = req.body;
        const quantityAvailable = toPositiveNumber(quantity_available);
        const pricePerUnit = toPositiveNumber(price_per_unit);
        const allowedStatuses = ["available", "sold", "inactive"];

        if (!trimString(crop_name) || !quantityAvailable || !pricePerUnit || !trimString(unit)) {
            return res.status(400).json({
                error: "Crop name, positive quantity, positive price, and unit are required"
            });
        }

        if (status && !isAllowedValue(status, allowedStatuses)) {
            return res.status(400).json({
                error: "Invalid listing status"
            });
        }

        const result = await pool.query(
            `UPDATE produce_listings
             SET crop_name = $1,
                 quantity_available = $2,
                 price_per_unit = $3,
                 unit = $4,
                 location = $5,
                 status = COALESCE($6, status)
             WHERE id = $7
             AND farmer_id = $8
             RETURNING *`,
            [
                trimString(crop_name),
                quantityAvailable,
                pricePerUnit,
                trimString(unit),
                trimString(location),
                status,
                req.params.listingId,
                farmerId
            ]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                error: "Listing not found or unauthorized"
            });
        }

        res.json({
            message: "Listing updated successfully",
            listing: result.rows[0]
        });
    } catch (err) {
        console.error(err.message);

        res.status(500).json({
            error: "Server error"
        });
    }
};

exports.deleteListing = async (req, res) => {
    try {
        const farmerId = req.farmer.farmer_id;

        const pendingOrders = await pool.query(
            `SELECT id
             FROM market_orders
             WHERE listing_id = $1
             AND status = 'pending'
             LIMIT 1`,
            [req.params.listingId]
        );

        if (pendingOrders.rows.length > 0) {
            return res.status(400).json({
                error: "Cannot delete a listing with pending orders"
            });
        }

        const result = await pool.query(
            `DELETE FROM produce_listings
             WHERE id = $1
             AND farmer_id = $2
             RETURNING *`,
            [req.params.listingId, farmerId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                error: "Listing not found or unauthorized"
            });
        }

        res.json({
            message: "Listing deleted successfully",
            listing: result.rows[0]
        });
    } catch (err) {
        console.error(err.message);

        res.status(500).json({
            error: "Server error"
        });
    }
};

exports.getMyOrders = async (req, res) => {
    try {
        const farmerId = req.farmer.farmer_id;

        const result = await pool.query(
            `SELECT
                mo.id,
                mo.buyer_name,
                mo.buyer_phone,
                mo.quantity_requested,
                mo.total_price,
                mo.payment_method,
                mo.payment_status,
                mo.payment_terms,
                mo.status,
                mo.created_at,
                pl.crop_name,
                pl.unit,
                pl.price_per_unit
             FROM market_orders mo
             JOIN produce_listings pl
               ON mo.listing_id = pl.id
             WHERE pl.farmer_id = $1
             ORDER BY mo.created_at DESC`,
            [farmerId]
        );

        res.json({
            count: result.rows.length,
            orders: result.rows
        });
    } catch (err) {
        console.error(err.message);

        res.status(500).json({
            error: "Server error"
        });
    }
};

exports.getMarketplaceAnalytics = async (req, res) => {
    try {
        const farmerId = req.farmer.farmer_id;

        const summary = await pool.query(
            `SELECT
                COUNT(DISTINCT pl.id) AS total_listings,
                COUNT(DISTINCT mo.id) AS total_orders,
                COALESCE(SUM(CASE WHEN mo.status = 'confirmed' THEN mo.total_price ELSE 0 END), 0) AS confirmed_revenue,
                COALESCE(SUM(CASE WHEN mo.status = 'pending' THEN mo.total_price ELSE 0 END), 0) AS pending_revenue,
                COALESCE(SUM(CASE WHEN mo.status = 'confirmed' THEN mo.quantity_requested ELSE 0 END), 0) AS confirmed_quantity
             FROM produce_listings pl
             LEFT JOIN market_orders mo
               ON mo.listing_id = pl.id
             WHERE pl.farmer_id = $1`,
            [farmerId]
        );

        const salesHistory = await pool.query(
            `SELECT
                mo.id,
                mo.created_at,
                mo.quantity_requested,
                mo.total_price,
                mo.status,
                pl.crop_name,
                pl.unit
             FROM market_orders mo
             JOIN produce_listings pl
               ON mo.listing_id = pl.id
             WHERE pl.farmer_id = $1
             ORDER BY mo.created_at DESC
             LIMIT 20`,
            [farmerId]
        );

        res.json({
            summary: summary.rows[0],
            sales_history: salesHistory.rows
        });
    } catch (err) {
        console.error(err.message);

        res.status(500).json({
            error: "Server error"
        });
    }
};

exports.confirmOrder = async (req, res) => {
    const client = await pool.connect();

    try {
        const farmerId = req.farmer.farmer_id;
        const { orderId } = req.params;
        const requestedStatus = trimString(req.body.status)?.toLowerCase();
        const status = requestedStatus === "accepted" ? "confirmed" : requestedStatus;

        if (status !== "confirmed" && status !== "rejected") {
            return res.status(400).json({
                error: "Status must be 'accepted', 'confirmed', or 'rejected'"
            });
        }

        await client.query("BEGIN");

        const orderCheck = await client.query(
            `SELECT mo.*, pl.crop_name, pl.unit
             FROM market_orders mo
             JOIN produce_listings pl
               ON mo.listing_id = pl.id
             WHERE mo.id = $1
             AND pl.farmer_id = $2
             FOR UPDATE`,
            [orderId, farmerId]
        );

        if (orderCheck.rows.length === 0) {
            await client.query("ROLLBACK");

            return res.status(404).json({
                error: "Order not found or unauthorized"
            });
        }

        const order = orderCheck.rows[0];

        if (order.status !== "pending") {
            await client.query("ROLLBACK");

            const currentStatus = order.status === "confirmed" ? "accepted" : order.status;

            return res.status(400).json({
                error: `Order already ${currentStatus}`
            });
        }

        if (status === "rejected") {
            const deliveryCheck = await client.query(
                `SELECT id
                 FROM deliveries
                 WHERE order_id = $1`,
                [orderId]
            );

            if (deliveryCheck.rows.length > 0) {
                await client.query("ROLLBACK");

                return res.status(400).json({
                    error: "Cannot reject an order that already has a delivery assignment"
                });
            }

            await client.query(
                `UPDATE produce_listings
                 SET quantity_available = quantity_available + $1,
                     reserved_quantity = GREATEST(reserved_quantity - $1, 0),
                     status = 'available'
                 WHERE id = $2`,
                [
                    order.quantity_requested,
                    order.listing_id
                ]
            );
        } else {
            await client.query(
                `UPDATE produce_listings
                 SET reserved_quantity = GREATEST(reserved_quantity - $1, 0)
                 WHERE id = $2`,
                [
                    order.quantity_requested,
                    order.listing_id
                ]
            );
        }

        const updatedOrder = await client.query(
            `UPDATE market_orders
             SET status = $1
             WHERE id = $2
             RETURNING *`,
            [status, orderId]
        );

        const statusLabel = status === "confirmed" ? "accepted" : status;

        if (order.buyer_user_id) {
            await createNotification(client, {
                userId: order.buyer_user_id,
                orderId: order.id,
                eventType: status === "confirmed" ? "order_accepted" : "order_rejected",
                recipientRole: "buyer",
                message: `Order #${order.id}: Your order for ${order.crop_name} was ${statusLabel} by the farmer.`
            });
        }

        await client.query("COMMIT");

        res.json({
            message: `Order ${statusLabel} successfully`,
            order: updatedOrder.rows[0]
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
