#!/usr/bin/env bash
# Install the user timer that syncs the win-probability scorecard to the hosted demo every day,
# after the 13:30 UTC `refresh-daily` run (allowed up to 2 hours). The owner enables this.
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
units="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
mkdir -p "$units"
cat >"$units/courtlens-win-probability-sync.service" <<UNIT
[Unit]
Description=Sync the CourtLens win-probability scorecard to the hosted demo

[Service]
Type=oneshot
WorkingDirectory=$root
ExecStart=$root/scripts/sync-win-probability.sh
TimeoutStartSec=10min
UNIT
cat >"$units/courtlens-win-probability-sync.timer" <<UNIT
[Unit]
Description=Sync the CourtLens win-probability scorecard (schedule)

[Timer]
OnCalendar=*-*-* 16:00:00 UTC
RandomizedDelaySec=10min
Persistent=true

[Install]
WantedBy=timers.target
UNIT
systemctl --user daemon-reload
systemctl --user enable --now courtlens-win-probability-sync.timer
systemctl --user list-timers courtlens-win-probability-sync.timer --no-pager
