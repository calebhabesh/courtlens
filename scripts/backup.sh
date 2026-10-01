#!/usr/bin/env bash
set -euo pipefail

# CourtLoad backup script (P9)
# Backs up database, manifests, evaluation configs/artifacts, raw files,
# saved investigations, and forecast records coordinated with mutation lock.

backup_dir="${COURTLOAD_BACKUP_DIR:-./data/backups}"
channel="${COURTLOAD_PUBLISH_CHANNEL:-public}"
code_version="$(git rev-parse HEAD 2>/dev/null || echo 'working-tree')"

mkdir -p "$backup_dir"

if [ -f ".venv/bin/courtload" ]; then
  CLI=".venv/bin/courtload"
elif command -v courtload >/dev/null 2>&1; then
  CLI="courtload"
else
  CLI="python3 -m courtload.cli"
fi

echo "Creating CourtLoad backup archive via $CLI ..."
$CLI backup-archive \
  --backup-dir "$backup_dir" \
  --channel "$channel" \
  --code-version "$code_version"

# Clean up older backups (> 14 days)
find "$backup_dir" -type f -name 'courtload-backup-*.tar.gz' -mtime +14 -delete 2>/dev/null || true

echo "Backup complete!"
