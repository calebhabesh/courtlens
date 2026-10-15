# DPOY label, trend title and Stats search focus

Owner instructions, 2026-10-15.

- **60. DPOY.** Basketball-Reference's honours list says "Def. POY". CourtLens passed that text
  through unchanged. The honour label tidier now writes "DPOY", for example "2× DPOY".
- **61. Trend dialog.** The chart title is title case ("PTS Progression"). The hairlines above the
  chart (under the toolbar) and below it (above the players) are removed. The definition footer
  keeps its separator.
- **62. Stats table search.** Focusing the search used to draw the gold border and then the
  shared offset focus ring, which looked like a double outline. Stats' single-ring override sat
  in the `pages` layer, so the `foundation` layer beat it. The override now lives in `foundation`.
  The focused search shows one solid 2px gold outline (1px border plus a flush 1px ring).

A production sandbox build read retained local data through a read-only proxy. It showed
Kawhi Leonard's honours with 0 "Def. POY" and one "2× DPOY". The trend dialog, opened from a
career cell, renders "GP Progression". The focused search measures an accent border and a
`0 0 0 1px` accent shadow at 1440 and 390. There were no page errors.

| View | Desktop | Phone |
| --- | --- | --- |
| Honours | [1440](honours-1440.png) | [390](honours-390.png) |
| Trend dialog | [1440](trend-1440.png) | [390](trend-390.png) |
| Focused table search | [1440](search-1440.png) | [390](search-390.png) |

Dashboard lint and typecheck pass, along with all 527 Vitest tests and 58 Playwright checks
(player-career, pc12-headlines, stats-followups, stats-readability-search, fo14-accessibility).
Owner alignment is still pending.
