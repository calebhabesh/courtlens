#!/usr/bin/env sh
set -eu

backup_dir="${COURTLOAD_BACKUP_DIR:-./data/backups}"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$backup_dir"

docker compose exec -T db pg_dump \
  --username courtload \
  --dbname courtload \
  --clean \
  --if-exists \
  --no-owner | gzip >"$backup_dir/courtload-$timestamp.sql.gz"

find "$backup_dir" -type f -name 'courtload-*.sql.gz' -mtime +14 -delete
printf 'Created %s\n' "$backup_dir/courtload-$timestamp.sql.gz"
