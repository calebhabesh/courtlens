# R07 — Projected Impact

Measured 2026-11-05 on branch `research-r07`. Parent: [Research progress](../../../research-progress.md), [Research handoff](../../../research-plan.md). Registration: [`courtlens-projected-impact-v1`](../../../../evaluation/research/registrations/courtlens-projected-impact-v1.json).

## Status

| Part | State |
| --- | --- |
| Registration | Committed 2026-11-05 04:27:31 UTC, before the first fit at about 04:28. Amended twice before that (one wording fix, one ridge-weight fix); no fit had run. Final content hash `4c6bf16d1da1fc76…`, recorded in every artifact |
| Final test | **Read once**, 2026-11-05 04:28:35 UTC. The runner refuses a second read |
| Freeze | **Live.** 2026-11-05 04:53:33 UTC, projections `6eaef38960af783b4e3d1bdaab955f5f6185ce9c75ab8ff7e98b5a397242d41e`, manifest `7728bb5c9f158fea…` |
| F1 interval coverage | **Failed, too wide. Owner waived it for over-coverage only**, 2026-11-05 |
| Weekly scoring | **Verified on 107 real 2026-27 games, all hindsight** |
| Prospective score | **Unverified.** No game has tipped since the freeze; the first tip is 2026-11-06 02:00 UTC and the first run that can score it is 2026-11-12 13:30 UTC |
| Hosted demo, sync | Built, **not deployed or enabled** |
| Page | Built and verified on real data; only the owner marks it ✅ |

## Result against carry-forward

Pooled 2024-25 and 2025-26, [`test-report.json`](test-report.json). Gain is the squared-error gap (carry-forward minus model); positive favours the model. Player gaps are minutes-weighted with a paired player bootstrap; game gaps use a paired game bootstrap; 2,000 replicates, 95%.

| Rating | Player RMSE | Correlation | Gain over carry-forward | Margin RMSE | Winner picked | Gain over carry-forward |
| --- | --- | --- | --- | --- | --- | --- |
| **LightGBM (selected)** | 2.82 | 0.44 | **+4.38 (+3.25 to +5.50)** | 14.66 | 66.6% | **+13.42 (+9.55 to +17.14)** |
| Ridge | 2.76 | 0.47 | +4.69 (+3.55 to +5.83) | 14.51 | 68.0% | +17.76 (+14.03 to +21.58) |
| Time-decay RAPM | 3.04 | 0.46 | not computed | 14.76 | 66.5% | not computed |
| Age curve | 3.48 | 0.35 | +0.20 (+0.04 to +0.37) | 15.18 | 64.0% | -1.92 (-2.99 to -0.92) |
| Carry-forward | 3.51 | 0.36 | baseline | 15.11 | 63.9% | baseline |

Players: 911 player seasons from 537 players. Games: 2,460. **A1 and A2 pass.**

Against the harder comparison, the time-decay RAPM the frozen win-probability model already reads:

| | Players | Games |
| --- | --- | --- |
| Pooled | +1.30 (+0.65 to +2.00) | +2.85 (+0.46 to +5.33) |
| 2024-25 | +1.65 (+0.70 to +2.68) | +0.81 (-2.43 to +4.14), includes zero |
| 2025-26 | +0.95 (-0.07 to +2.01), includes zero | +4.90 (+0.95 to +8.64) |

So most of the headline gain over carry-forward is what any multi-year rating gives. The edge over time decay is real when pooled and small: margin RMSE 14.66 against 14.76.

## What did not work

- **Selection did not pick the best test model.** LightGBM won on 2023-24 (+4.79, 90% +3.46 to +6.21; ridge +4.37), so it was frozen. Ridge did better on both test measures. Selection stands; ridge's values are in the frozen file and the weekly score reports them. Switching now would be choosing on test.
- **The age curve adds almost nothing,** and is worse on game margins.
- **Rookies, no clear gain.** 207 players against the group-mean rule: LightGBM +0.18 (-0.08 to +0.44), ridge -0.38 (-0.99 to +0.20).
- **Returners, no clear gain.** 33 players: LightGBM +0.04 (-1.91 to +2.33), ridge -0.07 (-1.53 to +1.60), time decay +0.59 (-1.61 to +3.92).
- **Intervals failed their check** (below).

## The five settled questions

