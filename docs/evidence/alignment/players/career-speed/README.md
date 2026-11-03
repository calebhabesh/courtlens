# Player career table: load time — 2026-10-14

Owner: the main player statistics table is "really slow sometimes", loading "row by row" (for
example Giannis), while Databallr's records "load very quickly", as if pre-loaded or indexed. Make
the data load as fast and efficiently as possible, with a durable and comprehensive fix.

## Cause (measured against the local API, Giannis `203507`, Overview view)

- The browser built the table after the page loaded: one Stats query per season, three at a time,
  plus a multi-season query for the Career row (13 + 1 requests for Giannis).
- Each season query aggregated and ranked that season's whole league (~536 players) to return one
  row: 0.6–1.9 s cold (0.48 s SQL, 0.20 s row parsing, 0.08 s ranks), 0.05 s when cached.
- The in-memory cohort cache held 8 entries; a 13-season table needs 26 (cohort + rank reference
  per season), so it evicted itself. A reload cost the full 4.3–4.7 s again; rows appeared from
  0.9 s to 4.3 s. Every view tab (Shooting, Advanced, …) started over; the Career row alone took
  2.7–3.9 s.
- The one-player Career aggregate re-scanned the identity table once per game (917 seq scans,
  114 ms): no index matched the name join on `(kind, external_id)`.

## Changes (Stats values and ranks unchanged)

- **Persisted cohort store** (migration `15b810a4f013`, `services/stats_cohort_store.py`): each
  season's whole-league Stats rows and table ranks, computed once and kept in PostgreSQL behind
  the in-memory cache, so restarts, workers and other players' pages reuse them. The key binds the
  scope (release, dataset, signature, season, phase, cutoff, query, impact and DARKO artifacts),
  the dataset row fingerprint, player names, the tracking feed observations of that season and
  the serving code itself; any change makes a new key and supersedes the old entry. Only ready
  (immutable) workbench datasets persist. Writes use their own READ COMMITTED connection under a
  per-scope advisory lock; a failed write is logged and the request still served.
- **One read for the whole table**: `GET /api/workbench/players/{id}/career?phase=` returns every
  season row with its league ranks (one indexed read of stored entries) and the Career row, which
  aggregates only that player's games (`subject_player_ids`; every Stats value is per player, so
  it equals the player's row in the whole range cohort; ranks are refused for a subset).
- **Server-rendered**: the player page requests it beside the profile, so the rows are in the
  HTML. Rows carry every column, so view tabs and counting modes switch with no request.
- Index `(kind, external_id)` on `workbench_identities`: Career aggregate 114 ms → 7 ms.
- Query hashes bind impact artifacts without assembling every player's impact values
  (`impact_artifacts`, 46 ms → ~3 ms per career read); the SQL impact payload is limited to the
  players a query reads.
- `courtlens warm-stats-cohorts` stores every covered season (62 here: 38 s, 118 MB of rows) and
  prunes other releases; `scripts/deploy-vps.sh` runs it after each deploy.

## Results

| | Before | After |
| --- | --- | --- |
| Giannis career table, server | 13 + 1 requests, 4.3–4.7 s, rows trickle in | 1 request, 48 ms |
| Same, HTTP end to end | — | 69 ms (112 KB) |
| Player page (dev server, `/players/203507`) | table filled 0.9–4.3 s after the page | TTFB ~50 ms, all 13 rows in the HTML |
| Reload / view tab / counting mode | full cost again | no request |
| Stats season, first view after restart | 0.6–1.9 s | 140–390 ms (stored) |
| Season not stored yet (before warm-up) | — | computed once (~0.8 s each), then stored |

## Verification

- `tests/integration/test_player_career_postgres.py` (10): career rows equal each season's Stats
  row (metrics, ranks, qualification, position) and the Career row equals the range query;
  a fresh process serves career and Stats from the store without aggregating; appended games
  and a new tracking observation supersede exactly the affected entries; unready datasets never
  persist; subject aggregation equals cohort rows; `season_context` equals a resolved context;
  4 concurrent writers store one entry with no errors; warm-up builds once and prunes.
- `tests/unit/test_stats_cohort_store.py` (keys bind rows, names, joined tracking and code;
  rank-carrying scopes) and `test_impact_serving.py` (artifacts equal `impact_for_query`'s).
- A concurrency stress run against the local database (5 trials × 4 writers with a superseded
  entry) first exposed a deadlock, then serialization and `rowcount = -1` errors; all three are
  fixed and covered by the concurrent-writer test.
- Full Python suite 2,084 passed (1 skipped); Ruff, mypy clean. Dashboard lint/typecheck clean,
  Vitest 504 passed, Playwright 459 passed (27 skipped) in a sandbox; the career spec now asserts
  the browser never requests `/career` and that view switches stay request-free.
- Fresh-database migration: upgrade, downgrade one revision, upgrade.
