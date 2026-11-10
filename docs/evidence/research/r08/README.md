# R08 — Metric Backtest

Measured 2026-11-05 on branch `research-r08`. Parent: [Research progress](../../../research-progress.md), [Research handoff](../../../research-plan.md). Registration: [`courtlens-metric-backtest-v1`](../../../../evaluation/research/registrations/courtlens-metric-backtest-v1.json), content hash `43d6f1d36ace9807…`. Results: [`courtlens-metric-backtest-v1.json`](../../../../evaluation/research/frozen/courtlens-metric-backtest-v1.json), `0d45de08c46e5c11…`.

## Status

| Part | State |
| --- | --- |
| Data check | Done before registering: counts, dates and two recompute checks; no margin was read for any candidate |
| Registration | Commit `7f6f0f6`, 2026-11-05 22:51 UTC, after the code commit `4f8a128` (which cannot score anything without it) |
| Backtest | Read once, 22:51:31 UTC. Two `reproduce` runs give the same hash. The runner refuses a second `test` |
| 2026-27 freeze | 2026-11-05 22:52:08 UTC, manifest `8692e886a1f13…`, committed in `4b5f3fc` |
| Prospective score | **Unverified.** No game has tipped since the freeze. First tip 2026-11-06 02:00 UTC. The scorer is built and has scored 120 real 2026-27 games, all hindsight |
| Timer | **Not installed or enabled.** Commands below |
| Update, 2026-11-09 | **First prospective score:** 25 prospective and 121 hindsight games through Nov 8, 2026 (`refresh-metric-backtest --force`, on the owner's instruction). No player metric's RMSE gain over Team net excludes zero on those 25 games, and the backtest verdict never changes from them. The rows above stand as written on 2026-11-05. **Timer now installed:** `courtlens-metric-backtest`, in `scripts/install_data_refresh.sh`, firing daily and scoring when the last score is at least 7 days old. See [RD10](../design-RD10/README.md) |
| Page | `/research/backtest`, Research → Impact, plain D13 build. Verified on real data; only the owner marks it ✅ |

**Disclosure.** The first chained `git commit && run` stopped before the runner started: the chain called `/usr/bin/time`, which isn't installed. Nothing was computed. The run 5 seconds later is the first and only read.

## Question and design

For every regular-season game in a test season, predict the home margin from each player's rating as it stood before the game, weighted by the **minutes he actually played**. Using actual minutes isolates rating quality from playing-time prediction, so this tests ratings, not game forecasts.

- Strength `D` = home minus away of (box seconds ÷ 2,880) × rating; for the team baseline, home minus away net rating.
- Margin = `a × H + b × D`, H = 0 only for the 2019-20 bubble. a, b and the residual SD are fitted on the **latest earlier season** the metric exists in. P(home win) = Φ(margin ÷ SD).
- Scores: margin RMSE (the verdict), winner picked, Brier, log loss, 10-bin calibration error.
- Paired game bootstrap within each season, 2,000 replicates, seed `SeedSequence([8008, year])`, the same draws for every metric. 95% intervals.
- **Registered rule:** "A predicts better than B" only if the pooled 95% interval of B's RMSE minus A's lies above zero **and** A has the lower RMSE in more than half of the shared seasons. Otherwise there is no ranking.
- Nothing was chosen from outcomes, so there is one pass and no choice pass.

## Data check (before registration)

[`data-check.json`](data-check.json), [`table-hashes.json`](table-hashes.json).

| Candidate | Ratings for season t | Scored | Minutes replaced, by season |
| --- | --- | --- | --- |
| Team net (baseline) | t−1 box-score net rating, Teams page formula | 2016-17 to 2025-26 | — |
| Plus-minus per 100 | t−1 on-court net, pooled across teams, ≥ 250 possessions each side on and off | 2016-17 to 2025-26 | 11.4–14.3% |
| On/off per 100 | t−1 on minus off, same minimum | 2016-17 to 2025-26 | 11.4–14.3% |
| RAPM 1Y | t−1 season-end fit | 2016-17 to 2025-26 | 9.7–13.2% |
| RAPM 3Y | three-season fit ending t−1 (first complete one ends 2016-17) | 2018-19 to 2025-26 | 8.2–11.9% |
| Box-prior RAPM | t−1 1Y box-prior fit | 2017-18 to 2023-24, 2025-26 | 9.7–13.2% |
| Time decay, monthly | newest R01 snapshot with cutoff on or before the game date | 2016-17 to 2025-26 | 0.5–1.1% |
| Time decay, opener only | the season-opener snapshot, held all season | 2016-17 to 2025-26 | 8.2–11.9% |
| Projected Impact | R07's frozen LightGBM via R07's feature path, no refit | 2024-25, 2025-26 | 0.0% |

- **Rule for season-end fits:** the previous season's fit only, never dated refits. It needs no new fitting and cannot read the test game. Monthly updating is measured by the two time-decay variants instead.
- **Games:** every game with a two-team box, 1,230 per season (2019-20 1,059 with 88 bubble games; 2020-21 1,080). 11,979 test games in all. Box minutes are used rather than R01 stints, so R01's 3–26 excluded games per season are still scored.
- **Replacement:** a player without a rating takes the 20th percentile of that source's own ratings, weighted by the source's playing time (equal weights for Projected Impact). It is never zero.
- **Box-prior gap:** the sealed 2023-24 fit has no box prior, so 2024-25 is unscored and 2025-26 takes its scale from 2023-24.
- **DARKO omitted:** the stored files hold one rating per season, recomputed with DARKO's current model ("original publication-time model versions are unavailable"). That is hindsight, and no free dated pregame history exists. It is credited and its omission is stated on the page.
- **Leakage audit:** every one of 103,912 game ratings reads only sources whose inputs end before the game, with 0 violations. `test_later_outcomes_never_change_earlier_scores` and `test_season_sources_ignore_later_fits` prove that adding or changing later data changes no earlier rating or score. `test_snapshot_for_never_reads_a_later_cutoff` covers the snapshot pick.
- **Recompute checks:** [`team-net-check.json`](team-net-check.json): 360 team-season net ratings (2014-15 to 2025-26) equal the Teams API exactly. [`projected-impact-check.json`](projected-impact-check.json): the recomputed projections, scored with R07's own rule, reproduce R07's published RMSE to every digit (14.38933581393027, 14.92772682351593, 14.66100292073454).
- **Tables:** three builds were byte-identical; 12 hashes are pinned in the registration.
- **Known before registering:** R07 had published margin RMSE on 2024-25 and 2025-26 for Projected Impact, prior 1Y RAPM and the opener snapshot; R15a had published it for team form. Nothing was changed because of them.

## Result

Pooled over each metric's own seasons ([results](../../../../evaluation/research/frozen/courtlens-metric-backtest-v1.json)). Compare metrics through the paired gains, not row against row.

| Metric | Seasons | Games | RMSE, 95% | Winner | Brier | Log loss | Cal. error |
| --- | --- | ---: | --- | ---: | ---: | ---: | ---: |
| Team net (baseline) | 10 | 11,979 | 14.32 (14.12–14.51) | 60.9% | 0.2324 | 0.6565 | 0.0075 |
| Plus-minus | 10 | 11,979 | 14.02 (13.82–14.21) | 63.5% | 0.2245 | 0.6399 | 0.0138 |
| On/off | 10 | 11,979 | 14.16 (13.96–14.35) | 62.6% | 0.2284 | 0.6484 | 0.0179 |
| RAPM 1Y | 10 | 11,979 | 13.87 (13.67–14.05) | 64.4% | 0.2209 | 0.6323 | 0.0147 |
| RAPM 3Y | 8 | 9,519 | 14.00 (13.77–14.22) | 65.1% | 0.2186 | 0.6272 | 0.0190 |
| Box-prior RAPM | 8 | 9,519 | 13.85 (13.63–14.06) | 64.6% | 0.2208 | 0.6321 | 0.0170 |
| **Time decay, monthly** | 10 | 11,979 | **13.52 (13.33–13.71)** | 66.8% | 0.2127 | 0.6144 | 0.0230 |
| Time decay, opener | 10 | 11,979 | 13.72 (13.52–13.91) | 65.6% | 0.2167 | 0.6232 | 0.0186 |
| Projected Impact | 2 | 2,460 | 14.66 (14.23–15.12) | 66.8% | 0.2116 | 0.6125 | 0.0280 |

Margin RMSE by season (points):

| Metric | 16-17 | 17-18 | 18-19 | 19-20 | 20-21 | 21-22 | 22-23 | 23-24 | 24-25 | 25-26 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Team net | 12.83 | 13.15 | 13.66 | 13.67 | 15.11 | 14.90 | 13.36 | 15.17 | 15.16 | 15.87 |
| Plus-minus | 12.80 | 12.82 | 13.56 | 13.22 | 14.75 | 14.59 | 13.06 | 14.76 | 14.84 | 15.48 |
| On/off | 13.00 | 13.05 | 13.81 | 13.65 | 14.53 | 14.70 | 13.13 | 14.65 | 15.05 | 15.73 |
| RAPM 1Y | 12.67 | 12.76 | 13.39 | 13.30 | 14.54 | 14.49 | 12.86 | 14.39 | 14.57 | 15.39 |
| RAPM 3Y | – | – | 13.32 | 13.17 | 14.40 | 14.25 | 12.85 | 14.41 | 14.33 | 15.03 |
| Box-prior RAPM | – | 12.73 | 13.33 | 13.26 | 14.42 | 14.40 | 12.80 | 14.32 | – | 15.30 |
| Time decay | 12.53 | 12.65 | 13.18 | 12.94 | 14.16 | 13.98 | 12.77 | 14.15 | 14.15 | 14.54 |
| Time decay, opener | 12.60 | 12.91 | 13.30 | 13.11 | 14.35 | 14.19 | 12.74 | 14.34 | 14.36 | 15.04 |
| Projected Impact | – | – | – | – | – | – | – | – | 14.39 | 14.92 |

Paired RMSE gains (positive favours the first metric), pooled over shared seasons, 95%:

| Pair | Gain | Lower in | Verdict |
| --- | --- | --- | --- |
| Time decay over team net | +0.80 (+0.72 to +0.88) | 10 of 10 | better |
| Time decay over RAPM 1Y | +0.34 (+0.29 to +0.40) | 10 of 10 | better |
| Time decay over RAPM 3Y | +0.24 (+0.19 to +0.29) | 8 of 8 | better |
| Time decay over box-prior RAPM | +0.28 (+0.22 to +0.35) | 8 of 8 | better |
| Time decay over the opener snapshot | +0.20 (+0.15 to +0.24) | 9 of 10 | better |
| Time decay over Projected Impact | +0.31 (+0.18 to +0.43) | 2 of 2 | better |
| Projected Impact over RAPM 1Y | +0.33 (+0.22 to +0.44) | 2 of 2 | better |
| Projected Impact over the opener snapshot | +0.05 (−0.02 to +0.14) | 1 of 2 | **no ranking** |
| Projected Impact over RAPM 3Y | +0.03 (−0.06 to +0.12) | 1 of 2 | **no ranking** |
| RAPM 3Y over RAPM 1Y | +0.15 (+0.10 to +0.20) | 7 of 8 | better |
| Plus-minus over on/off | +0.14 | 10 seasons | better |

All 36 pairs, with Brier, log loss and accuracy gains per season and pooled, are in the results file and on the page.

## Verdict under the registered rule

- **Time-decay RAPM refreshed monthly is the only metric ranked above every other** (all 8 pairs), with the lower RMSE in every shared season except 1 of 10 against the opener snapshot.
- **Every player metric beats the team baseline.**
- **Freshness, not just method.** The same time-decay method frozen at the opener loses to the monthly version by 0.20. Its edge over the season-end fits (opener over RAPM 1Y, RAPM 3Y and box-prior) is also ranked. Both the method and the monthly refresh count.
- **Projected Impact** beats the season-end fits it was built to improve on (RAPM 1Y, box-prior, raw metrics). It can't be ranked against RAPM 3Y or the opener snapshot, and it loses to the monthly time decay. This differs from R07's game result (+2.85 squared-error gain over the opener snapshot, interval excluding zero). R08 refits the scale each season and uses a different replacement rule, and under its own rule the interval includes zero. Both numbers stand under their own registrations.
- 2 of 36 pairs are unranked. Intervals are not adjusted for 36 comparisons; the more-than-half-of-seasons condition is the guard. The Projected Impact and box-prior pair rests on one season (2025-26).
- Calibration error: the baseline is best calibrated (0.0075), and the player metrics run 0.014–0.028. A single residual SD per season makes confident metrics slightly over-confident. This is reported only and carries no verdict.

## 2026-27

- **Frozen** 2026-11-05 22:52:08 UTC with each metric's a, b and SD fitted on 2025-26, the 2026-27 sources table `44d17524…` pinned in the registration, and Projected Impact read from its frozen file `6eaef389…`.
- `courtlens refresh-metric-backtest [--force]` adds each completed game once, one row per game in `data/derived/metric-backtest-serving/games.jsonl`, and rewrites `summary.json`. It does nothing within 7 days of the last run unless forced. The monthly time-decay rating reads the newest R15b snapshot (`data/derived/win-probability-ratings`) on or before the game date, checked by hash and recorded per row. A game is prospective only if it tipped after the freeze. Intervals start at 20 prospective games. The backtest verdict never changes from these games.
- **Run on real games:** 120 games, 2026-10-20 to 2026-11-04, [`season-2026-27-summary.json`](season-2026-27-summary.json). **All hindsight; do not quote them.** Only Projected Impact's gain over team net excludes zero on these 120 games (+0.98, +0.41 to +1.58). Monthly time decay is +0.52 (−0.27 to +1.31).

## Page

Research → Impact → Metric Backtest (`/research/backtest`): plain-language verdict, one chart of RMSE by metric and season with intervals (chips choose the metrics; the default is the baseline, RAPM 1Y, monthly time decay and Projected Impact), the RMSE-by-season table, pooled scores, paired differences against any chosen metric (pooled or one season; green or red only when the whole interval is on one side), the 2026-27 score kept apart, what each metric is with credit (Rosenbaum, Sill, Engelmann for the box prior idea, Databallr for time decay, CourtLens's own Projected Impact, DARKO named as omitted), caveats, and a method card. The page uses the control kit and shared tables and charts, with no page CSS and no inline styles beyond `chartVars`.

**Browser check** ([`browser-check.mjs`](browser-check.mjs), [`dom-checks.json`](dom-checks.json)), real data through a private API: 3,036 values at 1440 and 3,036 at 390 equal the API, with 0 mismatches, 0 console errors and 0 px horizontal overflow. That covers every pooled score and interval, every season cell, every chart point with all metrics shown, every pair against every reference pooled and against the baseline per season, the tones, verdicts, 2026-27 tables and the results hash. Screenshots: [`backtest-1440.png`](backtest-1440.png), [`backtest-390.png`](backtest-390.png), full pages and [`backtest-chart-all-1440.png`](backtest-chart-all-1440.png).

## Checks

- Ruff, format and strict mypy (353 files) clean. Python (`scripts/test_python.py`): 2,603 passed, 1 skipped, 8 failed, all the known `test_agent_providers[anthropic]` SDK failures.
- New tests: `tests/unit/test_metric_backtest.py` covers the rules, leakage, the whole runner end to end on synthetic data, determinism, the refusal of a second read, the scorer and hash refusal, and the committed results obeying the rule. `tests/unit/test_metric_backtest_api.py` covers the payload and the 503.
- Dashboard lint and typecheck clean; Vitest 728 passed.
- Playwright: the new `e2e/r08-metric-backtest.spec.ts` has 6 tests. The full suite ran twice (production build, mock API, two workers, 8 GiB cap). The first run: 550 passed, 17 skipped, 1 failed. The failure was a strict `#depth-chart` lookup in `roster-shapes.spec.ts` that caught React's hidden streamed Suspense copy, the same pattern as the 2026-11-05 fixes. The fix is `.filter({ visible: true })` on that lookup. That test then passed 10 of 10 under 4 workers. Second full run: **551 passed, 17 skipped, 0 failed**.
- Not fixed and not R08's: the Roster Shapes drag-and-keyboard test (line 213) failed 2 of 10 repeats under the 4-worker stress run, with the PG lane not receiving the chip. It passed in both full runs.
- Runtime: tables 11 s at 1.0 GiB peak; backtest 3.4 s at 442 MiB; freeze 1.1 s.

## Commands

```bash
# Reproduce (from a directory with data/ and evaluation/ as in the main checkout)
python -m courtlens.evaluation.metric_backtest_data build --output <dir>   # same 12 hashes
python -m courtlens.evaluation.metric_backtest_runner reproduce             # same results hash
# 2026-27, weekly (not scheduled; see the progress log)
courtlens refresh-metric-backtest            # no-op within 7 days of the last run
courtlens refresh-metric-backtest --force
```

## Limitations

- Actual minutes are hindsight by design; this is not a pregame forecast (R15 is).
- Season-end fits never update within a season, and only the time-decay variants do.
- Only bubble games are treated as neutral; NBA Cup semifinals and international games get the home term.
- Projected Impact has two test seasons.
- The replacement rule shapes raw metrics most.
- One residual SD per season and metric; calibration is reported, not tuned.
