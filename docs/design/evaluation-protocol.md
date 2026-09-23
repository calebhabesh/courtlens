# CourtLoad reproducible evaluation protocol

Status: prescribed baseline experiment, 2026-09-20. Parent: [implementation handover](../implementation-plan.md). Implement after the source and warehouse gates. Numerical thresholds below are project design choices, not measured findings or universal statistical standards. Freeze them before final testing; record justified changes made before that freeze.

## 1. Question and artifacts

Question: does a small gradient-boosted regressor improve next-team-game production estimates, conditional on observed appearance, over strong rolling baselines? Does opponent/rest/home-away context add measurable value beyond prior player production?

Target: reference fantasy points v1, using the exact formula/hash in the [data contract](data-serving-contracts.md). One target only. The experiment is required; a winning challenger is optional.

Create a configuration such as `evaluation/config/baseline-v1.yaml` and a CLI such as:

```text
courtload evaluate --config evaluation/config/baseline-v1.yaml --dataset <manifest>
courtload build-replay-estimates --dataset <manifest> --policy <policy-manifest>
```

These are interfaces to implement, not existing commands. Evaluation is offline and reads immutable artifacts. Separate development/validation and final-test stages in the CLI so an ordinary iteration does not repeatedly open the final holdout. A rerun of identical frozen code/config is reproducibility, not a new opportunity to select parameters.

Each run writes configuration, dependency lock/environment, code revision and dirty-code hash if applicable, dataset/feature/scoring hashes, split manifest, row exclusions, candidate predictions, residual/calibration artifacts, metrics JSON, plots and Markdown model card. Hash the outputs. Raw provider files and model binaries stay in ignored artifact storage; commit compact configs/manifests and distributable reports. Load only locally produced trusted model artifacts.

## 2. Candidate rows, eligibility and missing outcomes

Generate candidates using the exact prior-team and reconstructed-schedule algorithm in the data contract. Daily cutoffs may produce several forecasts for the same player/target game at different lead times. Retain the cutoff and `lead_days` (0–6); this evaluates the actual comparison experience rather than silently testing only game-day forecasts.

Core eligibility at cutoff: at least 10 prior confirmed appearances with complete reference-scoring inputs and valid positive minutes in the selected season, plus a usable inferred-team target. The latest observed appearance must be within the 30-day team-association window. All candidates and models use the same eligibility mask; a challenger cannot omit its difficult rows to win.

Product fallback rules:

| Available valid prior appearances | Output |
| --- | --- |
| 0–4 | Descriptive available history; `insufficient_history`; no numerical estimate. |
| 5–9 | Mean of available valid appearances, labeled `limited_history_baseline`; report separately from the primary cohort. |
| 10+ | Registered rolling baseline or approved estimator policy; report main experiment metrics. |
| Missing/ambiguous team or no target in horizon | Profile remains usable; no target estimate, with the reason shown. |

After prediction generation, join outcome by player + target game + predicted team. Score only confirmed appearances with complete reference-point labels. Missing rows, unconfirmed zero-minute records, incomplete labels and trade/team mismatches remain unscored with separate counts. An explicit reported nonappearance is also unscored for this conditional target. None receives a zero label.

Report coverage denominators: all candidates, core eligible, fallback, no estimate, observed scored outcomes, explicit nonappearances, unmatched/unknown rows, excluded labels, unique target games, unique player-games, and players. Also count observed appearances for which the candidate generator had no matching prediction. This exposes the limitations of inferred historical rosters instead of evaluating only an apparently complete subset.

## 3. Feature definitions and baselines

All history ends before the cutoff date; no same-day row is available. Source observation-time fidelity is unavailable for the archive and must be labeled revised historical reconstruction. Features are exported without target outcomes; outcomes are stored in a separate label relation and joined only after predictions exist.

| Family | Fixed initial inputs |
| --- | --- |
| Prior player production | Last-5 and last-10 reference-point mean; last-10 sample standard deviation; valid history count capped at 50. |
| Role | Last-5/10 minutes means, last-10 minutes variation; last-10 FGA/FTA means; reference points per minute using paired denominators. |
| Temporal lead | Days from cutoff to reconstructed target, included in both challengers because both must model the same horizon. |
| Added context only | Home/away; days since last observed appearance; team schedule rest/back-to-back; opponent prior last-10 PTS/REB/AST allowed and valid counts. |

