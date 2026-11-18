#!/usr/bin/env bash
# Install and start one release on the VPS (docs/deployment.md). Only the deploy gate runs this,
# as committed on origin/main, under the deploy lock it holds:
#
#   courtlens-deploy-gate <sha>  ->  bash <origin/main's scripts/vps-release.sh> <sha>
#
# The release files (compose file, Caddyfile, pinned.env, backup script) come from <sha> in the
# VPS's partial clone of the public repository ($DIR/.repo). The images are CI's sha-<sha> tags,
# pulled before anything changes, so a commit CI did not publish stops here and changes nothing.
set -euo pipefail

sha="$1"
dir="${COURTLENS_DEPLOY_ROOT:-/home/ubuntu/apps/courtlens}"
repo="$dir/.repo"
owner=calebhabesh
cd "$dir"
[[ -f secrets.env ]] || { echo "Missing $dir/secrets.env; run the first-time setup in docs/deployment.md." >&2; exit 1; }
show() { git --git-dir="$repo" show "$sha:$1"; }

# 1. Pull this release's images and pin their digests.
next=release.env.next
show deploy/pinned.env > "$next"
for name in api dashboard; do
  ref="ghcr.io/$owner/courtlens-$name:sha-$sha"
  docker pull -q "$ref" >/dev/null || {
    rm -f "$next"
    echo "No $ref image; CI publishes one only for a main commit whose CI passed." >&2
    exit 1
  }
  digest="$(docker image inspect --format '{{index .RepoDigests 0}}' "$ref")"
  echo "COURTLENS_${name^^}_IMAGE=$digest" >> "$next"
done
echo "COURTLENS_RELEASE_SHA=$sha" >> "$next"

# 2. Install this release's files. Each is written beside its target and renamed into place.
install -d -m 755 infra scripts
install -d -m 700 secrets
put() { show "$1" > "$2.next" && mv "$2.next" "$2"; }
put deploy/compose.prod.yml docker-compose.yml
put deploy/Caddyfile infra/Caddyfile
put deploy/pinned.env pinned.env
put scripts/vps-backup.sh scripts/vps-backup.sh
chmod +x scripts/vps-backup.sh
# Left by deploys before 2026-11-18's gate, which staged files there.
rm -rf .incoming

# Directories the API mounts read-only. Since Win Probability v4's W7 the VPS owns all of `data/`
# (the jobs service writes it), so a deploy only makes sure they exist: nothing under `data/` is
# copied, overwritten or deleted.
SERVING_DIRS=(
  artifacts/evaluation
  artifacts/analyses
  derived/impact-serving-v1
  derived/impact-team-splits-v1
  derived/value-archetypes-v1/serving
  derived/wowy-v1
  derived/series-matchups-v1
  artifacts/win-probability
  artifacts/projected-impact
  derived/projected-impact-serving
  derived/win-probability-ratings
  derived/metric-backtest-serving
  derived/draft-value-v1
  derived/lineup-model-v1
  derived/darko-dpm-v2
  derived/espn-rosters-v1
  derived/wikipedia-transactions-v1
  derived/wikipedia-contracts-v1
  derived/college-schools-v1
  derived/free-agency-v1
  derived/shot-zones-v1
  derived/position-estimates-v1
  derived/contracts-checks
  derived/stint-box-v1
  artifacts/research-runs
  artifacts/research-run-packages
  cache/portraits
  raw/bbref_history_sealed
)
VPS_OWNED_DIRS=(derived/win-probability-serving raw/espn-wp derived/job-health derived/position-estimates-provisional-v1)
for path in "${SERVING_DIRS[@]}" "${VPS_OWNED_DIRS[@]}"; do install -d -m 755 "data/$path"; done

# 3. Start it.
compose() { docker compose --env-file secrets.env --env-file "$1" "${@:2}"; }
tunnel_profile=()
[[ -s secrets/tunnel-token ]] && tunnel_profile=(--profile tunnel)

