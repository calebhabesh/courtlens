# R14 — Lineup model with learned player embeddings

Measured 2026-11-06 on branch `research-r14`. Parent: [Research progress](../../../research-progress.md), [Research handoff](../../../research-plan.md). Registrations: [`courtlens-lineup-model-v1`](../../../../evaluation/research/registrations/courtlens-lineup-model-v1.json), content hash `32140ebb73a4d595…`; [`courtlens-lineup-backtest-v1`](../../../../evaluation/research/registrations/courtlens-lineup-backtest-v1.json), `d1512c1067ce0ba4…`. Results: [test](../../../../evaluation/research/frozen/courtlens-lineup-model-v1.json) `b03ba6ac866ba0d5…`, [selection](../../../../evaluation/research/frozen/courtlens-lineup-model-v1-selection.json) `65a4f741ff9da227…`, [restored scores](../../../../evaluation/research/frozen/courtlens-lineup-model-v1-scores.json) `c10fd35e4eedb068…`, [serving](../../../../evaluation/research/frozen/courtlens-lineup-model-v1-serving.json) `3068ed6a1f58a950…`, [facts](../../../../evaluation/research/frozen/courtlens-lineup-model-v1-facts.json) `a2766d86d6b5b644…`, [game backtest](../../../../evaluation/research/frozen/courtlens-lineup-backtest-v1.json) `e3ae920cc49106ca…`. Page: `/research/lineup-model`, Research → Models → Lineup Model (catalog row 29). Built under D13: a plain page and a finished API. Only the owner marks it ✅.

## Status

| Part | State |
| --- | --- |
| Data check | [`data-check.json`](data-check.json), committed with the code (`98dd02f`, 07:53 UTC) before either registration |
| Registrations | `07c4aed` (model, 07:54 UTC) and `5b9ca79` (backtest, 07:55 UTC), each in its own commit, after the code and before any fit |
| Selection | `select` on 2021-22 and 2022-23 only; committed `be58992` (08:09 UTC) before the test read |
| Test | One `test` read, a separate command; committed `148cfd6`. `reproduce --part test` gives the same hash (as `--part selection` does for selection). The runner refuses a second `test` |
| Game backtest | One read; committed `c0934b3`; `reproduce` gives the same hash. R08's `courtlens-metric-backtest-v1` and its results are unchanged |
| Serving | 2026-27 fit, map and 100 bootstrap refits. `reproduce --part serve` gives the same hash |
| Page | `/research/lineup-model`, plain D13 build, verified on real data |

## Result in one paragraph

**Registered verdict: ridge better.** On 97,427 held-out stints (2023-24 to 2025-26), ridge's possession-weighted stint error is lower than the lineup model's by **0.000011 points per 100** (95% interval 0.000008 to 0.000014), lower in all 3 seasons. That passes the registered rule, but it is not a practical difference. Selection on 2021-22 and 2022-23 chose the strongest interaction penalty in the grid, so the learned interaction is almost zero: its SD is 0.003 to 0.007 points per 100, against 8.8 to 10.9 for the additive part, and the two models' predictions correlate above 0.9999999982. The data gave the attention layer nothing it could use out of sample, so the selected lineup model is ridge with a tiny amount of noise on top. This is the registered "ridge wins" case the plan allows for.

## Data coverage by season

R01 stints from the sealed bundles. "Usable" is R01's rule: both sides had at least one possession. Dropped: 296,757 stints with no possession on either side (average 0.48 seconds, substitution and free-throw boundaries) and 45,547 with a possession on one side only; together 1.5–1.8% of possessions. Points scored in them are not in the target.

| Season | Games | Stints | Usable stints | Usable possessions | Share of possessions | Players |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 2014-15 | 1,208 | 57,810 | 31,366 | 111,974 | 98.2% | 492 |
| 2015-16 | 1,219 | 59,475 | 31,876 | 115,112 | 98.2% | 476 |
| 2016-17 | 1,206 | 58,726 | 31,418 | 114,565 | 98.3% | 486 |
| 2017-18 | 1,217 | 59,715 | 31,652 | 116,548 | 98.4% | 540 |
| 2018-19 | 1,227 | 61,936 | 32,798 | 120,992 | 98.5% | 530 |
| 2019-20 | 1,033 | 54,694 | 28,337 | 102,135 | 98.3% | 528 |
| 2020-21 | 1,074 | 53,533 | 27,906 | 104,918 | 98.5% | 540 |
| 2021-22 | 1,228 | 62,284 | 32,248 | 118,720 | 98.5% | 605 |
| 2022-23 | 1,229 | 62,265 | 32,197 | 120,209 | 98.5% | 539 |
| 2023-24 | 1,216 | 58,652 | 31,365 | 118,078 | 98.5% | 572 |
| 2024-25 | 1,212 | 61,514 | 32,005 | 118,172 | 98.5% | 569 |
| 2025-26 | 1,227 | 68,925 | 34,057 | 119,838 | 98.3% | 582 |

