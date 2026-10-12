# PC07 — Season-level stats feeds: play types, tracking, matchups, lineups, combine, draft

State: **verified** for the ingested scope (2025-26 season feeds, 2000–2026 drafts, pbpstats
totals and team lineups). pbpstats WOWY was **not** ingested; see "Deviations". Contract:
[stats feeds v1](../../design/stats-feeds-v1.md).

## Real observations

[Run report](run-report.json), [re-admission](readmission.jsonl), [pinned revision](revision.json),
[coverage](coverage.json), [integrity](integrity.json), [marts](marts.json),
[catalog capabilities](catalog-capabilities.json), [SQL sealing](sql-sealing.json),
[read-only check](read-only-check.json), [acquire log](verification/acquire.log).

One serial run from 2026-10-11T23:43:42Z to 2026-10-12T00:00:33Z made **205 fetches: all HTTP 200**
(171 hoopR mirror files pinned to commit `7f2c0afa616977bc4a747fa982c1429c2ce3e78a`, 34 pbpstats
requests), with robots.txt checked per request (both hosts answer 404, so no path is disallowed),
the identifying policy-v2 user agent and the registry intervals (1 s mirror, 5 s pbpstats).
73,132,186 raw bytes sit in the ignored content-addressed store; nothing raw is served or committed.

- **194 admitted on first pass; 11 rejected** by the strict parser, and those rejections were correct
  to surface:
  - The 2025-26 regular-season matchup file declares `SeasonYear: "2025"`, not `"2025-26"`. Every
    one of its 147,303 rows carries `SEASON_ID 22025` (2025-26 regular season). The parser now
    accepts a start-year declaration **only** for this endpoint and **only** when every row's
    `SEASON_ID` proves the scope; coverage records `season_established_by: row SEASON_ID`.
  - Ten combine files (2001–2003 and 2005–2006 drafts, anthro and stats) each list one participant
    with `PLAYER_ID -1`, an NBA Stats placeholder. The row is kept with an unknown identity, keyed
    `unidentified:row:N`, never by name; coverage counts `unidentified_rows: 1`.
- The 11 retained acquisitions were then re-admitted from their stored bytes (no refetch). The
  revised parser produces identical output for every input the first pass accepted: all 194
  earlier datasets still verified before re-admission.
- Re-admitting the matchup file exposed a real bug: the version lookup sent 147k keys as one
  `IN` list, past PostgreSQL's bind-parameter limit. The transaction rolled back with nothing
  written; the lookup is now chunked, and verification uses a join.
- Final: **205 datasets, 200,690 row versions/memberships; 205/205 verify** (retained bytes
  re-parsed, membership and row hashes recomputed).

**Empty observations (unknown, not zero):** 2025-26 playoff matchups, and the cut, misc, offensive
rebound and transition **defensive** play types in both phases (NBA Stats publishes no defensive
splits for these). **Truncated at the source cap:** the three regular-season hoopR lineup files
(2,000 rows each), pbpstats regular-season player totals (500 of the league; lowest 103 minutes)
and 26 of 30 pbpstats team lineup files (500 each; only DEN, HOU, MIA and MIN fit under the cap).

## Marts and spot checks

`dbt build --select tag:stats_feed`: **44/44 pass** (10 models, 34 data tests;
[log](verification/dbt.log)). Rows: play types 6,886; tracking (long form) 170,725; defense
4,771; hustle 803; season matchups 147,303; lineups (advanced) 3,442; draft combine 1,873;
draft history 1,602; pbpstats player totals 730.

Spot checks against known facts ([marts.json](marts.json)): Shai Gilgeous-Alexander leads 2025-26
isolation possessions (449, 1.163 PPP); the 2025 draft opens Cooper Flagg (DAL), Dylan Harper,
VJ Edgecombe, Kon Knueppel, Ace Bailey; Khaman Maluach has the 2025 combine's longest wingspan
(90.75 in). pbpstats and NBA tracking minutes agree exactly for the five highest-minute players.

## Catalog, immutability and isolation

`GET /api/workbench/catalog` (in-process, 439 ms single request) now declares `play_types`,
`tracking`, `defensive_tracking`, `hustle`, `matchups`, `lineups`, `combine` and `on_off` as
**partial**, with observed seasons and phases, empty feeds and truncated feeds in their
limitations. `on_off` is labeled a pbpstats possessions/plus-minus cross-check, not on/off splits.
`draft_metadata` keeps its pre-existing release-based entry.

Real SQL against the owner database rejects update, delete, truncate, membership extension and
provenance changes. All **161** publication pointers match [before](pointers-before.json) and
[after](pointers-after.json); feed counts are unchanged across reads. No research release,
snapshot or Stats result is touched (also asserted in the PostgreSQL test).

## Checks

Focused: 37 unit/PostgreSQL checks (scope agreement, URL allowlist, declared-parameter rejection,
start-year proof, placeholder identity, null/empty/truncation semantics, traded-player rows,
duplicate rejection, A→B→A versions, tamper detection, capability text, 403/429 host stop, SQL
sealing, frozen migration upgrade/downgrade). Full suite, Ruff/format and strict mypy:
[python.log](verification/python.log), [ruff.log](verification/ruff.log),
[mypy.log](verification/mypy.log). Dashboard checks are not rerun for this backend-only block.

## Deviations

- **pbpstats WOWY not ingested.** It needs one request per team and player combination; the plan's
  WOWY need is better met by deriving it from lineups in PC11, or by recording the gap there. Owner
  may prefer otherwise.
- Only `Totals` files are admitted; per-game and per-possession rates are derived downstream.
- Only 2025-26 season feeds were run. Other seasons are one command away but unobserved.

## Reproduction

```bash
.venv/bin/alembic upgrade head
.venv/bin/courtlens acquire-stats-feeds --revision 7f2c0afa616977bc4a747fa982c1429c2ce3e78a \
  --season 2025-26 --draft-year 2000 … --draft-year 2026 --report run-report.json
.venv/bin/courtlens verify-stats-feeds
(cd warehouse && ../.venv/bin/dbt build --profiles-dir . --select tag:stats_feed)
.venv/bin/python docs/evidence/pc07/verify-real.py
```

Elsewhere, fetch fresh inputs and keep the new receipts; never copy installation IDs into another
database. `verify-stats-feeds` needs the runtime raw store.
