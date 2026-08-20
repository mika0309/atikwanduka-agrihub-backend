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

    // Check if admin exists in users table
    const existingUser = await pool.query(
        `SELECT id FROM users WHERE email = $1`,
        [adminEmail]
    );

    if (existingUser.rows.length === 0) {
        // Create users record
        const userResult = await pool.query(
            `INSERT INTO users (email, password_hash, role)
             VALUES ($1, $2, 'admin')
             RETURNING id`,
            [adminEmail, hash]
        );

        // Create or update admin profile
        await pool.query(
            `INSERT INTO admins (user_id, full_name, email, password_hash)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (email)
             DO UPDATE SET password_hash = EXCLUDED.password_hash`,
            [
                userResult.rows[0].id,
                "System Administrator",
                adminEmail,
                hash
            ]
        );
    } else {
        // Update existing admin
        await pool.query(
            `UPDATE admins SET password_hash = $1 WHERE email = $2`,
            [hash, adminEmail]
        );
    }
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
        .post("/api/auth/register/farmer")
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
        .post("/api/auth/login")
        .send({
            phone,
            password: "testpass123"
        });

    expect(loginResponse.status).toBe(200);
    expect(loginResponse.body.token).toBeTruthy();

    return {
        farmer: registerResponse.body.farmer,
        token: loginResponse.body.token,
        user: loginResponse.body.user
    };
}

