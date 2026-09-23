# Locked Portfolio Scope

> **Amended 2026-09-20:** The owner approved a zero-cost historical-archive baseline, with local operation required and live refresh/public hosting optional. Use the [implementation handover](implementation-plan.md) and [ADR 0003](decisions/0003-zero-cost-historical-baseline.md) for current requirements. The September 12 snapshot below is retained as historical context; its paid-source-first assumptions are superseded.

Captured 2026-09-12 from the workspace v2 blueprint. This copy travels with the repository. Status: approved requirements, not evidence of completed implementation. Update this copy alongside future scope decisions.

# Project 4: CourtLoad - NBA Player Comparison in Matchup Context

Root: `/home/ethioking/dev/nba-analytics` (retain and realign existing repository).
Decision locked: 2026-09-12. Status: existing data/planner foundation; this revised scope still needs real-data and product verification.

## Purpose and Decision Workflow

An NBA fan wants to compare players using recent role/production and upcoming team context, with honest uncertainty. The core question is: “Between these players, whose recent role and upcoming matchup support stronger expected performance, and how uncertain is that assessment?” A fantasy start/sit decision is one application; the product does not require a fantasy account or roster manager.

1. Search a real player and inspect last-5, last-10 and season production with sample sizes.
2. Inspect minutes, attempts, per-minute output and variability to understand what accompanied a recent change.
3. Examine upcoming opponent tendencies, home/away, rest and schedule context.
4. Compare a second player with consistent windows, cutoff and scoring definitions.
5. Inspect a next-appearance estimate and empirical interval, with the baseline/model identity and evaluation evidence.

One upcoming game per player is the initial decision horizon. A seven-day schedule strip is context, not an availability-weighted weekly projection. Permit “no clear separation”; do not force a winner or derive head-to-head win probabilities from interval overlap.

## Locked Scope and Stack

Reuse Python ingestion, PostgreSQL, dbt, FastAPI, Next.js/TypeScript, and Docker Compose. Use scikit-learn for a small reproducible model experiment. Daily batch ingestion/inference is sufficient; no Spark, Kafka, Airflow or LLM layer is required.

Three primary views: player explorer/detail; two-player comparison; evaluation/methodology/data health. No compulsory registration, league setup or watchlist editing before the user can use the core product.

Data: one documented provider, regular-season schedules, player identities and full-game player stat lines. Aim for three completed seasons subject to real coverage, then incremental refreshes. Derive historical player/team association from game participation rather than today's player profile.

Initial inputs/metrics:

- Points, rebounds, assists, steals, blocks, turnovers, minutes and shooting attempts/makes.
- Recent versus season averages, per-minute output, sample sizes and variation. Handle zero-minute denominators explicitly; aggregate shooting percentages from makes/attempts rather than averaging percentages.
- Opponent prior team-level production allowed, derived from complete prior team-game data, plus home/away and rest. Show coverage; missing player rows can make opponent totals incomplete. Without possession normalization, do not label per-game allowance as defensive efficiency or isolated matchup strength.
- Changes in minutes, attempts and efficiency as descriptive context, not causal attribution.

Tactical lineups, on/off impact, defensive assignments, shot-location weaknesses and play-type strategy require richer data and are excluded. No injury/availability prediction, betting recommendations, league scraping, automated transactions, global roster optimization, or multiple sports.

## Source Gate and Existing Code Realignment

