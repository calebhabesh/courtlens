# Stats Explorer divider spacing — 2026-10-09

Owner-reported defect: the scope bar's bottom hairline appears to run across Manage Views and
Group guides. On the running local dashboard (`localhost:3100`), measured scope-bar bottom and
preset-row top were both 199px: **0px clearance**. See [before](before-1440.png).

The bounded correction adds `margin-top: var(--space-4)` to the Stats workspace's
`.player-explorer-container`, following Design Language v1.1's spacing-after-the-bar rule.
It does not advance FO13 or any other overhaul block.

## Measured verification

- [Local dashboard after, 1440px](after-1440.png): divider visibly separated from both controls.
- [1440px](fixture-after-1440.png), [2048px](fixture-after-2048.png), and
  [390px](fixture-after-390.png) fixture screenshots with the actual working-tree
  `stats-explorer.css` loaded using Playwright `page.addStyleTag({ path })`.
  The existing production fixture server on `localhost:3101` is an older isolated build;
  explicitly loading the source stylesheet tests this correction without rebuilding that server.
- [Geometry](geometry.json): exactly **16px clearance** at all three widths; document widths
  equal viewport widths. Table starts below 400px on desktop. Manage Views opens and closes;
  Logos becomes selected at every width.
- `npm --prefix dashboard run lint`: exit 0, no errors or warnings.
- `npm --prefix dashboard run typecheck`: exit 0.
- `npm --prefix dashboard test`: 50 files, 344 tests passed.
- Existing `stats-preview.spec.ts` and `stats-readability-search.spec.ts` run against the
  production fixture server: 9 passed initially; the remaining wide-table case passed when
  rerun alone (10 distinct passing cases across these runs). These compatibility checks use
  the fixture build's bundled CSS; the source-stylesheet measurements above verify the fix.
  Chromium crashed in that wide-table case initially, and in two checks on the live dev server.
  No browser assertion concerning the divider failed after the correction.

## Scoped glance test

This is a spacing repair, not full-page overhaul acceptance. Desktop and phone screenshots:

| Item | Result within this repair |
| --- | --- |
| 1 Header | Existing title and header retained; phone subtitle still wraps (outside this repair). |
| 2 Filters | Divider clears preset, Manage Views and Group guides; controls remain usable. |
| 3 First screen | Desktop table starts at approximately 256px, below the 400px limit. |
| 4 Alignment | Exact 16px token gap at all widths; shared left edge retained. |
| 5 Identity | No identity changes; fixture portraits are unavailable in these captures. |
| 6 Missing data | No new data or explanation text. |
| 7 Icons | Existing wrapper icons retained. |
| 8 States | No loading, error or empty-state changes; not separately exercised. |
| 9 Phone | No document overflow at 390px; scope collapses to Filters; both repaired controls work. Existing compact preset/guide target sizes remain outside this repair. |
| 10 Dates | Existing display format retained. |
