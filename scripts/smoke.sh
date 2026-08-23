#!/usr/bin/env sh
set -eu

api_url="${COURTLOAD_SMOKE_API_URL:-http://localhost:8000}"
dashboard_url="${COURTLOAD_SMOKE_DASHBOARD_URL:-http://localhost:${COURTLOAD_DASHBOARD_PORT:-3000}}"

curl --fail --silent --show-error "$api_url/api/health" >/dev/null
curl --fail --silent --show-error "$api_url/api/data-status" >/dev/null
curl --fail --silent --show-error "$api_url/api/methodology" >/dev/null
curl --fail --silent --show-error "$dashboard_url" >/dev/null
curl --fail --silent --show-error "$dashboard_url/data-status" >/dev/null

printf 'CourtLoad smoke checks passed\n'
