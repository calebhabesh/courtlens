# Databallr alignment catalog

Work queue for the [alignment handoff](databallr-alignment-plan.md). Pairings come from the
[Databallr route map](research/databallr-replica-findings.md); wrong pairings are corrected during
owner review.

Status: ⬜ not started · 🔧 in progress · 👀 ready for review · ✅ aligned (owner only)

## Overview

Rows are in working order.

| # | Databallr | CourtLens | Status | Notes |
|---|---|---|---|---|
| 0 | App shell (nav rows, search, page title block) | `app/layout.tsx` | ✅ | Owner approved first revision 2026-10-15; pattern idea parked |
| 1 | Stats | `/stats` | 👀 | Owner approved first revision 2026-10-15; cold-load animation follow-up ready for review; deferred 43f/43g remain open |
| 2 | Dashboard (player) | `/players/[id]` | ✅ | Owner approved first revision 2026-10-15; Career-since label overlap fixed |
| 3 | PvP | `/compare` | 🔄 in progress | Compare Export fixed (card export) |
| 4 | Teams | `/teams`, `/teams/[id]` | 👀 | Six-factor table, Standings view (SOS, AdjNet, xW, standings), home/away, trend; team profile on the Stats table; Teams menu |
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
| 15 | Team Compare | `/team-compare` | ✅ | Owner approved first revision 2026-10-18; historical franchises, mid-season scope and old view removal done |
| 16 | Matchup Matrix | `/matchups` | ✅ aligned (first revision) | Player Comparison card, every opponent in a Stats table, direct matchup both ways; 3P fixed |
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

### 0 App shell — ✅ aligned (first revision)

Owner approval (2026-10-15): "I think I'm done the first solid revision of the main stats page
and the player page. It's not a perfect version, but a presentable one now." Rows 0–2 are
aligned as a first revision; later instructions reopen a row. Approved screenshots are Playwright
baselines in `dashboard/e2e/visual-baselines.spec.ts` (`stats-*`, `player-profile-*`; the player
profile baselines were refreshed in the approval commit for instructions 56–67).
Instructions (owner, 2026-10-13):
1. [x] On the site nav bar, move the wordmark closer to the actual logo so they look like one
   wordmark + logo; they look a little far apart from each other. — navbar gap 12px → 4px
   (`--space-1`); measured at 1440, 768 and 390, vertically centered with no page overflow.
2. [x] The favicon is very small in the browser tab; make the logo legible in the favicon. — tight
   frameless SVG crop, larger orange basketball and clearer seams; 16px/32px visual checks,
   matching app/public assets and versioned favicon URL verified in the rendered page.
3. [x] Give the favicon the same blue background color used for the site. — full SVG background
   `#15325a`, matching `--color-bg`; versioned URL v3, served bytes and 16px background pixel verified.
4. [x] The CourtLens icon is a little big in the favicon. Make it slightly smaller and make the
   background corners slightly rounded, like a squircle. (Clarifies the preceding rounded-corners
   request.) — logo scaled to 90% around the canvas center; blue background radius 5 SVG units;
   16px/32px visual inspection passes, URL v4 and matching served/source SVGs verified.
5. [x] Try Switzer instead of Public Sans for the interface. Owner: "Let's try switzer, I actually
   used this font in another project. It's nice." — original Switzer 1.2 variable WOFF2,
   self-hosted with pinned setup/dev/build acquisition; uniform digits and sampled accents verified.
6. [x] Give the magnifying glass a cool, lustrous silver gradient across the CourtLens logo, icon
   and favicon, like a silver analogue of Databallr's golden logo (owner, 2026-10-14). — shared
   ring/handle gradient, matching SVG/PNG variants and versioned URLs; 16px/32px visual checks,
   desktop/phone headers, served-asset parity and unique paint references verified.
7. [x] Add a little more padding around the round part of the magnifying glass in the favicon;
   it looks pressed against the edges (owner screenshot, 2026-10-14). — artwork scale 90% → 82%,
   adding 0.60px of top/left lens clearance at 16px; visual inspection and served v6 SVG pass.
8. [x] Add a very subtle, non-distracting basketball-themed pattern to the blue site backdrop:
   sparse coaching-board X's and O's, muted blue-gray at roughly 3–4% opacity, static, with solid
   table/card backgrounds and a sleek appearance. Approved for implementation, 2026-10-14. — initial
   384 px / 4% SVG preview implemented and measured; static shell background, transparent Stats
   wrapper, no change to filled table pixels. [Evidence](evidence/alignment/app-shell/coach-pattern/README.md).
   Owner preview feedback: "a little too infrequent, and subtle"; asked which parameters can be
   adjusted; the approved tuning follows in instruction 9.
9. [x] Bring the marks closer together (roughly 144 px apart, a 288 px tile) and raise opacity
   from 4% to 7%, keeping the marks roughly 18–20 px and strokes at 1.5 px. Owner: "Yes. Let's do
   that, they are very sparse, and a little too subtle." (2026-10-14.) The spacing arrangement is
   superseded by instruction 10; 7% opacity, original mark size and 1.5 px strokes are retained.
10. [x] "It seems like they are being placed on rows, I just want it to be randomly placed across
    the backdrop and closer to each other." (Owner, 2026-10-14.) — replace the small repeated
    arrangement with an irregular, more closely spaced scatter; keep it static at 7% opacity.
    — 100 seeded, irregular positions on a 1152 px tile, at least 72 px apart including across
    seams, with small X-angle variations. Native SVG sizing preserves the marks. Generator
    reruns produce identical bytes. [Evidence](evidence/alignment/app-shell/coach-pattern-tuning/README.md).
11. [x] Park the background pattern idea for now and remove it; it makes information on player
    pages harder to see. (Owner, 2026-10-14.) Supersedes instructions 8–10. — plain blue shell
    restored; SVG, generator and npm script removed. The experiment remains in Git history.
    Live and production Stats/player checks at 1440/390 confirm no background image, no pattern
    requests and no page overflow. [Evidence](evidence/alignment/app-shell/plain-backdrop/README.md).
12. [x] Every search that uses the integrated player search should get the Stats table search's
    solid focus outline (player comparison, etc.). (Owner, 2026-10-15.) One foundation rule for
    every lookup field; the palette's flat input row stays ringless.
13. [x] Only show "aka" when the nickname is real (verified through Basketball-Reference) and can
    be queried. (Owner screenshots, 2026-10-15.) Parser `bbref-player-v3` reads the pages' labelled
    nickname answers (945 of 2,312 players); only those are captioned.
14. [x] Suggestions should list known/current players first: "Vic" should find Victor Wembanyama
    before obscure players. (Owner screenshot, 2026-10-15.) Match tiers, then current season, then
    games played.
15. [x] Remove the edge highlight from the site/player search; the shading is enough. (Owner
    screenshot, 2026-10-15.)
16. [x] List all of a player's nicknames in the results, and allow clearing recent searches (clear
    all and per player). (Owner screenshot, 2026-10-15.)
    [Evidence](evidence/alignment/app-shell/search-nicknames/README.md).

Follow-up instructions (owner, 2026-10-19, during Teams; reopen row 0 for this change only):
17. [x] Nav dropdowns, with Databallr's Teams and Compare menus as reference: "can we try little to
    no highlight on the drop down container, and little to no outline, like data ballr." — the
    nav panels drop their 1px hairline border, and nav and kit menus/popovers swap `--shadow-2`
    (with its inset rim highlight) for the new `--shadow-menu` drop shadow (Design Language
    updated). Measured: border 0px, shadow `0 8px 24px rgb(0 0 0 / 35%)` on the Teams, Compare
    and 3P Luck menus.
18. [x] "we are also missing the icons/etc on the pages we finished under compare" — the Compare
    menu (Player Comparison, Team Comparison, Player Matchups) gets the Teams menu's icon and
    one-line description rows. — icons swap, scale and swords (Lucide `Swords` added); each
    description is the page's own subtitle. Header, motion, Teams and visual-baseline specs pass
    (114/114, no baseline changed). Evidence: `docs/evidence/alignment/app-shell/menus/`.
Evidence: docs/evidence/alignment/app-shell/brand-spacing/
Verification: dashboard lint/typecheck clean; Vitest 454/454; four affected browser checks pass
(two initial dev-server streaming timeouts passed on rerun). Owner alignment remains pending.
Background follow-up: lint/typecheck and Vitest 454/454 pass; favicon browser check passes, with
16px/32px visual inspection. Evidence: `favicon-blue-comparison.png`, `favicon-blue-verification.json`.
Rounded follow-up: lint/typecheck and Vitest 454/454 pass; browser verification and 16px/32px
legibility pass. Evidence: `favicon-rounded-comparison.png`, `favicon-rounded-verification.json`.
Switzer follow-up: lint/typecheck, Vitest 454/454, production build, 13 focused browser checks and
120 visual/picker checks pass; typography baselines refreshed and checked. Five responsive sizes,
blocked fonts and live Settings checked. Evidence: docs/evidence/alignment/app-shell/switzer/.
Silver follow-up: lint/typecheck, Vitest 511/511, production webpack build, six header browser checks
and responsive/asset verification pass. Evidence: docs/evidence/alignment/app-shell/silver-mark/.
Padding follow-up: lint/typecheck, Vitest 511/511, four header checks and favicon browser verification
pass; the broader search check has dev-server lookup/workspace timeouts. Evidence:
docs/evidence/alignment/app-shell/favicon-padding/.

### 1 Stats — 👀 ready for review (cold-load animation follow-up)

Owner approval (2026-10-15): "I think I'm done the first solid revision of the main stats page
and the player page. It's not a perfect version, but a presentable one now." Rows 0–2 are
aligned as a first revision; later instructions reopen a row. Approved screenshots are Playwright
baselines in `dashboard/e2e/visual-baselines.spec.ts` (`stats-*`, `player-profile-*`; the player
profile baselines were refreshed in the approval commit for instructions 56–67).
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
38. [x] DPM / ODPM / DDPM. — Owner admitted DARKO under source policy v3. Operator import completed;
    Overview's BPR trio replaced under Impact, credited to darko.app, with DPM descending by default.
    Owner follow-up: DARKO and Databallr show slightly different values; integrate the correctly dated
    DARKO values. Season-opening projections must not be presented as season-end ratings. The dated
    leaderboard verified against player history, separately for regular season and playoffs. Six dated
    boards sealed; 2025-26 playoffs explicitly partial (source through June 3). Saved queries pin their
    retained bundle. Source evidence: `docs/evidence/alignment/stats/darko/`.
39. [x] Add a blue hyperlink to the DARKO stats in the hover state or wherever used to credit the
    source, and highlight it. — shared highlighted blue source link in header hover cards (clickable),
    footer, preview metric labels, trend dialog, glossary, methodology and Data details.
40. [x] Rearrange Overview to Profile → Impact → Counting → Efficiency → Shooting → Other. — owner,
    2026-10-12: "Okay let's do that rearranging." Supersedes instruction 16's Counting-first order.
    Overview and preview reordered; DPM visible on first desktop load. Lint/typecheck, Vitest 453,
    affected browser specs 24/24 and Stats baselines 2/2 pass. Real-data desktop/phone screenshots and
    glance test: [Impact-first evidence](evidence/alignment/stats/impact-first/README.md).
41. [x] Try a new color scheme: the page background is the NBA blue from inside the NBA logo (not
    the darker backdrop the logo usually sits on), and tables/containers are slightly differently
    shaded greys/blacks that contrast well with it. Follow-ups (owner, same day): use the blue inside
    the logo (owner image, `#01408b`); then "a bit darker and muted" so it doesn't distract from the
    tables. — `--color-bg #15325a` (logo hue, darker/muted); neutral charcoal surfaces 0–3
    (`#0e1013 / #15171b / #1c1f24 / #24282e`); new `--color-on-bg-secondary/-tertiary` for nav,
    field labels and page notes on the blue; help-row buttons filled charcoal; tertiary text lifted
    to `#858b95` to keep AA on surface-2. Design Language v1.3 token and contrast tables updated. The
    token is global, so every page shows the blue; other pages' on-background secondary text waits
    for their own pass. [Blue background evidence](evidence/alignment/stats/blue-background/README.md).
42. [x] Cut the dead-end CourtLens extras from Manage Custom Views if they're not built yet (owner
    screenshot of the analogue checkboxes). — the PBP play-type "analogue" buckets are computed but
    implausible (Create TS 17–37%, Unknown TS 101% in live data) and the Six Factor placeholder always
    shows "—"; both hidden from the column picker (`isPickerDeadEnd`), saved views still render.
