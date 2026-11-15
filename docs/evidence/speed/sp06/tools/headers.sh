#!/bin/bash
# headers.sh <label>: response headers (GET, body discarded) for each static file type
A=http://localhost:8180; D=http://localhost:3180
for u in "$A/api/workbench/players/2544/portrait?size=288&crop=face-v6" \
         "$A/api/workbench/players/2544/portrait.webp?size=288&crop=face-v6" \
         "$D/team-logos/1610612747-5b68f7b92ba7d058.svg" \
         "$D/team-logos/bos-1977-4571e077bce6b1e7.png" \
         "$D/flags/us.png" \
         "$D/_next/static/chunks/2evgu094glu3w.js"; do
  echo "### GET $u"; curl -sD- -o /dev/null "$u" | tr -d '\r' | grep -iv '^date:'; done
