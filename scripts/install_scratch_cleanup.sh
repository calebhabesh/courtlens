#!/usr/bin/env bash
# Install an hourly systemd user timer that runs scripts/clean_scratch.sh.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
units="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
mkdir -p "$units" "$HOME/.cache/courtlens-tmp"

cat >"$units/courtlens-scratch-clean.service" <<EOF
[Unit]
Description=Remove stale CourtLens scratch workspaces from /tmp

[Service]
Type=oneshot
Nice=19
IOSchedulingClass=idle
ExecStart=$root/scripts/clean_scratch.sh
EOF

cat >"$units/courtlens-scratch-clean.timer" <<EOF
[Unit]
Description=Hourly CourtLens scratch cleanup

[Timer]
OnBootSec=10min
OnUnitActiveSec=1h
Persistent=true

[Install]
WantedBy=timers.target
EOF

systemctl --user daemon-reload
systemctl --user enable --now courtlens-scratch-clean.timer
systemctl --user list-timers courtlens-scratch-clean.timer --no-pager
