#!/usr/bin/env bash
# Install the user unit that runs scripts/win-probability-push.sh after every `refresh-daily`
# (13:30 UTC) and every 6-hourly `refresh-espn-rosters` (scripts/install_data_refresh.sh).
# It has no timer of its own: enabling it adds it to those two services' wants, and After= makes it
# start once each of them has finished, whether it succeeded or not.
# Also removes the old daily sync timer (courtlens-win-probability-sync) if it is installed.
# Logs: journalctl --user -u courtlens-win-probability-push. Remove: --remove
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
units="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
name=courtlens-win-probability-push

for old in courtlens-win-probability-sync.timer courtlens-win-probability-sync.service; do
  systemctl --user disable --now "$old" 2>/dev/null || true
  rm -f "$units/$old"
done
if [[ "${1:-}" == "--remove" ]]; then
  systemctl --user disable "$name.service" 2>/dev/null || true
  rm -f "$units/$name.service"
  systemctl --user daemon-reload
  echo "removed $name"
  exit 0
fi

mkdir -p "$units"
cat >"$units/$name.service" <<UNIT
[Unit]
Description=Push CourtLens win-probability inputs to the hosted demo and pull its seals back
After=courtlens-daily-refresh.service courtlens-roster-refresh.service

[Service]
Type=oneshot
Nice=10
WorkingDirectory=$root
ExecStart=$root/scripts/win-probability-push.sh
TimeoutStartSec=10min

[Install]
WantedBy=courtlens-daily-refresh.service courtlens-roster-refresh.service
UNIT
systemctl --user daemon-reload
systemctl --user enable "$name.service"
systemctl --user list-dependencies --reverse "$name.service" --no-pager