Keep the current BALLDONTLIE adapter and source lineage where valid. Before committing to a backfill, verify actual credentials, endpoint entitlement, historical field coverage, stable IDs, pagination, rate limits, terms and operating cost. Record the check date and selected tier; provider documentation is authoritative, not a hard-coded price in this plan. [NBA provider documentation](https://nba.balldontlie.io/).

Run a bounded live ingestion twice; test a correction and missing-row behavior. Never replace unavailable provider data with fictional operational records. A historical demo is acceptable if its dates/freshness are explicit.

Retain useful ingestion, migrations, immutable snapshots, dbt and API infrastructure. Realign public UI/routes and serving marts around the comparison workflow. Preserve existing auth/league/roster/matching/scenario code as deferred functionality, not v1 completion requirements. Do not delete that work as part of this documentation change. Two fantasy scoring weeks are no longer a release gate.

## Data Architecture and Temporal Correctness

```text
Documented NBA source -> bounded ingestion -> immutable raw snapshots + manifest
                                         -> versioned source records in PostgreSQL
                                         -> dbt facts/features/serving marts
                                         -> evaluation and batch forecasts
                                         -> latest-good published snapshot -> API -> UI
```

Record raw/source identity, fetched/observed time, content hash, ingest run, dataset/feature/scoring versions, prediction cutoff and model version. A failed refresh or quality check must leave the prior good serving snapshot available with a stale indicator. Avoid overlapping refreshes with a run lock.

Key grains: one canonical full-game player/game fact; one team/game fact; source object versions; player/target-game/cutoff/feature-version features; player/target-game/cutoff/model/scoring-version forecasts. Preserve correction lineage and immutable original predictions.

Historical backtests using data fetched today contain revised historical records. Label that limitation rather than pretending original publication-time data exists. Forward predictions must use only versions observed before their stored cutoff. Shifted rolling windows alone do not eliminate hindsight from corrections, current team attributes, schedule changes or outcomes elsewhere on the same date.

Use conservative prior-day completed data for historical features unless more precise availability can be justified. Group splits by calendar date/game, not arbitrary player rows. An absent stat row remains unknown, not an observed zero or a guaranteed DNP.

## Required ML Experiment; Conditional Promotion

One target: next-appearance reference fantasy points under a fixed versioned formula, initially PTS + 1.2 REB + 1.5 AST + 3 STL + 3 BLK - TOV. It is the CourtLoad reference formula, not every fantasy platform's scoring. Raw basketball statistics remain visible.

Predictions for an upcoming scheduled game are conditional on the player appearing. Do not imply expected total value including the chance of sitting out. Count unscored/nonappearance cases separately and freeze cold-start/insufficient-history rules.

Compare:

1. Last-10 mean and exponentially weighted rolling baselines.
2. One gradient-boosted regression challenger using prior player production, minutes and variability.
3. The same challenger with reproducible opponent/rest/home-away context.

The ablation asks whether matchup context improves predictions, rather than assuming basketball detail must improve accuracy. Descriptive opponent context may stay in the UI even if it does not help the model.

Freeze dataset manifest, target, inclusion rules, features and tuning budget. Use earlier calendar-based training/validation windows, with the latest complete season held out for final evaluation when coverage supports it. Fit preprocessing and interval calibration only on earlier data. Do not tune again against a failed final holdout.

Report MAE, RMSE, player-balanced error, history/prior-minutes/rest slices, empirical interval coverage and width, and baseline differences with calendar-block uncertainty estimates. Intervals describe observed calibration, not guaranteed future coverage. Define the validation promotion threshold before inspecting final-test outcomes, and require credible improvement across windows without a major important-cohort regression.

Publish an evaluation/model card even if the challenger loses. Use the best defensible baseline or descriptive form when no model earns promotion. A positive ML result is not required for completion; a rigorous experiment is.

## Tests, Evidence and Completion

Required tests: repeated ingestion is idempotent; corrections preserve lineage; dates/time zones are consistent; player/game and team/game grains are unique; source totals reconcile where coverage permits; future outcomes cannot alter earlier features; late corrections cannot rewrite stored forecasts; failed quality gates do not publish partial marts.

Required evidence: real source spike, reproducible warehouse and experiment command, two useful real-player comparison case studies with explicit cutoffs, evaluation/error analysis, source/freshness UI, and a recorded demo. Forward forecast logging strengthens evidence when games are available; do not wait for a new fantasy season to finish a historical demonstration.

Build order: real-data spike -> data foundation -> player detail -> baselines -> player-only/context ablation -> comparison/evaluation UI -> evidence and case study. Finish this or File Sync before actively expanding the other; choose order by target roles and motivation.

Resume templates:

- Built a versioned NBA analytics pipeline using Python, PostgreSQL and dbt to turn [N] player-game records into source-traceable player comparisons and upcoming matchup context.
- Evaluated next-appearance forecasts with chronological backtests and player/context ablations, reporting [measured error and interval coverage] against rolling baselines.

---