**Left out, and why.** R01's excluded games (3 to 26 a season: IM02 and the event gate, reasons in [R01's coverage](../r01/coverage.json)) have no stints. Stints with no possession on one side are dropped by R01's rule. Playoffs are out: R01's snapshots and fits are regular-season only. Pre-2014-15 seasons are out: there are no R01 stints.

## Leakage plan and cold start

- Rolling origin: the fit for season t reads only seasons t−3 to t−1, both stints and boxes, so every input is dated before t's opener. Splits were fixed in the registration: selection 2021-22 and 2022-23, test 2023-24 to 2025-26, serving 2026-27 (window 2023-24 to 2025-26). `test_later_outcomes_never_change_an_earlier_fit` proves that changing target-season points and boxes leaves the fit unchanged.
- Cold start, registered threshold **1,000 on-court possessions in the window**. Players at or above it get their own parameters. Everyone else reads a box-score fallback: 12 inputs from the window boxes (per-36 points, FGA, 3PA, FTA, offensive and defensive rebounds, assists, steals, blocks, turnovers and fouls, plus log minutes), standardized on the window's fallback players and weighted by possessions. A newcomer with no window minutes has every input at that mean.

| Target season | Window | Players | Own vector | Box fallback | Newcomers | Possessions: own / box / new |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| 2021-22 (selection) | 2018-19 to 2020-21 | 605 | 396 | 81 | 128 | 86.1% / 3.5% / 10.5% |
| 2022-23 (selection) | 2019-20 to 2021-22 | 539 | 389 | 63 | 87 | 87.6% / 4.1% / 8.3% |
| 2023-24 (test) | 2020-21 to 2022-23 | 572 | 396 | 75 | 101 | 87.5% / 3.9% / 8.6% |
| 2024-25 (test) | 2021-22 to 2023-24 | 569 | 395 | 67 | 107 | 86.0% / 4.2% / 9.8% |
| 2025-26 (test) | 2022-23 to 2024-25 | 582 | 399 | 77 | 106 | 83.9% / 5.2% / 10.9% |
| 2026-27 (serving) | 2023-24 to 2025-26 | 802 in window | 546 | 256 | — | — |

68–75% of test stints include at least one player on the fallback or newcomer value.

## Model, as registered

- **Ridge baseline:** home court plus the sum of the home five's ratings minus the away five's, weighted by possessions, with the fallback rating = γ·features + γ₀. Solved exactly. The penalty is on players and the fallback map; home is unpenalised.
- **Lineup model:** the same additive part, plus an interaction. Each player has a vector (own, or A·features + a₀). One two-head self-attention layer and a feed-forward layer run over the ten players, with residuals. The interaction is w·(mean home token − mean away token), antisymmetrised so swapping the fives negates it. It is trained by backfitting: an exact ridge solve, then 6 Adam epochs on the interaction, twice, then a final ridge solve. The additive part is therefore always a true ridge solution, and the model equals ridge when the interaction is zero (tested). Each fit averages five seeds (1401–1405).
- **CPU only (D12).** Float32 PyTorch 2.15.0+cpu with deterministic algorithms and 2 threads. Every published number comes from a numpy forward pass, which matches torch to 3×10⁻⁷ per 100. The runner refuses to start if the dataset hashes, package versions (pinned in the registration and `requirements-lock.txt`) or code hashes differ. Colab was not used.

## Selection (2021-22 and 2022-23 only)

| Ridge penalty | 100 | 300 | 1,000 | 3,000 | **10,000** | 30,000 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Pooled WRMSE | 92.400 | 92.356 | 92.276 | 92.207 | **92.18885** | 92.213 |

| Lineup model | penalty 1e-5 | 1e-4 | 1e-3 | 1e-2 |
| --- | ---: | ---: | ---: | ---: |
| 8 dimensions | 92.2535 | 92.2269 | 92.1892 | **92.188851** (chosen) |
| 16 dimensions | 92.2509 | 92.2181 | 92.1893 | 92.188853 |

