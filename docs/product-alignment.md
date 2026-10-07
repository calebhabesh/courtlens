CourtLoad was renamed to CourtLens on 2026-10-07; identifiers below are historical.

# CourtLoad product and portfolio alignment

> **Current direction, 2026-10-01:** The [local workbench handoff](workbench-implementation-plan.md) governs next-release implementation. The earlier fantasy/public-product discussion below is retained as historical context.

> Superseded for future scope by [course correction](course-correction.md) and [locked scope](portfolio-scope.md), 2026-09-12. Retained as historical implementation context.

Review date: **2026-08-23**

## Outcome

CourtLoad should be an **NBA player intelligence product with a fantasy decision-support layer**.
Its core public value is turning source-traceable player game data into rich statistics that are
easy to understand. Fantasy planning is the strongest application of that data, but it is not the
only reason the product exists.

The first pass built a strong data foundation and a working fantasy planner. It is currently
planner-heavy: the player experience is limited to search and a recent-form/game-log view, and no
model has been evaluated. The next pass should build the player intelligence layer on top of the
warehouse before expanding fantasy configuration breadth.

## Product hierarchy

### 1. Data foundation

Ingest documented-provider schedules and player box scores; retain immutable source versions,
lineage, corrections, freshness, explicit grains, and tested dbt models. Everything above this
layer must identify its data cutoff and coverage.

### 2. Player intelligence — core product

Anyone should be able to search for a player and understand, without reading a raw stat table:

- current team/position and source freshness;
- last-5, last-10, and season-to-date production with sample sizes;
- per-game and per-minute points, rebounds, assists, steals, blocks, turnovers, and fantasy output;
- minutes, usage-proxy, and shooting-volume/efficiency trends supported by the available source;
- recent game log and scoring-formula breakdown;
- upcoming schedule, rest/back-to-back context, and data-quality gaps;
- comparisons with another player using identical windows and cutoffs;
- a rigorously evaluated next-game estimate and interval only if the promoted model beats named
  rolling baselines out of time.

The presentation should use a small number of summary cards, trend charts, comparison deltas, and
expandable game-level detail. Every composite value needs a plain-language definition.

### 3. Fantasy decision support — applied workflow

A daily-lineup points-league manager can apply the player intelligence to a real decision:

1. Configure league scoring, slots, roster, eligibility, acquisition state, and a watchlist.
2. Open the current scoring week and visible transaction cutoff.
3. See scheduled versus startable games and lineup congestion.
4. Select a possible drop and compare saved candidates by independently computed remaining-week
   deltas.
5. Inspect the candidate's rich player page and one before/after grid, then verify availability,
   health, and transaction rules in the fantasy platform.

This is a useful application of the analytics—not a claim that CourtLoad knows the user's entire
league or can automate transactions.

### 4. ML evaluation — required evidence, conditional product feature

The portfolio should include an honest ML experiment even if no prediction is ultimately promoted.
Use a frozen, published fantasy-points formula as the first single target so the evaluation remains
tractable and directly useful. Compare trailing-5/trailing-10 means and medians plus EWMA against a
regularized regression and, only with a hypothesis, one tree-based challenger.

Use rolling-origin or season-by-season evaluation, point-in-time features, training-only
preprocessing, MAE/RMSE/scaled error, interval coverage, error slices, and a versioned model card.
If the model fails to improve over the strongest rolling baseline, publish that result and show the
baseline as descriptive form—not as an ML prediction. The evaluation still demonstrates sound ML
practice; an unjustified model in the UI does not.

## First-pass alignment matrix

