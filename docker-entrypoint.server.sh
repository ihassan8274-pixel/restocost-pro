#!/bin/sh
# ============================================================
# docker-entrypoint.server.sh — migrate, then serve
# ============================================================
# WHY THIS EXISTS
# ---------------
# Nothing in the image or docker-compose.yml ever created the schema. The
# migrations themselves exist (`prisma/migrations/20260918152758_init`), but no
# step ran `migrate deploy`, so a fresh PostgreSQL container came up with ZERO
# tables. The server then:
#   * booted "successfully" (every boot query in createPgStore was wrapped in
#     `catch { /* tolerate */ }`),
#   * reported /api/health {"ok":true,"db":"ok","backend":"postgresql"} —
#     because its probe was only `SELECT 1`, which succeeds against an empty
#     database,
#   * and silently discarded every write with P2021
#     "The table public.kv does not exist".
# That is silent data loss behind a green health check.
#
# The app must not accept traffic until the schema exists, so a migration
# failure aborts the boot instead of continuing.
#
# Retries because PostgreSQL may still be starting (its own healthcheck gates
# compose, but `restart: unless-stopped` and non-compose runs do not).
set -e

if [ -z "$DATABASE_URL" ]; then
  echo "[entrypoint] DATABASE_URL is not set - SQLite mode, nothing to migrate."
  exec node server/dist/index.js
fi

echo "[entrypoint] DATABASE_URL is set - applying migrations before startup."
attempt=1
max=6
while [ "$attempt" -le "$max" ]; do
  if npx prisma migrate deploy; then
    echo "[entrypoint] migrations OK"
    exec node server/dist/index.js
  fi
  echo "[entrypoint] migrate deploy failed (attempt $attempt/$max) - retrying in 3s"
  attempt=$((attempt + 1))
  if [ "$attempt" -gt "$max" ]; then
    echo "[entrypoint] FATAL: migrations failed after $max attempts - refusing to start." >&2
    exit 1
  fi
  sleep 3
done