Weaker interaction penalties were worse every time, and the chosen configuration sits at the grid's strongest penalty. On the selection seasons it scored the same as ridge (92.188851 against 92.188846).

## Test (one read)

Possession-weighted stint margin RMSE per 100, with 95% paired game-bootstrap intervals (2,000 replicates):

| Season | Stints | Ridge | Lineup model | Home court only | Ridge minus lineup | Ridge minus home only |
| --- | ---: | --- | --- | --- | --- | --- |
| 2023-24 | 31,365 | 92.5272 (91.79–93.28) | 92.5273 (91.79–93.28) | 92.4615 (91.73–93.19) | −0.0000198 (−0.0000249 to −0.0000146) | −0.066 (−0.232 to +0.087) |
| 2024-25 | 32,005 | 93.5733 (92.80–94.29) | 93.5733 (92.80–94.29) | 93.9464 (93.18–94.67) | −0.0000003 (−0.0000035 to +0.0000032) | +0.373 (+0.288 to +0.459) |
| 2025-26 | 34,057 | 96.0774 (95.36–96.86) | 96.0774 (95.36–96.86) | 96.3298 (95.62–97.10) | −0.0000128 (−0.0000199 to −0.0000059) | +0.252 (+0.171 to +0.336) |
| **Pooled** | 97,427 | 94.0810 (93.64–94.50) | 94.0810 (93.64–94.50) | 94.2697 (93.84–94.69) | **−0.000011 (−0.000014 to −0.000008)** | +0.189 (+0.121 to +0.254) |

- **Verdict (registered rule): ridge better.** The pooled interval lies below zero and ridge is lower in 3 of 3 seasons. Negative means ridge's error is lower.
- For scale, ridge beats a home-court-only model by 0.19 points per 100 pooled. In 2023-24 the home-only model is not worse (−0.066, interval includes zero). Stint margins are this noisy.
- Descriptive: on stints where all ten players have their own vector (26–35% of possessions), the lineup model's error and ridge's differ by under 0.000001. On stints with any fallback player, ridge is lower by under 0.00003.

## Game backtest (`courtlens-lineup-backtest-v1`)

R08's pinned tables for 2023-24 to 2025-26, restricted to games with R01 stints: 3,655 games, with 14, 18 and 3 left out. R08's calibration, seed and verdict rule, on the lineup model's held-out seasons only. Gain = the other metric's RMSE minus the lineup model's; positive favours the lineup model.

| Metric | Seasons | Margin RMSE, 95% | Lineup model's gain, 95% | Verdict for the lineup model |
| --- | --- | --- | --- | --- |
| Lineup model | 3 | 14.70 (14.33–15.07) | — | — |
| Ridge, same stints | 3 | 14.70 (14.33–15.07) | +0.000014 (+0.000004 to +0.000024) | better (lower in 3 of 3) |
| Team net (baseline) | 3 | 15.38 (14.99–15.76) | +0.68 (+0.51 to +0.84) | better |
| Plus-minus | 3 | 15.01 | +0.31 (+0.15 to +0.46) | better |
| On/off | 3 | 15.14 | +0.44 (+0.27 to +0.61) | better |
| RAPM 1Y | 3 | 14.77 | +0.07 (−0.07 to +0.22) | no ranking |
| RAPM 3Y | 3 | 14.57 | −0.13 (−0.27 to +0.00) | no ranking |
| Box-prior RAPM | 2 | 14.80 | −0.05 (−0.25 to +0.12) | no ranking |
| Projected Impact | 2 | 14.64 | −0.09 (−0.22 to +0.03) | no ranking |
| Time decay, monthly | 3 | 14.26 (13.90–14.62) | −0.44 (−0.60 to −0.29) | worse |
| Time decay, opener | 3 | 14.56 | −0.14 (−0.27 to −0.01) | worse |

Monthly time-decay RAPM remains the only metric ranked above every other, as in R08. At game level the lineup model edges its own ridge by 0.000014 points: the opposite sign to the stint test, and equally negligible. Both models are season-start fits on three seasons with a 10,000 penalty, and they lose to both time-decay variants, the same-information opener snapshot included. 14 of 55 pairs are unranked.

## The similarity map: what it does and does not show

