# R04 — zTS

Measured 2026-11-05 on branch `research-r04`. Parent: [Research progress](../../../research-progress.md),
[Research handoff](../../../research-plan.md). Page: `/research/zts` (Research → Shooting). Catalog row 24;
the ✅ is the owner's. Built under D13: plain page, finished API.

Files here: [validation.json](validation.json) (the registration receipt, inputs, FTA check, coverage and
validation sections of the frozen results, same values, pretty-printed), [dom-checks.json](dom-checks.json)
and [browser-check.mjs](browser-check.mjs) (what the browser drew against the API),
[verify_volume.py](verify_volume.py) (minutes, usage and TS add recomputed from the served bundle), and
screenshots of the three tabs at 1440 and 390, full page and viewport, on real data.

## Design reference

The owner supplied a saved copy of Databallr's zTS page (not fetched by the agent). It holds the full About
tab and the Top 200 tab's markup (season select, Reg/Post, search; columns #, Yr, Player, MIN, USG, rTS,
Role, zTS, SV/100). **The Player tab was not rendered in the save**, so CourtLens's Player tab is built
without a reference, from the About tab's play-type mix and season-history sections. The page says so.
The saved page is not committed.

## Registered first

`courtlens-zts-validation-v1` (content `ea4e1d15…`) was committed on its own (`6be3fe2`) before any zTS,
correlation or error existed. It fixes the FTA rule, the coverage and dropped-row rules, the minimums
(200 TSA, 0.90 coverage), the weights, choice seasons (t = 2015-16 to 2017-18) and test seasons
(predictive t = 2018-19 to 2024-25; tracking t = 2018-19 to 2025-26), the paired player-cluster bootstrap
(2,000 replicates, seed 4004), the verdict rule and the budget (one thread, 3 GiB, 15 min). A choice-only
run was read first (`--choice-only`) to check counts and references. Nothing changed after it, and no
analysis code changed after the test pairs were read.

## What the data allows (checked before building)

- **FTA cannot be derived exactly.** Synergy rows carry free-throw-trip and and-one rates, not attempts,
  and no 3PM, so PTS − 2·FGM mixes 3PM and FTM. On 2,013 single-team player-seasons (coverage ≥ 0.98,
  ≥ 300 box FGA) the best proxy, 2·(trips − and-ones) + and-ones, is 0.956 of box FTA at the median
  (0.827 to 1.010, 5th to 95th percentile), with 0 exact matches. **Play-type TS is CourtLens's own
  definition:** PTS / (2 × possessions × (1 − turnover share)). It is not Databallr's number.
- **The source drops rows.** No listed offensive row has fewer than 10 possessions, and each row's share is
  relative to the player's whole Synergy total, so the missing share is known exactly. When more
  possessions are missing than the absent types could hold (9 each), a whole row was dropped (Malik
  Beasley 2023-24 has no spot-up row). Those player-seasons are unknown (`source_rows_missing`): 145 in
  2023-24, 40 in 2024-25, 39 in 2025-26, none before. Databallr estimates missing frequencies; CourtLens
  does not.
- **Seasons:** 2015-16 to 2025-26, regular season. 2026-27 has no play-type rows or sealed rTS; playoffs are
  outside the registration.

## Definitions and choices

- **rTS** is the Stats table's `impact_rts` (served bundle, one-year regular-season extras): player TS −
  league TS with TS = PTS / (2 × (FGA + 0.44 × FTA)) on the sealed play-by-play season. Not a new rTS.
- **League play-type TS** is pooled over every listed offensive row of the same season, weighted by
  scoring possessions; the season's own average is used (descriptive, not a forecast). League Synergy TS is
  the same ratio over all types, so a league-average mix has difficulty exactly 0 (checked every season).
- **Expected TS** = Σ share × league type TS, shares of the player's listed scoring possessions.
  **Difficulty** = league TS − Expected TS. **zTS** = rTS + difficulty. Difficulty is in play-type TS units
  and is added to box-unit rTS; the page says so.
- **Served zTS** needs ≥ 200 TSA, ≥ 0.90 coverage and no dropped row. Every other player-season has one
  named reason. Of 5,970 player-seasons: 3,329 served; 2,229 under 200 TSA; 224 source rows missing; 132
  under 90% covered; 32 no rTS; 24 no play types.
- **No per-player interval:** season totals have no resampling unit below the season.

## Results: the registered test

Weighted Pearson correlations, pooled test seasons, 95% paired player-cluster bootstrap intervals.

| Target | Rows / players | r, rTS | r, zTS | zTS − rTS in r | Verdict |
| --- | ---: | --- | --- | --- | --- |
| Next season's rTS | 1,651 / 526 | 0.640 (0.588–0.682) | 0.506 (0.451–0.552) | **−0.134 (−0.160 to −0.107)** | rTS better |
| Same-season oTS RAPM | 2,364 / 712 | 0.408 (0.346–0.469) | 0.543 (0.487–0.592) | **+0.135 (+0.104 to +0.164)** | zTS better |

