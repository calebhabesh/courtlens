#!/usr/bin/env bash
# W3 freeze check: score v4's platform reference inside the hosted API container (arm64) and
# compare with the PC's probabilities (registered limit 1e-9). Run from the PC after a deploy that
# includes courtlens.evaluation.win_probability_v4_checks. The reference goes in on stdin; the
# container reads only the Original's model files it already mounts, and writes nothing.
#   scripts/win_probability_v4_platform_check.sh   # prints the result, saves it as evidence
set -euo pipefail
cd "$(dirname "$0")/.."
SSH_HOST="${COURTLENS_SSH_HOST:-vps}"
DATA="${COURTLENS_DATA_DIR:-data}"
reference="$DATA/derived/win-probability-v4/platform-reference.json"
[[ -f "$reference" ]] || { echo "No $reference; run scripts/run_win_probability_v4.sh platform-write" >&2; exit 1; }
out=docs/evidence/win-probability-v4/platform-arm64.json
ssh -o BatchMode=yes -o ConnectTimeout=15 "$SSH_HOST" \
  "cd /home/ubuntu/apps/courtlens && docker compose --env-file secrets.env --env-file release.env exec -T api python -m courtlens.evaluation.win_probability_v4_checks platform-check --reference -" \
  < "$reference" | tee "$out.tmp"
mv "$out.tmp" "$out"
