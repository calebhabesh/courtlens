#!/usr/bin/env bash
# Deploy a green main commit to the hosted demo (docs/deployment.md).
#
#   scripts/deploy-vps.sh                 # latest origin/main
#   scripts/deploy-vps.sh <40-char sha>   # a specific main commit
#
# The Images workflow must have published sha-<sha> images. The VPS pulls them, pins
# digests, migrates, waits for health, and keeps only the current and previous release
# images so repeated deploys cannot fill the disk.
set -euo pipefail

SSH_HOST="${COURTLENS_SSH_HOST:-vps}"
REMOTE_DIR=/home/ubuntu/apps/courtlens
REPO_ROOT="$(git rev-parse --show-toplevel)"
OWNER=calebhabesh
SSH=(ssh -o BatchMode=yes -o ConnectTimeout=15 "$SSH_HOST")
RSYNC=(rsync -az --delete -e 'ssh -o BatchMode=yes -o ConnectTimeout=15')

git -C "$REPO_ROOT" fetch -q origin main
sha="${1:-$(git -C "$REPO_ROOT" rev-parse origin/main)}"
[[ "$sha" =~ ^[0-9a-f]{40}$ ]] || { echo "Give a full 40-character commit SHA." >&2; exit 1; }
git -C "$REPO_ROOT" merge-base --is-ancestor "$sha" origin/main || { echo "$sha is not on origin/main." >&2; exit 1; }

# Match the Images run by the commit it built, named in its run name ("Images <sha>"). GitHub files
# a workflow_run-triggered run under main's head when it starts, not the commit it builds: on
# 2026-11-18 run 44251620872 was listed under 8526bc02 but built 448a018f. Filter on the conclusion
# ourselves: GitHub's status=success filter can miss a run that already succeeded (2026-11-11, a
# hand-dispatched Images run during a CI outage).
images_run="$(gh run list --repo "$OWNER/courtlens" --workflow images.yml --limit 100 \
  --json databaseId,conclusion,displayTitle \
  --jq "[.[] | select(.conclusion == \"success\" and .displayTitle == \"Images $sha\")][0].databaseId // empty")"
[[ -n "$images_run" ]] || { echo "No successful Images run built $sha yet; wait for CI and Images on main." >&2; exit 1; }

stage="$(mktemp -d "${TMPDIR:-$HOME/.cache/courtlens-tmp}/courtlens-release.XXXXXX")"
trap 'rm -rf "$stage"' EXIT
mkdir -p "$stage/infra"
git -C "$REPO_ROOT" show "$sha:deploy/compose.prod.yml" > "$stage/docker-compose.yml"
git -C "$REPO_ROOT" show "$sha:deploy/Caddyfile" > "$stage/infra/Caddyfile"
git -C "$REPO_ROOT" show "$sha:deploy/pinned.env" > "$stage/pinned.env"
mkdir -p "$stage/scripts"
git -C "$REPO_ROOT" show "$sha:scripts/vps-backup.sh" > "$stage/scripts/vps-backup.sh"
chmod +x "$stage/scripts/vps-backup.sh"

# Directories the API mounts read-only. Since Win Probability v4's W7 the VPS owns all of
# `data/` (the jobs service writes it), so a deploy only makes sure they exist: nothing under
# `data/` is copied, overwritten or deleted from this machine.
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

echo "Deploying $sha to $SSH_HOST:$REMOTE_DIR"
# The release files go to a staging folder of their own; the remote script installs them only once
# it holds the deploy lock. On 2026-11-18 two deploys of one commit ran at once: they replaced each
# other's compose file and release.env.next, killed each other's containers mid-wait, and left no
# release.env behind.
incoming="$REMOTE_DIR/.incoming/$(date -u +%Y%m%dT%H%M%SZ)-$$-${sha:0:12}"
remote_dirs=("$REMOTE_DIR/infra" "$REMOTE_DIR/scripts" "$incoming")
for dir in "${SERVING_DIRS[@]}" "${VPS_OWNED_DIRS[@]}"; do remote_dirs+=("$REMOTE_DIR/data/$dir"); done
"${SSH[@]}" "install -d -m 755 ${remote_dirs[*]} && install -d -m 700 '$REMOTE_DIR/secrets'"
"${RSYNC[@]}" "$stage/" "$SSH_HOST:$incoming/"

# Upload the remote script first and run it with stdin closed, so no command
# (docker compose run, for one) can swallow the rest of the script.
# shellcheck disable=SC2016
"${SSH[@]}" "bash -c 'tmp=\"\$(mktemp)\"; cat > \"\$tmp\"; bash \"\$tmp\" \"\$@\" < /dev/null; rc=\$?; rm -f \"\$tmp\"; exit \$rc' bash '$REMOTE_DIR' '$sha' '$OWNER' '$incoming'" <<'REMOTE'
set -euo pipefail
dir="$1"; sha="$2"; owner="$3"; incoming="$4"
cd "$dir"
# One deploy at a time, from any machine. The lock lasts until this script and every command it
# started have exited.
exec 9>"$dir/.deploy.lock"
if ! flock -n 9; then
  rm -rf "$incoming"
  echo "Another deploy is running on the VPS; this one changed nothing. Retry when it finishes." >&2
  exit 1
fi
[[ -f secrets.env ]] || { echo "Missing $dir/secrets.env; run the first-time setup in docs/deployment.md." >&2; exit 1; }
# Install this release's files, then drop its staging folder and any an interrupted deploy left.
cp "$incoming/docker-compose.yml" "$incoming/pinned.env" "$dir/"
rsync -a --delete "$incoming/infra/" "$dir/infra/"
rsync -a --delete "$incoming/scripts/" "$dir/scripts/"
rm -rf "$incoming"
find "$dir/.incoming" -mindepth 1 -maxdepth 1 -mmin +60 -exec rm -rf {} +

next=release.env.next
cp pinned.env "$next"
for name in api dashboard; do
  ref="ghcr.io/$owner/courtlens-$name:sha-$sha"
  docker pull -q "$ref" >/dev/null
  digest="$(docker image inspect --format '{{index .RepoDigests 0}}' "$ref")"
  echo "COURTLENS_${name^^}_IMAGE=$digest" >> "$next"
done
echo "COURTLENS_RELEASE_SHA=$sha" >> "$next"

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
# Caddy mounts the single Caddyfile; rsync replaces the file, so a running container keeps the
# old one until it restarts (2026-11-10: the public Ask allowlist wasn't live after a deploy).
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
REMOTE
