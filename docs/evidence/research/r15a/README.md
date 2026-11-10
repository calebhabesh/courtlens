# R15a — win probability: models and final test

Measured 2026-11-04 on branch `research`. Parent: [Research progress](../../../research-progress.md),
[Research handoff](../../../research-plan.md). Registration:
[`courtlens-win-probability-v2`](../../../../evaluation/research/registrations/courtlens-win-probability-v2.json)
(content hash `7bba2a1b545e71bf…`), which supersedes
[`-v1`](../../../../evaluation/research/registrations/courtlens-win-probability-v1.json). Production,
the scorecard and pages are R15b. Nothing here has been verified on 2026-27 games.

## Result

Both registered gates pass on 2024-25 and 2025-26 (2,439 games, read once after every
choice was frozen).

- **A1:** log loss improves on the Brownian baseline by +0.0130 (+0.0089 to +0.0169); the 95% interval is above zero.
- **A2:** calibration error is 0.0083 against a limit of 0.02.

| Model (pooled test seasons) | Log loss | Brier | Calibration error | Log-loss gain on S0, 95% interval |
| --- | --- | --- | --- | --- |
| **Selected: S2 + end-game specialist** | 0.4028 | 0.1341 | 0.0083 | +0.0130 (+0.0089 to +0.0169) |
| S0 Brownian baseline, team form | 0.4157 | 0.1383 | 0.0107 | — |
| S0g boosters on margin, time, mu0 | 0.4080 | 0.1359 | 0.0069 | +0.0078 (+0.0045 to +0.0110) |
| S1 + game state | 0.4067 | 0.1355 | 0.0061 | +0.0090 (+0.0059 to +0.0122) |
| S2 + player mu0, context | 0.4035 | 0.1343 | 0.0079 | +0.0123 (+0.0080 to +0.0164) |
| S3 + volatility | 0.4042 | 0.1344 | 0.0076 | +0.0115 (+0.0073 to +0.0156) |
| S4 + rotation, exits, fouls, lineup | 0.4043 | 0.1346 | 0.0089 | +0.0114 (+0.0072 to +0.0156) |
| S5 + runs, shooting luck | 0.4036 | 0.1343 | 0.0078 | +0.0122 (+0.0079 to +0.0162) |
| Logistic regression | 0.4066 | 0.1349 | 0.0110 | +0.0092 (+0.0053 to +0.0129) |
| Direct win/loss LightGBM | 0.4076 | 0.1349 | 0.0122 | +0.0081 (+0.0024 to +0.0135) |

Per season, selected model: 2024-25 log loss 0.4061, gain on S0 +0.0154 (+0.0096 to +0.0215); 2025-26 log loss 0.3995, gain +0.0106 (+0.0047 to +0.0160).

## What each step added

Selection used 2022-23 only (90% interval above zero to accept). Test columns are paired differences computed afterwards from saved predictions; positive means the first model is better.

| Step | Selection gain, 90% interval | Accepted | Test comparison | Test gain, 95% interval |
| --- | --- | --- | --- | --- |
| S0g | +0.0048 (+0.0011 to +0.0090) against S0 | diagnostic | S0g vs S0 | +0.0078 (+0.0045 to +0.0110) |
| S1 | +0.0059 (+0.0022 to +0.0101) against S0 | yes | S1 vs S0g | +0.0012 (+0.0010 to +0.0015) |
| S2 | +0.0063 (+0.0025 to +0.0101) against S1 | yes | S2 vs S1 | +0.0033 (+0.0002 to +0.0062) |
| S3 | -0.0010 (-0.0021 to +0.0001) against S2 | no | S3 vs S2 | -0.0008 (-0.0017 to +0.0002) |
| S4 | +0.0007 (-0.0008 to +0.0022) against S2 | no | S4 vs S2 | -0.0009 (-0.0021 to +0.0004) |
| S5 | +0.0004 (-0.0002 to +0.0010) against S2 | no | S5 vs S2 | -0.0001 (-0.0006 to +0.0004) |
| End-game specialist | +0.0032 (+0.0009 to +0.0053) on the last two minutes and overtime | yes | E vs S2 (all states) | +0.0007 (+0.0003 to +0.0011) |

- **Most of the gain is flexibility, not new inputs.** S0g adds no new information and gives +0.0078. It learns mean reversion that the Brownian baseline cannot.
- **S4 failed.** The plan expected rotation, exits, foul trouble and current lineup to be the differentiator. They added nothing measurable on selection or test (-0.0009 (-0.0021 to +0.0004)). This is a negative result.
- **S5 is the expected null.** Runs and shooting luck add nothing: momentum does not help beyond score and time.
- **S3 failed.** Pace and three-point rate did not improve calibration of comebacks.
- **Structure helps, modestly.** The selected model beats logistic regression by +0.0038 (+0.0006 to +0.0069) and a direct LightGBM classifier by +0.0049 (+0.0026 to +0.0071).
- Calibration was fitted on 2023-24 (slope 1.017) and not applied: cross-validated log loss was 0.40379 with it, 0.40356 without.

