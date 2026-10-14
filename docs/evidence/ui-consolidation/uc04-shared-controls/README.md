# UC04 batches 6b and 6c (shared form triggers, menus, legacy removal) evidence

Captured 2026-10-14 against fixture builds on the fixture API (4180) in a disk-backed sandbox:
`before` is commit `ef80339` (batch 6a), `after` is the working tree, both served on 3180.

- All five measurement scripts ran before and after (196 states at 1440, 1024 and 390 px; zero
  page errors and zero horizontal overflow after). [`control-diff.txt`](control-diff.txt) holds the
  five diffs. The shell script's Filters-sheet state used the class 6a removed, so it failed in the
  before run; its locator is fixed and [after-stats-filter-sheet-390.png](after-stats-filter-sheet-390.png)
  shows the sheet after (full-width date trigger and select in the Stats console tone).
- [`playwright.log`](playwright.log): full suite against the after build.

| Image | Shows |
| --- | --- |
| [cmp-teams-1440.png](cmp-teams-1440.png) | Filter-bar selects and date trigger (kit `Select lg`, `Button lg`; date weight 400 → 500) |
| [cmp-stats-season-1440.png](cmp-stats-season-1440.png) | Season popover: kit `Segmented sm stretch`, console-tone select |
| [cmp-compare-1440.png](cmp-compare-1440.png) | Compare "More": bare text → `MenuTrigger lg` |
| [cmp-data-status-1440.png](cmp-data-status-1440.png) | Data Status "More jobs" → `MenuTrigger xs` |
