const config = require("./config/env");
const { Pool } = require("pg");

const pool = new Pool({
    user: config.database.user,
    host: config.database.host,
    database: config.database.database,
    password: config.database.password,
    port: config.database.port,
});
pool.query("SELECT 1")
    .then(() => console.log("Database connected"))
    .catch(err => console.error("Database connection error", err));
module.exports = pool;
