#!/usr/bin/env bash
# Run on the NAS after pulling new code: ./scripts/deploy.sh
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> Building and restarting HomeBase..."
docker compose up -d --build

echo "==> Applying database schema..."
# Use worker image — it has Prisma 6 CLI; app image does not (npx would fetch Prisma 7)
docker compose exec -T worker npx prisma db push

echo "==> Done. App should be live at ${AUTH_URL:-http://localhost:3000}"
docker compose ps
