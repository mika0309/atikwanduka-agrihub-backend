require("../config/env");

const bcrypt = require("bcrypt");
const pool = require("../db");

async function seedAdmin() {
    const password = "ChangeMeNow123!";
    const hash = await bcrypt.hash(password, 10);

    const result = await pool.query(
        `INSERT INTO admins (full_name, email, password_hash)
         VALUES ($1, $2, $3)
         ON CONFLICT (email) DO NOTHING
         RETURNING id, email`,
        [
            "System Administrator",
            "admin@agrihub.local",
            hash
        ]
    );

    console.log("Admin seeded:", result.rows);
    await pool.end();
}

seedAdmin()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error(err);
        process.exit(1);
    });
