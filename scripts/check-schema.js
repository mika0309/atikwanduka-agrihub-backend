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
  try {
    const result = await pool.query(
      "SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = $1 ORDER BY ordinal_position",
      ['users']
    );
    console.log('Users table columns:');
    result.rows.forEach(c => console.log(`  ${c.column_name} (${c.data_type}, nullable=${c.is_nullable})`));
    
    // Check if password_hash exists
    const hasPasswordHash = result.rows.some(r => r.column_name === 'password_hash');
    console.log('\nHas password_hash column:', hasPasswordHash);
    
    if (!hasPasswordHash) {
      console.log('\nNeed to run migration to add password_hash column.');
    }
    
    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

run();