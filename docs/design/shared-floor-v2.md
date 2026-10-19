# Shared-floor v2

Identity `courtlens-shared-floor-v2`. Implemented 2026-10-19 for alignment row 13 (Stat Line Shift),
instructions 1, 3 and 5. Supersedes [shared-floor v1](shared-floor-v1.md) (`courtload-shared-floor-v1`,
frozen) for all three operations. Everything in v1 not changed below still holds: the selected
predicate against its logical complement, all `2^n` presence/absence cells, the focal player's
stints only for stat shifts, game-cluster intervals, gates, the 20,000-stint bound, hashes, and
"unknown is never zero".

## Which stints

v1 read stints only from the release's own dataset, and the owner database had none, so every
query was source-blocked. v2:

1. Uses the release dataset's stints when it has any for the season and phase.
2. Otherwise uses the ready `courtlens-impact` dataset for that exact season and phase: the six
   sealed IM03 datasets (2023-24 to 2025-26, regular season and playoffs) admitted from
   `data/derived/impact-event-gate/bundles` on 2026-10-19 (append-only, no publication pointer
   changed). Ties break by content hash.
3. Joins those stints by NBA game id to the **release's** finalized schedule, which still decides
   which games count, their dates and the cutoff. Expected games come from the release schedule,
   so IM02's excluded games show as `partial` coverage, never as zero.

The response context adds `stint_dataset_id`. Seasons before 2023-24 remain source-blocked.

## Which stints are valid

- Status `valid` or `patched` (IM02's accepted lineup repairs), as IM04's RAPM and on/off use.
- Policy `possession-policy-v1` or `possession-policy-v2` (IM03's method).
- Duration ≥ 0 under policy v2: IM03 keeps zero-duration instants (events at a substitution, such
  as free throws) as their own lineup moment; 82,142 of the 202,063 sealed stints. They add
  possessions and points, never seconds. Policy v1 stints still need positive duration.
- All other v1 checks (five distinct players a side, disjoint sides, nonnegative possessions, a
  failing segment excludes its whole game) are unchanged.

## Player stats

Sealed IM03 stints carry per-player points only. For `courtlens-impact` stint datasets, each
on-floor player's stats come from the [stint box](stint-box-v1.md) matching the dataset's bundle
hash (`stint_box_manifest` in settings): known fields with no events are known zeros; fields that
did not conserve to the box score in that game are absent (unknown). Without an installed stint
box, only points are known.

## New metrics (stat shift only)

Each is `100 × ΣY ÷ ΣD` over the focal player's valid stints, with its own game-cluster interval.

| Metric | Y | D | Valid stint |
|---|---|---|---|
| `usage_pct` | focal FGA + 0.44 FTA + TOV | the same sum over all five teammates on the floor | all five players' FGA, FTA, TOV known |
| `ts_pct` | focal points | 2 × (FGA + 0.44 FTA) | focal FGA, FTA, points known |
| `fg3_pct` | focal 3PM | focal 3PA | both known |
| `reb_per_100` | `oreb_per_100 + dreb_per_100` | (each on its own possessions) | as its parts |

Rates (`usage_pct`, `ts_pct`, `fg3_pct`) have attempt denominators, so their difference is gated by
the cells' possession and game gates and positive attempts on both sides, not by 100 attempts.
`reb_per_100` is a combined metric like `net_rating`: its value and interval are the linear
combination of its parts with the game-level covariance preserved, and its difference needs both
parts' differences.

## Roster operation

`POST /api/workbench/operations/stat-shift-roster` (read-only, already inside the demo's
`/api/workbench/operations/*` allowance) takes a team, scope, gates and an optional `subject_id`.
It reads the team's stints once and returns:

- `roster`: every player with team stints in scope, by minutes (names from the identity registry);
- `shifts`: with a subject, one full stat-shift response per teammate: focal = that teammate,
  `together = [subject]`; identical to calling `stat-shift` for each;
- `available_scopes`: the season/phase pairs that have admitted stints.

Without a season it uses the latest season with admitted stints for the requested phase (regular
season by default), not the release's default season. Without a team it returns only the scopes
and the resolved context (empty roster), for the page before a team is picked.

## Presentation (Stat Line Shift)

Counting rates and `net_rating` read per 75 possessions (per 100 × 0.75); percentages read as is.
Without = the complement cell, with = the selected cell, difference = with − without, shown only
when eligible. Measured against Databallr's Toronto 2025-26 page with Scottie Barnes: Quickley
21.9 → 18.1 PTS (Databallr 21.9 → 18.1), Ingram USG 30.4 → 25.5 (30.5 → 25.2), minutes 848 / 1,756
(828 / 1,709).
