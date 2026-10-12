#!/usr/bin/env bash
# Production-mode preview on this machine, beside the dev servers (no port clashes):
#   API       http://localhost:8001  uvicorn, no --reload, 2 workers, same database and artifacts
#   Dashboard http://localhost:3300  `next build` + `next start` (minified, no dev overlays)
# Usage: scripts/preview.sh            (make preview)
# Ctrl-C stops both. The build writes dashboard/.next; the dev server keeps using .next/dev.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
api_port="${PREVIEW_API_PORT:-8001}"
web_port="${PREVIEW_WEB_PORT:-3300}"
api_url="http://localhost:${api_port}"

export COURTLENS_CORS_ORIGINS="[\"http://localhost:${web_port}\"]"
cd "$root"
.venv/bin/uvicorn courtlens.api.app:create_app --factory --host 127.0.0.1 --port "$api_port" --workers 2 &
api_pid=$!
trap 'kill "$api_pid" 2>/dev/null || true' EXIT INT TERM

cd "$root/dashboard"
export COURTLENS_API_INTERNAL_URL="$api_url" NEXT_PUBLIC_COURTLENS_API_URL="$api_url"
npm run build
echo "Preview: http://localhost:${web_port}/stats (API ${api_url})"
npx next start -p "$web_port"
