# RD13 Signal vs Noise: design evidence

Research → Signal vs Noise (`/research/signal-noise`), rebuilt from approved CourtLens Research patterns. Instructions and status:
[research design catalog, RD13](../../../research-design-catalog.md#rd13-signal-vs-noise--). How the analysis was built and what its numbers mean: [R03](../r03/README.md).

## Reference

None. There is no Databallr page for it, so each section borrows a named, approved CourtLens precedent (below). databallr.com and draftballr.com were not fetched.

Before the rebuild (:3100, read 2026-11-10): four stat tiles and seven stacked sections under the old left-aligned header, full width; 5 old tables and 3 native selects. 5,258 px tall at 1440 and 8,086 px at 390, 0 console errors, 0 page overflow, 0 broken images. The 3P% chart drew the fitted line out to 1,057 3PA, so it crossed 0.5 at about 419 while the page said "not reached". Screenshots: `sn-before-top-*`, `sn-before-full-*`.

## Round 1 (owner, 2026-11-10)

"Go with your recommendations and suggestions for optimal construction and layout of this page. Build it comprehensively." The proposal, with its answers to Q1 to Q4, is recorded with the instruction in the catalog.

**Built**

| Section | What it shows | Borrowed from |
| --- | --- | --- |
| Hero | `sq-hero research-hero`, one line, the meta line (player-seasons, players, seasons, registered before any fit), links to the Stats Shrunk columns and Learning | RD10, RD11, RD12 |
| How long until a stat means something? | One sentence: FT% after about 27 attempts, TS% after 169, 3P% never got there (0.49 at 480); shrinking predicted next season better for all 5 stats tested; what 0.5 means | RD10, RD11 answers |
| How many attempts each stat needs | A Percentages / Per 36 minutes switch; one strip per family on a shared scale: the 0.5 point with its 95% interval, a hollow 0.7 mark, a tick at the typical season, sorted fastest first with no rank (Q1). 3P% draws only its observed range, dashed, labelled "Not reached", with its largest bin's interval in a line under the strip. Then a compact `StatsGrid` (0.5 and 0.7 with intervals under them, typical season, largest bin with its interval, player-seasons), no `GridSearch` | RD11 shared scale, RD10 grids |
| Reliability by sample size | Kit chips grouped by family choose the stat; the stat name in each strip row opens it too (Q2). Bins with 95% bars, the 0.5 and 0.7 lines, the fitted curve over the observed bins only. Then the bins table, collapsed | RD06 chart method |
| A worked example | A team-tinted card with `PlayerAvatar`, search in place of the name, and a season picker listing only that player's seasons with a prior (from `GET /api/workbench/players/{id}/career`); a reset to the default example; the selection rule; Raw and Shrunk first in a compact grid, then the league prior and made/attempts; one formula line; raw and shrunk on one 0–100% scale with the prior; the season path game by game with a 3P% / FT% / TS% switch in category tints | RD03, RD05, RD12 |
| Does shrinking predict next season better? | One sentence; an All / Under 50 / 50–199 / 200 or more switch; gains over raw and over the prior mean first, in squared points with 95% intervals, then RMSE in points (Q3); green only where an interval excludes zero | RD10, RD11 |
| The league prior, season by season | One line from 1984-85 to 2026-27 for 3P%, 2P%, FT% or Rim FG%, with a Prior mean / Strength switch and points on hover; one line comparing strength with the stabilization point (Q4) | RD06 one measure on one axis |
| What this doesn't cover | The 7 families with reasons, visible | RD10 honesty lines |
| How to read | Three cards, a collapsed glossary | RD10, RD12 |
| About this page | Collapsed: method, levels (3P%'s fitted 419 named as not a stabilization point), priors, the test, coverage, limits, registration date, hashes, credits, the R03 evidence link | RD12 |

**One change from the proposal.** Item (4) said to draw the fitted curve over the observed bins. For 3P% that still crosses 0.5 (at 419 3PA, inside the observed 480), while no bin reaches it. So the curve is drawn only for stats that reach both levels; for 3P% the chart shows the bins and one line says why the curve is absent.

**Shared change.** `SeasonLineChart` gained an optional `floor`: no axis tick below it (the path's axis went to −10%). Without it nothing changes; a Vitest case covers it.

**Not changed.** No API, analysis, frozen result or interval. The worked example, test, priors and stabilization numbers are the served frozen run.

**Page size.** 5,709 px at 1440 (was 5,258) and 7,049 px at 390 (was 8,086), disclosures collapsed. Desktop is taller because the strip, curve, example scale and two line charts are new; the phone page is shorter.

**Found by the checks and screenshots, then fixed before reporting.** The strip's scale ran to 1,500 because it counted 3P%'s unreached fitted intervals; it now stops at what was observed (600). At 390 the hero meta overflowed by 165 px (separators inside no-wrap spans) and broke "2025-26" mid-value before that; the example grid's Shrunk column was off screen on a phone (now second); the last two game labels on the path collided.

| Check | Result |
| --- | --- |
| Lint (ESLint, Stylelint), typecheck | clean |
| Vitest | 852 passed (6 new: strip order, unreached levels off the scale, unit conversions, the win rule, the season list, the chart floor) |
| `r03-signal-noise` ×3 (rewritten for the layout, 6 tests) | 18/18 |
| Full Playwright (sandbox, mock API, 2 workers, 8 GiB cap) | 624 passed, 17 skipped, 0 failed |
| Real data ([`real-data-check.json`](real-data-check.json), [`real-check.mjs`](real-check.mjs), proxy [`../design-RD10/readonly-proxy.mjs`](../design-RD10/readonly-proxy.mjs), GET only) | 10,221 values, 0 mismatches, 0 console errors, 0 overflow, 0 broken images at both widths |
| Coverage of that check | Hero and answer; both strip families and both grids, every row; all 20 curves and bins tables at 1440, 6 at 390; every test band; all 8 prior series; What this doesn't cover; About. Worked examples: the default, Curry 2014-15, Abdul-Jabbar 1984-85, Yang 2026-27 (rim unknown), Curry 1990-91 (no games), James 2003-04 at 1440 (four at 390), each with every grid value, the formula, the scale and all three path series against `GET /api/signal-noise/player`, and its season list against the career endpoint. The search in place (focus, no list before typing, pick, Escape) and the reset |
| Layout and rules | 992 px column (366 at 390); one native select (the season picker); no hashes, project codes, ISO dates, hyphen-minus numbers or arrows in the visible text; no phone control under 40 px; tones only where a 95% interval excludes zero (the two zero-crossing prior gains under 50 stay neutral) |
| Photos ([`photo-check.json`](photo-check.json), [`photo-check.mjs`](photo-check.mjs)) | 12 portraits (6 examples × 2 widths): each the season's and team's photo, circular, uncut, logo beside the code. Control: with the card clipping and the photo pushed past its corner, the check catches it every time |

**Glance test** (`sn-top-1440.png`, `sn-answer-*`, full pages at both widths, viewed). In five seconds: what the page is (hero), the answer in one sentence, and the strip showing FT% early and 3P% with no point.

Screenshots viewed: `sn-top-*`, `sn-answer-*`, `sn-stabilization-*`, `sn-curve-*`, `sn-example-*`, `sn-test-*`, `sn-priors-*`, `sn-not-covered-*`, `sn-reading-*`, `sn-card-*`, the full page at both widths. Section captures can show the sticky site header or the Skip to content link across a section; neither is on the page there. Visuals were judged from the sandbox build; the CSS chunk :3100 serves was checked and carries the new rules.

## Round 2 (owner, 2026-11-10)

"give the selector highlight breathing room around the stats (fts, ftr, fg, etc.) It seems squished."

**Changed.** The stat name in each strip row was the kit `Button` with `variant="text"`, which has no inline padding (`kit:px-0`), so the pressed outline sat on the letters. It is now `variant="ghost"`: 12 px each side, the same pressed outline, and a hover fill. At 390 the label column went from 72 to 80 px, because "Rim FG%" measured 78 px with its padding. No other change from that instruction.

**Instruction 3:** "why does pressing a menu button in this chart/table auto scroll? I thought it wouldn't is there better behaviour?" It scrolled because round 1 (Q2) made a strip press both choose the stat and call `scrollIntoView` on the curve, jumping more than a screen. Now a press only selects the stat (pressed outline, curve and URL updated, page holds still). A kit ghost button, "{stat} curve" with a chevron, at the end of the strip's key moves to the curve when the reader asks: a smooth scroll, instant under reduced motion. The page's own 64 px `scroll-margin-top` on its sections is gone, because with the site's `scroll-padding-top` it left the heading 144 px under the header; it now lands at the site default, 80 px under the header. The chips above the curve already changed it in place and are unchanged.

| Check | Result |
| --- | --- |
| Label fit on :3100 (real data) | every label inside its column at 1440 (96 px, widest button 78) and 390 (80 px, widest 78); 0 page overflow; buttons 32 px tall, 40 on a phone |
| Strip press and curve button on :3100 ([`strip-select-check.mjs`](strip-select-check.mjs)) | at 1440 and 390: after pressing FG% the scroll position is unchanged (0 and 556 px) and the curve shows FG%; the button brings the curve heading to 144 px from the top (80 under the header); 0 overflow, 0 console errors |
| Lint (ESLint, Stylelint), typecheck | clean after both changes |
| Vitest | 852 passed |
| `r03-signal-noise` ×3 (sandbox, new test: a press holds the page still, the button moves to the curve) | 21/21 |
| Full Playwright (sandbox, mock API, 2 workers, 8 GiB cap) | 625 passed, 17 skipped, 0 failed |

Screenshots viewed: `sn-strip-labels-1440.png`, `sn-strip-labels-390.png` (3P% pressed), `sn-strip-select-1440.png`, `sn-strip-select-390.png` (FG% pressed, the curve button), all from :3100.

## Round 3 (owner, 2026-11-10)

"make the attempt number axis a little more visible"; "Should we add a small button near the stats to jump to their curves instead of the button in the bottom right"; "can we make this content below the table center aligned"; "Is there anything more we can do to improve this page."

**Changed.**
- The strip's attempt axis: 12 px (was 10), `--color-on-bg-secondary` (was tertiary), weight 500.
- Each strip row has a kit `IconButton` (xs, ghost, `chart-line`, "Go to the {stat} curve") in one column beside the names: it selects that stat and scrolls to the curve (smooth, instant under reduced motion). The name still only selects. Round 2's "{stat} curve" button under the strip is gone. The label column is 128 px on desktop (was 96).
- On a phone each row is two lines: name and icon on the left, the value on the right, and the track full width under them (342 px, was 154); the axis spans the full width too. The strip panel is 732 px tall at 390.
- Chart keys are centred.
- Question 4 was answered with suggestions in the session; nothing else was built.

| Check | Result |
| --- | --- |
| Strip on :3100 ([`strip-r3-check.mjs`](strip-r3-check.mjs)) | at 1440 and 390: no label or icon outside its column; tracks 680 and 342 px; key centred (equal 16 and 12 px margins); axis 12 px `rgb(201, 211, 230)`; pressing FG%'s name leaves the scroll position unchanged (0 and 622 px); 2P%'s icon selects 2P% and brings the curve heading to 144 px from the top; 0 overflow, 0 console errors |
| Lint (ESLint, Stylelint), typecheck | clean |
| Vitest | 852 passed |
| `r03-signal-noise` ×3 (sandbox; the jump test now uses a row icon) | 21/21 |
| Full Playwright (sandbox, mock API, 2 workers, 8 GiB cap) | 625 passed, 17 skipped, 0 failed |

Screenshots viewed: `sn-strip-r3-1440.png`, `sn-strip-r3-390.png` (FG% selected), from :3100.

## Round 4 (owner, 2026-11-10)

"Do them all comprehensively." (the six suggestions given after round 3)

**Changed.**
1. **Axes.** The curve's axes, the season path, the league prior and the example scale use the strip's axis look: 12 px, `--color-on-bg-secondary`, weight 500. `SeasonLineChart` is restyled only inside this page (`.sn-page .slc-*-label`); the shared component is unchanged. The example scale gains its own axis (0%, 25%, 50%, 75%, 100%; 0, 50 and 100 on a phone, where 75% and 100% collided) and its caption drops "0% to 100%".
2. **Strip marks on the curve.** For each level the stat reaches, a filled (0.5) or hollow (0.7) mark in the curve's colour where it crosses, with its served 95% interval as a bar, and a line at the typical season (median). The scale reaches every mark. 3P% reaches no level, so it shows only the typical season.
3. **Units in sentences.** `sampleWords` spells the unit out wherever a number sits in a sentence: the curve's line, the season path's empty note, About's fitted 3P% figure. Strip, grids and tooltips keep `sampleText` ("480 3PA").
4. **Curve picker.** The 20 chips are gone; a kit `Select` ("Curve stat") beside the curve's heading lists the stats under Percentages and Per 36 minutes. The page now has two native selects (this and the example season).
5. **Phone test table.** Under 768 px a Segmented "Test columns" switches between Gains and Errors, RMSE, with a shorter group label; the table is 0 px wider than its frame (it was 651 px in a scroll frame before RD13, and scrolled 47 px in round 1's layout). The server renders the desktop table, and the phone view follows `matchMedia`.
6. **What if** (approved by the owner here). Under the example scale: a Segmented for each stat with a served prior (3P%, FT%, 2P%, and Rim FG% when served), sliders for attempts (to 600, 400 for FT%, or the player's own if higher) and raw rate (0.5-point steps), starting at the player's season. It shows made/attempts, raw, shrunk, league prior, a 0–100% track, the share of weight on the player's own attempts, the formula, and a reset to the player's season. It uses `whatIf` in `lib/signal-noise.ts`, the same posterior mean (makes + α) / (attempts + α + β) as the frozen run, so at the player's own numbers it equals the served shrunk value (Vitest and the real-data check confirm this to 1e-9). No interval is computed, and the page says so. The slider copies RD02's approved ORtg Lab range input. No API, analysis, frozen result or interval changed.

**Page size.** 6,041 px at 1440 (round 1: 5,709) and 7,747 px at 390 (7,049): the what-if, the curve key and round 3's two-line phone strip.

| Check | Result |
| --- | --- |
| Real data ([`real-data-check-r4.json`](real-data-check-r4.json), [`real-check.mjs`](real-check.mjs) extended for round 4, proxy GET only) | 10,613 values, 0 mismatches, 0 console errors, 0 overflow, 0 broken images at both widths. New: every curve's marks and typical season against the served levels; the curve line's spelled-out units; the what-if for every stat of every example (start equal to the served shrunk value, counts, prior, formula), one slider move recomputed from the served prior, and the reset; the phone test in both views |
| Photos ([`photo-check-r4.json`](photo-check-r4.json)) | 12 portraits, 0 faults, control caught |
| Lint (ESLint, Stylelint), typecheck | clean |
| Vitest | 854 passed (2 new: units in words; the what-if starts at the served shrunk value, and the prior's weight halves at its strength) |
| `r03-signal-noise` ×3 (sandbox; new: curve marks, what-if, phone test) | 27/27 |
| Full Playwright | not run: no shared component changed (the owner's rule from 2026-11-10: full suite for shared code and before ✅) |

The phone example-scale fix came after the sandbox build; it was checked on :3100 (3 labels shown, none overlapping, 0 overflow, 0 console errors).

Screenshots viewed: `sn-strip-r4-*`, `sn-curve-r4-*` (3P%, typical season only), `sn-example-scale-r4-*`, `sn-whatif-*`, `sn-test-r4-*`, `sn-priors-r4-*`, `sn-full-r4-*`; FT%'s curve with both marks was viewed on :3100.
