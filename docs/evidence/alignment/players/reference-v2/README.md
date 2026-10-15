# Retained player reference data

Owner instructions: player 44–48 and Stats 80 in the alignment catalog. Parser and marts are
separate commits; UI evidence follows with the player page block. Alignment needs owner review.

## Parser block

`bbref-player-v2` reads salaries, current contract seasons/options/notes, dated transactions and
regular-season/playoff game highs. `courtlens reparse-bbref` verifies retained bytes and appends
new versioned profiles. It preserves each page's acquisition time, identity match and hash.
Crawl freshness no longer depends on parser version. No source requests were made.

The existing crawl remained live. After one sample player and the initial bulk pass, the resumed
run appended 199 profiles, skipped 370 existing v2 outputs and rejected none. See
[the offline report](reparse.json). This covers the input snapshot at that run's start; the crawl
continues to append pages, so a later offline pass includes its remaining inputs.

The initial pass exposed `(TW)`, exact dollar amounts followed by `(TW)`, and `< $Minimum`.
The parser now preserves these labels and admits only exact dollar amounts. Unknown amounts
stay null. Four retained samples (Leonard, James, Jokić, Antetokounmpo) contain contract seasons,
options, dated events, salaries and separate regular-season/playoff highs.

Verification: 14 synthetic/unit/CLI tests pass, including no HTTP during reparse, byte corruption,
append-only lineage, original observation time and idempotent reruns. Ruff and format checks pass.
Dashboard baseline: lint and typecheck pass, 518 Vitest tests pass. The isolated full Python suite
is running. Full mypy reports two existing `contents` argument-type errors in Gemini provider
lines 140 and 146, reproduced from the unchanged HEAD file. The changed parser and service have
no reported type errors.

Rerun from the repository root:

```sh
export TMPDIR="$HOME/.cache/courtlens-tmp"
.venv/bin/courtlens reparse-bbref --report "$TMPDIR/bbref-reparse-v2.json"
.venv/bin/pytest tests/unit/test_bbref_players.py -q
.venv/bin/ruff check .
.venv/bin/ruff format --check .
```

Do not start `acquire-bbref-bios` while the owner's crawl is running. No task-owned server uses
3100 or 8000.

## Warehouse block

Five local dbt models build successfully: latest retained profile staging plus awards, honours,
salary reports and transactions. All 19 dbt tests pass. The PostgreSQL fixture test executes the
actual model SQL and checks newest-parse selection, MVP vote place, exact salary arithmetic,
latest matching cap threshold, missing historical thresholds, ABA exclusion, explicit trade
teams and event/observation time separation.

At this build, the marts contain 1,200 awards, 540 honours, 4,305 salary reports and 5,161
transactions. Counts are a measured snapshot while the crawl continues, not complete coverage.
[Measured values](marts.json) include Leonard's retained September 14, 2026 trade from LAC to TOR.
Awards are retrospective season references. Their exact announcement dates are unknown;
`known_at` is the original acquisition time. They never enter historical basketball features.

```sh
cd warehouse
../.venv/bin/dbt run --profiles-dir . --target-path "$TMPDIR/dbt/target" --select tag:player_reference
../.venv/bin/dbt test --profiles-dir . --target-path "$TMPDIR/dbt/target" --select tag:player_reference
```
