#!/bin/bash
# make_patch.sh: SP05's changes only (excludes the peer pager session's files and hunks) -> $P/sp05.patch
set -e
R=/home/ethioking/dev/courtlens; S=$HOME/.cache/courtlens-tmp/sp05; P=$S/patch; mkdir -p $P; rm -f $P/*.patch
SHARED="src/courtlens/api/routers/workbench.py dashboard/lib/types.ts tests/integration/test_stats_presentation_postgres.py dashboard/components/workbench-player-explorer.tsx"
PEER="src/courtlens/api/workbench_schemas.py dashboard/app/globals.css dashboard/components/hotkeys-modal.tsx dashboard/components/stats-explorer.css dashboard/components/ui/icon.tsx scripts/clean_scratch.sh"
cd $R
EXCL=""; for f in $SHARED $PEER; do EXCL="$EXCL :(exclude)$f"; done
git diff --binary HEAD -- . $EXCL > $P/1-mine.patch
python3 $S/tools/hunks.py keep src/courtlens/api/routers/workbench.py 2,3,4,5 $P/2-workbench.patch
python3 $S/tools/hunks.py keep dashboard/lib/types.ts 0 $P/3-types.patch
python3 $S/tools/hunks.py keep tests/integration/test_stats_presentation_postgres.py 1 $P/4-test.patch
python3 $S/tools/hunks.py keep dashboard/components/workbench-player-explorer.tsx 0,2,3,4,5,6,7,10,11,12,16,17,18,19,20,21 $P/5-explorer.patch
# new files of mine (untracked), excluding the peer's
for f in $(git ls-files --others --exclude-standard); do
  case "$f" in dashboard/components/ui/pager*|dashboard/lib/pager.ts|dashboard/.m-tmp.mjs) continue;; esac
  git diff --no-index --binary /dev/null "$f" >> $P/6-new.patch || true
done
/bin/ls -la $P
