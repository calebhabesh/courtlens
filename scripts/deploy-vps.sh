#!/usr/bin/env bash
# Deploy a main commit to the hosted demo from this machine, over Tailscale (docs/deployment.md).
# The usual way is the Deploy workflow (`make deploy`); this is the same deploy without Actions.
#
#   scripts/deploy-vps.sh                 # latest origin/main
#   scripts/deploy-vps.sh <40-char sha>   # a specific main commit
#
# Waits for the commit's CI (which publishes its images), then runs the VPS's deploy gate, which
# takes the lock, checks the commit is on main and runs main's scripts/vps-release.sh.
set -euo pipefail

SSH_HOST="${COURTLENS_SSH_HOST:-vps}"
REPO_ROOT="$(git rev-parse --show-toplevel)"

git -C "$REPO_ROOT" fetch -q origin main
sha="${1:-$(git -C "$REPO_ROOT" rev-parse origin/main)}"
[[ "$sha" =~ ^[0-9a-f]{40}$ ]] || { echo "Give a full 40-character commit SHA." >&2; exit 1; }
git -C "$REPO_ROOT" merge-base --is-ancestor "$sha" origin/main || { echo "$sha is not on origin/main." >&2; exit 1; }

"$REPO_ROOT/scripts/wait_for_ci.sh" "$sha"
ssh -o BatchMode=yes -o ConnectTimeout=15 "$SSH_HOST" /usr/local/sbin/courtlens-deploy-gate "$sha" < /dev/null
