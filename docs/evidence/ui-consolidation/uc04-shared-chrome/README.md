# UC04 batch 6a (shared page chrome) evidence

Captured 2026-10-14 against fixture builds on the fixture API (4180) in a disk-backed sandbox:
`before` is commit `3d49056` (batch 5), `after` is the working tree, both served on 3180.

- Shared components render on every route, so all five earlier measurement scripts ran before and
  after ([Stats](../uc04-stats/measure-stats.mjs), [shell](../uc04-shell/measure-shell.mjs),
  [players](../uc04-players/measure-players.mjs), [catalogued pages](../uc04-pages/measure-pages.mjs),
  [CourtLens-only pages](../uc04-courtlens/measure-courtlens.mjs)): 196 states at 1440, 1024 and
  390 px, zero page errors and zero horizontal overflow in both runs.
  [`control-diff.txt`](control-diff.txt) holds all five diffs.
- [`filter-bar-wrap-probe.mjs`](filter-bar-wrap-probe.mjs) measured the 1024 px filter bars with the
  Data details padding and type overridden. With the kit's `lg` padding (+15 px) Players, Teams and
  Showcase wrapped a control to a second row (+52 px); only the old 12 px text, 14 px icon and 8 px
  padding fit Teams and Showcase, so Data details stays `xs` outside the Stats console.
- [`playwright.log`](playwright.log): full suite against the after build.

| Image | Shows |
| --- | --- |
| [cmp-rankings-1440.png](cmp-rankings-1440.png) | "Why?" as a kit ghost summary: no dotted underline, weight 600 → 500 |
| [cmp-settings-1440.png](cmp-settings-1440.png) | Settings disclosures ("Configuration details") with the same change |
| [cmp-teams-1024.png](cmp-teams-1024.png) | Teams filter bar at 1024: Data details unchanged at rest, no wrap |
| [cmp-forecasts-1440.png](cmp-forecasts-1440.png) | Data details in a fixed-scope filter bar |
| [cmp-stats-1440.png](cmp-stats-1440.png) | Stats console Data details (`lg dense`, 16 px icon, +2 px) |
| [cmp-stats-390.png](cmp-stats-390.png) | Phone Filters toggle in the Stats console tone |
