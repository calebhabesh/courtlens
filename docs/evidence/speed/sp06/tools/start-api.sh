#!/bin/bash
# start-api.sh <tree (before|after)>: API on :8180 from that tree's src, cache and warm start on
S=$HOME/.cache/courtlens-tmp/sp06
$S/tools/kill-port.sh 8180; sleep 1
cd /home/ethioking/dev/courtlens
PYTHONPATH=$S/$1/src COURTLENS_READ_CACHE=true COURTLENS_WARM_START=true COURTLENS_CORS_ORIGINS='["http://localhost:3180","http://localhost:3181"]' \
  setsid .venv/bin/uvicorn courtlens.api.app:create_app --factory --port 8180 > $S/api-$1.log 2>&1 < /dev/null &
until curl -s -o /dev/null http://localhost:8180/api/cache/status; do sleep 0.1; done
echo "api $1 up"
