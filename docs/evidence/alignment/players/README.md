# Player page (alignment row 2) — 2026-10-13

Owner instructions 1–17 (agreed in a design interview) meld Databallr's in-table career view into
`/players/[id]`. Captures are real local FastAPI/PostgreSQL data through the dev server.

## What changed

- **Back to table (Esc).** Stats player links carry `from=stats` and save the table URL plus page and
  table scroll in session storage. Only such a visit shows the button; it (or Esc, when no dialog,
  menu or listbox is open) returns to the identical Stats URL and restores the scroll. A direct
  visit has no button.
- **Header.** Photo, name (the page's one `h1`), team · listed position · jersey, then Age, Listed
  (height in shoes · weight), Experience, Draft, Pre-draft and Country. A "YYYY Combine" line
  (barefoot, in shoes, wingspan, reach, weight) appears only with a combine record. Missing values
  are omitted. Age is as of the page's Through date and dated outside the current season.
  Actions are icons (favorite, compare, export) plus Explore.
- **Season summary.** PTS, REB, AST, TS%, DPM, MPG from the player's Stats row and cohort, without
  the gold edge; the cohort sentence is now an info tooltip.
- **Career table.** The Stats table look with seasons as rows, newest first, only seasons with
  games: the same view tabs and counting modes, Regular/Playoffs (which navigates the page phase),
  per-season percentiles against that season's Stats cohort, a sticky Career row from one exact
  multi-season query (season-only metrics such as DPM stay blank), "Career since 2000-01" plus a
  coverage note when earlier seasons are outside the data, a traded-season expander with per-team
  stints, and row clicks that set the page season. It replaces the 26 server-side profile requests
  the old career table made on every page load.
- **Removed from Overview:** Production Trajectory (now heads Game Log), Participation Stints
  (folded into the expander), Prospective Forecast Status, the old career table, and the impact
  card's sample table and model note (the card keeps its values). Measurements is now **Combine**
  and hidden without a combine record (`?tab=measurements` still opens it).

## New free source: NBA Stats player listings (hoopR mirror)

`courtlens acquire-player-bio` admits `playerindex` (all-time index; end-year label) and
`commonteamroster` (each team's roster per season; start-year label) through the existing stats-feed
admission (append-only, hashed, payload scope checked). Run at pinned hoopR commit `5d5f9ea`:
index 2026-27 plus 2000-01..2025-26 rosters, 781 planned, **777 admitted**, 0 rejected; the 4 misses
are franchise gaps (New Orleans 2000-02, Charlotte 2002-04) [report](bio-acquisition.json).
dbt marts `mart_player_roster_seasons` (11,872 rows) and `mart_player_bio` (5,242) pass their
tests. Coverage of players in CourtLens data: 2,598/2,896 in the index, 2,361 with a birth date,
11,694/13,683 player-seasons with that season's roster listing. A season's own roster listing
supplies jersey, size and experience; the index supplies country, college and draft.

## Measured

[measurements.json](measurements.json): Jokić (11 seasons), LeBron (23, with the 2003 combine line),
Garnett 2015-16 ("Career since 2000-01", age dated "as of Apr 13, 2016"): no page errors, zero
horizontal overflow at 1440 and 390, summary `box-shadow: none`. Harden 2021-22 expander:
BKN 44 GP and PHI 21 GP. Load (dev server): shell 1.1–1.3 s, first season row 2.5–2.7 s, every
row plus Career 8.6 s (Jokić) and 12.9 s (LeBron, 23 seasons). Stats round trip: same URL, table
scroll restored.

Captures: [Jokić 1440](jokic-1440.png), [Jokić 390](jokic-390.png), [LeBron 1440](lebron-1440.png),
[Garnett career since](garnett-career-since-1440.png), [Harden stints](harden-traded-stints-1440.png).

## Verification

Dashboard lint, typecheck, Vitest 463/463. Python ruff, format, strict mypy; full suite 2069 passed
(new bio-scope feed tests and a PostgreSQL bio service test). Browser: new `player-career` spec
(3), updated `players-fo09`, `pc11-gated-pages`, `pc12-headlines` (the player trajectory moved off
first load per instruction 2, so its PC12 entry and two baselines are retired), player profile
baselines regenerated; the player set passes 13/13 twice. Unrelated failures already present in the
working tree: `table-interactions` guide modes (re-clicking the selected divider pill), the workbench
"Filter by season" and Teams strict-mode checks, and the Stats phone baseline (controls reflow).
Only the owner marks the page aligned.
