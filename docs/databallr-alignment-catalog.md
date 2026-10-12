# Databallr alignment catalog

Work queue for the [alignment handoff](databallr-alignment-plan.md). Pairings come from the
[Databallr route map](research/databallr-replica-findings.md); wrong pairings are corrected during
owner review.

Status: ⬜ not started · 🔧 in progress · 👀 ready for review · ✅ aligned (owner only)

## Overview

Rows are in working order.

| # | Databallr | CourtLens | Status | Notes |
|---|---|---|---|---|
| 0 | App shell (nav rows, search, page title block) | `app/layout.tsx` | ⬜ | Done with the Stats pass |
| 1 | Stats | `/stats` | 👀 | Regressed vs Databallr (owner screenshots, 2026-10-12) |
| 2 | Dashboard (player) | `/players/[id]` | ⬜ | |
| 3 | PvP | `/compare` | ⬜ | Compare Export failure is a known gap |
| 4 | Teams | `/teams` | ⬜ | |
| 5 | WOWY | `/wowy` | ⬜ | |
| 6 | Last X Games | `/last-games` | ⬜ | |
| 7 | Live | `/live` | ⬜ | |
| 8 | Playoffs | `/playoffs` | ⬜ | |
| 9 | Showcase | `/showcase` | ⬜ | |
| 10 | Rankings | `/rankings` | ⬜ | PC12 D partial example boards (`53ee4d6`) |
| 11 | Tier List | `/tierlist` | ⬜ | PC12 D partial example boards (`53ee4d6`) |
| 12 | Roster Shapes | `/roster-shapes` | ⬜ | |
| 13 | Stat Line Shift | `/stat-line-shift` | ⬜ | |
| 14 | Contracts + Free Agency | `/contracts` | ⬜ | |
| 15 | Team Compare | `/team-compare` | ⬜ | |
| 16 | Matchup Matrix | `/matchups` | ⬜ | |
| 17 | Shot Profile Twin | `/similar-players` | ⬜ | Partial overlap |
| 18 | Six Factor RAPM | `/research` | ⬜ | |
| 19 | Wingspan | `/wingspan` | ⬜ | |
| 20 | Offensive Calculator | `/calculator` | ⬜ | |
| 21 | Learning / Patch Notes | `/methodology`, `/whats-new` | ⬜ | |

**CourtLens-only (one sweep at the end, no checkbox):** `/forecasts`, `/evaluation`,
`/investigations`, `/data-status`, `/settings`, `/planner`, `/design`.

**Databallr-only, not replicated:** Home game, WNBA, zTS, ShotQuality, D-ShotQuality,
Shot Aftermath, EPV Replays, Kawhi Files, Blog, NBA Draft.

## Page instructions

Each page gets a section when the owner starts it, using this shape:

```
### <#> <Page> — <status>
Instructions (owner, <date>):
1. [ ] <instruction> — <done note / commit>
Data-blocked: <Databallr elements we can't source>
Evidence: docs/evidence/alignment/<page>/
```

### 1 Stats — 👀 ready for review
Instructions (owner, 2026-10-12):
1. [x] Integrate Databallr's Stats buttons (where applicable) and their layout. Reference: owner
   screenshot of Databallr's NBA Player Statistics page, 2026-10-12. — interpreted as the rows below.
   - 1a [x] Help row under the page title: How to Use This Page · Stats Glossary · Hotkeys. — how-to modal, glossary link, hotkeys modal
   - 1b [x] Scope row: ‹ season › stepper with calendar icon · Regular | Playoffs segmented ·
     Select Team. CourtLens-only scope controls (Through, Window, eligible count, Data details) stay
     in the same row after them. — `ContextBar steppedScope` (opt-in, other pages unchanged); team moved
     out of the table Filters panel. Observed NBA Cup / Play-In phases stay as extra segments.
   - 1c [x] View row: presets in Databallr order (Overview, Shooting, Impact, On-Off, Six Factor,
     Advanced/Rates, Defense, True Shooting, then CourtLens extras) · Add View · Manage ·
     Photos | Logos | Initials | None (no "Group Guides:" label).
   - 1d [x] Table toolbar: wordmark · Per Game, Per 36, Per 75, Per 100, Totals · icon buttons
     (scatter, trend lines, compare players) · icon buttons (table settings, favorites, help,
     filters) · expand at the far right. Percentile toggle and Save legacy scope move into the
     settings menu. — compare button opens /compare for the first two selected players (Z).
   - 1e [x] Rows: a circular + compare toggle replaces the checkbox; the open-details button sits
     next to the name. — row favorite star moved to the preview rail header (and the details drawer).
   - 1f [x] Footer: record count · −W density meter E+ · ‹ View › · ‹ Scroll › · Filters (F) ·
     expand (T), with pagination kept at the right. Quick hotkeys list gains F. — F now toggles filters.
