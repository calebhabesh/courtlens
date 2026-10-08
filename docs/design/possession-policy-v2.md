# Possession reconstruction policy v2

Version: `possession-policy-v2`. Scope: local descriptive IM reconstruction from the
IM01 archive, independent SportsDataverse schedule and player/team boxes. This policy
supersedes v1 only for explicitly requested v2 reconstruction. Sealed B19/B20/B26 data,
v1 algorithms and forecasting feature inputs retain their original semantics.

## Identity and evidence

An event is identified by source SHA-256, game, CSV row ordinal and source action ID;
`actionNumber` is a cross-check key, never a unique identity. Repeated action numbers
are matched by occurrence. Original bytes remain immutable. Every repair carries the
policy version, rule ID, input hashes, source locators, original and replacement values
and a deterministic repair hash. Persistence uses
`possession_warehouse.record_reconstruction_override`, with a v2 JSON envelope and an
opt-in caller-owned transaction. No owner database is populated by the offline audit.

## Deterministic rules

- **IM02-R1 period starters.** For each team and period, the first on-court action or
  substitution-out before that player's first substitution-in requires a starter.
  Resolve substitution names only against same-team box identities and explicit
  PBP name/ID aliases. Compare first-period box positions and any available period
  opening boxes. Prefer a five-player candidate consistent with every later event
  and substitution. If fewer than five identities are exposed, enumerate remaining
  roster candidates and select the combination whose reconstructed full-game minutes
  best agrees with the box (sum absolute error, maximum error, lexical player IDs).
  Do not invent period box minutes when those observations are unavailable. An
  incompatible or incomplete supplied starter set gets an explicit override.
  Blank native `BLOCK (... BLK)` / `STEAL (... STL)` rows assert on-court presence;
  team IDs in `personId` on team rebounds/turnovers assert a team action.
  Exhaustively rank up to 10,000 candidate combinations per team. Above that bound,
  use at most eight deterministic coordinate passes with the same ranking.
  Unresolved minutes/lineup contradictions remain explicit exclusions.
- **IM02-R2 missing substitution.** An on-court action or substitution-out by an
  absent player inserts that player at the last preceding dead ball in the period
  (period start, foul, timeout, violation or substitution; immediately before a
  triggering substitution-out is also an eligible boundary). Remove the current player
  with the fewest seconds since their last on-court action; ties use lexical player
  ID. The insertion is replayed from that boundary, including affected scoring.
  Unresolvable player identity, no valid boundary, a cycle or more than 20 insertions
  per team-period is unrecoverable. Technical fouls, ejections and administrative
  events do not assert on-court presence; technical free throws still score.
- **IM02-R3 same-clock order.** Preserve chronological source order within each exact
  clock group. A substitution block moves ahead of a nontechnical free throw only
  when it introduces that shooter and no intervening substitution-out establishes
  the shooter was already present for the attempt; preserve all other order
  (a player can legitimately enter between attempts). Linked rebounds remain after
  their shot. Timeouts retain source position. CDN in/out rows are paired within
  contiguous substitution runs, never across intervening free throws at the same
  clock. This causal rule avoids assigning all equal-clock points to the lineup before the first substitution. Record any moved
  event by ordinal, including duplicate action numbers. Time reversal is excluded.
- **IM02-R4 minutes.** Compare seconds for every observed box player, including
  explicit zero-minute rows. Maximum absolute error <=1 s is clean; >1 and <=30 s
  is patched with a reconciliation override. >30 s excludes the game after R1/R2.
  Report unknown minutes separately, without imputing zero. Five-player sides and
  total player-seconds (five times duration per side) must always conserve.
- **IM02-R5 malformed minutes.** Accept finite nonnegative `M:SS[.fraction]`.
  Exactly `SS=60` carries to the next minute (`25:60` = 1,560 s); record original
  and normalized seconds. Other malformed values remain unknown and exclude only
  that player-game from minutes checks. Empty DNP minutes remain unknown, even if
  an explicit comment indicates nonparticipation. Report the omitted comparisons.
- **IM02-R6 cross-source arbitration.** Canonicalize v3/CDN scoring (2023 v3 lacks
  `shotValue`; use its explicit `3PT` description marker, never cumulative
  `pointsTotal`) and substitution
  conventions; compare event by action-number occurrence, preserving both values
  and locators. Prefer the source conserving independent team points and player
  points/FGA/FGM/3PA/3PM/FTA/FTM. If both conserve, prefer v3 deterministically;
  if only CDN conserves, use CDN. If v3 later fails the lineup/minute
  rules, try box-conserving CDN before exclusion and retain both diagnostics.
  If neither conserves, exclude. Missing CDN is
  `unavailable`, never agreement. Source clock, actor or outcome conflicts get
  arbitration overrides; formatting and administrative schema differences are
  recorded separately. Team-box points must agree with the independent schedule.
- **IM02-R7 exclusion.** Exclude only unrecoverable source/identity/lineup/clock,
  scoring or minutes contradictions. Retain partial diagnostics and rule counters;
  never manufacture unknown players, scores, box rows or empty successful games.
  Every scheduled game remains in the report denominator and every excluded ID
  has reasons. No coverage or patch-rate threshold is imposed.

## Quality and verification

`clean`: conserved five-on-five reconstruction, scoring and known minutes within
1 s, with no repair. `patched`: those invariants hold after deterministic repairs
or minutes tolerance up to 30 s. `excluded`: at least one unresolved invariant.
Unknown minute and missing source observations are disclosed independently; they
are not assumed agreement. Plus-minus is measured against observed box plus-minus
and reported with exact-match rates and error distributions. It is a diagnostic,
not an optimization target or a permission to change scoring order.

The offline report binds schedule, box, archive, code and policy hashes, lists per
season/phase quality percentages and exclusions, aggregates all seven rule counters,
and retains player-minute and plus-minus comparisons. Repeated identical inputs
must reproduce the result hash. This block does not populate possessions or serve
ratings; IM03 extends the existing warehouse orchestrator and seals its own datasets.
