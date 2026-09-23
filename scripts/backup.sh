#!/usr/bin/env bash
set -euo pipefail

# CourtLoad backup script (M8)
# Backs up database, raw files, manifests, model/evaluation artifacts,
# and published pointer state together into an atomic archive bundle.

backup_dir="${COURTLOAD_BACKUP_DIR:-./data/backups}"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
target_dir="$backup_dir/courtload-backup-$timestamp"
archive_file="$backup_dir/courtload-backup-$timestamp.tar.gz"

mkdir -p "$target_dir"
echo "Creating CourtLoad backup bundle in $target_dir ..."

# 1. Dump PostgreSQL database
echo "Dumping PostgreSQL database..."
if [ -n "${COURTLOAD_DATABASE_URL:-}" ]; then
  # Extract connection params or use URL directly with pg_dump
  pg_dump "$COURTLOAD_DATABASE_URL" \
    --clean \
    --if-exists \
    --no-owner | gzip > "$target_dir/database.sql.gz"
elif command -v docker >/dev/null 2>&1 && docker compose ps --services 2>/dev/null | grep -q "db"; then
  docker compose exec -T db pg_dump \
    --username courtload \
    --dbname courtload \
    --clean \
    --if-exists \
    --no-owner | gzip > "$target_dir/database.sql.gz"
else
  echo "Error: Neither COURTLOAD_DATABASE_URL nor a running Docker compose 'db' service is available." >&2
  exit 1
fi

# 2. Copy evaluation manifests
echo "Archiving evaluation manifests..."
mkdir -p "$target_dir/manifests"
cp -r evaluation/manifests/* "$target_dir/manifests/"

# 3. Copy model and evaluation artifacts
echo "Archiving model and evaluation artifacts..."
mkdir -p "$target_dir/artifacts/evaluation"
if [ -d "data/artifacts/evaluation" ]; then
  cp -r data/artifacts/evaluation/* "$target_dir/artifacts/evaluation/"
fi

# 4. Copy raw archive files and retrieval manifest
echo "Archiving raw archive files..."
mkdir -p "$target_dir/raw"
if [ -d "data/raw/nocturnebear-a5f108b5" ]; then
  cp -r data/raw/nocturnebear-a5f108b5 "$target_dir/raw/"
fi

# 5. Generate backup manifest
echo "Generating backup metadata manifest..."
if [ -f ".venv/bin/courtload" ]; then
  CLI=".venv/bin/courtload"
elif command -v courtload >/dev/null 2>&1; then
  CLI="courtload"
else
  CLI="python3 -m courtload.cli"
fi

$CLI backup-manifest \
  --channel "${COURTLOAD_PUBLISH_CHANNEL:-public}" \
  --raw-dir "data/raw/nocturnebear-a5f108b5" \
  --artifacts-dir "data/artifacts/evaluation" \
  --code-version "$(git rev-parse HEAD 2>/dev/null || echo 'working-tree')" > "$target_dir/backup-manifest.json"

# 6. Bundle into tar.gz
echo "Packaging archive bundle..."
tar -czf "$archive_file" -C "$backup_dir" "courtload-backup-$timestamp"
rm -rf "$target_dir"

# Clean up older backups (> 14 days)
find "$backup_dir" -type f -name 'courtload-backup-*.tar.gz' -mtime +14 -delete 2>/dev/null || true

echo "Backup complete: $archive_file ($(du -h "$archive_file" | cut -f1))"
