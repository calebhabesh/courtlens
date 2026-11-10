# RD02 — ORtg Calculator, round 1: Databallr's ORTG Lab

Measured 2026-11-07 on branch `research` from `1c88453`. Parents: [Research design catalog](../../../research-design-catalog.md)
RD02, [Research progress](../../../research-progress.md), R10 data in [r10](../r10/README.md). Page: `/calculator`.
**Awaiting the owner.** Only the owner marks ✅.

Design only. No Python, API, registration, frozen result or served number changed; the shared Postgres was only read
(through the owner's API). The lab computes on the page from the served counts, which R10 recorded as the design phase's
arithmetic; the owner confirmed it ("use your best judgement", answer (a) below).

## Reference and instructions

Reference: the saved page `~/Downloads/Webpages/DraftBallr/Offensive Rating Calculator _ databallr.html`, rendered offline
with its 12 script tags and every `crossorigin=""` stripped, a `<base>` at the saved folder and every non-`file://` request
blocked (the only host blocked was databallr.com; it was never fetched), plus three of the owner's screenshots of it. Only its
Decomposition tab was rendered when it was saved, so the Marginal value board and Context notes tabs are this page's design.

Owner (2026-11-07): *"Can you use your best judgement and suggestions for optimal layout. I would like our page to be the
same as Databallr's and then we can build from there. Our current page is too information dense. I like Databallr's layout,
we should copy it."* That answered the five questions under the gap list with the recommended options:
(a) the lab computes Eq. (11) on the page, with Databallr's split rebounds and master dials; (b) season and clearable team
starting points; (c) the hypothetical calculator (B27) goes; (d) R10's observed tables move into a collapsed section;
(e) the sliders panel and the stepper board both stay.

## What changed

| Before | After |
| --- | --- |
| "Hypothetical Calculator": eight probability inputs of a user-assumption repeated-chance model (B27, not the paper's formula), four tiles, a sensitivity table, full width | Databallr's ORTG Lab (`components/ortg-lab-view.tsx`, arithmetic in `lib/ortg-lab.ts`), in `.rs-column` at Databallr's 1352 px. The hypothetical view, its flow functions and their tests are removed |
| Plain page header | Databallr's hero bar through `PageHeader`: the ORTG LAB pill (calculator icon), "Offensive Rating Calculator", Paper link (arXiv) |
| — | Inputs panel: Season and Team pickers (team clearable, logo beside it), Reset, 12 sliders in Shooting (eFG%, 2P%, 3P%, FT%, TS%), Volume / Mix (3PA Rate, FT Rate, TOV%) and Rebounding (ORB%, 2P / 3P / FT OREB%), each with its value and ΔORTG per point |
| — | Equation card: ORTG (large, accent) = xSHOT × xEFF × xPOSS with Databallr's captions, league average and "vs avg" |
| — | Tabs (kit `Segmented`): Decomposition (Shot Profile and Possession Flow cards, Databallr's), Marginal value (all 12 ΔORTG ranked as bars), Context notes (starting point, how ΔORTG reads, estimated possessions, accounting not forecast) |
| — | Stepper board: four tiles, Reset to the starting point, Show sliders, 12 cards (− value + and ΔORTG) in Databallr's order; four columns, two on a phone |
| — | Methodology panel in Databallr's form: intro crediting Poropudas and Halme, the Calculator Form well, four cards (turnovers and possessions, rebounding adjustments, eFG and TS controls, exact at the start) |
| R10's six plain tables always open (league inputs, marginals, rebounds by miss, against the paper, μ by season, 30 teams), caveats, credits | The same data in the collapsed **Observed Inputs & Caveats**, every table on `StatsGrid` compact (one header row, one lead edge), with caveats, credits and registration |
| Menu "Hypothetical Calculator" | Menu "ORtg Calculator" (D8); page title "Offensive Rating Calculator" |

Sign colours: ΔORTG and "vs avg" use the identity tones (gold above zero, blue below, none at 0.00); no interval is served,
so never green/red. Sliders and steppers are kit `IconButton`s and native range inputs (40 px tall on a phone).

## The arithmetic (lib/ortg-lab.ts)

- **Start.** Each served row (league or team, one season) is rebuilt from its counts: 2P%, 3P%, FT%, 3PA rate, FT Rate
  (FTA/FGA), TOV% (Eq. 10), and OREB% after missed twos, threes and final free throws. In 2025-26 the league's rebounds by miss
  add up to its ORB% exactly (36,509 = 36,509).
- **Rating.** xSHOT = 1 − TOV%; xEFF = FT Rate × FT% + 2 eFG% (the paper's FTr + 2 eFG%); xPOSS = 1 / (1 − ORB%(1 − FG%) + μ
  FT Rate), where ORB%(1 − FG%) is the sum over miss kinds of misses per FGA × rebounded share × OREB%. That is Eq. (11)
  rewritten; and-one rebounds stay at the starting rate.
- **Master dials.** eFG% +1 writes +1 2P% and +⅔ 3P% (exactly +1 eFG%); TS% moves 2P%, 3P% (⅔) and FT% by the amount that
  moves TS% exactly; ORB% moves 2P and 3P OREB% together by the amount that moves ORB% exactly.
- **ΔORTG.** The rating change for one point better from the current state (TOV% one point down).

| Check (Vitest, `lib/ortg-lab.test.ts`, on the real-API fixtures) | Result |
| --- | --- |
| Start reproduces served ORTG and inputs, 12 league seasons + 60 team rows | all within 1e-4 (served values are rounded to 6 places) |
| After ten moves of every kind, rating = Eq. (11) on the inputs shown | within 1e-9 |
| Master dials move by exactly what was asked | within 1e-9 |
| TOV% and ORB% ΔORTG = served marginals (same moves) | within 1e-5 |

The served eFG%, FT% and FT-rate marginals use the paper's inputs (FTr = FTM/FGA, eFG with FG), so they differ slightly from
the lab's controls; they stay in the collapsed table as served.

## Verification

| Check | Result |
| --- | --- |
| Lint (ESLint + Stylelint) | 0 errors, 0 warnings |
| Typecheck | clean |
| Vitest (in the repo) | 812 passed (117 files); 5 new lab tests; the 3 hypothetical-flow tests removed with their code |
| Python | none changed; ruff, mypy and pytest not needed |
| Page Playwright (`r10-wingspan-calculator`, `route-polish`, `advanced-research`) ×3 | 60/60. R10 calculator tests open the collapsed section first; new RD02 tests at 1440 and 390 (start equals the fixtures, stepper, slider and dial moves stay Eq. (11), reset, team load and clear, tabs); the B27 calculator test removed with B27; `route-polish` checks the lab's Result region |
| Full Playwright (sandbox `~/.cache/courtlens-tmp`, mock API 4180, build 3180, `MemoryMax=8G`) | First build: 592 passed, 17 skipped, 2 failed (the `calculator` visual baselines, changed by design). Regenerated after deleting them, viewed; the phone one showed the Paper link over the title, fixed; a second fix stopped the open section overflowing on a phone. Final build: **594 passed, 17 skipped, 0 failed**; visual spec 84/84 |
| Real data ([`real-data-check.json`](real-data-check.json), [`real-check.mjs`](real-check.mjs), [`readonly-proxy.mjs`](readonly-proxy.mjs)) | Owner's :8000 through the read-only proxy on 4180 (GET 200, POST 405; Origin rewritten to localhost:3100), production build on 3180. Three scenes (league 2025-26, league 2016-17, best team 2018-19 GSW) at 1440 and 390, 266 values each: every slider and stepper value, ORTG = served and = Eq. (11) on the served inputs, league average, vs avg, terms and tiles, decomposition facts, TOV%/ORB% ΔORTG = served; twelve stepper moves (each shown ΔORTG = the change it makes; rating = Eq. (11) on the drawn inputs), a slider move, reset; every observed table cell and team order. **1,596 compared, 0 mismatches**, 0 console errors, 0 overflow, 0 broken images, 0 phone controls under 40 px. Column 1352 px centred at 1440 (44 px each side) |
| Glance test | At a glance the page reads as an ORTG calculator: the hero names it, the gold ORTG and its three factors sit at the top right, the sliders and steppers are plainly the controls. The observed data is one click away, not in the way |
| Screenshots (viewed) | [`before-1440.png`](before-1440.png), [`before-390.png`](before-390.png); [`calculator-league-latest-1440.png`](calculator-league-latest-1440.png), [`-390`](calculator-league-latest-390.png), [`calculator-league-2016-17-1440.png`](calculator-league-2016-17-1440.png), [`-390`](calculator-league-2016-17-390.png), [`calculator-team-best-2018-19-1440.png`](calculator-team-best-2018-19-1440.png), [`-390`](calculator-team-best-2018-19-390.png); Denver after two moves: [`calculator-marginal-1440.png`](calculator-marginal-1440.png), [`-390`](calculator-marginal-390.png), [`calculator-notes-1440.png`](calculator-notes-1440.png), [`-390`](calculator-notes-390.png); the open section [`calculator-observed-1440.png`](calculator-observed-1440.png), [`-390`](calculator-observed-390.png) |

Noted, not changed: FT ORB recycle reads about 0.4% per FGA here against Databallr's ~2–3%, because the lab counts actual
rebounds of missed final free throws per FGA from play-by-play; Databallr's figure uses its own form. The owner's :8000 and
:3100 were not restarted (3100 answered 200 throughout; its stale CSS was refreshed by toggling the import, as recorded).
3180 and 4180 were stopped and the sandbox deleted.

## Rounds 2 and 3 (owner, 2026-11-07)

Instructions, from screenshots of the stepper board: (2) *"For ORTG, xSHOT, xEFF, xPOSS there is too much nesting. Only one
nest deep."* (3) *"Balance the left and right columns in the container, it looks a little weird."* Design only (CSS and one
wrapper class); no numbers changed.

| Change | Detail |
| --- | --- |
| One level of nesting | The four tiles sat in a well inside the board panel (panel → well → tile). The well is removed; the tiles are the panel's wells (`--rs-well`, rim, 14 px radius) |
| Balanced stepper cards | Two equal columns at 701 px and up, each centred; the label and ΔORTG share the first row, the − value + control and the ΔORTG figure the second. The phone keeps round 1's stacked card |

| Check | Result |
| --- | --- |
| Lint, typecheck, Vitest | 0 / 0; clean; 812 passed |
| Page Playwright ×3 | 60/60 |
| Full Playwright (sandbox, final build) | 594 passed, 17 skipped, 0 failed. An earlier run in this round had 1 failure, `projected-impact.spec.ts` "no frozen row" (the known flake, an untouched page); alone it passed 10/10. Visual baselines unaffected (the board is below both baselines' viewport) |
| Real data | 1,596 values in the same three scenes at 1440 and 390: 0 mismatches, 0 console errors, 0 overflow, 0 broken images, 0 phone controls under 40 px; the `calculator-*` scene shots are refreshed |
| Screenshots (viewed) | [`calculator-board-r3-1440.png`](calculator-board-r3-1440.png), [`calculator-board-r3-390.png`](calculator-board-r3-390.png), and the refreshed scene shots above |

:3100 served stale CSS twice; refreshed by toggling the import. :8000 and :3100 were not restarted; 3180/4180 stopped and the
sandbox deleted.

## Round 4 (owner, 2026-11-07)

Instructions, from screenshots of the methodology panel and the Six-Factor RAPM intro: (4) *"Why is the text so grey here?
That's not what we use across the site."* (5) *"Remove the divider above 'Observed Inputs & Caveats'."* (6) *"Remove the divider
above and below 'RAPM split into six factors,' on the six-factor RAPM page. These dividers are ugly."* CSS only.

| Change | Detail |
| --- | --- |
| Text colour | This page used the neutral greys `--color-text-secondary` (#a9afb9) and `--color-text-tertiary`. All 17 uses now take the Research pages' `--color-on-bg-secondary` (#c9d3e6) and `--color-on-bg-tertiary`, as `.rs-prose` and `.rs-card-text` do |
| Observed divider | `.ol-page .rs-disclosure` has no top rule |
| Six-Factor intro | `.sf-page .ui-filter-bar` has no bottom rule (in `@layer foundation`, where the filter bar's rule lives) and the first section after the intro has no top rule. Only that page; RD00 stays ✅ unless the owner says otherwise |

| Check | Result |
| --- | --- |
| Lint, typecheck, Vitest | 0 / 0; clean; 812 passed |
| Page Playwright ×3 (calculator specs plus `r02-six-factor`) | 119/119 |
| Full Playwright (sandbox) | 592 passed, 17 skipped, 2 failed: the `pc11-six-factor` baselines, changed by design. Deleted, regenerated, viewed (no dividers around the intro at 1440 and 390); visual spec then 84/84 |
| Real data | 1,596 values in three scenes at 1440 and 390: 0 mismatches, 0 console errors, 0 overflow, 0 broken images |
| Screenshots (viewed) | [`calculator-method-r4-1440.png`](calculator-method-r4-1440.png), [`-390`](calculator-method-r4-390.png), [`calculator-observed-head-r4-1440.png`](calculator-observed-head-r4-1440.png), [`six-factor-intro-r4-1440.png`](six-factor-intro-r4-1440.png), [`-390`](six-factor-intro-r4-390.png) |

:3100 served stale CSS; refreshed by toggling both imports. :8000 and :3100 not restarted; 3180/4180 stopped, sandbox deleted.