43. [ ] Fill out seasons back to 2000-01 like Databallr ("Databallr is able to have this data, so
    should we", owner 2026-10-13, after the feasibility check). Order: box-score seasons first, then
    DARKO dated history, then multi-season mode, then PBP-derived impact metrics; tracking-era columns
    stay unknown before 2013-14. Owner follow-up: "hopefully we are also able to get the player photos
    for those applicable added years too."
    - 43a [x] Box-score seasons 2000-01 to 2022-23 published (one dataset, 26 seasons; current seasons
      byte-identical). Parser v3: person_id 0 placeholders quarantined, whole-minute values parsed.
    - 43b [x] Player photos for added years from the NBA CDN (1,835 of 2,733 players); generic
      silhouettes rejected so the rest keep initials.
    - 43c [x] Estimated positions for added seasons from the frozen position model (sealed seasons
      reproduced and kept verbatim).
    - 43d [x] DARKO dated history 2000-01 to 2022-23, 46 boards at each phase's last game date;
      carry-forward keeps the sealed seasons verbatim. [History evidence](evidence/alignment/stats/history/README.md).
    - 43e [x] Multi-season mode (From/Through range, 5Y/10Y/15Y/25Y quick ranges). Owner, 2026-10-13:
      "Yes, add it." — season popover with Single season / Multi-season; `seasonFrom` URL param;
      ranges aggregate per player (DARKO, tracking, impact stay unknown); cold 25-season load 12 s.
      [Multi-season evidence](evidence/alignment/stats/multi-season/README.md). Owner follow-ups, same
      day: older seasons still missing in the picker (a tab pinned to the old 3-season release, kept
      by the header links), single-season select should span the panel, "Show N seasons" text lacked
      contrast. — header navigation drops release/model pins; Stats shows a notice with "Switch to
      latest data" when a link is pinned to an older release; select spans the panel; the button
      keeps on-accent text over the filter bar's control styling.
    - 43f [ ] PBP-derived impact (RAPM, on/off, six factor) for added seasons. Deferred
      (2026-10-14) to a data block after the consolidation block: multi-season PBP compute.
    - 43g [ ] Draft classes before 2000 so older players match the Draft Class filter. Deferred
      with 43f. The pinned hoopR mirror only has 1996–1999 drafts (files 1997–2000); 1976–1995
      need another free source (e.g. NBA DraftHistory direct).
Follow-up instructions (owner, 2026-10-13, control uniformity):
44. [x] Normalize the containers/buttons above the table for uniform text and container sizing.
    Through/Window selector text should be grey, not white. Final owner revision: restore the
    previous layout, with Add View/Manage after Table Divider; retain typography/container changes.
    - Done: scoped 13px/18px text, 40px outer controls and grey selector values; original flex/wrap
      layout retained, with actions after the divider. Desktop and phone measurements pass.
45. [x] Add text beside Photos/Logos/Initials/None explaining it, akin to Through/Window:
    "Table Divider".
    - Done: visible inline Field label and accessible group name. [Evidence](evidence/alignment/stats/control-uniformity/README.md).
Follow-up instruction (owner, 2026-10-13, table search sizing):
46. [x] Our search bar is a little big compared to Databallr; scale it down a little like Databallr.
    - Done: desktop search capped at 288px wide and 32px tall; phone touch sizing retained.
      [Measured screenshots and verification](evidence/alignment/stats/search-sizing/README.md).
47. [x] The search bar should be placed centered above the player cards below. It is currently
    left aligned; Databallr does a better job of this.
    - Done: centered compact field above both identity columns, with zero measured center offset
      on desktop/phone. [Evidence](evidence/alignment/stats/search-centering/README.md).
48. [x] Make the search bar slightly wider; it is a little too tapered.
    - Done: cap increased from 288px to 304px, retaining centering and 32px desktop height.
      [Evidence](evidence/alignment/stats/search-sizing/README.md#follow-up-slightly-wider-still-centered).
49. [x] Make the search bar slightly larger/wider again.
    - Done: cap increased from 304px to 312px, preserving centering and height.
      [Evidence](evidence/alignment/stats/search-sizing/README.md#follow-up-another-8px-of-width).
50. [x] Phase (Regular/Playoffs/Cup Final/Play-In) and season changes were slow and spun up the fans;
    make them load reasonably, like the fixed position filters (owner, 2026-10-13). — index on
    player games by dataset/season/phase/date, no duplicate count pass, narrow percentile ranking,
    slim impact support through SQL and the cohort cache, cached catalog coverage for published
    datasets. Phase 3.7–6.5 s → 0.8–1.2 s, season ~7 s → 2.4 s (dev server); results byte-identical.
    [Scope speed evidence](evidence/alignment/stats/scope-speed/README.md).
Follow-up instructions (owner, 2026-10-13, table header and card surfaces):
51. [x] Bottom align the search bar with the stat column headers (GP, MIN, MPG, etc.).
    - Done: second-row header controls share the search field's bottom edge on desktop/phone.
52. [x] Make the player cards use the same black base color as the table, like Databallr's scheme.
    - Done: pinned compare/player cells use the metric-cell base and hover surfaces.
      [Measured screenshots and verification](evidence/alignment/stats/card-surface/README.md).
Follow-up instructions (owner, 2026-10-13, controls, hover and player drawer):
53. [x] Buttons above the table should use lighter grey instead of black. — settled by 62–66: every
    console measures the table lift rgb(31, 38, 50).
54. [x] The search bar still is not bottom-aligned with the visible stat headers. — search and
    header labels end on the same pixel (498 px at 1440, 788 px at 390).
55. [x] Row highlighting should stop when the cursor leaves; recommend keeping or removing it,
    with a performant table as the priority. — kept: pure CSS `:hover`, no JS state; measured
    idle → hover → idle again after leaving.
56. [x] Clean up the player details drawer opened from the four-square button; buttons and
    containers need proper padding and a cleaner layout. — portaled drawer, ID tag removed, 2×2
    grid of 40px icon actions, research links as one row, scrolling body.
57. [x] Make Per Game/Per 36/Per 75/etc. the same size as the toolbar buttons to their right;
    they are too small and hard to see. — 36px like the icon tools (40px on phone), 13px text.
58. [x] Remove the Temporal Discipline Notice from the player drawer. Owner preference:
    keep site notices concise and avoid repeating technical explanations in routine views.
59. [x] Make the player drawer even cleaner: remove CourtLens impact samples and
    Metric-specific support. — both removed (58–59).
    [Evidence](evidence/alignment/stats/controls-drawer/README.md).
Follow-up instructions (owner, 2026-10-13, focus line and table palette):
60. [x] Remove the line that occasionally appears under the nav bar when clicking around the page.
    - Done: it was the browser focus ring on `main#content` (the skip-link target, `tabIndex=-1`),
      which takes focus on clicks in blank space; `.replica-main:focus` now has no outline.
61. [x] Choose a better-contrasting light/dark grey pair for the table highlights and the preview
    rail, one that works with the blue background.
    - Done: new `--color-table-lift` (#2a3342) and `--color-table-well` (#141a23) slate tokens; the
      frame and rail re-map the surface steps onto them, and hover lift rose from 4% to 6% white.
62. [x] The buttons and consoles above the table should use the table's light grey, like Databallr.
    - Done: `.stats-workspace` maps surface-2 and surface-3 to `--color-table-lift`, so the
      consoles measure the same rgb(42, 51, 66) as the table frame (owner rejected a lighter step).
63. [x] Make that grey slightly darker, and give the player preview sidebar its own darker shade.
    - Done: `--color-table-lift` #2a3342 → #252d3a (consoles and frame measure rgb(37, 45, 58));
      new `--color-table-rail` #1c2330 for the preview rail (rgb(28, 35, 48)).
64. [x] Give the buttons and consoles above the table hover highlights and slide animations.
    - Cause: the console background rule lives in the `foundation` layer, which outranks every
      `pages`-layer hover rule; Per Game/Photos groups had no indicator, and Regular/Playoffs only
      switched after the server navigation finished.
    - Done: foundation-layer hover (rgb(37, 45, 58) → rgb(52, 60, 72)) with a background
      transition on every console; sliding indicators on the divider and counting groups; phase,
      counting and divider selections use `useOptimistic` so the indicator slides on click
      (measured 162→249 px, 222→292 px and 891→961 px over ~150 ms).
65. [x] The Table Divider slide isn't smooth like the view tabs; make every console snappy and smooth.
    - Cause: a divider switch redraws every row's guide cells at once (200–300 ms of main-thread
      work) while the Motion indicator, which animates on the main thread, is mid-slide.
    - Done: `SlidingIndicator` now slides with a Web Animations transform that the compositor runs
      even while the table re-renders; the divider and counting groups are `StatsChoicePills`,
      whose click repaints only the pills and starts the table update a frame later; the label
      colour swaps instantly (no colour fade). Video check: label switches on the click frame and
      the box glides over ~200 ms with a new position every frame.
66. [x] Make the table/console/button grey slightly darker for white-text contrast.
    - Done: lift #252d3a → #1f2632 (rgb(31, 38, 50)), rail #1c2330 → #181e28, well #141a23 →
      #11161e, so the rail and data cells stay distinct steps below the lift.
67. [x] Purge the play-type "analogue" stats (Create/Space/Trans/Finish/Unknown TSA, frequency,
    TS, rTS) from the site; show only stats with solid footing.
    - Done: retired in the served catalog and stripped at serving; the True Shooting view now
      shows volume, percentages and true-efficiency box columns only. See the
      [impact metrics progress log](impact-metrics-progress.md) for the measured retirement.
68. [x] Make sure every stat on the site is solid.
    - Done: audited each served extra against real 2025–26 values; also retired block recovered
      fraction (never qualifies), credited turnovers forced (overclaims) and PBP TS%/FTR
      (duplicates that disagree with box TS%/FTR). Defense and Rates (Per 36) keep only extras
      with plausible measured ranges.
69. [x] Replace the "CourtLens public-source sample" heading and show counts as whole numbers.
    - Done: Defense's extras sit under "Advanced Defense" and Rates (Per 36)'s under "Advanced";
      plain-sum extras (charges drawn, rim assists, bad-pass turnovers) format as integers
      (measured 14, 167, 244 instead of 14.00, 167.00, 244.00).
Follow-up instructions (owner, 2026-10-13, table search):
70. [x] Make the table search filter the table's own rows as you type, like Databallr, instead of
    a site-search suggestion dropdown.
    - Done: plain search field (same size and place) pushes `name` 250 ms after typing stops
      (Enter pushes at once, Escape clears) with history replace; current rows dim instead of
      skeletons; the table no longer remounts on a name change, so focus and later keystrokes
      survive; server name matching ignores accents ("jokic" → Nikola Jokić).
      [Evidence](evidence/alignment/stats/live-table-search/README.md).
Follow-up instructions (owner, 2026-10-14, control padding):
71. [x] Center the text in buttons, containers and dropdown selectors. Some have uneven padding,
    especially dropdowns (more on the right than the left), and this repeats across the site.
    Prefer uniform padding: equal above/below and equal left/right.
    - Done (owner chose mirror sides, sizes unchanged): text was already vertically centered
      (within 0.3 px). Selects showed ~2.5 px more on the right because the chevron glyph leaves
      empty space in its icon box; the shared select and every control ending in a chevron now
      offset it (site-wide), and Team Compare's remove × is centered in its hit area. Measured
      after: no select or chevron trigger off by 1 px or more on 13 pages.
      [Evidence](evidence/alignment/stats/control-padding/README.md).
Follow-up instructions (owner, 2026-10-17, cold-load animation):
72. [x] "The main nba player stats page is still doing the double animation. The player page
    table doesn't do this." Clarification: "opening or refreshing" Stats.
    - Done: one body fade after hydration, URL defaults and saved-view restoration settle.
      Its class clears on completion. Removed the timed global replay guard and row cascade.
      Production build, lint, typecheck and 31 Stats browser checks pass. Live 1440/390 opens and
      refreshes each record one entrance. The full unit run has four unrelated header animation
      cancellation errors, also reproduced with the unchanged header test alone.
      [Evidence](evidence/alignment/stats/single-entrance/README.md).
Not applicable (no data or feature): the video and trophy
(Leaders) toolbar buttons. Tab/Shift+Tab view cycling is exposed as buttons only, so Tab keeps
normal keyboard focus order.
Data-blocked: no DPM source gate. 2025-26 playoff DARKO data stops June 3; the actual date is shown.
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
Verification (DARKO, 38–39): Ruff/format/mypy and dashboard lint/types clean; Vitest 453/453;
full isolated Python suite 2053 passed (one assistant-browser fixture skip, dependency warnings
recorded); final focused runs 54 + 32 passed. Affected browser set 33/34 (only the already-recorded
Teams strict-mode selector failure); Stats baselines regenerated and checked 2/2. Production build
and real-data 1440/390 screenshots pass the glance test. Full measured evidence and source limits:
[DARKO evidence](evidence/alignment/stats/darko/README.md).

Follow-up instruction (owner, 2026-10-14, from the player page's current team):
72. [x] Make it as clear as possible when a player now plays for a team other than the one his row's
    stats belong to (off-season trades). — no CT column (empty for nearly every row); the row keeps
    its games' team, and an active player listed with a team he has not played for in the latest
    season gets a "now [logo] TOR" chip in place of the season label, titled "Played 2025-26 for the
    LA Clippers. Now listed with the Toronto Raptors (NBA player index)." Older seasons, season
    ranges, mid-season trades already on the row, free agents and retired players get none; on
    phones the position and the word "now" give way so the chip fits. Rows carry `current_team`
    from `mart_player_bio`; the rule is `lib/current-team.ts`.

73. [x] Slightly taller rows so the "now" pill is more legible and has space. — rows 42 → 46px
    (compact 34 → 38); the pill is 18px with a 14px logo, centred on the subtitle line.

74. [x] Centre the "now" pill's text and logo, and give it a subtle accent-yellow outline. — symmetric
    padding (8px, 4px on phones), every child's midpoint on the pill's (measured 0px off); a 1px
    `--color-accent` outline at 55%; the subtitle line is pill-height so the outline is never clipped.

75. [x] Slimmer, tighter controls above the Stats table and on the player page; they felt oversized.
    — 32 px (kit `sm`) instead of 40 on desktop for the filter bar (every page that has one), the
    help buttons, team/position/draft controls, the view-tab consoles, Add View/Manage and Data
    details; `Field`, the date picker, the season picker and Data details now follow the
    surrounding size instead of forcing `lg`. Phones keep the kit's 40 px hit area. Desktop
    baselines whose content moved up were regenerated; no phone baseline changed.

76. [x] Slightly larger player photos and team logos in the table, with taller rows to fit. — desktop
    photos 32 → 40 px, logos 20 → 24, guide photos 30 → 36, rows 46 → 52 (compact 38 → 44, photo
    34); the name column widens 300 → 312 px so names and the "now" pill keep their room, and the
    search box fills its header cell. Phones keep 32/20 in 46 px rows.

77. [x] Team logos in the table a little larger. — 24 → 28 px on desktop (phones keep 20).
    Found while scoping the Basketball-Reference crawl: the NBA index keeps a retired player's
    last team, so `current_team` (Stats 72, row 2 27) named one for retired players; the mart's
    `listed_team_id` now requires an active roster (616 players).

78. [x] Horizontal row dividers like Databallr, for every page with this table. — a 10% white rule
    under each row, through the guide-photo bands too (Stats, the player career table and the other
    `stats-workspace` tables); replaces the earlier "seamless rows" choice.
79. [x] On a multi-team row, put the "now" pill on its own line. — that row keeps its season label and
    grows only as tall as the pill needs. The pill's rule is unchanged and deliberately not limited to
    the off-season: active listing, latest season only, listed team not among the row's teams (so a
    deadline deal shows until the first game for the new team). Older seasons get none (owner agreed:
    most rows would carry one).

Follow-up instructions (owner, 2026-10-14, retained-page data):
80. [x] Show the trade date in the Stats "now" pill tooltip when transactions know it; add the
    NBA player-index refresh date to the tooltip. — the latest dated joining event must be a
    trade to the current listing. An older trade is not borrowed after a later signing. Leonard
    reads "Index refreshed Oct 13, 2026. Traded Sep 14, 2026 (Basketball-Reference)."
81. [x] In-table Per Game / Regular controls should be 32px. — kit `sm` on Stats and the career
    table; measured group heights 32px at 1440, 48px at 390 with the existing phone touch sizing.
    [Measured screenshots and replayable checks](evidence/alignment/players/reference-v2/README.md#stats-follow-up).

82. [x] Make sure the "now" pill badge is center aligned with the text/dot beside it. It currently
    looks lower. If needed, increase the spacing between the name on the first line and the text
    on the second line to accommodate this. (Owner screenshot, 2026-10-14.) — subtitle text and pill
    share a flex row with centered alignment; their measured vertical center difference is 0 px at
    1440 and 390. The 18 px subtitle contains the whole pill without extra name spacing.
    [Screenshots and verification](evidence/alignment/stats/now-pill-centering/README.md).

83. [x] Increase spacing between first and second line in the table. Follow-up: "A smidgen less."
    (Owner screenshot and spacing adjustment, 2026-10-14.) — 2 px subtitle top margin using
    `--space-0-5`, reduced from the initial 4 px. Measured at 1440/390 in both densities; row heights
    and centered pill alignment retained. [Evidence](evidence/alignment/stats/name-subtitle-spacing/README.md).

### 2 Dashboard (player) — ✅ aligned (first revision)

Owner approval (2026-10-15): "I think I'm done the first solid revision of the main stats page
and the player page. It's not a perfect version, but a presentable one now." Rows 0–2 are
aligned as a first revision; later instructions reopen a row. Approved screenshots are Playwright
baselines in `dashboard/e2e/visual-baselines.spec.ts` (`stats-*`, `player-profile-*`; the player
profile baselines were refreshed in the approval commit for instructions 56–67).
Known gap fixed (owner request, 2026-10-15): "CAREER SINCE 2025-26" ran into the GP value in the
career table's pinned column. It now wraps inside the column with the season kept whole.
[Evidence](evidence/alignment/players/career-since-label/README.md).
Instructions (owner, 2026-10-13; agreed through a design interview, recommendations accepted):
1. [x] Back to table (Esc) appears only when the player page was opened from Stats and returns to
   that exact table state (scroll, search, sort, view). Esc acts only when no dialog/menu is open.
   Keep `/players/[id]` as the one player page; no separate in-table view.
2. [x] Overview order: header → latest-season summary → career season table → Player impact →
   Production Splits. Production Trajectory charts move to the Game Log tab.
3. [x] Career season table like Databallr's: the Stats table component with seasons as rows, the
   same view tabs, Per Game/36/75/100/Totals and Regular/Playoffs, with each percentile ranked
   against that season's Stats cohort. Only seasons the player appeared in (no empty years).
   It replaces the Multi-Season Career History table.
4. [x] Traded seasons are one row with stacked team logos; the per-team stints show on expand
   (replaces the Participation Stints panel).
5. [x] Clicking a season row sets the page's season; the selected row is highlighted and the
   summary above shows that season.
6. [x] Add a free NBA.com player-info source (fetched once, cached) for birthdate, country,
   jersey, college and experience. Missing values are omitted, never zero.
7. [x] Remove Prospective Forecast Status, the "Impact samples and artifact identity" disclosure
   and the "Why?" model note from Overview; the percentile cohort line becomes a tooltip.
8. [x] Career table newest season first, with a pinned Career row (games/minutes-weighted
   per-game and percentage values; impact columns and percentiles blank).
9. [x] Compact header: Back to table, photo, name, Team · Position · #Jersey; a bio grid; actions as
   icons plus Explore. The scope bar stays one slim row beneath.
10. [x] Header measurements: listed `6'11" · 284 lb` as the main line; a second "YYYY Combine"
    line (barefoot, with shoes, wingspan, standing reach, weight) only when a combine record exists.
11. [x] Age is as of the page's Through date; labelled "(as of <date>)" only outside the current
    season.
12. [x] Latest-season summary tiles: PTS, REB, AST, TS%, DPM, MPG with percentile bars.
13. [x] Remove the gold edge highlight around the latest-season summary card.
14. [x] Rename the Measurements tab to Combine; hide it when the player has no combine record.
15. [x] Compact, information-dense, but clear, organised and well-formatted throughout.
16. [x] When the first covered season is 2000-01 and the player was drafted before 2000 (or has no
    draft record), the bottom row reads "Career since 2000-01" with a one-line coverage note.
17. [x] The Regular/Playoffs toggle is the page phase: tiles, table and game log share it.
Done notes: Back to table/Esc via `from=stats` + saved scroll (1); summary → career table → impact
→ splits, trajectory heads Game Log (2); `PlayerCareerTable` reuses the Stats views, counting modes
and cells with per-season cohort percentiles, played seasons only, replacing 26 server profile
fetches (3, 8; the Career row is one exact multi-season Stats query, i.e. true summed totals and
shooting percentages, not the weighted approximation instruction 8 described); traded rows expand to team stints (4); row clicks and the phase pills navigate the
page scope (5, 17); new hoopR `playerindex` + `commonteamroster` feeds, 777/781 admitted, marts
`mart_player_bio` and `mart_player_roster_seasons` (6); forecast panel, impact samples and Why?
removed, cohort note is a tooltip (7); compact header with icon actions, listed line and a combine
line only when measured (9, 10); age as of Through, dated outside the current season (11); PTS,
REB, AST, TS%, DPM, MPG tiles (12); no accent edge (13); Combine tab (14); "Career since 2000-01"
with a coverage note (16).
Follow-up instructions (owner, 2026-10-14, career table speed):
18. [x] The career table is slow and loads row by row (Giannis); Databallr's rows appear at once,
    as if pre-loaded. Make the data load as fast and efficiently as possible, durably. — season
    cohorts and ranks persisted per release (content-addressed, superseded on any source or code
    change), one server-rendered read for every row, a one-player Career aggregate, an identity
    index and a post-deploy warm-up. Giannis 4.3–4.7 s (14 requests) → 48 ms (one read, in the
    page HTML); view and counting-mode switches make no request; values and ranks unchanged.
    [Career speed evidence](evidence/alignment/players/career-speed/README.md).
Follow-up instructions (owner, 2026-10-14, page redesign; agreed from the
[player page mockup](https://claude.ai/artifact/C3UjfZMcdm3A9qQZJ65TRy) v3):
19. [x] Full-width, left-aligned layout like Stats (no centred column), so the career table has room.
20. [x] Header: larger photo, a hairline divider, then one left-aligned column: name with a 40px team
    logo centred on it, Team · Position · #, bio facts (label over value with a quiet second line),
    the combine line and an honours row. Actions stay at the right.
21. [x] The drafting team's logo beside its tricode in the Draft fact, scaled to the text.
22. [x] Remove the black containers everywhere except the career table: the season summary, Player
    impact, Production Splits, Tracking and Combine sit on the page background as open sections
    (heading, one hairline, content), with typography that contrasts with the background.
23. [x] Season summary tiles add the career figure beneath each value (best season for DPM).
24. [x] Player impact values are signed; offence and defence sit under 1Y RAPM.
25. [x] Production Splits becomes "Recent form" beside Player impact; Last 10 / Last 5 values tint
    up (gold) or down (blue) against the season.
26. [x] Tracking and Combine: one row per stat (label, value, thin percentile bar, percentile) in
    place of the blue boxes; gold 80th+, blue 20th and below, grey between; groups fill the width.
27. [x] The header shows the player's current team (NBA player index); a faint glow behind the
    photo uses that team's colour. Season stats keep the team they were recorded with, and the
    summary names it ("65 games with LA Clippers") when it differs from the header team.
28. [x] Spacing and padding checked throughout; every value aligns with its neighbours.
Done notes (19–28): header photo, divider and left column with the current team (new
`current_team` from the NBA player index; retired and free-agent players fall back to the season's
team) and its colour glow; drafting team logo in Draft; summary, impact, Recent form, Tracking and
Combine as open sections; career figure per tile (best season for DPM, hidden for one-season
players); signed impact with Off/Def; Recent form tints at the shown precision; stat rows on the
Stats percentile scale; "N games with <team>" when the season's team differs from the header.
Honours row awaits the crawl below. [Redesign evidence](evidence/alignment/players/redesign/README.md).
Follow-up instructions (owner, 2026-10-14, redesign review):
29. [x] Remove the discoloured block under Season/Phase. — the team glow ran past the header and the
    sticky filter bar cut it off in a straight edge; the glow now ends at the header's bottom.
30. [x] The career table's height follows its rows. — Stats' viewport-height rule won when the page was
    opened from Stats (stylesheet order); the career rule now outranks it.
31. [x] Even spacing above and below the view-tab console. — 16px each (the tab panel's extra top padding
    removed; the console sits 16px above the table).
32. [x] Simple vertical divider lines between the career table's column groups (Profile, Impact,
    Counting, Eff, Shooting, Other).
33. [x] The "50 games" badge beside Data details. — it counted the game log's 50-row page; it now shows
    the games the player appeared in for the chosen window (68 for SGA's 2025-26).
34. [x] Remove the divider above the season line ("2025-26 Regular Season · Through …"). — the filter
    bar's bottom rule is off on the player page.
35. [x] Header photo uses Compare's identity treatment: the team-colour ring with the team logo badge.
    — shared `PlayerAvatar` (components/ui/identity.tsx), the same media as `PlayerIdentity`; the
    separate logo beside the name is dropped since the badge carries it.
36. [x] The team-colour glow circles the photo ring and is very subtle. — a halo centred on the
    avatar, 12% team colour fading out 32px beyond the ring; the header keeps that room so the halo
    has faded before the sticky filter bar.
37. [x] The Season / Phase / Through / Window controls use the console grey of the table's view tabs.
    — the player page's filter bar sits in `ControlScope tone="console"`, as Stats does (no page CSS).
38. [x] More contrast between the bio labels and values, like ESPN and Basketball-Reference. — values
    semibold white; labels medium weight in a dimmer grey (on-bg-tertiary mixed 75% toward the page,
    about 4.7:1); second lines stay regular.
39. [x] Country flags beside the country name. — 82 flags covering every country the NBA player index
    lists (its own spellings, e.g. "DRC", "Macedonia"), from flag-icons 7.2.3 (MIT, licence in
    `public/flags/LICENSE`) rendered to 60×45 PNGs (36 KB in all; the SVGs with coats of arms ran to
    180 KB); shown at 20×15. Unknown names show no flag. `lib/country-flags.ts`.
40. [x] Align "Year" in the career table. — left-aligned: YEAR, each season's logo, CAREER and the
    footnote all start 12px in, the same edge as the Per Game controls (measured at 1440 and 390).
41. [x] Slimmer scope controls and view tabs on the player page — built with Stats instruction 75.
42. [x] Basketball-Reference bio crawl (owner go-ahead 2026-10-14). — `courtlens acquire-bbref-bios`:
    26 index pages, name + birth-date matching (ambiguous players stay unmatched), player pages at 4 s,
    pages retained with receipts, profiles appended to `bbref_player_profiles` (newest serves). The
    header adds birthplace (Born), shooting hand (Listed), debut (Experience), High school and a career
    honours row (titles and major awards in gold); the career table adds an Awards column and an
    All-Star star on regular-season rows. Refresh yearly after the awards (late June, `--active-only`);
    see source policy v3. Earlier proposal text:
43. [x] Career table cells are clickable like Stats. — each season cell opens the same Stats trend
    dialog (stat switcher, add players, definitions) with the page's Stats query; the Career row stays
    plain. Also fixed a race where Esc could miss "Back to table" in the frame before its listener.
Follow-up instructions (owner, 2026-10-14, parser → marts → presentation, in this order):
44. [x] Parser v2 reads retained pages only: salary history (`#all_salaries`), current contract
    (`#all_contract`: per-season salaries, player/team options, dated signing/extension/trade
    notes), dated transactions (`#div_transactions`) and regular-season/playoff game highs
    (`#all_highs`). Add `courtlens reparse-bbref` to append new parser-version rows without fetching.
    Verify with small synthetic fixtures. — 14 tests pass; offline pass appended 569 v2 profiles,
    no fetches, original timestamps retained. [Evidence](evidence/alignment/players/reference-v2/README.md).
45. [x] Add dbt marts keyed by NBA player_id: `mart_player_awards` (season, award, vote place),
    `mart_player_honours`, `mart_player_salaries` (season, team, salary, share of cap using existing
    finance thresholds), `mart_player_transactions` (date, type, from/to team). Document temporal
    semantics: season awards become known after season end. Run dbt locally from `warehouse/`
    with `../.venv/bin/dbt run --profiles-dir . --target-path $TMPDIR/dbt/target`; the Compose
    migrate image is stale. — five models build, 19 dbt tests and the actual-SQL PostgreSQL
    fixture pass. [Measured rows and semantics](evidence/alignment/players/reference-v2/README.md).
46. [x] Add an open Contract section: current contract by season (salary, % of cap, options and
    guaranteed amounts where existing finance data knows them), dated contract events, salary
    history and career earnings. Then a dated transactions timeline and career highs. Keep the
    presentation organised and clear; credit the source on each. — retained reports, separate
    remaining guarantees, expandable history and earlier transactions; live 1440/390 evidence
    and the glance test are in [the reference report](evidence/alignment/players/reference-v2/README.md).
47. [x] Header says "Last with <team>" when a player has no active NBA listing. — latest index
    last team, independent of selected season; retired/free-agent status is not inferred.
48. [x] Verify lint, typecheck, Vitest, pytest and sandbox Playwright, with screenshots at 1440
    and 390. Commit one block at a time; do not push. Only the owner marks alignment. — dashboard
    checks and Ruff pass; Python 2,106; Vitest 525; focused browser 26 plus four baselines. Full
    mypy retains two pre-existing Gemini SDK errors reproduced from HEAD (reference report).

49. [x] Put a dark glass (glassmorphism/visionOS) container around each headline stat to improve
    contrast against the blue backdrop. The owner may extend the treatment to other player-page
    information later; this pass covers PTS, REB, AST, TS%, DPM and MPG only. (2026-10-14.) — dark
    translucent gradient, 12 px backdrop blur, restrained hairline/inset highlight and rounded
    corners. Six cards on desktop, three by two on phone; live 2025–26 values and content fit
    verified. [Evidence](evidence/alignment/players/dark-glass/README.md).

50. [x] Fix the player career table's horizontally scrolling metric values showing through the
    pinned Year cell; Stats does not have this overlap. (Owner screenshot, 2026-10-14.) — career
    frame lacked the shared hover colors, making its hovered pinned cells transparent. Both
    colors now derive from its opaque table surfaces. Pixel-comparison regressions failed at
    1440/390 before the fix and pass after, alongside live 2022–23 row verification.
    [Evidence](evidence/alignment/players/career-year-scroll/README.md).

51. [x] Give the headline-stat containers a more pronounced dark glass look, with more emphasis
    on the glass effect. Follow-up: "the glass effect should be throughout not like a highlight."
    (Owner screenshot and clarification, 2026-10-14.) — uniform surface-0 tint at 58% opacity,
    20 px backdrop blur / 150% saturation across the whole face, a 10% rim and soft shadow.
    No gradient or directional reflection. Live desktop/phone values, content fit, contrast and
    existing player browser checks pass. [Evidence](evidence/alignment/players/dark-glass-uniform/README.md).

Follow-up instructions (owner, 2026-10-14, career awards):
52. [x] There is a bug with the awards section on the player page. Make the awards section its
    own column like Profile / Impact / Counting, with a subcategory such as List / Accolades.
    Currently the row highlight is broken around awards because we didn't create a proper section.
    Fixed with a 240 px column, visible Awards / Accolades headers and the metric-cell background
    and hover treatment. Dividers and highlighting now span the badges.
53. [x] The badges aren't descriptive or clear enough: "NBA1" is unclear. Try stacking them to
    use the row height more efficiently. Find a succinct visual/textual treatment that makes the
    award badges clear without being verbose. Labels include "All-NBA 1st", "All-Def 2nd",
    "MVP 2nd" and "DPOY Winner". Badges wrap, winners stay gold, and full names are available
    to screen readers. Live Kawhi rows fit on at most two lines at 1440/390 with unchanged
    row heights. Lint, types, 526 Vitest tests, production build and 15 player browser checks pass.
    [Evidence](evidence/alignment/players/career-awards/README.md).

54. [x] Center "Accolades" under "Awards". It's the only field. Follow-up: confirm Accolades
    has the same padding below it as the other stats. (Owner, 2026-10-15.)
    Both text centers match exactly at 1440/390; Accolades and all metric headers have 4 px
    bottom padding. Badges retain their left alignment. Lint/types, 526 Vitest tests, production
    build and seven career browser checks pass.
    [Evidence](evidence/alignment/players/career-awards/README.md#centered-subheader-follow-up-2026-10-15).

55. [x] Apply the same glass/visionOS effect as the headline stats to all applicable containers
    below the player-page table, using judgment about where it looks good. Make the sections
    below the table use title case. (Owner screenshot, 2026-10-15.)
    Player Impact, Recent Form, Contract, Transactions and Career Highs share the headline
    cards' uniform glass recipe. Each is one padded panel; nested content remains together.
    Headings, subsections and disclosure labels use title case. Live 1440/390 appearance parity,
    content fit, contrast and expanded sections pass, alongside lint/types, 526 Vitest tests,
    production build and 15 player browser checks.
    [Evidence](evidence/alignment/players/overview-glass/README.md).

Follow-up instructions (owner, 2026-10-15, contract and career footer):
56. [x] Under the stats overview table, the Contract container should be a table formatted the
    same way as the stats table; all its information can be put in a table. (Owner screenshot.)
    One table in the career table's look: Season pinned, Salary / Terms / Events group headers,
    Current Contract and Salary History section rows (history newest first, no disclosure),
    each season's dated contract events in its own row (NBA July–June season), and gold
    Remaining Guaranteed / Career Earnings total rows. Events outside the listed seasons get an
    Other Contract Events row. [Evidence](evidence/alignment/players/contract-table/README.md).
57. [x] At the bottom of the player stats table (e.g. Kawhi Leonard), put "Total = 14 Seasons",
    then the team logos with how many seasons he played for each team. Logos in first-team
    order with counts (Kawhi: SAS 7, TOR 1, LAC 6); a split season counts for each team.
    Follow-up: "make the team logos larger" — 32 px logos (from 20), medium-size label and counts.
58. [x] Rates (Per 36) and the Per 36 mode duplicate each other on Stats and the player table.
    Confirmed redundant: every Rates column is a per-36 value the Per 36 mode already shows
    through Overview, Shooting and Defense. The view is removed from both tables and the
    recoverable canonical presets; the `advanced` ID stays reserved so saved bundles validate.
59. [x] Make the header text for the containers below the stats table larger, use applicable
    Lucide icons beside these headers, and remove the divider line for a cleaner, less-is-more
    look. (Owner, 2026-10-15.) 20 px headings with Activity, TrendingUp, Banknote,
    ArrowLeftRight and Trophy icons; no heading hairline.
    [Evidence](evidence/alignment/players/section-headings/README.md).
60. [x] On the player page, why "2x Def. POY" instead of "2x DPOY"? (Owner screenshot, 2026-10-15.)
    Basketball-Reference's wording was passed through; the honour tidier now writes DPOY.
61. [x] Trend dialog: title-case the graph title, and try removing the divider lines above and
    below the graph for a cleaner look. "PTS Progression"; both hairlines removed (the
    definition footer keeps its separator).
62. [x] Make the outline around the table search solid instead of the double outline. (Owner
    screenshot, 2026-10-15.) One 2px gold outline; the Stats override moved into the foundation
    layer so the shared offset ring no longer draws outside it.
    [Evidence](evidence/alignment/players/dpoy-trend-search/README.md).
63. [x] On the player page, rename "Transactions" to "Transaction News"; the "Earlier
    Transactions" drop-down looks oddly indented. (Owner screenshot, 2026-10-15.) Renamed; the
    disclosure label now starts at the dates' edge, and the revealed list stays aligned.
    [Evidence](evidence/alignment/players/transaction-news/README.md).
64. [x] The Earlier Transactions selection highlight extends farther left; make it have none.
    The contract table needs work: section headers aren't centered over their sub-headers,
    Contract Events should be centered on its own, Season should be a header like
    Salary/Terms/Events, and the thin vertical dividers between header sections go.
    (Owner screenshots, 2026-10-15.) New kit `text` variant (no fill, flush); contract header
    and cells centered, Season a two-row group label, no header rules.
65. [x] Use the stats table's header spacing for the contract table, and center the leftmost
    headers (Year / Current Contract). (Owner screenshot, 2026-10-15.) Both headers measure
    28 + 40 px; Year and the contract section labels are centered.
    [Evidence](evidence/alignment/players/contract-header/README.md).
66. [x] Contract headers Current Contract / Team / Salary / % of Cap / Option should align with each
    other (same padding below), and columns should be properly distributed so the Salary group
    header and the Salary sub-header are center-aligned. (Owner screenshot, 2026-10-15.)
    Current Contract moved into the column-label row; fixed, equal data columns; centers measured.
    [Evidence](evidence/alignment/players/contract-header/README.md).
67. [x] Add a similar stats table to Career Highs. (Owner, 2026-10-15.) Shared reference-grid
    styles; Phase lead column; Scoring / Counting / Other groups over equal columns.
    [Evidence](evidence/alignment/players/career-highs-table/README.md).
68. [x] Like ESPN and the PvP card: a team-shaded background with the team logo behind the photo,
    and the actual team logo, fairly large, next to the team the player plays for. (Owner
    screenshots, 2026-10-15.) The PvP tile (168 px, 104 px on phones) replaces the round photo and
    halo; a 36 px logo leads the identity line.
    [Evidence](evidence/alignment/players/team-header/README.md).
69. [x] On both PvP and the player page, make the background team logo contrast well for every
    NBA team; the Raptors logo is hard to see on Kawhi's picture. (Owner screenshot, 2026-10-15.)
    Lightened artwork (brightness 1.8, saturation 0.75) with a 1.5 px light edge at 50%: at least
    2.2:1 for all 30 teams, against 1.03 before. The share image matches. Superseded by 71.
    [Evidence](evidence/alignment/players/team-header/README.md#watermark-contrast-instruction-69).
70. [x] On both the player page and PvP, enlarge the background team logo slightly so heads block
    less of it; the team name and logo beside the name supplement it. (Owner screenshot,
    2026-10-15.) 115% of the tile, centred a little above the middle; the share image matches.
    [Evidence](evidence/alignment/players/team-header/README.md#larger-watermark-instruction-70).
71. [x] Now that the logos are larger and easier to see, undo the contrast effect. (Owner,
    2026-10-15.) Plain logo at 42% opacity with no filter, at the 115% size; share image too.
    [Evidence](evidence/alignment/players/team-header/README.md#contrast-treatment-removed-instruction-71).

Operational instructions (owner, 2026-10-14):
- The existing Basketball-Reference crawl runs in another session. Do not run
  `acquire-bbref-bios` or start another crawl. Its eventual summary is
  `~/.cache/courtlens-tmp/bbref-crawl-report.json`. Leave its process alone.
- Ports 3100 and 8000 belong to the owner's servers. Browser verification uses a sandbox copy
  on 3180/4180; copy `docs/` with rsync, never symlink it. Scratch lives under disk-backed
  `$TMPDIR` and is deleted with any task-owned servers at completion.
- Fetching follows source policy v3. This work adds no fetches.
- Deferred smaller work: aliases for 76 unmatched players (nicknames, accents, missing birth
  dates); optional raw-page compression (roughly 1–1.5 GB to about 200 MB). No compression while
  the crawl is writing.
Evidence: docs/evidence/alignment/players/ ([README](evidence/alignment/players/README.md)).

### 3 PvP — 🔄 in progress

Owner completion decision (2026-10-17): "I think we are done the player comparison page and
will start on the next page." The next page in the ordered queue is Teams (`/teams`).

Instructions (owner, 2026-10-15; concept board https://claude.ai/artifact/RE9bkpgam6NNnoVoEEvGcc,
owner chose the recommendation and delegated the three open decisions):
1. [x] Revamp /compare into a Databallr-style dual player card: one centered card holding square
   team-tinted portraits with a badge, the preset tabs, the counting mode and mirrored value rows,
   with a difference pill on the leading side only. — `player-compare-view.tsx` + `.css`; portrait
   press opens search in place (`compare-player-slot.tsx`); swap button between portraits.
2. [x] Add the Stats page's small league percentile number under each value (gold → gray → blue);
   no row tint. Group labels on Overall. — cohort query asks for table percentiles; Counting /
   Efficiency / Profile groups; centre labels use short names (Points, TS%).
3. [x] Edit Metrics opens the custom metric picker in a drawer (delegated decision). — grouped
   by catalog category; per-game twins and aliases hidden; saved views apply from the drawer.
4. [x] One bio line under each name: age · position · height (delegated decision). — season
   listing via the bio endpoint; absent facts are omitted.
5. [x] Share Image exports the card itself (fixes the known Compare Export gap). — SVG copy of
   the card (`compare-card-export.tsx`), headshots inlined; Export SVG uses it too.
6. [x] Owner question, 2026-10-15: preselect two known players or show grayed avatars? Agent
   recommendation: open on a real pair, the season's top two scorers (pts/game, 500+ minutes),
   written to the URL. Supersedes presentation-clarity C5 for this page; silhouettes remain only
   when no pair can be resolved. — server redirect; live default Dončić vs Gilgeous-Alexander.
7. [x] Owner, 2026-10-15: show how each player looked in the compared season ("ingest those new
   photos"; disk cost accepted). — `player_season_portraits` (migration `17b810a4f015`, sealed,
   misses recorded) filled by `courtlens acquire-season-portraits` from the NBA CDN's team-season
   headshots (`/headshots/nba/{teamId}/{startYear}/1040x760/{playerId}.png`, 2015-16 on; folder
   is the season's start year, checked on Durant's OKC/GSW/BKN/PHX/HOU stints). Targets are
   observed player-team-seasons only. The portrait endpoint takes `season`/`team`, prefers the
   named team for traded seasons, falls back to the current headshot and names the served season
   in `X-Portrait-Season`. Compare portraits and the share image request the compared season.
   Hosted demo: needs the migration plus a refreshed dump and portrait rsync to show them.
Follow-up instructions (owner, 2026-10-15, first review):
8. [x] Team logo on or near each portrait; handle players with several teams in the scope. — logos
   top-left of the photo, every team of the scope ordered by last appearance (`teams_chronological`),
   latest in front; the photo and tint use the latest team.
9. [x] Owner question: an accolades block like Stathead's that follows the compared season? — yes:
   Accolades (titles, MVP, DPOY, All-NBA, All-Def, All-Star) counted through the cutoff, then
   "<season> Honors" (MVP/DPOY vote, All-NBA/All-Def team, All-Star). Honours count once announced
   (All-Star from Feb 15, awards from Jun 1 of the season's end year); titles from playoff box
   scores (`services/player_honours.py`). Rows neither player holds are hidden; unknown is "—".
10. [x] The card's bottom row is only the CourtLens wordmark, slightly larger. — 20px wordmark,
    centred; source and GP moved to Data details.
11. [x] Owner question: an extra indicator beyond the pill that makes the leading side clearer? —
    the leading value is bold and bright, the other recedes to secondary text; gaps that round
    to zero are ties (no pill, no emphasis). No tally or overall winner.
12. [x] A visible Lucide icon on each portrait showing the player can be changed. — UserRoundPen
    (`user-edit`) chip top-right, accent on hover/focus.
13. [x] Move Edit Metrics / Share / More from above the card into the scope console, left of
    Data details. — ContextBar `modes` slot (stays visible on phones).
14. [x] Edit Metrics is searchable and lists abbreviation + term like the glossary. — search by
    abbreviation, term, key or alias; glossary short names and terms in one column.
15. [x] Smooth fade-in when players change or swap sides. — slots and rows re-key on the pair,
    preset and mode and fade up over `--dur-slow` (reduced motion collapses it).
16. [x] Remove the "Descriptive differences under a shared scope" note.
17. [x] Trend lines open as a drawer extending from the card, not a separate block; remove the grey
    outline around the players box and the rolling-discipline disclaimer. — a tab under the card
    opens a tray tucked beneath it; `MultiPlayerLinesView variant="embedded"` drops the frame,
    legend box and footnote (Stats keeps the panel).
Follow-up instructions (owner, 2026-10-15, second review):
18. [x] Team logos bigger and attached to the photo's edge like the player page badge, on an opaque
    backdrop (owner screenshots of the compare photo and the player page ring badge). — 48px opaque
    surface-3 discs (36px logo) riding the photo's lower-left corner; traded players overlap discs.
19. [x] The whole comparison fits the unscrolled page; today it needs scrolling. — 1040px card: a
    band of both players (photo + name side by side) around the controls, then stats and
    accolades as two mirrored tables; one-line rows with the percentile beside the value. At
    1440x900 the card and trend tab end at 866px (Season) and 894px (Career). Below 960px it stacks.
20. [x] Drop the greyed trailing values; like Stathead, only the leading side is heavier.
21. [x] A career stats comparison (owner screenshot of the Per Game menu). — a Season | Career
    switch beside the counting mode (`span=career`). `GET /api/workbench/compare/career`
    aggregates each player's observed seasons up to the compared one with games before the
    cutoff only (`career_through`); career rows carry no league percentile, add a Seasons row and
    the photo badge shows career games. Per 75/100 stay disabled in Career.
Follow-up instructions (owner, 2026-10-15, third review):
22. [x] Return to the previous slim card, with everything on the unscrolled page; try dropping the
    percentile numbers to save space (keep or drop decided later). Supersedes 19's wide layout. —
    560px card again; percentiles hidden (`SHOW_PERCENTILES = false`, one flag to restore);
    26px one-line rows; presets and one span/counting menu share a row (Career · Per Game /
    Totals live in that menu, as the owner's screenshot pointed); accolades follow the stats.
    The card plus trend tab ends at 1,104px (default), 1,188px (a season with honours) and
    1,254px (Career) at 1440 wide; the owner's screenshot shows about 1,320 CSS px of height.
23. [x] Put the CourtLens logo beside the card's wordmark. — BrandMark beside the wordmark on the
    card and in the share image.
Follow-up instructions (owner, 2026-10-15, fourth review):
24. [x] The card saves too much space; give it more breathing room. — 580px card, 164px photos,
    30px rows, 26px group labels, roomier gaps. Ends at 1,230px by default at 1440 wide; a
    season with full honours 1,330px and its Career view 1,400px.
25. [x] Team badges styled like the player page badge, without the dark outline. — the
    `.ui-identity-badge` recipe: surface-3 disc, 4px padding, shadow-1, no border.
26. [x] Animate the player search revealing under the photo. — slides and fades in over
    `--dur-base`; the field takes focus.
27. [x] Centre the "Player A/B" label above its search field.
28. [x] Career totals read grey next to per-game values; make them consistent. — career rows are
    unranked, and the percentile cell muted unranked values; card values now always use the text
    colour. Totals of counted stats read as whole numbers with separators (14,984).
29. [x] Swapping players still lags; make it feel immediate. — the card mirrors both sides at once
    and only rewrites the URL (no server round trip; about 70ms in the sandbox); the fade is
    a short opacity settle.
30. [x] Owner question: is the current-season photo up to date? Wembanyama's 2025-26 photo looks
    old next to Basketball-Reference and ESPN. — yes: the CDN's "latest" headshot is byte-identical
    to its 2026-27 folder (uploaded Oct 2026, media day), which is what those sites show now. The
    card shows the CDN's 2025-26 folder photo for the 2025-26 season. No change.
Follow-up instructions (owner, 2026-10-15, fifth review):
31. [x] Expanding Trend lines scrolls it into view and collapsing scrolls back up; fix the bug where
    collapsing it disturbs the Compare nav item's bottom highlight. — the header is sticky and
    re-renders on in-page URL changes, so a scroll between renders read as a move of its
    shared-layout indicator; `layoutDependency={activeSection}` limits it to section changes
    (sampled every frame through a collapse: one position).
32. [x] Owner question: show the team name as text near the player? — yes, the full team name
    under the player's name; a traded season lists both, oldest first.
33. [x] Owner question: the logo discs need to be more visible/larger; Databallr puts the team logo
    in the photo background. Recommend the best option. — Databallr's: the latest team's logo
    large behind the headshot (42% opacity) on the card and share image; the corner discs go,
    the team line covers traded seasons.
34. [x] Owner question: is the off-centre background logo deliberate, or should it be centred? —
    centred behind the head.
35. [x] Owner question: a small team logo next to the team name text? — yes, a 16px logo per team.
36. [x] Expanding Trend lines scrolls to the end of the page (the whole drawer in view); collapsing
    scrolls smoothly back up to the original position (refines 31). — follows the drawer to the
    page end while its chart loads (2.5s); closing scrolls back first, then folds the drawer
    (on `scrollend`, 1.2s fallback). Reduced motion jumps instead.
Follow-up instructions (owner, 2026-10-15, sixth review):
37. [x] Trend lines expand and collapse with a smooth animation of the drawer sliding out of and
    retracting into the comparison card. — the drawer's height animates on grid rows (0fr to 1fr)
    over `--dur-slow`, opening via `@starting-style`; the page follows it down instantly each
    frame. Closing retracts it while the page scrolls back, and the URL changes after the
    retraction (transitionend, 700ms fallback). Sampled per frame: open and close both settle
    in about 350ms with no tab jump.
Follow-up instructions (owner, 2026-10-15, seventh review):
38. [x] Owner question: should the season menu show which seasons both players played, or should each
    player get their own season so different seasons can be compared? Choose the best UX and
    integrate it into the card. — both: a season menu under each player lists only seasons they
    played (`seasonA`/`seasonB` override the page season; the page season clears it). A different
    season is read with that season's default cutoff and merged per side (stats, bios, photos,
    accolades, career); swap carries each season with its player. The page Season menu notes
    "Dončić only" / "neither played" per season.
39. [x] Handle seasons a player did not play: today the card shows the player ID as the name, "Age 5"
    and "0 GP" (owner screenshot of 2003-04 Dončić vs Gilgeous-Alexander). Make the text clear. —
    the compare API names players from the identity catalog when they have no games; the card
    greys the photo, badges it "No games" and reads "No games in 2003-04 / Played 2018-19 – 2025-26"
    instead of age and team.
40. [x] Move the card down a little: more padding above and below the scope console. — 8px above,
    16px below.
Follow-up instructions (owner, 2026-10-15, eighth review):
41. [x] Tighten the spacing around the scope console; the card sits too close to the bottom of the
    page (owner screenshot). — console padding 4px/8px, page gap 8px, card section gap 12px: the
    card and trend tab end about 40px higher (1,274px for a cross-season pair at 1440 wide).
42. [x] Owner question: should the console's Season act as a global override that resets any
    per-player season? — yes: changing it clears `seasonA`/`seasonB` (ContextBar
    `clearOnSeasonChange`), so both players follow it; per-player menus remain for one-off picks.
Follow-up instructions (owner, 2026-10-15, ninth review):
43. [x] Title case for "No Games" wherever it appears. — badge, caption and per-player menu.
44. [x] Owner question: show in the season menu, with each player's photo and a coloured Lucide
    icon (a check), which players played each season, instead of "neither played" text? — yes:
    the console season is a menu (`compare-season-picker.tsx`, through ContextBar `renderSeason`)
    whose trigger and rows show both players' mini photos, checked in their identity colour when
    they played and greyed when not, newest first; screen readers get the status in words.
45. [x] The season chosen on one page must not carry to other pages (today Compare's season reaches
    the Stats page); every page keeps its own season. — header links (desktop and mobile) and
    global search results are plain hrefs, so each page opens at its own defaults; header
    availability is judged at those defaults. In-page drill-down links (a player from a season's
    roster) still keep their season. Shared app shell change, so it applies to every page.
Follow-up instructions (owner, 2026-10-15, tenth review):
46. [x] The player search under a photo needs a proper exit animation (it fades in but vanishes). —
    it fades and lifts out over `--dur-fast` before unmounting (sampled 1.0, 0.82, 0.42, 0), then
    the name block fades back in.
47. [x] Fix the page glitch at the end of the Trend lines retraction. — the drawer stays mounted once
    opened (inert while closed) and only its grid rows transition, so nothing unmounts or reorders
    at the end; the retraction eases in and out. Sampled: scroll and tab position hold steady
    after the drawer reaches 0.
48. [x] Search results drop verbose captions ("Observed in selected scope", "No observed appearances
    in selected scope · No appearances in selected season"); picking a player gives their most
    recent valid version. Remove them wherever search results use them unless necessary.
Follow-up instructions (owner, 2026-10-15, season honors):
49. [x] On the player comparison page, use player-page-style badges for the compared year's
    honors, covering all recorded season accolades rather than only All-Star, without making
    the comparison container longer. — all recorded season codes and admitted titles use the
    player-page badge labels. Final wrapping follows 54 and 56, with each side's season and cutoff.
50. [x] Add small MVP / All-Star icons to the per-player season picker so MVP seasons can be
    spotted at a glance, like the global season selector's visual aids. Use distinct major-accolade
    icons: medal for MVP, trophy for a championship year, star for All-Star. Make them clear.
    — descriptive accessible labels and a compact legend; only honors known before the cutoff.
51. [x] Make the All-Star icon yellow too, and the per-player season dropdown wide enough for
    "All-Star" to stay on one line.
52. [x] Under season honors, make the All-Star badges yellow too. Widen player search results to
    fit full player names. Split the honors badges between players on the same axes as their
    numeric values; stack badges when needed. — centered groups; final wrapping follows 56.
53. [x] Fix season-honors spacing so any combination of badges looks aligned and structured.
    — centered rows with a uniform 4px gap; every badge stays visible.
54. [x] What does +3 mean? List individual accolade badges instead. — supersedes the preview
    and overflow count. Show every honor in compact rows centered on each player's values.
55. [x] The counting-mode dropdown's entry outlines show through, and selecting an option can
    move it to the next line. Keep its position fixed on the toolset line. — shared menu, stable
    160px slot, dense kit presets; the phone layout always keeps its separate counting row.
56. [x] Do not stack each individual honor. Stack only when the current line runs out of room,
    with about one or two badges per line. — centered wrapping within each player's column.
    Measured at 1440 and 390; every badge remains visible, and counting-menu coordinates stay
    unchanged across modes. 544 Vitest and 53 browser checks pass; the one-season fixture skips
    the console override test. [Evidence](evidence/alignment/compare/season-honors/README.md).
    Instructions 49 through 56 are ready for owner review. Instruction 48 remains pending.
Follow-up instructions (owner, 2026-10-15, honors copy and counting-menu context):
57. [x] Remove "Pending" under season honors and the "End-of-season awards pending at this
    cutoff" note; they make no sense in this section. Both card and export show a dash for
    empty honors, with source-aware accessible text. Existing award cutoffs remain.
58. [x] In the comparison-container dropdown, shade the year differently so users know it is
    fixed context rather than an entry. Season and career headings use a darker fill and
    semibold text; neither is selectable or receives menu-item focus. Desktop and phone
    captures, 544 Vitest tests, 29 browser checks, lint, typecheck, and production build pass.
    One browser test skips on the one-season fixture.
    [Evidence](evidence/alignment/compare/honors-context/README.md).
    Instructions 57 and 58 are ready for owner review; instruction 48 remains pending.
Agent review (2026-10-15, owner asked for a polish pass):
59. [x] Titles from playoff box scores named a conference champion as the season's champion
    when the cutoff fell inside the playoffs (2024-05-28 named BOS; LeBron gained a 2016-17
    title through 2017-05-27). A champion now wins every round: four best-of-seven series, or
    three through 2002-03 (best-of-five first rounds). All 26 admitted seasons resolve to the
    real champions. An unknown player ID now says so instead of a replay-date error.
60. [x] Owner-delegated polish: no pills or emphasis on Seasons and accolades when a player is
    compared in a season before their first game; per-player season labels ("2025-26 /
    2016-17") on the Career menu, caption and share title; team logos stay on the first line of a
    wrapped team name and both season pickers share a baseline on phones; Edit Metrics and More
    are disabled without a pair. `app/styles/pages.css` closes `@layer pages` at line 40, so its
    later rules are unlayered (left as found; needs its own pass).
Follow-up instructions (owner, 2026-10-16, fantasy mock draft):
61. [x] A Clear players control returns both sides to grey avatars; an open side shows a plus
    that searches in place. — `user-clear` icon under Swap; `?empty=1` keeps the cleared card
    from reloading the default pair; one chosen side stays while the other is open
    (`compare-empty-slot.tsx`).
62. [x] Pill intensity follows how decisive the lead is. — outline, tint, solid
    (`pillStrength`): the stronger of the stat's own gap (relative, or percentage points for
    rates) and the league percentile gap; contrast stays at 4.5:1 or better; the share image
    matches.
63. [x] A games-played category for durability. — Overall's last group is Availability (Minutes,
    Games, Avail %). Avail % is games over the teams' games in the same span before the cutoff,
    season-to-date and Career only (`player_honours.availability`). No roster feed: a first team
    counts from the season's first game, a later team from the player's first game for it, and a
    traded season is capped at the most games any of the player's teams played. A mid-season
    signing therefore counts earlier team games as missed. Nothing says why a game was missed.
64. [x] Up to five players (owner approved the proposal, 2026-10-16). — `layout=grid` with
    `players` (columns in order) and `seasons` (each column's own season): a label column and one
    column per player, widening with the count; each row's best value reads heavier on a gold
    tint (`bestColumns`: unknown never leads, all-way ties have none, no overall winner). Tiles
    carry remove, change and season controls; a "+" tile adds until five. Add player on the duel
    opens the grid; Duel card returns two columns to the duel. `GET
    /api/workbench/compare/group` serves every column from one Stats read per season (season rows
    or careers, titles, availability; unknown IDs 404, more than five 422). Phones scroll the
    columns under a fixed label column. The Stats compare button and tray open the grid for three
    or more. Share Image draws the grid.
65. [x] Suggestions before typing in every player search and the main search. — the scope's
    season leaders by points per game (the Stats default sort), from players with at least half
    the scope's most games, labelled "Season leaders · <season>", never "popular"; up to three
    recent picks lead in pickers, and players already on the card are never offered. Fixed
    candidate lists (planner roster) keep to themselves. Instruction 48's captions are already
    team codes only in every result list.
Follow-up instructions (owner, 2026-10-16, grid and search review):
66. [x] Empty slots show a headshot-sized, bald, neutral-grey head-and-shoulders silhouette
    instead of the small user icon (`player-silhouette.tsx`).
67. [x] The grid's open "Add player" tile can be closed like a player; a toolbar "+" reopens it.
68. [x] Grid section headings (Counting, Efficiency, Accolades, Season Honors) are centred over
    the player columns instead of left-aligned.
69. [x] Pressing "+" focuses the search without opening results; results open when the field is
    pressed, typed in or arrowed into (`openOnFocus={false}` on the compare searches).
70. [x] Recent entries look like every other result: each is looked up again in the current
    scope (`useScopedRecents`), with its team logo and code, in pickers and the main search.
71. [x] Advantage pills drop the outline: a faint tint, a stronger tint, then the full colour
    (12% / 30% / solid; text contrast 4.66:1 or better); the share image matches.
Follow-up instructions (owner, 2026-10-16, transitions between player counts):
72. [x] One layout per player count, with seamless steps between them. — 0-1 players: the duel
    card with open slots; 2: the duel card; 2 with the add tile open, or 3-5: the grid. Removing to
    two, or closing the tile with two, returns to the duel on its own (the "Duel card" button is
    gone); a grid URL of one or none redirects to the duel form; `players=` of three or more is the
    grid. Grid columns are 140px, so two players and the open tile are exactly the duel's 580px.
    The grid keeps the duel's order (photos, presets, stats), one subtitle for every count, and the
    console season picker shows every player's mark (`SeasonMark`). After a pick, focus returns to
    the slot instead of the page. Phones keep the presets whole and headings on screen.
73. [x] The empty search's dropdown appears once, complete: it waits for the season leaders and the
    refreshed recents (at most 600 ms) instead of growing as entries fill in; the main search's
    empty state waits the same way. Measured: one appearance at about 170 ms with every logo.
Follow-up instructions (owner, 2026-10-16, polish):
74. [x] No cramped side scroll: the grid fits the card's padding and border exactly (a 2px overflow
    drew a needless bar), and a real overflow gets room under the last row. Title case for "Add
    Player" and "Search Players" (every player search). Add Player on the duel draws the grid
    from the pair already on screen (about 830 ms -> about 100 ms) and returns the same way; the
    slot search slides in at the fast duration.
75. [x] Shai's 2025-26 MVP was in the data but hidden: season awards counted only once announced
    before the cutoff, and a finished season's default cutoff is its last regular-season day. Owner
    chose option 1 (2026-10-16): a season's awards also count once the cutoff covers its whole
    regular season (`completedSeasons`: only seasons whose play-in or playoffs exist, so one in
    progress never qualifies). A cutoff inside the season still hides them. Applies to the duel,
    the grid, the share image and the season picker's marks. Supersedes the timing in 9.
Follow-up instructions (owner, 2026-10-16, honors layout):
76. [x] Season honors read as a grid: one mirrored row per award either player holds (Title, MVP,
    DPOY, Rookie, 6th Man, MIP, Clutch, All-NBA, All-Def, All-Star), labelled in the centre like
    the stats, each player's result in their column ("Winner", "4th", "1st Team", "Selected"; a
    dash when only the other holds it). Gold still marks an earned award or All-Star, never a
    side. The grid uses the same rows; both share images draw them. Supersedes 52-56's wrapping.
77. [x] Clear players reads at a glance: a "Clear" text button with the remove × (the same mark
    as each tile's remove) replaces the user-x icon, on the duel and in the grid toolbar.
78. [x] The empty-slot silhouette reads as an athlete, framed like a headshot: a larger bald head,
    angular jaw, short thick neck and straight shoulders cropped low (owner reference image).
79. [x] "Clear" is a plain text button, without the ×.
80. [x] Honor rows rank results (a win, title, All-Star or 1st Team over a 2nd Team; a lower vote
    place over a higher one). The better result takes its player's colour in the stat pills'
    tiers: one place apart slight, two or three clear, more large; against no honour the result
    itself decides. Ties stay plain; the award icons still mark what was earned. The grid tints
    each row's best in gold like its stats; both share images match (`honorLead`).
81. [x] The silhouette is traced from the owner's reference image itself (row-by-row half-widths,
    mirrored, simplified and smoothed), so its head, ears, neck and shoulder slope match it.
82. [x] The silhouette is sized like a player headshot: enlarged 1.15x from the bottom centre, its
    head as high and as wide in the tile as a real portrait's.
83. [x] A tied honour (both All-Stars, both 1st Team) reads as held equally: a brighter,
    side-neutral chip (white semibold on a light tint), distinct from a lower result's plain grey
    and from a lead's player colour; the share images match.
Guardrails kept: no overall winner or lead tally; unknown values show "—" with no pill; Per 75 /
Per 100 stay disabled with their reason.
Evidence: docs/evidence/alignment/compare/

### 4 Teams — 👀 ready for review (instruction 8 awaits the owner's conference list)

Owner start (2026-10-18): "Let's begin the revamp for the teams pages", with Databallr references
for Teams, the Teams menu, Roster Shapes, Stat Line Shift, Contracts (overview, roster table, pies)
and Free Agency ("some things aren't absolutely necessary like the 3d view for roster shape").

Starting state (survey, 2026-10-18): `/teams` (`components/team-explorer-view.tsx`) is the
pre-alignment "Team Stats & Cohorts" page: context bar, Net rating leaders chart, three stat
tiles, a gated ordering note and `TeamStatisticsTable` with percentile pills ("98 pct") and
Compare/Profile buttons per row; Cards and Efficiency Plot views. At 390px the table starts
~1,300px down and shows two columns. `/teams/[id]` has paired rating bars, eight stat tiles and
Overview (participation cohort, statistical peers) / Four Factors / Schedule tabs in the old
`data-table` style, without season logos. Databallr's six factors are three per side in points
per 100 relative to league: OFF = oTS + oTOV + ORB, DEF = dTS + dTOV + DRB, Net = OFF + DEF =
NetEff (oTS + dTS) + NetPoss (the four possession terms); every input is in the admitted team
box scores. Evidence: `docs/evidence/alignment/teams/before/`.

Instructions (owner, 2026-10-18; answering the start-of-page proposal):
1. [x] Scope: work row 4 (`/teams` and `/teams/[id]`) now; Roster Shapes, Stat Line Shift and
   Contracts + Free Agency (rows 12–14) follow one page at a time ("Go with your
   recommendation"). — only row 4 and the Teams menu changed; rows 12–14 keep their pages and
   page titles ("Teammate Stat Shift", "Contracts & Payroll") until their own passes.
2. [x] `/teams` follows Databallr's NBA Team Stats: centred icon title and "Six Factor Analysis ·
   <season>" subtitle; a console card (season, phase, 3P Luck, time window, Overall / Offense /
   Defense, Table / Cards, Per 100 / Totals); one table in the approved Stats look with Rk (top
   three badged), Team (season logo + code), ORTG, DRTG, Net, then Offense (OFF, oTS, oTOV, ORB),
   Defense (DEF, dTS, dTOV, DRB) and Net (NetEff, NetPoss) groups, signed values coloured by sign
   with the league rank under each. The leaders chart, stat tiles, inline notes and per-row
   buttons go. — `components/teams-six-factor-view.tsx` + `.css` over the new
   `GET /api/workbench/teams/six-factors`. Databallr's bundle (`teamStatsCalculations`) splits
   play-by-play first- and second-chance points, which the admitted team box scores lack, so
   CourtLens uses an exact box-score identity: with Poss = FGA + 0.44 FTA − OREB + TOV,
   rating = 200 × TS% × (1 − TOV/poss + OREB/poss), and the midpoint split of the gap to league
   gives TS, TOV and REB points per 100 with no residual (OFF + DEF = Net; NetEff + NetPoss = Net;
   `courtlens.domain.team_six_factors`, `courtlens-team-six-factors-v1`). Live 2025-26: OKC ORTG
   117.0, DRTG 105.7, Net +11.3, oTS +3.5 / oTOV +2.1 / ORB −2.1 (Databallr +2.5 / +1.8 / −1.5),
   identity residual ≤ 3e-14. Gold above league, blue below (identity tokens); column labels keep
   Databallr's casing. Offense / Defense views add the underlying rates (TS%, TOV/100, ORB%/DRB%,
   FTr, 3PA/100, 3P%); Totals turns each term into points over the span. Cards show each team's
   six factors as diverging bars on one league-wide scale. Old explorer, its table, and the
   `.teams-page` leftovers in `pages.css` were removed. Era names and logos follow the season
   (2000-01 lists 29 teams with the SuperSonics).
3. [x] The team profile reuses the Stats table filtered to the team (owner: "Your
   recommendation"), under a logo + full era name header, with the team's six-factor ranks, game
   log and similar teams as sections below. — `StatsWorkspace` takes `team` (the season's stored
   id as the table's team scope, never written to the URL) and the profile's header in place of
   the Stats title. Header: season logo + era name via `PageHeader`, "2025-26 Regular Season ·
   64–18 · Net +11.3 (#1)", Compare Team / All Teams. Sections in `player-glass`: Six Factors
   (Offense / Defense rows: rating, total, TS, TOV, REB and rates, each with #rank), Game Log (10
   most recent, earlier games under a disclosure; unknown scores stay "—") and Similar Teams.
   `player-ref-grid` moved unchanged to the shared `components/ref-grid.css`, as the plan asks.
   The old tabs, paired bars, eight tiles, participation cohort and rest splits were removed.
   `/teams/1610612760?season=2000-01` reads "Seattle SuperSonics" with the Sonics roster.
4. [x] Time windows and 3P Luck: "Use your best judgement here." — both built. Windows (Full
   Season, Last 60 Days, Last 30 Days, Last 2 Weeks) end at the scope's last game, so a finished
   season reads its final stretch; league average is recomputed over the same games. 3P Luck is a
   menu per end (own / opponent 3P%: Actual, 50% to League, League 3P%), regressing makes at fixed
   attempts, 2.7 points each (Databallr's 3 × 0.9). It moves ratings and shooting terms only and
   nets to zero across the league (−1.3e-10 live).
5. [x] Teams menu: rename items to Databallr's and add an icon and one-line description per item
   (touches the approved app shell, row 0): "Sounds good. Use your best judgement and optimal
   design here." — Teams, Roster Shapes, Stat Line Shift, Contracts, each with a Lucide icon
   (building, shapes, chart-column, dollar) in a 36px tile and a one-line description; the
   active and hovered tile takes the accent. `NavItem` gains optional `icon` / `description`, so
   only the Teams menu changes; the phone drawer shows the icon beside each label. Free Agency
   stays inside Contracts (`/free-agency` redirects there) until row 14. Other menus can adopt
   the rich rows if you want them everywhere.

Verification (2026-10-18): measured on production 3180 with live data — value-to-label centre
offset ≤ 0.5px, group labels within 0.6px of their columns' centre, column-label bottoms 0px
apart, six-factor values ≤ 0.5px, no page overflow and no browser errors at 1440 and 390
(`verification.jsonl`). Python 2,142 passed (new unit + integration six-factor tests); ruff, mypy clean. Dashboard lint,
typecheck, Vitest 584/584 (the 4 header animation rejections predate this work); Playwright 485
passed, `presentation-defaults.spec.ts:58` flaky (passes 3/3 on rerun); the four
`team-stats` / `team-profile` baselines refreshed, no approved page's baseline changed.
Data-blocked: none. Databallr's play-by-play first/second-chance split is replaced by the exact
box-score split above, so values differ slightly from Databallr's.
Evidence: `docs/evidence/alignment/teams/` (`before/` holds the survey).

Follow-up instructions (owner, 2026-10-18; "Looks good. We can use databallr as a baseline and
iterate further"):
6. [x] "The team logos look pretty small next to the team text. I think we either slightly make the
   rows taller so that we can fit a larger logo or we can just enlarge the logos as they are in
   place." — enlarged in place: 20 → 28px in the table (rows already 52px desktop / 49px phone,
   unchanged; logo centred within 0.5px of the row), 36 → 44px on cards.
7. [x] "Having a split by conference into the Western and Eastern conference might be good. Use the
   canonical east/west logos in the sliding selector for this if we add it." — League / East /
   West segmented selector (`conf=east|west`) with the NBA's 2018 Eastern and Western Conference
   wordmarks (Wikimedia Commons; `scripts/team_branding_assets.py --acquire-conferences` records
   source URL, source SHA-1 check, SHA-256 and derivation in `team-branding.json` `conferences`;
   trimmed, 96px tall). They keep their colours on a small light plate (the blue mark disappeared
   on the dark control). A conference ranks its own teams (Rk, #ranks); values stay relative to
   the league average, and the note says so. Conferences follow the season's identity
   (`/api/workbench/teams/six-factors` now returns `conference` / `division`; the 2000-01 West
   has 14 teams). The console is now Databallr's two rows: scope (season, phase, conference,
   window, 3P Luck), then view modes and Data details. On phones "Last" drops from the window
   labels so all four fit the Filters sheet.
8. [ ] "I have some more conference specific things if you think that could be useful." (awaiting
   the owner's list)
9. [x] "Is there anything else that databallr doesn't have that we could add that you think would
   be beneficial and optimal?" — recommended in chat (2026-10-18): schedule-adjusted net rating
   (SRS-style), expected wins and luck (point-margin record vs actual, close-game record),
   conference standings columns (seed, games back, last 10, streak), a rolling 10-game net-rating
   trend on cards and the profile, and a home/away six-factor split. Owner (2026-10-19): "You can
   implement all of these. I like all the ideas."
   - [x] a. Schedule-adjusted net rating — SOS and AdjNet columns. Every team's strength is solved
     jointly as its net rating plus its opponents' average strength (Basketball-Reference's SRS on
     net rating per 100), pinned to a game-weighted league mean of zero; SOS is the average solved
     strength of the opponents faced, so AdjNet = Net + SOS exactly. Live 2025-26: OKC +11.3 /
     −0.1 / +11.2; DET's −0.6 is the softest schedule.
   - [x] b. Expected wins and luck — xW = games × PF¹⁴ / (PF¹⁴ + PA¹⁴), Luck = W − xW, Close =
     record in games decided by five points or fewer (OKC 65.5 / −1.5 / 9–7).
   - [x] c. Standings — Seed (win percentage among the teams shown, ties by net; the NBA's
     tiebreakers are not modelled, and the tooltip and Data details say so), W–L, GB, L10, Strk.
     They cover every game in scope whatever the window or venue; the conference selector seeds
     within the conference.
   - [x] d. Trend — ten-game net rating after each game (from the tenth), as a sparkline on every
     card and a full chart section on the profile, gold above the league-average rule, blue below.
   - [x] e. Home/away — an All Games / Home / Away selector (`venue=home|away`) on the second
     console row; a venue's teams read against the league average over every game. The profile
     gains a Home and Away section (All, Home, Away rows over ratings and six factors, each
     #ranked among teams at that venue).
   All of it in a new Standings view (Standings: Seed, W–L, GB, L10, Strk; Schedule: Net, SOS,
   AdjNet; Expected: xW, Luck, Close) and on the profile (header "64–18 · 1st in the West · Net
   +11.3 (#1)"; Standing, Six Factors, Home and Away, Net Rating Trend, Game Log, Similar Teams).
   Backend: `courtlens.domain.team_context` (`courtlens-team-context-v1`), returned by
   `/api/workbench/teams/six-factors` with the new `venue` parameter.

Follow-up instructions (owner, 2026-10-19):
10. [x] "Make the team logos a little larger" — 28 → 32px in the table (rows unchanged at 52px
    desktop / 49px phone, logo centred within 0.5px), 44 → 48px on cards.
11. [ ] (screenshot of the League / East / West selector with East selected) "the highlight around
    the easter/western conference buttons is a little weird. It doesn't look natural" — the white
    plate is gone. Each wordmark is drawn as a mask in the segment's text colour (22px tall), so it
    behaves like the "League" label: secondary at rest, gold inside the selected highlight. The
    league's wordmark shapes are kept; their blue and red are not, since the blue mark disappears
    on the dark control.
    Also fixed: the six-factor column labels were uppercased again by the Stats sort-button rule
    ("OTS"); Databallr's casing (oTS, dTOV, NetEff) is back.

Verification (2026-10-19): production 3180 with live data — no overflow and no browser errors on
the table, Standings (league and West), Home, cards and profile at 1440 and 390; logos 32px, 0.5px
off the row centre; conference marks 22px; values within 0.51px of their label centres
(`follow-up-2/verification.jsonl`). Python 2,148 passed (new `tests/unit/test_team_context.py`;
the endpoint test covers the venue split and AdjNet = Net + SOS); ruff and mypy clean. Dashboard
lint and typecheck clean; Vitest 585/585 (the 4 known header rejections). Playwright: Teams 7/7
(new Standings/venue test), visual baselines 92/92, workbench and pc12 specs pass; only the
`team-stats` phone baseline changed (refreshed).
Evidence: `docs/evidence/alignment/teams/follow-up-2/`.

Follow-up instruction (owner, 2026-10-19):
12. [x] "can you make the eastern/western conference selector a little bigger. It seems like when
    the selector is east/west, it's still a little too small to fit." — the Teams console moves
    from the 32px to the 36px control size (every control in both rows, so they stay level), and
    the segment items grow from 24 to 28px. The 22px wordmark now has 3px of room above and below
    inside the selected highlight (was 1px) and 12px at each side. Phones keep their 48px touch
    size (9px of room). No overflow at 1440 or 390; Teams specs and visual baselines pass, and only
    the `team-stats` desktop baseline changed (refreshed). Evidence:
    `docs/evidence/alignment/teams/follow-up-3/`.

### 15 Team Compare — ✅ aligned (first revision)

Owner approval (2026-10-18): "I think it's finished," then approved the closing review: rename the
prototype code and check edge states before moving to Player Matchups. The `team-comparison`
Playwright baselines in `dashboard/e2e/visual-baselines.spec.ts` are the approved screenshots.

Owner queue override (2026-10-17): Team Comparison, Player Matchups, then Teams; prototype approved
for integration into `databallr-alignment` on 2026-10-17.

Instructions (owner, 2026-10-17):
1. [x] Build a Databallr-style Team Comparison card using the existing shell, typography, colors and
   controls, referencing Player Comparison and Databallr. — single centered 920px card
   (`dashboard/app/team-compare/team-comparison-prototype.tsx` + `.css`) with paired player
   rotations (`Rotations`) and team statistics (`Team Stats`), Regular Season / Playoffs toggle,
   per-team season selectors, and swap button.
2. [x] Team-colored gradients/accents on both team sides; larger logos borrowing Player Comparison's
   identity treatment; remove team-picker edge highlights; taller Databallr-like rows; shade the
   higher-value side of each pair; distinguish starters and bench. — 176×176 (112×112 on phone)
   team-tinted logo panels with in-place franchise picker triggers (`TeamGrid edgeHighlights={false}`),
   64px rotation rows, and team-toned leading cells.
3. [x] Use reliable observed starter evidence rather than model-weighted estimates ("Josh Minott in
   Estimated Starters is not a credible starter selection; investigate reliable start evidence and
   Databallr's method"). — Databallr optimizes model values plus position fit (`docs/research/courtlens-observed-starters.md`).
   CourtLens uses a release-bound read-only snapshot of actual most-used five-man starting units
   from admitted raw NBA box-score `position` fields (`starter-evidence.bf09e1d964030a116b25996df57e53b051f5f45500e0343781a9d7784bc3d563.json`),
   grouping `By Position` into **Most-used Starting Five** and **Bench & Alternate Starters** with
   verified start counts (`GS`) and coverage disclosure.
4. [x] Give each player metric value larger text aligned to its team's outer row edge inside the
   shaded area, borrowing Player Comparison's heavier/lighter numeric hierarchy; then step the
   number font size down one token step ("The number font size is a little too large"). — outer-edge
   rating values sit at `20px` (`--text-xl`) on desktop and `16px` (`--text-lg`) on phones, `600`
   weight on the leading side and `400` on the trailing side.
5. [x] Add an "Edit Metrics" button to compare on applicable metrics similar to Player Comparison. —
   `Edit Metrics` button in the scope console opens a searchable drawer with a `Rotation Metrics` /
   `Team Stats` switch, grouped abbreviation + term checkboxes (20 rotation metrics, 25 team metrics),
   and Reset.
6. [x] Remove irrelevant info under the team comparison container ("through...", "copy link",
   "DARKO snapshots...") and remove the line divider above the team comparison container so there is
   clean padding between the comparison container and button console above. — removed footer
   provenance/notes below `.tc-draft-card` (provenance stays in `Data details`) and removed the
   bottom hairline on `.tc-draft-console .ui-filter-bar` in `foundation.css`.
7. [x] Show the in-season (and playoff) series record above `vs`, simplified to large win numbers
   with a hyphen center-aligned above `vs` and each team's series win number center-aligned between
   its logo container and the center hyphen. — `32px` desktop / `24px` phone win counts centered on
   each midpoint (`±0.01px` measured against the exact midpoint between `.tc-draft-team-art` and
   `.tc-draft-series-sep`).
8. [x] Remove the caption text under "Most-used Starting Five" (`Actual unit starts: ...`) and the
   redundant team year/logo headers above the rotation rows, keeping `{metric} / Role` (or `Rank`)
   above "Most-used Starting Five".
9. [x] Use full team names with the city included (`Oklahoma City Thunder`, `Boston Celtics`, etc.)
   instead of nickname-only headings. — centered single-line headings on desktop and balanced
   wrapping with aligned selector rows on phones.
10. [x] Add a docked `Game History` tray beneath the comparison card (like Player Comparison's
    `Trend lines` tray) to view how the season's games went between the two teams. — expandable tray
    docked under `.tc-draft-card` with head-to-head game scoreboard rows (`G1`, `G2`, … with date,
    venue, scores, and winning margin badge), a 6-pill game team totals strip (`FG`, `3P`, `FT`,
    `REB`, `AST`, `TOV`), and side-by-side compact player box-score tables (`Top 5` / `Full Box`)
    from `/api/live/historical`.

Follow-up instructions (owner, 2026-10-17):
11. [x] Fix free-throw comparison highlighting. — each side uses its own made/attempted totals;
    live OKC 13/17 (76%) vs BOS 19/20 (95%) highlights BOS.
12. [x] Preserve missing box-score totals as unknown instead of zero. — missing, blank or invalid
    fields produce "—" for that total; observed zero and 0/0 shooting remain explicit.
13. [x] Tighten mobile rotation rows without reducing name readability. — measured 84px rows
    instead of 116px at 390px; default matchup names fit without truncation.
14. [x] Select a game's box score directly from its scoreboard row. — full-width kit buttons
    replace the duplicate game selector; mouse and keyboard selection verified with live G2.
15. [x] Show FTR with useful precision and keep pace visually neutral. — FTR uses three decimal
    places (0.261 vs 0.207 in the live scope); pace has no leading-side emphasis.
16. [x] Include the year on game dates, which currently show only month and day. — full dates
    on scoreboard rows and cross-season recent-game tables.
17. [x] Center FG, 3P and FT labels between their paired values. — equal-width value columns
    initially centered paired tiles. Instruction 19 replaces those tiles with centered table columns.
18. [x] Explicitly identify which team each game total belongs to. — team-logo/abbreviation row
    headers and accessible team/stat/value cells. Instruction 19 removes repeated per-tile labels.
19. [x] Repair the jumbled Game History on the owner's dev server and restructure the information
    more efficiently. Replace repeated per-stat team badges with compact team totals tables,
    give selectable games their own row, and verify the actual 3100 view as well as production.
    — reproduced fresh markup with stale compiled CSS on 3100. Extracted the tray's styles into
    `team-game-history.css`, registered its import in `globals.css`, and replaced six tiles with
    shooting/counting tables. Games sit side by side on desktop and stack on phones. The rerunnable
    `dashboard/scripts/verify-team-compare-layout.mjs` checks served grid styles, column centering,
    overflow and game/depth selection against both 3100 and production 3180 at 1440/1024/390px.
    Measured zero column offset, no clipping or page overflow, and no browser exceptions on either.

Closing review (2026-10-18):
- [x] Prototype naming removed: `TeamComparison`, `TeamSide`, `team-comparison.tsx/.css`, and
  `tc-*` classes (root `.tc-page`). No class collisions; the visual baselines pass unchanged.
- [x] An unknown team id returns 404 from `/api/workbench/teams/{id}` (the existence check used a
  label helper that is never empty) and the card reads "Team unavailable" instead of a team named
  "999". Same team on both sides hides the series score; a team without playoff games shows
  0–0 · 0 GP; different seasons explain the missing head-to-head.
- [x] Historical franchises (owner, 2026-10-18: "add identities for these older teams … if you
  select thunder and go back enough years, then it changes to the sonics logo"). Before 2013-14 the
  release stores relocated or renamed teams under their own codes (SEA, NJN, VAN, CHH, NOH, NOK);
  the Bobcats (2004-05 → 2013-14) sit under Charlotte's id. `courtlens.domain.teams.TEAM_ERAS`
  names each era with its franchise, seasons and conference/division (split at the 2004-05
  realignment); `team_identity(id, season)` serves era names from the team list, detail, schedule
  opponents, peers and four-factors, and `resolve_team_label` names era codes everywhere. Ingestion,
  finance and assistant lookups keep `get_team_info` (current franchises only). Team Compare keeps the
  picked franchise and reads the season's stored id (`seasonTeamId`), so Thunder + 2000-01 is the
  Seattle SuperSonics, 44–38, with Sonics artwork and green; `teamA=SEA` links resolve to the
  franchise. The picker shows each franchise as it was that season and disables New Orleans before
  2002-03 and Charlotte in 2002-04 (`FRANCHISE_GAPS`). Era artwork: Wikipedia SVGs (Sonics,
  Vancouver) and Basketball-Reference era PNGs (Nets, Hornets ×3, Bobcats; 125 px, so slightly soft
  at the 144 px panel) with edge-connected white cleared; `scripts/team_branding_assets.py
  --acquire-eras` records source URL, source hash, derivation and asset hash. Every stored team id
  in all 26 seasons matches the table. Older seasons show 0 verified starts (no raw starter
  positions), so they order by rank.
- [x] Mid-season scope (owner: "use your best judgement"). DARKO is its forecast at a phase's last
  game date, so when either side's DARKO is unavailable the DARKO/ODPM/DDPM options are disabled
  with the reason and the card falls back to the first available metric (PPG by default); "By
  Position" is disabled without verified starting fives on both sides; the coverage line says both.
- [x] Removed the unused `components/team-compare-view.tsx`/`.css` and the `fo11-team-*` rules only it used.
- [x] Season logos (owner, 2026-10-18: use each team's logo from that year, as Player Comparison
  uses that year's photos, and show it behind a player in that season — "kevin durant in his sonics
  seasons has the sonics background"). NBA.com publishes current logos only (its CDN's `primary` and
  `global` paths; year paths 403, old stats.nba.com paths 404), so `scripts/team_branding_assets.py
  --acquire-season-logos` reads every franchise-season 2000-01 → 2025-26 from Basketball-Reference's
  logo CDN (BKN→BRK, CHA→CHO, PHX→PHO) and groups identical seasons into 100 spans in
  `team-branding.json` `season_logos`: 30 match today's logo and keep NBA.com's SVG, 7 match an era
  SVG or era asset, 63 are distinct older logos stored once as background-cleared PNGs (about 0.98 MB
  of artwork in all). `teamArtwork(team, season)` (`lib/team-era.ts`) gives the season's name, code
  and logo from any franchise id, current code or era code; `TeamLogo season`, Player Comparison's
  `teamRecord` (tile watermark, tint, team names; duel, grid and both share exports), Team Compare,
  its picker and Player Matchups use it. Durant 2007-08 shows the Sonics behind him with "Seattle
  SuperSonics"; LeBron 2007-08 the 2003-10 Cavaliers logo; the 2000-01 Raptors the original logo.
  Not applied to the approved player page's career table (row 2); that waits for the owner.
  Evidence: `docs/evidence/alignment/team-logos/` (all 63 older logos, PvP, Team Compare, picker).
  Full Playwright 490 passed with no baseline changes (planner sign-in flaky, passes on rerun);
  Vitest 578/578.

Evidence: `docs/evidence/alignment/team-compare/eras/` (Sonics 2000-01, `teamA=SEA` link,
Bobcats vs New Orleans/Oklahoma City Hornets with Game History, mid-season, 2000-01 picker;
`verification.jsonl`). Python 2,134 passed; Vitest 572/572 (the 4 header animation rejections
predate this work); full Playwright 489 passed, 2 flaky (planner sign-in, methodology catalog) that
pass on rerun; team-comparison phone baseline refreshed for the disabled By Position.

Evidence: [docs/evidence/alignment/team-compare/README.md](evidence/alignment/team-compare/README.md)


### 16 Matchup Matrix — ✅ aligned (first revision)

Owner approval (2026-10-18): "I think we are ready for review and finished the compare pages,"
then, after the polish was pushed (`dd3fb45`), "you can set it now." The `pc11-player-matchups`
Playwright baselines in `dashboard/e2e/visual-baselines.spec.ts` are the approved screenshots.

Owner start (2026-10-18): "Let's do that and begin on the next page" (queue override: Player
Matchups after Team Comparison).

Starting state (survey, 2026-10-18): `/matchups` renders `components/season-matchups-view.tsx`, the
pre-alignment research layout: three stat tiles, a top-15 partial-possession bar chart and a table
repeating the same 15 rows. Data is `mart_stats_season_matchups` (season aggregates per pairing:
games, matchup minutes, partial possessions, points, points/100, FGM/FGA/FG%, 3PM/3PA, assists,
turnovers) with one served scope, 2025-26 regular season; the 3P column is "—" on every default
row. Per-game matchups (`shufinskiy/nba_data` `matchups_*`, 2017-18 on) are admitted and verified
for 2023-24 → 2025-26 through IM01/IM05 but not served to this page.
Instructions (owner, 2026-10-18; approving the start-of-page proposal):
1. [x] Keep the same format as Player Comparison and Team Compare so the page reuses their UI
   components and logic: a centered card with a player identity header, an On offense ("Guarded
   by") / On defense ("Guarded") switch, and season/phase scope. — the PvP card (`pvp` root,
   `pvp-card`, `pvp-slot` photo on the team colour with logo watermark, `CompareEmptySlot` "Add a
   matchup", swap and Clear) widened to 1040px; console with Season/Phase, Guarded By / Guarding and
   Data details; `components/season-matchups-view.tsx` + `.css`, in the compare page shell.
2. [x] One sortable matchup table in the approved Stats table style, grouped Exposure / Scoring /
   Shooting / Playmaking; drop the bar chart and stat tiles that repeat it. — every opponent
   (`limit` up to 500; 393 for the default), Stats table classes as the career table uses them,
   pinned name column with portrait and team logo, GP MIN POSS | PTS PTS/100 | FG FG% 3P FT | AST TOV,
   local sort in the URL (`sort`, `dir`), default by partial possessions.
3. [x] An optional second player showing their direct matchup both ways (A guarding B and B guarding A).
   — `opponentId` on `/api/workbench/season-matchups` returns `pair` (each direction or null); a
   table row or the empty slot sets it; mirrored rows "X with the ball" with the higher PTS/100 and
   FG% in bold only when both directions were observed; an unobserved direction says so.
4. [x] Matchup PBP stays data-blocked (no free possession-level matchup feed). Game-by-game logs and
   more seasons need the admitted per-game matchups served first; separate data block.

Found while building: 3P was "—" on every row because the mart read `matchup_fg3m`/`matchup_fg3a`
while hoopR spells them `matchup_fg3_m`/`matchup_fg3_a`; the model accepts both (31,492/88,750 3P
league-wide, no row with 3PA > FGA). Rows and the pair now carry team codes, 3P%, FT and blocks.
Evidence: `docs/evidence/alignment/matchups/` (default and paired, 1440 and 390;
`verification.jsonl`, no page overflow or browser errors). `pc11-player-matchups` baselines refreshed.

Follow-up instructions (owner, 2026-10-18):
5. [x] Explain what a matchup means and make the page more explicit, clear and unambiguous ("can
   you explain what this matchup means? Can we be even more explicit/clear/unambiguous … I feel
   like it's a bit confusing"). — every number is the offensive player's, while that defender was
   their primary defender. The page now says whose. Pair columns read "Amen Thompson on offense /
   guarded by Luka Dončić" instead of "with the ball" (tracking assigns a defender off the ball
   too). The table subtitle reads "393 defenders · Amen Thompson's offense against each one"
   (Guarding: "each one's offense against …"; name column "Offensive player"). The slot bio
   adds "against all defenders" / "guarding all players". Column tooltips name the offensive
   player, and the note defines MIN and POSS. Pair rows now reuse the table's column specs.
6. [x] The numbers in the opponent table are not centered under their columns. — body cells lacked
   `stats-metric-cell`, so `.data-table td.num` right-aligned them. Measured value-to-label center
   offset ≤0.5px at 1440 and 390 in all three states (default, pair, guarding).
7. [x] Make the player name on offense/defense headings title case. — "Amen Thompson On Offense /
   Guarded By Luka Dončić", matching the page's Guarded By toggle.
8. [x] The Guarded By table should be searchable like any stats table. — the Stats table's header
   search (`stats-header-search`) replaces the Defender / Offensive player label in the
   column-label row. It filters locally, ignores case and accents ("doncic" finds Dončić), and
   clears with × or Escape. A new player or side starts it empty. The subtitle reads "5 of 393
   defenders", and no match says so in the table.
9. [x] Some Player Comparison player pictures/team logos are not centered in the
   foreground/background (Chris Bosh, 2019-20 "No Games"). "Is there something we can do about
   this, or should we leave it alone?" — two causes, both fixed. (a) Portraits: the server's face
   crop took the top opaque rows as the head, and 34 of the 8,092 cached NBA headshots (Bosh among
   them) carry a stray speck of a couple of opaque pixels in a corner, so the crop slid to an edge.
   `face_crop_box` now re-measures only when the found head is more than 5% off centre (CDN
   headshots sit within ~3%), dropping opaque blobs under 1% of the largest. Exactly those 34
   crops change, each now within 2% of centre; the other 8,058 are byte-identical
   (`PORTRAIT_CROP_VERSION` face-v2; derivatives rebuild lazily, stale face-v1 files in
   `data/cache/portraits/derived` can be deleted). This touches every avatar of those 34 players
   app-wide, approved pages included, and only fixes them. (b) Logos: logos are centred in their
   artwork, but three assets are not square (Rockets 151×200, Vancouver wide, Sonics). With
   `height: auto` the Rockets watermark centred at 64.5% of the tile instead of 46%. `.pvp-watermark`
   now has a square 115% box with `object-fit: contain`, so every logo's drawn centre is 46%;
   square logos are unchanged and no PvP baseline moved. The approved player page header
   (`.player-bio-watermark`) has the same geometry and was left for the owner.
   Evidence: `portraits/` (Bosh 2019-20 and 2012-13, Rockets tiles, before/after sheet of the 34,
   `recropped.jsonl`).
10. [x] "Chris Bosh is still showing weirdly off center. Are you sure the issue is solved?" — the
    server already served the new crop (head centre 0.495–0.497 at every size); browsers kept
    the old one because the URL was unchanged and the API sends `max-age=86400`. Portrait URLs
    now carry `&crop=face-v2` (`PORTRAIT_CROP_VERSION` in `lib/portrait-source.ts`, mirrored
    by the API constant of the same name, which documents bumping both). Verified on 3100: face
    centre at 0.494 of the tile.
11. [x] "Make sure that the raptors logo behind it is a little centered properly like the other
    logos. Make sure the older logos are centered." — Basketball-Reference's era logos are
    crops whose box is centred but whose artwork leans: the 2001-09 Raptors badge sat 7.3% left
    because the ball touches one edge and the tail the other. `scripts/measure-logo-centres.mjs`
    measures each older logo's alpha-weighted horizontal centre and writes the 20 shifts over
    3% to `lib/team-logo-centring.json` (Raptors 2001-15, Mavericks 2001-02, Wizards ×3, Pacers
    ×2, Cavaliers ×3, Bobcats/Hornets ×3, Nets, Warriors 2001, Blazers 2003, Magic 2001,
    Clippers 2011, Jazz 2023-25). `TeamWatermark` (`components/team-watermark.tsx`) replaces the three copies
    of the watermark `<img>` (PvP slot, grid, Matchups) and moves them by `--logo-shift`.
    Vertical offsets stay as drawn. Full Playwright 491/491 (item 12 extends this to current
    logos).
    Evidence: `portraits/logos-*.png`, `portraits/pvp-bosh-2025-dev3100.png`.
12. [x] "Yes, you should correct all logos/player photos where applicable" (answering whether to
    centre the six leaning current logos too). — the measuring script now covers every logo: 26
    shifts, adding the current Cavaliers, Heat, Magic, Suns, Raptors and Jazz marks. The approved
    player page header (`.player-bio-watermark`) now uses `TeamWatermark` and the same square
    `contain` box, so the Rockets centre and leaning logos shift there too. Applicable means a
    logo behind a player photo; logos shown on their own (Team Compare panels, inline team logos)
    keep their drawn placement. Player photos: every display derivative comes from the server
    crop fixed in item 9, so none remain off centre. Full Playwright 489 passed, 2 known flakes
    (planner league navigation, methodology catalog) pass on rerun; no baseline changed.
    Evidence: `portraits/logos-current-*.png`.
13. [x] Player Comparison bug: choosing a player's earliest seasons makes the accolade badges in the
    season dropdown disappear (Shai Gilgeous-Alexander 2018-19 shows none, though 2025-26 shows
    MVP/All-Star and 2024-25 MVP/Title/All-Star). "Comparison between players (past and present,
    retired and active) should be seamless and functional." — the menu dated every row to the
    comparison's cutoff, which moves to the end of the picked season, so a rookie year hid every
    later award; titles came from the cutoff-bound championship list too. Now each row marks its
    own season's honours as recorded in the release; only the compared season stays dated to the
    cutoff, as the card's accolades are (row 3, 75). The API's `championships` adds
    `all_seasons` (every title in the release) beside the cutoff's `seasons`; the PvP slot and
    grid pickers use it. Live on 3100: Shai 2018-19 marks 2025-26 MVP/All-Star, 2024-25
    MVP/Title/All-Star, 2023-24 and 2022-23 All-Star; Bosh 2003-04 and LeBron 2003-04 mark every
    later title, MVP and All-Star. Vitest 579 (new regression test), Python 2,135, Playwright
    489 + 2 flakes that pass on rerun. Evidence: `portraits/season-picker-*.png`.
14. [x] "You should figure out the weird text here. The text 'Example: Amen Thompson / Most
    matchup possessions in this scope' is spilling weirdly here." (Owner, 2026-10-18: "I think we
    are ready for review and finished the compare pages.") — the shared research-page `ExampleNote`
    is a left-aligned flex row, so inside the card's centred column it sat as stray text and
    wrapped unevenly on phones; "Example:" also read oddly once a pair was chosen. Matchups now
    shows one centred, muted line, only while the player is the rule's default (C3 disclosure
    kept): "Shown by default · Most matchup possessions in this scope". Measured live on 3100:
    centred on the slots (0px) on one line at 1440 and 390; absent with a chosen `playerId`.
    `pc11-player-matchups` baselines refreshed. Evidence: `default-note-*.png`,
    `chosen-player-*.png`.
15. [x] "In this matchup table, how can we filter/sort for results that give us who the player played
    the best against (destroyed) and worst against (who he got clamped by)." — sorting PTS/100
    alone ranks one-possession matchups first, so ranking needs a sample floor. Beside the table
    title: ranking presets (renamed in 16) and a possession
    floor (Any, 10+, 25+, 50+, 100+ POSS, URL `minPoss`). The presets only set `sort`/`dir`, so
    a header sort and a preset never disagree; any PTS/100 sort applies a 25-possession floor
    unless one is chosen, and the note says so. The subtitle counts what is shown ("53 of 351").
    Live, Luka Dončić: best against Kuzma 76.0, Collier 69.2; clamped by Amen Thompson 13.6,
    Cason Wallace 14.2 (25+); at 50+ Thompson, Herbert Jones 19.3, Banchero 20.5. Also checked:
    Guarded By and Guarding both read 351 for Luka (393 for Thompson) because matchups are nearly
    symmetric, not a bug (349 shared, 2 unique each way). Evidence: `rank-*.png`.
16. [x] "You don't need to necessarily use the terminology clamped by and most guarded. You can use
    more precise, accurate terminology." — the presets name the sort they apply, the same in both
    modes: Most POSS / Highest PTS/100 / Lowest PTS/100. Tooltips say what each means for the
    player ("Defenders Luka Dončić scored the fewest points per 100 possessions against";
    Guarding: "Players who scored the fewest points per 100 possessions against Luka Dončić").
    Superseded by 17.
17. [x] "You can use more understandable terminology. Instead of highest pts/100, lowest pts/100."
    — plain words per mode, the metric kept in each tooltip and the note: Guarded By reads Most
    matched / Scored best / Scored worst; Guarding reads Most matched / Defended best / Defended
    worst (best = opponents' lowest PTS/100). Live for Luka Dončić: scored worst vs Amen Thompson
    13.6; defended best vs Cason Wallace 4.8, Christian Braun 8.0 (25+ POSS). Fits at 390 with no
    overflow. Evidence: `rank-scored-worst-*.png`, `rank-defended-best-*.png`.
18. [x] "Can we use title case for the sort/filter console terms." — Most Matched / Scored Best /
    Scored Worst (Guarding: Defended Best / Defended Worst); the floor already reads "25+ POSS".
    Evidence: `console-*.png`.
19. [x] "Clear doesn't clear both sides, is that intentional, and better for now?" — intentional,
    kept. Unlike Player Comparison, the left player is the table's subject and can't be empty:
    without one the page falls back to the default (most matchup possessions), so clearing it
    would look like nothing happened. Clear removes only the matchup player; its tooltip now says
    so.
