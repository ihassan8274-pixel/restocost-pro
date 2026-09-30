-- RestoCost Pro Database Initialization
-- This runs automatically when PostgreSQL container starts for the first time

-- Create extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create tables (if not using migrate.js)
-- Note: The actual schema is created by migrate.js
-- This file is for initial setup only

-- Set timezone
SET timezone = 'Asia/Riyadh';

-- Create a test user if needed (migrate.js handles this)
-- INSERT INTO users (username, password_hash, display_name, role, active)
-- VALUES ('admin', '$2b$10$...', 'Admin', 'admin', true)
-- ON CONFLICT (username) DO NOTHING;