- UMAP (n_neighbors 15, min_dist 0.1, Euclidean, random_state 1414, one thread) on seed 1401's vectors for the 546 own-vector players in the 2026-27 fit.
- **Seed check:** across seeds 1402–1405, the share of each player's 10 nearest neighbours that matches seed 1401's averages **1.9%**, against **1.8% by chance**. The vectors carry no stable structure, because the selected interaction penalty shrank them to almost nothing.
- **What it may show:** which players this one fit's vectors place together. **What it does not show:** anything stable, any meaning in the axes, directions or distances between groups, or playing style, position, skill or value. None was tested, and the seed check says the arrangement is noise. The page says this in a warning above the map. Fallback players have no point.

## Lineup tool

`GET /api/lineup-model/fit?players=a,b,c,d,e` returns the predicted net rating per 100 of any five players with their own vector or window box minutes (802 players). It is the mean predicted margin as home at a neutral site against each of 2025-26's 200 most-used fives that share no player with it. Both models are reported, each with the 10th–90th percentile over 100 game-bootstrap refits; the point is the five-seed fit. Example (the default, 2025-26's most-used five: DiVincenzo, Edwards, McDaniels, Gobert, Randle, against 190 lineups): lineup model **+2.70** (+1.07 to +4.61), of which interaction +0.000008; ridge +2.70 (+1.07 to +4.61). A request takes about 0.1 s.

## API (GET only)

`/api/lineup-model` (results with the restored per-model scores, selection, coverage and cold start, map points with season-matched identities, serving facts, the backtest entry, credits, caveats), `/api/lineup-model/players` and `/api/lineup-model/fit`. Unknown states: the frozen files are refused (503) if any hash changed. Without the git-ignored weights (the hosted demo), `tool_available` is false, `/players` returns `unavailable`, and `/fit` returns `unavailable`. A wrong count or a duplicate gives 422; a player outside the fit gives 404. No new non-GET endpoint, so the Caddy allowlist is unchanged.

## Page

