#!/usr/bin/env bash
set -euo pipefail

# CourtLoad restore script (M8)
# Restores database, raw files, manifests, model/evaluation artifacts,
# and verifies that the published pointer, artifact hashes, and comparison reconcile.

backup_input="${1:-}"

if [ -z "$backup_input" ]; then
  # Look for the newest backup in ./data/backups
  backup_input="$(ls -t ./data/backups/courtload-backup-*.tar.gz 2>/dev/null | head -n1 || true)"
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

temp_dir="$(mktemp -d -t courtload-restore-XXXXXX)"
trap 'rm -rf "$temp_dir"' EXIT

if [ -f "$backup_input" ]; then
  echo "Extracting backup archive $backup_input ..."
  tar -xzf "$backup_input" -C "$temp_dir"
  # Find extracted root directory
  extracted_root="$(find "$temp_dir" -mindepth 1 -maxdepth 1 -type d | head -n1)"
else
  extracted_root="$backup_input"
fi

if [ ! -f "$extracted_root/backup-manifest.json" ]; then
  echo "Error: Invalid backup bundle: backup-manifest.json is missing." >&2
  exit 1
fi

echo "Backup manifest loaded:"
cat "$extracted_root/backup-manifest.json"
echo ""

# 1. Restore PostgreSQL database
if [ -f "$extracted_root/database.sql.gz" ]; then
  echo "Restoring PostgreSQL database..."
  if [ -n "${RESTORE_DATABASE_URL:-${COURTLOAD_DATABASE_URL:-}}" ]; then
    TARGET_URL="${RESTORE_DATABASE_URL:-${COURTLOAD_DATABASE_URL}}"
    gunzip -c "$extracted_root/database.sql.gz" | psql "$TARGET_URL"
  elif command -v docker >/dev/null 2>&1 && docker compose ps --services 2>/dev/null | grep -q "db"; then
    gunzip -c "$extracted_root/database.sql.gz" | docker compose exec -T db psql -U courtload -d courtload
  else
    echo "Error: Neither COURTLOAD_DATABASE_URL nor a running Docker compose 'db' service is available." >&2
    exit 1
  fi
  echo "Database restored successfully."
fi

# 2. Restore manifests
echo "Restoring manifests..."
mkdir -p evaluation/manifests
if [ -d "$extracted_root/manifests" ]; then
  cp -r "$extracted_root/manifests"/* evaluation/manifests/
fi

# 3. Restore evaluation artifacts
echo "Restoring evaluation artifacts..."
mkdir -p data/artifacts/evaluation
if [ -d "$extracted_root/artifacts/evaluation" ]; then
  cp -r "$extracted_root/artifacts/evaluation"/* data/artifacts/evaluation/
fi

# 4. Restore raw archive files (if present and needed)
if [ -d "$extracted_root/raw" ]; then
  echo "Restoring raw archive files..."
  mkdir -p data/raw
  cp -r "$extracted_root/raw"/* data/raw/
fi

# 5. Run verify-restore
echo "Verifying restored state..."
if [ -f ".venv/bin/courtload" ]; then
  CLI=".venv/bin/courtload"
elif command -v courtload >/dev/null 2>&1; then
  CLI="courtload"
else
  CLI="python3 -m courtload.cli"
fi

$CLI verify-restore \
  --channel "${COURTLOAD_PUBLISH_CHANNEL:-public}" \
  --artifacts-dir "data/artifacts/evaluation"

echo ""
echo "Restore and verification complete!"
