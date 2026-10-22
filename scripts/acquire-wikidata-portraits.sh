#!/usr/bin/env sh
# Career photos from Wikimedia Commons, linked through Wikidata, for every player who still has
# no photo from NBA.com or Basketball-Reference (docs/full-history-plan.md, FH01c).
#
#   scripts/acquire-wikidata-portraits.sh            run in this terminal (use inside tmux)
#   scripts/acquire-wikidata-portraits.sh --detach   run under nohup; survives closing the terminal
#
# Resumable: each player ends with a photo or a "missing" row, and a rerun skips both.
# Progress is a JSON line every 25 players in data/logs/wikidata-portraits.log.
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
REPO_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
COURTLENS="${COURTLENS_VENV_DIR:-$REPO_ROOT/.venv}/bin/courtlens"
LOG_DIR="$REPO_ROOT/data/logs"
LOG="$LOG_DIR/wikidata-portraits.log"
PIDFILE="$LOG_DIR/wikidata-portraits.pid"

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

echo "=== $(date -u +%FT%TZ) wikidata portraits"
"$COURTLENS" acquire-wikidata-portraits 2>&1
echo "=== $(date -u +%FT%TZ) done"
