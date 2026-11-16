#!/bin/bash
# start-api.sh <cache true|false> <label>: start the API on :8180, wait for its first answer, log start time and RSS.
S=$HOME/.cache/courtlens-tmp/sp04
$S/kill-port.sh 8180; sleep 1
cd "${REPO:?set REPO to the repository root}"
t0=$(date +%s.%N)
COURTLENS_READ_CACHE=$1 COURTLENS_CORS_ORIGINS='["http://localhost:3180","http://localhost:3181"]' setsid .venv/bin/uvicorn courtlens.api.app:create_app --factory --port 8180 > $S/api-$2.log 2>&1 < /dev/null &
until curl -s -o /dev/null http://localhost:8180/api/cache/status; do sleep 0.05; done
t1=$(date +%s.%N)
pid=$(pgrep -f "uvicorn courtlens.api.app:create_app --factory --port 8180" | head -1)
echo "label=$2 cache=$1 pid=$pid start_s=$(python3 -c "print(round($t1 - $t0, 2))") rss_kb=$(grep VmRSS /proc/$pid/status | awk '{print $2}')" | tee -a $S/out/api-starts.txt
