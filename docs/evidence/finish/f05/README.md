# F05 evidence: Win Probability upgrade (`courtlens-win-probability-v3`), not adopted

Measured 2026-11-11 on branch `feat/f05-win-probability-v3`. Registration:
[`courtlens-win-probability-v3`](../../../../evaluation/research/registrations/courtlens-win-probability-v3.json)
(content hash `c9f79a11454e6ca0…`), committed and pushed (5797bd62) before any fit. The served
model is `courtlens-win-probability-v2`, frozen 2026-11-04, which the page calls v1. It was not
changed.

## Result

**Gate A1 fails, so v3 is not frozen or served.**
- **A1:** on the same 2,439 test games and states as the frozen model's own test (2024-25 and 2025-26, a second read), v3 lowers log loss by +0.0007. The 95% game-bootstrap interval is −0.0007 to +0.0024, which includes zero.
- **A2:** calibration error 0.0082, passes (limit 0.02).

| Model (pooled test seasons) | Log loss | Brier | Calibration error |
| --- | --- | --- | --- |
| Frozen served model (v2 registration) | 0.4028 | 0.1341 | 0.0083 |
| v3 (P1, final fit through 2023-24) | 0.4020 | 0.1337 | 0.0082 |

The frozen model's 0.4028 equals R15a's published number on the same states, a check that both read the same states.

| Paired comparison, pooled | Log-loss gain, 95% interval |
| --- | --- |
| v3 against the frozen model (gate A1) | +0.0007 (−0.0007 to +0.0024) |
| B against the frozen model (the frozen recipe, one more training season) | +0.00004 (−0.0006 to +0.0007) |
| P1 before the final fit against the frozen model | +0.0008 (−0.0005 to +0.0022) |
| v3 against B | +0.0007 (−0.0006 to +0.0020) |

By phase, v3 against the frozen model:

| Phase | Games | Gain, 95% interval |
| --- | --- | --- |
| First half | 2,439 | +0.0013 (−0.0010 to +0.0036) |
| Third quarter | 2,439 | +0.0007 (−0.0010 to +0.0026) |
| Fourth quarter, before last two minutes | 2,439 | +0.0010 (−0.0003 to +0.0024) |
| Last two minutes | 2,439 | +0.0002 (−0.0004 to +0.0008) |
| Overtime | 114 | −0.0011 (−0.0057 to +0.0036) |

By season: 2024-25 +0.0009 (−0.0011 to +0.0030); 2025-26 +0.0005 (−0.0018 to +0.0030).

**Reading.**
- Every comparison leans slightly toward v3, and none clears zero. Projected Impact in the pregame layer is the only addition that cleared selection, and on test it isn't distinguishable from the frozen model.
- The pregame forecast didn't get closer to the result: RMSE 14.160 against 14.163 points (winner accuracy 68.2% against 68.4%). The closing spread's 13.71 (R15a) is still well ahead. The pregame gap to the market remains the frozen model's main weakness.

## Selection (2023-24 only; 90% intervals)

| Step | Judged on | Gain against the accepted model | Result |
| --- | --- | --- | --- |
| B: the frozen recipe refitted on train through 2022-23 | | Start; level with the frozen model on 2023-24: +0.0002 (−0.0006 to +0.0010) | Start |
| P1: Projected Impact strength in the pregame layer | All states | +0.0017 (+0.0003 to +0.0031) | Kept |
| P3: overtime specialist | Overtime states, 58 games | −0.0015 (−0.0089 to +0.0057) | Not kept |
| P4: final fit through 2023-24 | Registered procedure, not selected | | Done |

[`ladder-before-test.json`](ladder-before-test.json) was committed (f99794cb) before the test read. The test stage refuses to run twice.

## Inputs and checks

- **P1 projections.** Rolling-origin Projected Impact: for each season from 2018-19, LightGBM with R07's selected settings (4 leaves, min_data_in_leaf 20, 150 rounds), trained only on earlier target seasons. Rookies and returners take the training seasons' group means. [`pi-fits.json`](pi-fits.json) lists each fit's training seasons, rows, model hash and feature hash. Check: the 2023-24 fit, trained on 2016-17 to 2022-23, gives a rookie mean of −1.59, R07's published value for the same seasons.
- **P1 pregame layer.** The weight splits between monthly RAPM (0.42) and Projected Impact (0.41). B's training RMSE was 12.87 on 2015-16 to 2022-23; P1's was 13.25 on 2018-19 to 2022-23. These are different seasons, so not comparable; selection decides.
- **Runs.** Every stage ran under the registered caps through `scripts/run_win_probability_v3.sh` (systemd: 2 CPUs, 3,072 MiB with no swap, 1,800 s). The longest took 1 min 42 s, peak 2.2 GB.
- **Data.** The frozen model's game table and state files were read, not rebuilt (same content hashes). Its saved test probabilities are gate A1's reference, matched state by state.

## Not done, by the registration

- No freeze, serving, live scorecard or prospective head-to-head: these depend on A1 passing.
- Freeze checks (ESPN-state parity, latency) were not run, because there is nothing to freeze.

## Files

| File | What |
| --- | --- |
| [`test-report.json`](test-report.json) | Every metric, overall and by phase, pooled and per season, for v3, B, P1 before the final fit and the frozen model |
| [`ladder-before-test.json`](ladder-before-test.json) | Selection and final-fit log, with model hashes, frozen before the test |
| [`pi-fits.json`](pi-fits.json) | Receipts of the rolling-origin Projected Impact fits |
| [`../../../../evaluation/research/derived/courtlens-win-probability-v3-test.json`](../../../../evaluation/research/derived/courtlens-win-probability-v3-test.json) | The summary the page shows (`/api/win-probability`, `upgrade`) |
