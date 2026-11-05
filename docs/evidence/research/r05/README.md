# R05 — Shot Quality v2: expected points per shot

Measured 2026-11-05 on branch `research-r05`. Parent: [Research progress](../../../research-progress.md),
[Research handoff](../../../research-plan.md). Page: `/research/shot-quality` (Research → Shooting). Catalog
row 25; the ✅ is the owner's. Built under D13: plain page, finished API.

Files here: [results.json](results.json) (registration receipt, data check, selection, calibration, test, outcome
and the player persistence and league sections of the frozen results; same values, pretty-printed),
[dom-checks.json](dom-checks.json) and [browser-check.mjs](browser-check.mjs) (what the browser drew against the
API), and screenshots of the three tabs at 1440 and 390, full page and viewport, on real data.

## Design reference

The owner supplied a saved copy of Databallr's **ShotQuality RAPM** page (not fetched by the agent). It holds
the header and intro, the min-possessions and team filters, the ranked table (oTS, oSQ, oMake, oFT in points per
100 shots vs league), offence/defence/combined tabs, How to Read, Column Glossary and Methodology. That page
is a RAPM decomposition, which is **R06's** content. It has **no model card, calibration curve or per-player
shot-making view**, so CourtLens's Model and Player tabs have no reference, and the page says so. The Players
tab follows the reference's pattern: filters (season, team, minimum FGA), a ranked table in points per 100
shots relative to the league, How to read, Method. Not reproduced: the oTS/oSQ/oMake/oFT decomposition and its
defensive tabs (R06), the possession filter and the CSV download. The saved page is not committed.

## Registered first

`courtlens-expected-shot-v2` (content `1c1a2037…`) was committed on its own (`88fd291`) before any fit, after
the shot-table code (`19933ba`, no fit). It pins the twelve shot tables by content hash and fixes the target,
features, excluded features, vocabularies, baseline, reference, the three candidates and their settings, the
split, the selection gate, Platt calibration, three test gates, the bootstrap (2,000 game replicates, seed 5005),
slices, player shot-making (300 FGA minimum) and the budget (one thread, 4 GiB, 30 min per pass).

The **choice pass** (`fit`) fitted everything and scored 2022-23 only; it was read before the **test pass**
(`test`) loaded the saved models by SHA-256 and scored 2024-25 and 2025-26. Nothing changed after the choice
was read, and no analysis or serving code changed after the test was read. One code change before any real
run: the synthetic-data test found that fit timings were inside the hashed choice file, so they moved to the run
log (`fit.log.json`).

## Data check (before registering)

Every regular-season ShotChartDetail attempt 2014-15 to 2025-26 (the pinned shufinskiy archives R03 read)
joined to its PlayByPlayV3 event by (game, event number), requiring the same player, result and period.

| Season | Shots | Games | Joined | Possession known | And-ones |
| --- | ---: | ---: | ---: | ---: | ---: |
| 2014-15 | 205,550 | 1,230 | 100% | 99.72% | 4,851 |
| 2015-16 | 207,893 | 1,230 | 100% | 99.72% | 5,137 |
| 2016-17 | 209,929 | 1,230 | 99.9995% (1 player differs) | 99.68% | 5,495 |
| 2017-18 | 211,707 | 1,230 | 99.9235% (122 no event, 35 player, 5 result) | 99.56% | 5,513 |
| 2018-19 | 219,458 | 1,230 | 100% | 99.71% | 5,832 |
| 2019-20 | 188,116 | 1,059 | 100% | 99.68% | 5,034 |
| 2020-21 | 190,983 | 1,080 | 100% | 99.66% | 4,920 |
| 2021-22 | 216,722 | 1,230 | 100% | 99.67% | 5,726 |
| 2022-23 | 217,218 | 1,230 | 99.9991% (2) | 99.65% | 6,560 |
| 2023-24 | 218,701 | 1,230 | 99.9995% (1) | 99.67% | 5,970 |
| 2024-25 | 219,527 | 1,230 | 99.9995% (1) | 99.64% | 5,544 |
| 2025-26 | 219,160 | 1,230 | 99.9982% (4) | 99.61% | 5,847 |

- **Unjoined shots are kept**, with their shot-chart features and unknown context (NaN for LightGBM, an
  indicator for the logistic model). Unknown possession states (a mid-period jump ball, an unparseable clock, a
  possession conflict such as free throws after an away-from-play foul) are named per shot, never zero.
