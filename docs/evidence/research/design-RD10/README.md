# RD10 Metric Backtest: design evidence

Research → Metric Backtest (`/research/backtest`), rebuilt from approved CourtLens Research patterns. Instructions and status:
[research design catalog, RD10](../../../research-design-catalog.md#rd10-metric-backtest--). How the analysis was built and what its
numbers mean: [R08](../r08/README.md).

## Reference

None. There is no Databallr page for it, so each section borrows a named, approved CourtLens precedent (below). databallr.com and draftballr.com were not fetched.

Before the rebuild (:3100, read 2026-11-09): ten stacked sections under the old header and four stat tiles, old `Table`s, an overlaid RMSE chart, hashes and a seed in the page body. 5,644 px tall at 1440 and 9,475 px at 390, 0 console errors, 0 page overflow. Those measurements are in the catalog; the before screenshots were not kept.

## Round 1 (owner, 2026-11-09)

"Go with your recommendations and suggestions for optimal construction and layout of this page. Build it comprehensively." The proposal and its four recommendations are recorded with the instruction in the catalog.

**Built**

| Section | What it shows | Borrowed from |
| --- | --- | --- |
| Hero | `sq-hero research-hero`, one line, the meta line (games, seasons, metrics), links to RAPM Ratings, Projected Impact, Learning | RD00 to RD08; RD07's meta line |
| Which metric predicts games best? | One sentence, the error and its gain over Team net with the interval, the two unranked pairs, and that this tests ratings, not forecasts | RD08 headline line |
| Head to head | A 9×9 compact `StatsGrid` of all 36 RMSE gains, both directions, each with its 95% interval; green/red only where it excludes zero; its own colour key | RD04 `GridValue tone`, RD08 ranges |
| Every score, against one metric | The paired table on `StatsGrid`, Against and Seasons selects; one sentence when every row has the same verdict, the column when they differ | RD08 round 4 |
| Season by season | One line with a 95% band: a chosen metric's gain over a chosen reference, with zero on the axis; then RMSE by season | RD06, RD08 `SeasonLineChart` |
| Scores, each over its own seasons | Pooled grid, no sort, a line saying why rows mustn't be compared; calibration plot of the chosen metric against Team net, its bins on `StatsGrid` beside it, ending level | RD08 grids, RD04 `ReliabilityPlot`, RD08 round 5 |
| 2026-27 | Prospective first, hindsight apart and labelled | RD08 |
| How to read | Three cards and a `Glossary` of scores, the nine metrics and DARKO's omission | RD05, RD08 |
| About this page | Collapsed: caveats, method, rule, hashes, the R08 evidence link | RD06, RD07, RD08 |

- **Shared additions.** `SeasonLineChart` gained an optional `zero` (keeps zero on the axis and marks it). `ReliabilityPlot` gained optional `tones`, `outcome` and `unit`, so win probabilities in category tints don't read as a gold/blue sign or as "make probability"; without them both behave as before.
- **Rows stay in registered order**, Team net first. A pooled row covers its own seasons, so the page never ranks metrics itself.
- **Served text.** The API's notes for Projected Impact say "R07's frozen model" and "(R07)", a project code; the page shows "the frozen Projected Impact model" and drops the code. The API is unchanged.
- **Team net's Minutes replaced** shows a dash: it is served as 0 and the baseline rates no players.
- **Nothing else moved.** No API, analysis or frozen result changed.

**Page size.** 6,799 px at 1440 with About collapsed (was 5,644) and 8,988 px at 390 (was 9,475): the desktop page is longer because the 9×9, the calibration plot and its bins are new, and the metric notes are now cards.

**Open, for the owner.** The served 2026-27 summary was written Nov 5, 2026 and stops at Nov 4, so the page shows 0 prospective games and 120 hindsight. R08's timer was never installed; the page moves only after `courtlens refresh-metric-backtest`, which was not run.

**Checks**

| Check | Result |
| --- | --- |
| Lint (ESLint, Stylelint), typecheck | clean |
| Vitest | 837 passed (2 new: the zero line, the plot's own wording and tones) |
| `r08-metric-backtest` ×3 (rewritten for the layout) | 24/24 |
| Full Playwright (sandbox, mock API, 2 workers, 8 GiB cap) | 609 passed, 17 skipped, 0 failed. The known Projected Impact flake did not appear |
| Real data ([`real-data-check.json`](real-data-check.json), [`real-check.mjs`](real-check.mjs), proxy [`readonly-proxy.mjs`](readonly-proxy.mjs), GET only) | 29,440 values (25,859 at 1440 over 180 loads; 3,581 at 390 over 13 loads), 0 mismatches, 0 console errors, 0 overflow, 0 broken images |
| Coverage of that check | all 36 pairs both ways; at 1440 every reference with every season, all 72 metric and reference pairs on the line, all eight calibration choices; the pooled, by-season and 2026-27 tables; served notes; hashes |
| Layout and rules | 992 px column; hero icon centred; calibration panel and table end level (0 px); no section hairlines, gold/blue tones, arrow characters, ISO dates, project codes or repository wording on the page; no phone control under 40 px; whole-pixel control heights; axis title clear of the tick labels. No players or teams on this page, so 0 images and 0 logos |

**Found by viewing the screenshots, then fixed and re-verified.** A missing comma in the headline, nested brackets in the unranked-pairs line, "0.0% to 0.0%", a lowercase rule sentence, the phone chart's axis title running into its tick labels (the foundation layer set that text for a tile-sized plot), and the "R07" code above.

**Glance test** (`backtest-top-1440.png`, full pages at both widths, viewed). In five seconds: what the page asks (hero), the answer in one sentence, and the first rows of a green-and-red table saying who beats whom.

**Notes.** Section captures taken by Playwright can show the sticky site header or the Skip to content link across the middle of a tall section; neither is on the page there. Visuals were judged from the sandbox build. Earlier in this round the new CSS file's import was added a moment before the file existed, so the owner's :3100 showed a build error until the import was toggled (no server restart, `app/globals.css` left unchanged).