1. **Target.** RAPM total from a fit on the target season's games alone (the sealed one-season fit the site serves), weighted by minutes. The plan's two-year centred window can't be used: including t-1 shares games with the prior-RAPM feature, and including t+1 leaves 2025-26 incomplete and reaches into the prospective period. Cost: a noisier target, so absolute errors are larger; all candidates face the same one.
2. **Weekly score.** D = home minus away of (box minutes / 48) × rating; predicted margin = a + b × D, with a and b fitted per rating on 2023-24 and frozen; compared with the **actual final margin**. Paired game bootstrap over games, 2,000 replicates, once 20 games exist. Scored the same way on test seasons. Actual minutes on purpose, as in R08, so it tests ratings and is not a forecast. A player with no frozen row takes the rookie mean (-1.59); that share of minutes is reported (0.0% so far).
3. **No prior-season RAPM.** Rookie (years in league 0, or no box before the opener) or returner (an earlier box, none in t-1). Carry-forward predicts the group's training mean (rookies -1.59, returners -0.63). Excluded from gate A1, reported separately above, own interval bucket.
4. **Coverage.** Usable targets 2016-17 to 2025-26. 2015-16 is excluded rather than imputed: its prior season has no play types, and a whole missing season would act as a season marker. Missing per player stays missing: NaN for LightGBM, training mean plus a block indicator for ridge.
5. **Age and experience.** At the opener, from the NBA player index and team rosters, then ESPN's retained roster payloads for the 2026 class (73 players) that NBA rosters don't list yet. Debut year from the NBA index. Unknown stays NaN.

Table below: share of each target season's players holding each input. Prior-season sources sit near 75–80% because rookies and returners have none.

| Target season | Players | Prior / rookie / returner | RAPM t-1 | RAPM t-2 | Box | Play types | Shot profile | Time decay | Age | Debut year |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2016-17 | 486 | 386 / 90 / 10 | 79.4% | 68.1% | 79.4% | 67.1% | 79.2% | 80.9% | 99.2% | 100.0% |
| 2017-18 | 540 | 392 / 123 / 25 | 72.6% | 60.6% | 72.6% | 59.3% | 72.4% | 76.5% | 98.0% | 100.0% |
| 2018-19 | 530 | 412 / 106 / 12 | 77.7% | 62.1% | 77.7% | 65.5% | 77.5% | 79.6% | 98.3% | 100.0% |
| 2019-20 | 529 | 400 / 119 / 10 | 75.6% | 62.6% | 75.6% | 64.1% | 75.6% | 77.5% | 98.7% | 100.0% |
| 2020-21 | 540 | 435 / 94 / 11 | 80.6% | 63.5% | 80.6% | 67.0% | 80.4% | 82.6% | 98.5% | 100.0% |
| 2021-22 | 605 | 450 / 126 / 29 | 74.4% | 63.6% | 74.4% | 62.5% | 74.4% | 79.2% | 94.4% | 100.0% |
| 2022-23 | 539 | 433 / 85 / 21 | 80.3% | 67.2% | 80.3% | 68.3% | 80.3% | 84.2% | 99.1% | 100.0% |
| 2023-24 | 572 | 450 / 101 / 21 | 78.7% | 67.0% | 78.7% | 65.7% | 78.5% | 82.3% | 97.2% | 100.0% |
| 2024-25 | 569 | 447 / 104 / 18 | 78.6% | 67.3% | 78.6% | 53.3% | 78.4% | 81.5% | 97.9% | 100.0% |
| 2025-26 | 582 | 464 / 103 / 15 | 79.7% | 66.0% | 79.7% | 61.7% | 79.7% | 82.1% | 97.4% | 100.0% |

Play types are the spot-up column. The frozen 2026-27 file holds 661 players: 582 with a prior fit, 69 rookies, 10 returners; 15 have no known age; 520 are on the roster capture.

## Pre-freeze checks

[`checks.json`](checks.json).

| Check | Result |
| --- | --- |
| F1 coverage on test seasons | **Failed; owner waived, over-coverage only** |
| F2 causality: removing or changing everything on or after a cutoff changes no feature hash, all 10 target seasons and 2026-27 | Pass |
| F3 target and feature windows share no games | Pass, 0 shared in all 10 seasons; `test_window_check_catches_an_overlap` proves the check can fail |
| F4 2026-27 goes through the test seasons' function, same columns, cutoff 2026-10-20; 107 games of 2026-27 in the boxes, 0 in features; snapshot ends 2026-04-12 | Pass |
| Hash at load | Pass. The API refuses a changed file or manifest (unit tests); the page shows version and hash |

After later type-only cleanups, rebuilding the 2026-27 inputs matched the manifest's feature hash and the projections with a largest difference of 0.0.

### F1

Split-conformal, nominal 80%, widths from 2023-24 residuals, players with 500+ target minutes. The registered limit was within 0.03 overall and 0.08 per bucket.