compose "$next" config --quiet
# The worker services run a shell loop as PID 1, which ignores SIGTERM, so replacing a running one
# waits out the stop timeout and kills it (exit 137); on 2026-11-18 that made `up --wait` abort.
# Stop them first so `up` only starts fresh containers. Each is restarted below.
services="$(compose "$next" config --services)"
workers=()
for service in jobs demo-reset win-probability-seal; do
  grep -qx "$service" <<< "$services" && workers+=("$service")
done
((${#workers[@]})) && compose "$next" stop -t 30 "${workers[@]}"
compose "$next" up -d --wait db
compose "$next" --profile migrate run --rm -T migrate < /dev/null
if ! compose "$next" "${tunnel_profile[@]}" up -d --wait --wait-timeout 300 --remove-orphans; then
  echo "New release failed health checks." >&2
  if [[ -f release.env ]]; then
    echo "Restoring the previous release (migrations are not rolled back)." >&2
    compose release.env "${tunnel_profile[@]}" up -d --wait --wait-timeout 300 || true
  fi
  exit 1
fi
# Hold the jobs loop until the Stats cohorts below are stored: its warm crawl (speed plan SP02)
# would otherwise compute the same cohorts on demand while the API warms its catalog, and on
# 2026-11-16 the three together pushed the database past its 2 GB limit (a backend was OOM-killed
# and three crawled pages timed out). The trap restarts it whatever happens below.
compose "$next" stop jobs >/dev/null
trap 'compose "$next" start jobs >/dev/null 2>&1 || compose release.env start jobs >/dev/null 2>&1 || true' EXIT
# Caddy mounts the single Caddyfile; replacing the file leaves a running container on the old
# one until it restarts (2026-11-10: the public Ask allowlist wasn't live after a deploy).
caddy_id="$(compose "$next" ps -q caddy)"
if [[ -n "$caddy_id" ]] && ! docker exec "$caddy_id" cat /etc/caddy/Caddyfile | cmp -s - infra/Caddyfile; then
  compose "$next" "${tunnel_profile[@]}" restart caddy
  sleep 2
fi
curl -fsS http://127.0.0.1:8090/healthz >/dev/null
curl -fsS http://127.0.0.1:8090/api/health >/dev/null
# The one-click demo account (finish plan F04). Idempotent: an existing demo keeps today's list,
# which the demo-reset service restores to the seed each night.
compose "$next" exec -T api courtlens seed-demo-account < /dev/null \
  || echo "Demo account seeding failed; the demo sign-in reports it isn't set up." >&2
# Store every season's Stats cohort now, so no visitor waits for one to be computed. A new
# release or changed serving code changes the stored keys (docs/deployment.md).
compose "$next" exec -T api courtlens warm-stats-cohorts < /dev/null \
  || echo "Stats cohort warm-up failed; each season is computed on its first view." >&2
compose "$next" start jobs >/dev/null

[[ -f release.env ]] && mv release.env release.prev.env
mv "$next" release.env

# Keep only the current and previous release images; LineWatchTO's host-wide prune
# never removes images that a container still uses.
releases=(release.env)
[[ -f release.prev.env ]] && releases+=(release.prev.env)
keep="$(sed -n 's/^COURTLENS_\(API\|DASHBOARD\)_IMAGE=.*@//p' "${releases[@]}" | sort -u)"
docker image ls --no-trunc --format '{{.Repository}} {{.ID}} {{.Digest}}' \
  | awk -v o="ghcr.io/$owner/courtlens-" 'index($1, o) == 1' \
  | while read -r _ id digest; do
      grep -qx "$digest" <<< "$keep" || docker image rm -f "$id" >/dev/null 2>&1 || true
    done
docker image prune -f >/dev/null
echo "Release $sha is live. Disk: $(df -h / | awk 'NR==2 {print $4 " free of " $2}')"
