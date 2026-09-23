# Frozen rolling-baseline evaluation

Checked 2026-09-21. Milestone M5 binds the accepted archive manifest to published snapshot
`5b14b7ed-353b-499d-a37a-6887b5f6c715`. The versioned protocol is
`evaluation/config/baseline-v1.yaml`; its dataset content SHA-256 is
`be2dae2706f9c90d37fef4c70e523e5925c247a2f091d6b885a65255d0b92c4a`.

The command below read S1 and S2 through the 2023-04-09 calibration boundary. Its database
queries excluded all later player games, team games, profiles and contexts. S3 (2023-10-24
through 2024-04-14) remains sealed for M6.

```text
OMP_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1 MKL_NUM_THREADS=1 \
courtload evaluate \
  --config evaluation/config/baseline-v1.yaml \
  --dataset evaluation/manifests/accepted-archive-v1.json
```

## Result

Run `3cf4ae8eb331ac02d3b3` selected the predeclared EWMA-20 baseline with a five-appearance
half-life. It improved pooled V1/V2 MAE by 0.1170 reference points (1.49%) against last-10. Both
validation folds favored EWMA. This is baseline selection, not evidence that a challenger has
earned promotion.

| Block | Estimator | MAE | RMSE | Player-balanced MAE | Rows | Player-games |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| V1 | Last 10 | 8.0047 | 10.2589 | 7.8303 | 8,822 | 4,306 |
| V1 | EWMA-20 HL5 | 7.8717 | 10.1077 | 7.7068 | 8,822 | 4,306 |
| V2 | Last 10 | 7.7328 | 9.9474 | 7.4700 | 16,793 | 7,844 |
| V2 | EWMA-20 HL5 | 7.6242 | 9.7918 | 7.3634 | 16,793 | 7,844 |
| Pooled V1/V2 | Last 10 | 7.8264 | 10.0558 | 7.5462 | 25,615 | 12,150 |
| Pooled V1/V2 | EWMA-20 HL5 | 7.7095 | 9.9017 | 7.4329 | 25,615 | 12,150 |

The seeded 1,000-replicate, seven-calendar-day moving-block interval for `EWMA MAE - last-10
MAE` was `[-0.1446, -0.0885]`. This describes uncertainty under the registered block scheme; it
does not establish independent errors or future performance.

Calibration used 14,920 scored core rows across 51 target dates. The registered 80% absolute
residual order statistic was 12.3933 for EWMA and 12.7000 for last-10, so both clear the
minimum 200-row/20-date availability rule. Coverage is evaluated only on the untouched S3 in M6.

## Coverage and exclusions

The generator considered 191,060 player/cutoff combinations across S1/S2 and produced 147,436
candidate rows: 111,572 core eligible, 16,725 limited-history fallback, and 18,717 insufficient
history after 422 boundary-purged rows. Candidate regeneration had zero mart mismatches.

Labels contained 99,652 scored rows, 18,982 explicit nonappearances, four unknown appearances,
28,351 unmatched/unknown outcomes, 25 inferred-team mismatches, and zero unconfirmed zero-minute
or incomplete reference-point labels. There were 1,550 observed appearances without any
candidate. These cases remain counted rather than being assigned zero production. The metric mask
was identical for both registered baselines.

Prespecified validation slices were emitted for prior minutes, prior history, days since last
appearance, lead days, opponent-context completeness and validation fold. All 25,615 scored
validation rows had complete opponent context; this slice therefore has no missing-context
comparison in M5.

## Reproducibility

The ignored local run directory contains separate `features.jsonl` and `labels.jsonl`, baseline
predictions, split membership, exclusions, slice metrics, calibration, selection, environment,
runtime and file hashes. Compact frozen inputs and this measured report are committed; raw and
row-level derived artifacts remain local.

- Membership SHA-256: `0100135cf748573155974a7122722fd8339cb48d502a16a0d21ac4cd22d3c518`
- Feature-set SHA-256: `d2d2af29ee0209ffd97d6e469e7742024c9d1f83855e9f7c34036da2f9624c4c`
- Prediction SHA-256: `6b0d73f3759151ead73ea693f7785d0da9897eb747563444aef3d272bd0e5dec`
- Label SHA-256: `a367dac1eed11b29bcbd4cab12ab89d9db9e63e1196eece05e11f931ef75d02d`
- Evaluation SHA-256: `64bca9408992b63bf81835a11fdd60d59ead199967952569e62ef480a3060f73`
- First measured run: 17.03 seconds, 980,116 KiB peak RSS, one configured CPU thread

An immediate second run returned the same run ID and all five hashes, verified every immutable
artifact byte-for-byte, and reported `reused_identical_artifacts: true`. The experiment records
the current git revision and a dirty-tree content hash because this handover work is not yet
committed. No baseline result, calibration choice, challenger configuration or promotion gate was
changed after viewing S3; M6 must preserve that boundary.
