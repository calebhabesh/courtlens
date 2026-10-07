#!/usr/bin/env bash
set -euo pipefail

# CourtLens backup script (P9)
# Backs up database, manifests, evaluation configs/artifacts, raw files,
# saved investigations, and forecast records coordinated with mutation lock.

backup_dir="${COURTLENS_BACKUP_DIR:-./data/backups}"
channel="${COURTLENS_PUBLISH_CHANNEL:-public}"
code_version="$(git rev-parse HEAD 2>/dev/null || echo 'working-tree')"

mkdir -p "$backup_dir"

if [ -f ".venv/bin/courtlens" ]; then
  CLI=".venv/bin/courtlens"
elif command -v courtlens >/dev/null 2>&1; then
  CLI="courtlens"
else
  CLI="python3 -m courtlens.cli"
fi

echo "Creating CourtLens backup archive via $CLI ..."
$CLI backup-archive \
  --backup-dir "$backup_dir" \
  --channel "$channel" \
  --code-version "$code_version"

# Clean up older backups (> 14 days)
find "$backup_dir" -type f -name 'courtlens-backup-*.tar.gz' -mtime +14 -delete 2>/dev/null || true

echo "Backup complete!"
