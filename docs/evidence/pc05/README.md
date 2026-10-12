# PC05 — Dated player metadata, roster context and injury adapters

State: **verification_blocked**. Real roster/position/measurement metadata is admitted;
official injury reports and transaction history still lack real ingestion evidence.
G2 was cleared by the owner's “Begin the next block” instruction. PC04's retained
glance issues remain unresolved. PC06 has not started.

## Measured real data

[Admission](admission.json), [acquisition](acquisition.json),
[API measurements](api-measurements.json), [derived all-team roster](roster-all.json),
[Toronto roster](roster-tor.json), [paged index](index-page.json), [catalog](catalog.json).

The direct NBA CDN index failed its robots check. The admitted fallback is the NBA Stats
player index mirrored by SportsDataverse hoopR, pinned to revision
`7f2c0afa616977bc4a747fa982c1429c2ce3e78a`, ending-year file `2027.json`, which explicitly
declares `2026-27`. Raw JSON SHA-256:
`24f958e5f70a1eec07880661b8477bbbbe04b6549acd1a54f94d394a6d997675` (1,113,916 bytes).
Raw bytes remain under the ignored content-addressed server store, never an API download.

Dataset `027dff96-a2fd-4d54-9833-f76e2bc0248f` was observed at
`2026-10-11T22:43:18.814432Z`. It admits 5,240 identities, including 622 explicitly
active players across all 30 teams, with no rejected rows. Active team IDs and abbreviations
match the canonical NBA team registry. The 59 historical entries without positions stay null.
Listed height/weight are separate from combine measurements. Unknown roster status does not
mean inactive; a retired player's source team field does not become a current association.
Provider career PTS/REB/AST are excluded from normalized metadata and analytical hashes.

The API's projected roster joins current association to server-computed 2025–26 regular-season
reference statistics from an explicit published release. It does not filter those prior facts
by the player's current team. Of 622 roster members, 486 have admitted references and 136 do
not; missing references remain null. Toronto has 21 entries, with 15 references. The bound
statistics release contains zero current-season regular-season appearances; the response says
**no minutes observed in that release**, not that every player is healthy or available.

Single local GET timings: all-team roster 261.6 ms (290,659 bytes), Toronto 246.4 ms
(10,912 bytes), index page 4.3 ms. These are measurements, not a p95 claim.
[Read-only check](read-only-check.json) verifies unchanged ingestion counts and all 161
publication pointers. [Before](pointers-before.json) and [after](pointers-after.json)
also match across schema installation and ingestion. No old dataset membership or forecast
was changed. The independent metadata input is explicitly pinned; the existing historical
release catalog does not claim to bind it.

## Source limits

[Source checks](source-checks.json) retain the bounded preflight outcomes and hashes.
NBA CDN and ESPN returned 403 for robots.txt. The injury host's robots.txt allowed the path,
but `Injury-Report_2026-10-11_05_00PM.pdf` returned 403. Those hosts were stopped for the
run without bypasses or repeated probes. This establishes failures for these checks,
not universal publisher availability. Preflight timestamps are explicitly recorded as retained
file mtimes, not reconstructed acquisition timestamps.

The reusable fetcher initially mishandled gzip transport by decoding already-decoded bytes.
The [failed receipt](failed-acquisition.json) is retained. A regression tests a compressed
robots response and compressed index, including the larger crawl delay. The subsequent live
acquisition succeeded and its retained bytes match the independently sampled pinned blob.

Official injury parsing uses `pdftotext -layout`, with an aware report timestamp, explicit
game/team/status/reason fields, wrapped reasons and not-submitted team observations. Unsupported
layout, contradictory context and duplicate grain reject the candidate rather than produce
an empty valid report. ESPN stays secondary, with ESPN IDs. Names cannot establish NBA identity;
only explicit verified crosswalks are frozen into an admission. A later mapping edit cannot
change an old report. No entry is unknown, never healthy; no injury prediction is produced.
PDF extraction and both source adapters are verified with clearly fictional fixtures only.
`poppler-utils` is added to the runtime Dockerfile; that Docker image has not been built here.

