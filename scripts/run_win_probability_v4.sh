#!/usr/bin/env bash
# Run one courtlens-win-probability-v4 stage under its registered budget (2 CPUs, 3072 MiB with
# no swap, 1800 s), in a systemd user service so the cap covers the whole process tree.
# Usage: scripts/run_win_probability_v4.sh <checks|select|check|publish|final>
#        scripts/run_win_probability_v4.sh <parity|latency|platform-write>   (W3 freeze checks)
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
python="${COURTLENS_PYTHON:-$root/.venv/bin/python}"
module=courtlens.evaluation.win_probability_v4
case "$1" in parity|latency|platform-write) module=courtlens.evaluation.win_probability_v4_checks ;; esac
cpus="$(python3 -c 'import os; print(",".join(map(str, sorted(os.sched_getaffinity(0))[:2])))')"
exec systemd-run --user --no-ask-password --wait --pipe --collect \
  --unit="courtlens-wp4-$1-$$" \
  --working-directory="$root" \
  --property=MemoryMax=3072M --property=MemorySwapMax=0 \
  --property=CPUQuota=200% --property=AllowedCPUs="$cpus" \
  --property=RuntimeMaxSec=1800s --property=KillMode=control-group --property=OOMPolicy=kill \
  --setenv=PYTHONPATH="$root/src" --setenv=PYTHONHASHSEED=2501 \
  --setenv=OMP_NUM_THREADS=2 --setenv=OPENBLAS_NUM_THREADS=2 --setenv=MKL_NUM_THREADS=2 \
  "$python" -m "$module" "$@"
