#!/bin/bash
# round.sh <tree (before|after)> <n>: one measuring round on a fresh stack of that tree
set -e
S=$HOME/.cache/courtlens-tmp/sp06; R=/home/ethioking/dev/courtlens; T=$1; N=$2; O=$S/out/rounds; mkdir -p $O
$S/tools/start-api.sh $T; $S/tools/start-dash.sh $T
for i in $(seq 150); do curl -s localhost:8180/api/cache/status | grep -q "\"warm_start\":{\"state\":\"done\"" && break; sleep 2; done
cd $R
scripts/speed/measure.py --base http://localhost:3180 --api-base http://localhost:8180 --label fill-$T-$N --runs 1 --out-dir $O > /dev/null 2>&1 || true
scripts/speed/measure.py --base http://localhost:3180 --api-base http://localhost:8180 --label warm-$T-$N --out-dir $O > $O/warm-$T-$N.txt 2>&1
cd $S/before/dashboard
SPEED_REAL=1 SPEED_NAV_OUT=$O/nav-$T-$N.json PLAYWRIGHT_EXTERNAL_SERVER=1 PLAYWRIGHT_BASE_URL=http://localhost:3180 \
  npx playwright test e2e/speed-navigation.spec.ts --workers 1 --reporter line > $O/nav-$T-$N.log 2>&1
cd $S/tools && node lcp-cls.mjs http://localhost:3180 $T-$N $O/lcp-$T-$N.json 5 2> $O/lcp-$T-$N.log
echo "round $T $N done $(date +%T)"