| Blueprint requirement | First-pass state | Assessment |
| --- | --- | --- |
| Documented, permitted source | Contract and adapter implemented; live credentialed spike pending | Partial |
| Immutable snapshots, lineage, and corrections | Implemented and fixture-tested | Aligned |
| Dimensional SQL/dbt and data quality | 10 models and 62 data tests pass | Aligned |
| Point-in-time feature correctness | Pregame windows exclude the current row | Aligned |
| Rich public player intelligence | Search and recent game form exist; trends, comparisons, and richer marts/UI are missing | Partial |
| Evaluated predictive outcome | No model/baseline evaluation has been run | Missing but deliberately gated |
| Scheduled versus startable planner | Implemented in API and dashboard | Aligned |
| Private configuration | Owner-scoped API exists; browser setup is absent | Partial |
| Remaining-week shortlist | One scenario exists; shortlist ranking and current-cutoff UX are absent | Partial |
| Real operational use and performance | Live source, real-user weeks, and target measurements are pending | Missing |

## Major CS-area coverage

CourtLoad's primary portfolio lane is **data engineering and databases**:

- a bounded external-source contract and schema validation;
- immutable raw versions, checksums, source lineage, and visible failed runs;
- idempotent loads and late correction handling;
- explicit relational grains and player/team temporal history;
- dbt staging, intermediate, mart, documentation, and data-quality layers;
- point-in-time feature construction that prevents current-game leakage;
- freshness, coverage, operational checks, backups, migrations, and scheduled refresh behavior.

Its second primary lane is **applied ML and statistical evaluation**, demonstrated by the required
baseline-versus-model experiment, temporal validation, error analysis, reproducibility, and honest
promotion gate. The value is the rigor of the evaluation, not the mere presence of a prediction.

The fantasy planner adds a strong **algorithms** signal through bipartite matching implemented as
bounded slot-mask dynamic programming with a lexicographic objective: maximum cardinality,
transparent recent-form weight, then deterministic IDs. Backend/API design,
authentication/authorization, full-stack UI, and containerized operations are supporting evidence.

## Important architecture and narrative boundary

The runtime API currently calculates player form, schedule, and planner results from normalized
operational tables. dbt builds an independently tested analytics/reconciliation layer but is not a
hard serving dependency. The player-intelligence pass should create versioned player profile,
trend, comparison, and model-feature marts and make at least one visible analytical API consume
them. Until that happens, resume language should say dbt validates and publishes the analytics
layer—not that dbt marts power the current planner.

## Recommended second pass, in order

1. Complete the live-source viability spike and a bounded historical backfill. Record coverage,
   cost, idempotency, correction/reschedule behavior, and missing-row semantics.
2. Define and build serving marts for player game facts, windowed player summaries, trend points,
   comparable player windows, and point-in-time model features. Preserve source IDs and cutoffs.
3. Build the rich public player page and two-player comparison experience before adding more
   private fantasy settings.
4. Run the required baseline/model evaluation and publish a model card. Promote estimates to player
   and fantasy views only if the go/no-go criteria pass.
5. Complete browser-native fantasy setup, remaining-week mode, and explainable watchlist ranking.
6. Keep current-team identities fresh around trades. The planner already distinguishes upcoming
   current-team identity from historical observed teams; the live spike must establish provider
   update timing.
7. Use the analytics and planner during two real scoring weeks, record useful and confusing
   outcomes, and measure the deployed ingestion, warehouse, and API paths.

## Portfolio-ready demonstration

The strongest demonstration starts with the broad product and ends with the applied workflow:

1. Search for a real player and explain recent form, trends, sample size, schedule context, and
   freshness in under 30 seconds.
2. Compare that player with another using identical windows and cutoffs.
3. Trace one displayed metric through its serving mart, intermediate model, normalized row, and raw
   checksum.
4. Show the walk-forward baseline/model table and either the promoted interval or the honest
   no-promotion decision.
5. Apply those same player metrics to a fantasy week with a visible lineup conflict and one
   explainable add/drop delta.
6. State what CourtLoad does not know: true waiver availability, official platform eligibility,
   current health, or guaranteed future performance.

That story demonstrates a useful statistics product, an auditable data platform, responsible ML,
and a non-trivial decision algorithm without reducing CourtLoad to either a generic dashboard or a
fantasy roster form.