| Bucket | Half-width | Calibration n | Test players | Coverage | Within limit |
| --- | --- | --- | --- | --- | --- |
| All | | 360 | 746 | **84.3%** | **No** (77–83%) |
| 1,500+ minutes | 3.90 | 180 | 341 | 82.7% | Yes |
| 500–1,499 | 3.49 | 113 | 236 | 83.1% | Yes |
| Under 500 | 4.70 | 29 | 83 | **89.2%** | **No** (72–88%) |
| No prior RAPM | 4.41 | 38 | 86 | **89.5%** | **No** (72–88%) |

Not a code fault: the calibration season itself covers 81.4%, and 2023-24's errors were larger (80th percentile 3.82, against 3.55 and 3.59). Small buckets add the finite-sample rounding up. By target minutes (a diagnostic, unknown at prediction time): 500–999 88.5%, 1,000–1,999 82.2%, 2,000+ 84.0%. The intervals err wide; the point projections are unaffected. Nothing was tuned on test.

## Aging curve

The age-curve candidate learns a rise to about 25 and a fall that steepens after 30 (about -2.0 at 34, relative to 27). It gains almost nothing because carry-forward's error is mostly noise, not age. The selected model's partial dependence on age is nearly flat (a range of 0.03 between 22 and 34), because age is mostly carried by other inputs. It should not be read as "players don't age".

## Production

- **Frozen as tested:** trained through 2022-23, calibrated on 2023-24, no refit, matching the owner's R15 decision.
- **Files:** manifest and card in `evaluation/research/frozen/`; projections and LightGBM model in `data/artifacts/projected-impact`, registered in `workbench_artifacts` (`d6c5a499-a0e0-4a4a-a860-09a23964a58f` for the projections).
- **Win Probability untouched:** R07 does not feed it. The pinned modules are unedited.
- **Weekly:** `courtlens refresh-projected-impact`, last step of `refresh-daily`, does nothing if the last score is under 7 days old. One row per game, never rewritten; prospective only if the scheduled tip is after `frozen_at`.
- **Run on real games:** 107 games, 2026-10-20 to 2026-11-02, [`weekly-summary.json`](weekly-summary.json). **All hindsight.** RMSE: LightGBM 14.39, ridge 14.53, time decay 15.04, carry-forward 15.35. Gain over carry-forward +28.43 (+10.50 to +46.16). Too few games, and not prospective: do not quote it.
- **Hosted demo:** `SERVING_DIRS`, compose mounts and the sync script are updated; nothing deployed or enabled.

## Page

Research → Models → Projected Impact (`/research/projected-impact`): verdict and test table, frozen leaderboard with 80% intervals (photos and logos), contributions per player ("Why"), weekly score, aging curve, coverage, negative results, model card with hash and credit to DARKO and EPM. No "better player" claim; a spec checks.

[`projected-impact-1440.png`](projected-impact-1440.png), [`projected-impact-390.png`](projected-impact-390.png): real data through the worktree API. No sideways page scroll at either width. On a phone the leaderboard hides #, age, range, last season and minutes so the projection and interval stay on screen.

The research pages have no side gutter, on Win Probability as well; that comes from the shared layout and was left alone.

## Limitations

- One-season RAPM is noisy and shrunk; the interval describes it, not true ability.
- Who played is hindsight in both the player population and the game measure.
- Selection and calibration share 2023-24.
- Team changes and injuries are unknown to the model.
- A bootstrap gap between time decay and carry-forward was not registered, so it isn't in the test report; 2023-24 has it (+2.61, 90% +1.53 to +3.76).
- Commit time is not the proof of freeze time: `frozen_at` and the artifact-registry row are, because the block is committed after the page work.

## Verification

Ruff, format and strict mypy (326 files) clean. `scripts/test_python.py`, as `make test-python` runs it: 2,465 passed, 1 skipped, 8 failed, all the known Anthropic provider tests in `tests/unit/test_agent_providers.py`. Dashboard lint and typecheck clean. Vitest: 702 passed. Playwright, full suite in a sandbox against the mock API: 524 passed, 17 skipped, none failed; two small phone-only CSS tweaks came after that run, and the Projected Impact and Win Probability specs were rerun on the final build (9 passed, 1 skipped).

## Commands

```bash
# Run once; each refuses or reproduces. Heavy steps under the usual systemd-run cap.
python -m courtlens.evaluation.projected_impact_models checks
python -m courtlens.evaluation.projected_impact_models select
python -m courtlens.evaluation.projected_impact_models test    # refuses a second read
python -m courtlens.evaluation.projected_impact_models freeze  # refuses a second run
courtlens refresh-projected-impact --force
```