- **Assisted is excluded:** the play-by-play records an assist only on makes (0 of 1,355,809 missed shots carry
  one), so it reveals the outcome.
- **Free throws are excluded from the target:** a fouled missed shot is not a field-goal attempt and is absent
  from the shot chart, so adding and-ones alone would credit only fouled shots that went in. Expected points are
  field-goal points (2 or 3 × make probability). Shooting-foul value is R06's free-throw component.
- The possession replay was corrected twice while building the tables, before registration: team rebounds and
  team turnovers carry the team in `personId` (2.3% of 2023-24 shots were possession conflicts before the fix,
  0.07% after), and a missed and-one free throw rebounded by the shooters starts their possession at the rebound.
- **Coding drift:** generic "Layup Shot" falls from about 13,600 a season in training to about 3,300 in test; 15
  action types exist only in training seasons. Calibration on 2023-24 is the registered response.
- Counts differ from the sealed B26 admission by at most two rows per season (B26 applied six reviewed
  corrections to 2023-24 to 2025-26); v2 reads the archive rows as they are.

## What v2 changes from v1, and why

v1 (`courtload-expected-shot-v1`, sealed) fitted a linear logistic on x, y, distance, distance² and a 3-point
flag against a zone × 2/3 rate table. Both carried the same information (location only), so the 1% Brier gate
asked whether a smoother location fit beats a location table; it improved Brier by 0.081%. v2 keeps the same
1% gate and a location-only baseline (zone × distance), and changes what the candidate knows and how it learns:

1. **Information:** the NBA shot-type label (ACTION_TYPE) and pre-shot context (period, clock, margin, seconds
   since the possession began, offensive-rebound possession).
2. **Flexibility:** distance splines and gradient-boosted trees instead of linear x, y.
3. **Data:** eight training seasons (1,650,358 shots) instead of one (218,700).
4. **Chronology:** whole seasons for selection, calibration and test.

Disclosure: v1 read selection metrics of a location-only model on part of 2024-25, and 2025-26 had been
inspected before v1. No v2 choice reads either season, but they are not unseen data in the strictest sense.

## Results

**Selection, 2022-23 (uncalibrated), 217,218 shots in 1,230 games.** Relative Brier vs baseline, 95% game
bootstrap:

| Model | Brier | Log loss | ECE | Brier vs baseline |
| --- | ---: | ---: | ---: | --- |
| Baseline: zone × distance rates | 0.2315 | 0.6549 | 0.0290 | — |
| Reference: zone × shot-type rates (no gate) | 0.2266 | 0.6426 | 0.0075 | +2.11% (1.89 to 2.35) |
| Logistic, distance splines | 0.2253 | 0.6393 | 0.0146 | +2.64% (2.47 to 2.83) |
| **LightGBM, 31 leaves (selected)** | **0.2235** | **0.6351** | 0.0096 | **+3.44% (3.27 to 3.62)** |
| LightGBM, 127 leaves | 0.2237 | 0.6355 | 0.0099 | +3.37% (3.19 to 3.55) |

Gate ≥ 1%: **passed.** Fits: logistic converged in 878 of 3,000 iterations; both LightGBM models built all 600
trees with falling training loss. Calibration on 2023-24: Platt a = 0.0201, b = 0.9723 (baseline a = 0.156,
b = 1.115).

**Test, 2024-25 and 2025-26 pooled (calibrated), 438,687 shots in 2,460 games.**

| Gate | Value | 95% interval | Result |
| --- | --- | --- | --- |
| Brier ≥ 1% better, interval above 0 | **+2.56%** | Brier difference 0.0056 to 0.0062 (relative 2.44% to 2.67%) | Passed |
| Log loss better, interval above 0 | 0.0151 (+2.31%) | 0.0145 to 0.0157 | Passed |
| ECE ≤ 0.02 | **0.0102** | — | Passed |

**Outcome: accepted.** By season: 2024-25 +2.59% (2.42 to 2.76), 2025-26 +2.52% (2.36 to 2.69). The reference
table alone gets +1.42% (1.28 to 1.56) on test: most of the gain comes from the shot-type label. Before
calibration the selected model improved test Brier by 3.00% (ECE 0.0093); calibration narrowed the gap mainly by
improving the baseline (ECE 0.028 → 0.015). The gates were registered on calibrated values.

