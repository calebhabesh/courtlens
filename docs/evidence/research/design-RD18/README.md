# RD18 Shot Aftermath: design evidence

Research → Shooting → Shot Aftermath (`/research/shooting/aftermath`). Instructions and status: [research design catalog, RD18](../../../research-design-catalog.md#rd18-shot-aftermath--queued). Unlike RD10–RD16 this page needs a new frozen play-by-play aggregate first (owner, 2026-11-09), so it runs as a build block, then the design rounds.

## Reference

The owner's saved Databallr page `~/Downloads/Webpages/DraftBallr/Shot Aftermath _ databallr.html` (not committed). databallr.com and draftballr.com were not fetched.

## Before (:3100, read 2026-11-10)

[`before-check.mjs`](before-check.mjs), [`before-check.json`](before-check.json), screenshots `sa-before-*`. The old workbench operation view under the left-aligned Shooting header, full width: an example-player card (Tyrese Maxey, 2026-27 box score), five stat tiles, then a zone table and a branch table (3 old `data-table`s, 0 `StatsGrid`), filled by `POST /api/workbench/operations/shot-aftermath`. 1,774 px tall at 1440, 2,314 at 390. 0 console errors, 0 overflow, 0 broken images; 2 native selects (Season, Phase). Every value reads 0 or "—" under "Source Unavailable, 0 / 154 league games": unavailable data drawn as zero counts. Raw branch keys in the body (`missed_recovery`, `missed_no_observed_recovery`); no hashes. The phone subtitle is cut mid-word.

## Content check (2026-11-10, read only)

[`content-check.py`](content-check.py) and [`content-check.json`](content-check.json): match counts only, no points or rates read, so nothing anticipates the registration. Findings are in the [progress log](../../../research-progress.md) entry of the same date and in the catalog section.

## Build block (R17)

Registered, frozen and served before any design: [`r17-shot-aftermath`](../r17-shot-aftermath/README.md). The API is `GET /api/shot-aftermath`, `/scope` and `/teams`.

## Round 1 (owner, 2026-11-10)

"Go with your recommendations and build it comprehensively." The proposal and its answers (Q1–Q5) are recorded with the instruction in the catalog.

**Built**

| Section | What it shows | Borrowed from |
| --- | --- | --- |
| Hero and tabs | Its own centred hero, "What happens after the shot?", with the Shooting route tabs under it and the URL kept; Expected Shots and Adjusted keep the shared header (Q1). A meta line: season, NBA or the team with its logo, position (marked estimated), first-chance attempts, regular season | RD06 own-header tab, RD16 hero over tabs |
| Filters | Sticky bar: Season (segmented), Shooting team (`TeamPicker`), Position, estimated (segmented), Export CSV of the scope's five rows with intervals and counts | RD04 team picker, RD00 filter bar |
| What a shot is worth | One sentence, computed from the scope: the zone with the highest and lowest net per first-chance attempt; a note when the top interval overlaps another; the overall opponent cost with its interval and, when coloured, the after-make and league averages behind it; the clearest rebound effect, or a line saying none is clear. Thin zones are named, never ranked | RD10, RD11 answers |
| What do you gain and give back? | Databallr's view switch (All attempts, After a miss, After a defensive rebound) selecting in place; Databallr's small zone charts, bars from zero with 95% whiskers. Points charts share one axis from zero, cost has its own centred on zero (Q2), the league average dashed on the rebound view; cost green or red only where the interval excludes zero on a cell that isn't thin; a centred key and one note on scales, blocks and partial accounting | Databallr's layout; RD12 to scale, RD13 axes and keys |
| By shot zone | Databallr's three tables as compact `StatsGrid`s with the interval under each value: make rates and opponent cost; made, second chances, cost and net; opponent points per possession after a make and after a defensive rebound with possessions and the league line. Two column groups each on a phone | RD10 grids, RD13 phone switch |
| All 30 teams | A zone switch, then every team with its logo in code order, sortable as a view (attempts, FG%, own, net, cost, rebound cost), thin rows dimmed, the selected team marked; one line on chance colours (about 1 in 20) with the scope's own count; three column groups on a phone (Q3) | RD04 logos, RD11 not ranked |
| Read these with care | Positions are estimates (888 of 1,039, centres weakest); the numbers are CourtLens's, second chances lower than Databallr's; a small toggle opens the attempt counts against Databallr's 2024-25 | RD16 toggle in a section |
| How to read, glossary, About | Three cards; a collapsed glossary from the served definitions; a collapsed About with sample, cost, matching, the scope's unknowns by reason, intervals, limits, credit, the registration date and the identifiers | RD16 |

**Not changed.** No analysis, frozen result, interval or API. Every value is served; the only computed text is the answer's ranking (from served nets) and the chance count (from served tones). The old per-player tool (`ShootingView`, `POST /api/workbench/operations/shot-aftermath`) is no longer rendered on any route; its API is unchanged (Q5), and its component files remain for the owner to keep or delete.

**Shared changes.** `lib/route-consolidation.ts` adds the route to `OWN_HEADER_TABS`; the Shooting layout uses the own-header frame (`MethodologyFrame`, comment generalised); `app/globals.css` imports the new stylesheet after Points Forecasts'; the operation gallery's description of this page. Specs: `route-consolidation` (this tab's hero keeps its tabs); the old tool's tests removed from `presentation-defaults` (two tests, and the gallery check kept as its own test), `route-polish` (two catalog-scope tests that only reached the old tool) and `shooting.spec.ts` (deleted); the old `first-load-shot-aftermath` baselines removed; the operation gallery desktop baseline regenerated (its description) and viewed.

**Found by the checks and screenshots, then fixed before reporting.**
- The team table scrolled sideways: first by its minimum width, then by an over-wide header ("After a rebound, per miss"); now "Rebound cost" under "Per miss", and on a phone three column groups (the third column was clipped).
- The answer ranked a thin cell: BOS bigs took 12 long mid-range shots and were called "the least" at −0.34. Thin zones are now named in a note, never ranked (Vitest and spec cover it).
- "Every team's all shots" read badly; now "first-chance attempts" and "every position".
- The spec's hash check read hidden text; it now reads only visible text.

**Page size.** 5,273 px at 1440 and 6,703 at 390 (was 1,774 and 2,314 for the old player tool), disclosures collapsed.

| Check | Result |
| --- | --- |
| Lint (ESLint, Stylelint), typecheck | clean |
| Vitest (`lib/shot-aftermath.test.ts`) | 9 passed: true minus and unsigned zero, one points axis and a symmetric cost axis, ranking with and without overlap, thin zones never ranked, the rebound effect, chance counts, team sorting with unknowns last, CSV rows against the header, the charts of each view |
| `shot-aftermath.spec.ts` ×3 (sandbox, real-API fixtures `e2e/fixtures/rd18-shot-aftermath.json`) | 21/21 |
| Full Playwright (sandbox, mock API, 2 workers, 8 GiB cap) | 629 passed, 17 skipped, 1 failed: the operation gallery desktop baseline, changed by design (its description), regenerated, viewed and passing. Later page-only changes (the answer's thin rule, a header label, a sentence) were rerun on the page spec ×3 |
| Real data ([`real-check.mjs`](real-check.mjs), [`real-data-check.json`](real-data-check.json), proxy [`../design-RD10/readonly-proxy.mjs`](../design-RD10/readonly-proxy.mjs), GET only) | 4,976 values, 0 mismatches. Four scopes (2025-26 NBA all; 2024-25 After a miss, threes; BOS bigs After a rebound, rim; guards, long mid) at 1440 and 390: meta line, answer ranking and thin zones, every chart bar (value, interval, tone, label), every zone-table cell in every phone view, the league line, all 30 teams in order with every value and tone in every phone view, the chance count, the position line, the count comparison and the About identifiers. Expected values come from the API and are formatted independently of the page's lib |
| Layout and rules | 0 console errors, 0 overflow, no table scrolling sideways, 0 broken images, 30 of 30 team logos loaded, 0 native selects, no hashes or project codes in the visible text, at both widths in every scope |
| :3100 | the served CSS chunk carries the new rules |

**Glance test** (`sa-r1-2025-26-nba-all-all-all-1440.png`, the phone top, viewed). In five seconds: what the page asks (the hero), the answer in one sentence (rim attempts return the most, long mid-range the least), and four small charts with the rim bar tallest and a green three-point cost.

Screenshots viewed: `sa-r1-*` (all five) and the regenerated gallery baseline. Full-page captures move the sticky filter bar down the page, leaving a gap under the meta line; the viewport shows it in place.

## Round 2 (owner, 2026-11-10)

"Where is shot aftermath?" (a screenshot of the Research menu), then "Sure." to its own menu entry.

**Changed.** Research → Shooting lists Shot Aftermath after Shot Quality (split icon, "What first-chance shots score, what misses win back and what the opponent scores next") as a tab shortcut (`TAB_SHORTCUTS`, like Learning); the page stays a Shooting tab and keeps its URL. The Shooting entry reads "Expected shots and adjusted shooting". **Found while checking it:** `lib/route-availability.ts` still gated the route on the old workbench shot source, which is unavailable, so the menu hid the new entry; the gate is removed, since the page reads only the frozen R17 file. The menu's columns rebalance themselves (Shooting now has five items); the phone drawer lists the entry.

| Check | Result |
| --- | --- |
| Lint, typecheck | clean |
| Vitest | 877 passed (`nav-model` lists the new link) |
| Full Playwright (sandbox, mock API, 2 workers, 8 GiB cap) | 629 passed, 17 skipped, 1 failed: `route-consolidation` still asserted the menu had no Shot Aftermath entry (an FO07 rule this instruction replaces); updated to expect the entry and its link, then `route-consolidation` and `shot-aftermath` ×3: 39/39 |
| Menu viewed | desktop menu at 1440 (entry, icon, description, balanced columns); the phone drawer link counted |

## Open for the owner (2026-11-10, not built)

Proposed after round 2; the full list is in the [catalog's RD18 section](../../../research-design-catalog.md#rd18-shot-aftermath--ready-for-review): six suggested improvements (other-season line in the answer, team-row scope icon, position grid, round cost-axis steps, phone label wrap, after-make against after-rebound chart; 1, 2, 4 and 5 recommended together) and whether to delete the now-unrendered `components/shooting-view.tsx` and `components/catalog-scope-fields.tsx`.
