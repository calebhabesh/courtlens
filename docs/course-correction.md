# CourtLoad course correction: player comparison in matchup context

> **Implementation sequence updated 2026-09-20:** Follow the [approved handover](implementation-plan.md), which incorporates the owner's zero-cost historical-replay decision and concrete data, API, evaluation and UI contracts. This earlier roadmap remains context; paid live ingestion is no longer the first release gate.

Decision date: 2026-09-12. Status: roadmap, not a completed refactor. This document supersedes the earlier mandatory planner-first/full-fantasy completion path. See [locked scope](portfolio-scope.md). Existing unrelated working-tree changes must be preserved.

## Resulting product

Help an NBA fan compare two players using recent role/production and upcoming matchup context, with a reproducible next-appearance estimate and honest uncertainty. Fantasy start/sit is a use case, not a required league-management workflow.

The useful path is search -> player detail -> opponent context -> compare -> inspect evidence. No registration, private roster, watchlist or scoring-week setup should block that path. A simple rolling estimate remains valid when the ML challenger does not improve it.

## Refactor/redesign map

| Current area | Action | Reason / acceptance |
| --- | --- | --- |
| `src/courtload/ingestion/` | Retain adapter/raw store; verify live coverage and correction behavior | Preserve valuable source/lineage work; fixture success alone is insufficient |
| `src/courtload/models.py`, migrations | Extend with explicit source/feature/prediction identities where missing | Preserve observed time and immutable prediction lineage; forward migrations only |
| `warehouse/models/staging/` and `intermediate/` | Audit grains, historical teams and full-game inclusion | One canonical player/game; team/game totals need measured coverage |
| `mart_player_recent_form.sql` | Extend or replace with player-profile serving marts | Consistent last-5/10/season windows, denominators and sample sizes |
| `mart_player_point_in_time_features.sql` | Redesign availability semantics before modeling | Window ending at the previous row does not establish publication-time fidelity |
| New opponent/context marts | Add prior team tendencies, home/away and rest | Context must be reproducible and distinct from tactical/causal claims |
| `api/routers/public.py`, API schemas | Serve the locked public profile/comparison workflow | Responses expose cutoff, coverage, metric definitions and model identity |
| `services/recent_form.py` | Align serving logic with tested marts | Avoid separate contradictory calculations in API and warehouse |
| `api/routers/fantasy.py`, `services/planner.py`, `domain/matching.py`, auth | Preserve, defer and decouple from primary navigation/release gates | Useful past work; not required for new v1; no destructive removal in this task |
| `dashboard/app/players/` and homepage | Redesign around player exploration and comparison | Real evidence is discoverable without account setup |
| New model/evaluation module | Implement baseline, player-only and context ablation | One target; a small experiment with reproducible results |
| README, ADRs, evidence and TODO | Reformat around actual new scope and measured status | Retain historical verification, clearly supersede old requirements |

The path references above are relative to the repository unless an SQL filename is shown alone; those marts live in `warehouse/models/marts/`. Model package names and final API routes can be chosen during implementation. Do not manufacture new service boundaries for each metric.

## Phase 0 — Preserve baseline and validate the source

1. Review the current uncommitted changes before committing or refactoring; do not combine unrelated changes into a migration commit.
2. Add a new ADR superseding planner-before-ML as the product hierarchy, preserving older ADRs as history.
3. Verify current BALLDONTLIE endpoint/tier/terms, sustainable cost, full-game stats, historical coverage, player/game identities and missing-row behavior with real credentials.
4. Ingest a bounded sample twice; verify idempotency and correction lineage. Classify fixtures and historical/current records explicitly.
5. Freeze a data dictionary and target formula before expanding UI or training.

Exit: actual data supports the intended facts; access failures are visible; a frozen manifest can reproduce the sample. Do not require a conveniently occurring live correction: distinguish an observed provider correction from a fixture-injected correction test.

## Phase 1 — Correct warehouse and reliable publication

