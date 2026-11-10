# RD06 Learning: design evidence

Research → Learning (`/methodology/learning`), redesigned after Databallr's saved Learning page. Instructions and status:
[research design catalog, RD06](../../../research-design-catalog.md#rd06-learning--).

## Reference

`~/Downloads/Projects/Courtlens/Learning _ databallr.html` (+ `_files`), the save the owner attached in round 1;
`~/Downloads/Webpages/DraftBallr/` has no Learning save, and no screenshots came with the round 1 prompt. It was rendered offline:
scripts stripped, `crossorigin` removed so the local stylesheet loads, a `<base>` added, every non-`file://` request blocked, and
the scroll-in topic cards (saved at `opacity: 0`) forced visible. databallr.com was never fetched. Measured at 1440: a 1368 px
container; a sticky 224 px sidebar of numbered tiers and topics with a 384 px "Search topics…" field above it; a 32 px gap; 1112
px topic cards with a coloured tier pill, prose, one formula well per label, Myth / Reality callouts (2 topics), Key Takeaways,
Prerequisites chips (10 topics) and arrow links; the league trends as three lines on two y-axes plus a table, 2001 to 2026.
Without its scripts the save does not lay out at 390 px (the sidebar keeps its width), so there is no phone reference. Reference
screenshots are not committed (third-party page).

Before shots of the old page: `before-1440.png`, `before-390.png`.

## Round 1 (owner, 2026-11-08)

"Go with your recommendations and suggestions for optimal construction of the page. Comprehensively build it out now." The nine
recommendations are recorded with the instruction in the catalog. The recommendations did not settle two data questions, so the
build took the conservative reading: offensive rebound rate by shot zone is not shown (not served), and Volume and Efficiency is
added as a CourtLens topic with no Measured box.

**Built**

- **Header.** Learning draws the centred hero (`PageHeader` with `sq-hero ln-hero research-hero`, book tile): "Learning", one line,
  then the topic count and links to Definitions, Glossary, Research and Patch Notes. The route, the `/learning` redirect and the
  Methodology tab list are unchanged: `app/methodology/layout.tsx` hands the path to `components/methodology-frame.tsx`, which
  skips the tabbed header for the paths in `OWN_HEADER_TABS` (`lib/route-consolidation.ts`). Definitions keeps its tabs.
- **Layout** (`components/learning-view.tsx`, `components/learning-view.css`). A 1352 px column. The topic search (the Stats table's
  `GridSearch`, 384 px) filters the cards and the index by every word of the query across title, subtitle, prose, formulas and
  takeaways, with a count line and a clear-search empty state. Beside the cards, a sticky 224 px index of numbered tiers and their
  topics; the topic being read is marked (`aria-current="location"`). Below 1024 px the index is a collapsed "Topics (n)"
  disclosure (kit `ButtonSummary`) above the cards that closes when a topic is picked.
- **Tiers and cards.** Tier headings in small gold capitals with a rule and the blurb. Each card: a tier pill in a subdued
  categorical tint (`--color-category-*` in fixed order: tiers are labels, not ranks, never good/bad), the title, the subtitle in
  `--color-on-bg-secondary`, prose at card width, one labelled well per formula (`formulas` now carry a label each), Key Takeaways
  with gold dots, "Read first" prerequisite chips (kit `ButtonLink`, our topic titles, 21 topics) and the page links with a new
  `arrow-right` icon. One nesting level (card → well).
- **Myth / Reality.** Four topics (Stabilization, Shot Quality vs Shot Making, Play-Type Difficulty, Complementary vs Redundant
  Skills) carry a myth in our own words; its Reality is that topic's frozen Measured in CourtLens result, with the R-block chip and
  evidence link, so the number appears once. The other eight measured topics keep the Measured in CourtLens well.
- **League trends** (`components/learning-league-trends.tsx`, new shared `components/research/season-line-chart.tsx` + `.css`).
  One measure on one axis with a switch (TS% / eFG% / TOV% / ORB% / 3PA rate / ORTG), never Databallr's two y-axes; 2 px accent
  line, 8 px points, recessive grid, a crosshair and tooltip on hover or arrow keys; every other season label on a phone. Then
  every measure on `StatsGrid` (compact), and a line saying the series starts in 2014-15 and why older box-score averages are not
  joined.
- **About this page**, collapsed: Databallr as the design reference, where the measured numbers come from, why the trends start
  in 2014-15.
- **Removed.** The legacy "Investigate historical scoring variation" workshop (`components/learning-workshop.tsx` and its CSS) and
  the Credits section.
- **Content.** Our prose and numbers stay; Volume and Efficiency added to Tier 3 (23 topics); two formula lines lost a prefix that
  repeated their new label.
- **Not changed.** No API, analysis or frozen result. The R11 spec's Learning tests, the route-consolidation test (Learning's own
  header) and the saved-operations test (workshop gone) were updated to the new layout; Patch Notes tests unchanged.