**Where it gains (test, reported, no gate):** restricted area +8.33% (7.98 to 8.67), after an own offensive
rebound +7.67%, possessions of 6 s or less +4.68%, all 2-pointers +4.58%. **On 3-pointers it is slightly worse
than the baseline: −0.28% (−0.36 to −0.19)**, above the break −0.31% (−0.41 to −0.21). Location already carries
nearly everything the free data knows about a jumper.

**Player shot-making** (2022-23 to 2025-26, 300+ FGA; 270, 261, 277 and 284 players served). The calibrated
model expects more than happened in the test seasons (league PPS 1.086 against xPPS 1.104 in 2024-25), so each
season's league term (−0.58, −0.47, −1.77, −1.67 per 100) is removed. Intervals are player-game bootstraps
and cover shot-outcome noise for a fixed model.

**Persistence (reported, no gate), 633 consecutive-season pairs, 282 players:** shot-making r = 0.625 (0.542 to
0.696); PPS minus league 0.623 (0.551 to 0.683); xPPS 0.845 (0.801 to 0.881). Shot quality (xPPS) is a stable
trait of a player's role; shot-making is about as persistent as raw scoring efficiency, not more.

## What was built

- **Data and analysis:** `domain/expected_shot_v2.py` (possession replay, metrics, Platt, bootstrap),
  `evaluation/expected_shot_v2_data.py` (archive reads by SHA-256, the join, content-hashed tables and receipts),
  `evaluation/expected_shot_v2_runner.py` (`fit`, `test`, `extract`; checks every constant against the
  registration, refuses changed tables, models or choice files, fails on non-convergence or non-finite values).
- **API (GET only, no Caddy change):** `/api/shot-quality` (model card inputs, data check, selection,
  calibration, test, gates, curves, slices, persistence, definitions, credit, reference note),
  `/api/shot-quality/players?season=&sort=&team=&minFga=` (served rows ranked, every unknown with its reason),
  `/api/shot-quality/player?playerId=` (served seasons; default rule: most FGA in 2025-26, Jaylen Brown).
- **Page:** Players (season, team, minimum FGA, rank by shot-making / xPPS / PPS / FGA), Model, Player. Menu
  item under Shooting, `scatter` icon. Shot-making cells are green above and red below expectation via a new
  optional `tone` on the shared `TableCell`; xPPS stays neutral. The shared `ReliabilityPlot` gained an optional
  label and data attributes; its default output is unchanged.
- No hash-pinned module, sealed B26 protocol, frozen model or scoring was touched.

## Checks against the data

| Check | Result |
| --- | --- |
| Tables | two builds before registration and one after formatting: all 12 content hashes identical to the pins |
| Reproducibility | three full runs (a, b, c; c with the final code): byte-identical choice files, model hashes and results `dd859539…`; choice pass 140 s, 2.4 GiB peak; test pass 31 s, 1.3 GiB |
| Page vs API, 1440 and 390, three tabs | **9,970 values, 0 mismatches**, 0 console errors, 0 px overflow (two seasons' full boards, every metric, gate, curve bin and chart point, slice, persistence and data row, the player history) |
| Frozen results (pytest) | results hash, registration receipt, evidence extract, selection rule and gate arithmetic, test gates and outcome, counts equal to the tables, every player-season's status and shot-making formula, service ranking, filters and default rule |

## Checks

| Check | Result |
| --- | --- |
| Ruff, format | clean (998 files) |
| Strict mypy | clean (341 source files) |
| Python tests | **2,528 passed, 1 skipped, 8 failed**: the 8 known `test_agent_providers.py[anthropic]` SDK failures. 11 new tests pass |
| Vitest | 722 passed |
| Dashboard lint, typecheck | clean |
| Playwright, targeted | `r05-shot-quality.spec.ts` (5 tests) plus R04, R03, route consolidation, header, research FO12 and advanced research: **33 passed** against a production build and the mock API on private ports |
| Full Playwright | **not run**: 5.9–8.0 GiB available against the ~12 GiB it needs. R03's and R04's debt is still open, now with R05's |

## Not verified

- **Full Playwright suite** (R03, R04, R05), for the memory reason above.
- **Hosted demo:** not deployed.
- Full-page captures leave lazy-loaded photos blank; the viewport shots show them.
