# B19 event identity and conservation diagnostic v1

B19c is a retained-byte diagnostic, not event/stint admission or the final
`possession-policy-v1`. B19 remains source_blocked. B20 must not consume these
candidate exposures. Keep the sealed B19a/B19b parsers, inputs and evidence intact.

## Identity

A source row is `(artifact SHA-256, one-based CSV data-row locator)`; exclude the
header. Preserve the entire decoded payload. Retain exported `action_id`,
`order_index`, `action_number`, period and clock separately. `action_number` is
not a unique event key. An exported ID must not be relabelled as an independently
verified native NBA event ID. Transform signatures and source membership are
necessary even when exported IDs are unique within a game.

The PBP and lineup artifacts have equal complete ordered projections of
`(game, season, period, action_number)` for each regular-season game. Diagnostic
join v1 pairs their per-game row positions only after checking that complete
projection and cardinality. Its transcript hashes both full payloads and both
original CSV locators. It rejects missing/shifted projections and noncontiguous
source game groups. Baseline identities come from independently retained
schedule/player/team boxes. A partial action-number lookup or dictionary that
retains the last duplicate is forbidden.

Projection equality is weaker than independent provider event lineage. Repeated
`(period, action_number)` keys with different home/away player sets are explicitly
ambiguous, even when source positions align. Reordering indistinguishable duplicate
keys cannot be detected by the reduced projection. Future admission needs pinned
builder/native event evidence or independently reconstructable lineups for those
rows; it cannot promote positional alignment into a provider guarantee.

## Time and appearance

Use exact decimal period seconds: 720 regulation, 300 overtime. Require complete
period spans, consecutive periods, consistent clock representations and contiguous
ordered events. The diagnostic computes two explicitly different hypotheses:

- **Row hold:** hold the current event's home/away lineup until the next event.
- **Endpoint hold:** assign that same interval to the following event's home/away
  lineup. This diagnoses pre-event versus post-event snapshot semantics; it is
  not a permission to reconstruct silent starters from future appearances.

Neither hypothesis changes source rows or chooses missing players. Reject repeated
players, invalid roster/team membership, and invalid positive-duration lineups.
Do not calculate candidate player seconds from PBP's imported off/def columns;
report disagreement with the separately joined home/away source explicitly.

The fixed diagnostic comparison tolerance is **one second per player/game**,
selected before the full-season comparison. Report exact candidate/box/delta
seconds for every parsed player. It is not an approved admission tolerance.
Malformed `MM:60` and unknown box minutes stay unknown. An explicit source
DNP/DND/NWT comment is retained as nonparticipation without inventing numerical
box minutes or an injury diagnosis; candidate time for such a player is a failure.
Missing comments/box rows are not evidence of nonparticipation.

## Scoring and possession membership

Direct observed field-goal credits use explicit made/missed and 2/3 value fields.
The diagnostic FT text recipe accepts explicit `MISS ` as a miss or a
`Free Throw ... (N PTS)` outcome as a one-point make; unknown text rejects. This
is a pinned diagnostic recipe, not a general FT/violation parser. Check scorer
NBA roster/team and presence in the home/away source lineup. Compare direct
cumulative credits with each present source scoreboard observation and final
independent outcomes. Preserve decreases/corrections; do not clamp to a running
maximum or rewrite a source observation to make conservation pass.

Possession boundaries resolve against actual order indices, period and exact
clocks; inclusive membership must be contiguous and cannot overlap. Every scoring
event must belong to exactly one imported interval. Non-scoring unassigned rows
are counted separately because dropped administrative groups require a final
policy. Compare imported possession points with direct offensive event points;
record opposing-team credits separately. A technical FT for the opposing team
inside an offensive interval must not be reassigned to the offense or dropped to
force totals. Keep scoring attribution separate from possession-count exposure.

Record possessions spanning different lineup signatures. Whole-possession start
lineups cannot stand in for event scoring or shared-floor exposure. Rebound,
FT/and-one/technical/clear-path, lane-violation, jump-ball, same-clock substitution
and overtime denominator rules remain gates for final policy and B20.

## Next admission dependency

Retain a bounded raw-source reconstruction spike: native PBP observations,
rotation intervals, full-game starters and independent per-period/range boxes for
representative quarantined games. Bind bytes, endpoint/schema, acquisition times,
parser/builder versions and any manual overrides. Evaluate pbpstats at its actual
raw-data seam; do not import aggregate CSV rows as if they were supported cached
NBA responses. Compare reconstructed event identities and player intervals with
these diagnostics, then select/freeze the substitution and possession policies.
Only then add append-only event/stint memberships and execute PostgreSQL sealing,
rollback and A→B→A acceptance. B32 final/correction and resource gates are separate.
