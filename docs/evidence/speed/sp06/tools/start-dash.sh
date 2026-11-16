#!/bin/bash
# start-dash.sh <tree (before|after)> [port]: production standalone dashboard (real data)
S=$HOME/.cache/courtlens-tmp/sp06; P=${2:-3180}
$S/tools/kill-port.sh $P; sleep 1
cd $S/$1/dashboard/.next/standalone
PORT=$P HOSTNAME=127.0.0.1 COURTLENS_API_INTERNAL_URL=http://localhost:8180 setsid node server.js > $S/dash-$1-$P.log 2>&1 < /dev/null &
until curl -s -o /dev/null http://localhost:$P/; do sleep 0.1; done
echo "dashboard $1 up on $P"
