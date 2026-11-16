#!/bin/bash
# cold-a-idle.sh <label> <runs> <path>: as cold-a, but 32 s idle before each bump, so the 30 s source-facts memo has expired.
S=$HOME/.cache/courtlens-tmp/sp04; label=$1; runs=$2; path=$3
cd "${REPO:?set REPO to the repository root}"
gen() { curl -s http://localhost:8180/api/cache/status | python3 -c "import json,sys; print(json.load(sys.stdin)['generation'])"; }
times=()
for i in $(seq 1 $runs); do
  sleep 32
  before=$(gen); .venv/bin/courtlens bump-data-stamp > /dev/null
  for _ in $(seq 1 100); do sleep 0.1; [ "$(gen)" != "$before" ] && break; done
  times+=($(curl -s -o /dev/null --compressed -w '%{time_total}' "http://localhost:3180$path"))
done
echo "$label idle $path ${times[*]}" | tee -a $S/out/cold-a.txt
