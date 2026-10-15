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
Dashboard baseline: lint and typecheck pass, 518 Vitest tests pass. The first isolated full Python suite passed 2,101 tests; the final serving run passed 2,106
tests, with one existing assistant-browser fixture skip and 33 dependency warnings. Full mypy reports two existing `contents` argument-type errors in Gemini provider
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

After the final catch-up build, the marts contain 1,250 awards, 576 honours, 5,360 salary reports
and 7,732 transactions. Counts are a measured snapshot while the crawl continues, not complete coverage.
[Measured values](marts.json) include Leonard's retained September 14, 2026 trade from LAC to TOR.
Awards are retrospective season references. Their exact announcement dates are unknown;
`known_at` is the original acquisition time. They never enter historical basketball features.

```sh
cd warehouse
../.venv/bin/dbt run --profiles-dir . --target-path "$TMPDIR/dbt/target" --select tag:player_reference
../.venv/bin/dbt test --profiles-dir . --target-path "$TMPDIR/dbt/target" --select tag:player_reference
```


## Player presentation block

The Overview adds open Contract, Transactions and Career highs sections below impact and Recent
form. The current contract lists exact salaries, each season's cap share where a retained threshold
exists, options, and annual guarantees only where the finance book explicitly reports them.
Remaining guaranteed totals stay separate. A guarantee is omitted when the finance book's team,
salary schedule or observation predates a later contract event. Reported career earnings carry the
source's completeness limitation; salary history expands without hiding the total. Transactions
are newest first, with earlier entries in a disclosure. Regular-season and playoff highs remain
separate and link to source games or game lists where supplied.

Contract-event dates use the same display format as the rest of the page. The original dated source
note remains on hover. Every new section has a Basketball-Reference credit and acquisition date.
The header says "Last with" using the latest index's last team when no active listing exists,
including when the selected basketball season is older. An unknown index falls back to explicitly
observed season participation. This does not label a player retired or a free agent.

A further offline pass appended 164 profiles and skipped 569, with no failures, for 733 v2 retained
pages in total. See [the catch-up report](reparse-catchup.json). The independent crawl still runs;
newly acquired pages require a subsequent offline pass and dbt build.

Verification: Ruff and format pass; dashboard lint/typecheck pass; Vitest 524/524; isolated Python
2,106 passed, one existing browser-fixture skip. The focused sandbox Playwright set passes 26/26;
four existing player/Stats visual baselines also pass without regeneration. The final date-copy
change passes both new section checks again. Local dbt builds all six selected models, and all 21
selected dbt tests pass. Full mypy retains only the two reproduced pre-existing Gemini SDK typing
errors. No new type error was reported.

Live production sandbox checks at 1440 and 390 verify reported salaries, cap share, options,
source credits, expandable history, no page overflow, no browser or console errors, and the
last-team header. Section captures hide the sticky filter bar to keep it from covering their
headings; full-page captures retain the real page chrome.

- [Desktop player](leonard-1440.png), [phone player](leonard-390.png)
- [Desktop contract](contract-1440.png), [phone contract](contract-390.png)
- [Desktop salary history](salary-history-1440.png), [phone salary history](salary-history-390.png)
- [Last-team header on desktop](last-with-1440.png), [last-team header on phone](last-with-390.png)

Glance test, with the owner's alignment/control-kit instructions superseding earlier fixed layout
and 38–40px control rules:

| Item | 1440 | 390 | Evidence |
| --- | --- | --- | --- |
| Header | Pass | Pass | One player title, identity and actions; dated last-team evidence above |
| Filters | Pass | Pass | One shared filter bar; selected states visible; kit sizing |
| First screen | Pass | Pass | Identity and season summary lead; references follow career and impact |
| Alignment | Pass | Pass | Shared section edges, tabular right-aligned amounts and 4px spacing |
| Identity | Pass | Pass | Player portrait and team badge; salary teams retain source codes |
| Missing data | Pass | Pass | Nulls are dashes; no invented guarantees or cap shares; no raw IDs |
| Icons | Pass | Pass | Existing wrapper and kit; no new decorative icons |
| States | Pass | Pass | Existing player loading/empty paths preserved; absent reference sections omitted |
| Phone | Pass | Pass | Page widths measured exactly 1440/390; tables scroll within the section |
| Dates | Pass | Pass | Structured dates use the shared date formatter |
| First load content | Pass | Pass | Real retained references on the default player route |
| Main visual | Pass | Pass | Existing season percentile bars and career table retained |
| Color meaning | Pass | Pass | Named player/team options use contract status tokens; source links are blue |
| Source/sample context | Pass | Pass | Each reference section names its source, acquisition date and career scope |

The page is ready for owner review, not marked aligned.
