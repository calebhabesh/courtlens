#!/usr/bin/env bash
set -euo pipefail

# CourtLens restore script (P9)
# Restores database, raw files, manifests, configs, evaluation artifacts,
# verifies bundle checksums, and verifies restored state across workbench and archive models.

backup_input="${1:-}"

if [ -z "$backup_input" ]; then
  # Look for the newest backup in ./data/backups
  backup_input="$(ls -t ./data/backups/courtlens-backup-*.tar.gz 2>/dev/null | head -n1 || true)"
  if [ -z "$backup_input" ]; then
    echo "Usage: $0 <path-to-backup-tar-gz>" >&2
    echo "Error: No backup archive specified and none found in ./data/backups" >&2
    exit 1
  fi
fi

if [ ! -f "$backup_input" ] && [ ! -d "$backup_input" ]; then
  echo "Error: Backup path '$backup_input' does not exist." >&2
  exit 1
fi

if [ -f ".venv/bin/courtlens" ]; then
  CLI=".venv/bin/courtlens"
elif command -v courtlens >/dev/null 2>&1; then
  CLI="courtlens"
else
  CLI="python3 -m courtlens.cli"
fi

channel="${COURTLENS_PUBLISH_CHANNEL:-public}"

echo "Restoring CourtLens backup archive $backup_input via $CLI ..."
$CLI restore-archive "$backup_input" --channel "$channel"

echo "Restore and verification complete!"
