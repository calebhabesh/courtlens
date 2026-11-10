# RD16 Points Forecasts: design evidence

Research → Methods → Points Forecasts (`/forecasts`) with the Evaluation Archive (`/evaluation`) as its second route tab, rebuilt from approved CourtLens Research patterns. Instructions and status: [research design catalog, RD16](../../../research-design-catalog.md#rd16-points-forecasts--). How the experiments were built: the [workbench progress log](../../../workbench-implementation-progress.md) (points experiment, P7) and [model-evaluation.md](../../model-evaluation.md) (the archive, M6).

## Reference

None. There is no Databallr page for it, so each section borrows a named, approved CourtLens precedent (below). databallr.com and draftballr.com were not fetched.

Before the rebuild (:3100, read 2026-11-10, [`before-check.mjs`](before-check.mjs), [`before-check.json`](before-check.json)): both routes under the old left-aligned header, full width. `/forecasts`: a paired-bar coverage chart, four stat tiles, then gates, holdout, slices and the ledger as 5 old tables with badges; 5,397 px tall at 1440 and 6,570 at 390. `/evaluation`: the same look with 1 old table; 1,544 and 1,976 px. 0 console errors, 0 overflow, 0 broken images and 0 native selects on both. Project codes in the body (`basketball-points-v1`, `prior_blend`, `player_only`, `player_plus_context`, "Block F", "M6"), the phone subtitle cut mid-word, no photos in the ledger and no logo beside CLE, PHI, IND, NOP, MIN or HOU. Screenshots: `fc-before-*`.

## Content check (2026-11-10)

What the API serves: the points experiment's out-of-time test (2025-26, 48,870 forecasts, three models, MAE, RMSE, player-balanced errors, 80% coverage and width for established and early-season players), its four promotion rules and decision, validation folds with every tuning config, calibration quantiles, 8 slice dimensions (no slice intervals), limitations and the model card; the issuance ledger (489 issued, 313 scored, 176 did not appear or are unknown); and the archive (2023-24 reference-points test, three models, its paired interval, gates with the failed slice, slices with coverage).

Found and decided by the owner (Q1 to Q3): the "prospective" ledger is a back-dated pipeline test (all 489 issued Oct 1, 2026 for games on Jan 15–17, 2026, inside the test season); the ledger API pages on tied sort keys (489 rows paged by 100 gave 420 unique), so the page shows one request of 50; the archive's Data Health rows describe today's database, not the experiment. Fixed as rules: slice changes were coloured by sign with no interval, slice labels showed raw keys, and an "Awaiting 2026-27 tipoff" note contradicted the served status.

## Round 1 (owner, 2026-11-10)

"Go with your recommendations and suggestions for optimal construction and layout of this page. Build it comprehensively." The proposal, with its answers to Q1 to Q4, is recorded with the instruction in the catalog.

**Built**

| Section | What it shows | Borrowed from |
| --- | --- | --- |
| Hero and tabs | `sq-hero research-hero`, one line, route tabs Points Forecasts / Evaluation Archive centred under it (both URLs kept), a meta line and a link to Methodology | RD00 tabs, RD10–RD13 heroes |
| Does a smarter model forecast points better? | One sentence (all three miss by about 4.6 points a game), the served paired gain in words with its 95% interval, the rule in one line; then each model's typical miss as a bar from zero and the gain with its interval on the same points axis, so 0.015 looks like 0.015 | RD10, RD11 answers; RD12 gap to scale |
| The three models, side by side | Compact `StatsGrid`: the gain first (only the finalist is paired; uncoloured, its interval includes zero), typical miss, RMSE, per-player miss, then coverage for established and early-season players with widths, and forecasts; a Misses / 80% ranges switch on a phone | RD10 grids, RD11 gains first, RD13 phone switch |
| Are the 80% ranges honest? | One sentence with the served model's coverage and width; six rows on one 0–100% scale against the 80% target, key centred | RD11 shared scale, RD13 axes and keys |
| The rule fixed before the test | Four rows: rule, what it needed, what was observed, Passed / Not passed in words (no green/red) | RD10 honesty lines |
| Where the misses differ | A grouped select (The player / The schedule) of the 8 served dimensions, labels for every served key, a compact grid of each model's typical miss and the trees-against-blend change (uncoloured; no slice interval), the missing-opponent-data line; a Misses / Change switch on a phone; selecting holds the page still | RD13 grouped select and phone switch |
| Forecasts issued so far | One visible line: none yet for a game still to come; the newest of the 489 is for Jan 17, 2026; the 50 shown were issued Oct 1, 2026, after their games, inside the test season, a back-dated test. Collapsed: totals (unknown, not zero), their error (not new evidence), and the 50 rows as Stats player cards with the 2025-26 season photo, logos beside both teams, the forecast and its 80% range on one scale labelled in the header, the points scored marked on it; a Forecast / Result switch on a phone. A ledger issued before its games reads as forecasts instead | RD11 games that aren't a test, RD11 interval column, RD08 player rows |
| An earlier experiment | One line and a button to the archive tab | RD05 link to the page that has it |
| How to read | Three cards, a collapsed glossary | RD10, RD12 |
| About this page | Collapsed: target, the models with their technical names, selection, the range widths, test counts, limits, freeze date, run and calibration identifiers, the splits grid and the served model card | RD12, RD13 |
| Evaluation Archive tab | The answer (the context trees missed by 0.14 reference points more than EWMA-20, 95% 0.11 to 0.18 more, red because the interval excludes zero), the target named once, the miss strip, the models grid with validation errors, coverage, the four rules with the failed slice named, slices with coverage, About (counts, coverage dates, warnings and limits, identifiers, the report link, model card link, splits, terms). Today's builds are gone (Q3) | the same patterns |

**Not changed.** No API, analysis, frozen result or interval. Every number is a served value or, for the change column, the difference of two served typical misses. The archive's split dates and target formula, which the API doesn't serve, are written once in `lib/points-forecasts.ts` and checked against `evaluation/config/baseline-v1.yaml`; the points splits against `points-v1.yaml`.

**Shared changes.** `app/globals.css` imports the new stylesheet after Signal vs Noise's. Specs updated for the new layout: `workbench.spec.ts` (forecasts test), `pc12-demo-hygiene.spec.ts` (the archive heading), `visual-baselines.spec.ts` (ready texts), `pc12-headlines.spec.ts` (Forecasts no longer uses the boxed headline; its two baselines removed).

**Found by the checks and screenshots, then fixed before reporting.**
- The first ledger sentence put Oct 1 and Jan 16–17 on all 489 forecasts; those dates come from the 50 shown. It now says the newest of the 489 is for Jan 17, 2026 and that the 50 newest were issued on Oct 1, 2026, after their games.
- On a phone the rules grid scrolled sideways; the requirement now sits under each rule's name. The archive's models grid had four columns in one phone view (Validation now joins the ranges view), the About splits grid scrolled 314 px (the season moves under the step), and the ledger's result view held three columns (Basis is a third phone view, with auto column widths).
- `StatsGrid` drew a column's `headerAfter` only on sortable columns, so the ledger's 0–40 scale was missing; and the page's width override squeezed the ledger's range column to a sliver. Both fixed (the first in the shared grid, below).
- Long names were cut with an ellipsis ("Bennedict Mathu…", "Valančiūnas" on a phone); they now wrap whole (RD11).
- The coverage bars carried `data-tone="share"`, which reads as a tone; now `data-series`. The archive headline mixed "more" with negative bounds; it now reads "95% interval 0.11 to 0.18 more". "+6.3% worse" lost its doubled sign. The phone header "Established" was cut; the columns read "10+ games" and "1 to 9 games", as the glossary defines them.
- An assertion in `workbench.spec.ts` matched DO_NOT_PROMOTE inside the collapsed model card; it now checks visible text only.

**Shared change.** `StatsGrid` now draws `headerAfter` on plain headers too (one line in `components/research/stats-grid.tsx`, a Vitest case). Its only other user, Projected Impact, sorts that column, so it is unchanged.

**Page size.** `/forecasts` 3,532 px at 1440 (was 5,397) and 4,537 at 390 (was 6,570); `/evaluation` 2,489 and 3,163 (was 1,544 and 1,976: the miss strip, coverage strip, rules and slices are new). Disclosures collapsed.

| Check | Result |
| --- | --- |
| Lint (ESLint, Stylelint), typecheck | clean |
| Vitest | 865 passed (11 new: the gain's sign and bounds, the 95% colour rule, estimands, issue timing, the ledger span and test split, seasons, unknown outcomes, slice labels and order, model order, project words; and `headerAfter` without sorting) |
| `comparison-evaluation` ×3 (sandbox, real-API fixtures for RD16; 6 new tests) | 27/27 |
| Specs updated for the layout (`workbench`, `pc12-headlines`, `pc12-demo-hygiene`, `visual-baselines`) | pass; 6 baselines changed by design, regenerated and viewed (`forecasts-*`, `evaluation-*`, `pc12-c-evaluation-*`); the 2 `pc12-b-forecasts-*` baselines removed with their test |
| Full Playwright (sandbox, mock API, 2 workers, 8 GiB cap) | 630 passed, 17 skipped, 0 failed (a first run before the fixes: 623 passed, 7 failed, the 6 baselines changed by design and the over-broad DO_NOT_PROMOTE assertion) |
| Real data ([`real-data-check.json`](real-data-check.json), [`real-check.mjs`](real-check.mjs), proxy [`../design-RD10/readonly-proxy.mjs`](../design-RD10/readonly-proxy.mjs), GET only) | 2,470 values, 0 mismatches, 0 console errors, 0 overflow, 0 broken images at both widths |
| Coverage of that check | Both tabs at 1440 and 390: hero meta, the answer and its served gain, the miss strip (every model, the gain, its tone), every model-grid value in both phone views, every coverage row, all four rules of both experiments, every subgroup of all 8 points slices and 5 archive slices in every phone view, the ledger line, totals, accuracy, axis and all 50 rows in every phone view, About (counts, calibration widths, run id, the model card byte for byte, archive counts and coverage dates). Both frozen protocols against `evaluation/config/baseline-v1.yaml` and `points-v1.yaml` (freeze dates, every split, the target formula, the four thresholds) |
| Layout and rules | 992 px column; one native select per tab (the grouped slice select); no table scrolls sideways in any phone view, About included; no hashes, project codes, ISO dates or hyphen-minus numbers in the visible text; tones only on the archive's paired gain (95% interval below zero), none on the points tab |
| Photos (in the same check) | 100 ledger portraits (50 × 2 widths): each the 2025-26 photo of the player's team (its URL carries `season=2025-26&team=…`), loaded, names never cut, a loaded logo beside the team code and the opponent |

**Glance test** (`fc-full-1440.png`, the top of both phone pages, viewed). In five seconds: what the page is (hero and tabs), the answer in one sentence, and three bars of equal length with a gain at zero beside them.

Screenshots viewed: `fc-full-*`, `ev-full-*`, `fc-ledger-*` and the six regenerated baselines. Visuals were judged from the sandbox build; the CSS chunk :3100 serves was checked and carries the latest rules.

## Round 2 (owner, 2026-11-10)

"Is there anything else we can improve on the page, before moving to the next?" Six suggestions were given; the owner answered "Build them all comprehensively."

**Changed.**
1. **Ledger toggle.** The 50 forecasts open from a small kit `ButtonSummary` ("Show the 50 newest of 489 forecasts", chevron turning over) inside the ledger section, so the section has one heading instead of a second full-size one.
2. **Scale note.** Under the miss chart, when the gain's interval spans under 3% of the axis, one centred line: "The gain is drawn to the same scale as the misses. Its whole interval spans 0.066 points, too small to see beside a miss of about 4.6." (RD12). The archive's reads 0.067 reference points.
3. **Distance from the target.** Each coverage row adds its distance from 80% in percentage points ("+0.6 pts from 80%", RD10), above the width; the bars are unchanged. One line under the key says what a point means, using the first row's own value.
4. **How the models were chosen.** A collapsed grid after the rules: on the points tab the 3 simple averages and all 8 tree settings, on the archive tab its served average and 8 tree settings, each with fold 1, fold 2 and pooled typical misses (and forecasts on desktop), the chosen ones named in words ("Chosen: the served model", "Best setting of its type", "Chosen: the finalist"). The sentence that the lowest pooled miss won each comparison is shown only when the served numbers bear it out (they do on both tabs; the check recomputes it). Uncoloured: no interval is served for these errors. Three columns on a phone.
5. **Slice pattern.** One line per dimension, computed from the served changes: where the trees did best and worst (for games played this season, 1 to 4 at −0.245 points and 40 or more at +0.021), or that they missed by less or more everywhere, ending "No interval is served for a slice, so this is a pattern, not a result, and nothing is coloured." The change note no longer repeats that sentence.
6. **Archive reading.** The archive tab has the same How to read cards and a collapsed glossary (its terms moved out of About).

**Found by the checks and screenshots, then fixed before reporting.** The archive's selection grid ran 39 px past its frame on a phone (a shorter phone header and lead column); the coverage note's "0.6% more of games" now says "0.6 more games of every 100"; the archive's selection sentence dropped its one simple average; "L2 0" broke across lines (each number now holds to its word with a no-break space). After the CSS change :3100 served the old chunk; the import was toggled and the served chunk checked.

**Not changed.** No API, analysis, frozen result or interval; no shared component (so the full suite wasn't rerun, by the owner's rule). The validation grid shows served values only.

| Check | Result |
| --- | --- |
| Real data ([`real-data-check-r2.json`](real-data-check-r2.json), [`real-check.mjs`](real-check.mjs) extended for round 2, proxy GET only) | 2,820 values, 0 mismatches, 0 console errors, 0 overflow, 0 broken images at both widths. New: both scale notes, every coverage row's distance and the note, every candidate of both selection grids (folds, pooled, chosen, finalist, labels) with the lowest-pooled rule recomputed, the pattern line of every points slice, the ledger toggle and its single heading, the archive's reading cards and glossary; no table scrolls sideways, the selection grids included |
| Photos (in the same check) | 100 ledger portraits, 0 faults |
| Lint (ESLint, Stylelint), typecheck | clean |
| Vitest | 868 passed (3 new: setting labels, candidates and the lowest-pooled rule, the slice pattern) |
| `comparison-evaluation` ×3 (sandbox; 2 new tests) | 33/33 |
| Layout baselines (`visual-baselines`, `pc12-demo-hygiene`, `workbench` forecasts tests) | 10 passed, unchanged |
| Full Playwright | not run: no shared code changed this round |

Screenshots viewed: `fc-r2-miss-*`, `fc-r2-coverage-*`, `fc-r2-selection-*`, `fc-r2-slices-*`, `fc-r2-ledger-closed-*`, `ev-r2-reading-*`, `ev-r2-selection-*`, `fc-r2-full-*`, `ev-r2-full-*`.

## Approved (owner, 2026-11-10)

"Great, I approve this page." Row ✅. The settled rules are in the alignment plan ("Settled in RD16"). The full Playwright run owed before ✅ (sandbox, mock API, 2 workers, 8 GiB cap): 632 passed, 17 skipped, 0 failed.
