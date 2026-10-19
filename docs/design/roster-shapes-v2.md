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
| Sealed DARKO bundle | 2025-26 end-of-regular-season DPM, ODPM, DDPM; every playoff snapshot for the playoff shift; the `current` entry (latest ratings and expected minutes) for the projection |
| PC09 archetype manifest | Colour (primary derived archetype); `usg_pct` and `three_rate` for fit |

## Seasons

- **2026-27 · projected** (default): index rosters. With a sealed `current` DARKO entry
  (`courtlens refresh-darko-current`: the dated board at the run date, ratings through the latest
  data date, `x_minutes` kept), each player is drawn from that DPM and DARKO's expected minutes per
  game (2025-26 minutes ÷ 82 where DARKO has none), and the playoff shift stops at 2024-25 because
  the latest ratings already carry the 2025-26 playoffs. Without it: end-of-regular-season DPM and
  2025-26 minutes ÷ 82 (`minutes_source`). Either way a roster over 240 a game is capped by
  rotation: in order of minutes each player keeps his own until the team reaches 240, the next
  gets what is left and the rest none, so stars keep their real minutes (a proportional scale
  shrank Wembanyama from DARKO's 35.1 to 27.0). `minutes_uncapped` carries the minutes before the
  cap. Databallr does not cap (its San Antonio adds up to about 320). The `current` entry never serves a Stats scope (`darko_scope` matches the
  query's phase; the catalog lists only regular season and playoffs). DARKO had not published
  2026-27 projections on 2026-10-19 (its newest season is 2025-26), so none are used.
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
nest into corners. The cluster is spread over the box when every outline stays clear. A sparse
roster is laid in even rows instead (see Sparse layout below). If a
shape fits nowhere all shrink 3% and packing restarts (never needed for the sealed data, so drawn
area equals size). Deterministic.

## Beyond Databallr (row 12, follow-ups 6–11)

- **What's missing:** under each box, the archetypes under 2% of the box; in team view the white
  as one starter: the DPM d with (d + 2)^2.2 × 34 = white, or "more than any one player adds" when
  d exceeds the league's best DPM.
- **Trade sandbox** (`add`, `drop` in the URL): the team without `drop` plus `add` from any other
  roster in the response, each at his own uncapped minutes and DPM (plus his shift when
  Playoff-adjusted), then capped at 240 a game by the same rotation rule. Added shapes are outlined. A what-if.
- **Since last season** (projected team view): 2025-26 and 2026-27 boxes side by side; departures
  dashed and faded, arrivals outlined; lists with each player's box share.
- **Fill vs results** (league view): 2025-26 fill against 2025-26 regular-season net rating
  (`/api/workbench/teams/six-factors`), Pearson r and the least-squares line. DPM learned from the
  same games, so it describes, not predicts (r = 0.87 live).
- **Share image:** the team's box with name, fill, what's missing and the colour key, exported as a
  PNG through `lib/image-export` (the PvP card's exporter).
- **Sparse layout:** a roster whose footprints fit in even rows is dealt across rows (middle row
  first, largest mid-row), rows and shapes spaced evenly; otherwise the outline packer runs.

## Team view and hover (row 12, follow-ups 14–17)

The team view follows Databallr's: the box beside a panel at about 2.2 : 1 (side by side from 900px,
stacked below), the panel holding fill and rank; value above replacement Σ (DPM + 2) × minutes ÷ 48;
box-weighted ease of fit and rank; share of the box by style with a tick at the five fullest
rosters' average, styles under 2% flagged "Lacks"; a compact player table; what the white space is
worth; players not drawn. "Season by season" sits under the box: the franchise's actual fill each
season from `/roster-shapes/history` plus the projection.

Hover is linked and lives only in team view: hovering or focusing a shape outlines it, fades the
other shapes and highlights its table row, with a card (headshot, DPM, minutes, box share, style,
fit) beside the pointer; hovering a table row highlights its shape without the card. The league
grid and the Since-last-season boxes have no hover state beyond the native tooltip.

## Serving

`GET /api/workbench/roster-shapes` (`season`, `datasetId`, `releaseId`) returns 30 teams with
fills, both sizes per player and the method constants; 422 for other seasons, 503 without the
archetype manifest or DARKO bundle. Responses are cached per (season, index, release, DARKO seal).
`GET /api/workbench/roster-shapes/history` (`releaseId`) returns every franchise's fill for each
regular season with a sealed DARKO snapshot (2000-01 → 2025-26), keyed by current franchise id.
`/roster-shapes/{TEAM}` redirects to `/roster-shapes?team=TEAM`; `?view=depth` opens the team
profile, whose Depth Chart section is the FO05 allocation view.
