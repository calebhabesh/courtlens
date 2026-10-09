# FO05 Roster Shapes prototype: evidence

Measured 2026-10-09 on branch `frontend-overhaul`. Parent: [frontend overhaul handoff](../../frontend-overhaul-plan.md).
Screens, measurements and the export check: `node scripts/capture_fo05_evidence.cjs` (`measurements.json`,
`screens/`, `export-sample.json`), run against `localhost:3100` and the real API on `localhost:8000`
(Boston Celtics, 2025-26 Regular Season, through Apr 12, 2026, 21 players).

## What was built (D17, D18, Board template)

| Plan item | Implementation |
| --- | --- |
| Title row | `PageHeader` "Roster Shapes" (matches the nav label; was "Roster allocation diagrams"), one subtitle line; **Change team** and **Export JSON** on the title row once a team is chosen |
| Filter bar | The shared `ContextBar` (Season · Phase · Through, no Window) with an **Observed / Projected** segmented control on the right and a "21 players" count chip. The old form, "Release ID (optional)" input and "Load participation" button are gone: the team loads as soon as it is chosen and on every scope change |
| Team picker | `components/team-grid.tsx`: 30 logo tiles from `lib/team-branding.json` (logo, tricode, name, team-color underline) plus a name/tricode filter. Shown inline until a team is chosen, then in a "Choose a team" modal (6 × 5, no scrolling at 1440). The choice is in the URL (`?team=1610612738`), so links and reloads keep it |
| Team header | `TeamIdentity` with the logo, name, record and player count on a team-color band |
| Depth chart | The **Unassigned** pool spans the board (every player starts there); **PG · SG · SF · PF · C** are five equal columns below (280px pitch at 1440). Each lane shows player count, minutes, share % and a share bar (`role="meter"`). Chips: headshot, name, observed minutes and games |
| Moving chips | Drag and drop between any lanes, **and** a per-chip menu ("Move to PG · Point guard" …) that works by keyboard; focus follows the chip to its new lane. The collapsed table offers a third way (position select per player) |
| Projected mode | Each chip gets a minutes-per-game field (blank = unknown, shown as "—"; meta switches to observed minutes per game). The header shows a **240 gauge**: amber under, red over, green at exactly 240, with "35.0 under · 13 blank" |
| Caveats | One line: "Positions are your assignments. Drag players into a lane, or use each player's menu." Every former caveat sits behind **Why?** (D14), including "Missing participation is not a confirmed zero or roster exclusion." |
| Data details | Release, cutoff rule, roster source, `/api/workbench/teams/{id}` route, the API's source warnings and the resolved context JSON (formerly an inline `<details>` and two notice boxes in the main flow) |
| Table | "All players (21)" accordion, collapsed by default: player link, games, observed minutes, position select, projected minutes. Names only, no headshots (D10 dense table) |
| States | `loading.tsx` renders the Board skeleton; while a team loads, the pool and lanes render as skeletons; empty scope: "No minutes for Boston Celtics in this scope." + Change team; error: one line + Retry |

### Export compatibility (`roster-minute-allocation-v1`)

`lib/roster-allocation.ts` builds the export with the old page's key order and values: the same
filename (`courtlens-roster-allocation.json`), allocations in API order (not lane order) and
`allocation_minutes` = observed total, a parsed projection, or `null` for a blank.

- **Unit test** (`lib/roster-allocation.test.ts`): our JSON string equals the old inline formula's,
  copied verbatim, in both modes.
- **Real data** (capture script): the downloaded file (7,190 bytes, 8 players placed incl. one by
  drag, 8 projections, 13 blank) is **byte-identical** to the old formula applied to the same API
  response (`measurements.json → export.byteIdenticalToLegacyFormula: true`).

## Measurements (`measurements.json`)

| Check | 1440×900 | 390×844 |
| --- | --- | --- |
| Board top (glance item 3: ≤ 400px at 1440) | 375 px | 499 px (stacked) |
| Picker top (no team chosen) | 227 px, 30 tiles | 223 px, 30 tiles |
| Lane columns (left edges) | 24 · 304 · 584 · 864 · 1144 (equal 280px pitch) | single column, all at 12 |
| Chip height / headshots | 48 px / 21 of 21 | 48 px / 21 of 21 |
| Chip menu target | 28 px (pointer) | 40 px |
| Filter bar controls | 40 px ×5 | 40 px ×2 (Filters, Data details) |
| Header: subtitle lines / actions on title row | 1 / yes | 1 / wraps below title |
| Notes in main flow | 1 (one line + Why?) | 1 |
| Sideways scroll, glyphs, code-like rules or UUIDs in main flow, Load buttons, Release ID inputs | none | none |
| Drag Jordan Walsh → SG | moved | n/a (touch uses the menu) |
| Gauge at 205 / 245 projected minutes | `is-under` / `is-over` | `is-under` |
| Why? body contains `game_date`/`before_date` | no (source warnings moved to Data details) | |
| Page errors | 0 | 0 |

