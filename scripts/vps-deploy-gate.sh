#!/usr/bin/env bash
# The one way into a CourtLens deploy on the VPS (docs/deployment.md#deploy).
#
#   courtlens-deploy-gate <40-char sha>
#
# Both deploy paths end here: the Deploy workflow's key, which authorized_keys pins to this gate,
#   command="/usr/local/sbin/courtlens-deploy-gate",from="100.64.0.0/10,fd7a:115c:a1e0::/48",restrict ssh-ed25519 ...
# and scripts/deploy-vps.sh over Tailscale. The gate takes the deploy lock, checks the commit is
# on main, and runs scripts/vps-release.sh as committed on origin/main, so the Actions key can only
# deploy main commits with main's release script; nothing it sends is run.
#
# Install a root-owned copy, not the clone's (reinstall it when this file changes):
#   git show origin/main:scripts/vps-deploy-gate.sh \
#     | ssh vps 'sudo tee /usr/local/sbin/courtlens-deploy-gate >/dev/null && sudo chmod 755 /usr/local/sbin/courtlens-deploy-gate'
set -euo pipefail

ROOT_DIR="${COURTLENS_DEPLOY_ROOT:-/home/ubuntu/apps/courtlens}"
REPO="$ROOT_DIR/.repo"

die() {
  printf 'deploy gate: %s\n' "$*" >&2
  exit 1
}

# Under the forced command the request arrives in SSH_ORIGINAL_COMMAND; run by hand, as arguments.
# shellcheck disable=SC2206 # split on whitespace, deliberately
words=(${SSH_ORIGINAL_COMMAND:-$*})
[[ ${#words[@]} -eq 1 ]] || die 'expected one argument: a full commit SHA.'
sha="${words[0]}"
[[ "$sha" =~ ^[0-9a-f]{40}$ ]] || die 'expected a full lowercase 40-character commit SHA.'

cd "$ROOT_DIR"
# One deploy at a time, from any machine. The lock lasts until this gate and everything it
# started have exited (2026-11-18: two concurrent deploys replaced each other's files).
exec 9> "$ROOT_DIR/.deploy.lock"
flock -n 9 || die 'another deploy is running on the VPS; this one changed nothing. Retry when it finishes.'

git --git-dir="$REPO" fetch --quiet --no-tags origin main
git --git-dir="$REPO" cat-file -e "$sha^{commit}" 2> /dev/null || die "$sha is not in the repository."
git --git-dir="$REPO" merge-base --is-ancestor "$sha" FETCH_HEAD || die "$sha is not on main."

echo "Deploying $sha"
# Run from a file with stdin closed, so no command in it (docker compose run, for one) can read
# the rest of the script.
release="$(mktemp)"
trap 'rm -f "$release"' EXIT
git --git-dir="$REPO" show FETCH_HEAD:scripts/vps-release.sh > "$release"
bash "$release" "$sha" < /dev/null
