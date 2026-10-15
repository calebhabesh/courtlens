# Databallr alignment catalog

Work queue for the [alignment handoff](databallr-alignment-plan.md). Pairings come from the
[Databallr route map](research/databallr-replica-findings.md); wrong pairings are corrected during
owner review.

Status: ⬜ not started · 🔧 in progress · 👀 ready for review · ✅ aligned (owner only)

## Overview

Rows are in working order.

| # | Databallr | CourtLens | Status | Notes |
|---|---|---|---|---|
| 0 | App shell (nav rows, search, page title block) | `app/layout.tsx` | 👀 | Plain blue backdrop restored; pattern idea parked; owner review pending |
| 1 | Stats | `/stats` | 👀 | Instructions through 83 done except deferred 43f/43g; owner review pending |
| 2 | Dashboard (player) | `/players/[id]` | 👀 | Contract table, career totals, Per 36 cleanup and section headings ready for owner review |
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

### 0 App shell — 👀 ready for review
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

### 2 Dashboard (player) — 👀 ready for review
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
