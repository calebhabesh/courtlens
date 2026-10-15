# Comparison honors and selectors

Owner instructions 49 through 56, verified on 2026-10-15. The final layout shows every recorded
season honor. Each player's badges wrap within a group centered on that player's numeric column.
Rows hold one or two badges where space permits. There is no overflow count or honors popover.
All-Star badges and all three season-picker icons use the existing gold accent.

The list uses the player bio's season award codes and admitted championship seasons. It preserves
each player's season and cutoff. Voting finishes retain their labels and neutral styling. Wins
and All-Star selections are gold. Career-only honors without a season are not assigned to a year.

The per-player season menus show a medal for MVP, a trophy for an NBA championship, and a star
for All-Star. The menus include a legend and descriptive accessible labels. Search results use
a floating 440px panel, capped to the viewport. Other pages retain their existing lookup widths.

The counting selector uses the shared menu in a fixed 160px slot. Dense kit presets leave room
for its longest label. The phone layout always places counting on its own row and opens the
menu upward. Entries use the shared menu appearance, without native option outlines.

## Live evidence

Production sandbox on port 3180, with a read-only proxy on 4180 to the owner's API. The proxy
allows GET, HEAD, OPTIONS, and only `POST /api/workbench/query`. Screenshots use 1440x900 and
390x900 viewports and include the full page. Menu captures wait for the opening fade to finish.

| View | Desktop | Phone |
| --- | --- | --- |
| Uneven honors across seasons | [1440](mixed-honors-1440.png) | [390](mixed-honors-390.png) |
| Every recorded season honor | [1440](all-honors-1440.png) | [390](all-honors-390.png) |
| Season picker and legend | [1440](season-picker-1440.png) | [390](season-picker-390.png) |
| Full player names in search | [1440](player-search-1440.png) | [390](player-search-390.png) |
| Counting menu | [1440](counting-menu-1440.png) | [390](counting-menu-390.png) |
| Career selected | [1440](career-mode-1440.png) | [390](career-mode-390.png) |

[Measurements](measurements.json) include row centers, search bounds, menu coordinates, colors,
and page errors. The counting trigger remains at x=825, y=513, width=160 on desktop and x=115,
y=629, width=160 on phone when changing from Per Game to Career. Horizontal page overflow and
page errors are zero. Search results are 440px and 374px wide, respectively, with the full name
"Giannis Antetokounmpo" visible. Both SVG exports include every honor and resolved colors.
[The rendered export](honors-export-preview.png) was inspected for clipping and badge placement.

[The previous native selector](counting-before.json) grew from 99.64px to 153.02px. Its 388.45px
preset group plus the longer selector and 8px gap exceeded the available 530px and caused a wrap.

## Checks

- Dashboard lint and typecheck pass with zero errors or warnings.
- Vitest passes 544 tests in 84 files. The existing read-only input warning in
  `components/ui/primitives.test.tsx` remains unrelated to this change.
- Affected browser specs pass 45 tests. The console season override test skips because the mock
  catalog has one season. Live per-player and cross-season captures use the real catalog.
- Eight visual checks pass against existing baselines. These cover Compare's explicit and
  default pairs, Stats, and the player profile at both widths. No baseline images changed.
- The production webpack build passes. Python files and backend contracts are unchanged.

The raw logs are [Vitest](vitest.log), [browser](browser.log), [visual checks](visual.log), and
[build](build.log). The live assertions and captures are reproducible with [verify.cjs](verify.cjs)
against the sandbox described in the [alignment handoff](../../../../databallr-alignment-plan.md):

```bash
cd dashboard
COURTLENS_VERIFY_BASE_URL=http://127.0.0.1:3180 node ../docs/evidence/alignment/compare/season-honors/verify.cjs
```

## Scoped glance test

| Check | Result |
| --- | --- |
| Header | Pass. Approved title, subtitle, and console action placement retained. |
| Filters | Pass. One console, kit controls, visible selections, and no clipped labels. |
| First screen | Pass. The card starts at 214px on desktop and 266px on phone. |
| Alignment | Pass. Badge groups and wrapped rows center on the metric columns within 0.5px. |
| Identity | Pass. Season portraits, team logos, names, and season choices remain visible. |
| Missing data | Pass. Unknown honors show an em dash; pending awards keep one explanatory line. |
| Icons | Pass. Wrapper Lucide icons, a readable legend, and descriptive accessible labels. |
| States | Pass. Existing lookup empty, failure, retry, selection, and paths with an unknown source pass. |
| Phone | Pass. No horizontal page scroll, full names fit, and controls keep their kit touch sizes. |
| Dates | Pass. Existing Through date format and per-player cutoff rules are retained. |

Instructions 49 through 56 are ready for owner review. Only the owner marks the page aligned.
The older instruction 48 remains pending.
