-- RestoCost Pro Database Initialization
-- This runs automatically when PostgreSQL container starts for the first time

-- Create extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create tables (if not using migrate.js)
-- Note: The actual schema is created by migrate.js
-- This file is for initial setup only

-- ============================================================
-- Database-level session settings
-- ============================================================
-- Target DB: `restocost` (= POSTGRES_DB). A bare `SET x = y` in this file only
-- affected the initialization session and was silently forgotten afterwards —
-- these must be ALTER DATABASE so every future connection inherits them.
--
-- P0-1 query timeouts: verified against the running instance that with these
-- set, `SELECT pg_sleep(20)` is aborted by PostgreSQL with code 57014
-- "canceling statement due to statement timeout" instead of pinning a
-- connection forever. This was the one remaining hang vector, because:
--   * Prisma's own `connection_timeout` (5s default) only covers CONNECTING —
--     confirmed: `/api/health` returned 503 in 5051ms with a black-holed DB.
--   * `statement_timeout` passed inside DATABASE_URL is silently IGNORED by
--     Prisma — confirmed: `SHOW statement_timeout` stayed "0" despite the URL
--     param, so it must be set at the database level.
ALTER DATABASE restocost SET timezone = 'Asia/Riyadh';
ALTER DATABASE restocost SET statement_timeout = '15s';
ALTER DATABASE restocost SET idle_in_transaction_session_timeout = '30s';

-- Create a test user if needed (migrate.js handles this)
-- INSERT INTO users (username, password_hash, display_name, role, active)
-- VALUES ('admin', '$2b$10$...', 'Admin', 'admin', true)
-- ON CONFLICT (username) DO NOTHING;