# RD08 Draft Classes: design evidence

Research → Draft Classes (`/draft`), rebuilt as one scrolling page from approved CourtLens Research patterns. Instructions and status:
[research design catalog, RD08](../../../research-design-catalog.md#rd08-draft-classes--). How the analysis was built and what its
numbers mean: [R09](../r09/README.md).

## Reference

None. There is no Databallr page for it, and the owner decided on 2026-11-06 that CourtLens doesn't replicate Draftballr's look. The
Draftballr saves were not opened, and databallr.com and draftballr.com were not fetched. Each section borrows a named precedent (below).

Before shots of the old page (from :3100, every tab, 1440 and 390): `before-<tab>-<width>.png` (full page) and `before-<tab>-<width>-top.png`.

## Round 1 (owner, 2026-11-08)

"Go with your recommendations and suggestions for optimal construction and layout of this page. Build it comprehensively." The
recommendations, including the stop-and-ask items, are recorded with the instruction in the catalog.

**Built**

| Section | What it shows | Borrowed from |
| --- | --- | --- |
| Hero | `sq-hero research-hero`, one line, the meta line (games through, picks, classes), links to Wingspan, Players, Learning | RD00 to RD07; RD07's meta line |
| Index | One page instead of five tabs; a sticky 224 px numbered index, the section being read marked; a collapsed "Sections" list below 1024 px; `?tab=` links scroll to their section | RD06 |
| 1. Rookies | A team-tinted card chosen with `EntityField` over the 45 rookies who have played (clearing it gives `rookie=none` and a way back); its past same-pick rookies on `StatsGrid`; all 60 picks on `StatsGrid` with `GridSearch`, `TeamPicker`, a pinned player and a row button that opens the card | RD05 card; RD03 search; RD01/RD04 grid; RD00 round 6 clear |
| 2. What a slot is worth | One line on one axis with the 95% interval as a band; First 4 seasons / Career / RAPM, era, Win shares / Minutes; compact `StatsGrid` | RD06 `SeasonLineChart` |
| 3. Ranges of picks | Compact `StatsGrid`, green/red only where the 95% interval excludes zero, its own colour key | RD04 `GridValue tone` |
| 4. Classes and redrafts | A class search with suggestions plus earlier/later buttons; Draft / Redraft / Career; `GridSearch`; `TeamPicker`; Steal and Miss as category tints; surplus gold/blue | RD03; RD04; RD06 tints |
| 5. Steals and misses | Two columns (stacked on a phone), the top three of each as cards, then all 25 on `StatsGrid`; the miss wording and Len Bias kept | RD05; RD04 |
| 6. Combine beside value | Correlations on `StatsGrid`, RD00's scatter with a measurement `Select`, a link to Wingspan saying how the two differ | RD00; RD05 link rule |
| 7. How to read | Three cards and a `Glossary` | RD05 |
| About this page | Collapsed: coverage on `StatsGrid`, caveats, the Walker Russell 1982 #78 disclosure, sources and credits, method, hashes, the R09 evidence link | RD06, RD07 |

- **Shared changes.** `SeasonLineChart` gained an optional band (`band`, each point's `low`/`high`), chosen x labels (`xTicks`) and a tooltip
  heading (`label`), and a banded chart drops padding ticks it doesn't need; without `band` it behaves as before (RD06's Learning spec passes
  unchanged). `LookupInput` gained an optional `groupLabel` for a fixed candidate list.
- **`fixed` and `whole`** in `lib/draft-classes.ts` now use a true minus, so a negative win-share total reads like every signed value.
- **Served text left out.** The API's credits list ends with "Page reference: Databallr's Draftballr, refactored as Draft Classes", which no longer
  describes the page and names a site the owner doesn't want credited for design. The page filters that one line; the API is unchanged.
- **Combine measurement** is a kit `Select`, not a switch: eight long labels don't fit a phone as a segmented group, and it lists measurements, not players.
- **Not changed.** No API, analysis or frozen result. The Stats pre-2000 Draft Class filter and any prospect model stay out.

**Stop-and-ask items, as answered:** (A) band added to the shared chart; (B) R09's rookie colouring kept, with its own legend line; (C) surplus gold/blue; (D) season
photos or initials, counted below; (E) combine kept here, linking to Wingspan; (F) class search with earlier/later buttons; (G) hero stat tiles dropped.

**Checks**

- Lint 0 errors / 0 warnings (ESLint and Stylelint), typecheck clean, Vitest 833 passed (one new `SeasonLineChart` test).
- `r09-draft-classes` (rewritten for the layout) and `r11-learning-patch-notes` (unchanged, it covers the shared chart): 48/48 at `--repeat-each=3`. An earlier run lost a
  test to its own two same-instant clicks (the second overwrote the first in the URL, which uses the shared `useUrlState`); the spec now waits between clicks.
- Full Playwright in a sandbox (`systemd-run`, MemoryMax=8G, mock API on 4180, production build on 3180): **605 passed, 17 skipped, 0 failed**.
- Real-data check (`real-check.mjs`, production build on 3180, the owner's API through `readonly-proxy.mjs`, GET only) at 1440 (142 page loads: all 45 played rookies and their
  past picks, all 13 value views with every chart point and interval, every class 1966 to 2026, redraft and career orders for six classes, all eight combine scatters) and 390 (21
  loads, a sample): **212,435 values, 0 mismatches**; 0 console errors, 0 overflow, 0 broken images, no phone control or `ButtonLink` under 40 px (the table header sort buttons are not counted);
  hero icon centred; column 1352 px; index 224 px and pinned; 7 cards, all tinted, no watermark, no edge rail; a logo beside every team code; no
  player `<select>`, arrow character or "Draftballr" on the page. Report: `real-data-check.json`. The first run reported 122 mismatches, all from the checker itself (school names such as
  Mississippi matched "Miss", and a rookie with no TS% correctly draws one dash); it now reads the label element.
- Photos: every requested photo carries that row's season and team (0 wrong). 4,279 of 9,940 rows at 1440 show initials. With every photo loaded in sampled classes: 1966, 17 of 31 picks who played have a
  photo; 1972, 17 of 49; 1984, 21 of 58; 1996, 31 of 47. No later-season photo is substituted (the site's rule), so early classes are mostly initials.
- Glance test, screenshots viewed (`draft-*-1440.png`, `draft-*-390.png`, and `draft-1984-redraft-*`). In five seconds: what the page is (hero), who this year's rookies are against past picks at their slot
  (card and table), and what a slot is worth (the line, one headline sentence). Visuals judged from the sandbox build, not :3100.
