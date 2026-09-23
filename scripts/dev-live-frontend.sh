#!/usr/bin/env sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
REPO_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)

DASHBOARD_HOST="${COURTLOAD_DASHBOARD_HOST:-127.0.0.1}"
DASHBOARD_PORT="${COURTLOAD_DASHBOARD_PORT:-3000}"
API_PORT="${COURTLOAD_API_PORT:-8000}"
PUBLIC_API_URL="${NEXT_PUBLIC_COURTLOAD_API_URL:-http://localhost:$API_PORT}"
INTERNAL_API_URL="${COURTLOAD_API_INTERNAL_URL:-http://127.0.0.1:$API_PORT}"

if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  echo "Error: Node.js and npm are required for the dashboard." >&2
  exit 1
fi

if [ ! -x "$REPO_ROOT/dashboard/node_modules/.bin/next" ]; then
  echo "Error: Dashboard dependencies are not installed." >&2
  echo "Run 'make install-dashboard' from $REPO_ROOT first." >&2
  exit 1
fi

port_is_available() {
  node - "$DASHBOARD_HOST" "$DASHBOARD_PORT" <<'JS'
const net = require("net");

const host = process.argv[2];
const port = Number.parseInt(process.argv[3], 10);
const probe = net.createServer();
probe.once("error", () => process.exit(1));
probe.once("listening", () => probe.close(() => process.exit(0)));
probe.listen(port, host);
JS
}

cd "$REPO_ROOT"

if command -v docker >/dev/null 2>&1 && \
  docker compose ps --status running --services 2>/dev/null | grep -qx 'dashboard'; then
  echo "Stopping the Compose dashboard so local reload mode can own port $DASHBOARD_PORT..."
  docker compose stop dashboard
fi

if ! port_is_available; then
  echo "Error: Dashboard port $DASHBOARD_PORT is already in use." >&2
  echo "Stop the existing process or choose an explicit COURTLOAD_DASHBOARD_PORT." >&2
  echo "Use the same value when starting the backend so CORS remains aligned." >&2
  exit 1
fi

echo "Starting CourtLoad dashboard reload mode at http://localhost:$DASHBOARD_PORT..."
echo "Browser API: $PUBLIC_API_URL"

export COURTLOAD_API_INTERNAL_URL="$INTERNAL_API_URL"
export NEXT_PUBLIC_COURTLOAD_API_URL="$PUBLIC_API_URL"
export NEXT_PUBLIC_DEMO_MODE="${NEXT_PUBLIC_DEMO_MODE:-true}"

exec npm --prefix "$REPO_ROOT/dashboard" run dev -- \
  --hostname "$DASHBOARD_HOST" \
  --port "$DASHBOARD_PORT"
