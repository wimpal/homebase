#!/usr/bin/env bash
# Run on the NAS after pulling new code: ./scripts/deploy.sh
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> Building and restarting HomeBase..."
docker compose up -d --build

echo "==> Applying database schema..."
docker compose exec -T app npx prisma db push

echo "==> Done. App should be live at ${AUTH_URL:-http://localhost:3000}"
docker compose ps
