# PC08 Contracts views and Free Agency removal (gate G3)

Parent: [presentation clarity PC08](../../presentation-clarity-plan.md#pc08-contracts-and-free-agency-views-gate-g3).
**PC08 is implemented and stops at G3 for owner approval.** PC09 has not started.

## What changed

- **`/contracts` (league, first load with no parameters):** resolves the latest admitted 2026-27
  finance refresh and writes it to the URL (`?refresh=`). Headline: a 30-team payroll board
  (known reported salary on one shared scale, with cap / tax / first apron / second apron lines
  told apart by dash pattern and legend). KPI tiles, then a team table.
- **`/contracts/[team]`:** team header and switcher; KPI tiles; cap utilization `ThresholdBar`;
  payroll `Sankey` (known roster salary → position group → player; stacked bars below 768px);
  position and high-earner `Donut`s; contract `TimelineGrid` 2026-27 → 2031-32 with status colors
  and legend; roster table with 2025-26 GP/MPG/PTS/REB/AST and sealed 2025-26 RAPM; a separate
  list for players on the team's source page who are on another roster in the index.
- **Free Agency removed (D3):** route, navigation entry and search entry deleted; `/free-agency`
  redirects to `/contracts` (307).
- **B30 book explorer kept** at `/contracts/books` ("Retained source books", linked from Data
  details). Its finance-query-v1 behavior, import/correction workflow and tests are unchanged;
  only its path, title and the removed Free Agency link changed.
- **Backend:** read-only `GET /api/workbench/operations/finance/refreshes/{id}/teams` and
  `/refreshes/{id}/teams/{team}` (`services/finance_views.py`). They read only the pinned refresh,
  its book, its NBA index dataset and its threshold record.
- **Chart kit (v1.2 amendment):** status `reported` (`--color-status-reported`, `#d0d788`), because
  a BRef salary without an option marker is reported, not confirmed guaranteed. `TimelineGrid`
  gains opt-in `absent="not-listed"`: a season the source lists nothing for is a neutral
  "Not listed" cell; a listed blank stays hatched Unknown. The default is unchanged.

## Semantics kept

- Unknown salaries are excluded from every total and chart and labeled with their reason
  ("Blank on source page", "Not on source page"); none is $0. Every total is labeled a lower bound.
- Threshold lines are official markers. No cap room, tax bill or apron status is claimed; the
  "Known salary minus cap" tile is labeled as arithmetic on known salaries.
- Options are reported markers; exercise and guarantee state stay unknown.
- Players on a team's BRef page but on another roster in the index (10 league-wide, e.g. Damian
  Lillard on MIL, Bradley Beal on PHX) are listed separately. Their reported amounts count in
  that team's known source-page total, as the source lists them, but not as roster players.
- 2025-26 references are prior-season numbers, not forecasts. RAPM is the sealed descriptive fit.

## Real-data results (refresh `95b5fe42…`)

[league.json](league.json), [team-DEN.json](team-DEN.json), [team-MIL.json](team-MIL.json),
[refreshes.json](refreshes.json). 464 of 622 active players have a reported salary. Highest known
payroll: NYK $227.7M (17/21 known). DEN: $221.1M known, 14/21, Jokić $59.0M with a 2027-28 player
option and 2025-26 RAPM +6.9. MIL lists Lillard's $22.5M separately.

[Read-only check](read-only-check.json): 161 publication pointers (same SHA-256) and all finance
and identity row counts unchanged across endpoint reads. Five sequential local requests: league
91–183 ms (9.3 KB); team with reference stats 461–623 ms (18.7 KB); team without 172–278 ms.
These are single-machine measurements, not p95 claims.

## Extended glance test

Production build, real data, no URL parameters, 1440×900 and 390×844
([screenshots](screenshots/), [measurements](measurements.json)). P = pass, ~ = partial,
- = not applicable. Items 1–10 are the overhaul test; 11–14 are the clarity additions.

| Route | Score | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `/contracts` | 11/13 | P | - | P | ~ | P | P | P | ~ | P | P | P | P | P | P |
| `/contracts/[team]` | 11/14 | P | ~ | P | ~ | P | P | P | ~ | P | P | P | P | P | P |

PC04 scored both finance pages 3/12. Notes:

- **3:** headline tiles at 154px and first chart at 278px (league) / 382px (team) on desktop.
- **2:** the team page has no filter bar; its team switcher sits in the header actions.
- **4:** right-aligned tabular numbers checked; full-page 4px alignment not measured.
- **8:** the loading state is generic skeleton blocks, not the final layout.
- **9:** no page overflow at 390px; every phone control is at least 40px. On desktop only, the
  shared Data details button measures 28px (header component used on every page; not changed here).
- **Visual quality:** with 14–18 players the Sankey's leaf labels are small; the exact flow
  table below it carries every value.

## Checks

- Python: 7 new tests (`tests/unit/test_finance_views.py`). [Full suite](verification/python.log):
  1,988 passed, 1 existing browser-prerequisite skip, 19 published-data deselections. Ruff,
  format and strict mypy clean.
- Dashboard: lint 0 errors / 0 warnings; typecheck clean; Vitest 59 files / 415 tests passed.
- Playwright (external server: `e2e/mock-api.mjs` + production build, because the owner's server
  holds port 3100): new `e2e/contracts.spec.ts` (4) and all `finance.spec.ts` (8) pass; Contracts
  first-load and book-explorer baselines regenerated; obsolete Free Agency/team-workspace
  baselines deleted. The full suite at 2 workers had 123 failures, about 60 of them browser
  crashes with 4 GB of free memory. Rerun on one worker, all but three passed. Those three
  (`chart-kit.spec.ts:74`, `entity-selection.spec.ts:64`, `:70`) fail identically on a build of
  HEAD `2c6c2c3`, so they predate PC08.
- The full browser run overwrote 101 sealed `docs/evidence/dl0x` screenshots (the DL evidence
  specs write there). All were restored with `git checkout`; none are part of this commit.
