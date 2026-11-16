#!/usr/bin/env bash
# SP08: sample `docker stats` on the VPS about every 2 s (each call itself takes ~1-2 s) for $1 seconds.
# Output lines: <unix time> <container> <cpu%> <mem used> / <mem limit> <mem%>
set -u
end=$(( $(date +%s) + ${1:-1800} ))
while [ "$(date +%s)" -lt "$end" ]; do
  t=$(date +%s)
  docker stats --no-stream --format '{{.Name}} {{.CPUPerc}} {{.MemUsage}} {{.MemPerc}}' | sed "s/^/$t /"
  sleep 1
done
