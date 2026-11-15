#!/usr/bin/env bash
# SP07: GET / on every proxied hostname of the zone, twice; print what a visitor would notice.
set -u
for host in calebhabesh.com www.calebhabesh.com courtlens.calebhabesh.com doorbell.calebhabesh.com linewatch-dev.calebhabesh.com; do
  for run in 1 2; do
    curl -s -o /dev/null --max-time 20 \
      -w "$host run$run status=%{http_code} redirect=%{redirect_url} type=%{content_type} bytes=%{size_download} total=%{time_total}s http=%{http_version}\n" \
      "https://$host/"
  done
  curl -s -o /dev/null -D- --max-time 20 "https://$host/" | grep -iE '^(cf-cache-status|cache-control|server):' | tr -d '\r' | sed "s/^/  $host /"
done
