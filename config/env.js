const path = require("path");
const dotenv = require("dotenv");

dotenv.config({
    path: path.resolve(__dirname, "../../.env")
});

dotenv.config({
    path: path.resolve(__dirname, "../.env"),
    override: true
});

const isProduction = process.env.NODE_ENV === "production";

function getRequiredEnv(name) {
    const value = process.env[name];

    if (!value) {
        throw new Error(`Missing required environment variable: ${name}`);
    }

    return value;
}

function getJwtSecret() {
    const secret = process.env.JWT_SECRET;

    if (!secret) {
        if (isProduction) {
            throw new Error("JWT_SECRET is required in production");
        }

        return "development_secret_for_local_only";
    }

    if (isProduction && secret.length < 32) {
        throw new Error("JWT_SECRET must be at least 32 characters in production");
    }

    return secret;
}

function getAllowedOrigins() {
    const configuredOrigins = process.env.CORS_ORIGIN || process.env.CORS_ORIGINS;

    if (configuredOrigins) {
        return configuredOrigins
            .split(",")
            .map((origin) => origin.trim())
            .filter(Boolean);
    }

    if (isProduction) {
        throw new Error("CORS_ORIGIN is required in production");
    }

    return [
        "http://localhost:5173",
        "http://127.0.0.1:5173"
    ];
}

const config = {
    env: process.env.NODE_ENV || "development",
    isProduction,
    port: Number(process.env.PORT || 3000),
    getJwtSecret,
    getAllowedOrigins,
    database: {
        user: process.env.DB_USER,
        host: process.env.DB_HOST,
        database: process.env.DB_NAME,
        password: process.env.DB_PASSWORD,
        port: Number(process.env.DB_PORT || 5432)
    },
    validateProduction() {
        if (!isProduction) {
            return;
        }

        [
            "DB_USER",
            "DB_HOST",
            "DB_NAME",
            "DB_PASSWORD",
            "JWT_SECRET",
            "CORS_ORIGIN"
        ].forEach(getRequiredEnv);

        getJwtSecret();
        getAllowedOrigins();
    }
};

config.validateProduction();

module.exports = config;
