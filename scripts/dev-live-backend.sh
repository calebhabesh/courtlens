#!/usr/bin/env sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
REPO_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
VENV_DIR="${COURTLOAD_VENV_DIR:-$REPO_ROOT/.venv}"
PYTHON="$VENV_DIR/bin/python"
ALEMBIC="$VENV_DIR/bin/alembic"
COURTLOAD="$VENV_DIR/bin/courtload"
UVICORN="$VENV_DIR/bin/uvicorn"

if [ -f "$REPO_ROOT/.env" ]; then
  COURTLOAD_DASHBOARD_PORT="${COURTLOAD_DASHBOARD_PORT:-$(grep -E '^COURTLOAD_DASHBOARD_PORT=' "$REPO_ROOT/.env" | cut -d= -f2- | tr -d ' "\r')}"
  COURTLOAD_API_PORT="${COURTLOAD_API_PORT:-$(grep -E '^COURTLOAD_API_PORT=' "$REPO_ROOT/.env" | cut -d= -f2- | tr -d ' "\r')}"
  COURTLOAD_API_HOST="${COURTLOAD_API_HOST:-$(grep -E '^COURTLOAD_API_HOST=' "$REPO_ROOT/.env" | cut -d= -f2- | tr -d ' "\r')}"
  COURTLOAD_CORS_ORIGINS="${COURTLOAD_CORS_ORIGINS:-$(grep -E '^COURTLOAD_CORS_ORIGINS=' "$REPO_ROOT/.env" | cut -d= -f2- | tr -d '\r')}"
fi

API_HOST="${COURTLOAD_API_HOST:-127.0.0.1}"
API_PORT="${COURTLOAD_API_PORT:-8000}"
DASHBOARD_PORT="${COURTLOAD_DASHBOARD_PORT:-3000}"
SEED_MODE="${COURTLOAD_DEV_SEED_MODE:-if-missing}"

require_executable() {
  if [ ! -x "$1" ]; then
    echo "Error: Required executable not found: $1" >&2
    echo "Run 'make install' from $REPO_ROOT first." >&2
    exit 1
  fi
}

port_is_available() {
  "$PYTHON" - "$API_HOST" "$API_PORT" <<'PY'
import socket
import sys

host = sys.argv[1]
port = int(sys.argv[2])
family = socket.AF_INET6 if ":" in host else socket.AF_INET
with socket.socket(family, socket.SOCK_STREAM) as probe:
    probe.bind((host, port))
PY
}

demo_account_exists() {
  "$PYTHON" <<'PY'
from sqlalchemy import select

from courtload.database import SessionLocal
from courtload.demo import DEMO_EMAIL
from courtload.models import User

with SessionLocal() as session:
    account_id = session.scalar(select(User.id).where(User.email == DEMO_EMAIL))
raise SystemExit(0 if account_id is not None else 1)
PY
}

for executable in "$PYTHON" "$ALEMBIC" "$COURTLOAD" "$UVICORN"; do
  require_executable "$executable"
done

if ! command -v docker >/dev/null 2>&1; then
  echo "Error: Docker with Compose v2 is required for the local PostgreSQL service." >&2
  exit 1
fi

cd "$REPO_ROOT"

if docker compose ps --status running --services 2>/dev/null | grep -qx 'api'; then
  echo "Stopping the Compose API so local reload mode can own port $API_PORT..."
  docker compose stop api
fi

if ! port_is_available; then
  echo "Error: Backend port $API_PORT is already in use." >&2
  echo "Stop the existing process or set COURTLOAD_API_PORT for both dev helpers." >&2
  exit 1
fi

export COURTLOAD_ENVIRONMENT=development
export COURTLOAD_DATABASE_URL="${COURTLOAD_DATABASE_URL:-postgresql+psycopg://courtload:courtload@localhost:5432/courtload}"
export COURTLOAD_CORS_ORIGINS="${COURTLOAD_CORS_ORIGINS:-[\"http://localhost:$DASHBOARD_PORT\",\"http://127.0.0.1:$DASHBOARD_PORT\"]}"

echo "Starting the local PostgreSQL dependency..."
docker compose up -d --wait db

echo "Applying database migrations..."
"$ALEMBIC" upgrade head

case "$SEED_MODE" in
  if-missing)
    if demo_account_exists; then
      echo "Demo fixtures already exist; leaving the current development data intact."
    else
      echo "Loading demo fixtures into the empty development database..."
      "$COURTLOAD" seed-demo
    fi
    ;;
  always)
    echo "Refreshing demo fixtures without resetting the database..."
    "$COURTLOAD" seed-demo
    ;;
  never)
    echo "Skipping demo fixtures because COURTLOAD_DEV_SEED_MODE=never."
    ;;
  *)
    echo "Error: COURTLOAD_DEV_SEED_MODE must be if-missing, always, or never." >&2
    exit 1
    ;;
esac

echo "Starting CourtLoad API reload mode at http://localhost:$API_PORT..."
exec "$UVICORN" courtload.api.app:create_app \
  --factory \
  --reload \
  --reload-dir "$REPO_ROOT/src" \
  --host "$API_HOST" \
  --port "$API_PORT"
