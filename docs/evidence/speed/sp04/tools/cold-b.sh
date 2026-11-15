#!/bin/bash
# cold-b.sh <label> <pages...>: per page, a fresh API process (cache on), then one capture of the page.
# WAIT_WARM=1: wait until the warm start reports done (and log its timings and RSS) before the page.
S=$HOME/.cache/courtlens-tmp/sp04; label=$1; shift
cd "${REPO:?set REPO to the repository root}"
for page in "$@"; do
  $S/start-api.sh true "$label-fresh-$page" > /dev/null
  if [ "${WAIT_WARM:-0}" = 1 ]; then
    until curl -s http://localhost:8180/api/cache/status | grep -q '"state":"done"'; do sleep 0.1; done
    pid=$(ss -ltnpH "sport = :8180" | grep -o "pid=[0-9]*" | head -1 | cut -d= -f2)
    echo "label=$label-warmed-$page warm=$(curl -s http://localhost:8180/api/cache/status | python3 -c 'import json,sys; print(json.dumps(json.load(sys.stdin)["warm_start"],separators=(",",":")))') rss_kb=$(grep VmRSS /proc/$pid/status | awk '{print $2}')" >> $S/out/api-starts.txt
  fi
  scripts/speed/capture_reads.py --api http://localhost:8180 --listen 8181 --dashboard http://localhost:3180 --only "$page" --out "$S/out/coldb-$label-$page.json" > /dev/null
  python3 -c "import json,sys; p=json.load(open(sys.argv[1]))['pages'][0]; print(sys.argv[2], p['name'], p['seconds'], len(p['reads']), 'reads')" "$S/out/coldb-$label-$page.json" "$label"
done
