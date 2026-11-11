#!/usr/bin/env bash
# Win Probability v4 W2: the PC's half of sealing on the VPS (docs/deployment.md).
#
# Pushes the small inputs the VPS seal service reads but cannot make: the current season's box
# scores (raw/sportsdataverse_<year>), the rating snapshots (derived/win-probability-ratings), the
# ESPN roster bundle (derived/espn-rosters-v1) and the Projected Impact weekly score. Then pulls
# the serving bundle the VPS owns (derived/win-probability-serving) back for local development.
# Never --delete on either side: the VPS keeps every seal it made, the PC every file it has.
#
# The pull is skipped while this checkout still seals locally (the .env flag below unset or not
# false), so a local scorecard is never overwritten before the cutover.
#
# Runs after each `refresh-daily` and each 6-hourly `refresh-espn-rosters`
# (scripts/install_win_probability_push.sh). COURTLENS_PUSH_DRY_RUN=1 changes nothing on either side.
set -euo pipefail
cd "$(dirname "$0")/.."
SSH_HOST="${COURTLENS_SSH_HOST:-vps}"
REMOTE=/home/ubuntu/apps/courtlens/data
DATA="${COURTLENS_DATA_DIR:-data}"
SSH_OPTS='ssh -o BatchMode=yes -o ConnectTimeout=15'
# --delay-updates renames a directory's changed files together at the end, so the seal job never
# reads a new box CSV beside its old receipt.
RSYNC=(rsync -az --timeout=120 --exclude='*.tmp' --delay-updates -e "$SSH_OPTS")
dry="${COURTLENS_PUSH_DRY_RUN:-}"
[[ -n "$dry" ]] && RSYNC+=(--dry-run --itemize-changes)

month=$(date -u +%-m); year=$(date -u +%Y)
season_end=$(( month >= 7 ? year + 1 : year ))
pushed=(
  "raw/sportsdataverse_$season_end"
  derived/win-probability-ratings
  derived/espn-rosters-v1
)
[[ -f "$DATA/derived/projected-impact-serving/summary.json" ]] && pushed+=(derived/projected-impact-serving)
for dir in "${pushed[@]}"; do
  [[ -d "$DATA/$dir" ]] || { echo "Missing $DATA/$dir" >&2; exit 1; }
done
remote_dirs=()
for dir in "${pushed[@]}"; do remote_dirs+=("'$REMOTE/$dir'"); done
[[ -n "$dry" ]] || $SSH_OPTS "$SSH_HOST" "install -d -m 755 ${remote_dirs[*]}"
for dir in "${pushed[@]}"; do
  "${RSYNC[@]}" "$DATA/$dir/" "$SSH_HOST:$REMOTE/$dir/"
  echo "${dry:+would be }pushed $dir ($(du -sh "$DATA/$dir" | cut -f1))"
done

local_sealing="$( (sed -n 's/^COURTLENS_WIN_PROBABILITY_LOCAL_SEALING=//p' .env 2>/dev/null || true) | tail -n 1)"
if [[ "${local_sealing,,}" != "false" ]]; then
  echo "Local sealing is on here (.env COURTLENS_WIN_PROBABILITY_LOCAL_SEALING); serving bundle not pulled."
  exit 0
fi
"${RSYNC[@]}" "$SSH_HOST:$REMOTE/derived/win-probability-serving/" "$DATA/derived/win-probability-serving/"
echo "${dry:+would be }pulled derived/win-probability-serving ($(du -sh "$DATA/derived/win-probability-serving" | cut -f1))"
