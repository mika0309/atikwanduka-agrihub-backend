-- Migration: Add password_hash columns if missing
-- Run this using psql or your DB client connected to the project database.

-- 1) Ensure `users` table has `password_hash`
ALTER TABLE users
ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255);

-- 2) Ensure `transporters` has `password_hash`
ALTER TABLE transporters
ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255);

-- 3) Ensure `admins` has `password_hash`
ALTER TABLE admins
ADD COLUMN IF NOT EXISTS password_hash TEXT;

-- OPTIONAL: Backfill `users.password_hash` from role-specific tables when safe
-- WARNING: Only run if you understand the mapping and data is hashed already.
-- Example backfill using phone matching (runs only where users.password_hash is NULL):
-- UPDATE users u
-- SET password_hash = f.password
-- FROM farmers f
-- WHERE u.phone IS NOT NULL AND f.phone = u.phone AND u.password_hash IS NULL AND f.password IS NOT NULL;

-- You can adapt the backfill above for transporters or admins similarly.
