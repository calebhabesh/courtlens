#!/usr/bin/env bash
# Copy the win-probability scorecard bundle to the hosted demo. Nothing runs on the VPS: the API
# there reads these files, so a new scorecard appears without a restart. Older files stay.
set -euo pipefail
cd "$(dirname "$0")/.."
SSH_HOST="${COURTLENS_SSH_HOST:-vps}"
REMOTE_DIR=/home/ubuntu/apps/courtlens/data/derived/win-probability-serving
SOURCE="${COURTLENS_DATA_DIR:-data}/derived/win-probability-serving/"
[[ -f "$SOURCE/scorecard/summary.json" ]] || { echo "No scorecard at $SOURCE" >&2; exit 1; }
ssh -o BatchMode=yes -o ConnectTimeout=15 "$SSH_HOST" "install -d -m 755 '$REMOTE_DIR'"
# Sealed files never change; the scorecard's three growing files are replaced whole.
rsync -az --timeout=120 --exclude='*.tmp' -e 'ssh -o BatchMode=yes -o ConnectTimeout=15' \
  "$SOURCE" "$SSH_HOST:$REMOTE_DIR/"
echo "Synced $(du -sh "$SOURCE" | cut -f1) to $SSH_HOST:$REMOTE_DIR"
