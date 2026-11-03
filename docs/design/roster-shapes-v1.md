# Roster Shapes v1 (PC10)

Status: superseded by [Roster Shapes v2](roster-shapes-v2.md) (alignment row 12, 2026-10-19). Was the
contract for [presentation clarity](../presentation-clarity-plan.md) PC10 (C15, C18).
Code: `src/courtlens/services/roster_shapes.py` (read-only serving),
`dashboard/components/roster-shapes-view.tsx`, `dashboard/lib/roster-shapes.ts`,
`ShapeGlyph`/`ShapePack` in `dashboard/components/charts/shape-pack.tsx`.
Evidence: [PC10 evidence](../evidence/pc10/README.md).

Roster Shapes are descriptive pictures of 2026-27 rosters. They carry no team rating, forecast,
"best roster" or verdict, and they fit nothing. Diagrams are after Wyman diagrams by
**@taylormetrics** (credited on the page and in Data details).

## Inputs

| Input | Use |
| --- | --- |
| Pinned NBA player index for 2026-27 (latest admitted, written to the URL as `index`) | Current team, listed position, active roster |
| Published statistics release (default public channel; `releaseId` overrides) | 2025-26 regular-season minutes and games per player; 2025-26 teams each player appeared for |
| PC09 serving manifest ([value and archetypes v1](value-archetypes-v1.md)) | BPR value (regular season 2024-25 + 2025-26) and derived archetype membership |

## Encodings

- **Size = value over replacement (VOR):** `(BPR − (−2.0)) × min(1, minutes₂₀₂₅₋₂₆ / 3,936)`.
  −2.0 is the BPM/VORP replacement convention; 3,936 = 82 × 48. Units: BPR points per 100
  possessions over replacement, scaled by share of a full season's minutes.
  - VOR ≤ 0 is **below replacement**: a known value with no area, listed in the table.
  - No BPR or no 2025-26 minutes is **unknown**: not drawn, listed with reasons, never zero.
- **Color = primary derived archetype**, `--color-category-{cluster + 1}`. Names come from
  [archetype-names-v1.json](archetype-names-v1.json) (confirmed by the owner 2026-10-11).
  No archetype is the hatched unknown pattern.
- **Outline = fit, defined as continuity only:** solid = appeared for this team in the 2025-26
  regular season (returning); dashed = appeared only for other teams (new arrival); dotted = no
  2025-26 appearance. It does not claim the players complement each other.
- **White space = gap to the fullest roster** in the view: the circle's occupied radius is
  `sqrt(team VOR / max team VOR)`. It is not a target, a need or cap space.

## Team summary and sorting

Per team: known positive VOR total (a lower bound), players drawn, below replacement, unknown,
returning share (positive VOR from returning players ÷ team total; null when the total is 0) and
the VOR mix by archetype. Sorts: **Fullest** (total VOR), **Best fit** (returning share; null
last), **A–Z**. Ties fall back to team name.

## Not in v1

- **Playoff-adjusted view:** the only sealed playoff BPR is 2025-26 alone (230 players, 5 meeting
  the 20-game rule; the 2Y playoff BPR is null for every player). It cannot support a 30-team view,
  so the toggle is not shown. Owner decision pending at G4.
- **Other seasons:** only "2026-27 · projected". Stats pages and observed shapes switch when
  2026-27 games exist.

## Serving

`GET /api/workbench/roster-shapes` (optional `datasetId`, `releaseId`) returns all 30 teams in one
response (about 330 KB). Team detail reads the same response. 503 if the PC09 manifest or the
player index is missing. The depth-chart allocation view (FO05) is unchanged and is the
**Depth chart** tab at `/roster-shapes/{TEAM}?view=depth`; old `/roster-shapes?team=` links redirect
there.
