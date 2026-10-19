# B21 shared-floor API v1

> Superseded by [shared-floor v2](shared-floor-v2.md) (2026-10-19): sealed IM03 stints, patched
> and zero-duration v2 stints, the stint box, rate metrics and the roster operation.

Implemented 2026-10-03. Parent: [replica analytics contract](replica-analytics-contract.md).

Three read-only POST operations under `/api/workbench/operations`: `on-off`, `wowy`, and `stat-shift`. Pydantic/OpenAPI contracts live in `src/courtlens/domain/on_off.py`; the operation identity is `courtload-shared-floor-v1`. No query writes, acquisition, training, leverage filtering, or shrinkage occurs.

Example body:

```json
{
  "release_id": "<retained workbench release or dataset ID>",
  "season": "2023-24",
  "phase": "regular_season",
  "before_date": "2024-04-15",
  "team_id": "TOR",
  "together": ["1627751"],
  "apart": [],
  "min_possessions": 100,
  "min_games": 5
}
```

Omitted release/season/phase/cutoff resolve through the existing research context. Team IDs and registered NBA tricodes resolve to one canonical team. Both existing schedule representations are supported. Season/phase must belong to the bound workbench dataset. Optional `lower_date` is inclusive; `before_date` is exclusive in the NBA calendar. Only schedule-final (`game_status=3`) games qualify. Archive releases without stint bindings return a typed `source_blocked` error. Unknown request fields, unsupported leverage/shrinkage toggles, invalid bounds, and contradictory predicates are rejected.

For WOWY, `together` means every member is on the selected team's floor; `apart` means every member is absent from that floor. At most five distinct conditions are supported. `exact_unit` instead accepts 2–5 distinct players, without together/apart filters: all members must share the floor, with remaining teammate slots unconstrained for 2–4 players. A five-player unit equals the full lineup. Conditions always refer to the selected team, not the opponent. Empty selected exposure stays empty; missing player box rows cannot establish attendance.

On/off requires exactly one `together` player and no other conditions. Stat shift requires a separate `player_id`: only stints containing that focal player enter either split. Its event production compares the selected predicate against its logical complement. For multiple together players, the complement means at least one is absent; it does not mean all are absent. Every operation also returns all `2^n` disjoint presence/absence cells, including empty cells, with explicit present/absent identities. Partition games can overlap; stint counts, seconds, possessions, and points reconcile additively.

One team-side stint contributes once. Input rows require valid status, pinned `possession-policy-v1`, five distinct disjoint players per side, positive duration, and nonnegative exposure. A failing segment excludes the entire game's segments and reports the excluded count. This protects partition integrity; upstream reconstruction still owns duration, minute, event, score, and possession reconciliation. No arbitrary-dataset substitution occurs under a release label.

Cells return seconds, unrounded minutes, games/stints, observed offense/defense possessions, scoring, raw ratings, focal-player event totals, metric-valid stint counts and denominators. ORTG is `100 * own points / offensive possessions`; DRTG is `100 * opponent points / defensive possessions`; NET is their difference. Focal counts are normalized per 100 offensive possessions, except steals, blocks and defensive rebounds use defensive possessions. These are operation-versioned descriptive recipes, not imported vendor metrics. Fractional exposure follows B20's possession policy. Event totals sum known fields; per-100 rates use only jointly valid count/positive-exposure rows. No known observation produces null, while a recorded zero stays zero.

Default gates require at least 100 offensive **and** defensive possessions and five games per cell. Configurable limits: possessions 1–10,000; games 1–82. Raw estimates remain visible below gates; differences require eligible cells and metric-specific valid possession/game support on both sides. Defaults are explicit operational thresholds, without a tuning or calibration claim. Each request is capped at 20,000 stints, retrieved with a 20,001-row sentinel; overflow returns `query_bound_exceeded` rather than truncating output. Narrow with lower/cutoff dates.

Intervals are approximate 95% game-cluster ratio-linearization intervals, with at least ten valid games for each directional metric/split. For `R = 100 * sum(Y_g) / sum(D_g)`, cluster influence is `u_g = 100 * (Y_g - R/100 * D_g) / sum(D_g)`; variance is `G/(G-1) * sum(u_g^2)`. Endpoints use the normal 0.975 quantile. Difference and net-rating intervals combine signed influences within the same game, preserving covariance; missing exposure in a cell contributes zero influence for that game's cell. Unsupported intervals are null with an explicit reason. These are approximate uncertainty estimates under independent-game assumptions, not calibrated prediction intervals, causal effects, or validated significance after many comparisons.

Responses return expected prior finalized team games, observed reconstructed games, excluded stints, and `available`, `partial`, or `source_blocked` coverage. These counts describe admitted schedule coverage, not proof that an upstream season is complete. Statistical sample eligibility is separate from source coverage. Empty samples have null scores/rates; no unavailable source becomes observed zero production.

`input_hash` binds normalized eligible stint facts and exclusive scope. `evidence_hash` additionally binds operation/version, canonical conditions/gates, output estimates and intervals. Both exclude installation UUIDs, unrelated future rows, release-wide hashes, and acquisition timestamps. The returned context separately carries release/dataset provenance. Same-day, future, different-phase, unfinished, and different-dataset observations cannot enter the calculations.

Verification: `tests/unit/test_on_off.py` provides independent partition/ratio/covariance/missingness calculations; `tests/integration/test_b21_api.py` tests real PostgreSQL joins and HTTP validation using isolated transactions. [Real-database smoke evidence](../evidence/b21-api-smoke.json) records current capability availability. At implementation time the retained database had zero stint rows: populated-season analytics and performance are **not yet verified**. B22 must retain this gate rather than displaying fixture values as actual analytics.