## Glance test

| Item | 1440 | 390 |
| --- | --- | --- |
| 1 Header | Pass | Pass (actions wrap under the title by design) |
| 2 Filters | Pass (no Load button; 40px controls; Observed/Projected selected state visible) | Pass (collapses to Filters; mode inside the sheet) |
| 3 First screen | Pass (board at 375px; only a one-line note before it) | Pass |
| 4 Alignment | Pass (equal lane pitch; share/gauge numbers tabular; table numbers right-aligned) | Pass |
| 5 Identity | Pass (logo in header, grid and modal; headshot on every chip; dense table uses names) | Pass |
| 6 Missing data | Pass (blank projections stay "—" and are counted, never 0; caveats behind Why?; IDs and rules only in Data details) | Pass |
| 7 Icons | Pass | Pass |
| 8 States | Pass (Board skeleton, lane skeletons, one-line empty state with action, one-line error with Retry) | Pass |
| 9 Phone | n/a | Pass (no sideways scroll; chip menus and inputs 40px) |
| 10 Dates | Pass ("Apr 12, 2026") | Pass |

## Changes outside the page

1. `ContextBar` takes `detailRows` so a page can add its own rows (source route, resolved context)
   to Data details.
2. `pages.css`: the old `.allocation-row` rules are replaced by the `roster-*` and `team-grid-*`
   rules.

## Checks

| Check | Result |
| --- | --- |
| `npm --prefix dashboard run lint` | 0 errors, 0 warnings |
| `npm --prefix dashboard run typecheck` | pass |
| `npm --prefix dashboard test` | 49 files, 337 tests pass (4 new: byte-compatible export in both modes, blank ≠ zero, lane shares and invalid input, 240 gauge precision) |
| Playwright, all 254 tests, serial, production build of an isolated copy | **239 pass, 15 skipped, 0 fail**. 4 new in `e2e/roster-shapes.spec.ts`: logo grid + filter + no form; drag and keyboard menu with focus kept; projected gauge under/over/full, invalid input blocks export, export key order and byte layout; phone layout and 40px targets. `advanced-research.spec.ts` roster test rewritten for the no-form flow |
| After the suite | Source warnings moved from Why? to Data details and the modal grid set to 6 columns; lint, typecheck and Vitest re-ran green; roster, advanced-research and showcase specs re-ran 13/13 on a fresh build; evidence re-captured |

## Known limits

- Drag and drop is HTML5 (mouse/trackpad). On touch screens chips move through their menu or the
  table, as the on-page line says.
- Assignments and projections live in page state: they survive scope changes for the same team but
  reset when the team changes or the page reloads. They are not saved to the workspace.
- At 390 the Observed/Projected control sits inside the Filters sheet with the scope controls.
- The API and dashboard dev servers stopped once mid-session (not caused by this work) and were
  restarted with `make dev`'s uvicorn command and `next dev -p 3100`.

## Owner review gate 2

Review Showcase, Roster Shapes and search together at both widths (D24). Live pages:
`localhost:3100/showcase`, `localhost:3100/roster-shapes`, and ⌘K or the header search pill.

| Surface | 1440 | 390 |
| --- | --- | --- |
| Player Showcase | [card](../fo04/screens/showcase-1440.png), [Scoring focus](../fo04/screens/showcase-scoring-1440.png) | [card](../fo04/screens/showcase-390.png) |
| Roster Shapes: team picker | [grid](screens/picker-1440.png), [Change team modal](screens/change-team-1440.png) | [grid](screens/picker-390.png) |
| Roster Shapes: depth chart | [observed](screens/observed-1440.png), [assigned](screens/assigned-1440.png), [projected + gauge](screens/projected-1440.png) | [observed](screens/observed-390.png), [assigned](screens/assigned-390.png), [projected](screens/projected-390.png), [Filters sheet](screens/filters-sheet-390.png) |
| Roster Shapes: detail | [Why?](screens/why-1440.png), [Data details](screens/data-details-1440.png), [empty scope](screens/empty-1440.png) | |
| Search | [player results](../fo02/screens/search-player-1440.png), [team results](../fo02/screens/search-team-1440.png), [recent](../fo02/screens/search-empty-recent-1440.png) | [player results](../fo02/screens/search-player-390.png) |

Questions for the owner:

1. **Depth-chart shape:** the Unassigned pool spans the top with five position columns below. The
   alternative is a right-rail pool beside five lanes; that left large empty areas with 21 players.
2. **Projected mode on phones:** Observed/Projected sits inside the Filters sheet with the scope
   controls. It could instead stay visible above the board.
3. **Persistence:** assignments reset on reload or team change. Saving them to the workspace would be
   a later block.