`/research/lineup-model`, Research → Models → Lineup Model. It has the verdict sentences, a gain-by-season chart with intervals, and the test table (green or red only when an interval excludes zero). Then: the interaction diagnostics; the lineup tool (five player selects in the URL, an 80% interval, the additive and interaction split, and each player with a season-matched photo, logo beside code, input type, possessions and ratings); the map with its seed check and warning; the backtest entry; the selection grids; coverage and cold start; caveats; credits (Rosenbaum; Sill; McInnes, Healy and Melville for UMAP; Vaswani et al. for attention; R01's data); and a method card. Built with the control kit, shared tables, `TableCell` tone and `ChartFrame`, with no page CSS and no inline styles. Tiny gains are shown with enough decimals to read (for example −0.000011), never rounded to zero.

**Browser check** ([`browser-check.mjs`](browser-check.mjs), [`dom-checks.json`](dom-checks.json)), real data through a private API: **1,468 values at 1440 and 1,468 at 390, 0 mismatches, 0 console errors, 0 px horizontal overflow**, over 4 page loads per width. It covers four fives (the default, two own-vector swaps and one with a box-fallback player), every test-table value, interval and tone, the chart, diagnostics, all 546 map points and the highlighted five, every backtest row, both selection grids, coverage, cold start and the results hash. Screenshots: [`lineup-model-1440.png`](lineup-model-1440.png), [`lineup-model-390.png`](lineup-model-390.png), [`lineup-model-1440-full.png`](lineup-model-1440-full.png), [`lineup-model-390-full.png`](lineup-model-390-full.png). The first check run reported one mismatch: it expected a box-fallback player to be highlighted on the map, which has no point for such players. The check was corrected; the page was right.

**Source check** ([`verify_against_sources.py`](verify_against_sources.py), [`source-check.json`](source-check.json)) uses none of the lineup modules:
- stint, usable-stint and possession counts for all 12 seasons, read straight from R01's sealed game files, equal the served counts;
- ridge's 2025-26 test error, rebuilt from the Parquet tables with its own design and an augmented least-squares solve, is 96.07740487981728 against 96.07740487981725 served;
- the lineup model's 2025-26 test error, from the saved weights through a forward pass rewritten in plain PyTorch, equals the served value to every digit;
- the 2025-26 gain interval from an explicit replicate loop equals the served one to 3×10⁻¹⁴ (floating-point summation order);
- the lineup model's 2023-24 game RMSE from the strengths and R08's margins equals the served value exactly (14.61994664223828);
- the default five's net rating through the plain forward pass equals the API's (2.6963817767316614).

## Disclosures

1. **Results-file defect.** In the hash-pinned runner, `run_test` writes `**block` (whose `models` key holds each model's WRMSE and intervals) and then overwrites `models` with the map of saved weight hashes. The frozen results therefore lack the per-model score block. The verdict, gains, subsets, diagnostics and game strengths were computed before that line and are intact. The runner was not edited, because its hash is pinned. [`lineup_model_scores.py`](../../../../src/courtlens/evaluation/lineup_model_scores.py) reloads the named weights, recomputes the block with the same functions, and writes it only because every recomputed gain (per season, pooled, point and interval) equals the frozen one exactly. The API and page read the restored file and say so.
2. **Before registering:** a timing run of the training code on real lineups with pure-noise targets, and synthetic end-to-end dry runs of both runners (the backtest dry run used R08's tables with noise margins). No outcome was summarised by model.
3. **Selected at the grid's edge.** The chosen interaction penalty is the strongest registered. A stronger one would only move the model closer to ridge.
4. **The source check script** first read the per-model scores from the results file, hit the defect above, and was pointed at the restored file.
5. **Package lock.** The registration pins what actually ran, including numpy 2.5.3. `requirements-lock.txt` has long pinned numpy 2.5.4, so an environment installed strictly from the lock is refused by the runner until numpy matches the registration. The two are recorded apart rather than changed.
6. **Backtest code hashes** are recorded in its registration and match, but that runner does not enforce them; the lineup model's runner does.

## Checks

- Ruff, format and strict mypy (368 files) clean. New tests: `tests/unit/test_lineup_model.py` (15: windows and leakage, newcomers, exact ridge, CPU determinism, torch = numpy, antisymmetry, zero interaction = ridge, backfitting optimum, metric, verdict rule, seeded resampling, hashes, registration constants) and `tests/unit/test_lineup_model_api.py` (14: payload, verdict recomputed from the served gains, selection minima, cold-start sums, map = own players, backtest pairs, 503 on a changed file, unknown states without weights, 422 and 404, the real tool, antisymmetry against the panel). Run from a directory with the real data: 29 passed. Python suite (`scripts/test_python.py`, which has no real data, so the two tool tests skip): 2,652 passed, 3 skipped, 8 failed, all the known `test_agent_providers[anthropic]` SDK failures.
- Dashboard lint (ESLint and Stylelint) and typecheck clean; Vitest 735 passed (4 new).
- Playwright: the new `e2e/r14-lineup-model.spec.ts` has 7 tests, all passing on real-API fixtures. Full suite from a production build in a sandbox (mock API, two workers, 8 GiB cap): **565 passed, 17 skipped, 0 failed**. The caveat text changed after that run (API text only, no code path); the R14 spec and the browser check were rerun on it.
- Runtime and peak memory (from `resource.getrusage`, each run under `systemd-run` with MemoryMax 4G, MemorySwapMax 0, 2 CPUs): dataset build 77 s / 1.2 GiB; data check 1.6 s / 1.0 GiB; selection 833 s / 1.46 GiB; test 214 s / 1.57 GiB; reproduce test 252 s / 1.45 GiB; backtest 1.0 s / 0.35 GiB; serve 56 s / 1.49 GiB; bootstrap 556 s + 505 s / 1.49 GiB; reproduce serve 65 s / 1.47 GiB; reproduce selection 864 s / 1.47 GiB; dataset rebuild 78 s / 1.2 GiB.

## Commands

```bash
# Training dependencies (optional extra; torch from the CPU index)
pip install --index-url https://download.pytorch.org/whl/cpu torch==2.15.0
pip install -e '.[research-ml]'
# Reproduce (from a directory with data/ from the main checkout and evaluation/ from this branch)
python -m courtlens.evaluation.lineup_model_data build                          # same two dataset hashes
python -m courtlens.evaluation.lineup_model_runner reproduce --part selection   # same selection hash
python -m courtlens.evaluation.lineup_model_runner reproduce --part test        # same results hash
python -m courtlens.evaluation.lineup_model_runner reproduce --part serve       # same serving hash
python -m courtlens.evaluation.lineup_model_scores --check                       # same restored scores
python -m courtlens.evaluation.lineup_backtest_runner reproduce                 # same backtest hash
```

## Limitations

- Stint margins are extremely noisy (WRMSE 92–96 per 100), and three test seasons cannot resolve interaction effects smaller than this data shows. "No usable interaction" is a statement about this model on this data, not proof that lineup interactions do not exist.
- Season-start fits do not update within a season; the fallback ignores draft position and college.
- The tool predicts against a fixed panel of 2025-26 lineups at a neutral site. It is a model output, not a forecast.
- Actual lineups in the game backtest are hindsight by design, as R08's actual minutes are.
