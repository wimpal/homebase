#!/bin/sh
# Homebase NAS backup — run on the NAS (cron or UGOS scheduled task).
#
# Backs up:
#   - Postgres database (pg_dump -Fc, online — no downtime)
#   - uploads Docker volume (photos, plant/project images)
#
# Destination is off the live compose tree. Retention: 30 daily files (override RETENTION_DAYS).
#
# Usage:
#   ./scripts/backup-nas.sh
#
# Env overrides:
#   DEST, COMPOSE_DIR, COMPOSE_PROJECT_NAME, RETENTION_DAYS, POSTGRES_USER, POSTGRES_DB

set -eu

DEST="${DEST:-/volume1/Docker-backups/homebase}"
COMPOSE_DIR="${COMPOSE_DIR:-/volume1/docker/homebase}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
POSTGRES_USER="${POSTGRES_USER:-homebase}"
POSTGRES_DB="${POSTGRES_DB:-homebase}"

resolve_uploads_volume() {
  PROJECT="${COMPOSE_PROJECT_NAME:-$(basename "$COMPOSE_DIR")}"
  CANDIDATE="${PROJECT}_uploads_data"

  if docker volume inspect "$CANDIDATE" >/dev/null 2>&1; then
    echo "$CANDIDATE"
    return 0
  fi

  FOUND="$(docker volume ls -q | grep "${PROJECT}_.*uploads_data$" | head -1)"
  if [ -n "$FOUND" ]; then
    echo "$FOUND"
    return 0
  fi

  FOUND="$(docker volume ls -q | grep uploads_data | head -1)"
  if [ -n "$FOUND" ]; then
    echo "$FOUND"
    return 0
  fi

  return 1
}

STAMP="$(date +%Y-%m-%d)"
DUMP_FILE="$DEST/postgres-$STAMP.dump"
UPLOADS_FILE="$DEST/uploads-$STAMP.tar.gz"

cd "$COMPOSE_DIR"
mkdir -p "$DEST"

echo "==> Homebase backup ($STAMP)"
echo "    compose: $COMPOSE_DIR"
echo "    dest:    $DEST"

echo "==> Postgres dump..."
docker compose exec -T postgres pg_dump -U "$POSTGRES_USER" -Fc "$POSTGRES_DB" >"$DUMP_FILE"

if [ ! -s "$DUMP_FILE" ]; then
  echo "ERROR: dump file missing or empty: $DUMP_FILE" >&2
  exit 1
fi

echo "==> Uploads archive..."
if ! UPLOADS_VOL="$(resolve_uploads_volume)"; then
  echo "ERROR: could not find uploads_data volume (run: docker volume ls | grep uploads)" >&2
  exit 1
fi
echo "    volume: $UPLOADS_VOL"

docker run --rm \
  -v "${UPLOADS_VOL}:/data:ro" \
  -v "$DEST:/backup" \
  alpine:3.20 tar czf "/backup/uploads-$STAMP.tar.gz" -C /data .

if [ ! -s "$UPLOADS_FILE" ]; then
  echo "ERROR: uploads archive missing or empty: $UPLOADS_FILE" >&2
  exit 1
fi

echo "==> Pruning backups older than ${RETENTION_DAYS} days..."
find "$DEST" -maxdepth 1 -type f \( -name 'postgres-*.dump' -o -name 'uploads-*.tar.gz' \) -mtime +"$RETENTION_DAYS" -delete

DUMP_SIZE="$(du -h "$DUMP_FILE" | cut -f1)"
UPLOADS_SIZE="$(du -h "$UPLOADS_FILE" | cut -f1)"
echo "==> Done."
echo "    $DUMP_FILE ($DUMP_SIZE)"
echo "    $UPLOADS_FILE ($UPLOADS_SIZE)"