## By phase (selected model)

| Phase | Games | Log loss | Brier | Calibration error | Log-loss gain on S0 |
| --- | --- | --- | --- | --- | --- |
| First half | 2,439 | 0.5490 | 0.1869 | 0.0129 | +0.0160 (+0.0103 to +0.0212) |
| Third quarter | 2,439 | 0.4207 | 0.1379 | 0.0113 | +0.0107 (+0.0059 to +0.0154) |
| Fourth quarter, before last two minutes | 2,439 | 0.2863 | 0.0917 | 0.0100 | +0.0078 (+0.0040 to +0.0116) |
| Last two minutes | 2,439 | 0.1211 | 0.0380 | 0.0053 | +0.0140 (+0.0082 to +0.0204) |
| Overtime | 114 | 0.3654 | 0.1173 | 0.0464 | +0.0336 (+0.0022 to +0.0713) |

Overtime is the weak spot: calibration error 0.046 on 114 games. Calibration curves for every model, phase and season are in [`test-report.json`](test-report.json).

## Against ESPN

ESPN's published per-play probability on the same states: the latest ESPN play at or before the state, kept only when its score equals ours. Matched 96.3% of 2024-25 states and 96.3% of 2025-26 states, covering 2,437 games (one game, `0022500614`, has no ESPN probabilities). Positive gaps mean CourtLens is better. Phase intervals are not adjusted for multiple comparisons.

| Phase | Games | CourtLens log loss | ESPN log loss | Gap, 95% interval | CourtLens calibration | ESPN calibration |
| --- | --- | --- | --- | --- | --- | --- |
| Tip-off (first state) | 2,438 | 0.5967 | 0.5903 | -0.0064 (-0.0145 to +0.0015) | — | — |
| First half | 2,437 | 0.5492 | 0.5492 | -0.0001 (-0.0066 to +0.0065) | 0.0127 | 0.0167 |
| Third quarter | 2,436 | 0.4215 | 0.4289 | +0.0074 (+0.0019 to +0.0133) | 0.0114 | 0.0206 |
| Fourth quarter, before last two minutes | 2,436 | 0.2867 | 0.2926 | +0.0059 (+0.0020 to +0.0101) | 0.0100 | 0.0145 |
| Last two minutes | 2,432 | 0.1263 | 0.1341 | +0.0078 (+0.0044 to +0.0110) | 0.0062 | 0.0203 |
| Overtime | 114 | 0.3848 | 0.4177 | +0.0330 (+0.0121 to +0.0532) | 0.0426 | 0.0569 |
| **All states** | 2,437 | 0.4139 | 0.4173 | +0.0034 (-0.0011 to +0.0080) | 0.0088 | 0.0130 |

- **Overall, no clear winner:** the interval on all states includes zero.
- **ESPN leads at tip-off** (interval just includes zero) and the two tie in the first half, as expected if ESPN uses betting lines.
- **CourtLens is better after halftime**, in every later phase.
- **Caveats:** this is one comparison on two seasons, and ESPN's model is a black box. Its probabilities were read in November 2026, so they could have been recomputed since the games. 2026-27 is the prospective test.

## Pregame against the closing spread

