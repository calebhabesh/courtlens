# B19d native reconstruction candidate contract

B19d builds a replayable native-input reconstruction path. It does not replace
the sealed B19a/B19b/B19c parsers, certify `possession-policy-v1`, or authorize
B20/WOWY admission. [Measured acceptance](../evidence/b19d-native-reconstruction-acceptance.md)
separates candidate numerical reconciliation from source and admission gates.

## Inputs and grain

Retain complete `playbyplayv3`, `gamerotation`, `boxscoretraditionalv3` and
`boxscoretraditionalv3_period` responses. Pin mirror commit, requested resource,
acquisition times, HTTP status/headers, byte count and SHA-256. Error responses
are artifacts too; a timeout is an observation without a complete artifact.
Acquisition uses exclusive fresh directories and content-addressed blobs. Replay
verifies all bytes before creating its output. Bind schedule and independent
retained team-box hashes when running measured acceptance.

Native response event identity is `(PBP artifact SHA-256, gameId, actionId,
/game/actions/<zero-based index>)`. Preserve `actionNumber` separately. Require
unique, increasing positive `actionId` within the retained response, source order,
contiguous periods, complete clock endpoints and nonincreasing period clocks.
This does not establish stable event identity across provider corrections.
Hash the complete event payload and bind all four input artifact hashes to the
result. No reduced action-number join or derived lineup CSV is involved.

## Reconstruction

Rotation intervals are half-open elapsed tenths of a second, converted to exact
decimal seconds. Regulation periods last 720 seconds and overtime 300 seconds.
Reject invalid identities, wrong teams, overlapping player intervals, nonfinite
times and intervals outside the game.

Period-opening candidates come from observed rotation membership at the period
boundary. Independently compare period 1 with explicit full-box starter positions,
and subsequent periods with positive minutes in the retained opening-window
responses. Require five rotation players on each side. Any disagreement preserves
both sets and quarantines the candidate; an incorrect opening response is never
rewritten. Rotation evidence does not turn a contradicting range response into
verified starter corroboration. Never infer a starter from a later appearance.

Apply native substitutions in original event order. In this measured v3 schema,
`personId` identifies the outgoing player; `SUB: <incoming> FOR <outgoing>` must
agree with roster identity. Resolve incoming names only against explicit box-name
fields and native PBP name/person/team bindings. Case/accent normalization is
pinned; collisions refuse reconstruction. This permits the observed first-name
`Hansen` alias for box player `Hansen Yang`, without inventing another NBA identity.
Retain alias locators and before/after sets. Equal-clock scoring uses its exact
position relative to substitutions; administrative rows cannot reorder it.

Between event times, compare the reconstructed side against every intervening
rotation segment, including silent boundaries inside an event interval. Retain
positive-duration candidate intervals, separate event lineups and exact player
seconds. Candidate intervals are not yet persisted B20 lineup-stint facts.

## Conservation and missingness

Fix candidate comparison tolerance at **one second per player/game** before the
representative run. Reject `MM:60`, blanks and other malformed required minutes.
Only explicit DNP/DND/NWT comments establish nonparticipation; preserve their
original minute field instead of fabricating a numerical zero box observation.

Use explicit made/missed field-goal outcomes and observed two/three-point values.
The candidate FT recipe accepts explicit `MISS ` or `Free Throw ... (N PTS)`;
unresolved outcomes fail. Reconcile points, FGA/FGM, 3PA/3PM and FTA/FTM per player,
team final points, event shooter presence, player time and every rotation interval.
Retain and compare present source scoreboard observations; decreases and cumulative
disagreement quarantine, with no clamp or replacement. A technical FT remains
a credit to its observed team. This recipe is not a final violation/possession
parser and does not assign possession ownership.

## Admission boundary

All outputs explicitly declare `database_admission=false` and
`possession_policy_admitted=false`, including otherwise reconciled candidates.
No new warehouse rows, publication pointer changes, or hidden manual overrides.
Future corrections must be immutable input artifacts with original value,
replacement, author, reason, source locator/hash and policy version. Replacing
evidence without a new artifact is prohibited.

Only after independent starters/minutes and native event conservation pass can
the next slice freeze possession ownership/membership, FT/violation/rebound rules
and cross-lineup exposure. Then implement append-only event/stint memberships
and run PostgreSQL sealing, transaction rollback and A→B→A checks. Partial-game
WOWY admission and complete-season acceptance require distinct coverage claims.

## Executable gates and external dependencies

| Gate | Executable acceptance | External dependency |
| --- | --- | --- |
| Native reconstruction implementation | `pytest tests/unit/test_native_reconstruction.py -q`; fresh-directory replay yields identical complete event/interval hashes | None for fixtures; retained raw bundles for measured games |
| Representative admission-quality reconciliation | Replay six fixed games with `--baseline`; every required game must have complete inputs and `reconstruction_passed=true` | Correct period-opening evidence, valid independent minutes and missing rotations |
| Season scale | Complete nontruncated rotation tree covers every scheduled regular game, followed by full-game checks above | Mirror currently lacks 1,065 required regular-game rotation files; an alternative must supply independent evidence |
| Possession/B20 admission | Frozen native possession parser and all scoring memberships; executed PostgreSQL seal/rollback/replay checks | Preceding source gates, supported raw parser schema and attribution policy |

The second through fourth gates are open. Test success for the first cannot be
reported as admission, partial WOWY availability or complete-season acceptance.
