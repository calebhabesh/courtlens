# UC04 batch 3 (Players and player profile) evidence

Captured 2026-10-14 against fixture builds on the fixture API (4180) in a disk-backed sandbox:
`before` is commit `ee2a8af` (batch 2), `after` is the working tree, both served on 3180.
Chromium, dark theme, reduced motion, at 1440×900 and 390×844 (touch).

- [`measure-players.mjs`](measure-players.mjs) measures every control in `main`, drawers and
  dialogs on 10 states: the Players directory (and its Rules disclosure), the fixture-snapshot
  player search, the player profile (opened directly, opened from Stats with Back to table, the
  Game Log tab and the Lineage drawer), the fixture replay profile, its error page, and Teams
  (shares the percentile legend). Every state reports zero page errors and zero horizontal overflow.
- [`before.json`](before.json), [`after.json`](after.json) and [`control-diff.txt`](control-diff.txt)
  (from [`../uc04-stats/diff-controls.mjs`](../uc04-stats/diff-controls.mjs)). Teams: 0 changes.
- No control above the career table moves vertically. On phone the career table starts 20 px higher
  because Counting Mode fits one line (the D6 rule).

| Image | Shows |
| --- | --- |
| [cmp-header-1440.png](cmp-header-1440.png) | Back to table and the profile actions (favourite, compare, Export, Explore) |
| [cmp-career-1440.png](cmp-career-1440.png) | Career views, Counting Mode and Phase |
| [cmp-career-390.png](cmp-career-390.png) | Career views on phone |
| [cmp-game-log-1440.png](cmp-game-log-1440.png) | Game log Per Game / Per 36 Min |
| [cmp-directory-1440.png](cmp-directory-1440.png) | Directory filter bar Search |
| [cmp-fixture-search-1440.png](cmp-fixture-search-1440.png) | Fixture-snapshot player search |