Closing spreads are benchmarks, never inputs: [hoopR-nba-data](https://github.com/sportsdataverse/hoopR-nba-data) `nba/betting_lines/closing_lines_odds_api.parquet` (The Odds API consensus close, CC BY 4.0), commit `7be25dae`, covering 2,439 of 2,439 test games.

| Pregame model | RMSE (points) | Winner accuracy, 95% interval |
| --- | --- | --- |
| CourtLens mu0 | 14.16 | 68.4% (66.5% to 70.3%) |
| Team form alone | 14.53 | 67.4% (65.6% to 69.2%) |
| Closing spread | 13.71 | 69.5% (67.7% to 71.3%) |

**The market is clearly better.** Its squared error is lower by 12.7 (95% interval 9.2 to 15.9).

## Checks on the method

- **Replay against sealed data:** a bug reset scores on older rows (they write `0` on non-scoring rows) and was fixed before any fit. Afterwards, 0 of 11,090 stint-end scores (100 games each of 2016-17 and 2025-26) disagree with the replay, and no season excludes a game for a differing final score.
- **Causality:** cutting 200 real games each of 2016-17 and 2025-26 at three seeded times and rebuilding states changed none of 124,948 earlier states (`win_probability_data causality`). A unit test covers the same rule.
- **Monotonicity:** in 0.095% of 20,000 sampled test states one more point of lead lowers the probability, by at most 0.4%. The boosted mean is monotone by construction; these come from the variance model and the specialist.

## Pregame layer

Fitted on 2015-16 to 2021-22 (2014-15 has no rating snapshot; its mu0 is team form). Team-form half-life 120 days, the top of the registered grid (RMSE 30: 13.41, 60: 13.27, 120: 13.18). Training RMSE 12.91.

| Coefficient | Value | Coefficient | Value |
| --- | --- | --- | --- |
| `b2b_away` | +2.168 | `b2b_home` | -1.489 |
| `denver` | +1.242 | `form` | +0.566 |
| `games7` | -0.451 | `home` | +0.447 |
| `rest` | -0.193 | `strength_x_pace` | +0.592 |
| `travel_away_kkm` | +0.141 | `travel_home_kkm` | +0.039 |
| `utah` | +1.506 |  |  |

Availability: DND and NWT box comments are the inactive list; DNP is a coach's decision, so those players count as available. All 12 seasons have these records.

## Coverage

| Season | Games | States | States per game | Excluded | Build seconds |
| --- | --- | --- | --- | --- | --- |
| 2014-15 | 1,208 | 269,037 | 222.7 | 0 | 12.4 |
| 2015-16 | 1,219 | 271,321 | 222.6 | 0 | 14.1 |
| 2016-17 | 1,206 | 267,090 | 221.5 | 0 | 13.9 |
| 2017-18 | 1,217 | 267,744 | 220.0 | 0 | 13.9 |
| 2018-19 | 1,227 | 270,743 | 220.7 | 0 | 14.5 |
| 2019-20 | 1,033 | 228,446 | 221.1 | 0 | 12.5 |
| 2020-21 | 1,074 | 236,298 | 220.0 | 0 | 12.4 |
| 2021-22 | 1,228 | 269,000 | 219.1 | 0 | 14.4 |
| 2022-23 | 1,229 | 270,633 | 220.2 | 0 | 14.4 |
| 2023-24 | 1,216 | 266,365 | 219.1 | 0 | 14.2 |
| 2024-25 | 1,212 | 265,317 | 218.9 | 0 | 14.5 |
| 2025-26 | 1,227 | 268,453 | 218.8 | 0 | 14.8 |
| **Total** | **14,296** | **3,150,447** | | **0** | |

## Registration history

`-v1` started the boosters from the full baseline and constrained the correction to rise with margin. That blocked mean reversion: teams up 10 or more with over 24 minutes left give back about 3 points on training seasons, and the mean booster stopped after 1 round. v1's only fits were S0 and S0g; no test season had been read. `-v2` starts the mean from 0.7 × (margin + beta × mu0 × f), so the full mean still rises by at least 0.7 per point. The 0.7 was chosen on training and 2022-23 data (L2 88.0, against 88.4 at 0.8 and 88.2 unconstrained), which adds to the optimism of the selection-season numbers. Every artifact was then rebuilt under v2.

## Runtime and memory

Under a 3 GiB kernel cap with two CPU threads and no swap: games table 44 s, states 168 s, S0 and pregame under 5 s, each step 34–83 s, specialist 48 s, comparators 32 s, final test 56 s. Peak 2.2 GiB (S4). ESPN acquisition 3 h 50 min at 5-second pacing (2,766 requests, no failures, 102 MB raw). LightGBM on local CPU; no Colab, no paid service.

## Limitations

- About 14,000 game outcomes; every state in a game shares one result, so the effective sample is games.
- Regular season only, and only admitted games.
- Trained through 2021-22 and tested from 2024-25, so league drift counts against the model. R15b must decide its freeze, and a refit would need its own version and report.
- The inactive list is assumed known at tip-off; neutral sites other than the 2019-20 bubble are not identified.
- S4's result does not cover a player leaving injured: the rule only sees 12 minutes off the floor.

## Corrections and naming

- `pregame.*.rmse` in `test-report.json` actually holds mean squared error. The test cannot be re-run, so the report is unchanged; the code now says `squared_error`, and [`pairs.json`](pairs.json) has the correct values and RMSE.
- Derived artifacts live under `data/derived/win-probability-v1/`, a directory name that predates v2; their contents record v2.

## Files

[`ladder.json`](ladder.json) (frozen choices, model hashes), [`test-report.json`](test-report.json) (all metrics and curves), [`pairs.json`](pairs.json), [`benchmarks.json`](benchmarks.json), [`pregame.json`](pregame.json), [`coverage.json`](coverage.json). Selected model files (git-ignored): mean `2b5c29aa57ac1405121087b6db006b8c9cd5c376475dce88cb724ae2f723a744`, variance `c6a7d9908db9f55b25730ec8c65dd01fe725403de6a4935c15f386d620b23fd2`, specialist `26bbd8a955d42ac8dc937f2fe0d5b72dc9de3db65badfcd7a646314a3c1719dd`.
