#!/usr/bin/env sh
# Deploy via NAS SMB share + SSH (Git Bash). Same flow as Explorer \\NAS\docker\homebase.
#
# Default (fast / dev): pull + docker compose + migrate + health.
# No mcp:smoke, no smoke purge.
#
#   ./scripts/deploy-nas.sh
#   ./scripts/deploy-nas.sh --full     # smoke + purge (release gate)
#   ./scripts/deploy-nas.sh --push
#   ./scripts/deploy-nas.sh --scp      # fallback without share
#   ./scripts/deploy-nas.sh --full --skip-smoke   # purge only (no smoke)
#
# Set HOMEBASE_SMOKE_KEEP_DATA=1 to skip purge when --full.

set -eu

NAS_HOST="${NAS_HOST:-192.168.1.142}"
NAS_USER="${NAS_USER:-wim}"
NAS_PATH="${NAS_PATH:-/volume1/docker/homebase}"
NAS_SHARE="${NAS_SHARE:-//192.168.1.142/docker/homebase}"
NAS_BRANCH="${NAS_BRANCH:-main}"
NAS_SSH_PORT="${NAS_SSH_PORT:-22}"
PUSH=0
USE_SCP=0
FULL=0
SKIP_SMOKE=0

for arg in "$@"; do
  case "$arg" in
    --push) PUSH=1 ;;
    --scp) USE_SCP=1 ;;
    --full) FULL=1 ;;
    --skip-smoke) SKIP_SMOKE=1 ;;
    -h|--help)
      echo "Usage: $0 [--full] [--push] [--scp] [--skip-smoke]"
      echo "  Default: fast deploy (no smoke/purge)."
      echo "  --full: release gate (smoke + purge)."
      echo "Env: NAS_HOST NAS_USER NAS_PATH NAS_SHARE NAS_BRANCH NAS_SSH_PORT"
      echo "     HOMEBASE_SMOKE_KEEP_DATA=1 skips purge"
      exit 0
      ;;
    *)
      echo "Unknown option: $arg" >&2
      exit 1
      ;;
  esac
done

ROOT="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"

