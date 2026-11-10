# R06 — ShotQuality decomposition and Defensive Shot Quality

Measured 2026-11-05 on branch `research-r06`. Parent: [Research progress](../../../research-progress.md),
[Research handoff](../../../research-plan.md). Pages: `/research/shot-quality?tab=decomposition` (catalog row 25) and
`/research/defensive-matchups` (catalog row 26). Both ✅ are the owner's. Built under D13: plain pages, finished API.

Files here: [decomposition-results.json](decomposition-results.json) and [defensive-results.json](defensive-results.json)
(the frozen results without the player rows; same values), [source-check.json](source-check.json) and
[verify_against_sources.py](verify_against_sources.py) (recompute from tables and raw archives),
[dom-checks.json](dom-checks.json) and [browser-check.mjs](browser-check.mjs) (what the browser drew against the API),
and screenshots at 1440 and 390 on real data.

## Disclosures

1. **A fit ran before the Part A registration was committed.** A shell mistake (zsh did not split `$F`) made both commit
   commands fail, and the fit command ran anyway. That run printed only its results hash and timings; its output was
   deleted unread. The code and registration were then committed unchanged (`680bb24`, `2fbcd3b`) and the fit rerun. The
   reruns give the same hash the unread run printed, `1e437b5e…`, so no result depends on the order, but the commit does
   not strictly precede the first run. Part B's run was chained to its commit.
2. **The Part B registration has one wrong sentence.** It says free data has no closest-defender feed. NBA tracking's
   season closest-defender numbers are free and were already on the old page. What is missing is closest-defender data by
   shot or by matchup. No number depends on the sentence, so the registration stays as committed (its hash is in the
   results) and this note corrects it. The old page is kept at `/research/defensive-matchups/tracking`.
3. **Changes after results were read, all serving or presentation; both frozen hashes unchanged:** duplicate team codes
   removed, key-matchup numbers moved to the subtitle line (a long name clipped the PPS column in the four-column grid),
   card labels shortened.
4. **Known direction before Part A's check:** R05's player-level persistence (xPPS 0.845, shot-making 0.625) had been read.
   The registration states this.

## References: what is and is not reproduced

The owner supplied saved copies of Databallr's ShotQuality RAPM and D-ShotQuality pages. Neither is committed, and
databallr.com was not fetched.

- **Decomposition, reproduced:** offence / defence / combined views, oTS, oSQ, oMake, oFT (dTS, dSQ, dContest, dFT), minimum
  and team filters, CSV, How to Read, glossary, the four regressions, the foul baselines, the second-stage check.
  **Added:** intervals, persistence. **Different:** one-season fits, not three years with time decay; a model without tracking,
  not the ShotQuality feed; rows are FGA plus shot-replacing trips. Values are not comparable. The owner chose a new tab.
- **Defensive Shot Quality, reproduced:** ranked player cards, All / 2PT / 3PT, shots defended, expected and actual PPS with
  ranks, RAPM headline, Key Matchups, next-six paging. **Different:** expected PPS is what the shooters' own shooting
  predicts, not ShotQuality's tracking value. **Not reproduced:** 2nd Defender (help columns are zero in every row), a Closest
  Defender split, the Data Source switch. **Added:** the D-SQ value, its interval, signal and persistence checks.

## Part A: `courtlens-shot-decomposition-v1`

Content `0366bd7c…`, results `1e437b5e…`. Uses the accepted R05 model (lightgbm_31, saved run `a`, SHA-256 checked, frozen
Platt values, never refitted).

**Seasons.** 2022-23 to 2025-26, the seasons no tree was fitted on; earlier seasons would be in-sample. 2022-23 chose the
model and 2023-24 fitted its calibration, stated on the page.

**Data check.** Shots join to possession events by (game, action number), same team and result. CDN-located events use the
v3 numbering (team and result agree on all 89,714).

| Season | R05 shots | Joined | Rate | Excluded games (shots) | Stray | Possession FGA with no shot | FT joined / all | Unknown trip types |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 2022-23 | 217,218 | 217,026 | 99.91% | 2 (191) | 1 | 2 | 57,847 / 57,881 | 0 |
| 2023-24 | 218,701 | 216,236 | 98.87% | 15 (2,464) | 1 | 2 | 52,783 / 53,430 | 0 |
| 2024-25 | 219,527 | 216,313 | 98.54% | 18 (3,214) | 0 | 0 | 52,516 / 53,312 | 0 |
| 2025-26 | 219,160 | 218,625 | 99.76% | 4 (534) | 1 | 0 | 57,623 / 57,768 | 0 |

