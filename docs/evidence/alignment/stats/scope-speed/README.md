# Stats phase and season changes: load time — 2026-10-13

Owner: "the regular/playoffs/cupfinal/playin filters, as well as changing years, is really slow,
and spikes my fans" (position chips were fixed earlier with the cohort cache).

## Cause

The 2000-01 backfill grew `workbench_player_games` from about 105k to 883k rows. A new phase or
season is a cold cohort, and each cold Stats request:

- scanned the whole table three times (base rows plus DARKO and tracking coverage checks): there
  was no index for dataset + season + phase;
- re-ran the full aggregation a second time only to count rows;
- ranked about 80 percentile columns over rows carrying ~22 KB of impact support each, then
  round-tripped that support through SQL, JSON decoding and the cohort cache;
- recomputed release-wide catalog coverage (two catalog calls per navigation, ~0.5 s each).

## Changes (results unchanged)

- Migration `14b810a4f012`: index `(dataset_id, season, phase, game_date)` on player games.
- Exports (the cached whole cohort) read one row past the bound instead of a separate count query.
- Percentile windows rank a narrow projection (player + values) and join back.
- SQL receives only the support fields it reads (`qualified`, `covered_games`, `denominator`); the
  cohort cache stores that slim support and each served page reattaches the full sealed support.
- Published (`ready`) datasets cache their season list, date bounds and catalog coverage. Rows are
  sealed against update/delete but can be appended, so each cache key carries a row-count and
  latest-date fingerprint (index-only, ~12 ms); the first version without it served stale scopes
  to 25 assistant integration tests that append rows, which now pass.

Verification: full Python suite 2,063 passed (1 skipped); Postgres presentation, agent tools and
agent loop suites 73/73; strict mypy and Ruff clean. Dashboard unchanged (Vitest 459).

Equivalence: nine scopes through `execute_stats_query` (Overview with DARKO/impact/tracking, an
Impact preset, team filter, last 10, playoffs, a 5-season range), export and paged paths, against
the committed code and its original impact module: identical. Five full `/query` endpoint responses
(three seasons/phases, the Impact preset, a position filter) from the committed tree and the new
tree: byte-identical.

## Measured (dev servers, real data, click to table ready)

| Step | Before | After | API query before → after |
|---|---|---|---|
| Phase → Playoffs | 6.5 s | 1.2 s | 4.3 s → 0.47 s |
| Phase → Cup Final | 3.7 s | 0.8 s | 1.8 s → 0.14 s |
| Phase → Play-In | 3.8 s | 1.2 s | 1.9 s → 0.44 s |
| Season → 2024-25 | 7.0 s | 2.5 s | 5.0 s → 1.4 s |
| Season → 2023-24 | 6.9 s | 2.4 s | 4.9 s → 1.4 s |
| Revisit a season | 2.3 s | 1.2 s | 0.3 s → 0.12 s |
| Catalog request | ~0.5 s ×2 | 7 ms | |

About 1 s of each step is the Next development server rendering; a production build removes most
of it. SQL for one Overview season: 1.95 s → 0.66 s.