async function registerAndLoginBuyer() {
    const suffix = unique().slice(-7);
    const phone = `255${suffix}`;

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

async function registerAndLoginTransporter() {
    const suffix = unique().slice(-7);
    const phone = `25575${suffix}`;

    const registerResponse = await request(app)
        .post("/api/auth/register/transporter")
        .send({
            full_name: `Test Transporter ${suffix}`,
            phone,
            vehicle_type: "Truck",
            plate_number: `T${suffix}`,
            operating_region: "Morogoro",
            capacity_kg: 5000,
            password: "testpass123"
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
        transporter: registerResponse.body.transporter,
        token: loginResponse.body.token,
        user: loginResponse.body.user
    };
}

describe("RBAC - Role Based Access Control Tests", () => {
    beforeAll(async () => {
        execFileSync("node", ["init-db.js"], {
            cwd: __dirname + "/..",
            stdio: "ignore"
        });

        await ensureAdmin();
    });

    test("Buyer registration returns a profile payload for auth persistence", async () => {
        const suffix = unique().slice(-7);
        const phone = `25566${suffix}`;

        const response = await request(app)
            .post("/api/auth/register/buyer")
            .send({
                full_name: `Buyer Auth ${suffix}`,
                phone,
                password: "testpass123",
                region: "Dar es Salaam",
                district: "Ilala"
            });

        expect(response.status).toBe(201);
        expect(response.body.token).toBeTruthy();
        expect(response.body.user).toBeDefined();
        expect(response.body.user.role).toBe("buyer");
        expect(response.body.profile).toBeDefined();
        expect(response.body.profile.phone).toBe(phone);
    });

    afterAll(async () => {
        await pool.end();
    });

    // ============================================================
    // TEST 1: Farmer accessing farmer route - MUST SUCCEED
    // ============================================================
    test("Farmer accessing farmer route: SUCCESS", async () => {
        const { token } = await registerAndLoginFarmer();

        const response = await request(app)
            .post("/api/production/add")
            .set(authHeader(token))
            .send({
                crop_name: "Maize",
                season: "long_rains",
                quantity_harvested: 120,
                estimated_value: 300000
            });

        // Farmer should be able to add production records
        expect(response.status).toBe(201);
    });

    // ============================================================
    // TEST 2: Farmer accessing admin route - MUST FAIL 403
    // ============================================================
    test("Farmer accessing admin route: FAIL 403", async () => {
        const { token } = await registerAndLoginFarmer();

        const response = await request(app)
            .get("/api/admin/farmers")
            .set(authHeader(token));

        expect(response.status).toBe(403);
        expect(response.body.error).toBe("Access denied. Insufficient permissions.");
    });

    // ============================================================
    // TEST 3: Farmer accessing subsidy assign route - MUST FAIL 403
    // ============================================================
    test("Farmer accessing subsidy assign route: FAIL 403", async () => {
        const { token } = await registerAndLoginFarmer();

        const response = await request(app)
            .post("/api/subsidy/assign")
            .set(authHeader(token))
            .send({
                farmer_id: 1,
                subsidy_type: "Fertilizer",
                amount: 50000
            });

        expect(response.status).toBe(403);
        expect(response.body.error).toBe("Access denied. Insufficient permissions.");
    });

    // ============================================================
    // TEST 4: Buyer accessing transport route - MUST FAIL 403
    // ============================================================
    test("Buyer accessing transport route: FAIL 403", async () => {
        const { token } = await registerAndLoginBuyer();

        const response = await request(app)
            .post("/api/transporters/assign")
            .set(authHeader(token))
            .send({
                order_id: 1,
                transporter_id: 1
            });

        expect(response.status).toBe(403);
        expect(response.body.error).toBe("Access denied. Insufficient permissions.");
    });

    // ============================================================
    // TEST 5: Buyer accessing production route - MUST FAIL 403
    // ============================================================
    test("Buyer accessing production route: FAIL 403", async () => {
        const { token } = await registerAndLoginBuyer();

        const response = await request(app)
            .post("/api/production/add")
            .set(authHeader(token))
            .send({
                crop_name: "Maize",
                season: "long_rains",
                quantity_harvested: 120
            });

        expect(response.status).toBe(403);
        expect(response.body.error).toBe("Access denied. Insufficient permissions.");
    });

    // ============================================================
    // TEST 6: Transporter accessing admin route - MUST FAIL 403
    // ============================================================
    test("Transporter accessing admin route: FAIL 403", async () => {
        const { token } = await registerAndLoginTransporter();

        const response = await request(app)
            .get("/api/admin/farmers")
            .set(authHeader(token));

        expect(response.status).toBe(403);
        expect(response.body.error).toBe("Access denied. Insufficient permissions.");
    });

    // ============================================================
    // TEST 7: Admin accessing everything - MUST SUCCEED
    // ============================================================
    test("Admin accessing farmer route: SUCCESS", async () => {
        const adminToken = await loginAdmin();

        const response = await request(app)
            .get("/api/admin/farmers")
            .set(authHeader(adminToken));

        expect(response.status).toBe(200);
        expect(response.body.farmers).toBeDefined();
    });

    test("Admin accessing admin route: SUCCESS", async () => {
        const adminToken = await loginAdmin();

        const response = await request(app)
            .get("/api/admin/transporters")
            .set(authHeader(adminToken));

        expect(response.status).toBe(200);
        expect(response.body.transporters).toBeDefined();
    });

    test("Admin accessing subsidy assign route: SUCCESS", async () => {
        const adminToken = await loginAdmin();

        const response = await request(app)
            .post("/api/subsidy/assign")
            .set(authHeader(adminToken))
            .send({
                farmer_id: 1,
                subsidy_type: "Fertilizer",
                amount: 50000
            });

        // May fail if farmer_id doesn't exist, but should NOT be 403
        expect(response.status).not.toBe(403);
    });

    // ============================================================
    // TEST 8: Unauthenticated access - MUST FAIL 401
    // ============================================================
    test("Unauthenticated access to protected route: FAIL 401", async () => {
        const response = await request(app)
            .get("/api/admin/farmers");

        expect(response.status).toBe(401);
        expect(response.body.error).toBe("Access denied. No token provided.");
    });

    // ============================================================
    // TEST 9: JWT contains correct role information
    // ============================================================
    test("JWT token contains correct role information", async () => {
        const { token, user } = await registerAndLoginFarmer();

        // Decode the token payload
        const payload = JSON.parse(
            Buffer.from(token.split(".")[1], "base64").toString()
        );

        expect(payload.role).toBe("farmer");
        expect(payload.userId).toBe(user.id);
    });

    test("Admin JWT token contains admin role", async () => {
        const adminToken = await loginAdmin();

        const payload = JSON.parse(
            Buffer.from(adminToken.split(".")[1], "base64").toString()
        );

        expect(payload.role).toBe("admin");
    });

    // ============================================================
    // TEST 10: Unified login works for all roles
    // ============================================================
    test("Unified login works for farmer", async () => {
        const suffix = unique().slice(-9);
        const phone = `07${suffix}`;

        await request(app)
            .post("/api/auth/register/farmer")
            .send({
                full_name: `Login Test Farmer ${suffix}`,
                phone,
                region: "Morogoro",
                district: "Morogoro",
                password: "testpass123"
            });

        const response = await request(app)
            .post("/api/auth/login")
            .send({
                phone,
                password: "testpass123"
            });

        expect(response.status).toBe(200);
        expect(response.body.token).toBeTruthy();
        expect(response.body.user.role).toBe("farmer");
        expect(response.body.profile).toBeTruthy();
    });

    test("Unified login works for buyer", async () => {
        const suffix = unique().slice(-7);
        const phone = `255${suffix}`;

        await request(app)
            .post("/api/auth/register/buyer")
            .send({
                full_name: `Login Test Buyer ${suffix}`,
                phone,
                password: "testpass123"
            });

        const response = await request(app)
            .post("/api/auth/login")
            .send({
                phone,
                password: "testpass123"
            });

        expect(response.status).toBe(200);
        expect(response.body.token).toBeTruthy();
        expect(response.body.user.role).toBe("buyer");
        expect(response.body.profile).toBeTruthy();
    });
});