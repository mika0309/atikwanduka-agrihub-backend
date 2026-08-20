const { execFileSync } = require("child_process");
const bcrypt = require("bcrypt");
const request = require("supertest");

const app = require("../app");
const pool = require("../db");

const adminEmail = "admin@agrihub.local";
const adminPassword = "ChangeMeNow123!";

const unique = () => `${Date.now()}${Math.floor(Math.random() * 100000)}`;

const authHeader = (token) => ({
    Authorization: `Bearer ${token}`
});

async function ensureAdmin() {
    const hash = await bcrypt.hash(adminPassword, 10);

    await pool.query(
        `INSERT INTO admins (full_name, email, password_hash)
         VALUES ($1, $2, $3)
         ON CONFLICT (email)
         DO UPDATE SET password_hash = EXCLUDED.password_hash`,
        [
            "System Administrator",
            adminEmail,
            hash
        ]
    );
}

async function loginAdmin() {
    const response = await request(app)
        .post("/api/admin/login")
        .send({
            email: adminEmail,
            password: adminPassword
        });

    expect(response.status).toBe(200);
    expect(response.body.token).toBeTruthy();

    return response.body.token;
}

async function registerAndLoginFarmer() {
    const suffix = unique().slice(-9);
    const phone = `07${suffix}`;

    const registerResponse = await request(app)
        .post("/api/farmers/register")
        .send({
            full_name: `Test Farmer ${suffix}`,
            phone,
            region: "Morogoro",
            district: "Morogoro",
            password: "testpass123",
            farm_size: 5,
            main_crop: "Maize"
        });

    expect(registerResponse.status).toBe(201);

    const loginResponse = await request(app)
        .post("/api/farmers/login")
        .send({
            phone,
            password: "testpass123"
        });

    expect(loginResponse.status).toBe(200);
    expect(loginResponse.body.token).toBeTruthy();

    return {
        farmer: registerResponse.body.farmer,
        token: loginResponse.body.token
    };
}

async function registerAndLoginBuyer() {
    const suffix = unique().slice(-7);
    const phone = `25566${suffix}`;

    const registerResponse = await request(app)
        .post("/api/auth/register/buyer")
        .send({
            full_name: `Test Buyer ${suffix}`,
            phone,
            password: "testpass123",
            region: "Dar es Salaam",
            district: "Ilala"
        });

    expect(registerResponse.status).toBe(201);

    const loginResponse = await request(app)
        .post("/api/auth/login")
        .send({
            phone,
            password: "testpass123"
        });

    expect(loginResponse.status).toBe(200);
    expect(loginResponse.body.token).toBeTruthy();

    return {
        buyer: registerResponse.body.buyer,
        token: loginResponse.body.token,
        user: loginResponse.body.user
    };
}

async function createListing(farmerToken, overrides = {}) {
    const response = await request(app)
        .post("/api/market/list-produce")
        .set(authHeader(farmerToken))
        .send({
            crop_name: "Maize",
            quantity_available: 500,
            price_per_unit: 1200,
            unit: "kg",
            location: "Morogoro",
            ...overrides
        });

    expect(response.status).toBe(201);
    return response.body.listing;
}

async function placeOrder(listingId, quantityRequested = 100, buyerToken = null, overrides = {}) {
    const requestBuilder = request(app)
        .post("/api/market/place-order")
        .send({
            listing_id: listingId,
            buyer_name: "John Traders Ltd",
            buyer_phone: "255712345678",
            quantity_requested: quantityRequested,
            ...overrides
        });

    if (buyerToken) {
        requestBuilder.set(authHeader(buyerToken));
    }

    const response = await requestBuilder;

    expect(response.status).toBe(201);
    return response.body.order;
}

async function confirmOrder(farmerToken, orderId) {
    const response = await request(app)
        .patch(`/api/market/confirm-order/${orderId}`)
        .set(authHeader(farmerToken))
        .send({
            status: "confirmed"
        });

    expect(response.status).toBe(200);
    return response.body.order;
}

async function registerTransporter(capacityKg = 5000) {
    const suffix = unique().slice(-7);

    const response = await request(app)
        .post("/api/transporters/register")
        .send({
            full_name: `Transporter ${suffix}`,
            phone: `25575${suffix}`,
            vehicle_type: "Truck",
            plate_number: `T${suffix}`,
            operating_region: "Morogoro",
            capacity_kg: capacityKg
        });

    expect(response.status).toBe(201);
    return response.body.transporter;
}

