#!/usr/bin/env bash
# Check the hosted demo's read-only boundary (deploy/Caddyfile) with the real Caddy image in front
# of stub upstreams: every allowed write reaches its upstream, every other write gets Caddy's 403.
# Usage: scripts/check_caddy_allowlist.sh [caddy-image]   (default: the pinned image)
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
image="${1:-$(sed -n 's/^COURTLENS_CADDY_IMAGE=//p' "$root/deploy/pinned.env")}"
run="courtlens-caddy-check-$$"
work="$(mktemp -d "${TMPDIR:-$HOME/.cache/courtlens-tmp}/caddy-check.XXXXXX")"
cleanup() {
  docker rm -f "$run-edge" "$run-stub" >/dev/null 2>&1 || true
  docker network rm "$run" >/dev/null 2>&1 || true
  rm -r -- "$work"
}
trap cleanup EXIT

cat >"$work/stub" <<'STUB'
{
	admin off
	auto_https off
}
:3000 {
	respond "dashboard {method} {path}" 200
}
:8000 {
	respond "api {method} {path}" 200
}
STUB

docker network create "$run" >/dev/null
docker run -d --name "$run-stub" --network "$run" --network-alias dashboard --network-alias api \
  -v "$work/stub:/etc/caddy/Caddyfile:ro" "$image" >/dev/null
docker run -d --name "$run-edge" --network "$run" -p 127.0.0.1::8080 \
  -v "$root/deploy/Caddyfile:/etc/caddy/Caddyfile:ro" "$image" >/dev/null
port="$(docker port "$run-edge" 8080/tcp | head -1 | sed 's/.*://')"
for _ in $(seq 50); do curl -fsS "http://127.0.0.1:$port/healthz" >/dev/null 2>&1 && break; sleep 0.2; done

failures=0
expect() { # method path expected-status expected-upstream
  local body status
  body="$(curl -sS -o - -w '\n%{http_code}' -X "$1" "http://127.0.0.1:$port$2")"
  status="${body##*$'\n'}"
  body="${body%$'\n'*}"
  if [[ "$status" != "$3" || ( -n "$4" && "$body" != "$4 $1 $2" ) ]]; then
    echo "FAIL $1 $2: got $status '$body', want $3 ${4:-}"
    failures=$((failures + 1))
  else
    echo "ok   $1 $2 -> $status${4:+ ($4)}"
  fi
}

# Account writes the demo allows (finish plan F04), through the dashboard's account proxy.
expect POST /api/account/session 200 dashboard
expect POST /api/account/demo 200 dashboard
expect POST /api/account/sign-out 200 dashboard
expect POST /api/account/favorites/203999 200 dashboard
expect DELETE /api/account/favorites/203999 200 dashboard
expect GET /api/account/me 200 dashboard
expect GET /api/account/favorites 200 dashboard
# Everything else stays refused.
expect PUT /api/account/favorites/203999 403 ""
expect POST /api/account/favorites 403 ""
expect DELETE /api/account/favorites/abc 403 ""
expect POST /api/account/favorites/203999/x 403 ""
expect DELETE /api/account/session 403 ""
expect POST /api/account/register 403 ""
expect POST /api/auth/session 403 ""
expect POST /api/auth/demo-session 403 ""
expect POST /api/auth/register 403 ""
expect POST /api/auth/token 403 ""
expect POST /api/me/favorites/203999 403 ""
expect DELETE /api/me/favorites/203999 403 ""
expect GET /api/me 200 api
expect POST /api/workspace/favorites/203999 403 ""
expect DELETE /api/workspace/favorites/203999 403 ""
# Public Ask and the read-only computations are unchanged.
expect POST /api/assistant-v2/turn 200 dashboard
expect DELETE /api/assistant-v2/threads 403 ""
expect POST /api/workbench/query 200 api
expect POST /api/workbench/workspace 403 ""

if ((failures)); then
  echo "$failures check(s) failed" >&2
  exit 1
fi
echo "Caddy allowlist: all checks passed ($image)"
