#!/bin/bash
# start-dash.sh <build dir (before|after)> <internal api url>: production dashboard on :3180
S=$HOME/.cache/courtlens-tmp/sp04
$S/kill-port.sh 3180; sleep 1
cd $S/$1/dashboard/.next/standalone
PORT=3180 HOSTNAME=127.0.0.1 COURTLENS_API_INTERNAL_URL=$2 setsid node server.js > $S/dash-$1.log 2>&1 < /dev/null &
until curl -s -o /dev/null http://localhost:3180/; do sleep 0.1; done
echo "dashboard $1 up, internal api $2"
