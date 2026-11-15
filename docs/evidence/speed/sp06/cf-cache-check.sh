#!/bin/bash
# SP06: run once after the owner deploys SP06 (the G1/G2 stop). GETs only.
# Each URL twice, 2 s apart. Expected:
#   .webp portrait: the first answer MISS (or HIT if someone loaded it already), the second HIT.
#   old /portrait path: DYNAMIC both times (no extension), as before; only old links use it.
#   logo and flag: cache-control from next.config.ts reaches the browser through Cloudflare.
B=https://courtlens.calebhabesh.com
for u in "$B/api/workbench/players/2544/portrait.webp?size=288&crop=face-v6" \
         "$B/api/workbench/players/2544/portrait?size=288&crop=face-v6" \
         "$B/team-logos/1610612747-5b68f7b92ba7d058.svg" \
         "$B/flags/us.png"; do
  for i in 1 2; do
    echo "### $i GET $u"
    curl -s -o /dev/null -D- "$u" | tr -d '\r' | grep -iE '^(HTTP/|cf-cache-status:|cache-control:|age:|content-type:)'
    sleep 2
  done
done
