# RD12 Lineup Model: design evidence

Research → Lineup Model (`/research/lineup-model`), rebuilt from approved CourtLens Research patterns. Instructions and status:
[research design catalog, RD12](../../../research-design-catalog.md#rd12-lineup-model--). How the analysis was built and what its numbers mean: [R14](../r14/README.md).

## Reference

None. There is no Databallr page for it, so each section borrows a named, approved CourtLens precedent (below). databallr.com and draftballr.com were not fetched.

Before the rebuild (:3100, read 2026-11-09): four stat tiles and ten stacked headings, full width; 9 old tables and 5 native player dropdowns. 7,246 px tall at 1440 and 10,530 px at 390, 0 console errors, 0 page overflow, 0 broken images. Those measurements are in the catalog; the before screenshots were not kept.

## Round 1 (owner, 2026-11-09)

"Go with your recommendations and suggestions for optimal construction and layout of this page. Build it comprehensively." The proposal and its three recommendations are recorded with the instruction in the catalog.

**Built**

| Section | What it shows | Borrowed from |
| --- | --- | --- |
| Hero | `sq-hero research-hero`, one line, the meta line (held-out stints, test seasons, registered before any fit), links to RAPM Ratings and Metric Backtest | RD10, RD11 |
| Does the lineup model beat ridge RAPM? | One sentence (both miss by 94.08 per 100; ridge's edge is 0.000011, no practical difference), the size against ridge's edge over home court (about 17,000 times), what the registered rule does and doesn't say, then one strip of the three pooled gains on a shared scale | RD10 answer, RD11 shared scale |
| Lineup tool, points per 100 possessions | Five team-tinted cards with `PlayerAvatar`, season photo, logo beside code, status in category tints, ridge rating in gold/blue, and search in place under the photo; a reset to the most-used five; net rating and 80% interval in a compact `StatsGrid`; the interaction as one sentence; "model output, not a forecast" visible | RD03, RD05, RD11 Why card |
| The test: stint error, points per 100 possessions | Gains first (all three served pairs), then errors, by season and pooled; a noise line; then interaction size against additive size, with correlation at full digits | RD10, RD11 |
| In the game backtest, final margin in points | 11 rows in registered order, gains before RMSE, the verdict in words, a don't-compare line for the two 2-season rows, a link to Metric Backtest. The registration's lead pairs are in one sentence above the grid | RD10 |
| Player similarity map | The warning above the map (1.9% against 1.8%), neutral dots, the five in `--color-category-3`, names on hover, the three reading notes beside it, a statement when a chosen player has no dot | RD10 labels |
| How to read | Three cards and a collapsed glossary | RD05, RD10 |
| About this page | Collapsed: limits, selection grids, coverage, cold start, error by who was on the floor, method, seed check, backtest method, credits, hashes, the R14 evidence link | RD06, RD10, RD11 |

**The owner's three answers.** Q1: the lineup-against-ridge gains stay uncoloured, in the strip, the test grid and the backtest's ridge row, which reads "Better by the registered rule, no practical difference". Other rows keep green and red. Q2: the tool comes before the test. Q3: the map stays visible, last among the results, with no player search.

- **Faults fixed.** The top chart fitted its axis to ±0.000029, so a 0.000011 gap filled the frame in red; on one scale with the home-court gains it now sits on zero. The map's warning was below the map, although R14's README says above. Correlation read 1.0000 where the served values are 0.9999999982 to 0.9999999996. The backtest rows were alphabetical and two 2-season rows sat unmarked among the 3-season rows. The Example note showed with no result when the weights were absent. Project codes, a docs path and hashes were in the page body.
- **Served but never drawn before:** the per-season home-court gains and the largest interaction on any test stint.
- **Visitor copy.** R01, R08, IM02, a docs path and the version ids are gone. Served text carrying them is replaced on the page by `visitorText`; the API is unchanged.
- **Player rows.** One Rating value per card: ridge and additive ratings differ by at most 0.0066 across all 802 players, and a sentence says so. Exact additive values stay on `data-additive`.
- **Weights absent (the hosted demo).** One plain line replaces the tool, with no pickers and no Example note. The test, backtest, map and warning stay, and the most-used five stay marked. Covered by the spec and by the real-data check on a modified payload.
- **Invalid links.** A `five` with an unknown or repeated player falls back to the default five.
- **Nothing else moved.** No API, analysis, frozen result or interval changed. Scores are read from `courtlens-lineup-model-v1-scores.json` through the API, as before.

**Page size.** 4,295 px at 1440 with both disclosures collapsed (was 7,246) and 5,949 px at 390 (was 10,530). With both opened: 8,533 and 12,289.

**Found by viewing the screenshots, then fixed and re-verified.** The strip's scale sat 189 px off its bars (its column widths were set on a sibling); the first check run measured this without failing on it, and it now fails. The backtest sentence read "error is +0.68" for what is a gain. On a phone the tool table pushed the 80% interval off screen. The selection grid's rows were in key order (16 before 8, 0.0001 before 0.00001). "Thousands of times smaller" overstated 2025-26, which is about 1,350. The cards' figure had no label. The check now covers the scale, the phone interval, the row order and the ratio.

| Check | Result |
| --- | --- |
| Lint (ESLint, Stylelint), typecheck | clean |
| Vitest | 843 passed |
| `r14-lineup-model` ×3 (rewritten for the layout, 11 tests) | 33/33 |
| Full Playwright (sandbox, mock API, 2 workers, 8 GiB cap) | 620 passed, 17 skipped, 0 failed, on the final build |
| Real data ([`real-data-check.json`](real-data-check.json), [`real-check.mjs`](real-check.mjs), proxy [`../design-RD10/readonly-proxy.mjs`](../design-RD10/readonly-proxy.mjs), GET only) | 6,628 values (3,493 at 1440 over 12 loads; 3,135 at 390 over 9 loads), 0 mismatches, 0 console errors, 0 overflow, 0 broken images |
| Coverage of that check | The default five, one through the search, a reset, and 7 more at 1440 (4 at 390): one swap, top five, bottom five, one box player, five box players, a mixed spread, 2023-24 photos, each through `GET /api/lineup-model/fit`; the strip; every test and diagnostic value; every backtest row; all 546 map points; every About grid; both invalid links; the weights-absent state |
| Which pairs exist | The backtest's rows, order and pair direction are written out by hand in the check, so a lookup that silently finds nothing fails |
| Layout and rules | 992 px column; hero icon centred; strip scale 0 px from its bars; lineup-against-ridge gains uncoloured; no column of dashes; 0 native selects; no section hairlines, card edge, watermark, arrow character, ISO date, hyphen-minus number or project word; no phone control under 40 px; whole-pixel control heights; season-and-team photo URL on every card; tool on the name's line on a phone and no name cut |

**Glance test** (`lm-top-1440.png`, full pages at both widths, viewed). In five seconds: what the page is (hero), the answer in one sentence, and the strip showing the gap sitting on zero.

Screenshots viewed: `lm-answer-*`, `lm-tool-*` (default, one box player, five box players, unavailable), `lm-search-1440.png`, `lm-test-*`, `lm-backtest-*`, `lm-map-*` (default and with a box player), `lm-reading-1440.png`, `lm-glossary-1440.png`, `lm-about-1440.png`, the full page at 1440. Section captures can show the sticky site header or the Skip to content link across a tall section; neither is on the page there. Visuals were judged from the sandbox build; the CSS chunk :3100 serves was stale after the last CSS change, was refreshed with the import toggle, and now has the new rules.

## Round 2 (owner, 2026-11-09): the search, the Six-Factor photos, two questions

| # | Change | Result |
| --- | --- | --- |
| 2 | "the player search in the lineup looks wonky" | The search takes the name block's place at the card's full width, so the photo and rating stay and the rating doesn't move (0 px at 1440). The card's own tool turns into the cancel: no X outside the field, and none inside it (`LookupInput` gained an optional `clearable`; without it nothing changes). The list opens only once something is typed. Escape, the cancel or a click elsewhere leaves it, so no card is left holding a stranded field |
| 4 | "the palyer photos are still square cropped" (`/research/rapm`, Leaders) | `.chart-ranked-label`'s `overflow: hidden` cut each photo's ring flat at the top and left, against RD00's "never clipped". The Leaders chart no longer clips; the name and the line under it truncate themselves. Only `.rapm-headline` changed, in `rapm-ratings.css` |

Questions 3 (positions) and 5 (more improvements) were answered in the report and nothing was built for them.

**Page size.** Unchanged: 4,295 px at 1440 and 5,949 px at 390 with the disclosures collapsed.

**Found by the check and the screenshots, then fixed.** The open card's rating sat 6 px lower than its neighbours' (a 64 px block replacing 58 px).

| Check | Result |
| --- | --- |
| Lint, typecheck | clean |
| Vitest | 843 passed |
| `r14-lineup-model` ×3 (12 tests, one new for the search) | 36/36 |
| Full Playwright | 621 passed, 17 skipped, 0 failed, on the final build |
| Real data ([`real-data-check.json`](real-data-check.json), [`real-check.mjs`](real-check.mjs)) | 6,645 values (3,502 at 1440 over 12 loads; 3,143 at 390 over 9 loads), 0 mismatches, 0 console errors, 0 overflow, 0 broken images. New: the field inside the card, the rating kept and unmoved, no list before typing, no extra button, and all three ways out |
| Photos ([`photo-check.json`](photo-check.json), [`photo-check.mjs`](photo-check.mjs)) | Both Six-Factor tabs, 1440 and 390, real data: 25 portraits on RAPM Ratings and 445 on Six-Factor, all circular, 0 cut by a box that doesn't scroll. Control: with the old rule put back, the check finds all 5 leaders cut at each width, so it does detect this fault |

Screenshots viewed: `lm-search-1440.png`, `lm-search-390.png`, `rapm-leaders-1440.png`, `rapm-leaders-390.png`. The CSS chunk :3100 serves was checked for the new rules.

## Round 3 (owner, 2026-11-09): "You can make all of those improvements, comprehensively"

| # | Change | Result |
| --- | --- | --- |
| 1 | How close the two models are | One sentence above the interaction line, from the served nets: 0.000022 apart on the default five, 0.00078 on the phone example with a box-score player |
| 2 | No jump on a swap | The last prediction stays, dimmed and `aria-busy`, until the new one arrives; no skeleton and no change of page height. `useFeed` gained an optional `stale`; existing callers are unaffected |
| 3 | The test's intro | Two text blocks and the legend. The note that lineup-against-ridge gains stay uncoloured no longer says "better by the registered rule" per season: that rule is pooled |
| 4 | Backtest captions | "3 seasons · 3,655 games", naming seasons only on Box-prior RAPM and Projected Impact; one line each on a phone |
| 5 | Phone cards | A 56 px photo and two lines beside it (name; team and status) with the rating as one line: 108 px a card. Page 196 px shorter at 390 |
| 6 | Positions | One line under the cards: neither model takes a position as an input, so neither judges a lineup's balance. No position labels were added |
| 7 | RAPM Ratings Leaders | Source label now reads "CourtLens lineup model", without IM04 |

**Page size.** 4,297 px at 1440 with the disclosures collapsed and 5,753 at 390 (round 2: 4,295 and 5,949).

**Found by the check.** A script fault of its own: the swap test reset the five, so the later reset had no button to click. The phone card limit in the check was a guess (100 px); the card as designed is 108 px and the limit is 112.

| Check | Result |
| --- | --- |
| Lint, typecheck | clean |
| Vitest | 843 passed |
| `r14-lineup-model` ×3 (13 tests, one new for the swap) | 39/39 |
| Full Playwright | 622 passed, 17 skipped, 0 failed, on the final build |
| Real data ([`real-data-check.json`](real-data-check.json), [`real-check.mjs`](real-check.mjs)) | 6,730 values (3,548 at 1440 over 12 loads; 3,182 at 390 over 9 loads), 0 mismatches, 0 console errors, 0 overflow, 0 broken images. New: the model gap for every five, a held fit call (old result kept, no skeleton, no jump), the two intro blocks, the phone card and photo sizes |
| Photos ([`photo-check.json`](photo-check.json), [`photo-check.mjs`](photo-check.mjs)) | Re-run on the final build: 470 portraits per width, 0 cut; control 5 of 5 |

Screenshots viewed: `lm-tool-box-390.png`, `lm-tool-1440.png`, `lm-test-1440.png`, `lm-backtest-390.png`, `rapm-leaders-1440.png`. The CSS chunk :3100 serves has the new rules.
