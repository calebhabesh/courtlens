# UC04 batch 2 (app shell) evidence

Captured 2026-10-14 against fixture builds: `before` is commit `7abe527` (batch 1) on port 3181,
`after` is the working tree on 3180, both on the fixture API (4180) in disk-backed sandboxes.
Chromium, dark theme, reduced motion, at 1440×900, 1024×900 (the header's drawer range) and
390×844 (touch).

- [`measure-shell.mjs`](measure-shell.mjs) measures every control in the header, filter bar,
  page header, popovers, menus and drawers on 15 pages and states (Stats with the season popover,
  date picker, phone filter sheet, More menu and navigation drawer; Players, a player, Compare,
  Teams, a team, Recent Games, Playoffs, Showcase, Live, Trends, RAPM). Every state reports zero
  page errors and zero horizontal overflow. The multi-season state is not measured: the fixture
  has one season, so Multi-season is disabled.
- [`before.json`](before.json), [`after.json`](after.json) and [`control-diff.txt`](control-diff.txt)
  (from [`../uc04-stats/diff-controls.mjs`](../uc04-stats/diff-controls.mjs)).
- No control moves vertically except the header Ask button at 1024 px (40 → 32 px tall).

| Image | Shows |
| --- | --- |
| [header-scope-1440.png](header-scope-1440.png) | Header and the Stats scope row |
| [header-scope-1024.png](header-scope-1024.png) | Header in the drawer range |
| [season-popover-1440.png](season-popover-1440.png) | Season trigger and popover |
| [filter-sheet-390.png](filter-sheet-390.png) | Phone filter sheet |
| [more-menu-1440.png](more-menu-1440.png) | Header More menu |
