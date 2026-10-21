#!/usr/bin/env sh
# Basketball-Reference profiles and headshots for players before 2000-01
# (docs/full-history-plan.md, FH01b). Waits for a running history crawl first, so the two never
# share the source's request budget.
#
#   scripts/crawl-bbref-old-players.sh            run in this terminal (use inside tmux)
#   scripts/crawl-bbref-old-players.sh --detach   run under nohup; survives closing the terminal
#
# Resumable: rerun after a stop and it skips players with a profile or a headshot.
# Progress is one JSON line per page in data/logs/bbref-old-players.log.
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
REPO_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
COURTLENS="${COURTLENS_VENV_DIR:-$REPO_ROOT/.venv}/bin/courtlens"
LOG_DIR="$REPO_ROOT/data/logs"
LOG="$LOG_DIR/bbref-old-players.log"
PIDFILE="$LOG_DIR/bbref-old-players.pid"
HISTORY_PIDFILE="$LOG_DIR/bbref-history.pid"

if [ ! -x "$COURTLENS" ]; then
  echo "Error: $COURTLENS not found. Run 'make install' first." >&2
  exit 1
fi
mkdir -p "$LOG_DIR"
if [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
  echo "Already running (pid $(cat "$PIDFILE")). Watch: tail -f $LOG" >&2
  exit 1
fi

case "${1:-}" in
  --detach)
    setsid nohup "$0" --run >>"$LOG" 2>&1 </dev/null &
    echo "Started in the background. Watch: tail -f $LOG"
    echo "Stop: kill -- -\$(cat $PIDFILE)"
    exit 0
    ;;
  --run) ;;
  *)
    "$0" --run 2>&1 | tee -a "$LOG"
    exit 0
    ;;
esac

echo $$ >"$PIDFILE"
trap 'rm -f "$PIDFILE"' EXIT
# .env is read from the working directory.
cd "$REPO_ROOT"

while [ -f "$HISTORY_PIDFILE" ] && kill -0 "$(cat "$HISTORY_PIDFILE")" 2>/dev/null; do
  echo "=== $(date -u +%FT%TZ) waiting for the history crawl (pid $(cat "$HISTORY_PIDFILE"))"
  sleep 300
done

STAMP=$(date -u +%Y%m%dT%H%M%SZ)
echo "=== $(date -u +%FT%TZ) profiles"
if "$COURTLENS" acquire-bbref-bios --history --report "$LOG_DIR/bbref-old-profiles-$STAMP.json" 2>&1; then
  echo "=== $(date -u +%FT%TZ) headshots"
  "$COURTLENS" acquire-bbref-portraits 2>&1
else
  echo "=== $(date -u +%FT%TZ) profiles stopped (refusal or error); rerun later for headshots"
fi
echo "=== $(date -u +%FT%TZ) done"
