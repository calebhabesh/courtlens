#!/bin/bash
# build-real.sh <tree (before|after)>: Turbopack production build against the real API on :8180
set -e
S=$HOME/.cache/courtlens-tmp/sp06; D=$S/$1/dashboard
cd $D && rm -rf .next
NEXT_TELEMETRY_DISABLED=1 NEXT_PUBLIC_COURTLENS_API_URL=http://localhost:8180 npx next build > $S/build-$1.log 2>&1
cp -r public .next/standalone/public
mkdir -p .next/standalone/.next && cp -r .next/static .next/standalone/.next/static
echo "built $1"
