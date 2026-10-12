# PC10 Roster Shapes (gate G4)

Parent: [presentation clarity PC10](../../presentation-clarity-plan.md#pc10-roster-shapes-gate-g4).
Contract: [Roster Shapes v1](../../design/roster-shapes-v1.md).
**PC10 is implemented and stops at G4 for owner approval.** PC11 has not started.

## What changed

- **Archetype names confirmed** (owner, 2026-10-11): Lead creator, Spacing wing, Two-way
  connector, Stretch big, Interior hub, Rim runner.
  [archetype-names-v1.json](../../design/archetype-names-v1.json) is `confirmed`; the fit is
  unchanged (archetypes `91a5a7d3…`). The new serving manifest `5caeb935…` differs from
  `765d55f1…` only in the names status and review note
  ([compressed copy](artifacts/)); `config.py` and `docker-compose.yml` point to it.
- **`/roster-shapes` (first load, no parameters):** resolves the latest 2026-27 NBA player index
  and writes it to the URL (`?index=`). KPI tiles, one shared legend, Fullest / Best fit / A–Z
  (`?sort=`), then 30 team cards. Each card is a compact `ShapeGlyph` with a team-color top
  border (C9), its Fullest rank, value total, returning share and unknown count.
- **`/roster-shapes/[team]`:** header with team switcher and All teams, hero with tiles (value
  over replacement with rank of 30, returning share, players drawn, unknown), tabs
  **Shape** and **Depth chart**. Shape: a large `ShapePack` beside the legend, then a roster table
  (position, archetype with top two memberships, BPR, 2025-26 minutes, value over replacement,
  fit with the previous team for new arrivals).
- **Depth chart tab** (`?view=depth`): the unchanged FO05 allocation view, embedded without its
  own header and team picker. Old `/roster-shapes?team=…` links redirect there.
- **Backend:** read-only `GET /api/workbench/roster-shapes` (`services/roster_shapes.py`).
- **Chart kit:** `ShapeGlyph` (legend-free small multiple) and two opt-in `ShapePack` props
  (`fitLabels`, `listItems`). Existing `ShapePack` output is unchanged by default.
- **Methodology:** a Roster Shapes paragraph with the formula and the @taylormetrics credit.

## Definitions (see the contract)

- Size = value over replacement = (BPR + 2.0) × share of a full season's 2025-26 minutes.
- Color = primary derived archetype. Outline = **continuity**: returning, new arrival, or no
  2025-26 sample. White space = gap to the fullest roster.
- Unknown players (no BPR or no 2025-26 minutes) are listed with reasons and never drawn.
  Below-replacement players are known values with no area.

## Real-data results ([response](roster-shapes.json))

Index `027dff96…` (observed 2026-10-11), release `5bbb6035…`. 622 active players: 324 drawn,
159 below replacement, 139 unknown (mostly rookies and two-way players). Fit: 340 returning,
141 new arrivals, 141 with no 2025-26 sample.

| Fullest | Value | Returning share |
| --- | --- | --- |
| OKC | 21.3 | 100% |
| SAS | 21.3 | 90% |
| HOU | 20.1 | 79% |
| BOS | 19.5 | 81% |
| DET | 18.7 | 79% |

Lowest: SAC 4.1, WAS 5.0, DAL 5.5. DEN: 18.3 (6th); Jokić is the largest circle (BPR +10.3,
2,265 minutes, VOR 7.1, Interior hub).

[Read-only check](read-only-check.json): 161 publication pointers and 1,031 identities, the same
counts as PC08/PC09; PC10 adds only GET handlers. Five sequential local requests: 348–445 ms,
336 KB (all 30 rosters in one response). Single-machine measurements, not p95 claims.

## Extended glance test

Owner dev server with the real API, no URL parameters, 1440×900 and 390×844
([screenshots](screenshots/), [measurements](measurements.json)). P = pass, ~ = partial,
- = not applicable. Items 1–10 are the overhaul test; 11–14 are the clarity additions.

| Route | Score | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `/roster-shapes` | 9/13 | P | - | ~ | ~ | P | P | P | ~ | P | P | P | P | P | ~ |
| `/roster-shapes/[team]` | 9/13 | P | - | ~ | ~ | ~ | P | P | ~ | P | P | P | P | P | P |

The old picker opened on a logo grid with no data (PC02 audit: fail on first load). Notes:

- **3:** tiles at 154px; the grid starts at 468px on desktop (legend and sort row above it).
  Team page: tiles at 258px, diagram at 475px.
- **4:** right-aligned tabular numbers; full-page 4px alignment not measured.
- **5:** team logos on every card and header; the roster table has names without headshots.
- **8:** the loading state is generic skeleton blocks.
- **9:** no page overflow at 390px; no main-area target under 40px on phone. On desktop the
  sort control is 32px and the shared Data details button 28px.
- **14:** on the grid, source and sample sit in a line below the cards; on the team page they
  are in the chart frame.

## Checks

- Python: 9 new tests (`tests/unit/test_roster_shapes.py`). Full suite via
  `scripts/test_python.py`: 2,007 passed, 1 existing browser-prerequisite skip, 19
  published-data deselections. Ruff, format and strict mypy clean.
- Dashboard: lint 0/0, typecheck clean, Vitest 61 files / 422 tests passed (new
  `lib/roster-shapes.test.ts`, `ShapeGlyph` test).
- Playwright on an external production build (`e2e/mock-api.mjs` on 4100, dashboard on 3410;
  the owner's dev server holds 3100). `roster-shapes.spec.ts` (7, rewritten for the grid, team
  detail and redirect), `advanced-research`, `contracts` and all 88 visual baselines pass. New
  first-load baselines for `/roster-shapes` and `/roster-shapes/DEN` use the captured real
  response; the depth-chart baselines were regenerated and the obsolete picker baselines deleted.
- Broad run, single worker, 30 spec files (excluding specs that write sealed `docs/evidence`):
  333 passed, 3 skipped, 6 failed. One was the PC10 legend test, since fixed and passing. Three
  (`chart-kit.spec.ts:74`, `entity-selection.spec.ts:64`, `:70`) are the failures recorded at PC08.
  `native-select-theme.spec.ts:16` (Stats analysis-window popup) passes on HEAD and fails on HEAD
  plus the owner's uncommitted Stats explorer changes, without PC10. `entity-selection.spec.ts:56`
  (WOWY) passed 3/3 in isolation on both builds; it depends on shared mock state.