if [ -f "$ROOT/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  . "$ROOT/.env"
  set +a
fi

REMOTE="${NAS_USER}@${NAS_HOST}"
DOCKER_CMD="set -eu && cd '$NAS_PATH' && echo '==> Building and restarting HomeBase...' && docker compose up --build -d && echo '==> Migrating shopping slots (T-035)...' && docker compose exec -T worker npx tsx scripts/migrate-shopping-slots.ts && echo '==> Migrating project work items (T-082)...' && docker compose exec -T worker npx tsx scripts/migrate-project-work-items.ts && echo '==> Applying database schema (prisma db push)...' && docker compose exec -T worker npx prisma db push --accept-data-loss && echo '==> Ensuring product name index...' && docker compose exec -T worker npx tsx scripts/ensure-product-ci-index.ts && docker compose logs --tail=30 && sleep 2 && echo '==> Health check...' && curl -sf http://127.0.0.1:3000/health"

RUN_SMOKE=0
RUN_PURGE=0
if [ "$FULL" -eq 1 ]; then
  RUN_PURGE=1
  if [ "$SKIP_SMOKE" -eq 0 ]; then
    RUN_SMOKE=1
  fi
  echo "Deploy mode: FULL (smoke=$RUN_SMOKE, purge=$RUN_PURGE)"
else
  echo "Deploy mode: FAST (no mcp:smoke). Use --full for the release gate."
fi

shell_quote() {
  # Single-quote for remote sh.
  printf "%s" "$1" | sed "s/'/'\\\\''/g; s/^/'/; s/$/'/"
}

load_mcp_creds_from_app() {
  # KEY=value lines from running app (do not use bare printenv A B).
  CREDS="$(ssh -p "$NAS_SSH_PORT" "$REMOTE" "set -eu && cd '$NAS_PATH' && docker compose exec -T app env | grep -E '^(SERVICE_TOKEN|MCP_HOUSEHOLD_ID)='")" || return 1
  SERVICE_TOKEN="$(printf '%s\n' "$CREDS" | sed -n 's/^SERVICE_TOKEN=//p' | head -n1 | tr -d '\r')"
  MCP_HOUSEHOLD_ID="$(printf '%s\n' "$CREDS" | sed -n 's/^MCP_HOUSEHOLD_ID=//p' | head -n1 | tr -d '\r')"
  # Note: tr -d '\r' with single-quoted \r (carriage return), not "\r" (busybox may strip letter r).
  if [ -z "${SERVICE_TOKEN:-}" ] || [ -z "${MCP_HOUSEHOLD_ID:-}" ]; then
    return 1
  fi
  export SERVICE_TOKEN MCP_HOUSEHOLD_ID
  echo "MCP credentials loaded from app (token length ${#SERVICE_TOKEN}, household length ${#MCP_HOUSEHOLD_ID})"
}

nas_smoke_purge() {
  label="$1"
  if [ "${HOMEBASE_SMOKE_KEEP_DATA:-}" = "1" ]; then
    echo "Skipping NAS smoke purge ($label) — HOMEBASE_SMOKE_KEEP_DATA=1"
    return 0
  fi
  if [ -z "${MCP_HOUSEHOLD_ID:-}" ]; then
    echo "NAS smoke purge ($label) requires MCP_HOUSEHOLD_ID" >&2
    exit 1
  fi
  hh_q="$(shell_quote "$MCP_HOUSEHOLD_ID")"
  echo "NAS smoke purge ($label) via SSH $REMOTE ..."
  ssh -p "$NAS_SSH_PORT" "$REMOTE" \
    "set -eu && cd '$NAS_PATH' && docker compose exec -T -e MCP_HOUSEHOLD_ID=$hh_q worker npx tsx scripts/purge-smoke-data.ts --apply"
  echo "NAS smoke purge ($label) OK."
}

if [ "$PUSH" -eq 1 ]; then
  echo "Pushing $NAS_BRANCH to origin from $ROOT ..."
  git -C "$ROOT" push origin "$NAS_BRANCH"
fi

if [ "$USE_SCP" -eq 1 ]; then
  LOCAL_TAR="$(mktemp /tmp/homebase-deploy.XXXXXX.tar.gz)"
  trap 'rm -f "$LOCAL_TAR"' EXIT
  REMOTE_TAR="/tmp/homebase-deploy.tar.gz"
  git -C "$ROOT" archive --format=tar.gz -o "$LOCAL_TAR" "$NAS_BRANCH"
  scp -P "$NAS_SSH_PORT" "$LOCAL_TAR" "${REMOTE}:${REMOTE_TAR}"
  ssh -p "$NAS_SSH_PORT" "$REMOTE" "set -eu && mkdir -p '$NAS_PATH' && cd '$NAS_PATH' && tar xzf '$REMOTE_TAR' && rm -f '$REMOTE_TAR' && echo '==> Building and restarting HomeBase...' && docker compose up --build -d && echo '==> Migrating shopping slots (T-035)...' && docker compose exec -T worker npx tsx scripts/migrate-shopping-slots.ts && echo '==> Migrating project work items (T-082)...' && docker compose exec -T worker npx tsx scripts/migrate-project-work-items.ts && echo '==> Applying database schema (prisma db push)...' && docker compose exec -T worker npx prisma db push --accept-data-loss && echo '==> Ensuring product name index...' && docker compose exec -T worker npx tsx scripts/ensure-product-ci-index.ts && docker compose logs --tail=30 && sleep 2 && echo '==> Health check...' && curl -sf http://127.0.0.1:3000/health"
else
  if [ ! -d "$NAS_SHARE/.git" ]; then
    echo "No git repo at $NAS_SHARE — open the share in Explorer or use --scp." >&2
    exit 1
  fi
  echo "Pulling $NAS_BRANCH on NAS share $NAS_SHARE ..."
  dirty="$(git -C "$NAS_SHARE" status --porcelain || true)"
  if [ -n "$dirty" ]; then
    echo "NAS share has local modifications (will block pull):" >&2
    git -C "$NAS_SHARE" status --short >&2
    echo "" >&2
    echo "Deploy aborted. Review files on $NAS_SHARE, then commit/stash/discard manually." >&2
    exit 1
  fi
  git -C "$NAS_SHARE" fetch origin "$NAS_BRANCH"
  git -C "$NAS_SHARE" checkout "$NAS_BRANCH"
  git -C "$NAS_SHARE" pull --ff-only origin "$NAS_BRANCH"
  echo "Building on NAS (${REMOTE}:${NAS_PATH})..."
  ssh -p "$NAS_SSH_PORT" "$REMOTE" "$DOCKER_CMD"
fi

if [ "$RUN_PURGE" -eq 0 ] && [ "$RUN_SMOKE" -eq 0 ]; then
  echo "Skipping MCP smoke and purge (fast deploy). Use --full before trusting a release."
elif load_mcp_creds_from_app; then
  nas_smoke_purge "pre-smoke"
  if [ "$RUN_SMOKE" -eq 1 ]; then
    if command -v npm >/dev/null 2>&1; then
      echo "Post-deploy MCP smoke (http://${NAS_HOST}:3000)..."
      export MCP_BASE_URL="http://${NAS_HOST}:3000"
      export HOMEBASE_SMOKE_SKIP_DOTENV=1
      export NAS_HOST NAS_USER NAS_PATH NAS_SSH_PORT
      smoke_rc=0
      (cd "$ROOT" && npm run mcp:smoke) || smoke_rc=$?
      nas_smoke_purge "post-smoke"
      if [ "$smoke_rc" -ne 0 ]; then
        echo "Post-deploy mcp:smoke failed." >&2
        exit "$smoke_rc"
      fi
      echo "Post-deploy MCP smoke OK."
    else
      echo "npm not found — skipping mcp:smoke; ran pre-smoke purge only."
    fi
  else
    echo "Skipping post-deploy MCP smoke (--skip-smoke); pre-smoke purge already ran."
  fi
else
  echo "Warning: could not load SERVICE_TOKEN / MCP_HOUSEHOLD_ID from app — skipping smoke and purge." >&2
fi

echo ""
echo "Deploy finished. App: http://${NAS_HOST}:3000/"
