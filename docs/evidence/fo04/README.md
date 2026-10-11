# FO04 Player Showcase prototype: evidence

Measured 2026-10-09 on branch `frontend-overhaul`. Parent: [frontend overhaul handoff](../../frontend-overhaul-plan.md).
Screens, measurements and export checks: `node scripts/capture_fo04_evidence.cjs` (`measurements.json`,
`screens/`, `export-sample.{png,svg}`), run against `localhost:3100` with real data.

## What was built (D15, D16, Board template)

| Plan item | Implementation |
| --- | --- |
| Title row | `PageHeader` "Player Showcase" (matches the nav label, renamed from "Showcase Cards"), one subtitle line, player search and one **Export** menu (PNG image, SVG file) on the title row |
| Focus | 4-option segmented control (Overall · Scoring · Playmaking & Defense · Per 36) in the filter bar under the title, 40px like the scope controls |
| Card | `components/showcase-card.tsx`: an SVG card with a large headshot, team logo, team-color accent (`teamAccent`, current team = last observed stint), 6 stat tiles each with value, rank pill ("1st") and percentile bar ("99th pct"), and one context line: "2025-26 Regular Season · Through Apr 12, 2026". The old card's `game_date <` rule, "Strictly historical replay" and "VERIFIED RECORD" lines are gone (D5, D20) |
| Playback | Previous · Play · Next and "n / N" centered directly under the card; ←/→ and Space work unless focus is in a control that uses those keys |
| Right rail | `PlayerIdentity` (headshot, logo badge, team accent), icon buttons with tooltips: Favorite, Compare tray, Recent games, Player profile, Compare head to head; roster list with small headshots and team logos |
| Exports | Same SVG as on screen. Images are inlined as data URLs before export (an SVG rendered through `<img>` cannot load external images); the SVG has no CSS variables. The PNG keeps the shared export header with context banner |
| Loading / empty | `app/showcase/loading.tsx` renders the Board template skeleton; empty state is one line with an "Open Stats" action |

### Percentiles and ranks (no new formula)

- **Percentiles:** the page runs the Stats query (`resolveStatsQuery` + `executeWorkbenchQuery` with
  `presentation: { player_ids: null }`), so percentiles are the API's cohort midrank values for the
  same 591-player eligible cohort as Stats. A "low is good" metric (turnovers) is shown as
  `100 − p`, the orientation Stats already used for highlighting; it is now one shared helper
  (`lib/percentile-display.ts`) used by both pages.
- **Ranks:** read from the server's own ordering. For each shown metric the client asks the same
  query sorted best-first (top 100); rank = 1 + number of strictly better values, so ties share a
  rank. Players outside the top 100 show the percentile without a rank, as the footnote says.
- **Window:** the page has no Window control (D6), so it pins `window = season`; a window inherited
  from another page's URL can no longer change the cohort silently.
- **Deep link:** `?playerId=` now selects that player. A player outside the top-25 roster is
  fetched with `presentation.player_ids` (which does not redefine the cohort) and added. Before,
  the old page ignored the parameter and always showed the first player.

## Measurements (`measurements.json`)

| Check | 1440×900 | 390×844 |
| --- | --- | --- |
| Card center vs board column center | 0 px | 0 px |
| Playback group center vs card center | 0 px | 0 px |
| Card top (first screen ≤ 400px) | 227 px | 259 px |
| Card width (scales with viewport height, min 420) | 480 px | 366 px |
| Card and playback visible without scrolling | yes | n/a (stacked) |
| Filter bar controls | 40 px ×5 (Season, Phase, Through, Focus, Data details) | 40 px (Filters, Data details) |
| Header: subtitle lines / actions on title row | 1 / yes | 1 / wraps below title |
| Sideways scroll, glyphs, code-like rules, Load buttons | none | none |
| Keyboard ArrowRight | 1 / 25 → 2 / 25 | |
| Deep link `?playerId=1628401` | selects Derrick White (outside top 25) | |

Exports (Scoring focus): PNG with valid signature (245,648 bytes); SVG 250,409 bytes with the
context line, 2 inlined images, 0 external images, no `var(--`.

## Glance test

| Item | 1440 | 390 |
| --- | --- | --- |
| 1 Header | Pass | Pass (actions wrap under the title by design) |
| 2 Filters | Pass | Pass (collapses to Filters) |
| 3 First screen | Pass (card at 227px; no notice or multi-line paragraph before it) | Pass |
| 4 Alignment | Pass (card and playback centered ±0px) | Pass |
| 5 Identity | Pass (headshots on card, rail and roster; logos on card, badge and roster) | Pass |
| 6 Missing data | Pass (em dash for unknown values; no code-like rules) | Pass |
| 7 Icons | Pass | Pass |
| 8 States | Pass (Board skeleton; one-line empty state with action) | Pass |
| 9 Phone | n/a | Pass (no sideways scroll; touch targets 40px) |
| 10 Dates | Pass ("Through Apr 12, 2026") | Pass |

## Shared fixes made while building

1. **Menus stayed open after choosing an item.** `components/ui/menu.tsx` now closes the menu and
   returns focus to the trigger when a menu item is chosen (new unit test).
2. **Page header actions wrapped under each other.** The `foundation` layer set `flex-wrap: wrap`
   on `.ui-page-header-actions`, which page CSS cannot override (layer order). Actions now stay on
   the title row (D7) and wrap only below 768px.
3. **Segmented controls in the filter bar** are now 40px tall like the other filter controls.
4. **Export of cross-origin images.** Inlining fetches with `cache: "no-store"`: the on-screen
   `<image>` had cached the portrait from a no-CORS load, and reusing that entry failed the CORS
   check, which silently dropped the headshot from the export.
5. The mock API (`e2e/mock-api.mjs`) now answers CORS preflight requests, as the real API does,
   so browser-side JSON POSTs (rank queries) work in e2e.

## Checks

| Check | Result |
| --- | --- |
| `npm --prefix dashboard run lint` | 0 errors, 0 warnings |
| `npm --prefix dashboard run typecheck` | pass |
| `npm --prefix dashboard test` | 48 files, 333 tests pass (6 new: orientation, favorable rule, ranks with ties, context line, card content, menu closes) |
| Playwright, all 250 tests, serial, production build of an isolated copy | **235 pass, 15 skipped, 0 fail** (3 new in `e2e/showcase.spec.ts`: centering ±2px, ranks/percentiles, playback, Focus, SVG export, deep link, phone layout and 40px touch targets) |
| After the suite | Nav label renamed to "Player Showcase" and `loading.tsx` added (no test asserts the old label); lint, typecheck and Vitest re-ran green; evidence re-measured |

## Known limits

- Ranks cover the top 100 per metric. Low-minute players with extreme shooting percentages fill
  the top of FG%/3P%/FT% in this cohort, so most rotation players show a percentile but no rank
  for those stats.
- The PNG export keeps the shared export header and footer (context banner, cutoff rule), which
  other pages also use. The card itself, which is what the on-screen SVG and the SVG export
  contain, has only the D16 context line.