Retain immutable source snapshots and observed times. Model canonical full-game player/game facts, historical participation/team associations and two-sided team/game facts. Exclude partial periods and distinguish absent rows from observed zero-minute entries. Verify opponent totals only when source coverage supports aggregation.

Build profile and opponent-context marts with explicit as-of cutoffs, window sizes and sample counts. Compute shooting percentages from summed makes/attempts, handle zero-minute denominators, and label per-game opponent allowances without calling them possession-adjusted defense. Use a locked refresh run and latest-good published snapshot so failed quality checks do not expose half-refreshed outputs.

Exit: grain uniqueness, coverage, correction, denominator and publication checks pass; a real player's summary reconciles with source records.

## Phase 2 — Useful public player comparison

Implement three views:

- Player explorer/detail: role and form, minutes/attempt trends, game log, upcoming opponent, freshness and coverage.
- Two-player comparison: same definitions, cutoff and windows, with uncertainty and no forced winner.
- Evaluation/methodology/data health: target, baseline/model version, errors, missing data and refresh status.

Initial horizon is one upcoming game per player. A weekly schedule strip is context only. No tactical defensive assignments, on/off analysis, injury predictions, waiver availability, acquisition optimization or personalized league integrations.

Exit: record two real comparison case studies explaining what decision the evidence supports and what remains unknown. Do not fill explanations with unsupported causal or current-player claims.

## Phase 3 — Temporal feature redesign and model experiment

One versioned reference fantasy-points formula: PTS + 1.2 REB + 1.5 AST + 3 STL + 3 BLK - TOV. Forecasts are conditional on appearance, not expected weekly value including availability. Freeze minimum-history/fallback rules and report unscored cases separately.

Separate revised historical backtesting from genuine forward prediction. Source records fetched today do not reveal historical publication times. For historical features, use conservatively available prior-day data and state this assumption. For forward predictions, store actual pregame cutoff, source snapshot, feature/model/scoring versions, and immutable outputs.

Compare last-10 mean and exponentially weighted baselines with one gradient-boosted model using prior player features, then the same model plus opponent/rest/home-away context. This is an ablation, not a promise that context improves accuracy. Use earlier calendar-based training/validation windows and an untouched latest-season test when coverage permits. Keep same-date/game rows together. Fit preprocessing/calibration only on earlier data; never retune on the final holdout.

Report MAE, RMSE, player-balanced error, prior-history/minutes/rest slices, interval width and achieved coverage. Estimate baseline differences using calendar-block uncertainty, not independent player-row assumptions. Freeze a validation promotion rule before the final test. No promoted model is required: publish a negative result and serve a defensible baseline when appropriate.

Exit: one documented command reproduces data selection, splits, predictions and model card from the manifest. Tests changing future rows leave earlier features unchanged; late corrections cannot rewrite original predictions.

## Phase 4 — Documentation, release and resume evidence

Update README/homepage/metadata around player comparison and matchup context. Rewrite current-status tables to distinguish implemented fixture behavior, verified real-data behavior and pending work. Supersede old mandatory two-fantasy-week checklists; retain actual old results as historical evidence. Add links to this roadmap and the locked scope wherever earlier planning could mislead implementation.

Record provider coverage, record count, refresh/backfill duration, API measurements, dataset/split/model versions and uncertainty. Do not use unmeasured improvement percentages. Keep operational credentials/raw data out of public artifacts; follow the selected provider's actual distribution terms.

Relevant existing checks should continue to cover ingestion/API/planner behavior while it remains supported. Add meaningful feature-cutoff, comparison-consistency and atomic-publication checks. Frontend checks should cover the actual public decision path, including insufficient history, stale data and no promoted model.

## Release gate

Real NBA data; traceable player and matchup comparison; reproducible warehouse; completed chronological model/baseline/context experiment; honest limitations and data health; tests for corrections and temporal correctness; and a demo plus measured case study. No fantasy account setup, two scoring weeks, or positive ML result is required.

Recommended resume emphasis: a versioned data pipeline and a defensible analytical decision workflow. The model's measured outcome is evidence, not the product's only value.