Transactions require a versioned operator import of explicit official evidence. The importer
never converts roster differences into trades, signings or waivers. The JSON root has
`schema: nba-transactions-v1`, a canonical `season`, and nonempty `transactions`. Rows carry
`transaction_id`, `player_id` (verified NBA ID), `type`, an official `source_url`, nullable
`from_team_id` / `to_team_id`, and separate `announced_date` / `effective_date`. A null effective
date needs `effective_date_unknown_reason`. Unrelated raw fields are excluded. No real
transaction file was admitted in this block; no source date is invented to fill the gap.

## Implementation and verification

Migration `11b810a4f009` adds three isolated ledger tables. Each acquisition creates a dated
dataset observation, while normalized versions deduplicate by source/kind/season/entity/content.
Memberships have composite foreign keys for both dataset scope and exact version identity.
PostgreSQL rejects update/delete/truncate, post-commit membership extension and changes to
bound raw provenance. There is no ordinary admin bypass for the PC05 ledger. Same-acquisition
admission is idempotent; A→B→A has three observations and two versions.

Typed GET endpoints under `/api/workbench/player-context` expose `/catalog`,
`/datasets/{dataset_id}` (bounded pages) and `/rosters` (explicit `datasetId`, optional `teamId`
and `statisticsReleaseId`). `knownAt` requires an aware timestamp and cannot select a later
observation. Reads do not download, seed crosswalks, admit data, build marts or publish.

- Focused suite: **33 passed**, including PostgreSQL guards, composite identity checks,
  pinned API cutoffs/paging, a current-team/prior-team counterexample, an unchanged earlier
  statistical result after new roster observations, frozen crosswalks, actual fixture PDF
  extraction, HTTP gzip handling, robots blocking and migration upgrade/downgrade.
- Full Python suite: **1,884 passed**, one existing browser-prerequisite skip,
  19 published-data deselections and one existing Google GenAI/Python 3.14 deprecation
  warning (267.94 s). [Final log](verification/python.log). Final focused checks
  were rerun after transaction null-date normalization and cross-run host cooldown handling.
- Ruff and format: clean. Strict mypy: clean (215 source files).
- [Offline migration SQL](verification/migration.sql) generated successfully.
- No dashboard code changed, so no new Vitest, Playwright, build or glance-test claims.
- Checks and real reads used a separate API on port 8101. The owner's existing dashboard
  processes on ports 3000 and 3100 were retained. Earlier galleries were not running when
  checked; this block did not restart or replace them.

Logs: [verification](verification/). Reproduce:

```sh
.venv/bin/alembic upgrade head
.venv/bin/courtlens acquire-player-context --source hoopr_player_index \
  --url https://raw.githubusercontent.com/sportsdataverse/hoopR-nba-stats-raw/7f2c0afa616977bc4a747fa982c1429c2ce3e78a/nba_stats/json/playerindex/2027.json
# Use the returned acquisition ID; importing the same ID reuses that observation.
.venv/bin/courtlens import-player-context --acquisition-id <retained-acquisition-id>
# For a local official report, supply --local-file, --source nba_injury_report and its exact URL.
.venv/bin/uvicorn courtlens.api.app:create_app --factory --host 127.0.0.1 --port 8101
.venv/bin/python docs/evidence/pc05/verify-real.py
.venv/bin/python scripts/test_python.py -q
.venv/bin/ruff check .
.venv/bin/ruff format --check .
.venv/bin/mypy src/courtlens
```

The captured real-data verifier pins this admission and its roster counts; it is a reproduction
check, not a future freshness test. PC13 owns scheduling and coherent hosted publication.
Later consumers must bind these metadata inputs explicitly and respect their evidence dates.
