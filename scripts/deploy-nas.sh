#!/usr/bin/env sh
# Deploy via NAS SMB share + SSH (Git Bash). Same flow as Explorer \\NAS\docker\homebase.
#
#   ./scripts/deploy-nas.sh
#   ./scripts/deploy-nas.sh --push
#   ./scripts/deploy-nas.sh --scp    # fallback without share

set -eu

NAS_HOST="${NAS_HOST:-192.168.0.170}"
NAS_USER="${NAS_USER:-wim}"
NAS_PATH="${NAS_PATH:-/volume1/docker/homebase}"
NAS_SHARE="${NAS_SHARE:-//192.168.0.170/docker/homebase}"
NAS_BRANCH="${NAS_BRANCH:-main}"
NAS_SSH_PORT="${NAS_SSH_PORT:-22}"
PUSH=0
USE_SCP=0

for arg in "$@"; do
  case "$arg" in
    --push) PUSH=1 ;;
    --scp) USE_SCP=1 ;;
    -h|--help)
      echo "Usage: $0 [--push] [--scp]"
      echo "Env: NAS_HOST NAS_USER NAS_PATH NAS_SHARE NAS_BRANCH NAS_SSH_PORT"
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
DOCKER_CMD="set -eu && cd '$NAS_PATH' && sudo docker compose up --build -d && sudo docker compose exec -T worker npx prisma db push && sudo docker compose logs --tail=30 && sleep 2 && curl -sf http://127.0.0.1:3000/health"

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
  ssh -p "$NAS_SSH_PORT" -t "$REMOTE" "set -eu && mkdir -p '$NAS_PATH' && cd '$NAS_PATH' && tar xzf '$REMOTE_TAR' && rm -f '$REMOTE_TAR' && sudo docker compose up --build -d && sudo docker compose exec -T worker npx prisma db push && sudo docker compose logs --tail=30 && sleep 2 && curl -sf http://127.0.0.1:3000/health"
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
  ssh -p "$NAS_SSH_PORT" -t "$REMOTE" "$DOCKER_CMD"
fi

echo ""
echo "Deploy finished. App: http://${NAS_HOST}:3000/"
