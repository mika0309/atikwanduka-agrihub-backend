require('dotenv').config({path: require('path').resolve(__dirname, '../../.env')});
const { Pool } = require('pg');

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

async function run() {
  const client = await pool.connect();
  try {
    console.log('Running migration: Add password_hash column to users table...');
    
    await client.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255)');
    console.log('✓ Column password_hash added successfully');
    
    // Verify
    const result = await client.query(
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'password_hash'"
    );
    
    if (result.rows.length > 0) {
      console.log('✓ Verified: password_hash column exists');
    } else {
      console.log('✗ Column not found after migration');
    }
    
    console.log('\nMigration complete. No data was modified or deleted.');
  } catch (err) {
    console.error('Migration error:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run();