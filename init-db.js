require('dotenv').config();
const { Pool } = require('pg');

// Create a pool for connecting
const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
});

// SQL to create tables
const initSQL = `
-- Farmers table
CREATE TABLE IF NOT EXISTS farmers (
    id SERIAL PRIMARY KEY,
    full_name VARCHAR(255) NOT NULL,
    phone VARCHAR(20) NOT NULL UNIQUE,
    national_id VARCHAR(50),
    region VARCHAR(255),
    district VARCHAR(255),
    ward VARCHAR(255),
    village VARCHAR(255),
    farm_size DECIMAL(10, 2),
    main_crop VARCHAR(255),
    password VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(255) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    phone VARCHAR(20),
    role VARCHAR(50) DEFAULT 'farmer',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Farms table
CREATE TABLE IF NOT EXISTS farms (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    farm_name VARCHAR(255) NOT NULL,
    location VARCHAR(255),
    area_hectares DECIMAL(10, 2),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Crops table
CREATE TABLE IF NOT EXISTS crops (
    id SERIAL PRIMARY KEY,
    farm_id INTEGER NOT NULL,
    crop_name VARCHAR(255) NOT NULL,
    variety VARCHAR(255),
    planting_date DATE,
    expected_harvest_date DATE,
    status VARCHAR(50) DEFAULT 'growing',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (farm_id) REFERENCES farms(id) ON DELETE CASCADE
);

-- Harvest records table
CREATE TABLE IF NOT EXISTS harvest_records (
    id SERIAL PRIMARY KEY,
    crop_id INTEGER NOT NULL,
    harvest_date DATE NOT NULL,
    quantity_kg DECIMAL(10, 2),
    quality_grade VARCHAR(50),
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (crop_id) REFERENCES crops(id) ON DELETE CASCADE
);

-- Production records table
CREATE TABLE IF NOT EXISTS production_records (
    id SERIAL PRIMARY KEY,
    farmer_id INTEGER NOT NULL,
    crop_name VARCHAR(255) NOT NULL,
    season VARCHAR(255),
    quantity_harvested DECIMAL(12, 2) NOT NULL,
    estimated_value DECIMAL(14, 2),
    recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (farmer_id) REFERENCES farmers(id) ON DELETE CASCADE
);

-- Credit score history table
CREATE TABLE IF NOT EXISTS credit_scores (
    id SERIAL PRIMARY KEY,
    farmer_id INTEGER REFERENCES farmers(id) ON DELETE CASCADE,
    score INTEGER NOT NULL,
    rating VARCHAR(50),
    calculated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Digital subsidy voucher table
CREATE TABLE IF NOT EXISTS subsidy_vouchers (
    id SERIAL PRIMARY KEY,
    farmer_id INTEGER REFERENCES farmers(id) ON DELETE CASCADE,
    voucher_code VARCHAR(100) UNIQUE NOT NULL,
    subsidy_type VARCHAR(100) NOT NULL,
    amount NUMERIC(12, 2) NOT NULL,
    status VARCHAR(30) DEFAULT 'issued',
    issued_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    redeemed_at TIMESTAMP
);

-- Inventory table
CREATE TABLE IF NOT EXISTS inventory (
    id SERIAL PRIMARY KEY,
    farm_id INTEGER NOT NULL,
    product_name VARCHAR(255) NOT NULL,
    quantity DECIMAL(10, 2),
    unit VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (farm_id) REFERENCES farms(id) ON DELETE CASCADE
);

-- Market prices table
CREATE TABLE IF NOT EXISTS market_prices (
    id SERIAL PRIMARY KEY,
    product_name VARCHAR(255) NOT NULL,
    price_per_unit DECIMAL(10, 2),
    currency VARCHAR(10) DEFAULT 'USD',
    market_location VARCHAR(255),
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
`;

// Function to initialize database
async function initializeDatabase() {
    const client = await pool.connect();
    
    try {
        console.log('Testing database connection...');
        
        // Test query
        const result = await client.query('SELECT NOW()');
        console.log('✓ Database connection successful!');
        console.log('  Current database time:', result.rows[0].now);
        
        console.log('\nCreating tables...');
        await client.query(initSQL);
        console.log('✓ All tables created successfully!');
        
        // Show table list
        const tables = await client.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public'
            ORDER BY table_name;
        `);
        
        console.log('\nCreated tables:');
        tables.rows.forEach(row => {
            console.log(`  - ${row.table_name}`);
        });
        
    } catch (error) {
        console.error('✗ Error:', error.message);
        process.exit(1);
    } finally {
        client.release();
        await pool.end();
    }
}

// Run initialization
initializeDatabase().then(() => {
    console.log('\n✓ Database initialization complete!');
    process.exit(0);
}).catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});
