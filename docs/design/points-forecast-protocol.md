# Points-v1: chronological player forecasting protocol

Status: prescribed experiment, 2026-10-01. Parent: [workbench handoff](../workbench-implementation-plan.md). Numerical thresholds here are project choices to preregister, not measured results. The completed reference-points M5/M6 experiment remains sealed under its original protocol.

## Question and target

Question: how accurately can prior regular-season performance estimate a player's basketball points in the selected next team game, conditional on a confirmed appearance? Does prior opponent/rest/home-away context add useful predictive information beyond player history? Does a fixed previous-season prior help early-season estimates?

Target identity: `basketball-points-v1`, measured in actual PTS. It is separate from `reference-points-v1`; changing a formula label does not constitute a new evaluation. Target eligibility requires a confirmed appearance, a nonmissing nonnegative points outcome and valid positive recorded minutes. Zero points in an eligible appearance is a valid label. Ambiguous/zero-minute records and nonappearances are counted separately, never assigned a zero target.

This experiment does not estimate participation, injury, wins, team placement or causality. Display 'estimated points if the player appears' and the recorded-appearance eligibility rule. Keep raw basketball research usable without an estimate.

## Dataset, source limits and freeze

Admit NBA Stats mirror player/team/schedule data for 2021–22 through 2025–26 if source validation supports it. Prefer one consistently normalized source for the new experiment. Retain the existing NocturneBear dataset as separate evidence. A source or season substitution requires a new versioned manifest and justified pre-test protocol amendment.

Source quality checks may inspect completeness, identity and reconciliation. Before comparing candidate performance, freeze selected facts, phases, target, candidates, exclusions, feature schema, exact split memberships, hyperparameters, preprocessing, interval rules, promotion gates, software versions, code/dirty hash and seed. Record any prior exploratory exposure. Do not call known final-test performance untouched.

Historical NBA Stats mirror data is revised historical reconstruction. Acquisition today cannot prove what was published before a 2025 game. Feature game dates still strictly precede cutoff, and this limitation stays visible. Genuine prospective records use the stronger actual observation-time contract in [data contracts](workbench-data-contracts.md).

Create a separate strict `evaluation/config/points-v1.yaml` plus accepted manifest. Keep `baseline-v1.yaml` and its loader supported. Serialize defaults rather than relying on changing library defaults. Choose runtime/thread limits and package locks before execution.

## Candidates and eligibility

For each selected NBA date D, build history only from regular-season facts with `game_date < D`. Identify a recent observed same-season team association from prior appearances, within the existing 30-day bound, or separately admitted historical team evidence. A target outcome must not supply the candidate's player team.

Choose the observed team's next scheduled game in `[D,D+6]`. Historical targets use a labeled reconstructed schedule; prospective targets require an observed future schedule version. Include lead days. Do not select a target by searching for the player's next future appearance. All predictions sharing a target game remain in the same split.

Main cohort:

- At least 10 valid current-season appearances; or
- 1–9 valid current-season appearances plus at least 20 valid immediately previous-season appearances.

The second group is the preregistered early-season cohort. Current team evidence remains required. A player with zero current-season appearances has research context but no automatic points-v1 forecast initially: no verified early-season association or an unvalidated zero-history regime returns an explicit reason. This avoids borrowing future roster membership to manufacture opening-night forecasts. A later zero-history policy requires its own candidate/evaluation evidence.

Players with 5–9 current-season appearances but no qualifying previous season can receive a labeled available-current-history mean outside the primary comparison, without a borrowed interval. With fewer than five and no eligible prior, show insufficient history. Rookies, traded players, long gaps, missing context and unknown team membership retain useful profiles and distinct reasons.

Freeze candidate inputs/features before joining labels. Then match outcome by player, target game and predicted team. A trade mismatch, explicit nonappearance, unknown missing row, invalid/incomplete label or canceled target remains unscored. A schedule change adds a new prospective issuance; do not move an old forecast to a different target silently.

Report all candidates, eligible/cohort/fallback counts, target/association failures, scored appearances, explicit nonappearances, unknown unmatched rows, incomplete labels, team mismatches, distinct players/games/player-games and observed appearances lacking candidates. An estimator cannot improve by silently dropping difficult rows. Every candidate estimator is evaluated on the same mask.

## Baselines and features

Define valid history using positive recorded minutes and available PTS; optional feature fields retain missingness. History denominators can differ from descriptive windows and must be reported. Immediately previous-season context remains separate from current-season statistics.

Three fixed baseline policies:

| Policy | Definition |
| --- | --- |
| Current rolling mean | Mean of last up to 10 valid current-season appearances once five exist. For 1–4 with an eligible prior, use previous-season mean. |
| Current EWMA | Last up to 20 valid current-season appearances, half-life five appearances, normalized weights `2^(-age/5)`, once five exist. For 1–4 with an eligible prior, use previous-season mean. |
| Season-prior blend | For `n < 10`, `(n * current_mean + 10 * previous_season_mean) / (n + 10)`, where the prior is the valid previous-season PTS mean. At `n >= 10`, use current EWMA. |

