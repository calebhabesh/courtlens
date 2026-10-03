# B23 shooting and possession-sequence policy v1

Frozen before implementation, 2026-10-03. Read-only operations:
`shot-profile`, `shot-profile-peers`, `matchups`, `shot-aftermath` under
`/api/workbench/operations`. All use a retained workbench release, one season/phase,
exclusive cutoff and optional inclusive lower date. Missing inputs are source-blocked.

- Coordinates: adapter-normalized feet relative to the attacking basket, x lateral,
  y toward midcourt. Reuse `shot-zones-v1` without changing its boundaries. Absent
  coordinates produce Unknown, even when a provider supplied a zone label; observed
  zero coordinates remain valid only when admitted as present. Attempts include
  these unknown locations. Makes and points are observed; FG% is makes/attempts.
- Peers: Euclidean distance between attempt-share vectors over the seven known
  `shot-zones-v1` zones. Unknown attempts are excluded from that vector but reported.
  Default minimum 100 located attempts and five games, for focal and candidates.
  No fitted model, efficiency, causal quality or tracking identity. Ties use player ID.
- Matchups: aggregate only explicit source offensive/defensive pair assignments.
  Sum seconds, fractional possessions and assignment makes/attempts/points. Display
  assignment FG% as pooled makes/attempts. Fractional exposures and help assignments
  are not ordinary player totals. No guarding inference from co-occurrence/location.
- Aftermath: one first field-goal attempt per counted, valid `possession-policy-v1`
  possession. Join shots to events only by unique game/period/player/team/clock and
  shot value; multiple or absent matches are unknown, never nearest-clock guesses.
  The first event with shot value 2 or 3 in the possession must match the anchor.
  Branches: made; missed with observed offensive rebound or subsequent field goal;
  missed without observed recovery. Only same-possession recovery is counted.
  First-chance scoring is the anchor field goal only. Continued scoring is the
  containing possession's points minus that goal, including ALL free throws in
  that possession; attribution to the anchor foul is unavailable. This deliberately
  partial accounting does not claim a full offensive-recovery chain across distinct
  possession records. Immediate next opponent possession means possession number
  +1 in the same period, counted/valid and with reversed teams. Never skip intervening
  records or cross a period. Unmapped attempts appear in the Unknown candidate
  branch with observed shot points; their first-chance points stay null because
  first-chance membership is unproven. Absent next records at period end are censored; other
  absent/invalid next records are missing. No net-rating or causal-impact metric.
- Samples: raw totals visible; separate min-games/min-attempt gates. Profile
  eligibility uses located attempts; aftermath sample status uses mapped anchors
  and games in that branch. Opponent/continued sample counts remain separate.
  Assignment summaries are descriptive raw exposure with no significance gate. No intervals,
  shrinkage, nearest defender or video URL is invented. Return per-anchor evidence,
  missing/censored counts, normalized shot facts and hashes for local export.
- Bounds: at most 50,000 records per input relation; overflow rejects the complete
  request and asks for a narrower date scope. Peer results at most 25; complete
  eligible vectors participate in ranking. Hashes bind eligible semantic facts and
  policies, excluding installation UUIDs, future games and source-wide file hashes.

B24 consumes these schemas and must retain these limitations. Server-side saved
investigation registration, video mapping and cross-possession recovery are deferred.

## B24 implementation handoff

Python schemas: `src/courtload/domain/shooting.py`; OpenAPI exposes all four typed
POST operations. `player_id` is the focal shooter/offensive assignment identity;
`defender_id` filters assignments only. No inferred team membership is required.
Context and source-admission provenance are returned separately from content hashes.
`expected_games` counts finalized schedule games in the selected league scope;
`observed_games` counts eligible games across every required input relation, not
player appearances. Empty focal samples can coexist with nonempty source coverage.
Invalid rows quarantine their entire game in that relation; aftermath also excludes
that game from its other input relations. Mapping gaps make aftermath partial.

`shots` is the full bounded focal fact list, with unknown coordinates preserved.
`profile.zones` contains seven fixed known zones plus Unknown, including empty cells.
`peers` is sorted by distance then ID; no eligible focal vector returns no peers.
`assignments` contains all matching source pairs, with pooled FG% and explicit
fractional possessions. `anchors`, `aftermath_summary` and `branch_counts` are local
export evidence. Unknown branch totals and missing next-opponent outcomes remain
null. Do not combine totals having different sample counts into an inferred net
metric. Source coverage and sample eligibility are separate controls.

50,000-record bounds apply to each complete scoped input relation before player
aggregation. A dense whole-season league shot scope may exceed this bound; the API
returns `query_bound_exceeded` and requires narrower dates. No populated recent-season
performance or full-season availability is certified. Current retained-release smoke
is [source blocked](../evidence/b23-api-smoke.json) for all four operations.