2. [x] Make the layout more identical to Databallr in format and in the sizing of the
   containers (owner screenshots of Databallr Stats, 2026-10-12). — title "NBA Player Statistics" + What's New
   line; 40px scope/view blocks; 36px toolbar icons; rank column and percentile legend removed; 42px
   rows, 64–88px centred metric columns, 236px name column, sorted header in accent; preview rail is
   its own panel beside the table frame; one-row footer.
3. [x] Drop the Box Score / Tracking split on Stats; use what Databallr uses (no sub-tabs). — tabs gone
   from /stats; /stats/tracking still exists (linked from player pages, keeps its own tabs).
4. [x] Remove the blue/white percentile blocks from the table cells. Use Databallr's small
   coloured percentile number under each stat, yellow → gray → blue (high → low). — `PercentileCell
   variant="text"` (other pages keep shading); continuous colour from `--pct`; new `--text-2xs` (10px) and
   `--color-percentile-text-*` tokens; small samples show no number; cohort moved to the footer.
5. [x] Stats Glossary: readable descriptions like Databallr's glossary cards (clarified: accurate
   descriptions per established standard/consensus definitions, not dumbed-down layman copy);
   pressing a description reveals the mathematical/back-end definition. Replace the snake_case
   key under each metric name with its short form (Points per game → PPG, not pts_per_game). — new
   /stats/glossary (back link, search, category chips, cards; description toggles formula, unit,
   validity, limitations); copy in `lib/stats-glossary.ts`, play-type wording matches
   `impact_extras.play_bucket`; /methodology catalog shows short names instead of keys.
6. [x] Remove the thin white divider line above the season / Regular-Playoffs / Through /
   Window scope row. — went with the sub-tabs; scope bar keeps no border.
Follow-up instructions (owner, 2026-10-12, second review):
7. [x] The player statistics table is too tall; limit its height like Databallr. — scroll area
   `clamp(320px, 100dvh − 470px, 760px)`: the whole frame fits a 1000px viewport; rows scroll inside.
8. [x] Add the stats Databallr's Stats table shows that ours is missing, where possible (owner
   screenshots of Databallr's Overview columns: Profile GP, MIN(mpg), OnBall%; Impact DPM, ODPM,
   DDPM; Counting PTS, PTS Created, AST, Rim AST, REB, TOV; Eff TS%, rTS%, cTOV%; Location 2P%, 3P%,
   3PA, FT%, FTA; Other OREB, DREB, STL, BLK). — Overview regrouped Profile · Impact · Counting · Eff ·
   Shooting · Other with GP MIN MPG | BPR OBPR DBPR (CourtLens Box Prior RAPM in the DPM slots) | PTS
   AST REB TOV | TS% rTS% eFG% | FG% 3P% FT% | OREB DREB STL BLK. Not added: OnBall%, PTS Created,
   cTOV% (no source/model); 2P%, 3PA/G, FTA/G and per-game Rim AST need new metrics in a new stats
   catalog version (v3 is frozen) — awaiting owner go-ahead. Completed by instruction 14.