Cap numerical rest at 30 days and retain missingness indicators. Do not include player ID, current roster/position, target player team read from a future outcome, target minutes, target score, opponent future totals, or season-end summaries. No additional feature search is needed for the baseline. Optional source metrics with missing values retain missingness; count fields used in the target never silently become zero.

Baselines:

1. **Last-10 mean:** arithmetic mean of 10 prior valid appearances.
2. **EWMA:** last up to 20 prior valid appearances, newest with age 0, normalized weights `2^(-age/5)` (half-life 5 appearances). Reset at the selected season boundary.

Both use the same prior valid rows. Formula and hyperparameters are frozen rather than tuned on final results. Last-5/median/ridge/neural models from older templates are not additional requirements.

Challenger: `HistGradientBoostingRegressor`, squared-error loss, fixed random seed 20260920, learning rate 0.05, max iterations 200, `early_stopping=False`, and a four-configuration grid: `max_leaf_nodes ∈ {15,31}` × `l2_regularization ∈ {0,1}`. Keep other supported parameters at explicitly serialized defaults for the pinned scikit-learn version. Cap CPU threads and record wall time/memory. Train player-only and player-plus-context variants with equal budgets.

The estimator supports missing numerical inputs; its automatic validation behavior is avoided here because this experiment supplies chronological splits explicitly. Verify the installed version against the [official estimator documentation](https://scikit-learn.org/stable/modules/generated/sklearn.ensemble.HistGradientBoostingRegressor.html). Do not add scaling merely for tree models. Any preprocessing fitted from data must fit on training rows only.

## 4. Chronological split plan

Aim for three accepted consecutive seasons S1, S2, S3; exact dates and coverage are frozen after M1. S3 is the untouched final test season. Do not substitute the most recent season if it is incomplete or poorly covered.

Divide S2's regular-season calendar span into three contiguous date blocks: V1, V2, C. Freeze their actual inclusive start/end dates in the split manifest. Boundaries are calendar boundaries, not player-row quantiles. C is calibration only, not tuning.

| Stage | Fit data | Prediction block | Purpose |
| --- | --- | --- | --- |
| Validation fold 1 | S1 | V1 | First out-of-time comparison. |
| Validation fold 2 | S1 + V1 | V2 | Second chronological comparison. |
| Final fit | S1 + V1 + V2 | C, then S3 | Fixed candidate fit; C calibrates intervals, S3 tests once. |

Assign every target game, all its players and all lead-time predictions to the same split using target game date. Within any scored prediction block, also require `cutoff_date >= block_start`; purge candidates whose earlier cutoff crosses the boundary. Training labels must all precede the earliest prediction cutoff of the next block. Thus several forecasts of the same game cannot cross train/validation/test boundaries. Report purged counts. For a given fold, fit once and keep model parameters fixed throughout its prediction block; rolling feature history may incorporate earlier completed games within that block.

A target game for cutoff D may lie up to six days later; the purging rule is mandatory. A generic row-index time split or random split is not an equivalent implementation. Store exact membership hashes and test same-game/same-date grouping.

Select each challenger's configuration from V1/V2 only. Ties go to the smaller tree, then stronger regularization, with a stable config ID. Choose the strongest baseline by pooled V1/V2 MAE. Compare context versus player-only with paired rows. Select one challenger finalist using V1/V2; keep the other as a predeclared ablation and still report its final results without post-test selection.

With only two usable seasons, M1 must propose a reduced-coverage plan for the owner before claiming the three-season gate. A defensible alternative partitions the earlier season into fit/validation/calibration blocks and reserves the later season, but it must have enough history and distinct dates. Do not silently shrink the holdout until a preferred result appears.

## 5. Metrics and uncertainty

Primary: forecast-row MAE in reference points on the identical scored core cohort. Also report RMSE, per-player mean MAE averaged equally across players, and MAE averaged first across forecasts of each unique player-game and then across player-games. This makes repeated lead-time predictions visible. Publish row and unique-game counts alongside every metric.

Prespecified slices use information available at cutoff:

- Prior last-10 minutes: `<15`, `15–<28`, `>=28`.
- Prior valid history: `10–19`, `20–39`, `>=40`; fallback `5–9` separately.
- Days since last observed appearance: `0–1`, `2–3`, `4+`, unknown.
- Lead days: `0`, `1–3`, `4–6`.
- Complete versus missing opponent context; validation fold and final season.

For paired error differences, use 1,000 seeded moving-block bootstrap resamples of seven consecutive calendar dates of **target games**, carrying every player and every lead-time forecast of those games together. Reindex calendar dates including days without games and resample within each evaluation block, not across train/test boundaries. Recompute the metric in each replicate and report the 95% percentile interval. This is an uncertainty estimate under a chosen block scheme, not proof of independence or future performance. Record the exact resampling implementation/config.

Empirical intervals: aim for 80% central coverage using absolute residuals from C, generated by the fixed final-fit estimator. For n residuals, use order statistic rank `ceil((n+1)*0.8)`, capped at n; interval is point estimate ± that residual quantile. Negative reference-point outcomes are possible, so do not blindly clamp the lower bound to zero. Each estimator gets its own calibration artifact.

Use one global core-cohort interval initially; require at least 200 residual rows across at least 20 distinct target dates. Otherwise display `interval_unavailable`. Evaluate achieved coverage and mean width on S3 and by the prespecified slices. Correlated daily forecasts and changing roles mean no nominal-coverage guarantee is claimed. Limited-history fallback intervals require their own sufficient prior calibration cohort; otherwise omit the interval. Do not borrow core-player calibration while labeling it validated for cold starts.

## 6. Frozen promotion rule

Before opening S3, register the baseline winner, challenger finalist, all configs, calibration policy and these gates:

1. Challenger pooled V1/V2 MAE improves by at least 5% over the validation-selected baseline; improvement is positive in both folds.
2. On S3, challenger MAE is lower and the upper bound of the paired 95% calendar-block interval for `challenger_MAE - baseline_MAE` is below zero.
3. No important supported slice has >5% relative MAE regression versus the baseline. A slice is supported for this gate with at least 200 forecast rows, 100 unique player-games and 20 target dates; mark smaller slices as inconclusive.
4. Challenger empirical S3 interval coverage is at least 75% for the nominal 80% interval, and mean width is no more than 110% of the baseline's interval width. These are project guardrails, not coverage guarantees.

Failure of any gate means no promotion. Report why. If baseline error is zero in a denominator, report absolute differences and treat relative-improvement promotion as unsupported. Never tune again on S3 or substitute the other challenger after seeing its S3 score.

Promotion means eligible for a later deployment policy; the historical application can remain baseline-led. A context feature may remain useful descriptively when its model ablation loses. Publish a model card regardless of outcome, including whether any model is actually serving.

## 7. Historical serving without model-selection hindsight

Each replay estimate needs a fitting/calibration cutoff earlier than its replay cutoff. A model trained on S1+S2 cannot legitimately generate “out-of-time” estimates for S1. Model-selection dates also matter: choosing the best model using later games is hindsight even if its feature vector is shifted.

Default historical policy:

- Before validation selection is frozen: use the predeclared last-10 baseline (or limited-history fallback). Intervals use only prior residuals whose target dates have completed before the cutoff, with the minimum sample rule above. No future-selected challenger is silently applied to these dates.
- In S3: use the validation-selected rolling baseline as the primary replay estimate. Its calibration artifact ends before S3. Persist and expose the predeclared challenger predictions in evaluation details; they were generated out of time, regardless of their eventual promotion outcome.
- Display final promotion status in evaluation, not as a retroactive claim that the deployed estimator was selected before earlier games. A future live deployment may activate a promoted challenger only after that decision exists.

This gives useful honest estimates throughout the archive without needing many rolling model refits. Artifact metadata records fit end, calibration end, selection cutoff and prediction mode. If an estimate cannot meet these rules, return `artifact_not_available_for_cutoff` and keep descriptive form visible.

## 8. Required tests and report structure

Tests must verify baseline weights, season reset, minimum history, target-candidate independence from future participation, prior-day/DST cutoffs, grouped/purged splits, train-only fitting, calibration ordering, paired evaluation masks, fallback accounting, and immutable stored predictions. Mutating target/future stats must not change prior feature hashes; changing earlier legitimate history should change affected later features. A negative control is as useful as the leakage check.

On a small frozen fixture, rerun the complete experiment and compare membership/prediction hashes and metrics within declared floating-point tolerance. On real data, record exact versions, CPU/thread settings and tolerance; do not claim bitwise portability across arbitrary platforms.

The model card must contain: task and exclusions; source/provenance/coverage; revised-history and inferred-roster limitations; exact split dates and counts; target/features/baselines; candidate grid and selection; MAE/RMSE/balanced results; calendar-block intervals; interval coverage/width; all slice counts; unscored cases; context ablation; promotion decision; serving policy; artifact IDs; reproducibility command; and future work justified by observed errors. No fabricated improvement percentages or claims about real forward accuracy.
