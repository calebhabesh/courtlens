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
DATA_DIR="${COURTLENS_DATA_DIR:-$REPO_ROOT/data}"
OWNER=calebhabesh
SSH=(ssh -o BatchMode=yes -o ConnectTimeout=15 "$SSH_HOST")
RSYNC=(rsync -az --delete -e 'ssh -o BatchMode=yes -o ConnectTimeout=15')

git -C "$REPO_ROOT" fetch -q origin main
sha="${1:-$(git -C "$REPO_ROOT" rev-parse origin/main)}"
[[ "$sha" =~ ^[0-9a-f]{40}$ ]] || { echo "Give a full 40-character commit SHA." >&2; exit 1; }
git -C "$REPO_ROOT" merge-base --is-ancestor "$sha" origin/main || { echo "$sha is not on origin/main." >&2; exit 1; }

images_run="$(gh run list --repo "$OWNER/courtlens" --workflow images.yml --commit "$sha" \
  --status success --limit 1 --json databaseId --jq '.[0].databaseId // empty')"
[[ -n "$images_run" ]] || { echo "No successful Images run for $sha yet; wait for CI and Images on main." >&2; exit 1; }

stage="$(mktemp -d "${TMPDIR:-$HOME/.cache/courtlens-tmp}/courtlens-release.XXXXXX")"
trap 'rm -rf "$stage"' EXIT
mkdir -p "$stage/infra"
git -C "$REPO_ROOT" show "$sha:deploy/compose.prod.yml" > "$stage/docker-compose.yml"
git -C "$REPO_ROOT" show "$sha:deploy/Caddyfile" > "$stage/infra/Caddyfile"
git -C "$REPO_ROOT" show "$sha:deploy/pinned.env" > "$stage/pinned.env"

# Git-ignored files the API reads at serve time, mirrored read-only to the VPS.
SERVING_DIRS=(
  artifacts/evaluation
  artifacts/analyses
  derived/impact-serving-v1
  derived/value-archetypes-v1/serving
  derived/wowy-v1
  cache/portraits
)
for dir in "${SERVING_DIRS[@]}"; do
  [[ -d "$DATA_DIR/$dir" ]] || { echo "Missing $DATA_DIR/$dir; set COURTLENS_DATA_DIR." >&2; exit 1; }
done

echo "Deploying $sha to $SSH_HOST:$REMOTE_DIR"
remote_dirs=("$REMOTE_DIR/infra")
for dir in "${SERVING_DIRS[@]}"; do remote_dirs+=("$REMOTE_DIR/data/$dir"); done
"${SSH[@]}" "install -d -m 755 ${remote_dirs[*]} && install -d -m 700 '$REMOTE_DIR/secrets'"
"${RSYNC[@]}" "$stage/docker-compose.yml" "$stage/pinned.env" "$SSH_HOST:$REMOTE_DIR/"
"${RSYNC[@]}" "$stage/infra/" "$SSH_HOST:$REMOTE_DIR/infra/"
for dir in "${SERVING_DIRS[@]}"; do
  "${RSYNC[@]}" "$DATA_DIR/$dir/" "$SSH_HOST:$REMOTE_DIR/data/$dir/"
done

# Upload the remote script first and run it with stdin closed, so no command
# (docker compose run, for one) can swallow the rest of the script.
# shellcheck disable=SC2016
"${SSH[@]}" "bash -c 'tmp=\"\$(mktemp)\"; cat > \"\$tmp\"; bash \"\$tmp\" \"\$@\" < /dev/null; rc=\$?; rm -f \"\$tmp\"; exit \$rc' bash '$REMOTE_DIR' '$sha' '$OWNER'" <<'REMOTE'
set -euo pipefail
dir="$1"; sha="$2"; owner="$3"
cd "$dir"
[[ -f secrets.env ]] || { echo "Missing $dir/secrets.env; run the first-time setup in docs/deployment.md." >&2; exit 1; }

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
curl -fsS http://127.0.0.1:8090/healthz >/dev/null
curl -fsS http://127.0.0.1:8090/api/health >/dev/null

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