describe("AgriHub API protected flows", () => {
    beforeAll(async () => {
        execFileSync("node", ["init-db.js"], {
            cwd: __dirname + "/..",
            stdio: "ignore"
        });

        await ensureAdmin();
    });

    afterAll(async () => {
        await pool.end();
    });

    test("admin can log in and receive an admin token", async () => {
        const response = await request(app)
            .post("/api/admin/login")
            .send({
                email: adminEmail,
                password: adminPassword
            });

        expect(response.status).toBe(200);
        expect(response.body.token).toBeTruthy();
        expect(response.body.admin.role).toBe("admin");
    });

    test("farmer-only production routes reject admin tokens with 403", async () => {
        const adminToken = await loginAdmin();

        const response = await request(app)
            .post("/api/production/add")
            .set(authHeader(adminToken))
            .send({
                crop_name: "Maize",
                season: "long_rains",
                quantity_harvested: 120,
                estimated_value: 300000
            });

        expect(response.status).toBe(403);
        expect(response.body.error).toBe("Access denied. Insufficient permissions.");
    });

    test("buyer order reserves listing stock", async () => {
        const { token: farmerToken } = await registerAndLoginFarmer();
        const { buyer, token: buyerToken, user: buyerUser } = await registerAndLoginBuyer();
        const listing = await createListing(farmerToken, {
            quantity_available: 500
        });

        const order = await placeOrder(listing.id, 100, buyerToken);

        expect(order.status).toBe("pending");
        expect(order.buyer_id).toBe(buyer.id);
        expect(order.buyer_user_id).toBe(buyer.user_id || buyerUser.id);

        const listingResult = await pool.query(
            "SELECT quantity_available, reserved_quantity, status FROM produce_listings WHERE id = $1",
            [listing.id]
        );

        expect(Number(listingResult.rows[0].quantity_available)).toBe(400);
        expect(Number(listingResult.rows[0].reserved_quantity)).toBe(100);
        expect(listingResult.rows[0].status).toBe("available");
    });

    test("buyer order stores default payment arrangement", async () => {
        const { token: farmerToken } = await registerAndLoginFarmer();
        const { token: buyerToken } = await registerAndLoginBuyer();
        const listing = await createListing(farmerToken);

        const order = await placeOrder(listing.id, 100, buyerToken);

        expect(order.payment_method).toBe("MOBILE_MONEY");
        expect(order.payment_status).toBe("PENDING");
        expect(order.payment_terms).toBeNull();

        const buyerOrdersResponse = await request(app)
            .get("/api/market/buyer-orders")
            .set(authHeader(buyerToken));

        expect(buyerOrdersResponse.status).toBe(200);

        const buyerOrder = buyerOrdersResponse.body.orders.find((item) => item.id === order.id);

        expect(buyerOrder).toBeDefined();
        expect(buyerOrder.payment_method).toBe("MOBILE_MONEY");
        expect(buyerOrder.payment_status).toBe("PENDING");
        expect(buyerOrder.payment_terms).toBeNull();
    });

    test("buyer order stores and returns explicit payment arrangement", async () => {
        const { token: farmerToken } = await registerAndLoginFarmer();
        const { token: buyerToken } = await registerAndLoginBuyer();
        const listing = await createListing(farmerToken);
        const paymentTerms = "Pay on delivery after farmer confirmation";

        const order = await placeOrder(listing.id, 100, buyerToken, {
            payment_method: "cash_on_delivery",
            payment_terms: paymentTerms
        });

        expect(order.payment_method).toBe("CASH_ON_DELIVERY");
        expect(order.payment_status).toBe("PENDING");
        expect(order.payment_terms).toBe(paymentTerms);

        const farmerOrdersResponse = await request(app)
            .get("/api/market/my-orders")
            .set(authHeader(farmerToken));

        expect(farmerOrdersResponse.status).toBe(200);

        const farmerOrder = farmerOrdersResponse.body.orders.find((item) => item.id === order.id);

        expect(farmerOrder).toBeDefined();
        expect(farmerOrder.payment_method).toBe("CASH_ON_DELIVERY");
        expect(farmerOrder.payment_status).toBe("PENDING");
        expect(farmerOrder.payment_terms).toBe(paymentTerms);
    });

    test("invalid payment method is rejected", async () => {
        const { token: farmerToken } = await registerAndLoginFarmer();
        const { token: buyerToken } = await registerAndLoginBuyer();
        const listing = await createListing(farmerToken);

        const response = await request(app)
            .post("/api/market/place-order")
            .set(authHeader(buyerToken))
            .send({
                listing_id: listing.id,
                buyer_name: "John Traders Ltd",
                buyer_phone: "255712345678",
                quantity_requested: 100,
                payment_method: "CARD_PIN"
            });

        expect(response.status).toBe(400);
        expect(response.body.error).toBe("Invalid payment method");
    });

    test("order placement notifies only the listing farmer", async () => {
        const { token: listingFarmerToken } = await registerAndLoginFarmer();
        const { token: otherFarmerToken } = await registerAndLoginFarmer();
        const { token: buyerToken } = await registerAndLoginBuyer();
        const listing = await createListing(listingFarmerToken);
        const order = await placeOrder(listing.id, 100, buyerToken);

        const listingFarmerNotifications = await request(app)
            .get("/api/notifications/my-notifications")
            .set(authHeader(listingFarmerToken));

        expect(listingFarmerNotifications.status).toBe(200);

        const orderPlacedNotification = listingFarmerNotifications.body.notifications.find((notification) => (
            notification.order_id === order.id &&
            notification.event_type === "order_placed"
        ));

        expect(orderPlacedNotification).toBeDefined();
        expect(orderPlacedNotification.recipient_role).toBe("farmer");
        expect(orderPlacedNotification.message).toContain(`Order #${order.id}`);
        expect(orderPlacedNotification.is_read).toBe(false);
        expect(orderPlacedNotification.created_at).toBeTruthy();

        const otherFarmerNotifications = await request(app)
            .get("/api/notifications/my-notifications")
            .set(authHeader(otherFarmerToken));

        expect(otherFarmerNotifications.status).toBe(200);
        expect(
            otherFarmerNotifications.body.notifications.some((notification) => (
                notification.order_id === order.id
            ))
        ).toBe(false);
    });

    test("over-ordering is blocked and does not reserve stock", async () => {
        const { token: farmerToken } = await registerAndLoginFarmer();
        const { token: buyerToken } = await registerAndLoginBuyer();
        const listing = await createListing(farmerToken, {
            quantity_available: 100
        });

        const response = await request(app)
            .post("/api/market/place-order")
            .set(authHeader(buyerToken))
            .send({
                listing_id: listing.id,
                buyer_name: "John Traders Ltd",
                buyer_phone: "255712345678",
                quantity_requested: 101
            });

        expect(response.status).toBe(400);
        expect(response.body.error).toBe("Requested quantity exceeds available stock");

        const listingResult = await pool.query(
            "SELECT quantity_available, reserved_quantity, status FROM produce_listings WHERE id = $1",
            [listing.id]
        );

        expect(Number(listingResult.rows[0].quantity_available)).toBe(100);
        expect(Number(listingResult.rows[0].reserved_quantity)).toBe(0);
        expect(listingResult.rows[0].status).toBe("available");
    });

    test("buyer can view own account order history without phone query", async () => {
        const { token: farmerToken } = await registerAndLoginFarmer();
        const { token: buyerToken } = await registerAndLoginBuyer();
        const listing = await createListing(farmerToken);
        const order = await placeOrder(listing.id, 75, buyerToken);

        const response = await request(app)
            .get("/api/market/buyer-orders")
            .set(authHeader(buyerToken));

        expect(response.status).toBe(200);
        expect(response.body.orders.some((buyerOrder) => buyerOrder.id === order.id)).toBe(true);
    });

    test("pending order can be accepted once and cannot be changed again", async () => {
        const { token: farmerToken } = await registerAndLoginFarmer();
        const { token: buyerToken } = await registerAndLoginBuyer();
        const listing = await createListing(farmerToken);
        const order = await placeOrder(listing.id, 100, buyerToken);

        const acceptResponse = await request(app)
            .patch(`/api/market/confirm-order/${order.id}`)
            .set(authHeader(farmerToken))
            .send({
                status: "accepted"
            });

        expect(acceptResponse.status).toBe(200);
        expect(acceptResponse.body.order.status).toBe("confirmed");

        const secondAcceptResponse = await request(app)
            .patch(`/api/market/confirm-order/${order.id}`)
            .set(authHeader(farmerToken))
            .send({
                status: "accepted"
            });

        expect(secondAcceptResponse.status).toBe(400);
        expect(secondAcceptResponse.body.error).toBe("Order already accepted");

        const rejectAfterAcceptResponse = await request(app)
            .patch(`/api/market/confirm-order/${order.id}`)
            .set(authHeader(farmerToken))
            .send({
                status: "rejected"
            });

        expect(rejectAfterAcceptResponse.status).toBe(400);
        expect(rejectAfterAcceptResponse.body.error).toBe("Order already accepted");
    });

    test("accepted order settles reserved stock and is visible to buyer", async () => {
        const { token: farmerToken } = await registerAndLoginFarmer();
        const { token: buyerToken } = await registerAndLoginBuyer();
        const listing = await createListing(farmerToken, {
            quantity_available: 500
        });
        const order = await placeOrder(listing.id, 100, buyerToken);

        const acceptResponse = await request(app)
            .patch(`/api/market/confirm-order/${order.id}`)
            .set(authHeader(farmerToken))
            .send({
                status: "accepted"
            });

        expect(acceptResponse.status).toBe(200);
        expect(acceptResponse.body.message).toBe("Order accepted successfully");
        expect(acceptResponse.body.order.status).toBe("confirmed");

        const listingResult = await pool.query(
            "SELECT quantity_available, reserved_quantity, status FROM produce_listings WHERE id = $1",
            [listing.id]
        );

        expect(Number(listingResult.rows[0].quantity_available)).toBe(400);
        expect(Number(listingResult.rows[0].reserved_quantity)).toBe(0);
        expect(listingResult.rows[0].status).toBe("available");

        const buyerOrdersResponse = await request(app)
            .get("/api/market/buyer-orders")
            .set(authHeader(buyerToken));

        expect(buyerOrdersResponse.status).toBe(200);
        expect(
            buyerOrdersResponse.body.orders.some((buyerOrder) => (
                buyerOrder.id === order.id && buyerOrder.status === "confirmed"
            ))
        ).toBe(true);

        const secondAcceptResponse = await request(app)
            .patch(`/api/market/confirm-order/${order.id}`)
            .set(authHeader(farmerToken))
            .send({
                status: "accepted"
            });

        expect(secondAcceptResponse.status).toBe(400);

        const buyerNotifications = await request(app)
            .get("/api/notifications/my-notifications")
            .set(authHeader(buyerToken));

        expect(buyerNotifications.status).toBe(200);

        const acceptedNotifications = buyerNotifications.body.notifications.filter((notification) => (
            notification.order_id === order.id &&
            notification.event_type === "order_accepted"
        ));

        expect(acceptedNotifications).toHaveLength(1);
        expect(acceptedNotifications[0].recipient_role).toBe("buyer");
        expect(acceptedNotifications[0].message).toContain(`Order #${order.id}`);
        expect(acceptedNotifications[0].message).toContain("accepted by the farmer");
        expect(acceptedNotifications[0].is_read).toBe(false);
        expect(acceptedNotifications[0].created_at).toBeTruthy();
    });

    test("buyer cannot accept or reject an order", async () => {
        const { token: farmerToken } = await registerAndLoginFarmer();
        const { token: buyerToken } = await registerAndLoginBuyer();
        const listing = await createListing(farmerToken);
        const order = await placeOrder(listing.id, 100, buyerToken);

        const response = await request(app)
            .patch(`/api/market/confirm-order/${order.id}`)
            .set(authHeader(buyerToken))
            .send({
                status: "accepted"
            });

        expect(response.status).toBe(403);
        expect(response.body.error).toBe("Access denied. Insufficient permissions.");
    });

    test("farmer cannot modify an order for another farmer's listing", async () => {
        const { token: ownerFarmerToken } = await registerAndLoginFarmer();
        const { token: otherFarmerToken } = await registerAndLoginFarmer();
        const { token: buyerToken } = await registerAndLoginBuyer();
        const listing = await createListing(ownerFarmerToken);
        const order = await placeOrder(listing.id, 100, buyerToken);

        const response = await request(app)
            .patch(`/api/market/confirm-order/${order.id}`)
            .set(authHeader(otherFarmerToken))
            .send({
                status: "accepted"
            });

        expect(response.status).toBe(404);
        expect(response.body.error).toBe("Order not found or unauthorized");
    });

    test("rejected order restores stock and cannot be rejected twice", async () => {
        const { token: farmerToken } = await registerAndLoginFarmer();
        const { token: buyerToken } = await registerAndLoginBuyer();
        const listing = await createListing(farmerToken, {
            quantity_available: 500
        });
        const order = await placeOrder(listing.id, 100, buyerToken);

        const rejectResponse = await request(app)
            .patch(`/api/market/confirm-order/${order.id}`)
            .set(authHeader(farmerToken))
            .send({
                status: "rejected"
            });

        expect(rejectResponse.status).toBe(200);
        expect(rejectResponse.body.order.status).toBe("rejected");

        const listingResult = await pool.query(
            "SELECT quantity_available, reserved_quantity, status FROM produce_listings WHERE id = $1",
            [listing.id]
        );

        expect(Number(listingResult.rows[0].quantity_available)).toBe(500);
        expect(Number(listingResult.rows[0].reserved_quantity)).toBe(0);
        expect(listingResult.rows[0].status).toBe("available");

        const secondRejectResponse = await request(app)
            .patch(`/api/market/confirm-order/${order.id}`)
            .set(authHeader(farmerToken))
            .send({
                status: "rejected"
            });

        expect(secondRejectResponse.status).toBe(400);
        expect(secondRejectResponse.body.error).toBe("Order already rejected");

        const secondListingResult = await pool.query(
            "SELECT quantity_available, reserved_quantity, status FROM produce_listings WHERE id = $1",
            [listing.id]
        );

        expect(Number(secondListingResult.rows[0].quantity_available)).toBe(500);
        expect(Number(secondListingResult.rows[0].reserved_quantity)).toBe(0);
        expect(secondListingResult.rows[0].status).toBe("available");

        const buyerOrdersResponse = await request(app)
            .get("/api/market/buyer-orders")
            .set(authHeader(buyerToken));

        expect(buyerOrdersResponse.status).toBe(200);
        expect(
            buyerOrdersResponse.body.orders.some((buyerOrder) => (
                buyerOrder.id === order.id && buyerOrder.status === "rejected"
            ))
        ).toBe(true);

        const buyerNotifications = await request(app)
            .get("/api/notifications/my-notifications")
            .set(authHeader(buyerToken));

        expect(buyerNotifications.status).toBe(200);

        const rejectedNotifications = buyerNotifications.body.notifications.filter((notification) => (
            notification.order_id === order.id &&
            notification.event_type === "order_rejected"
        ));

        expect(rejectedNotifications).toHaveLength(1);
        expect(rejectedNotifications[0].recipient_role).toBe("buyer");
        expect(rejectedNotifications[0].message).toContain(`Order #${order.id}`);
        expect(rejectedNotifications[0].message).toContain("rejected by the farmer");
        expect(rejectedNotifications[0].is_read).toBe(false);
        expect(rejectedNotifications[0].created_at).toBeTruthy();
    });

    test("transporter assignment and delivery update are admin-only", async () => {
        const adminToken = await loginAdmin();
        const { token: farmerToken } = await registerAndLoginFarmer();
        const { token: buyerToken } = await registerAndLoginBuyer();
        const listing = await createListing(farmerToken);
        const order = await placeOrder(listing.id, 100, buyerToken);
        await confirmOrder(farmerToken, order.id);
        const transporter = await registerTransporter(5000);

        const assignmentPayload = {
            order_id: order.id,
            transporter_id: transporter.id
        };

        const noTokenResponse = await request(app)
            .post("/api/transporters/assign")
            .send(assignmentPayload);

        expect(noTokenResponse.status).toBe(401);

        const farmerTokenResponse = await request(app)
            .post("/api/transporters/assign")
            .set(authHeader(farmerToken))
            .send(assignmentPayload);

        expect(farmerTokenResponse.status).toBe(403);

        const adminTokenResponse = await request(app)
            .post("/api/transporters/assign")
            .set(authHeader(adminToken))
            .send(assignmentPayload);

        expect(adminTokenResponse.status).toBe(201);

        const deliveryId = adminTokenResponse.body.delivery.id;

        const updateNoTokenResponse = await request(app)
            .patch(`/api/transporters/update-delivery/${deliveryId}`)
            .send({
                delivery_status: "in_transit"
            });

        expect(updateNoTokenResponse.status).toBe(401);

        const updateFarmerTokenResponse = await request(app)
            .patch(`/api/transporters/update-delivery/${deliveryId}`)
            .set(authHeader(farmerToken))
            .send({
                delivery_status: "in_transit"
            });

        expect(updateFarmerTokenResponse.status).toBe(403);

        const acceptedResponse = await request(app)
            .patch(`/api/transporters/update-delivery/${deliveryId}`)
            .set(authHeader(adminToken))
            .send({
                delivery_status: "accepted"
            });

        expect(acceptedResponse.status).toBe(200);
        expect(acceptedResponse.body.delivery.delivery_status).toBe("accepted");

        const pickedUpResponse = await request(app)
            .patch(`/api/transporters/update-delivery/${deliveryId}`)
            .set(authHeader(adminToken))
            .send({
                delivery_status: "picked_up"
            });

        expect(pickedUpResponse.status).toBe(200);

        const inTransitResponse = await request(app)
            .patch(`/api/transporters/update-delivery/${deliveryId}`)
            .set(authHeader(adminToken))
            .send({
                delivery_status: "in_transit"
            });

        expect(inTransitResponse.status).toBe(200);
        expect(inTransitResponse.body.delivery.delivery_status).toBe("in_transit");
    });

    test("transporter capacity blocks unrealistic assignments", async () => {
        const adminToken = await loginAdmin();
        const { token: farmerToken } = await registerAndLoginFarmer();
        const { token: buyerToken } = await registerAndLoginBuyer();
        const listing = await createListing(farmerToken, {
            quantity_available: 1000
        });
        const order = await placeOrder(listing.id, 500, buyerToken);
        await confirmOrder(farmerToken, order.id);
        const transporter = await registerTransporter(100);

        const response = await request(app)
            .post("/api/transporters/assign")
            .set(authHeader(adminToken))
            .send({
                order_id: order.id,
                transporter_id: transporter.id
            });

        expect(response.status).toBe(400);
        expect(response.body.error).toBe("Transporter capacity insufficient");
    });

    test("completed delivery cannot be completed again", async () => {
        const adminToken = await loginAdmin();
        const { token: farmerToken } = await registerAndLoginFarmer();
        const { token: buyerToken } = await registerAndLoginBuyer();
        const listing = await createListing(farmerToken);
        const order = await placeOrder(listing.id, 100, buyerToken);
        await confirmOrder(farmerToken, order.id);
        const transporter = await registerTransporter(5000);

        const assignmentResponse = await request(app)
            .post("/api/transporters/assign")
            .set(authHeader(adminToken))
            .send({
                order_id: order.id,
                transporter_id: transporter.id
            });

        expect(assignmentResponse.status).toBe(201);

        const deliveryId = assignmentResponse.body.delivery.id;

        await request(app)
            .patch(`/api/transporters/update-delivery/${deliveryId}`)
            .set(authHeader(adminToken))
            .send({
                delivery_status: "accepted"
            });

        await request(app)
            .patch(`/api/transporters/update-delivery/${deliveryId}`)
            .set(authHeader(adminToken))
            .send({
                delivery_status: "picked_up"
            });

        await request(app)
            .patch(`/api/transporters/update-delivery/${deliveryId}`)
            .set(authHeader(adminToken))
            .send({
                delivery_status: "in_transit"
            });

        const deliveredResponse = await request(app)
            .patch(`/api/transporters/update-delivery/${deliveryId}`)
            .set(authHeader(adminToken))
            .send({
                delivery_status: "delivered"
            });

        expect(deliveredResponse.status).toBe(200);
        expect(deliveredResponse.body.delivery.delivery_status).toBe("delivered");

        const repeatDeliveredResponse = await request(app)
            .patch(`/api/transporters/update-delivery/${deliveryId}`)
            .set(authHeader(adminToken))
            .send({
                delivery_status: "delivered"
            });

        expect(repeatDeliveredResponse.status).toBe(400);
        expect(repeatDeliveredResponse.body.error).toBe("Delivery already completed");
    });
});
