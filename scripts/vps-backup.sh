#!/usr/bin/env bash
# Backups on the hosted VPS (Win Probability v4, W7c). Since W7 the VPS holds the only live copy.
#
#   scripts/vps-backup.sh db        weekly: pg_dump -Fc of the live database to
#                                   ~/backups/courtlens/db/, the newest two kept
#   scripts/vps-backup.sh records   nightly: the records nothing can recompute (seals, scorecards,
#                                   head-to-head and its reads, weekly scores, protocol-relevant
#                                   job health) committed and pushed to the private repository
#                                   in ~/backups/courtlens/records (deploy key, write access to
#                                   that one repository only)
#
# Installed in the ubuntu user's crontab by `scripts/vps-backup.sh install` (run on the VPS).
# Restore: docs/deployment.md, "Backups".
set -euo pipefail

APP=/home/ubuntu/apps/courtlens
ROOT=/home/ubuntu/backups/courtlens
KEEP_DUMPS=2
RECORDS=(
  data/derived/win-probability-serving
  data/derived/projected-impact-serving
  data/derived/metric-backtest-serving
  data/derived/job-health
)

compose() { (cd "$APP" && docker compose --env-file secrets.env --env-file release.env "$@"); }

case "${1:-}" in
  db)
    mkdir -p "$ROOT/db"
    out="$ROOT/db/courtlens-$(date -u +%Y%m%dT%H%M%SZ).dump"
    compose exec -T db pg_dump -U courtlens -Fc --no-owner --exclude-schema='cl_candidate_*' courtlens > "$out.part"
    mv "$out.part" "$out"
    ls -1t "$ROOT"/db/courtlens-*.dump | tail -n +$((KEEP_DUMPS + 1)) | xargs -r rm -f
    echo "db backup $(basename "$out") $(du -h "$out" | cut -f1)"
    ;;
  records)
    repo="$ROOT/records"
    [[ -d "$repo/.git" ]] || { echo "No records repository at $repo; see docs/deployment.md" >&2; exit 1; }
    for dir in "${RECORDS[@]}"; do
      mkdir -p "$repo/$dir"
      rsync -a --exclude='*.tmp' "$APP/$dir/" "$repo/$dir/"
    done
    git -C "$repo" add -A
    if git -C "$repo" diff --cached --quiet; then
      echo "records unchanged"
    else
      git -C "$repo" -c user.name="courtlens-vps" -c user.email="courtlens-vps@localhost" \
        commit -q -m "records $(date -u +%Y-%m-%dT%H:%M:%SZ)"
      GIT_SSH_COMMAND="ssh -i $HOME/.ssh/courtlens_records -o IdentitiesOnly=yes" git -C "$repo" push -q origin HEAD
      echo "records pushed $(git -C "$repo" rev-parse --short HEAD)"
    fi
    ;;
  install)
    script="$APP/scripts/vps-backup.sh"
    log="$ROOT/backup.log"
    mkdir -p "$ROOT"
    { crontab -l 2>/dev/null | grep -v 'courtlens/scripts/vps-backup.sh' || true
      # Weekly dump Sundays 07:20 UTC; records daily 15:10 UTC (after the 09:00 ET scoring run).
      echo "20 7 * * 0 $script db >> $log 2>&1"
      echo "10 15 * * * $script records >> $log 2>&1"
    } | crontab -
    crontab -l | grep vps-backup
    ;;
  *)
    echo "usage: $0 db|records|install" >&2
    exit 2
    ;;
esac
