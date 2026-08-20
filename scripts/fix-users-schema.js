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
    console.log('Running schema fixes for users table...\n');

    // 1. Check current constraints
    const cols = await client.query(
      "SELECT column_name, is_nullable, column_default FROM information_schema.columns WHERE table_name = 'users' ORDER BY ordinal_position"
    );
    console.log('Current schema:');
    cols.rows.forEach(c => console.log(`  ${c.column_name}: nullable=${c.is_nullable}, default=${c.column_default || 'none'}`));

    // 2. Drop NOT NULL from email if it exists
    await client.query('ALTER TABLE users ALTER COLUMN email DROP NOT NULL');
    console.log('\n✓ email: NOT NULL constraint removed');

    // 3. Drop NOT NULL from username if it exists (we'll set it via phone)
    await client.query('ALTER TABLE users ALTER COLUMN username DROP NOT NULL');
    console.log('✓ username: NOT NULL constraint removed');

    // 4. Drop NOT NULL from password if it exists (we use password_hash now)
    await client.query('ALTER TABLE users ALTER COLUMN password DROP NOT NULL');
    console.log('✓ password: NOT NULL constraint removed');

    console.log('\nAll schema fixes applied. No data was modified or deleted.');
  } catch (err) {
    console.error('Migration error:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run();