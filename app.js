const config = require("./config/env");

const express = require("express");
const cors = require("cors");

const authRoutes = require("./routers/authRoutes");
const farmerRoutes = require("./routers/farmerRouters");
const productionRoutes = require("./routers/productionRoutes");
const creditRoutes = require("./routers/creditRoutes");
const subsidyRoutes = require("./routers/subsidyRoutes");
const marketRoutes = require("./routers/marketRoutes");
const transporterRoutes = require("./routers/transporterRoutes");
const notificationRoutes = require("./routers/notificationRoutes");
const adminRoutes = require("./routers/adminRoutes");

const app = express();

app.disable("x-powered-by");

app.use(cors({
    origin(origin, callback) {
        if (!origin) {
            return callback(null, true);
        }

        if (config.getAllowedOrigins().includes(origin)) {
            return callback(null, true);
        }

        return callback(new Error("Origin not allowed by CORS"));
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"]
}));

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

// Public auth routes (no authentication required)
app.use("/api/auth", authRoutes);

// Legacy routes (kept for backward compatibility)
app.use("/api/farmers", farmerRoutes);
app.use("/api/production", productionRoutes);
app.use("/api/credit", creditRoutes);
app.use("/api/subsidy", subsidyRoutes);
app.use("/api/market", marketRoutes);
app.use("/api/transporters", transporterRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/admin", adminRoutes);

app.get("/", (req, res) => {
    res.send("Atikwanduka AgriHub API running...");
});

app.use((err, req, res, next) => {
    if (err instanceof SyntaxError && err.status === 400 && "body" in err) {
        return res.status(400).json({
            error: "Invalid JSON request body"
        });
    }

    if (err.message === "Origin not allowed by CORS") {
        return res.status(403).json({
            error: "Origin not allowed by CORS"
        });
    }

    next(err);
});

app.use((req, res) => {
    res.status(404).json({
        error: "Route not found"
    });
});

app.use((err, req, res, next) => {
    console.error(err.message);

    res.status(500).json({
        error: "Server error"
    });
});

module.exports = app;