- **Unjoined shots** have no lineup and are out of the fit, counted, never zero. **Possessions with no attempt** (29,724 to
  31,874 a season, all but one of them turnovers) carry no weight. Attempts on a possession that later ends in a turnover
  (3,327 to 3,771) keep their value: a stated difference from Databallr's wording.
- **Free-throw trips classify exactly** from subType: 0 unknown. A 1 of 1 is an and-one when the shooter's team has an
  unpaired make at the same clock (substitute shooters count); the others are away-from-play and take fouls, and the team
  keeps the ball. A bug found in the check: Yves Missi's makes ("Missi Free Throw") read as misses until the rule became
  case-sensitive "MISS ".
- **FT% rule:** R03's FT% prior for the season plus the shooter's attempts on earlier dates in seasons t-3 to t. Nothing at or
  after the trip is read. 190 to 271 free throws per season get the prior alone.
- **TS = SQ + Make + FT on every attempt:** largest row residual 0 in all four seasons.
- **R05 recompute:** league xPPS from the saved model matches the frozen file to 4.3e-10.

**Fits.** Alpha 3000 fixed for all targets, one regular season each, no time decay. 34 s, 561 MiB; two runs byte-identical.

| Season | Games | Shots | avg_pts | Shift per 100 | Qualified | Largest coefficient gap | R² | Median 80% width oTS / oSQ / oMake / oFT |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 2022-23 | 1,229 | 241,202 | 1.091 | −0.58 | 367 | under 1e-9 | 1.0000 | 2.32 / 0.66 / 2.20 / 0.45 |
| 2023-24 | 1,216 | 238,344 | 1.093 | −0.45 | 359 | under 1e-9 | 1.0000 | 2.28 / 0.66 / 2.20 / 0.43 |
| 2024-25 | 1,212 | 238,614 | 1.087 | −1.72 | 370 | under 1e-9 | 1.0000 | 2.28 / 0.68 / 2.17 / 0.42 |
| 2025-26 | 1,227 | 243,095 | 1.091 | −1.67 | 379 | under 1e-9 | 1.0000 | 2.36 / 0.66 / 2.27 / 0.44 |

**Additivity says little.** Second-stage coefficients are 1.000 and R² is 1.0000 on every side and season because one penalty
on one design makes ridge linear in the target. It confirms the arithmetic, not the split, and the page says so. Databallr
reports ~1.000 and R² above 0.9999.

**Registered persistence check (863 pairs, 398 players, 95% player bootstrap):**

| Value | r | Interval |
| --- | ---: | --- |
| oSQ | 0.451 | 0.359 to 0.533 |
| oMake | 0.349 | 0.267 to 0.427 |
| **r(oSQ) − r(oMake), registered** | **+0.102** | **−0.021 to +0.211** |
| oTS / oFT | 0.389 / 0.598 | 0.291 to 0.475 / 0.516 to 0.662 |
| dSQ / dContest | 0.430 / 0.134 | 0.360 to 0.489 / 0.049 to 0.212 |
| r(dSQ) − r(dContest), reported | +0.295 | +0.192 to +0.397 |
| dTS / dFT | 0.250 / 0.403 | 0.170 to 0.330 / 0.328 to 0.467 |

**Result: no clear difference on offence.** oMake is not shown to persist less than oSQ. Offensive shot making carries over
fairly well (0.349), plausibly because it is not all luck: without defender data it also holds real skill. On defence the gap is
clear, though unregistered as a claim: contest results barely carry over.

## Part B: `courtlens-defensive-shot-quality-v1`

Content `fed20026…`, results `5c2c9cb5…`. 37 s, 331 MiB; two runs byte-identical.

**Data check.** Nine seasons, 2017-18 to 2025-26. Orientation measured: `person_id` is the shooter (r 0.997 to 0.999 with the
shot chart), `matchups_person_id` the defender (0.72 to 0.86). Every row's points reconcile. Help columns are zero everywhere.
Some 2-pointers are credited to more than one defender: 2PA and 2PM both run 13% to 20% over the chart at an ordinary make rate,
so they do not look like fouled misses. 2019-20 lacks the 92 games after the hiatus.

