#!/bin/bash
# cold-a.sh <label> <runs> <path>...: per run: bump the data stamp, wait until the API's generation moves, load the page once (curl, HTML complete).
S=$HOME/.cache/courtlens-tmp/sp04; label=$1; runs=$2; shift 2
cd "${REPO:?set REPO to the repository root}"
gen() { curl -s http://localhost:8180/api/cache/status | python3 -c "import json,sys; print(json.load(sys.stdin)['generation'])"; }
for path in "$@"; do
  times=()
  for i in $(seq 1 $runs); do
    before=$(gen); .venv/bin/courtlens bump-data-stamp > /dev/null
    for _ in $(seq 1 100); do sleep 0.1; [ "$(gen)" != "$before" ] && break; done
    t=$(curl -s -o /dev/null --compressed -w '%{time_total}' "http://localhost:3180$path")
    times+=($t)
  done
  echo "$label $path ${times[*]}" | tee -a $S/out/cold-a.txt
done