All baselines use identical eligible candidates. These fallback/blend rules are design choices to test, not claims that offseason continuity is reliable. Do not tune the prior strength against final-test outcomes. Record previous-season sample and age. The baseline winner is selected from validation only; report early-season results separately even if pooled MAE favors another policy.

Player features: current last-5/10 PTS mean and variability; last-5/10 minutes and attempts; PTS per minute on valid paired rows; current valid-history count capped at 50; previous-season PTS/minutes/attempt means and history count; days since last observed appearance and season-prior age; missingness indicators; lead days. These fields make cold-start status explicit. Add no player-ID embedding or current mutable player attribute.

Context features: home/away, team schedule rest/back-to-back, and opponent prior regular-season last-10 points allowed with valid-game count/missingness. Require five valid opponent games for an allowance; otherwise keep it missing. Opponent allowance remains a descriptive per-game statistic. Each context value obeys the same exclusive cutoff.

Compare one player-only and one player-plus-context `HistGradientBoostingRegressor`. Use pinned scikit-learn 1.6.1, squared error, learning rate 0.05, 200 iterations, `early_stopping=False`, seed 20261001; a four-cell grid of `max_leaf_nodes` 15/31 × `l2_regularization` 0/1. Give variants identical tuning budgets. Reuse explicit chronological fitting; data-learned preprocessing fits on training only.

Clip every estimator's point output at zero as a declared PTS postprocessing rule; use postprocessed predictions consistently in validation, calibration, scoring and serving. The old composite experiment permits negative outcomes and is unchanged. Additional models, features or grid expansion require a new pre-test protocol rather than opportunistic final-test search.

## Chronological blocks

The longer calibration season intentionally includes early-season candidates. The old tail-only calibration block would not establish early-season interval performance.

| Block | Membership | Role |
| --- | --- | --- |
| T | Accepted 2021–22 and 2022–23 regular-season target dates | Initial fit |
| V1 | Accepted 2023–24 dates through 2024-01-15 | Validation; fit T |
| V2 | Accepted 2023–24 dates from 2024-01-16 to season end | Validation; fit T + V1 |
| C | Entire accepted 2024–25 regular season | Calibration only; fixed final fit on T + V1 + V2 |
| F | Entire accepted 2025–26 regular season | Final test with the same fixed final fit |

Record exact first/last dates and row/game/date membership hashes from admitted data before fitting. If coverage cannot support these blocks, stop dependent evaluation and document a protocol amendment before viewing performance. Do not shorten F to obtain a preferred result.

Assign by target game date and keep all players/lead-time candidates of that game together. Require candidate cutoff D at least the prediction-block start. Purge training candidates whose labels occur at or after the next block's earliest cutoff; a six-day horizon must not cross the boundary. Freeze and count all purged rows. Random row splits and generic row-index time splits are insufficient.

Fit once per validation block. Select grid configurations from pooled V1/V2 error, with deterministic smaller-tree/stronger-L2 tie-breaking. Select the strongest baseline from those blocks; tie-break EWMA, rolling mean, then prior blend. Select one challenger finalist; keep the other as a declared ablation. C does not choose candidates or parameters.

Write a hash-verified preopen registration before final labels/performance are queried by the evaluation stage. Ordinary reruns of a completed immutable run verify/reuse results. A failed final test is not a new tuning opportunity. Earlier M6 S3 results stay historical evidence; using those years for the different points target does not alter M6 or make a reused year newly untouched.

## Metrics, intervals and slices

Report MAE, RMSE, player-balanced MAE and player-game-balanced MAE, with forecast-row and unique-player-game counts. Repeated lead-time forecasts remain visible. Baseline/challenger comparisons are paired on identical rows.

Use 1,000 seeded moving-block bootstrap replicates of seven calendar target dates, retaining all rows/players/lead times of games in each block. Include empty dates in the calendar and resample within the corresponding evaluation block. Report 95% percentile intervals for paired error differences; do not imply independent player rows.

Prespecified slices: 1–4/5–9/10–19/20–39/40+ current appearances; prior-season eligibility; prior minutes `<15`, `15–<28`, `>=28`; team/appearance rest; lead 0/1–3/4–6; complete/missing opponent context; season; and changed last-observed team. Slice inputs must exist at cutoff. Record support and avoid categorical claims from tiny cohorts.

Calibrate 80% empirical intervals on C residuals from the fixed fitted estimator/policy. Use absolute residual order statistic `ceil((n+1)*0.8)`, capped at n. Maintain separate core (`10+`) and early-season (`1–9`) calibration groups. Require at least 200 residual rows on 20 target dates per group. A smaller group yields unavailable interval rather than borrowing calibration while claiming it was validated.

