#!/usr/bin/env bash
# Run on the NAS after pulling new code: ./scripts/deploy.sh
#
# Rebuild + migrate only — does NOT run mcp:smoke or smoke purge.
# Prefer deploy from your PC: npm run deploy:nas (PowerShell) or ./scripts/deploy-nas.sh
# which purge mcp-smoke leftovers and optionally run post-deploy smoke.
# Manual purge: docker compose exec worker npx tsx scripts/purge-smoke-data.ts --apply
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> Building and restarting HomeBase..."
docker compose up -d --build

echo "==> Migrating shopping slots (T-035, safe to re-run)..."
docker compose exec -T worker npx tsx scripts/migrate-shopping-slots.ts

echo "==> Migrating project work items (T-082, safe to re-run)..."
docker compose exec -T worker npx tsx scripts/migrate-project-work-items.ts

echo "==> Applying database schema..."
# Use worker image — it has Prisma 6 CLI; app image does not (npx would fetch Prisma 7)
docker compose exec -T worker npx prisma db push --accept-data-loss

echo "==> Ensuring product name index..."
docker compose exec -T worker npx tsx scripts/ensure-product-ci-index.ts

echo "==> Done. App should be live at ${AUTH_URL:-http://localhost:3000}"
echo "    (No mcp:smoke here — use deploy:nas / deploy-nas.sh from a PC for smoke + purge.)"
docker compose ps
