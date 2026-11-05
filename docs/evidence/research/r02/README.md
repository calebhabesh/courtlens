# R02 — Six-Factor RAPM page with Impact Tree

Measured 2026-11-05 on branch `research-r02`. Parent: [Research progress](../../../research-progress.md),
[Research handoff](../../../research-plan.md). Page: `/research/rapm/six-factor`. Catalog row 18; the
✅ is the owner's.

Files here: [bundle-check.json](bundle-check.json) (every player and node against the bundle),
[tree-dom-checks.json](tree-dom-checks.json) (what the browser drew against the API),
[verify_against_bundle.py](verify_against_bundle.py), and screenshots of the page and six tree cases at
1440 and 390, all on real data.

## Do the intervals exist? Yes, no new protocol

Checked in the served bundle `3cfdb968…`. All 12 one-year regular-season fits (2014-15 to 2025-26) have
an interval for RAPM, ORAPM, DRAPM and all six factors. Values without an interval: **0**. Every served
value sits inside its own 80% interval, and every served value has 200 replicates. So **no new
`courtlens-…-v1` interval registration or fit was made**; the page reads `courtlens-impact-intervals-v1`.

Two real gaps, both shown as unknown:

- **Playoff one-year fits have no intervals** (2023-24 to 2025-26): 166 served values. The registration covers regular seasons only. They also have no second-stage weights,
  so composites and archetypes are unknown there. Only 7 to 17 players per playoff fit have any
  qualified value.
- **Estimates below display qualification.** The bundle holds an interval but a null value. The page
  treats the whole node as unknown, because an interval around a hidden estimate would reveal it.

## How far the six factors reconstruct RAPM

From `courtlens-six-factor-reconstruction-v1` (R01), unchanged: seconds-weighted regression of RAPM on
the six factors, among players qualified for all seven.

| Season | Players | In-sample R² | 10-fold CV | Cross-season |
| --- | ---: | ---: | ---: | ---: |
| 2014-15 | 250 | 0.962 | 0.960 | – |
| 2015-16 | 253 | 0.959 | 0.957 | 0.958 |
| 2016-17 | 254 | 0.959 | 0.957 | 0.959 |
| 2017-18 | 252 | 0.960 | 0.957 | 0.959 |
| 2018-19 | 262 | 0.965 | 0.963 | 0.962 |
| 2019-20 | 223 | 0.958 | 0.955 | 0.957 |
| 2020-21 | 223 | 0.955 | 0.950 | 0.953 |
| 2021-22 | 248 | 0.960 | 0.959 | 0.959 |
| 2022-23 | 241 | 0.964 | 0.962 | 0.959 |
| 2023-24 | 230 | 0.958 | 0.955 | 0.953 |
| 2024-25 | 245 | 0.966 | 0.964 | 0.963 |
| 2025-26 | 253 | 0.955 | 0.952 | 0.951 |

So **0.955–0.966 in-sample, 0.950–0.964 held out**, not the commonly quoted 0.985. The page states this
in a tile, in How It Works and in Caveats. The API reads a byte-identical copy in
`evaluation/research/frozen/` (the Docker image has no `docs/`); a unit test holds the two equal.

## What was built

- **Explainer, after Databallr's layout:** framework grid with each factor's regression weight, how it
  works, factor tabs with the ten largest estimates and their intervals, Net Efficiency vs Possession
  Control, six archetype cards, caveats. Credit to Databallr, Dean Oliver, Rosenbaum (2004) and Sill
  (2010) is on the page. databallr.com was not fetched; no data came from it.
- **Sortable table:** every served column with its interval, unknowns last in both directions.
- **Impact Tree:** RAPM → ORAPM/DRAPM → six factors, for any player, from the picker, a table row or a
  card. Each node has its value, interval and an interval mark on a shared axis with zero marked.
- **Links:** the Stats Six Factor preset shows "How Six-Factor RAPM works".
- **New code only:** `services/six_factor_research.py`, `api/routers/six_factor.py` (GET only, so no
  Caddy change), `components/six-factor-research.*`, `lib/six-factor-research.ts`. No hash-pinned module,
  frozen model or scoring was touched. Nothing was fitted.

**Net Efficiency and Possession Control are CourtLens's definition,** not Databallr's numbers: each
factor times its season's second-stage weight, shooting factors on one axis and turnover and rebounding
factors on the other. With the intercept they add to the reconstructed RAPM exactly (checked for 2,934
player-seasons). **They have no interval:** the bundle keeps no replicates to combine, so they are
points only, and the page says so.

**Archetypes** are fixed rules over players with all nine values, one card per player; the rule is
printed on each card and the largest estimate is described as a selection rule, not a verdict. 2025-26
gives Embiid, Goodwin, Daniels, Wembanyama, Javonte Green and Clingan.

