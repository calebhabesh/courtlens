# CourtLens descriptive impact ratings v1

Identifier: `courtlens-impact-ratings-v1`. This IM04 contract defines retrospective
model estimates under lineup confounding. It does not execute, amend or promote
`courtload-rapm-v1` or `courtload-six-factor-v1`, supply forecasting features, or
change publication pointers. No third-party model values are acquired.

## Inputs and scope

Consume only the six ready IM03 v2 datasets bound by sealed acceptance v2
`912254343fb563c128327c53b40becada7b912191981a2a7eeda14fa900d5c4d`.
Rehash acceptance, its evidence, bundles, game bodies and stint source hashes.
Require the v2 method and event gate, complete accepted membership and no duplicate
game/season/phase. Fit from retained sealed bodies; optional PostgreSQL verification
uses a read-only transaction and checks ready identity and every stint body.
Keep regular season and playoffs separate. Generate 1Y for each season, 2Y only
with two consecutive seasons and 3Y only with three. Pool equally, with no decay.
Never label a shorter window 2Y/3Y. A cutoff is exclusive (`game_date < cutoff`).
No automatic date cutoff or random identifiers enter model content.

Semantic rating hashes bind only selected game hashes, dates, quality, method,
code, contract, dependencies and window. Separate acquisition receipts bind the
full IM03 bundle/acceptance identities. This permits future membership changes
without changing earlier-cutoff rating hashes. Retain full inherited coverage,
patch rates, minute tolerances, plus-minus errors and box-estimate diagnostics in
that receipt. Scope-specific artifacts record admitted clean/patched counts.

## Design, targets and regularization

Each constant-lineup stint has two offensive observations. Sorted player columns
have +1 offensive indicators and +1 opponent defensive indicators; a signed home
column (+1 home offense, -1 away offense) and unpenalized intercept complete the
design. Fit scikit-learn 1.6.1 Ridge with deterministic sparse LSQR, tol 1e-10,
max_iter 10000, float64, one CPU thread in the runner. The objective is
`sum(weight * (target - intercept - X*beta)^2) + alpha*sum(beta^2)`;
weights are raw denominators, never renormalized. Home is penalized.

| Model | Target | Weight | Reported units |
| --- | --- | --- | --- |
| RAPM | 100 * points / counted offensive controls | counted controls | points per 100 controls |
| TS | points / (2 * TSA) | 2 * TSA | percentage points |
| TOV | turnovers / (TSA + turnovers) | TSA + turnovers | percentage points |
| REB | player ORB / live player rebound opportunities | opportunities | percentage points |

TSA = FGA + 0.44 * FTA. Six factors follow the existing protocol's separate
rate mathematics and are **not additive** to RAPM. Each target independently omits
zero-denominator observations and reports their count and omitted numerator.
Instantaneous and noncount FT scoring is preserved in on/off; where a stint has no
counted controls its points cannot define RAPM's rate. Those omitted points and the
ending-lineup exposure convention remain disclosed. No synthetic exposure, clipping,
residual/PVAL or causal confidence interval is added.

Select alpha from [10, 100, 1000] using three shuffled game-grouped folds, seed
2501, sorted game identities. All stints and both sides of a game stay together.
Use denominator-weighted pooled validation MSE; exact ties prefer smaller alpha.
Six-factor chooses one shared alpha minimizing mean target MSE divided by each
target's training-only league-baseline MSE. Zero baseline error blocks selection.
Fold training defines vocabularies; unseen held-out players have coefficient zero
and are counted. Refit selected alpha on all eligible window observations.

Center offense and defense coefficients separately using reconstructed player
seconds, adjusting the intercept by five times each removed mean. Report ORAPM as
offense, DRAPM as negative opponent-defense coefficient (positive is favorable),
and RAPM = ORAPM + DRAPM. For six-factor, positive means favorable: oTS/oREB use
+offense, oTOV -offense; dTS/dREB -defense, dTOV +defense. Centering changes no
predictions. Retain intercept/home and the raw sign convention for reproduction.

All fitted coefficients have sample metadata. Display/top-20/percentiles require
>=20 games and >=1000 relevant opportunities on both offense and defense; minutes
must be positive. RAPM uses counted controls; factors use their own denominators.
This is a research sample rule consistent with retained RAPM protocols, not NBA
leader qualification. Percentile = 100 * (less + 0.5 * equal) / qualified count.

## On/off and Box-Prior RAPM (BPR)

On/off sums actual stint points, counted controls and player seconds within each
observed team. Off includes every admitted stint for that team without the player,
including games where the player did not appear; this is a team-season reference,
not a roster or availability claim. Traded-player records remain separate by team.
ORtg = 100 * points / offensive controls, DRtg = 100 * allowed / defensive controls,
Net = ORtg - DRtg; on/off differences subtract off. Zero denominator returns null.

BPR uses prior seasons only. For each earlier completed season, use that season's
longest available (up to 3Y) RAPM as the two-dimensional box-regression target and
that same season's admitted individual per-100-on-court-offensive-control box
counts: points, FGA, FTA, 3PM, assists, turnovers, ORB, DRB, steals, blocks, fouls.
Train only RAPM-qualified, complete positive-minute box samples. Standardization
is fitted on these historical samples; fixed box ridge alpha 100 (not selected).
For each current player use the latest complete earlier-season box vector. Missing
history has zero prior and an explicit flag, never fabricated box counts. New
players may still have a BPR coefficient via zero-centered shrinkage.
Refit the selected window's RAPM alpha on `y - X*prior`, add prior back, and center.
All prior target artifacts, box source hashes and sample IDs are recorded. Require
all prior dates before the earliest season in the fitted window; otherwise omit
BPR with an explicit reason. 2023–24 and windows starting there have no admitted
prior. BPR is a CourtLens analogue, not another provider's model.

## Evidence and immutability

For every fit retain alpha grid/folds/scores, exact input identities, complete
coefficients/support, intercept/home, centered weighted means, qualified top-20
and percentiles. Chronological diagnostic: last 20% of game dates are held out;
training-only game CV selects alpha. Compare held-out stint margin RMSE (per 100
mean offensive/defensive controls) against a training-only team/context ridge
alpha 100. Evaluate only stints with positive controls on both sides, report
omissions and unknown players. Holdout errors are diagnostics, not a promotion gate
or unexposed B26 final test. Record adjacent-season Pearson correlations for shared
qualified players; fewer than three or constant coefficients yields null.

Write canonical JSON to exclusive-created content-addressed paths. Replays verify
existing bytes and reuse paths; altered files fail. Semantic artifacts exclude
wall time and observation time. A separate run receipt records runtime, hashes and
source provenance. Two independent complete runs must reproduce every rating
hash. Full Python/PostgreSQL regression, Ruff/format and strict mypy are required;
no dashboard or dbt model is changed in IM04.

Completed-season cutoffs are capped at July 1 after the ending season; earlier
requested cutoffs remain exclusive. Historical box regression uses sample seconds
normalized to mean one as weights, and records its scaler/coefficients/prior values.
An exhausted LSQR iteration budget fails the fit instead of accepting convergence.

Box participation follows the accepted reconstructed lineups, so unknown box
minutes do not erase known counts. Missing rows or unknown/nonfinite counts
invalidate that player's prior profile; absent outcomes are never filled with zero.
