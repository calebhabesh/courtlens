# UC04 batch 4 (catalogued pages) evidence

Captured 2026-10-14 against fixture builds on the fixture API (4180): `before` is commit
`300a83c` (batch 3) on 3181 from a git worktree, `after` is the working tree on 3180, both in
disk-backed sandboxes. Chromium, dark theme, reduced motion, at 1440×900 and 390×844 (touch).

- [`measure-pages.mjs`](measure-pages.mjs) measures every control in `main`, drawers and dialogs on
  36 states: Compare (empty, a pair, fixture snapshot), Teams, a team, Team Compare, WOWY, Recent
  Games (with and without a player), Live (slate and game), Playoffs, two series pages, Showcase,
  Rankings (example, New board dialog, personal boards with the aggregator open), Tier List
  (example, personal lists), Roster Shapes (index and BOS), Stat Line Shift, Contracts (team and
  Books), Matchups, Similar Players, Shot Profile, Aftermath, RAPM, Shooting, Wingspan, Calculator
  and the player Game Log. Personal boards and tier lists use a mocked workspace (`page.route`),
  as `entity-selection.spec.ts` does, because the fixture API does not persist them. Every state
  reports zero page errors and zero horizontal overflow.
- [`before.json`](before.json), [`after.json`](after.json) and [`control-diff.txt`](control-diff.txt)
  (from [`../uc04-stats/diff-controls.mjs`](../uc04-stats/diff-controls.mjs)). WOWY and Wingspan: 0 changes.

| Image | Shows |
| --- | --- |
| [cmp-compare-1440.png](cmp-compare-1440.png) | Compare suggestions and Swap players (C2, C3) |
| [cmp-compare-presets-1440.png](cmp-compare-presets-1440.png) | Compare presets and counting mode (D20) |
| [cmp-teams-1440.png](cmp-teams-1440.png), [cmp-teams-390.png](cmp-teams-390.png) | Teams header, view switch (C13) and table actions |
| [cmp-last-games-1440.png](cmp-last-games-1440.png) | Recent Games actions, Export trigger and segmented groups |
| [cmp-showcase-1440.png](cmp-showcase-1440.png), [cmp-showcase-390.png](cmp-showcase-390.png) | Showcase Export and rail actions (D23) |
| [cmp-playoffs-1440.png](cmp-playoffs-1440.png) | Playoffs round, conference and view switches (C13) |
| [cmp-rankings-1440.png](cmp-rankings-1440.png) | Rankings aggregator, board tabs and row actions (D24) |
| [cmp-tierlist-1440.png](cmp-tierlist-1440.png) | Tier List tabs, tier row controls and card remove (D24) |
| [cmp-calculator-1440.png](cmp-calculator-1440.png) | Calculator actions (C2) |
| [cmp-contracts-books-1440.png](cmp-contracts-books-1440.png) | Contracts Books actions (C2) |
