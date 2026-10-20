#!/usr/bin/env bash
# Install the systemd user timers that keep CourtLens' operational data current:
#   courtlens-roster-refresh  every 6 hours  `courtlens refresh-espn-rosters` (Free Agency roster check)
#   courtlens-daily-refresh   13:30 UTC daily `courtlens refresh-daily`, after hoopR's ~12:10 UTC
#                             republish: the hoopR player index; the season's box scores (a new
#                             statistics release when games were played); Basketball-Reference
#                             contracts; DARKO's latest ratings; Wikipedia's transactions.
#   courtlens-impact-refresh  Mondays 14:30 UTC `courtlens refresh-season-impact`: provisional
#                             current-season impact numbers (waits until teams have 10 games).
# Every run stores bytes only when the data changed and prunes bounded history (docs/deployment.md).
# A refused or failed step admits nothing; pages keep serving the last good data.
# Logs: journalctl --user -u courtlens-daily-refresh. Remove: scripts/install_data_refresh.sh --remove
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
units="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
names=(courtlens-roster-refresh courtlens-daily-refresh courtlens-impact-refresh)

if [[ "${1:-}" == "--remove" ]]; then
  for name in "${names[@]}"; do
    systemctl --user disable --now "$name.timer" 2>/dev/null || true
    rm -f "$units/$name.service" "$units/$name.timer"
    echo "removed $name"
  done
  systemctl --user daemon-reload
  exit 0
fi

# unit NAME DESCRIPTION COMMAND TIMEOUT ONCALENDAR
unit() {
  cat >"$units/$1.service" <<UNIT
[Unit]
Description=$2

[Service]
Type=oneshot
Nice=10
WorkingDirectory=$root
ExecStart=$root/.venv/bin/courtlens $3
TimeoutStartSec=$4
UNIT
  cat >"$units/$1.timer" <<UNIT
[Unit]
Description=$2 (schedule)

[Timer]
# A run missed while the machine was off runs at the next boot.
OnCalendar=$5
RandomizedDelaySec=10min
Persistent=true

[Install]
WantedBy=timers.target
UNIT
}

mkdir -p "$units"
unit courtlens-roster-refresh "Seal ESPN team rosters for the CourtLens free-agency roster check" \
  refresh-espn-rosters 15min "*-*-* 00/6:00:00"
unit courtlens-daily-refresh "Refresh the CourtLens player index, contracts and DARKO ratings" \
  refresh-daily 2h "*-*-* 13:30:00 UTC"
unit courtlens-impact-refresh "Refresh CourtLens provisional current-season impact numbers" \
  refresh-season-impact 2h "Mon *-*-* 14:30:00 UTC"

systemctl --user daemon-reload
for name in "${names[@]}"; do
  systemctl --user enable --now "$name.timer"
done
systemctl --user list-timers "${names[@]/%/.timer}" --no-pager
