@echo off
set DATABASE_URL=postgresql://restocost:restocost@127.0.0.1:5433/restocost2?connection_limit=20^&pool_timeout=10
node seed-pg.mjs