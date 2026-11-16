#!/bin/bash
# portrait_bytes.sh: the same query at /portrait and /portrait.webp must give identical bytes and headers
S=$HOME/.cache/courtlens-tmp/sp06
A=http://localhost:8180/api/workbench/players; same=0; diff=0
for q in "2544|size=288&crop=face-v6" "2544|size=64&crop=face-v6" "2544|size=192&season=2003-04&team=CLE&crop=face-v6" \
         "2544|size=128&season=2011-12&team=MIA&crop=face-v6" "2544|size=96&season=2019-20&team=LAL&crop=face-v6" \
         "1449|size=288&crop=face-v6" "1449|size=192&season=1991-92&team=BOS&crop=face-v6" \
         "1643411|size=128&crop=face-v6" "203999|size=96&season=2015-16&team=DEN&crop=face-v6" \
         "201142|size=192&season=2007-08&team=SEA&crop=face-v6" "201142|size=64&season=2016-17&team=GSW&crop=face-v6" \
         "2544|" "1449|"; do
  id=${q%%|*}; p=${q#*|}
  a=$(curl -s -D $S/.h1-$$ "$A/$id/portrait?$p" | sha256sum | cut -c1-16)
  b=$(curl -s -D $S/.h2-$$ "$A/$id/portrait.webp?$p" | sha256sum | cut -c1-16)
  ha=$(grep -iE '^(content-type|content-length|cache-control|x-portrait-season|HTTP)' $S/.h1-$$ | tr -d '\r' | sort | tr '\n' ' ')
  hb=$(grep -iE '^(content-type|content-length|cache-control|x-portrait-season|HTTP)' $S/.h2-$$ | tr -d '\r' | sort | tr '\n' ' ')
  if [ "$a" = "$b" ] && [ "$ha" = "$hb" ]; then same=$((same+1)); r=same; else diff=$((diff+1)); r=DIFFERENT; fi
  echo "$r $id ?$p  sha256 $a / $b  | $ha"
done
rm -f $S/.h1-$$ $S/.h2-$$
echo "identical: $same, different: $diff"