**RAPM tab.** Kept as the second tab, renamed RAPM Ratings at `/research/rapm`: it holds the 1Y/2Y/3Y and
BPR table and the sealed `courtload-rapm-v1` status, which the new page does not repeat. Six-Factor is
the first tab and the menu entry, renamed from RAPM Research with the same icon and description. The old
redirect from EPV still lands on `/research/rapm`. The tab's "No uncertainty interval is served" note was
now false and points to the Six-Factor tab instead.

## Tree checks

**Against the bundle:** `verify_against_bundle.py` runs the page's code for every player in all 15
one-year scopes: **64,098 nodes, 0 mismatches** in value, low or high, compared with exact equality, and
the table's nodes equal the tree's.

**In the browser, real data, 1440 and 390** ([checks](tree-dom-checks.json)). Each node's exact value is
on the element and is compared with the API. 0 mismatches and 0 console errors in all 14 views.

| Case | Player | Result | Screenshot |
| --- | --- | --- | --- |
| Full | Kawhi Leonard 2025-26, LAC | RAPM +9.61 (+6.31 to +12.28); rebuilt from factors as +9.10 | [1440](tree-full-1440.png), [390](tree-full-390.png) |
| Full, older season | LeBron James 2018-19, LAL | RAPM +5.38; requests `season=2018-19&team=LAL`, logo `lal-2018` | [1440](tree-full-history-1440.png), [390](tree-full-history-390.png) |
| Partial | Jakob Poeltl 2025-26, TOR | oREB and dREB unknown, the other seven shown; rebuild unknown | [1440](tree-partial-1440.png), [390](tree-partial-390.png) |
| Factors, no RAPM | Kevon Looney 2025-26, NOP | RAPM, ORAPM, DRAPM and four factors unknown; oTS and dTS shown | [1440](tree-factors-only-1440.png), [390](tree-factors-only-390.png) |
| Rated rookie | Cooper Flagg 2025-26, DAL | All nine shown; RAPM +0.33 (−2.75 to +3.36) | [1440](tree-rookie-rated-1440.png), [390](tree-rookie-rated-390.png) |
| Rookie with no row | AJ Dybantsa 2025-26 | All nine unknown, "not zero"; no team claimed | [1440](tree-rookie-no-row-1440.png), [390](tree-rookie-no-row-390.png) |

Whole page: [1440](six-factor-1440.png), [390](six-factor-390.png). For these full-page captures the
sticky filter bar was made static and the off-screen skip link hidden; both otherwise paint mid-page in a
full-page capture. A plain viewport shot at scroll 0 shows them correctly.

A season with no fit (2026-27, or before 2014-15) gets an explanation and a button to the latest fit, not
an error. Stats defaults to 2026-27, so its link lands here until that season is sealed.

## Step 0: the Playwright debt from `e50b564`

First valid full run on `e50b564`: **509 passed, 17 skipped, 5 failed**. All five were stale tests or
baselines, no product bug, fixed in their own commit:

- `route-polish` "research without a catalog": `/research/rapm` renders no catalog-scoped field. Moved to
  `/research/shooting/aftermath`, which does.
- `route-consolidation`: a one-tab page shows no tab bar; item names now include descriptions.
- `whats-new` baselines (2): the Blog tab was removed on purpose.

**Also found: a flash on Player Twins, not fixed.** On a phone the match rows run 52 px wide for a moment
before settling, under load. It failed the suite twice on R02's build, so it was traced: clean `e50b564`
shows the same in 16 of 120 loaded runs, 0 px every time 1.2 s later. It predates R02 and that first run
passed by luck. `player-twins.spec.ts` now polls for the settled page. The flash itself is left for the
owner to prioritize.

## Checks

| Check | Result |
| --- | --- |
| Ruff, format | clean (977 files) |
| Strict mypy | clean (328 source files) |
| Python tests | **2,475 passed, 1 skipped, 8 failed**, the same 8 `test_agent_providers.py[anthropic]` failures as R01: the installed Anthropic SDK rejects an `httpx2` client. 10 new tests pass |
| Vitest | 713 passed |
| Dashboard lint, typecheck | clean |
| Full Playwright | **523 passed, 17 skipped, 0 failed**, against a production build on private ports. 17 skipped: `im06-real` (12), `assistant-panel-real` (2), `compare-overhaul`, `win-probability`, `workspace-persistence` (1 each) |

## Not verified

- **Hosted demo:** not deployed. Its pinned bundle predates intervals, so nodes would show interval
  unknown until R12 refreshes it.
- **Interval widths are not coverage.** They are a game-resampling spread at a fixed penalty (R01's
  registration), so true uncertainty is larger.
- **The picker chip** shows the player's current photo, as a career-level identity shared with every
  picker. The tree's own photo and every table, card and leaderboard photo are season-correct.
