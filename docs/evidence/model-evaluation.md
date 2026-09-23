# CourtLoad M6 model card: frozen challenger and final test

Checked 2026-09-21. **No challenger earned promotion.** Historical replay remains EWMA-20
(five-appearance half-life); no boosted model is serving. The task is next-team-game reference
points conditional on appearance, not appearance probability. The target is
`PTS + 1.2 REB + 1.5 AST + 3 STL + 3 BLK - TOV`, scoring hash
`99ae314454a067a93fe16c4c06076adaeb9a36673b46e160455e4e9b14fc1805`.

The accepted archive content hash is
`be2dae2706f9c90d37fef4c70e523e5925c247a2f091d6b885a65255d0b92c4a`; published
snapshot `5b14b7ed-353b-499d-a37a-6887b5f6c715`. Its source is pinned
`NocturneBear/NBA-Data-2010-2024` revision
`a5f108b5b1f08074d78b9e8e901926a9ce4c06c5`. These are revised historical records with
inferred team association, not contemporaneous observations or verified rosters.

## Frozen design and validation selection

| Block | Inclusive dates | Use |
| --- | --- | --- |
| S1 | 2021-10-19–2022-04-10 | First fit |
| V1 | 2022-10-18–2022-12-14 | First validation |
| V2 | 2022-12-15–2023-02-10 | Second validation; fit on S1+V1 |
| C | 2023-02-11–2023-04-09 | Interval calibration only |
| S3 | 2023-10-24–2024-04-14 | Untouched final test |

Core rows require ten valid prior same-season appearances, a recent inferred team and a target
within six days. Cutoffs crossing a block boundary are purged. All estimators use the same scored
mask. Player-only inputs are prior points, minutes, attempts, points per minute, history count
and lead days. Context adds home/away, player and team rest, back-to-back, and prior opponent
points/rebounds/assists allowance with counts and missingness indicators. Player ID, current
roster, target minutes/statistics and future opponent totals are not features.

