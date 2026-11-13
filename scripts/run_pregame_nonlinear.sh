#!/usr/bin/env bash
# Run courtlens-pregame-nonlinear-v1 under its registered budget (1 CPU, 1024 MiB with no swap,
# 600 s), in a systemd user service so the cap covers the whole process tree.
# Usage: scripts/run_pregame_nonlinear.sh [--output <path>]
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
python="${COURTLENS_PYTHON:-$root/.venv/bin/python}"
cpu="$(python3 -c 'import os; print(sorted(os.sched_getaffinity(0))[0])')"
exec systemd-run --user --no-ask-password --wait --pipe --collect \
  --unit="courtlens-pregame-nonlinear-$$" \
  --working-directory="$root" \
  --property=MemoryMax=1024M --property=MemorySwapMax=0 \
  --property=CPUQuota=100% --property=AllowedCPUs="$cpu" \
  --property=RuntimeMaxSec=600s --property=KillMode=control-group --property=OOMPolicy=kill \
  --setenv=PYTHONPATH="$root/src" --setenv=PYTHONHASHSEED=2501 \
  --setenv=OMP_NUM_THREADS=1 --setenv=OPENBLAS_NUM_THREADS=1 --setenv=MKL_NUM_THREADS=1 \
  "$python" -m courtlens.evaluation.pregame_nonlinear "$@"