Next-season rTS, weighted MSE ×10⁴: rTS 13.30, zTS 16.93; gain −3.62 (−4.35 to −2.87), rTS better.
Difficulty alone correlates −0.352 (−0.438 to −0.260) with next season's rTS and +0.189 (+0.118 to +0.251)
with oTS RAPM. Choice seasons agree: −0.132 (−0.173 to −0.095) and +0.153 (+0.118 to +0.190).

By test season (unadjusted), every interval excludes zero in the same direction: predictive from −0.088
(2024-25) to −0.213 (2020-21); tracking from +0.100 (2024-25) to +0.196 (2019-20).

**Reading.** The verdict splits. zTS agrees better with a player's same-season shooting impact, which is
the claim Databallr makes for it. It predicts next season's raw rTS worse: a hard role persists, and next
season's rTS still carries the penalty that zTS removed. This is the registered comparison of the efficiency
terms alone. Databallr's own test (zTS add against oTS RAPM, R²) is not reproduced.

## Agreement with the reference (descriptive)

The saved Databallr page lists Role +4.0 for Harden 2018-19, +0.2 for Curry 2015-16 and +2.6 for
Shai Gilgeous-Alexander 2025-26. CourtLens serves +4.0, +0.2 and +2.6. Minutes match (SGA 2,259) and
scoring usage is close (33.7 against 33.3; Databallr counts actual free-throw possessions, CourtLens
uses 0.44 × FTA). rTS differs slightly for the same reason. This is a spot check, not a test.

## What was built

- **Analysis:** `domain/zts.py` (mix, dropped-row rule, league references, statuses, weighted metrics,
  paired bootstrap, verdict) and `evaluation/zts_runner.py`. No optimiser is used; the runner fails on any
  non-finite metric and checks its constants against the registration.
- **API (GET only, no Caddy change):** `/api/zts` (definitions, references, validation, coverage, credit),
  `/api/zts/leaderboard?season=<season|all>&sort=<zts|zts_add>&limit=` (ranked served rows plus every
  unknown with its reason), `/api/zts/player?playerId=&season=` (mix with player and league TS per type,
  contributions that add to Expected TS, season history). Minutes, scoring usage (100 × TSA / offensive
  possessions), TS add and zTS add (2 × usage × zTS) come from the served impact bundle, not from the frozen
  results. zTS add follows the TS-add arithmetic Databallr describes; it is not SV/100, whose formula is not
  published.
- **Page:** About (play-type TS by type, the calculation, a two-player comparison, the distribution with
  minute filters, easiest and hardest roles, the registered test, the season leaderboard, coverage and
  method), Top 200 (all seasons or one, ranked by zTS add or zTS; Post is disabled), Player. Rules named on
  the page: the default pair (hardest and easiest role, 1,000+ minutes, usage 25+), extremes (1,000+
  minutes), bands (hard ≥ +2, easy ≤ −2, middle within ±1), default player (highest zTS add/100 in
  2025-26). Menu item under Shooting, `scale` icon.
- **Not reproduced from the reference:** SV/100, the add-stat R² and baseline study, the team playtype
  table, the X/Y explorer, position and scoring-usage filters, the shot-quality and PPP studies.
- No hash-pinned module, frozen model or scoring was touched.

## Changes after the test was read (serving and presentation only)

The frozen results file and its hash did not change. After the test pairs were read: the service gained
the bundle's minutes, usage and TS add; the default player rule moved from highest zTS (it opened on a
low-usage centre) to highest zTS add; and absent play types in the pair chart read as not listed instead
of 0%.

## Checks against the data

| Check | Result |
| --- | --- |
| Reproducibility | Four runs (two before the page work, two with the final code) give results `ecc5ae9f…` and byte-identical files; 5–8 s, 821 MiB peak |
| Page vs API, 1440 and 390, three tabs | **3,346 values, 0 mismatches**, 0 console errors, 0 px page overflow |
| Volume vs bundle | 19,974 values (minutes, usage, TS add, zTS add, zTS, and TS add = 2 × usage × rTS) recomputed from the bundle, **0 mismatches** |
| Served results | registration and results hash, every status and reason, zTS − rTS = difficulty, Expected TS recomputed from the served mix, league difficulty 0, predictive point metrics recomputed from served values |

## Checks

| Check | Result |
| --- | --- |
| Ruff, format | clean (991 files) |
| Strict mypy | clean (336 source files) |
| Python tests | **2,517 passed, 1 skipped, 8 failed**: the 8 known `test_agent_providers.py[anthropic]` SDK failures. 24 new tests pass |
| Vitest | 719 passed |
| Dashboard lint, typecheck | clean |
| Playwright, targeted | `r04-zts.spec.ts` (5 tests) plus R03, route consolidation, header, research FO12 and advanced research: **28 passed** against a production build and the mock API on private ports |
| Full Playwright | **not run**: 8.3–9.6 GiB available, swap full, against the ~12 GiB it needs. R03's debt is still open |

## Not verified

- **Full Playwright suite** (R03 and R04), for the memory reason above.
- **Hosted demo:** not deployed.
- Signed values have explicit signs but no green/red colour: there is no shared class for it, and plain
  build pages add no page CSS. Left for the design pass.
- Full-page captures leave lazy-loaded photos blank; viewport shots show them.