The frozen learner is scikit-learn 1.6.1 `HistGradientBoostingRegressor`, squared-error loss,
learning rate 0.05, 200 iterations, no early stopping and seed 20260920. Each variant received
the same four-cell leaf/L2 grid. The [official 1.6 estimator documentation](https://scikit-learn.org/1.6/modules/generated/sklearn.ensemble.HistGradientBoostingRegressor.html)
was checked against serialized parameters. Both variants selected 15 leaves and L2=1. Context
won the pooled validation comparison by 0.0003 MAE and became the predeclared finalist; losing
configurations and all validation predictions remain in the immutable local run.

| Variant/config | V1 MAE | V2 MAE | Pooled MAE |
| --- | ---: | ---: | ---: |
| EWMA-20 HL5 baseline | 7.8717 | 7.6242 | 7.7095 |
| Player-only, 15 leaves, L2=0 | 8.0125 | 7.7579 | 7.8456 |
| Player-only, 15 leaves, L2=1 | 7.9983 | 7.7485 | 7.8345 |
| Player-only, 31 leaves, L2=0 | 8.0428 | 7.7750 | 7.8672 |
| Player-only, 31 leaves, L2=1 | 8.0358 | 7.7791 | 7.8675 |
| Context, 15 leaves, L2=0 | 8.0146 | 7.7544 | 7.8440 |
| Context, 15 leaves, L2=1 | 7.9969 | 7.7487 | 7.8342 |
| Context, 31 leaves, L2=0 | 7.9888 | 7.7708 | 7.8459 |
| Context, 31 leaves, L2=1 | 7.9918 | 7.7814 | 7.8539 |

The baseline winner, finalist, selected configurations, all validation results, calibration
policy and unchanged promotion gates were written to `preopen-registration.json` **before** the
S3 database query boundary. Its SHA-256 is
`af076346ecfd1edb5f3f1fff33c08451d14ad1ca784730b97cbe84f0fdb02e23`.

## S3 results

All three estimators were scored on the same 39,988 core forecast rows: 19,527 unique
player-games, 486 players and 142 target dates. Balanced MAE gives each player or player-game
equal weight instead of each lead-time forecast.

| Estimator | MAE | RMSE | Player-balanced MAE | Player-game-balanced MAE | 80% interval coverage | Mean width |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| EWMA-20 HL5 | 7.8187 | 10.0567 | 7.4831 | 7.8767 | 80.22% | 24.7866 |
| Player-only | 7.9656 | 10.1486 | 7.6994 | 8.0102 | 80.65% | 25.2638 |
| Player+context | 7.9604 | 10.1240 | 7.6993 | 8.0062 | 80.53% | 25.2098 |

Calibration used 14,920 scored core rows on 51 dates. The frozen 80% absolute-residual order
statistic yielded half-widths 12.3933 (EWMA), 12.6319 (player-only), and 12.6049 (context).
All cleared the 200-row/20-date availability minimum. Coverage is empirical, not a future
guarantee. The seeded 1,000-replicate, seven-calendar-day moving-block 95% interval for
`context MAE - EWMA MAE` was **[+0.1080, +0.1753]**. Context was worse by 0.1418 points on S3.

Prespecified S3 slices below show identical row counts across estimators. `PG` means unique
player-games. The machine-readable report also contains RMSE, balanced MAEs and interval
coverage/width for every slice.

| Slice | Rows | PG | Dates | EWMA MAE | Player-only MAE | Context MAE |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Prior minutes <15 | 8,347 | 4,135 | 141 | 6.1382 | 6.5227 | 6.5237 |
| Prior minutes 15–<28 | 16,547 | 8,073 | 142 | 7.7232 | 7.7966 | 7.8079 |
| Prior minutes ≥28 | 15,094 | 7,319 | 142 | 8.8526 | 8.9488 | 8.9222 |
| History 10–19 | 9,319 | 4,588 | 142 | 7.4229 | 7.6063 | 7.5846 |
| History 20–39 | 16,089 | 7,692 | 123 | 7.7459 | 7.8916 | 7.9099 |
| History ≥40 | 14,580 | 7,247 | 81 | 8.1519 | 8.2768 | 8.2564 |
| Last appearance 0–1 days | 15,927 | 15,927 | 140 | 7.9713 | 8.0853 | 8.1008 |
| Last appearance 2–3 days | 18,797 | 15,099 | 138 | 7.8730 | 8.0100 | 8.0294 |
| Last appearance 4+ days | 5,264 | 3,304 | 136 | 7.1625 | 7.4448 | 7.2896 |
| Lead 0 days | 19,521 | 19,521 | 142 | 7.8769 | 8.0091 | 7.9994 |
| Lead 1–3 days | 20,029 | 15,166 | 138 | 7.7573 | 7.9182 | 7.9152 |
| Lead 4–6 days | 438 | 309 | 29 | 8.0279 | 8.1930 | 8.2898 |
| Opponent context complete | 39,988 | 19,527 | 142 | 7.8187 | 7.9656 | 7.9604 |

No scored S3 row had missing opponent context, so this archive cannot establish a
missing-context ablation result. All listed slices clear the frozen support minimums: 200 rows,
100 player-games and 20 dates. Context regressed by 6.28% in the under-15-minute slice, exceeding
the 5% guardrail.

## Candidate coverage, gates and serving

S3 produced 73,506 candidate rows: 54,051 core, 9,422 limited-history fallback and 10,033
insufficient-history rows. Outcomes were 49,540 scored appearances across cohorts, 9,972
explicit nonappearances, 13,978 unmatched/unknown, 12 unknown appearances and four inferred-team
mismatches. Unscored cases were not assigned zero. The primary 39,988 scored rows are core only;
fallback is not borrowed into its calibration or promotion mask. A separate S3 count of observed
appearances lacking any candidate was not captured in this M6 report, so total player coverage
cannot be claimed from candidate-side accounting alone.

| Frozen gate | Result |
| --- | --- |
| ≥5% pooled validation gain and positive gain in both folds | **Fail:** context was 1.62% worse pooled and worse in both folds. |
| Lower S3 MAE and paired 95% upper bound below zero | **Fail:** +0.1418 MAE; interval entirely above zero. |
| No supported slice >5% relative MAE regression | **Fail:** prior minutes <15 regressed 6.28%. |
| ≥75% interval coverage and width ≤110% of baseline | Pass: 80.53% coverage, 101.71% width. |

No challenger is promoted. S3 replay estimates retain validation-selected EWMA as primary;
out-of-time challenger estimates are evaluation details only. A later live policy needs a new
prospective decision and data. No model is retroactively described as selected before V1/V2.
The archive cannot prove original schedule publication times, source revisions or historical
roster availability. The conditional target excludes appearance probability and could be misused
as an unconditional game forecast. Future work should investigate the under-15-minute role slice
and collect genuinely prospective data; S3 must not be retuned.

## Artifacts and reproducibility

M5 run `3cf4ae8eb331ac02d3b3`; M6 run `6f7af9e63f27aada910d`. Row-level artifacts remain
in ignored `data/artifacts/evaluation/6f7af9e63f27aada910d`. The immutable manifest hashes
registration, all validation predictions, S3 features/labels/baselines, final predictions,
calibration, replay estimates, machine-readable report and generated model card. Report SHA-256:
`84d5443326c03bfdffdfac2c01ca72b17943ff1f3b0a733f6023e5924aa5de4b`; final prediction
SHA-256: `29ba74269b596347233f34baa7f64c993fc059c826918909b50fb8fb470b43c7`. The run
recorded Python 3.14.7 on x86_64 Linux, scikit-learn 1.6.1, single-thread OMP/OpenBLAS/MKL,
31.95 seconds wall time and 1,620,280 KiB peak RSS. The tree was dirty; its content hash and git
revision are in the local manifest. Identical-platform reproduction is expected within the
frozen `1e-10` tolerance; arbitrary-platform bitwise equality is not claimed.

```text
OMP_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1 MKL_NUM_THREADS=1 \
  courtload evaluate-final --baseline-run 3cf4ae8eb331ac02d3b3 --open-final-test
```

An identical completed run verifies and reuses immutable artifacts without querying S3 again.
