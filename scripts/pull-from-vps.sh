#!/usr/bin/env bash
# Copy the hosted VPS's data to this machine for development (Win Probability v4, W7c).
# Since W7 the VPS is the system of record; this only ever pulls. Never --delete: files that
# exist only here stay.
#
#   scripts/pull-from-vps.sh              data/ (raw, derived, artifacts, cache)
#   scripts/pull-from-vps.sh --database   also a fresh database dump, restored into the local
#                                         database `courtlens` after confirming
set -euo pipefail
cd "$(dirname "$0")/.."
SSH_HOST="${COURTLENS_SSH_HOST:-vps}"
REMOTE=/home/ubuntu/apps/courtlens
SSH=(ssh -o BatchMode=yes -o ConnectTimeout=15 "$SSH_HOST")

rsync -az --info=stats1 --exclude='*.tmp' -e 'ssh -o BatchMode=yes -o ConnectTimeout=15' \
  "$SSH_HOST:$REMOTE/data/" data/

if [[ "${1:-}" == "--database" ]]; then
  dump="${TMPDIR:-$HOME/.cache/courtlens-tmp}/courtlens-vps.dump"
  mkdir -p "$(dirname "$dump")"
  "${SSH[@]}" "cd $REMOTE && docker compose --env-file secrets.env --env-file release.env exec -T db \
    pg_dump -U courtlens -Fc --no-owner --exclude-schema='cl_candidate_*' courtlens" > "$dump"
  echo "Dump: $dump ($(du -h "$dump" | cut -f1))."
  read -r -p "Replace the local database 'courtlens' with it? [y/N] " answer
  if [[ "$answer" == "y" ]]; then
    docker exec courtlens-db-1 psql -U courtlens -d postgres \
      -c "DROP DATABASE IF EXISTS courtlens WITH (FORCE)" -c "CREATE DATABASE courtlens OWNER courtlens"
    docker exec -i courtlens-db-1 pg_restore -U courtlens -d courtlens --no-owner < "$dump"
  fi
  rm -f "$dump"
fi
