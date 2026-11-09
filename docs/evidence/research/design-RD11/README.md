# RD11 Projected Impact: design evidence

Research → Projected Impact (`/research/projected-impact`), rebuilt from approved CourtLens Research patterns. Instructions and status:
[research design catalog, RD11](../../../research-design-catalog.md#rd11-projected-impact--). How the analysis was built and what its
numbers mean: [R07](../r07/README.md).

## Reference

None. There is no Databallr page for it, so each section borrows a named, approved CourtLens precedent (below). databallr.com and draftballr.com were not fetched.

Before the rebuild (:3100, read 2026-11-09): four stat tiles and eight stacked sections, full width with no side gutter, old tables. 4,857 px tall at 1440 and 6,507 px at 390, 0 console errors, 0 page overflow, 0 broken images. Those measurements are in the catalog; the before screenshots were not kept.

## Round 1 (owner, 2026-11-09)

"Go with your recommendations and suggestions for optimal construction and layout of this page. Build it comprehensively." The proposal and its four recommendations are recorded with the instruction in the catalog.

**Built**

| Section | What it shows | Borrowed from |
| --- | --- | --- |
| Hero | `sq-hero research-hero`, one line, the meta line (players, freeze date, 80% intervals), links to RAPM Ratings, Metric Backtest, Learning | RD00 to RD10 |
| Does it beat carrying last season forward? | One sentence and one line; the numbers stay in the grids | RD10 |
| 2026-27 projected RAPM, points per 100 possessions | `StatsGrid`, `GridSearch`, `TeamPicker`, the three-way switch; each value with its 80% interval under it and a bar on one scale for all 661 players; age; last season's RAPM and minutes; `Why` as a row tool | RD08, RD01, RD04 |
| Why a player is projected there | `LookupInput` over the 661 frozen players with a Clear button, a team-tinted card, `PlayerAvatar`, training average + sources = projection, every source and the eight largest inputs, the player under all five ratings | RD05, RD03, RD00 round 6 |
| The test | Pooled / 2024-25 / 2025-26 switch, compact Players and Games grids, gains against both baselines in registered order, the ridge line, rookies and returners against their group's average | RD10 |
| 2026-27, scored each week | Status line, prospective first, hindsight apart and labelled, all five ratings | RD10 |
| The aging curve | Two lines on one axis in `--color-category-3` and `-4`, zero marked, the "ends are thin" line, a statement that neither curve has a served interval | RD06, RD10 |
| Do the intervals hold? | One plain sentence that they ran wide, then the five-row grid | RD08 |
| How to read | Three cards and a collapsed glossary | RD05, RD10 |
| About this page | Collapsed: limits, method, hashes, credit, the R07 evidence link | RD06, RD10 |

- **Faults fixed.** The range bars stopped at −6 while served lows reach −6.99, cutting off 71 of 661 players (36 on rosters); the scale now comes from the served intervals (−7 to +10). Contribution bars were green and red with no interval behind them and are now gold and blue by sign. The aging lines used gold and blue as labels. The copy said the weekly score reports ridge while the table left it out; every rating is now there. The hindsight gains (+28.43 and others) were green; they stay neutral, even where the interval excludes zero (owner's Q3).
- **Served but never drawn before:** the per-season test results, each player's five ratings, all three group ratings for returners and rookies, winner picked in the weekly score, calibration counts and mean interval width.
- **Dissolved:** "What did not work". The ridge line sits with the test, the rookies and returners line with their grid, the age curve line with its chart, and the intervals line with coverage. All stay visible.
- **Visitor copy.** "F1", "the owner waived", "the plan's" and the version id are gone. The served waiver text carries a code and a person, so the page states the fact in plain words: the intervals missed their limit only by covering too many players. ISO timestamps are in the Stats format. Hashes moved to About.
- **Shared addition.** `SeasonLineChart` gained optional `name` and `overlay` (a second line on the same axis, one value per point); without them it behaves as before. Vitest covers it.
- **Page reads from the browser**, as RD10 does, through `getProjectedImpactPage` and `getProjectedImpactPlayer` in `lib/projected-impact.ts`. The server-side getters in `lib/workbench-api.ts` had no other caller and are removed. The streamed page was what caused `#contributions` to exist twice, so the known flake has no source now. The API is unchanged.
- **Nothing else moved.** No API, analysis, frozen result or interval changed. The score was not forced (owner's Q4): the page shows 0 prospective and 107 hindsight games until the first weekly score, due around Nov 12, 2026.

**Page size.** 5,433 px at 1440 with both disclosures collapsed (was 4,857) and 6,806 px at 390 (was 6,507): longer because the per-season switch's tables, the rookies and returners grid, the fuller Why card and the legends are new.

**Open, for the owner.** The prospective table has not rendered on real data, because there are no prospective games yet. Both of its states (20 or more games with gains, fewer without) are covered by the spec on a modified payload. It should be re-checked on real data after the Nov 12 run.

**Checks**

| Check | Result |
| --- | --- |
| Lint (ESLint, Stylelint), typecheck | clean |
| Vitest | 840 passed (`SeasonLineChart` second line; `intervalTone`, `signTone`, minus signs) |
| `projected-impact` ×3 (rewritten for the layout) | 27/27. The known flake did not appear |
| Full Playwright (sandbox, mock API, 2 workers, 8 GiB cap) | 613 passed, 17 skipped, 0 failed, on the final build. The two prospective-state tests were added after this run and ran only in the ×3 above; nothing else changed since |
| Real data ([`real-data-check.json`](real-data-check.json), [`real-check.mjs`](real-check.mjs), proxy [`../design-RD10/readonly-proxy.mjs`](../design-RD10/readonly-proxy.mjs), GET only) | 105,044 values (65,015 at 1440 over 123 loads; 40,029 at 390 over 20 loads), 0 mismatches, 0 console errors, 0 overflow, 0 broken images |
| Coverage of that check | all three views (520, 79, 661 players) and every team at 1440, a last-team filter, search, sort with unknown ages last; 85 Why cards at 1440 and 9 at 390 (top, bottom, rookies, returners, off-roster) and one through the search; that base + sources = the projection; the test tables pooled and per season; groups; hindsight; both aging curves; coverage; About |
| Which pairs exist | Written out by hand in the check, so a lookup that silently finds nothing fails. The sentences' claims are checked from the served numbers (both held-out seasons, every group interval including zero, ridge ahead, the age curve worse on games) |
| Layout and rules | 992 px column; hero icon centred; bars inside their scale for every player; hindsight 0 toned cells; no green/red on contribution bars; category tints on the aging lines and their key; no section hairlines, card edge, watermark, arrow character, ISO date, hyphen-minus number or project word; no phone control under 40 px; whole-pixel control heights; season-and-team photo URL on every row. 2 of 520 roster rows show the initials fallback |

**Found by viewing the screenshots, then fixed and re-verified.** On a phone, the wide rating column pushed the gains off screen. In About, the minute bands sorted as text, so 1,000 came before 500. Two glossary lines said more than could be supported (correlation as "order" and "weighted by minutes"). The heading's unit was repeated in the first line. Five rating tiles left an orphan on a phone.

**Glance test** (`pi-top-1440.png`, full pages at both widths, viewed). In five seconds: what the page is (hero), the answer in one sentence, and the first rows of a table with each player's projection and its interval.

**Notes.** Section captures taken by Playwright can show the sticky site header or the Skip to content link across a tall section; neither is on the page there. Visuals were judged from the sandbox build. The `projected-impact.css` import moved to just after `metric-backtest-research.css`, and the CSS chunk :3100 serves was checked for the new rules.