**Rule.** Expected rate: Beta posterior (R03's 2P% or 3P% prior for the season) on the shooter's attempts against every defender
except this one, for the whole season: descriptive hindsight, stated. Excluding only the attempts on this defender, not whole
games. D-SQ = 100 × ((expected − actual) / FGA − league term), positive good. Field-goal points only. At least 300 matchup FGA
(100 for the 2PT and 3PT views). Intervals: 2,000-replicate bootstrap of the defender's games, 95%.

| Check (reported, no gate) | Value | 95% interval |
| --- | ---: | --- |
| Defender-seasons whose interval excludes 0 | 429 of 2,818 = 15.2% (5% if no defender differed) | 13.1% to 19.9% by season |
| D-SQ, next season (1,903 pairs, 538 players) | r 0.417 | 0.354 to 0.474 |
| Actual PPS, next season | r 0.382 | 0.324 to 0.434 |
| Expected PPS, next season | r 0.846 | 0.833 to 0.857 |
| D-SQ against dContest, same season (1,274) | r 0.495 | 0.445 to 0.544 |
| D-SQ against dTS | r 0.584 | 0.540 to 0.627 |
| D-SQ against dSQ | r 0.231 | 0.167 to 0.295 |

Matchup D-SQ persists far more than dContest (0.417 against 0.134, different measures, different samples). It matches
dContest more than dSQ, as expected: both compare results with a prediction. Expected PPS mostly says who a defender guards. Median
all-shots interval width is 17 to 19 points per 100, so one season separates only the extremes.

## What was built

- **Rules and data:** `domain/shot_decomposition.py`, `evaluation/shot_decomposition_data.py`,
  `evaluation/defensive_shot_quality_data.py`.
- **Runners:** `evaluation/shot_decomposition_runner.py`, `evaluation/defensive_shot_quality_runner.py`. Each checks constants against
  its registration, refuses changed tables, fails on an unconverged solve, non-finite value or broken additivity, and keeps timings out of
  hashed files. Each ran end to end on synthetic data in pytest before the first real run.
- **API (GET only, no Caddy change):** `/api/shot-quality/decomposition`, `/decomposition/players?season=&side=&sort=&team=&minShots=`,
  `/api/defensive-shot-quality`, `/defensive-shot-quality/cards?season=&kind=&sort=&team=`.
- **Pages:** the Decomposition tab; the rebuilt `/research/defensive-matchups` (menu label Defensive Shot Quality). The cards use the shared
  `ui-design-foundation-grid`, no new CSS. Default order is the D-SQ rank, a sort, not a judgement. The old tracking page moved to
  `/tracking`, unchanged, and keeps the `defensive_tracking` availability gate.
- No hash-pinned module, sealed protocol, frozen R03 to R05 file, saved model or pinned table was touched.

## Checks against the data

| Check | Result |
| --- | --- |
| Tables | two builds of each: all 13 content hashes identical |
| Reproducibility | two runs each, byte-identical results files |
| Page vs API, 1440 and 390 | **92,022 values, 0 mismatches**, 0 console errors, 0 px overflow (decomposition: three sides of 2025-26 and offence of 2022-23; cards: every card of 2025-26 All and 3PT and 2019-20 All; every check table) |
| Source recompute | league values and every defender's FGA, PPS, xPPS and D-SQ from tables and raw archives: worst gap 5.0e-10 (rounding) |
| Frozen results (pytest) | hashes, receipts, evidence extracts, additivity, formula, every status and interval, ranks, RAPM headline, filters, routers |

## Checks

| Check | Result |
| --- | --- |
| Ruff, format, strict mypy | clean |
| Python tests | **2,583 passed, 1 skipped, 8 failed**: the 8 known `test_agent_providers.py[anthropic]` SDK failures. 55 new tests pass |
| Vitest | 723 passed |
| Dashboard lint, typecheck | clean |
| Playwright, targeted | R06 (8 tests), R05, R04, R03, PC11, route consolidation, research FO12: **37 passed** against a production build and the mock API on private ports |
| Full Playwright | **not run**: about 10 GiB available against the ~12 GiB it needs. R03, R04 and R05's debt is still open, now with R06's |

## Not verified

- **Full Playwright**, for the memory reason above. The tracking page's visual baseline (`visual-baselines.spec.ts`) now points at the new path and was not run.
- **Hosted demo:** not deployed.
- Full-page captures leave lazy-loaded photos blank; the viewport shots show them.
