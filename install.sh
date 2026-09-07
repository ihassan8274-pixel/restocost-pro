#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

command -v node >/dev/null || { echo "Node.js 18+ is required"; exit 1; }
command -v npm >/dev/null || { echo "npm is required"; exit 1; }
command -v docker >/dev/null || { echo "Docker is required for local PostgreSQL"; exit 1; }

[ -f .env ] || cp .env.example .env
npm install

echo "Starting PostgreSQL..."
docker compose up -d postgres
sleep 3
npm run db:migrate

if [ "${SEED_RESTOCOST:-false}" = "true" ]; then
  npm run db:seed
fi

echo "Installation complete. Run ./start.sh and open http://127.0.0.1:3031"
