require("./config/env");
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
-- ============================================================
-- UNIFIED USERS TABLE (Single source of truth for auth)
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(255),
    email VARCHAR(255) UNIQUE,
    phone VARCHAR(20) UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'farmer',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Ensure legacy DBs get the column if missing
ALTER TABLE users
ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255);

ALTER TABLE users
ADD COLUMN IF NOT EXISTS username VARCHAR(255);
-- ============================================================
-- FARMERS TABLE (Profile data for farmer role)
-- ============================================================
CREATE TABLE IF NOT EXISTS farmers (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
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
    role VARCHAR(50) DEFAULT 'farmer',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE farmers
ADD COLUMN IF NOT EXISTS role VARCHAR(50) DEFAULT 'farmer';

ALTER TABLE farmers
ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE CASCADE;

-- ============================================================
-- ADMINS TABLE (Profile data for admin role)
-- ============================================================
CREATE TABLE IF NOT EXISTS admins (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    full_name VARCHAR(150) NOT NULL,
    email VARCHAR(150) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE admins
ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE CASCADE;

-- ============================================================
-- BUYERS TABLE (Profile data for buyer role)
-- ============================================================
CREATE TABLE IF NOT EXISTS buyers (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    full_name VARCHAR(255) NOT NULL,
    phone VARCHAR(20) NOT NULL,
    email VARCHAR(255),
    region VARCHAR(255),
    district VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- TRANSPORTERS TABLE (Profile data for transporter role)
-- ============================================================
CREATE TABLE IF NOT EXISTS transporters (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    full_name VARCHAR(150) NOT NULL,
    phone VARCHAR(20) UNIQUE NOT NULL,
    vehicle_type VARCHAR(50) NOT NULL,
    plate_number VARCHAR(30) UNIQUE NOT NULL,
    operating_region VARCHAR(100) NOT NULL,
    capacity_kg NUMERIC(12,2),
    status VARCHAR(30) DEFAULT 'available',
    password_hash VARCHAR(255),
    role VARCHAR(50) DEFAULT 'transporter',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE transporters
ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE transporters
ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255);

ALTER TABLE transporters
ADD COLUMN IF NOT EXISTS role VARCHAR(50) DEFAULT 'transporter';

ALTER TABLE transporters
ADD COLUMN IF NOT EXISTS full_name VARCHAR(150),
ADD COLUMN IF NOT EXISTS phone VARCHAR(20),
ADD COLUMN IF NOT EXISTS vehicle_type VARCHAR(50),
ADD COLUMN IF NOT EXISTS plate_number VARCHAR(30),
ADD COLUMN IF NOT EXISTS operating_region VARCHAR(100),
ADD COLUMN IF NOT EXISTS capacity_kg NUMERIC(12,2),
ADD COLUMN IF NOT EXISTS status VARCHAR(30) DEFAULT 'available',
ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

CREATE UNIQUE INDEX IF NOT EXISTS transporters_phone_unique
ON transporters (phone);

CREATE UNIQUE INDEX IF NOT EXISTS transporters_plate_number_unique
ON transporters (plate_number);

-- ============================================================
-- FARMS TABLE
-- ============================================================
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

-- ============================================================
-- CROPS TABLE
-- ============================================================
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

-- ============================================================
-- HARVEST RECORDS TABLE
-- ============================================================
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

-- ============================================================
-- PRODUCTION RECORDS TABLE
-- ============================================================
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

-- ============================================================
-- CREDIT SCORE HISTORY TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS credit_scores (
    id SERIAL PRIMARY KEY,
    farmer_id INTEGER REFERENCES farmers(id) ON DELETE CASCADE,
    score INTEGER NOT NULL,
    rating VARCHAR(50),
    calculated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- DIGITAL SUBSIDY VOUCHER TABLE
-- ============================================================
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

-- ============================================================
-- INVENTORY TABLE
-- ============================================================
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

-- ============================================================
-- MARKET PRICES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS market_prices (
    id SERIAL PRIMARY KEY,
    product_name VARCHAR(255) NOT NULL,
    price_per_unit DECIMAL(10, 2),
    currency VARCHAR(10) DEFAULT 'USD',
    market_location VARCHAR(255),
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- PRODUCE LISTINGS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS produce_listings (
    id SERIAL PRIMARY KEY,
    farmer_id INTEGER REFERENCES farmers(id) ON DELETE CASCADE,
    crop_name VARCHAR(100) NOT NULL,
    quantity_available NUMERIC(12,2) NOT NULL,
    reserved_quantity NUMERIC(12,2) NOT NULL DEFAULT 0,
    price_per_unit NUMERIC(12,2) NOT NULL,
    unit VARCHAR(20) NOT NULL,
    location VARCHAR(100),
    status VARCHAR(30) DEFAULT 'available',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- MARKET ORDERS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS market_orders (
    id SERIAL PRIMARY KEY,
    listing_id INTEGER REFERENCES produce_listings(id) ON DELETE CASCADE,
    buyer_id INTEGER REFERENCES buyers(id) ON DELETE SET NULL,
    buyer_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    buyer_name VARCHAR(150) NOT NULL,
    buyer_phone VARCHAR(20) NOT NULL,
    quantity_requested NUMERIC(12,2) NOT NULL,
    total_price NUMERIC(12,2) NOT NULL,
    payment_method VARCHAR(50) NOT NULL DEFAULT 'MOBILE_MONEY',
    payment_status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
    payment_terms TEXT,
    status VARCHAR(30) DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE produce_listings
ADD COLUMN IF NOT EXISTS reserved_quantity NUMERIC(12,2) NOT NULL DEFAULT 0;

ALTER TABLE market_orders
ADD COLUMN IF NOT EXISTS buyer_id INTEGER REFERENCES buyers(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS buyer_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50) NOT NULL DEFAULT 'MOBILE_MONEY',
ADD COLUMN IF NOT EXISTS payment_status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
ADD COLUMN IF NOT EXISTS payment_terms TEXT;

CREATE INDEX IF NOT EXISTS market_orders_buyer_id_idx
ON market_orders (buyer_id);

CREATE INDEX IF NOT EXISTS market_orders_buyer_user_id_idx
ON market_orders (buyer_user_id);

-- ============================================================
-- DELIVERIES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS deliveries (
    id SERIAL PRIMARY KEY,
    order_id INTEGER REFERENCES market_orders(id) ON DELETE CASCADE,
    transporter_id INTEGER REFERENCES transporters(id) ON DELETE CASCADE,
    delivery_status VARCHAR(30) DEFAULT 'assigned',
    assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    accepted_at TIMESTAMP,
    picked_up_at TIMESTAMP,
    in_transit_at TIMESTAMP,
    delivered_at TIMESTAMP
);

ALTER TABLE deliveries
ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS picked_up_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS in_transit_at TIMESTAMP;

-- ============================================================
-- NOTIFICATIONS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS notifications (
    id SERIAL PRIMARY KEY,
    farmer_id INTEGER REFERENCES farmers(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    order_id INTEGER REFERENCES market_orders(id) ON DELETE CASCADE,
    event_type VARCHAR(100),
    recipient_role VARCHAR(50),
    message TEXT NOT NULL,
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE notifications
ADD COLUMN IF NOT EXISTS farmer_id INTEGER REFERENCES farmers(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS order_id INTEGER REFERENCES market_orders(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS event_type VARCHAR(100),
ADD COLUMN IF NOT EXISTS recipient_role VARCHAR(50),
ADD COLUMN IF NOT EXISTS message TEXT,
ADD COLUMN IF NOT EXISTS is_read BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX IF NOT EXISTS notifications_user_id_idx
ON notifications (user_id);

CREATE INDEX IF NOT EXISTS notifications_order_id_idx
ON notifications (order_id);

CREATE UNIQUE INDEX IF NOT EXISTS notifications_farmer_order_event_unique
ON notifications (farmer_id, order_id, event_type)
WHERE farmer_id IS NOT NULL
AND order_id IS NOT NULL
AND event_type IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS notifications_user_order_event_unique
ON notifications (user_id, order_id, event_type)
WHERE user_id IS NOT NULL
AND order_id IS NOT NULL
AND event_type IS NOT NULL;

CREATE INDEX IF NOT EXISTS production_records_farmer_id_idx
ON production_records (farmer_id);

CREATE INDEX IF NOT EXISTS produce_listings_farmer_status_idx
ON produce_listings (farmer_id, status);

CREATE INDEX IF NOT EXISTS produce_listings_status_created_idx
ON produce_listings (status, created_at DESC);

CREATE INDEX IF NOT EXISTS deliveries_transporter_status_idx
ON deliveries (transporter_id, delivery_status);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'production_records_quantity_positive'
    ) THEN
        ALTER TABLE production_records
        ADD CONSTRAINT production_records_quantity_positive
        CHECK (quantity_harvested > 0);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'production_records_estimated_value_positive'
    ) THEN
        ALTER TABLE production_records
        ADD CONSTRAINT production_records_estimated_value_positive
        CHECK (estimated_value IS NULL OR estimated_value > 0);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'produce_listings_quantity_positive'
    ) THEN
        ALTER TABLE produce_listings
        ADD CONSTRAINT produce_listings_quantity_positive
        CHECK (quantity_available >= 0);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'produce_listings_reserved_quantity_positive'
    ) THEN
        ALTER TABLE produce_listings
        ADD CONSTRAINT produce_listings_reserved_quantity_positive
        CHECK (reserved_quantity >= 0);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'produce_listings_price_positive'
    ) THEN
        ALTER TABLE produce_listings
        ADD CONSTRAINT produce_listings_price_positive
        CHECK (price_per_unit > 0);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'produce_listings_status_valid'
    ) THEN
        ALTER TABLE produce_listings
        ADD CONSTRAINT produce_listings_status_valid
        CHECK (status IN ('available', 'sold', 'inactive'));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'market_orders_quantity_positive'
    ) THEN
        ALTER TABLE market_orders
        ADD CONSTRAINT market_orders_quantity_positive
        CHECK (quantity_requested > 0);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'market_orders_total_price_positive'
    ) THEN
        ALTER TABLE market_orders
        ADD CONSTRAINT market_orders_total_price_positive
        CHECK (total_price > 0);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'market_orders_status_valid'
    ) THEN
        ALTER TABLE market_orders
        ADD CONSTRAINT market_orders_status_valid
        CHECK (status IN ('pending', 'confirmed', 'rejected'));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'market_orders_payment_method_valid'
    ) THEN
        ALTER TABLE market_orders
        ADD CONSTRAINT market_orders_payment_method_valid
        CHECK (payment_method IN ('MOBILE_MONEY', 'CASH_ON_DELIVERY', 'BANK_TRANSFER'));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'market_orders_payment_status_valid'
    ) THEN
        ALTER TABLE market_orders
        ADD CONSTRAINT market_orders_payment_status_valid
        CHECK (payment_status IN ('PENDING', 'AGREED', 'PAID', 'FAILED', 'CANCELLED'));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'deliveries_status_valid'
    ) THEN
        ALTER TABLE deliveries
        ADD CONSTRAINT deliveries_status_valid
        CHECK (delivery_status IN ('assigned', 'accepted', 'picked_up', 'in_transit', 'delivered'));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'subsidy_vouchers_amount_positive'
    ) THEN
        ALTER TABLE subsidy_vouchers
        ADD CONSTRAINT subsidy_vouchers_amount_positive
        CHECK (amount > 0);
    END IF;
END $$;
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