9. [x] Select Team opens a grid of team logos (Databallr's "Select Team" dialog) instead of a dropdown.
   — 5×6 logo grid dialog with tricodes; the selected team shows on the button; Show all teams.
10. [x] Stat cells are clickable: open a pop-up trend graph for that stat and player, with other
    players addable for comparison (Databallr's "PTS Trend" dialog). — every metric cell opens a trend
    dialog: the stat per loaded season in the same phase/window/release (2023-24 → 2025-26), up to 4
    players via lookup, stat switcher, definition footer, Esc back; a season without a row is a gap,
    never zero. Series colours = dataviz reference dark slots 1–4, validated (CVD ΔE ≥ 8.4).
11. [x] Hovering a stat column header shows that stat's name and description ("Click to sort").
    — overlay hint from the metric catalog plus glossary copy.
12. [x] Add Databallr's position selector filter (PG SG SF PF C). — superseded by instruction 18; was G / F / C chips: the free NBA roster
    index lists only G, F, C (hybrids such as G-F match both). Backend `StatsPresentation.positions`
    resolves to player IDs from the latest index (current listing, not backdated; disclosed on hover);
    a display filter only, league percentiles unchanged.
13. [x] Fix the uneven shading on the season selector. — select surface set in the foundation layer.
Follow-up instructions (owner, 2026-10-12, third review):
14. [x] Add the v4 catalog metrics, and the others if sources can be found. — new
    `courtlens-stats-v4` serving catalog (v3 unchanged; `domain/stats_v4_catalog.py`): 2PM/2PA/2P%,
    per-game FGM/FGA/3PM/3PA/FTM/FTA; Rim AST per game / per 36 / per 100 from sealed extras support;
    Offensive Load and cTOV% (TOV / Offensive Load, Ben Taylor's Box Creation per 100 offensive
    possessions); OnBall% (tracking time of possession / minutes) and PTS Created (PTS + NBA tracking
    assist points; per game / per 36 / total). Tracking possessions + passing totals for 2023-24 and
    2024-25 admitted from the pinned hoopR mirror (8 files) so all three seasons have values. Impact
    and tracking columns stay null outside full single-season scopes (no team filter). DPM family
    remains CourtLens BPR (DARKO outputs are not admitted).
15. [x] The table extends to just above the bottom of the unscrolled page. — measured fill height
    (`--stats-fill-height`, re-measured on resize) instead of a fixed clamp.
16. [x] Counting before Impact in Overview. — Profile · Counting · Impact · Eff · Shooting · Other.
17. [x] Values inside graph data points (Databallr trend). — `charts/value-dot.tsx`; the trend dialog
    and the recent-games points chart. Profile small multiples (90px tall) and the 8-player game
    lines keep plain markers: labels would collide there.
18. [x] Bucket players into PG/SG/SF/PF/C and show the position beside the team. — no free source lists
    five positions for everyone, so CourtLens estimates them (`docs/design/position-estimates-v1.md`):
    logistic regression on NBA Draft Combine labels from listed position/size and same-season box
    rates, bounded by the NBA listing. Out of sample by player: 67.9% exact, 99.0% within one position
    (listing/size baseline 63.8%). Rows read "LAL · PG · 2025-26"; chips filter by the estimate.
19. [x] Draft Class selector. — menu of NBA draft years (official draft history mart); display filter.
Follow-up instructions (owner, 2026-10-12, fourth review):
20. [x] Counting leads with PTS, REB, AST, then PTS Created, Rim AST, TOV.
21. [x] Table search sits above the player cards like Databallr. — one search cell spans the compare
    and name columns, flush with the cards; name-sort arrow beside it.
22. [x] Animations for the table's filter drop-downs and similar. — filters panel and search results
    slide in, header hint and new rows fade, chips/buttons transition and press, team logos lift,
    trend values fade; all on duration tokens (reduced motion collapses them).
23. [x] Player cards fit long names. — name column 300px (Shai Gilgeous-Alexander fits).
24. [x] Search results drop straight from the search field. — floating results anchor to the whole
    field (icon included) instead of the input; applies to every floating lookup.
25. [x] Position filter errors, slowness, no skeleton. — each toggle re-ran the whole cohort query
    (~4 s of SQL on one worker) and stacked toggles hit the 8 s client timeout. Presentation queries
    now page a cached whole cohort (`services/stats_cohort_cache.py`, JSON, 10 min TTL, 12 entries):
    positions, draft class, favorites, name and paging filter in memory (~0.4 s); the league reference
    for table percentiles is cached the same way. Stats SQL also runs with JIT off and 32 MB work_mem
    (JIT cost more than the query). Scope filters show skeleton rows and press state at once.
26. [x] Reset button returning the table to its default sort. — toolbar Reset (sort, name, page).
Follow-up instructions (owner, 2026-10-12, fifth review):
27. [x] Hovering a stat cell highlights that stat in the preview sidebar. — delegated listener; only the
    rail re-renders; its metric list scrolls while the player header stays.
28. [x] Reset is universal and works mid-load. — clears sort, search, page, minimums, team, positions,
    draft class and favorites (scope, view and counting mode stay); always enabled.
29. [x] Sort and filter load times with skeletons. — cohorts now cache without their sort and with every
    joined column (all impact-joined views of a scope share one), sorting runs in memory with SQL's
    exact order (verified on live data, C-collation names); league reference cached slim; the impact
    store is re-hashed only when its file changes; responses carry only the view's impact support;
    page data loads in parallel. Header sorts ~0.6-0.7 s on a production build (`make preview`).
30. [x] Table and preview share one fixed height; Selected Players fits inside the frame. — the frame
    height comes from its page offset; a flex column gives the rows what toolbar, footer and tray
    leave. Heading "Player Preview".
31. [x] Trend points never touch the axes. — round ("nice") ticks with headroom; points inset 40px.
32. [x] Name-sort arrow aligned with the card buttons → superseded by 33.
33. [x] A–Z sort as a table tool (A–Z / Z–A icon); the search spans the full card width.
34. [x] Glossary reads abbreviation → full name → definition. — full names for every abbreviation-only
    or field-like name (3PR = Three-Point Attempt Rate, Box Prior RAPM (2 seasons), Self-Created True
    Shooting Percentage, …); definitions never restate the name; header hints use the same order.
35. [x] No formulas front and centre. — scatter axis titles show the stat's name (formula on hover);
    detail drawer shooting cards show a short caption (formula on hover). Glossary, methodology and
    Data details keep formulas.
36. [x] Selects keep no outline after a mouse pick. — focus ring on keyboard focus only (`:focus-visible`).
Follow-up instructions (owner, 2026-10-12, sixth review):
37. [x] Chart hover cards sit next to their data point. — scatter and trend-lines cards were placed in
    viewBox units as if pixels, so they drifted as the SVG scaled; now anchored in percentages of the
    plot (`lib/chart-anchor.ts`), right or left of the point and flipped near edges (~13 px gap).
    Also: the frame height re-measures after animations settle (an entering page's transform could
    leave it a pixel or two short).
38. [ ] DPM / ODPM / DDPM. — DARKO (darko.app) offers a leaderboard CSV but states no licence; source
    policy v2 excludes external model outputs (B25). Feasible as a weekly operator import credited to
    DARKO if the owner admits the source; awaiting the owner's decision.
Not applicable (no data or feature): the video and trophy
(Leaders) toolbar buttons. Tab/Shift+Tab view cycling is exposed as buttons only, so Tab keeps
normal keyboard focus order.
Data-blocked: DPM, ODPM, DDPM (DARKO outputs are not admitted; BPR fills the slots).
Evidence: docs/evidence/alignment/stats/ (stats and glossary at 1440 and 390, live local data).
Verification 2026-10-12: dashboard lint, typecheck, Vitest 448/448; Stats Playwright set 76/78 at 3
workers plus the new glossary spec 2/2. Remaining failures are not Stats regressions: workbench Teams
"Toronto Raptors" strict-mode match (Teams page, from PC12 D) and the known Compare Export gap; the
skip-link and streaming checks flake only under parallel load (6/6 serial). Stats desktop/phone and
select-popup baselines regenerated.
Verification (follow-ups 7–13): dashboard lint, typecheck, Vitest 448/448; backend ruff, mypy and full
pytest 2038 passed; Stats Playwright set plus the new `stats-followups` spec pass (the Teams strict-mode
and Compare Export failures are unchanged and unrelated). Evidence adds team grid, header hint and trend.
Verification (third and fourth reviews, 14–26): dashboard lint, typecheck, Vitest 449/449; backend
ruff, mypy and full pytest 2042 passed (new `tests/unit/test_stats_v4.py`, v4 box splits in the
PostgreSQL presentation test); Stats Playwright set 123/124 three runs in a row at 3 workers (only the
unrelated Teams strict-mode failure). Live: full Overview first load 3.7 s, position/draft toggles
0.4 s at the API (1.1 s through the dev server). Baselines regenerated: Stats desktop/phone, select
popups (now clipped to the scope rows, so table layout no longer flakes them) and the /players
directory, which already failed on HEAD from earlier shared Stats styles. Evidence: stats, trend with
value dots, draft class menu and aligned search (1440), stats (390).
Verification (fifth review, 27–36): dashboard lint, typecheck, Vitest 451/451; backend ruff, mypy, full
pytest 2044 passed; Stats Playwright set passes (Teams strict-mode unrelated). Full browser suite:
pre-existing failures reproduced on HEAD and unrelated to Stats: pc12 example boards (13, they read
the real catalog release in this environment), chart-kit reduced motion and Compare Export, Teams.
Fixed on the way: pinned identity cells sat under scrolled metric values (z-index).
