# IM03 event acceptance v1

Identifier: `courtlens-impact-event-gate-v1`. Owner authorized 2026-10-08 UTC.
This acceptance contract supersedes only the universal ±2 box-estimate gate in
IM03 and `impact-possession-method-v1`. The old contracts, receipts and candidate
datasets remain historical evidence. The conventional estimate remains unchanged
and its complete discrepancy distribution remains mandatory, including failures.

## Independent boundary evidence

The verifier parses selected immutable source rows independently of the warehouse
builder's kinds, outcomes, statistics, active-possession state and counts. It shares
only the accepted IM02 ordering/identity path. It first classifies made-field-goal,
ordinary final-FT, turnover and live defensive-rebound endings, then partitions
observed offensive actions by those endings, period and team. Same-clock same-team
ordinary and-one FTs continue control, including a different FT shooter.
Technical/retained-ball FTs are separate
noncount records. First live rebounds pair with their preceding miss; nonfinal FT
deadball rebounds do not qualify. Explicit offensive team rebounds continue control
and are excluded from player ORB. Adjacent same-team actions without an intervening
ending are observed continuity, not a claim that an unrecorded rebound occurred.
Opposing offensive action can establish a transfer when a closing event is absent;
the evidence records that action. Period ends close only observed active control.
Empty possessions are not inferred.

Every reconstructed record must match the independent period/team/start/end/count
classification, exact ordered contributing source locators and raw factor values.
Each scoring/attempt/turnover event occurs exactly once, either in a counted control
or an explicit retained-ball record. Rebound contributions match independent raw
pairing. Every ending lineup matches accepted IM02 event lineups. Points, FGA/FGM,
FTA/FTM must conserve independent boxes. Player seconds, clean-game one-second
tolerance, immutable memberships, exclusive cutoff and forecast isolation remain
required under the preceding contracts.

## Source-based estimate discrepancy ledger

Expected control counts and ledger terms are derived from raw events before any
reconstructed count is read. Ordinary FT trip starts supply one trial; every FGA
and explicit turnover supplies one trial. Each subsequent trial within the same
independently evidenced control is a continuation, retaining both source locators.
Classify continuations as player rebound, team rebound, and-one or observed
same-team continuity. Record ordinary versus retained-ball FT weights separately.
Player ORB box values and explicit PBP-versus-box turnover differences complete the
accounting. The sum must exactly reproduce count minus the unchanged box estimate
with Decimal arithmetic; no fitted residual or unexplained balancing term is allowed.
Continuity evidence does not establish the completeness of an unavailable source.

## Public cross-checks and acceptance

Public pbpstats text groups remain a cross-check rather than an official oracle.
Report every available disagreement, inspect its event/period sequence and distinguish
source/counting-convention differences from reconstruction defects. Unavailable
playoffs, two regular games and the entire 2025–26 public family remain explicitly
unavailable. Similar totals or a small difference alone do not establish correctness.
Full public groups and their source row ordinals are retained in each available
per-game proof. A source-overlap graph accounts for count deltas through grouped,
absent, retained-ball and team-label differences. Description schema bridges require
unique actor/outcome observations within explicit source clocks or a unique
period/end/factor match; the matching
method is recorded. When a unique actor/clock observation has a changed outcome,
retain both the public description and selected raw classification/locators as a
source revision; do not change the selected outcome to fit public groups. An
unmatched nonempty public control blocks acceptance.
Admission recomputes these graphs and cross-check identities/counts, with a separate
public-review gate. Independent final verification re-extracts every public group
from its hash-checked original archive.

Final IM03 verification requires measured disagreement investigation in addition to
the exhaustive independent event checks; no raw estimate threshold replaces that work.

Preparation rehashes source assets and box receipts, retains content-addressed
per-game input excerpts and independent proofs, and binds their hashes to new
season/phase bundles. Population recomputes each proof against the stored game,
accepted candidate identities and independently parsed outcomes before writes;
proof pass flags are not trusted. Bundles bind the verifier code and contract hashes.
Failed event checks retain candidate status. Changed facts require new game versions.
The old six datasets are not promoted, mutated or replaced. New accepted datasets
are populated only in disposable PostgreSQL for verification; owner data and public
pointers are unchanged. Full regression, PostgreSQL and dbt checks plus sealed
population/read-back/replay receipts are required before IM03 is marked verified.
