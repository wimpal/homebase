#!/bin/sh
# Homebase restore drill — non-production verification of backup files.
#
# Restores a dated backup into an isolated docker-compose.drill.yml stack on port 13000.
# Never touches production homebase_postgres_data or homebase_uploads_data.
#
# Usage:
#   ./scripts/restore-drill.sh 2026-08-28
#   ./scripts/restore-drill.sh /volume1/Docker-backups/homebase/postgres-2026-08-28.dump
#
# After spot-check on http://<NAS-IP>:13000, tear down:
#   docker compose -p homebase-drill -f docker-compose.drill.yml down -v

set -eu

DEST="${DEST:-/volume1/Docker-backups/homebase}"
COMPOSE_DIR="${COMPOSE_DIR:-/volume1/docker/homebase}"
DRILL_PROJECT="${DRILL_PROJECT:-homebase-drill}"
DRILL_PORT="${DRILL_PORT:-13000}"
POSTGRES_USER="${POSTGRES_USER:-homebase}"
POSTGRES_DB="${POSTGRES_DB:-homebase}"
DRILL_COMPOSE="docker compose -p $DRILL_PROJECT -f docker-compose.drill.yml"

usage() {
  echo "Usage: $0 <YYYY-MM-DD | path-to-postgres.dump>" >&2
  echo "Env: DEST, COMPOSE_DIR, DRILL_PROJECT, DRILL_PORT" >&2
  exit 1
}

[ $# -eq 1 ] || usage

cd "$COMPOSE_DIR"

case "$1" in
  *-*-*)
    if [ -f "$1" ]; then
      DUMP_FILE="$1"
      STAMP="$(basename "$DUMP_FILE" | sed 's/^postgres-//; s/\.dump$//')"
    else
      STAMP="$1"
      DUMP_FILE="$DEST/postgres-$STAMP.dump"
    fi
    ;;
  *)
    usage
    ;;
esac

UPLOADS_FILE="$DEST/uploads-$STAMP.tar.gz"

if [ ! -s "$DUMP_FILE" ]; then
  echo "ERROR: dump not found or empty: $DUMP_FILE" >&2
  exit 1
fi

if [ ! -s "$UPLOADS_FILE" ]; then
  echo "ERROR: uploads archive not found or empty: $UPLOADS_FILE" >&2
  exit 1
fi

echo "==> Preflight: production health"
if ! curl -sf "http://127.0.0.1:3000/health" >/dev/null; then
  echo "WARNING: production /health on :3000 did not respond — continuing drill anyway" >&2
else
  echo "    production :3000/health OK"
fi

echo "==> Tearing down any previous drill stack..."
$DRILL_COMPOSE down -v 2>/dev/null || true

echo "==> Starting drill postgres + redis..."
$DRILL_COMPOSE up -d postgres redis

echo "==> Waiting for postgres..."
TRIES=0
until $DRILL_COMPOSE exec -T postgres pg_isready -U "$POSTGRES_USER" >/dev/null 2>&1; do
  TRIES=$((TRIES + 1))
  if [ "$TRIES" -gt 30 ]; then
    echo "ERROR: postgres did not become ready" >&2
    exit 1
  fi
  sleep 2
done

echo "==> Restoring database from $DUMP_FILE ..."
# Fresh volume: POSTGRES_DB exists but is empty; pg_restore into it.
cat "$DUMP_FILE" | $DRILL_COMPOSE exec -T postgres \
  pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --role="$POSTGRES_USER" --clean --if-exists

echo "==> Restoring uploads from $UPLOADS_FILE ..."
UPLOADS_VOL="${DRILL_PROJECT}_drill_uploads_data"
docker run --rm \
  -v "${UPLOADS_VOL}:/data" \
  -v "$DEST:/backup:ro" \
  alpine:3.20 sh -c "rm -rf /data/* /data/.[!.]* 2>/dev/null; tar xzf /backup/uploads-$STAMP.tar.gz -C /data"

echo "==> Starting drill app on port $DRILL_PORT ..."
$DRILL_COMPOSE up -d app

echo "==> Waiting for drill /health ..."
TRIES=0
until curl -sf "http://127.0.0.1:$DRILL_PORT/health" >/dev/null 2>&1; do
  TRIES=$((TRIES + 1))
  if [ "$TRIES" -gt 60 ]; then
    echo "ERROR: drill /health did not respond on :$DRILL_PORT" >&2
    $DRILL_COMPOSE logs --tail=40 app >&2 || true
    exit 1
  fi
  sleep 2
done

echo ""
echo "==> Drill stack is up."
curl -sf "http://127.0.0.1:$DRILL_PORT/health" || true
echo ""
echo ""
echo "Spot-check (manual):"
echo "  1. Note a known inventory item or shopping list entry on production (:3000)"
echo "  2. Open http://$(hostname -I 2>/dev/null | awk '{print $1}' || echo '<NAS-IP>'):$DRILL_PORT"
echo "  3. Log in with your production credentials and verify the same data"
echo ""
echo "When finished, tear down the drill stack (does not affect production):"
echo "  cd $COMPOSE_DIR"
echo "  $DRILL_COMPOSE down -v"
echo ""
echo "Record the drill outcome in docs/backup-restore.md (drill log table)."