**Checks**

- Lint 0 errors / 0 warnings (ESLint and Stylelint), typecheck clean, Vitest 830 passed (new: `lib/learning-topics.test.ts`,
  `components/research/season-line-chart.test.tsx`). No Python changed.
- `r11-learning-patch-notes`: 7/7 three times on the final build (every tier, topic, pill, formula, myth, measured sentence,
  prerequisite and link; search; the index marking the topic; every table value and chart point for TS% and ORB%; the phone index).
- Full Playwright in a sandbox (`systemd-run`, MemoryMax=8G, mock API on 4180, production build on 3180): the first run had 598
  passed, 17 skipped, 5 failed: four `r10-wingspan-calculator` (the known load flake; 11/11 alone) and the route-consolidation
  heading check, which expected the Methodology header on Learning and was updated. Final build: **603 passed, 17 skipped, 0
  failed**.
- Real-data check (`real-check.mjs` through `readonly-proxy.mjs`, GET only, 4180 → :8000; production build on 3180) at 1440 and
  390: **613 values, 0 mismatches** (every league table value and its text, every chart point for all six measures, the hover
  tooltip, structure); 0 console errors, 0 overflow, 0 broken images, no phone control under 40 px and no `ButtonLink` under 40 px
  on the phone; hero icon centred. Report: `real-data-check.json`.
- Glance test, screenshots viewed: `learning-default-*` (full page), `learning-index-rapm-1440` (the index marking RAPM),
  `learning-index-open-390`, `learning-search-*` ("rebound"), `learning-myth-*`, `learning-chart-orb-*`, `learning-chart-hover-*`.
  In five seconds: what the page is (hero), where to start (index and search), what each topic gives (formula, measured result,
  takeaways). The visuals were judged from the sandbox build, not :3100.

**Found in passing (not changed):** `--space-1-5` is not a defined token, so the rules in `zts-research.css`,
`shot-quality-research.css`, `shared-floor-view.css` and `playoffs-bracket-view.css` that use it fall back to no spacing. RD06
uses defined tokens only.

## Rounds 2 and 3 (owner, 2026-11-08)

Round 2: "the search topics bar is arbitrarily placed. Should we make it width of column" (screenshot: the desktop index with the
384 px search above it, running past the index into the gap). Round 3, sent during the build: "it's squished to the content below
it. Add a natural padding" (screenshot: the search over "1. Core Concepts"). The round 3 screenshot showed a ~4 px gap and an
indented field, which the sandbox build did not (16 px, flush): likely :3100's stale CSS for an edited imported file. The gap was
widened regardless.

**Built**

- The search moved into the index column (`.ln-aside-sticky`): the column's width (224 px), at its top, sticky with the index while
  the cards scroll; 24 px between the search and "1. Core Concepts" (16 px separates the tiers, so the search no longer reads as
  part of the list). Its top aligns with the first tier heading. Below 1024 px it stays full width above the Topics button.
- No other change; no API, analysis or result.

**Checks**

- Lint 0/0, typecheck clean, Vitest 830.
- `r11-learning-patch-notes`: 8/8 three times (new test: the search's x and width equal the index column's, a 24 px gap, top
  aligned with the first tier, still in view after scrolling; the phone test checks it sits above the Topics button at its width).
- Full Playwright in the sandbox on the final build: **604 passed, 17 skipped, 0 failed**.
- Real-data check through `readonly-proxy.mjs` at 1440 and 390: **620 values, 0 mismatches** (the round 1 checks plus placement:
  search x and width = the index column's, 24 px gap; on the phone above the Topics button at its width); 0 console errors, 0
  overflow, 0 broken images, no phone control or `ButtonLink` under 40 px.
- Glance test, screenshots viewed: `learning-search-placement-1440.png` (the index column), `learning-search-placement-390.png`,
  `learning-default-*`. Screenshots from round 1 were retaken on this build.

