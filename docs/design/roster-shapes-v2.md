# Roster Shapes v2 (alignment row 12)

Status: contract for [alignment catalog](../databallr-alignment-catalog.md) row 12; supersedes
[v1](roster-shapes-v1.md) (PC10) for sizing, shape, seasons and the page. Code:
`src/courtlens/services/roster_shapes.py` (`courtlens-roster-shapes-v2`),
`dashboard/lib/roster-shapes.ts` (shapes, packer), `dashboard/components/roster-shapes-view.tsx`.
Evidence: `docs/evidence/alignment/roster-shapes/`.

Roster Shapes are descriptive pictures after the Wyman diagrams by **@taylormetrics** and
Databallr's Roster Shapes. They carry no forecast, winner or verdict and fit nothing.

## Inputs

| Input | Use |
| --- | --- |
| Pinned 2026-27 NBA player index (`index` in the URL) | Projected rosters, listed position |
| Published statistics release | 2025-26 regular-season minutes and games; teams appeared for (continuity) |
| Sealed DARKO bundle | 2025-26 end-of-regular-season DPM, ODPM, DDPM; every playoff snapshot for the playoff shift |
| PC09 archetype manifest | Colour (primary derived archetype); `usg_pct` and `three_rate` for fit |

## Seasons

- **2026-27 · projected** (default): index rosters; minutes per game = 2025-26 regular-season
  minutes ÷ 82, scaled down to 240 a game when a roster adds up to more.
- **2025-26**: every player who appeared for each team; minutes per team game = his minutes with
  that team ÷ the team's games. A traded player appears on each of his teams.
- Earlier seasons are not served: archetypes (rim rate needs the shot dataset) start in 2023-24 and
  the sealed per-player records are mostly 2025-26, so older boxes would colour players from later
  data.

## Encodings

- **Size** = max(0, DPM + 2.0)^2.2 × minutes per team game (Databallr's formula). Drawn area is
  size ÷ box. DPM ≤ −2.0 is a known zero (not drawn); no DPM or minutes is unknown (not drawn,
  listed with reasons, never zero).
- **Box** = a +17.4 team: 240 minutes at +3.48 DPM, (3.48 + 2)^2.2 × 240. Fill = Σ size ÷ box.
  White is what a perfect team would add.
- **Shape** = ease of fit, an estimate: the mean league percentile (mid-rank, over DARKO players
  with all inputs) of DPM, DDPM, three-point rate and 1 − usage, in eight equal-count bands:
  squircle, circle, octagon, hexagon, pentagon, diamond, four-point star, burst (plugs in anywhere →
  hardest to fit). Missing inputs draw a dashed square (fit unknown). Best fit sorts by the
  size-weighted team mean.
- **Colour** = primary derived archetype (`--color-category-1…6`); unknown is grey.
- **Playoff-adjusted** = DPM + Σ(ΔODPM × games) ÷ (Σ games + 10) over every season's playoffs
  through 2025-26, where ΔODPM is the playoff snapshot minus the regular-season snapshot and games
  is the DARKO career-games increase. No playoff games: no shift. A proxy for Databallr's
  adjustment; playability is not modelled.
- **Continuity** (table and tooltip only): returning / new arrival / no sample, against the season
  before.

## Packing

Shapes are placed largest first at the top-most, then left-most spot where the outline,
rasterised one cell per box unit and kept one cell clear, touches no other outline, so spiky shapes
nest into corners. The cluster is spread over the box when every outline stays clear. A roster
whose shapes each fit a cell of an even grid is laid on that grid, largest in the centre. If a
shape fits nowhere all shrink 3% and packing restarts (never needed for the sealed data, so drawn
area equals size). Deterministic.

## Serving

`GET /api/workbench/roster-shapes` (`season`, `datasetId`, `releaseId`) returns 30 teams with
fills, both sizes per player and the method constants; 422 for other seasons, 503 without the
archetype manifest or DARKO bundle. Responses are cached per (season, index, release, DARKO seal).
`/roster-shapes/{TEAM}` redirects to `/roster-shapes?team=TEAM`; `?view=depth` opens the team
profile, whose Depth Chart section is the FO05 allocation view.