For nonnegative points, interval bounds are `max(0, point-q)` and `point+q`; score/report this actual clipped interval. Report achieved coverage and mean width on F, by cohort and supported slices. Nominal coverage is a calibration target, not subjective confidence or a guaranteed future percentage.

The points-v1 promotion gates, frozen before F:

1. At least 5% pooled validation MAE improvement over the validation-selected baseline, with positive improvement in both folds.
2. Lower F MAE and a paired 95% error-difference interval whose upper bound is below zero.
3. No supported key slice above 5% relative MAE regression. Support requires at least 200 rows, 100 unique player-games and 20 target dates; unsupported slices are inconclusive.
4. At least 75% achieved coverage for the 80% core interval and mean width no more than 110% of baseline width. Apply the same gate to early-season intervals when the cohort has sufficient support; otherwise early-season interval/promotion scope remains limited.

Failure means retain the eligible baseline policy. Publish why. An overall promotion does not erase unsupported cohort restrictions. Success of a complex model is not the project's completion criterion.

## Artifacts, registry and CLI

Each run writes configuration, dataset and split manifests, candidate accounting, separate features/labels, validation/calibration/final predictions, metrics/slices, bootstrap results, estimator/preprocessing metadata, calibration, model card, environment/locks, revision/dirty hash and artifact inventory. Atomic content-addressed writes and registration prevent incomplete/concurrent runs from appearing ready.

Run identity binds semantic data/config/feature/code membership rather than local snapshot UUIDs. Local release bindings are verified separately. Load only trusted locally produced or explicitly verified artifacts. Validate hashes before exposing a report/estimate. Training binaries/raw data stay in ignored storage; commit compact manifests and distributable reports.

Proposed commands to implement:

```text
courtload evaluate-points --config evaluation/config/points-v1.yaml --dataset <manifest> --stage validate
courtload evaluate-points --config evaluation/config/points-v1.yaml --dataset <manifest> --stage calibrate
courtload evaluate-points --registered-run <run-id> --stage final --open-final-test
courtload activate-points-policy --registered-run <run-id>
courtload issue-forecasts --release <release-id>
courtload score-forecasts --dataset <observed-outcomes-manifest>
```

These commands do not exist yet. Keep old evaluation commands usable. The UI reads registered runs and shows copyable reproducibility commands; it does not expose arbitrary code/config paths or launch training through assistant tools.

## Prospective activation and scoring

Activation happens only after the experiment/policy is registered. Use the validated policy/estimator identity initially. A later refit is a separate deployment artifact with recorded fit/calibration cutoffs and prospective performance pending; it cannot inherit another fitted model's measured accuracy silently.

After F is evaluated, its residuals may form a **new** calibration artifact for subsequent prospective dates. This is allowed future use of completed data, not a change to the published final-test intervals, metrics or old forecasts. Freeze/identify the new calibration before activation, keep cohort support rules, and never claim its future coverage is already observed.

Prospective candidate inputs satisfy both prior-day dates and actual observation availability. Require target schedule and usable current/recent team evidence; if the target's start is known, issuance must precede it. Same-day date-only targets cannot claim pregame timing without enough schedule precision. Respect cancellations, postponements and team-association changes through append-only events and explicit scoring exclusions.

Store issuance ID, target/player/team, issued/cutoff times, input release and selected observations, feature schema/vector/hash, estimator/policy/calibration hashes, source/association/schedule evidence, estimate/interval and eligibility. On repeats, an identical logical issuance operation is idempotent; a changed observation/policy/time can create a new issuance with its own identity. Retain scheduled-target evidence even when the game changes later.

Join outcomes only after finality and positive recorded appearance are established. Scoring observations reference the actual selected outcome version and observed time. Late corrections append a revised scoring observation and keep the original score visible. Unknown/nonappearance cases remain unscored. Prospective accuracy views show date span, elapsed sample, versions and cohort support; before games complete, they show not yet observed.

## Required checks and model card

Meaningful checks cover baseline weights/prior blending, season and phase separation, missing/zero handling, target-independent candidates, DST/prior-day cutoffs, grouped/purged splits, train-only transforms, shared scoring masks, prior calibration, feature mutation controls, repeated artifact registration, genuine observed-version gating, team/schedule changes and immutable issuance/scoring history.

On a small frozen fixture run the complete staged experiment twice and compare membership/prediction hashes with declared floating-point tolerance. Real-data checks reconcile features/labels and artifact identities; report CPU/thread settings and timing. Exact bitwise portability across arbitrary systems is not claimed.

The model card includes task/eligibility/exclusions, source/phase/revision limits, split dates/counts/purging, exact baseline/feature/grid definitions, selection, paired metrics/intervals, error slices, calibration support, unscored/uncaptured outcomes, context and early-season ablations, promotion restrictions, serving identity, prospective evidence status and one reproducibility command. Preserve negative results and state what the experiment cannot establish.
