#!/usr/bin/env sh
set -eu

notify_failure() {
  if [ -n "${COURTLOAD_FAILURE_WEBHOOK_URL:-}" ]; then
    curl --fail --silent --show-error \
      --max-time 10 \
      -H 'Content-Type: text/plain' \
      --data 'CourtLoad daily refresh failed. Inspect the private job logs.' \
      "$COURTLOAD_FAILURE_WEBHOOK_URL" >/dev/null || true
  fi
}

trap notify_failure EXIT

docker compose exec -T api courtload refresh --days-back 3 --days-ahead 14 --include-stats
docker compose --profile tools run --rm dbt build --profiles-dir .

trap - EXIT
