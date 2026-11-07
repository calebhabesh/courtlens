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

## Rounds 2 and 3 (owner, 2026-11-07)

Measured 2026-11-07 on branch `research` from `5bd3e84`. Both rounds land in one commit: round 3's instructions arrived
before round 2 was committed, and round 3 replaces most of round 2's table styling. **Awaiting the owner.**

Instructions (verbatim in the [catalog](../../../research-design-catalog.md), RD01):

5. Full coverage for all players like Databallr has.
6. Icons where possible like Databallr has.
7. A main table design more similar to Databallr.
8. A units toggle: ft and inches to m/cm.
9. Better static tables (Similar Profiles, Wingspan and Defense): more breathing room, slightly larger contents.
10. A clearer Selected Player Overlay, with axis labels.
11. Selected players more notable on the graph, and a way to clear them.
12. Left-aligned search; player photos.
13. Several players on the graph without labels clipping into each other.
14. One table look for the site, after the Stats page's NBA Player Statistics table, in scaled equivalents.

### Coverage (instruction 5): new data, owner-approved source

Asked before building (data is a stop-and-ask): the owner chose **CraftedNBA, labelled**. Its free page "Height and Wingspan
for every player in the NBA" (`craftednba.com/player-traits/length`) was fetched once with the policy user agent
(`robots.txt` has content-signal comments and no Disallow), kept byte for byte at
`evaluation/research/sources/raw/craftednba-length-58612294d3f0134f.html.gz` (raw SHA-256 `58612294d3f0134f…`), and sealed as
[`courtlens-wingspan-coverage-v1`](../../../../evaluation/research/sources/courtlens-wingspan-coverage-v1.json)
(`a843773ae030bf1b…`) by `courtlens seal-wingspan-coverage`. The API (`/api/wingspan`, `/api/wingspan/nearest/{id}`) merges it
beside the frozen R10 file, whose registration and results hashes are unchanged.

