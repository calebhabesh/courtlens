# RD01 — Combine & Wingspan, round 1: one Databallr-style page

Measured 2026-11-07 on branch `research` from `467bc49`. Parents: [Research design catalog](../../../research-design-catalog.md)
RD01, [Research progress](../../../research-progress.md), R10 data in [r10](../r10/README.md). Page: `/wingspan`.
**Awaiting the owner.** Only the owner marks ✅.

Design only. No Python, API, registration, frozen result, interval or unknown state changed; the shared Postgres was
only read (through the owner's API).

## Reference and instructions

Reference: the saved page `~/Downloads/Webpages/DraftBallr/Wingspan Database - NBA Height & Wingspan Resource _ databallr.html`,
rendered offline with every script tag and `crossorigin` stripped and every non-`file://` request blocked.
databallr.com was not fetched. The owner saw it beside this page at 1440 and 390 with a gap list, and answered (2026-11-07):

1. Yes: fold everything into one Databallr-style page, with R10's correlations below it.
2. With shoes (measured shoe height or Databallr's flat +1.25″): use your best judgement.
3. Players who skipped the combine: use your best judgement.
4. Colour on Diff and D-DPM: try to make the entire page match Databallr before moving on.

## What changed

| Before | After |
| --- | --- |
| Two stacked pages: the PC11 class view (left-aligned header, draft-class filter, four tiles, class scatter, an 80-row drills table in capitals with no photos) above R10's plain sections | One page in Databallr's order (`components/wingspan-research.tsx`); `combine-view.tsx` and `wingspan-ddpm.tsx` removed |
| Full width, boxed sections | `TabbedPage` hero (ruler icon, one subtitle line, no route tabs) and `.rs-column` at Databallr's 1352 px for this page (a table beside a side column), centred |
| Status and position as dropdowns inside the Players header | A shaded filter panel: All Players / Active / Inactive, All Positions / PG–C, No Shoes / With Shoes, Inches / Ft-In, a Combine class select, and Databallr's summary line (rows, average height, wingspan and diff) |
| Players table (kit `Table`, 32 px photos, 50 rows, then Show all) | The shared `ResearchTable`: search, CSV with `nba_id`, sortable headers, team logo column, 40 px team-coloured season photos, a 560 px scroll frame (its own stacking context), percentiles under height/wingspan/diff/career, per-row Similar Profiles (◎) and Overlay (+) buttons. Default: Active, longest wingspan first, as Databallr |
| — | Right column: Positional Averages as Databallr's cards; Selected Player Overlay (new drawing: each player's height and wingspan as a cross on one true-length scale, longest drawn widest so all stay visible; up to four; removable; empty state as Databallr) |
| Two scatters (class height/wingspan; R10 selectable) | One scatter panel: axis selects above, r badge (served value, interval in its title), points coloured by position with a legend, overlay and similar-profile players ringed; the drawing takes the panel's width so a phone keeps readable labels |
| Nearest builds always open for the first row | Similar Profiles: empty with a "Show {longest}" button until a player is picked; the X clears it (`build=none`) |
| — | A class chosen in the filter adds "{year} Combine Drills" (pick, reach, weight, vertical, agility, sprint with percentiles) from the PC11 feed, with drafting-team colours |
| Correlations, Who is counted, Caveats, Credits, Method as open boxes | "Wingspan and Defense" (headline and both correlation tables in wells), then the collapsed Caveats & Methodology: caveats, Who Is Counted, Positional Averages with Intervals, Method & Reproducibility, Data & Credits with Data Details |
| Duplicate React key on the partial-r row (2 console errors on :3100) | Fixed (the partial row has its own key) |

Shared changes: `ResearchTable` gains optional `format`, `sub`, `identity`, `bar`, `width` per column and `teamSeason`,
`teamFilter`, `className` per table; existing pages render unchanged (Vitest 808 incl. the table tests). Lengths use
`lib/wingspan-format.ts` (quarter-inch glyphs, two decimals otherwise; tested).

### Judgement calls (instructions 2–4)

- **With shoes:** the measured shoe height (1,167 of 1,751 measured players). The 2000–2003 and 2023–2026 combines
  didn't measure it, so those cells are "—", never barefoot + 1.25″ (an invented value). Diff, percentiles, the scatter and
  the correlations stay barefoot, as registered.
- **Skipped the combine:** left unknown (Wembanyama, Holmgren, Lively have rows but no measurements). Filling them needs a
  new source and a new frozen analysis, which the design phase doesn't do; the methodology names the gap. This is why
  Databallr lists 593 active players and CourtLens 362.
- **Colour:** Databallr's sign colours as identity tones (gold above zero, blue below) on Diff, D-DPM, career D-DPM,
  position cards and the overlay legend; no green/red (no interval is served for these values). Recorded in the pattern.
- **Width:** 1352 px rather than RD00's 992 px, because Databallr's Wingspan page is that wide and holds a table beside a
  side column. Recorded in the pattern as the database-page exception.

## Checks

| Check | Result |
| --- | --- |
| Lint (ESLint + Stylelint), typecheck | 0 errors, 0 warnings; clean |
| Vitest (in the repo) | 116 files, **808 passed** |
| Page specs | `r10-wingspan-calculator` (rewritten for the layout: correlations, averages, cards, scatter, default Active order and cells, sign tones, filters, inches and measured shoe height, similar profiles and clearing, overlay) with `pc11-gated-pages` (the class drills): **42/42 over three repeats** |
| Full Playwright (sandbox `~/.cache/courtlens-tmp`, mock API 4180, build on 3180, `MemoryMax=8G`) | **589 passed, 17 skipped, 2 failed**: the two `pc11-combine` visual baselines, changed by design. Regenerated, viewed and committed; they then passed 2/2. No committed evidence touched (docs/ was an rsync copy) |
| Real data ([`real-data-check.json`](real-data-check.json), [`real-check.mjs`](real-check.mjs), [`readonly-proxy.mjs`](readonly-proxy.mjs)) | The owner's :8000 through a read-only proxy on 4180 (GET/HEAD/OPTIONS; POST refused 405; Origin rewritten to localhost:3100), production build on 3180. Three scenes at 1440 and 390: default (8,663 values), all players in inches with shoes (26,358), and a state with a class, overlay, similar profiles and the diff/D-DPM scatter (3,322). Every table cell's value and text, row order, summary, cards, averages table, correlations, every scatter point and r, nearest builds, overlay lengths and drills: **0 mismatches** (76,686 compared), 0 console errors, 0 overflow, **0 broken images** after 404 portraits render as initials. Column 1352 px centred at 1440 (44 px each side); the table scrolls 0 px sideways at 1440, 466 px inside its frame at 390 |
| Screenshots (viewed) | [`wingspan-1440.png`](wingspan-1440.png), [`wingspan-390.png`](wingspan-390.png), [`wingspan-state-1440.png`](wingspan-state-1440.png), [`wingspan-state-390.png`](wingspan-state-390.png), [`wingspan-methods-1440.png`](wingspan-methods-1440.png) |

The first real-data run counted 24 and 1 "broken" images in the 1,751-row scene: portraits the API answers 404 for,
counted in the instant before React's `onError` swapped them for initials. With a one-second settle the count is 0;
the script keeps that settle.

## Glance test

| # | Check | 1440 | 390 |
| --- | --- | --- | --- |
| 1 | What page and scope in two seconds | pass: centred title, filter panel with Active and All Positions lit | pass |
| 2 | First screen shows the data | pass: table rows and position averages above the fold | pass: filters, then the table |
| 3 | One left edge | pass: the 1352 px column | pass: 12 px gutters |
| 4 | Photos | pass: 40 px team-coloured season photos, logos beside them | pass |
| 5 | Unknowns | pass: "—", never 0 (D-DPM off the board, shoes not measured) | pass |
| 6 | Colour has one meaning | pass: gold/blue = sign; position colours only in the scatter; no green/red | pass |
| 7 | Captions | pass: one subtitle line and the summary; rules in the collapsed methodology | pass |
| 8 | Controls | pass: kit Segmented, Select, Button, IconButton only | pass: 0 overflow |
| 9 | Pickers clear | pass: Similar Profiles X → empty state with "Show {longest}"; overlay X and Clear | pass |
| 10 | Sticky layers | pass: the table frame is the shared isolated `rt-scroll` | pass |

## Not verified or left open

- **Combine skippers** (instruction 3): unknown until the owner wants a new source block.
- **Active count** differs from Databallr's (362 vs 593) for the reason above and because Active here means DARKO's newest board.
- **Hosted demo:** not deployed (standing rule).

R16 constraints observed: no Ask or provider calls, `~/dev/courtlens-r16` untouched, shared Postgres only read, the
owner's :8000 and :3100 servers not restarted (3100 answered 200 throughout). 3180 and 4180 were stopped and the
sandbox deleted.
