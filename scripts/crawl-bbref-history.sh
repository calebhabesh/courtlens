#!/usr/bin/env sh
# Full NBA history crawl from Basketball-Reference (docs/full-history-plan.md).
#
#   scripts/crawl-bbref-history.sh            run in this terminal (use inside tmux)
#   scripts/crawl-bbref-history.sh --detach   run under nohup; survives closing the terminal
#
# Extra arguments go to `courtlens acquire-bbref-history` (for example --phase league).
# Resumable: rerun after a stop, a refusal or a reboot and it skips retained pages.
# Progress is one JSON line per page in data/logs/bbref-history.log.
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
REPO_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
COURTLENS="${COURTLENS_VENV_DIR:-$REPO_ROOT/.venv}/bin/courtlens"
LOG_DIR="$REPO_ROOT/data/logs"
LOG="$LOG_DIR/bbref-history.log"
PIDFILE="$LOG_DIR/bbref-history.pid"

if [ ! -x "$COURTLENS" ]; then
  echo "Error: $COURTLENS not found. Run 'make install' first." >&2
  exit 1
fi
mkdir -p "$LOG_DIR"
if [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
  echo "A crawl is already running (pid $(cat "$PIDFILE")). Watch: tail -f $LOG" >&2
  exit 1
fi

DETACH=0
if [ "${1:-}" = "--detach" ]; then
  DETACH=1
  shift
fi

# .env is read from the working directory.
cd "$REPO_ROOT"
REPORT="$LOG_DIR/bbref-history-$(date -u +%Y%m%dT%H%M%SZ).json"
echo "=== $(date -u +%FT%TZ) start $*" >>"$LOG"

if [ "$DETACH" = 1 ]; then
  nohup sh -c 'echo $$ >"$1"; shift; exec "$@"' sh "$PIDFILE" \
    "$COURTLENS" acquire-bbref-history --report "$REPORT" "$@" >>"$LOG" 2>&1 </dev/null &
  echo "Started in the background. Watch: tail -f $LOG"
  echo "Stop: kill \$(cat $PIDFILE)"
else
  echo $$ >"$PIDFILE"
  trap 'rm -f "$PIDFILE"' EXIT
  "$COURTLENS" acquire-bbref-history --report "$REPORT" "$@" 2>&1 | tee -a "$LOG"
fi