| Step | Players |
| --- | ---: |
| Rows on the page (all parsed; the parser refuses a page where any row fails) | 418 |
| Matched to an NBA person ID by normalized name (frozen combine players and DARKO's 2026-11-05 board) | 418 (4 by a reviewed alias: Bones Hyland, Alex Sarr, Nic Claxton, Bub Carrington) |
| Already combine-measured: **the combine's figure is shown** | 321 |
| Fill a combine participant who wasn't measured (Wembanyama, Holmgren, Lively…) | 27 |
| Add a player the combine never saw | 70 |
| Unmatched / ambiguous | 0 / 0 |
| Page's own Length column disagreeing with its figures (its rounding; CourtLens computes the difference) | 4 |

Where both exist (321), CraftedNBA's height equals the combine's **barefoot** height for 305 and never its shoe height (1 of
159); its wingspan equals the combine's for 306. Reported values are tagged Reported, have no percentiles, and stay out of
the positional averages, the summary averages, r and the career D-DPM population. Active rows rise from 362 to 459 (Databallr:
593, with sources CourtLens doesn't use). The source is registered in `source_policy.py` and
[source policy v3](../../../design/source-policy-v3.md).

### Design

| Before (round 1) | After |
| --- | --- |
| Players table on `ResearchTable`, 40 px photos, figures right-aligned | **`StatsGrid`** (new, `components/research/stats-grid.tsx`): the Stats page's classes and look (frame, PLAYER / MEASUREMENTS / DEFENSE (DARKO) group tier, lifted header, well cells, pinned player card). Search left-aligned in the pinned header; each row is the Stats card (logo, 40 px season photo, name over "team · year combine" or "team · Reported") with ◎ and + beside it; centred figures with a small percentile |
| Kit `Table` (compact, dark) for correlations, within position, similar profiles, method tables; `ResearchTable` for drills | The same `StatsGrid` in its compact (scaled) density for every table on the page; within position is one row per position with three r columns; drills sort by column and keep CSV |
| Ft-In / Inches | Ft-In · Inches · m · cm everywhere (table, cards, overlay axis, scatter, similar profiles); differences in centimetres in metric |
| Group controls unlabelled | Databallr's inset labels with icons (footprints Height, arrows Units, calendar Combine); icons on status options, panel titles and the scatter; CSV in the filter panel with "`nba_id` included" |
| Overlay: a cross per player, no axis | Scaled bars from zero on a labelled axis (feet, inches, metres or centimetres): a light wingspan bar under the solid height bar, the difference at its end, a key |
| Selected points: a ring | Highlighted players large, filled in their colour, outlined and named while the rest dim; a chip each and Clear all; **Add a player to the graph** adds up to 8 more (`mark=`); labels take the side their name fits, one line each (≥ 18 px apart), sliding inside the chart with a leader line when neither side has room |
| Sign colour from the raw value | From the value as shown (a D-DPM that prints 0.0 is uncoloured) |

### Checks

| Check | Result |
| --- | --- |
| Python: ruff, ruff format, mypy | clean (378 files) |
| Python tests | `make test-python` (ephemeral Postgres): 2,672 passed, 3 skipped, **9 failed**; the same 9 fail on a clean `HEAD` worktree (8 Anthropic SDK provider tests: `httpx2` client type check; 1 legacy-brand check on `dashboard/content/patch-notes.json`, unchanged since R12), so none come from this change. New `test_wingspan_coverage.py` (parser, aliases and board tie-break, seal and raw verification, tamper refusal, merge precedence, reported nearest) and updated `test_r10_api.py` pass |
| Lint, typecheck, Vitest | 0 errors, 0 warnings; clean; **810 passed** (metric units and axis ticks added) |
| Page specs (`r10-wingspan-calculator` rewritten, `pc11-gated-pages`) | **45/45 over three repeats** on the final build: correlations, within position, averages and cards, scatter counts incl. hollow reported points, default Active order and cells, Reported tags without percentiles, search, inches/m/cm, measured shoe height, similar profiles for a reported player, overlay bars and axis, chips and Clear all, several added players with labels ≥ 18 px apart |
| Full Playwright (sandbox, mock API 4180, build 3180, `MemoryMax=8G`) | **591 passed, 17 skipped, 1 failed** (the `pc11-combine` desktop baseline, changed by design). Both combine baselines regenerated (the phone one deleted first: its change fell inside the tolerance), viewed and committed; the visual spec then passed 84/84 on the final build. In round 2's run one Stats focus test failed once and passed 5/5 on rerun |
| Real data ([`real-data-check-r3.json`](real-data-check-r3.json), [`real-check.mjs`](real-check.mjs)) | The owner's :8000 through the read-only proxy (POST 405), final build. Six scenes at 1440 and 390: default, all players in inches with shoes, all in cm, active in metres with a reported similar-profile pick and overlay, six players added to the graph, a class with drills. **199,252 values, 0 mismatches**, 0 console errors, 0 overflow, 0 broken images, 0 controls under 40 px at 390. Column 1352 px; the table scrolls 0 px sideways at 1440, 514 px in its frame at 390 |
| Screenshots (viewed) | [`wingspan-r3-1440.png`](wingspan-r3-1440.png), [`wingspan-r3-390.png`](wingspan-r3-390.png), [`wingspan-r3-graph-1440.png`](wingspan-r3-graph-1440.png), [`wingspan-r3-graph-390.png`](wingspan-r3-graph-390.png), [`wingspan-r3-metric-1440.png`](wingspan-r3-metric-1440.png), [`wingspan-r3-metric-390.png`](wingspan-r3-metric-390.png), [`wingspan-r3-state-1440.png`](wingspan-r3-state-1440.png), [`wingspan-r3-state-390.png`](wingspan-r3-state-390.png), [`wingspan-r3-methods-1440.png`](wingspan-r3-methods-1440.png) |

Glance test (both widths): title and scope at once; table rows above the fold at 1440, after the filters at 390; one left
edge; season photos with logos; unknowns "—"; gold/blue only for a shown sign, position colours only on the scatter, no
green/red; one subtitle line and the summary, rules in the collapsed methodology; kit controls only, none under 40 px on a
phone; highlighted players clear by chip or Clear all; the table frame is its own stacking context.

### Not verified or left open

- **`ResearchTable`** (RD00's tables) and the kit `Table` elsewhere still have their own looks; moving them to `StatsGrid` is
  recorded in the pattern for each page's turn. RD00 is approved, so it changes only if the owner asks.
- **Two rapid clicks** on add-to-graph or overlay within one render can drop the first (URL state); the spec waits between
  clicks. A user clicking normally isn't affected.
- **CraftedNBA freshness:** sealed once; a re-seal is a new version, by hand.
- **Hosted demo:** not deployed (standing rule). The seal ships in the image (`COPY evaluation`).

Observed: no Ask or provider calls, `~/dev/courtlens-r16` untouched, the shared Postgres only read (the Python tests used
their own container), the owner's :8000 (auto-reloaded the API) and :3100 not restarted; 3180/4180 stopped, sandbox deleted.
