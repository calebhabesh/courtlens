# Databallr alignment catalog

Work queue for the [alignment handoff](databallr-alignment-plan.md). Pairings come from the
[Databallr route map](research/databallr-replica-findings.md); wrong pairings are corrected during
owner review.

Status: ⬜ not started · 🔧 in progress · 👀 ready for review · ✅ aligned (owner only) · ✂️ cut (owner only)

## Overview

Rows are in working order.

| # | Databallr | CourtLens | Status | Notes |
|---|---|---|---|---|
| 0 | App shell (nav rows, search, page title block) | `app/layout.tsx` | ✅ | Owner approved first revision 2026-10-15; pattern idea parked |
| 1 | Stats | `/stats` | ✅ | Owner approved first revision 2026-10-15; cold-load animation follow-up approved 2026-10-25; deferred 43f/43g remain open |
| 2 | Dashboard (player) | `/players/[id]` | ✅ | Owner approved first revision 2026-10-15; Career-since label overlap fixed |
| 3 | PvP | `/compare` | ✅ | Owner approved 2026-10-21 (Compare menu tentatively done); Compare Export fixed (card export) |
| 4 | Teams | `/teams`, `/teams/[id]` | ✅ | Owner approved 2026-10-21 (Teams menu tentatively done); Six-factor table, Standings view (SOS, AdjNet, xW, standings), home/away, trend; team profile on the Stats table; Teams menu |
| 5 | WOWY | `/wowy` | 👀 | Top-level nav link after Stats; Select Team on arrival; Databallr's WOWY Combos lineup table (Combo / On / Off roles, every on/off mix with large lit / OFF photos, ON − OFF row, Overview / Offense / Defense) with date, game-clock, garbage-time, common-games, opponent and player-vs-player filters (`courtlens-wowy-combos-v1`) |
| 6 | Last X Games | `/last-games` | ✅ | Owner approved first revision 2026-10-20; Databallr's window card, comparison and game logs, then stretch verdicts, game context, opponent defence, Since windows, linked panels and a four-stat rolling chart; +/- from accepted stints |
| 7 | Live | `/live` | 👀 | Owner started 2026-10-27: Databallr's date strip, game cards and game view (Box Score / Play-by-Play / Pre-Game, All Games rail, hotkeys) plus X's game summary (line score, shot chart, team stats, leaders, game info) |
| 8 | Playoffs | `/playoffs` | ⬜ | |
| 9 | Showcase | `/showcase` | ✅ | Owner approved first revision 2026-10-21; Databallr's season card grid (DPM leaders), player dialog and season slideshow; NBA.com-first photos with matted career photos, top-100 rank changes with tooltips, slideshow keys, compare tray |
| 10 | Rankings | ~~`/rankings`~~ | ✂️ cut | Owner cut 2026-10-20: built for social sharing, not CourtLens's data/ML/statistics focus. Page and Players menu item removed |
| 11 | Tier List | ~~`/tierlist`~~ | ✂️ cut | Owner cut 2026-10-20: "It doesn't serve any purpose." Page, Compare menu item and example boards removed |
| 12 | Roster Shapes | `/roster-shapes` | ✅ | Owner approved first revision 2026-10-19; Databallr side-by-side team view with linked hover, season-by-season fill, rotation-capped minutes, searchable trade sandbox |
| 13 | Stat Line Shift | `/stat-line-shift` | 👀 | Top-level link after WOWY (follow-up 18, review); first revision approved 2026-10-19; opens on Select Team, full-width roster drawer with season photos, per-75 without → with table, pair cards, Customize Stats dialog; IM03 stints + stint box (shared-floor v2) |
| 14 | Contracts + Free Agency | `/contracts`, `/free-agency` | ✅ | Owner approved 2026-10-21 (Teams menu tentatively done); Select Team flow, Overview (payroll, cap bar, full flow, bar timeline, roster Stats table, pies), Small vs Big on DARKO values; Free Agency restored from NBA.com's tracker |
| 15 | Team Compare | `/team-compare` | ✅ | Owner approved first revision 2026-10-18; historical franchises, mid-season scope and old view removal done |
| 16 | Matchup Matrix | `/matchups` | ✅ aligned (first revision) | Player Comparison card, every opponent in a Stats table, direct matchup both ways; 3P fixed |
| 17 | Shot Profile Twin | `/similar-players` | ✅ | Owner approved first revision 2026-10-21 (Player Twins); NBA only; Databallr's twin cards and closest-matches table on pbpstats zone totals, then Box Score mode, pool filters, distance drivers; table headers centered over their values |
| 22 | Player Dashboard | `/players` | ✅ | Owner approved first revision 2026-10-25; Databallr's `/dashboard` (Top 50 DARKO DPM card carousel, compact player panels, head-to-head panel). Row 2's "Dashboard" pairing was wrong: row 2 is our player page, kept as approved. Replaces the Player Directory table |
| 18 | Six Factor RAPM | `/research` | ⬜ | |
| 19 | Wingspan | `/wingspan` | ⬜ | |
| 20 | Offensive Calculator | `/calculator` | ⬜ | |
| 21 | Learning / Patch Notes | `/methodology`, `/whats-new` | ⬜ | |

**CourtLens-only (one sweep at the end, no checkbox):** `/forecasts`, `/evaluation`,
`/investigations`, `/data-status`, `/settings`, `/planner`, `/design`.

**Databallr-only, not replicated:** Rankings and Tier List (owner cuts, 2026-10-20), Home game, WNBA, zTS, ShotQuality, D-ShotQuality,
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
19. [x] "make sure that navigating between the different pages, there are back buttons and logical
    navigation paths when moving between pages. … If we press on a roster and see their roster
    shape, there should be a back button to go back to the main page. We are kind of already doing
    this … on the player pages … 'Back to table'." (2026-10-19) — one shared `BackButton`
    (`components/ui/back-button.tsx`) in the player page's style: a gold xs button, left chevron,
    "Back to …" and an Esc hint, on its own row above the page header. A per-tab trail
    (`lib/nav-trail.ts`, session storage) records each page — a path plus identity parameters
    (Roster Shapes' `team`), filter changes update the entry and returning pops it — so Back goes
    to the page this one was opened from, named by that page ("Back to Charlotte Hornets Roster
    Shape", "Back to Nikola Jokić") or by the nav; opened directly, it goes to the logical parent.
    On: the Roster Shapes team view (→ Roster Shapes, keeping season, mode and sort), player pages
    (Stats keeps its own "Back to table" with scroll restore; otherwise → Player Directory), team
    profiles (→ Teams, replacing "All Teams"), team contracts and source books (→ Contracts,
    replacing "All teams" / "Contracts & Payroll"), playoff series (→ Playoffs), a Live game
    (→ its slate), saved investigations (→ Saved Investigations) and the Stats glossary (→ Stats).
    Esc only goes back when no field is focused and no dialog, menu or listbox was open when the key
    went down (checked in the capture phase, so closing a drawer never also leaves the page — the
    Stats "Back to table" uses the same guard now).
20. [x] "Can you scan the entire site an make sure drop down buttons/selectors/etc. are using title
    case. I don't like seeing 'projected' lowercase, it looks sloppy." (2026-10-19) — a Playwright
    scan of every route's controls (buttons, select options, segmented and radio options, menu
    triggers, disclosure summaries) found ~100 distinct sentence-case labels; all are Title Case now
    ("2026-27 · Projected", "Regular Season", "Playoff-Adjusted", "Best Fit", "All Teams",
    "Data Details", "Season-to-Date", "Last 10 Appearances", "NBA Cup Final", "Play-In", …),
    including server-made labels (Roster Shapes and projected-context season labels, tracking
    views and columns, feed phase labels), finance amount kinds (a label map instead of the raw
    code) and `humanLabel`'s fallback for unmapped codes. Small words stay lower ("Copy to My
    Boards"), units and abbreviations unchanged ("Under 6 ft", "dREB"), parenthetical notes stay
    as notes. Out of scope: prose (Ask example questions, glossary definitions, percentile notes),
    data-details row labels, table-of-contents entries and count chips ("21 players"). The rescan
    leaves only "Over/Under N ft".
    Verification: owner's :3100 and :8000 with live data — trail paths grid → team view → player →
    Back → Esc, and direct entries to eight pages (evidence, both scans and captures in
    `docs/evidence/alignment/app-shell/navigation/`). Dashboard lint, typecheck, Vitest 596/596;
    Playwright full suite passes after label updates in 18 specs, 14 screenshot baselines refreshed
    (pages that gained a Back row or a relabelled control).
21. [x] "There is one thing about the bottom highlight bar for the nav bar items. It seems like it's not
    balanced on the arrow side (the highlight stretches out farther on that side). It's probably
    correct logically, however, optically it doesn't look right." (2026-10-19, screenshot of Teams)
    — The bar was inset 12px from both button edges: on the left that is the text, on the right the
    chevron's 16px box, whose glyph ends ~3.3px inside it. On menu items with a chevron the bar now
    ends 4px further in, at the arrow's ink; Stats (no chevron) is unchanged.

Follow-up instructions (owner, 2026-10-20, opening the Players pages; Databallr Players menu as
reference). Owner answers: Tier List moves to Compare as on Databallr; Similar Players keeps its
method under a new honest name (a shot-profile-only rebuild waits for row 17); Last X Games is the
first Players page.
22. [x] Players menu like Databallr's. — rich rows (icon + one-line description) in Databallr's
    order: Last X Games (chart-line), Showcase (crown), Player Twins (fingerprint), Player Directory
    (layout-dashboard; Databallr's "Dashboard" slot, kept as Player Directory because it opens the
    directory), Rankings (list-ordered). Tier List (rows) is the fourth Compare item. Page titles
    follow the menu labels so Back buttons and tabs match: Recent Games → Last X Games, Player
    Showcase → Showcase, Similar Players → Player Twins, Ranking Boards → Rankings, Tier Lists →
    Tier List. Not changed: link labels inside the approved player page's tools row and the
    Research landing cards still use the old names (ask before touching row 2).
    Verification: production sandbox 3180 with the live API through a read-only proxy; the menus
    list 5 and 4 rich rows with icons and the drawer lists the same; lint, typecheck, Vitest
    603/603; 117/118 affected Playwright specs pass. The failure is the Free Agency first-load
    baseline, which went stale with row 14's table change and is unrelated to the menu.
    Evidence: docs/evidence/alignment/app-shell/players-menu/.
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

### 1 Stats — ✅ aligned (first revision; deferred 43f/43g remain open)

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

Owner approval (2026-10-25): "Yes, you can approve/check of row 1" — the cold-load animation
follow-up is approved and row 1 is ✅ aligned again. Deferred 43f and 43g remain open.

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

### 3 PvP — ✅ aligned (first revision)

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

### 4 Teams — ✅ aligned (first revision; instruction 8 still awaits the owner's conference list)

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

### 12 Roster Shapes — ✅ aligned (first revision)

Owner approval (2026-10-19): "I think we are good for now, and finished with the roster shapes
page. We can mark it done." Approved at `b74be3c`. The `first-load-roster-shapes` Playwright
baselines (league and `?team=DEN`, desktop and phone) in `dashboard/e2e/visual-baselines.spec.ts`
are the approved screenshots.

Owner start (2026-10-19): "Let's begin the revamp for Roster Shapes (alignment catalog row 12,
`/roster-shapes`), the next page under the Teams menu", with Databallr Roster Shapes references
(2D grid; "the 3D view isn't necessary"). "Remember we replicate, then improve/iterate on what
databallr has done."

Starting state (survey, 2026-10-19): `/roster-shapes` (`components/roster-shapes-view.tsx`, PC10
contract `docs/design/roster-shapes-v1.md`) is a plain title, four stat tiles (fullest roster,
most returning value, players drawn, unknown), a legend panel, a Fullest / Best fit / A–Z
segmented control and 30 dark cards, each a dark circle of packed circles with no names: area =
BPR value over replacement, colour = derived archetype, stroke dash = returning / new arrival /
no sample, white space = gap to the fullest roster. `/roster-shapes/[team]` adds a large circle,
four tiles, an old `data-table` roster and a Depth chart tab. Databallr: icon title, explainer and
@taylormetrics credit, season (2026-27 projected and past seasons), All teams, Regular season /
Playoff-adjusted, a gold "Projected" note, one-line legend (Size, Outline, Colour, White), "30
rosters. The box is a +17.4 team.", Fullest / Best fit / A–Z, and white square boxes with
team-colour borders holding packed shapes (size = (DPM + 2.0)^2.2 × minutes per game; squarer =
plugs in anywhere, spikier = hardest to fit; names on large shapes), each headed by rank, team
and fill %. Evidence: `docs/evidence/alignment/roster-shapes/before/` (league and SAS at 1440:
2,131 / 2,343px tall; 390: 5,230 / 3,142px; no overflow).

Instructions (owner, 2026-10-19; answering the start-of-page proposal: centred icon title with
explainer and credit, console FilterBar, Projected note, one-line legend, summary line + sort,
grid of white square team-bordered boxes headed rank · logo + name · fill %, shapes packed with
names and tooltips; stat tiles and legend panel removed; our six archetypes keep the colours):
1. [x] Size: "DARKO DPM (Recommended)" — Databallr's (DPM + 2.0)^2.2 × minutes per game, as a share
   of a box that is a +17.4 team (240 minutes at +3.48 DPM), so fills read like Databallr's. DPM is
   DARKO's 2025-26 end-of-regular-season snapshot. Projected minutes are 2025-26 minutes ÷ 82,
   scaled to 240 a game where a roster adds up to more. Live: OKC 58%, DEN 58%, TOR 48%, SAS 47% …
   SAC 1% (Databallr 68 / 65 / — / 71 … 2%; it uses 2026-27 depth-chart minutes we don't have).
   Contract: `docs/design/roster-shapes-v2.md` (`courtlens-roster-shapes-v2`, v1 superseded).
2. [x] Shape: "Fit estimate (Recommended)" — ease of fit = mean league percentile of DPM, DDPM,
   three-point rate and 1 − usage, in eight equal bands drawn squircle → circle → octagon → hexagon
   → pentagon → diamond → four-point star → burst; labelled an estimate on the page, in the key and
   in Data details. Continuity moved to the table's Status column and the tooltip. Shapes are packed
   on their real outlines (rasterised), so spiky shapes nest and every drawn area equals its size:
   no roster in either season or mode needs shrinking. Sparse rosters sit on an even grid, largest
   in the centre, like Databallr's emptier boxes.
3. [x] Extras: "Use best judgement here, whatever you think is best." — all four built: Season
   (2026-27 · projected and 2025-26 actual; earlier seasons are not offered because archetypes start
   in 2023-24 and the sealed records are mostly 2025-26, so older boxes would use later data);
   Team select (All teams / one team); Regular season / Playoff-adjusted (each player moved by his
   games-weighted DARKO playoff ODPM change, shrunk by 10 games, a labelled proxy; cards show the
   fill change); Fullest / Best fit (size-weighted ease) / A–Z on the summary line.
4. [x] Team page: "Fold into team select (Recommended)" — `/roster-shapes?team=SAS` shows the
   560px box and a Roster section (player-glass, `player-ref-grid`: Profile — Style, Status;
   Impact — DPM, ODPM, DDPM, PO shift in Playoff-adjusted; Shape — MPG, Box %, Fit). Old
   `/roster-shapes/SAS` redirects there; `?view=depth` opens `/teams/[id]`, whose new Depth Chart
   section is the FO05 allocation view (its own scope bar is hidden when embedded; the profile owns
   the scope). The profile canonicalises its URL on load, so the `#depth-chart` hash is dropped.
   Page: centred icon title with Databallr's explainer (wraps; foundation override), credit line,
   console (Season, Team, phase, Data details), gold Projected note, one-line key, summary + sort,
   4 / 2 / 1 boxes per row at ≥1024 / ≥600 / phone, white boxes with team-colour borders headed
   rank · season logo · name · fill %, names on shapes ≥ 240px boxes, tooltips on every shape. The
   stat tiles, legend panel and old dark circles are gone (`ShapeGlyph`/`ShapePack` stay for /design).

Verification (2026-10-19): production 3180 with live data through the read-only proxy — no
overflow and no browser errors on 7 views × 1440 / 390; every shape inside its box; boxes square;
fill % flush with the box edge (0px); roster table values ≤ 0.5px from their label centres, group
labels ≤ 0.01px from their columns, label bottoms 0px apart (`verification.jsonl`). Python 2,155
passed (rewritten `tests/unit/test_roster_shapes.py`); ruff and mypy clean. Dashboard lint and
typecheck clean; Vitest 589/589 (packer, shapes and sorts tested; the 4 known header rejections).
Playwright: full suite 490 passed, 28 skipped, 0 flaky, on the mock sandbox; rewritten
`roster-shapes.spec.ts` (fixture `e2e/fixtures/roster-shapes-v2.json`, the real v2 responses); the
six Roster Shapes / depth chart baselines refreshed, no other baseline changed.
Data-blocked: Databallr's 2026-27 depth-chart minutes and its fit model; replaced by 2025-26 minutes
and the published fit estimate above.
Evidence: `docs/evidence/alignment/roster-shapes/` (`before/` holds the survey).

Committed `c38378a` (owner: "You can commit and push it now").

Follow-up instructions (owner, 2026-10-19; "I like all your ideas to take it past databallr, you
can implement every one"):
5. [x] (screenshot of the key) "can you make the size/colour legend a little larger so that it can
   be seen." — 12 → 14px text (13px on phones), swatches 10 → 14px, shape icons 14 → 18px, wider
   gaps.
6. [x] What's missing: under each box, the archetypes the roster lacks and what the white space adds
   up to. — "Lacks Stretch big · Rim runner" (styles under 2% of the box) under every box; team view
   adds the white as one starter ("White is a +6.8 DPM starter at 34 minutes").
7. [x] Trade sandbox: in team view, add or remove players and redraw the box live. — Trade Sandbox
   section (Add a player / Remove a player selects, undo chips, Reset; `add` / `drop` in the URL),
   added shapes outlined, header "Fill 37% to 60% (+23.4)"; minutes rescale to 240 when over.
8. [x] Change since last season: per team, 2025-26 vs 2026-27 with arrivals outlined and departures
   shown. — "Since 2025-26" section in projected team view: both boxes side by side (departures
   dashed and faded, arrivals outlined), fill change, and both lists with box shares.
9. [x] Fill vs actual results: a scatter of box fill against 2025-26 net rating. — "Fill vs Results"
   on the league view: 30 teams, least-squares line, r = 0.87 live, with the note that DPM learned
   from the same games (description, not prediction).
10. [x] Better projections: DARKO's own current projections and a free depth-chart source, to close
    the gap with Databallr at the top. — DARKO has not published 2026-27 projections yet (its newest
    season on 2026-10-19 is 2025-26, ratings through 2026-06-03). Its dated board carries each
    player's latest DPM and `x_minutes` (expected minutes per game), which serve as the depth-chart
    minutes: `courtlens refresh-darko-current` seals it as a `current` entry (bundle `01e072c3…`,
    547 players, all with minutes; config updated). The projection now uses those, scaled to 240
    per roster. Live: OKC 63% (Databallr 68), DEN 58% (65), SAS 54% (71), NYK 43% (52), BOS 37% —
    Tatum is drawn at DARKO's 21.0 expected minutes instead of his injury-shortened season. Real
    2026-27 projections remain data-blocked until DARKO publishes them; rerun the command then.
11. [x] Share card: export a team's box as an image, like the PvP card. — "Share Image" in team
    view: a 560 × 680 card (name, fill, box, what's missing, colour key) through the PvP card's
    exporter, `courtlens-roster-shape-<team>-<season>.png`.
    Also: sparse boxes now lay out in even rows (largest mid-row), as Databallr's emptier boxes do,
    instead of the packer's stretched diagonal.

Verification (2026-10-19, follow-ups): production 3180 with live data — no overflow, no browser
errors and no shape outside its box on league, 2025-26, SAS, BOS sandbox (+Jokić −Tatum) and DEN
Playoff-adjusted at 1440 and 390; roster table alignment unchanged (≤ 0.5px, 0.01px, 0px)
(`follow-up-1/verification.jsonl`). Python: new DARKO and roster-shape unit tests (current refresh,
expected minutes); ruff and mypy clean. Dashboard lint and typecheck clean; Vitest 593/593.
Playwright: full suite 484 passed, 28 skipped; `fo13-pages:93`, `:112` and `live:79` failed in the
full run and passed 3/3 on rerun; the four Roster Shapes first-load baselines refreshed, no other
baseline changed. Evidence: `docs/evidence/alignment/roster-shapes/follow-up-1/`.

Committed `9325528` (owner: "Yes you can commit and push").

Follow-up instructions (owner, 2026-10-19; screenshot of the first four boxes):
12. [x] "make the team logos larger." — 24 → 32px on cards, 32 → 44px in team view, centred on
    the header row (0px off).
13. [x] "Can you make the "Lacks" caption under the shapes look more aesthetic, I feel like we can
    make them look better, kind of hard to see/read." — an uppercase LACKS label, then one pill per
    missing style tinted with that archetype's colour (14% fill, 40% border, colour dot), 12px
    semibold in the text colour (13px in team view, centred); "Every style drawn" as a gold pill
    with a check. The team view's white-space line is its own 14px line with the DPM in bold.
    Verification: production 3180 with live data, no overflow or browser errors at 1440 / 390, no
    chip past its card (`follow-up-2/verification.jsonl`); lint, typecheck, Vitest 593/593;
    Playwright 490 passed (`saved-operations:29` failed once, 3/3 on rerun); the four Roster Shapes
    baselines refreshed, no other baseline changed.

Follow-up instructions (owner, 2026-10-19; Databallr's San Antonio team view and its 3D hover card):
14. [x] "databallr has a nicer side by side view for the roster shapes." (team view: logo + name
    title, the box beside a panel of fill and value, "What fills the box" bars with a top-five tick,
    a compact player table and "Not drawn"; "Season by season" fill bars under the box) — the team
    view is now Databallr's: season logo + team name as the title, the 808px box beside a 400px
    panel (stacked below 1024px). Panel: "54% of the box filled, 3 of 30. 14 players in the box,
    worth 17.5 per 100 above replacement" (Σ (DPM + 2) × minutes ÷ 48) and, in place of Databallr's
    first-unit fit (its own model), our box-weighted ease of fit with its rank; the lacks chips and
    white line; "What fills the box" (share by style, tick = average of the five fullest rosters);
    a compact table (shape icon, Player, MPG, DPM, Fit, Box) and "Not drawn" with reasons. Under the
    box, "Season by season": the franchise's actual fill every season 2000-01 → 2025-26 plus the
    dashed projection, current season gold, a dashed full-box line when a season passes 100% (the
    2002-03 and 2006-07 Spurs reach 111–112%). New `GET /api/workbench/roster-shapes/history`
    (end-of-season DARKO DPM × minutes per team game, era ids folded into franchises; 1.6s cold,
    cached). The Trade Sandbox, Since 2025-26 and Roster sections follow.
15. [x] "I think we should also have hover states for each of the player shapes in the roster shape
    diagram showing key metrics, and a small photo, kind of like databallr has for their 3d viewer
    (we are doing 2d though)." — every shape, in the grid and the team view, shows a card on hover:
    headshot, name, "DPM +6.2 · 27.0 mpg · 27.4% of box", then style and fit (and "added" /
    "departed" in the sandbox and season boxes). The shape gets a dark outline. In team view each
    shape also takes keyboard focus and shows the same card. The card sits beside the pointer away
    from the nearer edge, or above/below it when that would leave a phone-width box, always inside.
    Verification: production 3180 with live data — side by side at 1440 (panel top level with the
    box), stacked at 390; box square; 27 season bars (26 for 2025-26); hover card with photo inside
    the viewport at 1440 and 390; no overflow or browser errors (`follow-up-3/verification.jsonl`,
    hover captures `*-hover-*.png`). Python: history unit test, ruff and mypy clean. Dashboard lint,
    typecheck, Vitest 593/593; Playwright full suite 490 passed (new hover and side-by-side tests),
    the two team-view baselines refreshed, no other baseline changed.

Follow-up instructions (owner, 2026-10-19; Databallr's San Antonio view beside ours, and its hover):
16. [x] "We are still not emulating the side by side roster shape diagram and stats on the left and
    right respectively. Databallr seems to do this in a more space efficient manner." — the owner's
    :3100 dev server had been serving a stale `roster-shapes-view.css` (no team-view rules at all),
    so the team view rendered stacked at every width; cleared by removing and re-adding the import.
    The layout now uses Databallr's proportions: box and panel at 2.2 : 1 (831px box beside a 378px
    panel at 1440; Databallr 820 / 375), side by side from 900px (701 / 319 at 1100, 540 / 280 at
    900), stacked below. The panel is shorter than the box column (893 vs 986px at 1440): the Lacks
    block folds into "What fills the box" as a "Lacks" tag on each style under 2%, the white-space
    line moves above "Not drawn", and table rows tighten to 4px × 8px padding.
17. [x] "When I said I wanted hover state for the diagrams. I meant when you click on a diagram …
    and it opens the dedicated team page, you can hover your cursor over the shapes and get a
    highlight on the table on the right and around the shape like databallr does (or even a hover
    info container on the player, with their picture). What we are currently doing … with hover
    states in the Roster Shapes page … is not intended." — the grid and Since-last-season boxes
    lose the hover card and outline (back to the native tooltip). In team view, hovering or
    focusing a shape outlines it, fades the others to 32% and highlights its table row, and shows
    the photo card; hovering a table row highlights its shape (no card).
    Verification: owner's :3100 with live data — side by side at 1440 / 1100 / 900, stacked at 390,
    no overflow or browser errors; shape hover → 1 active row + card; row hover → 1 active shape, no
    card; grid hover → no card, no highlight (`follow-up-4/verification.jsonl`, captures
    `team-sas-*.png`). Dashboard lint, typecheck, Vitest 593/593 (the 4 unhandled
    `header.test.tsx` animation aborts also occur on HEAD); Playwright full suite 492 passed,
    28 skipped; only the DEN team-view desktop baseline refreshed.

Committed `3618daa` (owner: "Commit and push").

Follow-up instructions (owner, 2026-10-19; header screenshot at 2000px):
18. [x] "go with the rotation cap" (projected minutes) — a roster over 240 minutes a game is capped
    by rotation: in order of minutes each player keeps his own until the team reaches 240, the
    next gets what is left, the rest none (was: everyone scaled down in proportion). The payload
    adds `minutes_uncapped` and the trade sandbox re-applies the same cap from it. San Antonio:
    54% → 67% (Databallr 71%), Wembanyama 27.0 → 35.1 mpg (DARKO's own); DARKO's San Antonio
    minutes add up to about 314, so Harper gets the last 10.4 and six bench players 0. League top:
    DEN 82, OKC 73, SAS 67. Unit test for the cap (Python and the sandbox in Vitest).
19. [x] "can we make the buttons/menu/text on the nav bar larger, it seems like they are a little
    small" — header 56 → 64px; menu labels 13 → 16px with 16px chevrons and wider padding; wordmark
    16 → 20px with a 28px mark; search pill 32 → 36px with 14px text; Ask and `⋯` sm → md (36px).
    Ask's label stays 13px: the control kit sets 13px for every button size. Fits at 1280 (nav ends
    756px, pill 772–1126, actions from 1142), no overflow at 1280 / 1440 / 2000.
20. [x] "The hover states in the per team diagrams are working. Can you make it slightly smoother.
    It seems like it's not triggering on the bounds of the shapes, and is a little abrupt when
    moving from shape to shape." — leaving a shape or row clears the highlight only after 140ms,
    and entering another cancels that, so crossing the white between shapes never flashes the box
    back to full colour (0 drops over 30 samples crossing a gap); shapes fade over 200ms, rows over
    140ms, and the card fades in and glides between positions. Each shape's hit area extends
    about 8px past its edge (a transparent 2-unit stroke; Chromium does not hit-test `stroke:
    none`), measured hits at 2–8px past the right edge.
    Verification: owner's :3100 with live data (`follow-up-5/verification.jsonl`, header captures).
    Python 2,159 passed, ruff and mypy clean; dashboard lint, typecheck, Vitest 593/593; Playwright
    full suite 491 passed, 28 skipped, 102 screenshot baselines refreshed for the taller header;
    `fo13-pages:47` (planner sign-in, two Email fields) fails intermittently, also 3 of 8 runs on
    `3618daa`.

Committed `8a1bd98` and `28273d8` (owner: "Commit and push").

Follow-up instructions (owner, 2026-10-19; screenshot of the Trade Sandbox):
21. [x] "The trade sandbox is less than optimal. Adding a player should be searchable instead of a
    simply just a drop down filter." — both sandbox pickers are search fields (the shared
    `LookupInput` over the page's own rosters, no request): "Add a player" searches every other
    roster by name (accents ignored) or team name/code, each result with headshot, team logo and
    "DEN · +7.4 DPM · 38.3 min" (uncapped minutes); before typing it lists the 12 biggest shapes
    in the league. "Remove a player" searches this roster, biggest first. Picking adds the same
    URL `add=` / `drop=` ids and chips as before. `LookupInput` gained an optional
    `metadata.caption` for local candidate lists. Verification: owner's :3100 with live data at
    1440 / 390 (search "jokic" → `add=203999`, fill 67% → 117%), no overflow or browser errors
    (`follow-up-6/`). Lint, typecheck, Vitest 593/593; Playwright full suite 491 passed, 28
    skipped, no baseline changed; `saved-operations:52` (methodology rendered twice) failed once in
    the full run, then the Roster Shapes spec and it passed 108/108 across three repeat runs.

Follow-up after approval (owner, 2026-10-19; screenshot of the 2025-26 grid):
22. [x] "can we have hover/selection highlights for the roster shape diagrams (not for each of the
    players, just for simply hovering over a diagram). They don't feel responsive/interactive in
    this way." — each grid card responds as one target on hover and keyboard focus: the box lifts
    4px with a 4px glow in the team's colour and `--shadow-3`, the team name takes the accent, the
    other cards recede to 80% opacity, and a press settles the box to 1px (all on motion tokens,
    so reduced motion collapses them). Measured on :3100 at 1440 / 390: hovered box translateY
    −4px, others 0.8; focus gives the same lift; no overflow (`follow-up-7/`). Lint clean;
    Roster Shapes and visual-baseline specs 103 passed, no baseline changed.
23. [x] "make the number next to the team name and logo larger/more prominent. It's kind of hard to
    see." — the rank is 16px bold in the full text colour (was 12px tertiary), right-aligned in 2ch
    so 1–30 line up; 20px on a large card. Measured on :3100 at 1440 / 390: no card header clipped,
    no overflow. Lint clean; Roster Shapes and visual-baseline specs 103 passed, the four
    first-load baselines within tolerance (none rewritten).

### 13 Stat Line Shift — 👀 owner review (follow-up 18; first revision was ✅)

Owner approval (2026-10-19): "Alright, I think we can mark this page finished." Approved after
follow-up 17 (uncommitted at approval). The `stat-shift` and `first-load-stat-shift` Playwright
baselines (desktop and phone) in `dashboard/e2e/visual-baselines.spec.ts` are the approved
screenshots. Site-wide rule set during this page: player photos match the season under analysis
(Design Language, Identity; alignment plan, Photos).

Owner start (2026-10-19): "Let's begin the revamp for Stat Line Shift (alignment catalog row 13,
`/stat-line-shift`), the next page under the Teams menu", with four Databallr references (empty
state with a team roster tray, the Select Team modal, one selected player's table and the
two-player cards). "Remember we replicate, then improve/iterate on what Databallr has done."
Analytical contracts stay: only the focal player's stints, the predicate against its logical
complement, all 2^n presence/absence cells, unknown is never zero. Back navigation and Title Case
labels follow Design Language.

Starting state (survey, 2026-10-19): `/stat-line-shift` (`components/team-stat-shift-view.tsx`,
contract `docs/design/shared-floor-v1.md`) is titled "Teammate Stat Shift" with WOWY and Export CSV
buttons; a console (Season, Phase, Through, Change Team, From, Possessions, Games, Data Details); an
example-subject card (HOU, Amen Thompson · Kevin Durant, box-score points/rebounds/assists bars);
Focal / Together / Apart player pickers; then "Observed Stat Shift": a coverage line, a 17-row
metric table (Selected raw, Complement raw, Eligible difference, 95% interval) in per-100 units,
the exposure table, two disclosures and Pin / Reopen buttons. Live it reads
"source_blocked · 0 / 82 finalized games": `workbench_lineup_stints` is empty in the owner's
database. IM03's 202,063 accepted stints (2023-24 to 2025-26, regular season and playoffs) were
only ever loaded into a disposable proof database; the six sealed bundles remain in
`data/derived/impact-event-gate/bundles`. The operation also reads stints only from the release's
own dataset ("no arbitrary-dataset substitution under a release label"), so loading the bundles
alone would not unblock it.
Databallr: centred icon title and explainer ("Analyze how individual player stats change when
playing with or without specific teammates"); Season, team, Reg Season and gold Customize Stats
controls; a Select Team modal (6 × 5 logo grid); a bottom roster tray of headshots ("Change Team"
first, a gold ring on picked players, collapsible). One player picked: "Per 75 stats without and
with <player>", one row per teammate (minutes without → with) and USG, PTS, AST, REB, TOV, TS%,
FTA, 3P%, +/- each as without → with and the difference, gold up and blue down; a Without / With /
Difference breadcrumb and sortable columns. Two players: "View full table for" both, and two cards,
each "With <other> / Without <other>" with minutes and the nine stats, a gold or blue pill on the
side that is higher. Evidence: `docs/evidence/alignment/stat-line-shift/before/` (1440: 2,083px;
390: 2,999px; no overflow, no browser errors).

Instructions (owner, 2026-10-19; answering the start-of-page proposal):
1. [x] Data: "Load IM03 stints (Recommended)" — append the six sealed IM03 bundles (2023-24 to
   2025-26, regular season and playoffs) to the owner database as new datasets, and revise the
   contract (shared-floor v2) so stat-shift reads the sealed stint dataset for the season and
   phase. Additive; no published snapshot changes. Seasons before 2023-24 stay data-blocked.
   — Six datasets admitted (all `ready`, code and contract hashes matched first; no pointer
   moved). [Shared-floor v2](design/shared-floor-v2.md) (`courtlens-shared-floor-v2`, v1 frozen)
   reads the sealed dataset for the season and phase, joined by game id to the release's
   finalized schedule, so IM02's excluded games read as partial coverage. It also accepts the
   82,142 zero-duration IM03 instants under policy v2 (v1's rule dropped every game). New
   read-only `POST /api/workbench/operations/stat-shift-roster` (inside the demo's
   `operations/*` allowance): one stint read, every teammate's stat shift, the roster and the
   scopes with stints. A dropped team-id canonicalisation (caught by `test_b21_api`) was restored.
2. [x] Layout: "Replicate + improve (Rec.)" — centred icon title and explainer; console with
   Season, team (logo Select Team modal), phase and gold Customize Stats (picks columns);
   collapsible bottom roster tray. One pick: per-75 teammate table (without → with, difference
   in gold or blue). Two picks: Databallr's two cards. Improvements: a 95% interval and gate
   marker on each difference, a sample-size cue, and the 2^n cells in a disclosure. Example card,
   old pickers and the per-100 dump removed.
   — Centred chart-column title with Databallr's explainer (wraps); console: Season (scopes with
   stints), team button (logo + tricode) opening "Select Team · 30 NBA teams" (shared
   TeamGrid), phase, gold Customize Stats (15 columns in a popover, nine by default, `stats=` in
   the URL) and Data Details (coverage, gates, stint dataset, method, CSV and evidence JSON).
   Empty state "Select one or two players to analyze their combined statistics". Sticky
   bottom tray: Change Team, then the roster by minutes, gold ring on picks (two at most; a
   third replaces the oldest), collapsible from a gold handle. One pick: "Per 75 stats without
   and with <player>" in the Stats table look (Profile · Counting · Scoring · Impact; the nine
   are ordered so each group is one run), each row "848 min w/o → 1,756 min with", each cell
   without → with over the change in gold (up) or blue (down); Difference / Stats w/o / Stats
   w/ views; names open that player's table; headers sort by the change (`sort=`), the lead
   header by minutes with. Two picks: "View full table for" both and Databallr's two cards
   (CourtLens · season, the player's face with the other's, With / Without with minutes, a
   pill on the higher side). Improvements: differences show only when both sides pass the
   gates (else "—" with the reason); a dot marks a 95% game-cluster interval that excludes
   zero (filled pill on the cards, outline otherwise); hovering shows the interval; rows under
   the gates fade with "small sample"; "Presence/Absence Cells" lists both cells per teammate
   (games, stints, minutes, possessions, gate). Removed: example card, Focal/Together/Apart
   pickers, per-100 dump, Pin/Reopen, `shared-floor-view.tsx` (no users left); the operation
   gallery entry is renamed Stat Line Shift.
3. [x] Metrics: "Standard formulas (Rec.)" — USG% = (FGA + 0.44 FTA + TOV) ÷ the same total for
   all five players on the floor; TS% and 3P% from summed makes and attempts; +/- = net rating ×
   0.75; counts per 75 = per 100 × 0.75; all from the focal player's stints, each with its own
   game-cluster interval.
   — `usage_pct`, `ts_pct`, `fg3_pct` and a combined `reb_per_100` (value and interval as the
   linear combination of its parts, like net rating); rates are gated by the cells, not by
   100 attempts. Live TOR 2025-26 with Scottie Barnes against Databallr: Quickley PTS 21.9 →
   18.1 (Databallr 21.9 → 18.1), AST 6.9 → 6.8 (6.8 → 6.8); Ingram USG 30.4 → 25.5 (30.5 →
   25.2), TS% 55.3 → 58.3 (54.4 → 58.6), minutes 848 / 1,756 (828 / 1,709).

Data finding (2026-10-19, while building 1): the sealed IM03 stints (loaded into the owner database
as six new `courtlens-impact` datasets) carry per-player **points only**; shots, free throws,
rebounds and turnovers are stored per team per stint, and possession records keep raw-row locators
without the acting player. Every IM03 stint is `patched` under `possession-policy-v2`, which v1 of
the operation rejects (`valid` and v1 only). From the sealed data alone, minutes, PTS and +/- per 75
are available; USG, AST, REB, TOV, FTA, TS% and 3P% need a per-player stint box derived from the raw
play-by-play through those locators (IM05's `impact_extras.py` already reads the actors). Asked the
owner how to proceed.

Instructions (owner, 2026-10-19; answering the data finding):
4. [x] Player box: "Derive stint box (Rec.)" — attribute every raw play-by-play action (shooter,
   assister, rebounder, turnover, free throw, three-point attempt) to its stint through the sealed
   locators, reusing IM05's actor reads; verified by conservation (each player's stint totals equal
   his box score in every game); sealed as a hashed artifact and logged as an impact-metrics block;
   then the page shows all nine columns.
   — [Stint box v1](design/stint-box-v1.md) (`courtlens-stint-box-v1`): all 3,901 games in 202.5 s;
   the replay reproduces every sealed stint's player points; points and shooting known in every
   team-game, AST / OREB / DREB / TOV in ≥ 99.6% (the rest are box-score disagreements, unknown
   for that team and game). 30 MB of content-addressed artifacts, manifest pinned in settings.
   Logged as SB01 in the impact metrics progress log; evidence
   `docs/evidence/stint-box-v1/`.
5. [x] Acceptance: "Accept patched/v2 (Rec.)" — shared-floor v2 accepts IM02-repaired (`patched`)
   stints under `possession-policy-v2`, the same stints IM04's RAPM and on/off use; recorded in the
   contract and Data Details.
   — `valid` or `patched`, policy v1 or v2; recorded in shared-floor v2 and the Data Details
   method notes.

Verification (2026-10-19): owner's :3100 with live data (`verification.jsonl`): no overflow and no
browser errors in 6 views × 1440 / 390 (empty; TOR with Barnes, sorted by PTS; TOR pair; DEN
playoffs with Jokić; OKC 2023-24 with Gilgeous-Alexander); group labels ≤ 0.01px from their
columns, label bottoms 0px apart, every value ≤ 0.5px from its column centre with no cell
overflowing; pills inside their cards; Customize Stats opens above the tray. Python 2,166 passed
(new `test_stint_box.py` and rate/combined/unknown-usage tests in `test_on_off.py`); ruff, format
and mypy clean. Dashboard lint and typecheck clean; Vitest 598/598 (the 4 known `header.test.tsx`
aborts); the chip and lookup scope-race checks moved from e2e to Vitest (`entity-picker.test.tsx`,
`lookup-input.test.tsx`), and the catalog-scope and example-default e2e tests moved to the shot
profile page. Playwright on the mock sandbox (fixture `e2e/fixtures/stat-line-shift-v1.json`, real
TOR responses): full suite 487 passed, 28 skipped; `fo13-pages:112` failed (known planner flake,
1 of 3 alone); in the previous full run `live:79` and `table-interactions:63` failed and passed
alone (8/8, 3/3). Only the four Stat Line Shift baselines changed.
Data-blocked: seasons before 2023-24 (no accepted stints); Databallr's own minutes basis differs
slightly from IM03's reconstruction. Hosting: the demo's frozen snapshot does not yet carry the
six IM03 datasets or `data/derived/stint-box-v1/`; PC13 hosting is parked.
Evidence: `docs/evidence/alignment/stat-line-shift/` (`before/` holds the survey).

Follow-up instructions (owner, 2026-10-19; "Nice first pass", with Databallr's first-load team
picker, its empty page, its Customize Stats dialog and screenshots of ours):
6. [x] "You shouldn't choose the immediate default team to be Toronto. Databallr launches a team
   picker where you can choose the team first before actually beginning the stat line shift. You
   can also choose to not pick a team and press the X button and be sent to the Stat Line Shift
   page which is unfilled. Make this initial setup flow smooth."
   — No default team: `/stat-line-shift` opens on Databallr's "Select Team · 30 NBA teams"
   dialog. X leaves the page unfilled: the console's team button reads "Team", the page says
   "Select a team to begin" with a gold Select Team button (on phones the console sits in the
   Filters sheet), and no tray. Picking a team writes `team=<tricode>` and loads the roster; the
   tray's Change Team reopens the dialog. The roster operation now runs without a team (scopes
   only), so the season list is ready before a team is picked.
7. [x] "Make sure we are on the most recent valid season."
   — Without a `season`, the roster operation now uses the latest season with admitted stints for
   the phase (2025-26), not the release's default (it resolved 2023-24). Recorded in
   shared-floor v2.
8. [x] "Customize stats or edit metrics. Menu should be much cleaner instead of a drop down. Either
   be a sidebar or a pop-up menu like databallr" (grouped checkboxes; Defaults, Clear All, Cancel,
   Save Changes).
   — A dialog like Databallr's: General (PTS, AST, REB, TOV, USG, +/-), Shooting (TS%, 3P%, FTA,
   FGA, 3PA), Rebounding (OREB, DREB), Team on Court (ORTG, DRTG), two a row under ruled group
   labels; Defaults, Clear All, Cancel and Save Changes (disabled with nothing checked).
   Choices apply only on Save. Databallr's STL, BLK, rim/mid-range, shot-quality, frequency
   and ORB%/DRB% columns are not offered: the stint box has no steals, blocks or shot location.
9. [x] "Current player selector looks kind of weird. Can we make it a little bit more seamless and
   minimal/clean, I don't like the box around all the player, and the weird placement of the
   up/collapse arrow."
   — No frame: the tray has no border, shadow, radius or panel fill; the page fades into it. One
   header line: team logo and name, "Pick one or two players" / "1 of 2 picked", then Change
   Team and a small chevron to collapse, both at the right. The Change Team tile is gone;
   picks keep a gold ring.
10. [x] "I don't like this team picker where we have the edge highlights on the teams. I think this
    is tacky and looks vibe coded. Can we remove this from all team pickers that have it including
    this one."
    — The team-colour bottom edge is gone from the shared `TeamGrid` everywhere (team profile
    depth chart, design showcase, Team Compare, this page); the `edgeHighlights` prop is removed.
    Selection is the accent outline. This page uses its new `compact` variant: Databallr's five
    a row of logo and code, no filter. The Stats team dialog never had edges.
11. [x] "can you bold "without" here too" (the table heading "Per 75 stats without and with …").
    — "Per 75 stats **without** and **with Scottie Barnes**".

Verification (follow-ups 6–11): owner's :3100 with live data (`follow-up-1/verification.jsonl`,
captures 1–5 at 1440 / 390): picker open on load, 0 of 30 tiles with an edge, X leaves an unfilled
2025-26 page, TOR loads 20 players, tray frame 0px / none, no overflow or browser errors. Python
shared-floor tests 32 passed, ruff and mypy clean; dashboard lint, typecheck, Vitest 598/598;
Playwright full suite 489 passed, 28 skipped (`fo13-pages:47` failed once, 3/3 alone); new
first-load and Customize Stats tests; only the four Stat Line Shift baselines changed.

Follow-up instructions (owner, 2026-10-19; Databallr's page with its roster drawer, and our empty page):
12. [x] "The player selection drawer should stretch the width of the bottom screen and be on the
    bottom half like data ballr"
    — Fixed across the foot of the screen, full width (0–1440 at 1440), 36% of the viewport
    (max 360px; 40% on phones), faces centred in the 1240px page width, a hairline on top, no
    other frame. It renders at `document.body` (the route's enter transform had anchored
    `fixed` to the page). The page keeps that much space below its content, so the last row
    clears the drawer; collapsed, the drawer is its 52px header line.
13. [x] "For some reason deselecting a team in the franchise select is not working. It still keeps
    it's players in the drawer"
    — Picking the selected team again now deselects it (no team, picks cleared, drawer gone,
    "Select a team to begin"); the dialog also shows a Clear Team button whenever a team is set.
14. [x] "remove the large black container from around the select a team to begin, it doesn't look
    good."
    — Both prompts are plain text on the page (no panel fill); "Select a team to begin" keeps its
    gold Select Team button.

Verification (follow-ups 12–14): owner's :3100 with live data (`follow-up-2/verification.jsonl`,
captures 1–5 at 1440 / 390): drawer fixed to the screen's foot edge to edge, last content above
it when scrolled to the end, 52px collapsed; deselect by repicking TOR and Clear Team both return
to the unfilled page with no drawer; no overflow or browser errors. Dashboard lint, typecheck,
Vitest 598/598; Playwright full suite 491 passed, 28 skipped, no failures; new drawer/deselect
test; only the four Stat Line Shift baselines changed.

Follow-up instruction (owner, 2026-10-19; Databallr's roster drawer):
15. [x] "Can you size up the player portraits in the drawer much more. databallr does better with this."
    — Portraits 48 → 80px (the `lg` avatar), names 12 → 14px (12px on phones) so full names fit,
    136px columns (8 a row at 1440, 3 on phones), a wider gold ring on picks, drawer 36 → 40% of
    the screen (max 400px). Measured on :3100 with live data: 80px portraits, no overflow or
    browser errors at 1440 / 390 (`follow-up-3/`). Lint clean; Stat Line Shift, baseline,
    defaults and route specs 113 passed; only the four Stat Line Shift baselines refreshed.

Follow-up instruction (owner, 2026-10-19):
16. [x] "Can you make sure that the photos in the player drawer for the team correspond to the year
    for which we are analyzing stat line shift." — every headshot on the page (drawer, table
    heading and rows, both pair cards) now asks for that team-season's photo
    (`?season=…&team=…`, the season headshots from `courtlens acquire-season-portraits`), and the
    team badges use that season's logo. `PlayerAvatar` gained an optional `era` prop (no change
    where it is absent). Where the NBA CDN has no photo for that team-season the current one shows:
    measured on :3100, TOR 2023-24 serves 26 of 30 from 2023-24 (Ramsey, M. Williams, K. Simmons,
    Carton fall back; recorded CDN misses for two-way and short contracts), TOR 2025-26 19 of 20
    (Fultz falls back) (`follow-up-4/verification.jsonl`). Lint, typecheck, Vitest 598/598;
    Playwright full suite 489 passed, 28 skipped (`fo13-pages:93` and `:112`, the planner flake,
    6/6 alone); only the four Stat Line Shift baselines refreshed.

Follow-up instruction (owner, 2026-10-19; screenshot of the table header):
17. [x] "on the stats w/ and w/o tables we don't need the yellow text guide correct. That yellow text
    guide refers to the difference table." (the gold "Min w/o › Min w/ S. Barnes" header)
    — The "w/o → w/" guide now shows only on Difference. On "Stats w/o S. Barnes" the gold header
    reads "Min w/o S. Barnes", each row "848 min without" and the heading "Per 75 stats **without
    Scottie Barnes**"; on "Stats w/" the same with "with" (1,756 min with). The default sort there
    is by that side's minutes. Measured on :3100 at 1440 / 390, no overflow or browser errors
    (`follow-up-5/`); lint, typecheck, Vitest 598/598.

Follow-up instruction (owner, 2026-10-27; screenshots of the Databallr and CourtLens top bars):
18. [x] "I think stat line shift should be it's own page like it is on databallr" (Databallr's top
    bar: Home, Stats, WOWY, Stat Line Shift, Live, Players, Teams, Compare, Research).
    — Stat Line Shift is a top-level link after WOWY (`STAT_LINE_SHIFT_LINK` in
    `DIRECT_LINKS`, so the phone drawer lists it too) and is gone from the Teams menu (Teams, Roster
    Shapes, Contracts, Free Agency). It's highlighted on `/stat-line-shift`. Measured on :3100:
    top bar Stats | WOWY | Stat Line Shift | Live …, no phone overflow. Evidence:
    `docs/evidence/alignment/stat-line-shift/top-level-nav-1440.png`.

### 14 Contracts + Free Agency — ✅ aligned (first revision)

Owner start (2026-10-19): "Let's begin the revamp for Contracts + Free Agency (alignment catalog row
14, `/contracts`), the next page under the Teams menu", with Databallr references: the Teams menu
(Contracts, "NBA salary cap analysis and contract details"; Free Agency, "Self-updating 2026 NBA
free agency tracker"), the Contracts empty state, the Select Team dialog, Toronto's Overview, the
roster Stats table below it, the two pie charts and the Free Agency tracker ("free agency tracker is
simply a large table"). "Remember we replicate, then improve/iterate on what Databallr has done."
Finance and contract data follow the presentation-clarity plan and source policy v3 (free sources,
zero recurring cost). Photos follow the season rule (`era={{ season, team }}`); team pickers use
`TeamGrid variant="compact"`.

Starting state (survey, 2026-10-19): `/contracts` (`components/contracts-view.tsx`) is a league
board titled "Contracts & Payroll": four stat tiles, a known-payroll bar per team with threshold
lines, a limitations note and a 30-row team payroll table linking to `/contracts/<TEAM>`. The team
page has a Back to Contracts button, a TOR · Toronto Raptors native select and Data Details; a
full-width cap-utilization bar (cap, tax, aprons); the team identity and four tiles (known salary
$202.5M, 15 / 21 known, highest $50.3M, known minus cap +$37.6M); a Sankey (top five named, others
by position) with its flow table; two donuts (by position, high earners); a six-season contract
timeline grid with status words in every cell (Reported salary, Player option, Team option,
Unknown hatching, Not listed); and an 11-column roster table (salary, years listed, remaining
guaranteed, 2025-26 GP/MPG/PTS/REB/AST/RAPM). `/contracts/books` is the retained-books workspace.
`/free-agency` redirects to `/contracts` (removed in PC08, D3, for want of a free source). Data:
one admitted finance refresh (2026-27, observed 2026-10-12, 464 of 622 index players with a
reported Basketball-Reference salary; TOR 15 of 21, the six blanks are two-way/camp deals) and the
official 2026-27 thresholds; no other seasons. Evidence: `docs/evidence/alignment/contracts/before/`
(league 1440: 3,596px, 390: 3,976px; TOR 1440: 4,301px, 390: 6,702px; no overflow, no browser
errors).
Databallr: Contracts opens on a centred "$ Contracts · NBA Salary Cap Analysis" with Select Team,
a season chip (2022-23 to 2028-29) and Overview / Small vs Big tabs, then "Select a Team" with a
gold Choose Team button (the 6 × 5 Select Team dialog). Team view: logo title "Toronto Raptors
Contracts · 2026-27 Salary Cap Analysis"; a "Roster-aware salary data" banner; Total Payroll
($201.2M, Below 1st Apron by $7.8M, Below 2nd Apron by $20.5M); Cap Utilization (a focused-range
bar with Cap, Tax, 1st and 2nd Apron ticks); Payroll Flow (Total → Guards / Forwards / Centers →
every player, a full Sankey); Contract Timeline (abbreviated names, an info icon, DPM, one gold bar
per season shaded by salary, FA marker after the last year; legend Guaranteed, Player option, Team
option, Total DPM, Free agent); the team's roster in the Stats table; "People Wanted Pie Charts So
Here's Some Pie Charts": a two-ring payroll pie (positions inside, players outside) with position
shares, and a High-Earners pie ($8M+, faces around it). Free Agency: "2026 NBA Offseason · Free
Agency Tracker", source freshness and NBA source link; Tracked / Unsigned / Signed-Returned / In
Review tiles and a Market Moved bar; status chips with counts (All, Unsigned, Signed, Returned,
Option, Two-way, Review), search, team select, All / UFA / RFA, refresh; one large table: player
(face, position, UFA/RFA, option), status pill, old team → new team or Open market, 2025-26
PTS/REB/AST, age and experience, terms, source note link.
Free source found (2026-10-19): NBA.com's free-agent tracker page
(`nba.com/players/free-agent-tracker/2026`) embeds all 238 players in its page data: position,
old and new team ids, PPG/RPG/APG, age, experience, UFA/RFA, player/team option and two-way flags,
availability (69 unsigned, 169 signed) and an article link; no deal terms. Databallr's
tracker reads this same source.

Instructions (owner, 2026-10-19; answering the start-of-page proposal):
1. [x] Layout (proposal, not objected): replicate Databallr's Contracts. Open on the Select Team
   dialog (X leaves an empty page with Choose Team); team view with Total Payroll, Cap
   Utilization, the full Payroll Flow, the bar Contract Timeline, the team's roster in the Stats
   table with season photos, and the two pies. The league board goes.
   — One route, `/contracts?team=TOR` (`components/contracts-view.tsx`, `contracts-view.css`):
   opens on "Select Team · 30 NBA teams" (shared `TeamGrid variant="compact"`; Clear Team, and
   repicking deselects); X leaves "$ Contracts · NBA Salary Cap Analysis", Select Team / season /
   Overview · Small vs Big and the "Select a Team" prompt with a gold Choose Team. Team view: logo
   title "<Team> Contracts · 2026-27 Salary Cap Analysis"; a Roster-aware salary data banner that
   names every blank salary; Total Payroll (known salary, each apron line's side and distance);
   Cap Utilization (Databallr's focused range, blue to the cap, gold beyond, tax and apron ticks);
   Payroll Flow (Total, then Guards / Forwards / Centers, then every known salary, coloured by
   group); Contract Timeline (short names, an info tooltip with every season, DARKO DPM, one bar a
   season shaded by salary with the amount, dashed gold player and dashed blue team options, FA
   after the last listed season); the roster in the Stats table (`StatsWorkspace` fixed to the
   team, its own 2025-26 scope; a frame that starts below the fold is now one screen tall,
   unchanged where the table starts on screen); Payroll Pies (two rings: positions inside,
   players outside, with position shares; High Earners at $8M+ with faces around the ring).
   `/contracts/<TEAM>` redirects to `?team=`; the league board, the old roster table and
   `contracts-payroll-board.tsx` are removed (`/contracts/books` stays under Data Details).
   Photos: the roster table follows the Stats table; the pies show current photos, since the
   page analyses the current (2026-27) roster.
2. [x] Free Agency: "Restore /free-agency (Rec.)": ingest NBA.com's tracker page as dated,
   content-addressed observations (operator run); Databallr's one large table, tiles, Market
   Moved bar, status chips, team and UFA/RFA filters and search; terms stay "—" (unknown); back
   under the Teams menu.
   — `courtlens refresh-free-agency` (scheduled fetch, 3 s, robots recorded) and
   `courtlens import-free-agency <file> --observed-at` (operator import) seal
   `courtlens-free-agency-v1` bundles (`ingestion/free_agency.py`, `services/free_agency.py`,
   pinned as `config.free_agency_manifest`); `GET /api/workbench/operations/free-agency`. Source
   policy v3 lists NBA.com's tracker. NBA.com answered CourtLens' identifying user agent with
   HTTP 403 (the run ended, no evasion); the installed bundle (`9af16a45…`) is the page fetched
   during the survey at 2026-10-19 17:09 UTC, sealed as an operator import: 238 players, 69
   unsigned, 71 signed, 98 returned (Databallr: 239 / 69 / 169). The owner can replace it with a
   browser-saved page. `/free-agency` (`components/free-agency-view.tsx`): "2026 NBA Offseason ·
   Free Agency Tracker", Source current / stale (7 days), Updated time, NBA source link and Data
   Details; Tracked / Unsigned / Signed / Returned tiles and Market Moved (71%); All, Unsigned,
   Signed, Returned, Option, Two-way chips with counts; search (player, team, source note), team
   select, All / UFA / RFA; one table (Player · Movement · 2025-26 · Profile · Deal): face, name,
   position, class and option or two-way; status pill; old logo to new logo or Open market;
   NBA.com PTS / REB / AST; age and experience; Terms "—"; the source note link or "NBA tracker".
   Sortable Name, Status, Stats (default) and Age. Databallr's "In Review" is not replicated: it
   is Databallr's manual override; a reported deal NBA.com has not recorded stays Unsigned with
   its note (Lonnie Walker IV). The Teams menu lists Free Agency again; the PC08 redirect is gone.
3. [x] Seasons: "2026-27 + future (Rec.)": later seasons from the same book's multi-year salary
   columns, labelled projected; threshold lines only for 2026-27 (no official later figures).
   — The season select offers 2026-27 and up to four later book seasons with a listed salary
   ("2027-28 · projected"); a later season keeps only players with a listed salary, the payroll
   card says "Projected from the 2026-27 book", and Cap Utilization says the league has no figures
   for it yet. The timeline starts at the chosen season.
4. [x] Apron copy: "Databallr wording, caveated (Rec.)": "Below 1st Apron · by $X" on known
   salaries, with a "known salaries only, N unknown" cue when any are missing; unknown is never $0.
   The finance contract's wording is updated.
   — "Below 1st Apron · Below by $6.5M" (TOR), "Above 1st Apron · Over by $12.1M" (DEN), then
   "Known salaries only: N blank on the source page, not counted as $0". The finance views'
   limitation and the replica analytics contract say this is arithmetic on known salaries.
5. [x] Small vs Big (owner's reference sent mid-build): DARKO's market value per player.
   — DARKO's board already carries `sal_market_fixed`; the parser keeps it and the `current`
   entry was re-sealed (`6f6f3a2b…`, same raw bytes, only the new field; Roster Shapes unchanged).
   The team contracts response adds `darko_value_dollars`, `darko_dpm` and the board's context.
   The tab: DARKO credit and "12 of 15 contracts have a DARKO value; value, surplus and ROI use
   those rows only"; a summary (season, salary, mapped value, surplus, ROI); Small and Big lists
   (salary and surplus, gold up, blue down, N/A without a value); Contract Threshold with a $1M to
   $40M slider (`split=`, default $12M); two cards with Salary Paid, Mapped Value, Mapped Surplus
   and a gold Mapped ROI (surplus over the mapped players' salary). TOR: small +214%, big +7%
   (Databallr +216%, +20%; its DARKO board is newer than the sealed Jun 3 one). Always the
   current season's salaries.

Verification (2026-10-19): production sandbox at 3180 behind a read-only proxy on 4180 to the
owner's API (`verification.jsonl`, 1440 / 390): Select Team, empty, TOR Overview, TOR Small vs Big,
DEN Overview, DEN 2027-28, Free Agency and its Signed filter; no page overflow and no browser errors
in any; Free Agency group labels 0px from their columns' centres and column-label text bottoms 0px
apart (the sort chevron hangs left of its label). The owner's :3100 needs a restart to drop the old
`/free-agency` redirect (next.config). Python 2,172 passed (new `test_free_agency.py`; the
source-policy doc test caught the missing registry row); ruff, format and mypy clean. Dashboard
lint and typecheck clean; Vitest 600/600 (the 4 known `header.test.tsx` aborts); new
`contracts.test.ts`. Playwright on the mock sandbox (fixtures `e2e/fixtures/contracts-v2.json`
and `free-agency-v1.json`, real DEN / TOR and tracker responses): full suite 495 passed, 28
skipped, 1 failed: `roster-shapes:194` (two `.roster-team` during the team profile's URL
canonicalisation); alone it passes 6/6 on this build and fails 5/6 on a clean HEAD build, so it is
a pre-existing flake. New `contracts.spec.ts` and `free-agency.spec.ts`; the PC12 Contracts test
and its two baselines are removed; the first-load Contracts baselines are replaced (Select Team,
DEN Small vs Big) and Free Agency's added.
Data-blocked: seasons before 2026-27 (no historical book); deal terms (not on NBA.com's tracker);
Databallr's manual "In Review" overrides.
Evidence: `docs/evidence/alignment/contracts/` (`before/` holds the survey).

Follow-up instructions (owner, 2026-10-19; "Nice first pass", with screenshots of the roster Stats
console, the pies and the season menu):
6. [x] "Yes you can run the photo sweep" (the optional sweep: pages that analyse a past season but
   still show current photos: Stats drawers, Playoffs series, Roster Shapes hover card, depth
   chart, Showcase, Rankings, Tier List, Last X Games, Defensive Matchups).
   — `seasonEra(season, team)` (`lib/portrait-source.ts`: the row's team, the last listed for a
   traded player; none for a multi-season scope) and an `era` prop on `PlayerIdentity` and
   `GroupGuide`. Now season photos: the Stats table rows, group-guide photos, preview rail and
   player drawer (also the team profile's and Contracts' roster tables); Playoffs series players;
   the Roster Shapes hover card for past seasons (the box's team-season; Since Last Season's left
   box uses the reference season; projected rosters keep current photos); the depth chart;
   Showcase (current player and roster); Rankings and Tier List boards (their reference season)
   and the shared example boards; Last X Games; Defensive Matchups. The Stats trend dialog spans
   seasons, so it keeps current photos. Measured on the 3180 sandbox against the owner's API
   (`follow-up-1/verification.jsonl`): every portrait on these pages asks for the season and the
   API served the season photo for all but 2 of 28 on the BOS 2023-24 depth chart (CDN misses).
7. [x] "There is a weirdly placed divider next to pg/sg/sf/pf/c" (the roster Stats console).
   — The filter bar's page-group divider separates it from scope controls on the same line; a
   team-fixed table has only the chips there, on their own line. Removed for Contracts' and the
   team profile's tables (`foundation.css`, which outranks the Stats sheet's own reset); Stats
   keeps its look. Measured 0px.
8. [x] "Padding under 'Roster Stats' seems tight compared to the other section headers."
   — 16px under it, the same gap as Payroll Pies (measured 16 / 16).
9. [x] "We can use more colors for the high earners pie, and for charts in general. It seems like
   the colors we are using are too similar. We can add variety in this regard."
   — Chart series tokens `--color-trend-1` … `-8` (the dataviz reference's eight dark slots;
   Stats trends already used 1-4), validated on the glass panel: adjacent CVD ΔE ≥ 8.4,
   normal-vision ≥ 19.3, all ≥ 3:1; slots 1-3 pass all-pairs. Recorded in Design Language.
   High Earners: one colour per player in salary order (a ninth and later fold into Other), each
   face ringed in its slice's colour. Positions (pies, flow, timeline key): blue, orange, aqua.
   The breakdown's outer ring alternates two steps of each group's hue. Other charts can adopt the
   tokens page by page.
10. [x] "Remember our macro rule for title case in all buttons/drop downs/etc." (the season menu's
    "2027-28 · projected").
    — "2027-28 · Projected"; on Free Agency "All Teams" and the "Two-Way" chip.

Verification (follow-ups 6–10): production sandbox at 3180 behind the read-only proxy
(`follow-up-1/`: the sweep pages, the roster console, the pies, TOR and Free Agency at 1440 / 390);
no overflow or browser errors. Dashboard lint and typecheck clean; Vitest 600/600; Playwright on
the mock sandbox: full suite 496 passed, 28 skipped, no failures; no baseline changed.

Follow-up instruction (owner, 2026-10-19; screenshot of Payroll Flow and Contract Timeline):
11. [x] "Is there any way for us to include the player photos in the payroll flow and contract
    timeline? Don't worry you can increase the width/size of the margins to accommodate this nicely."
    — Payroll Flow: a 30px photo between each player's node and name (HTML over the SVG, placed
    from the layout), the chart widened (640 units) and given 54 units a player with 38 between
    nodes, so the stacked small salaries no longer collide; on phones it keeps full scale and
    scrolls in its region. Contract Timeline: the photo before each short name, a wider name column
    and 8px between rows. Photos ask for the book's season (2026-27), falling back to current.
    Measured on :3100 with live data (`follow-up-2/`): 15 photos in each, 0 overlapping one
    another, 0 touching a name, no overflow or browser errors at 1440 / 390. Contracts, Free Agency
    and their first-load baselines: 39 passed on a fresh build.

Follow-up instructions (owner, 2026-10-19; screenshot of the two panels):
12. [x] "The payroll flow shouldn't be scrollable here. Just make it fit to the internal contents."
    — The photos are now drawn inside the SVG (clipped headshots, initials only if one fails), so
    the whole chart scales to its panel at every width; the scroll region and its 640px phone
    minimum are gone (the scrollbar was the HTML photos overhanging the chart's edges).
13. [x] "The contract timeline photos are cut off on the left for some weird reason."
    — The timeline's sideways-scroll box clipped the photos' 2px rings at its edge; it now has a
    4px inner inset (photos measure 4px inside it).
14. [x] "Should the photo rings be team colored like on player pages/etc.?"
    — Recommended and done: the player pages' team ring (70% team colour, team-tinted backing) on
    the flow and timeline photos, without the logo badge (the page is one team and the title
    carries its logo; the badge reset lives in `foundation.css`, which outranks page CSS). High
    Earners keeps its slice-coloured rings, which tie each face to its slice.
    Verified on :3100 with live data (`follow-up-3/`): flow inside its panel with nothing
    scrolling at 1440 / 390, 15 photos each, red (TOR) rings on both, no overflow or browser
    errors; Contracts, Free Agency and all visual baselines 103 passed on a fresh build.

Follow-up instructions (owner, 2026-10-19; Free Agency screenshot):
15. [x] "Why does D'Angelo Russell display as signed, when he is currently playing on the Shanghai
    Sharks. The Memphis Grizzlies waived him… What do you suggest?" Answered: NBA.com's tracker
    records each player's offseason move once and never revisits it (Russell's entry is the July
    trade to MEM). Against the NBA player index (Oct 12), 4 signed/returned players are on no NBA
    roster and 24 unsigned players are on one. Owner chose the recommended roster cross-check:
    keep NBA.com's status, show where the official roster index disagrees, a "Roster Changed"
    filter; no parsing of news reports.
    — The free-agency response checks every row against the latest NBA player index
    (`roster_check`: agrees, not_on_roster, other_team, on_roster; unknown when the index lacks
    the player) with the index's date. A disagreement shows under the move, in orange with an
    alert icon: "Not on an NBA roster" (Russell, Andre Jackson Jr., Hunter Dickinson) or "On NYK
    roster" (Bruce Brown and 23 other unsigned players); NBA.com's status stays as published. New
    Roster Changed tile and chip (27); Data Details names the index (observed Oct 11).
16. [x] "Even Westbrook, he has retired. So isn't even supposed to be there either."
    — Retired when NBA.com's own note says so (Westbrook, Lowry): out of the tracked counts, the
    Market Moved share and every chip but a new Retired one (2), where the pill reads Retired.
    Tracked 236, unsigned 68, signed 70, returned 98.
    Verified on the owner's :3100 with live data (`follow-up-4/`, 1440 / 390, all / Roster
    Changed / Retired): no overflow or browser errors. Python free-agency tests 8 passed (roster
    check both ways, unknown never agrees); ruff and mypy clean; Contracts, Free Agency and all
    visual baselines 103 passed on a fresh build (Free Agency's first-load baseline refreshed).
17. [x] "It says Bruce Brown is on the NYK… he was just waived a couple days ago (same as Agbaji).
    So how often/up to date are we keeping this?" Answered: only as fresh as the last manual
    index refresh (Oct 11); nothing was scheduled, and cdn.nba.com now answers CourtLens' user
    agent with 403, so the index can't be fetched on a schedule.
18. [x] "Can we not do periodic fetch to make sure this data is up to date at all times?" Owner
    approved ESPN team rosters every 6 hours, local only ("build it comprehensively").
    — New source `espn_team_rosters` (`site.api.espn.com`, 5 s, source policy v3):
    `courtlens refresh-espn-rosters` fetches the 30 team rosters, retains each response and seals
    a `courtlens-espn-rosters-v1` bundle only when all 30 succeed (a 403/429 ends the run; the page
    keeps the last good rosters). ESPN ids map to NBA ids by verified crosswalk, else a normalized
    name unique in the NBA player index (or unique on the same team); ambiguous or unmatched
    players are listed and never read as off a roster. The newest bundle in
    `data/derived/espn-rosters-v1/` is served (no config change per run); the roster check uses it
    when it is newer than the NBA player index. The API host serves robots.txt as an edge 403 to
    every client, so the fetcher's new `robots_optional_hosts` records it and continues.
    `scripts/install_roster_refresh.sh` (now `scripts/install_data_refresh.sh`) installed a systemd user
    timer, 00/06/12/18 h with catch-up after sleep; `--remove` uninstalls it.
    Page: "Rosters as of …" under Roster Changed (orange with an alert icon after 24 h without a
    run); Data Details, the flag tooltips and the footer name the roster source; Data Details
    lists unmatched roster players.
    First runs (manual and under systemd, 2026-10-19): 30 teams, 524 players, 524 matched.
    Roster Changed 27 → 16: Bruce Brown and Agbaji now agree (unsigned, on no roster); new flags
    include Connaughton (waived by CHA in preseason), Sochan (non-guaranteed with POR) and
    Highsmith. Verified on the owner's :3100 (`follow-up-5/`, 1440 / 390). Python roster and
    free-agency tests 16 passed; ruff and mypy clean; dashboard lint and typecheck clean; Free
    Agency, Contracts and visual baselines passed on a fresh build (Free Agency's first-load
    baselines refreshed; its fixture pins the clock so the 24 h line stays stable).

19. [x] "We have to make sure that it's economical on my Oracle VPS and within its limits… prevent
    bloat, consider the egress limits for free PAYG, and the block storage limit." Measured on the
    VPS (read-only): 193 GB boot volume (nearly all of the 200 GB Always Free block allowance),
    21 GB used, 4 OCPU / 24 GB. Egress is unaffected: the refresh only downloads (inbound is free)
    and Caddy compresses what the page serves.
    — The refresh now retains bytes and seals a bundle only when the rosters change (team, ESPN
    id, name, NBA id, player index); an unchanged run rewrites the `.checked` heartbeat, which the
    page reads as "Rosters as of". `--keep-days 30` prunes older bundles, their raw responses and
    unchanged runs' receipts, never the newest bundle. Real runs: changed +2.7 MB, unchanged
    under 4 KB on disk and about 23 KB of receipts. `docs/deployment.md` corrected (193 GB, egress
    and compression); source policy v3 records the bounded-retention exception.
20. [x] "Schedule other data ingests so we prevent stale data from accumulating on our site. I want
    it to be up to date." Before this, only rosters were scheduled; contracts dated from Oct 12,
    the player index from Oct 11 and DARKO from Oct 19, each refreshed by hand.
    — `courtlens refresh-daily` (timer `courtlens-daily-refresh`, 13:30 UTC, after hoopR's
    ~12:10 UTC republish) runs three independent store-on-change steps: the hoopR player index
    (newest commit via GitHub's API; admitted only when roster rows change), Basketball-Reference
    contracts (30 pages; a new refresh only when the parsed contracts, the index, thresholds or
    crosswalks change; staging copy deleted after admission) and DARKO's current board (sealed
    only when the ratings change; `darko_manifest` now names the directory and serves the newest
    bundle; superseded bundles past 30 days are pruned and aliased, so saved investigations
    still resolve). Contracts' Data Details shows "Last checked". `scripts/install_data_refresh.sh`
    installs both timers. Statistics (C22) are still frozen; see the deployment guide.
    First real runs (2026-10-20): player index admitted (526 active; Bruce Brown and Connaughton
    now off rosters); contracts admitted against it (526 expected, 433 with salaries, up from
    464 of 622 camp-roster players); DARKO unchanged (data date 2026-06-03, offseason).
21. [x] "Why are we blocked on NBA for the free-agent tracker?" → not a rate limit: Akamai's bot filter
    answers every non-browser client (ours and a bare curl, one recorded request) with 403. Owner:
    check for a free site, else disguise. Compared NBA.com's sealed class (238) with Wikipedia's
    "List of 2026–27 NBA season transactions": 141 shared; Wikipedia lacks class, options, age and
    stats but is edited within hours, while NBA.com's own tracker already lagged (Tony Bradley,
    Connaughton, Dickinson). Owner: "pick the direction with the most accurate, up-to-date data."
    — NBA.com stays the class (browser-saved import per offseason); `courtlens
    refresh-wikipedia-transactions` (daily, a `refresh-daily` step; `en.wikipedia.org/wiki/`, which
    robots.txt allows) seals dated moves from six tables (signings, two-way, abroad, waived, camp
    cuts, retirements) when they change. Each player's status = NBA.com, then their latest
    Wikipedia move, then ESPN's roster (unless Wikipedia's move is the roster's day or the day
    before). Page: current status with "NBA.com: …" when it differs, a dated move note under the
    team (flagged when changed), Abroad status/tile/chip, "Changed Since Tracker" (replaces Roster
    Changed), "Wikipedia as of", Data Details and footer sources.
    Real data (revision 1381121598): 579 moves; of 234 tracked, 46 changed since NBA.com: 29 signed
    abroad (Russell to Shanghai, Valančiūnas to Žalgiris), Bradley signed by UTA, Connaughton and
    Dickinson waived, Timme claimed by PHX; ESPN decided 6 that Wikipedia had not caught.
    Python unit suite 1608 passed; Free Agency, Contracts and visual baselines 17 passed (Free
    Agency baselines refreshed; fixture recaptured).
22. [x] Daily game stats (owner approved the season overlay, then "use your recommended optimal").
    A true overlay meant rewriting ~600 single-dataset reads and the dbt models, so each daily
    release is a full dataset again with old daily releases retired (same pages, bounded storage).
    — `courtlens refresh-season-stats` (second `refresh-daily` step): hoopR's newest commit →
    the season schedule and each final game's `boxscoretraditionalv3` (pinned; recent 3 days
    rechecked for stat corrections; retained when new or changed) → flattened into
    SportsDataverse's release CSV columns (`ingestion/hoopr_boxscores.py`; identical to the
    2025-26 assets on 30 games / 856 rows) → `import_workbench_data(builder="season-refresh")` →
    `publish_workbench_release` → Stats cohorts warmed → `retire_releases` keeps the published
    and newest two daily datasets (admin-mutation delete; impact, hand-built and cited datasets
    never touched). Timer timeout raised to 2 h.
    First real run (2026-10-20, no 2026-27 games final yet; the schedule changed): 3 min 4 s,
    dbt 93/93 passed, release d7c91cef… published, 62 cohorts warmed; all 26 past seasons
    identical to the previous release (row counts, points, content hash); database +919 MB.
    Main API endpoints 200 on the new release. Python unit suite 1612 passed. Not yet observed:
    a run with 2026-27 games (first final games tonight; the 13:30 UTC timer picks them up).
23. [x] Retired the three hand-built Oct 13 releases (owner: "Yes you can retire them";
    `courtlens retire-release`). Weekly current-season impact (owner approved provisional
    datasets, "Sounds good go ahead"): `courtlens refresh-season-impact`, Mondays 14:30 UTC, from
    the start gate of 10 games per team; see `docs/season-impact-plan.md` for the build and its
    2025-26 validation (59 games equal to sealed stints and possessions; ~4% expected
    exclusions without the CDN stream). Impact disclosure shows a Provisional badge.

Follow-up instructions (owner, 2026-10-20; Free Agency screenshots, the Stats table as reference):
24. [x] "The free agent tracker table looks weird. Just use our regular table design. I feel like we
    overly tweaked it. We already have good established table designs." — the bespoke `fa-table`
    is gone; the tracker uses the shared Stats table (`stats-workspace` / `stats-table-frame` /
    `dense-stats-table`, as Teams and Matchups do): table-lift name column, table-well data,
    Player · Movement · 2025-26 · Profile · Deal group labels with a rule at each group start,
    shared sort headers. One value per column: PTS, REB and AST split (each sortable; `sort=stats`
    still means PTS), Age and Exp split. The name cell is the Stats one (team logo, season-agnostic
    photo, name over a position · class · option line). Status pills and group brackets removed;
    status is toned text. Source notes read in the text colour with their link icon, cut with an
    ellipsis. Fits 1240px without horizontal scroll; 52px rows.
25. [x] "…move the market moved bar to be in line with the caption text for 'changed since
    tracker'…" — the captions left the last tile; a foot row on the tiles' six-column grid holds
    the market bar (columns 1–5) beside the Rosters/Wikipedia captions (column 6). Measured: bar
    and captions share a centre line (y 317), card 132px tall. Phone: bar, then captions, full
    width.
    Verification: production sandbox 3180 with live data through the read-only proxy (centres of
    group labels equal their cells; all 10 column labels share one bottom edge; no page overflow
    at 1440 or 390); Free Agency spec passes on the mock; lint, typecheck, Vitest 603/603;
    visual baselines 109/111, then the two Free Agency baselines refreshed (desktop was already
    stale from follow-ups 15–21). Evidence: `docs/evidence/alignment/contracts/free-agency-table/`.

Follow-up instructions (owner, 2026-10-20; screenshots of the table and summary card):
26. [x] "I'm noticing text clipping for the amber text. We need to extend the horizontal space for
    'Movement' section, and never let text clip, instead if we run out of space after this
    extension, just wrap." — Movement widened to 124px status + 300px team (from 112 + 236),
    paid for by 56px number columns (from 64) and a 220px name column (from 232). Nothing in
    the table truncates any more: move notes, NBA.com flags, source notes, names and tag lines
    wrap (balanced); a wrapped source note keeps its link icon after the last word.
27. [x] "The market moved end of bar number is too small. Shorten the bar so we can get a slightly
    bigger number." — the percentage is 16px (`--text-lg`, from ~11px) and the bar ends 20px
    before it, with extra room before the captions column.
    Verification: production sandbox 3180 with live data through the read-only proxy; a DOM scan
    of every body cell found 0 clipped or spilling elements at 1440, 1308 (the owner's width) and
    390, and no page overflow. Free Agency spec passes on the mock; lint, typecheck, Vitest
    603/603; the two Free Agency visual baselines refreshed, all others unchanged.
    Evidence: `docs/evidence/alignment/contracts/free-agency-wrap/`.

Follow-up instructions (owner, 2026-10-20):
28. [x] "The number at the end of the bar is a little too thick, make it slightly less bold and a
    little larger." — 20px (`--text-xl`, from 16px) at weight 600 (from 700).
29. [x] Owner question: D'Angelo Russell was traded to Memphis and then released without playing for
    them; his logo is the Wizards'. "What do you think is the correct team logo (and general rule)?"
    — Recommendation, applied: keep the Wizards. Rule: the name cell's logo is the team the
    player is a free agent from (NBA.com's old team, whose 2025-26 stats the row shows); where he
    went, including a team that held his rights without him playing, reads in Movement. Signed
    players therefore keep their old team in the name cell (LeBron: LAL, Movement LAL › PHI)
    instead of showing the new team twice.
    Verification: live data on 3180 (Russell WAS in name and Movement; LeBron LAL, then LAL › PHI;
    number 20px/600); Free Agency spec passes; Vitest 603/603; Free Agency baselines refreshed.
    Evidence: `docs/evidence/alignment/contracts/free-agency-logo/`.
    Found, not fixed: NBA.com's tracker gives 0.0 PTS/REB/AST for 185 of 238 players (mostly
    signed ones), which the table shows as zeros; awaiting the owner's call.

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
20. [x] "A bit of a reversion back to an old page … Why isn't 'By Position' clickable on Team
    Comparison" (2026-10-21, during row 17). — The observed starting fives were a sealed file
    pinned to the 2026-10-17 release; the 2026-10-20 publication made every scope fail its
    release check, so By Position disabled itself. `services/starter_evidence.py` now applies the
    same method live (`GET /api/workbench/teams/{id}/starters`), reproducing all 1,192 sealed
    scopes exactly (the unit's G/F/C = each player's most common label across its starts); the
    sealed file moved to `docs/evidence/alignment/team-compare/`. Tests:
    `tests/unit/test_starter_evidence.py`. Like the Stats starting-position labels, it still
    refuses while a daily refresh has changed raw files that the release hasn't republished.

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

### 6 Last X Games — ✅ aligned (first revision)

Owner approval (2026-10-20): "Alright, looks good. This page is considered finished now." The
`recent-games` and `first-load-recent-games` Playwright baselines (desktop and phone) in
`dashboard/e2e/visual-baselines.spec.ts` are the approved screenshots. Parked for the accounts
work after the last page: favourites and Databallr's Favorite Players sidebar (follow-up 37).
Open, outside this page: the lineage endpoint ignores the fact id (follow-up 8); late-playoff
+/- waits for a fresh stint run.

Owner start (2026-10-20): "Next alignment page: row 6, Last X Games (/last-games), the first item
in the Players menu", with three Databallr references (the page under the open Players menu, the
page itself, and a close-up of the window card, comparison table, Game Logs and Rolling Trend
Chart). Asked for numbered instructions, the owner replied: "I'm essentially asking you to do what
we have been doing in the past. Which is replicate databallr, and then we iterate on databallr's
design to improve it and add little features." The list below is the agent's replicate-then-improve
proposal under that instruction; the owner's review revises it.

Starting state (survey, 2026-10-20): `/last-games` (`app/last-games/page.tsx`,
`components/recent-games-view.tsx`) is the pre-alignment layout: a left-aligned "Last X Games"
header with a Switch player lookup, star / compare-tray / Profile / Export buttons; the shared
ContextBar (season, phase, cutoff) with Last 5 / 10 / 20 / All, Per Game / Per 36 and Table / Cards;
an example-subject card; a hero with six stat tiles; a points trajectory SVG; and an "Appearance
Game Log" (date, team, opponent, status, MIN, PTS … TS%, fantasy, a Lineage button per row) or game
cards; then a "missing games are unknown" note. One phase at a time, 50 games at most. Data: the
workbench box scores carry PTS, REB (O/D), AST, STL, BLK, TOV, PF, FGM/A, 3PM/A, FTM/A and minutes,
but no plus-minus; IM03's sealed stints (2023-24 to 2025-26) can supply a per-game +/-.
Databallr: centred chart-line icon title "<Player> Last Games Stats" and "Track player performance
trends over their most recent games"; Per Game / Per 36 Min; a heart, a gradient Choose Stats
button and Glossary; Table View / Card View. Left: the player photo beside a "Last 5 Games" stepper
(−1, −5, +5, +1), then "First 78 Games · Per Game · Last 5 Games" for PTS AST REB TS% 2P% 3P% FT%
FTA TOV STL BLK MPG +/- FG2A FG3A FTR, each window value with an arrow and the change (gold when
better, blue when worse; TOV up is blue) and a wordmark. Right: "Game Logs" with an expand button,
"+ Add Season Data", a "2026 (RS + PO)" chip and a scrolling table (DATE sortable, OPP logo and
tricode, then the same stats). Below: "Rolling Trend Chart (5-game moving average)", Stat 1 /
Stat 2 / Rolling Avg controls and a smoothed two-axis line chart (gold and blue) over the season.
Databallr's Favorite Players sidebar belongs to its app shell, which row 0 approved without it.

Instructions (owner, 2026-10-20; "replicate databallr, and then we iterate"):
1. [x] Header: the centred chart-line icon title "<Player> Last Games Stats" with Databallr's
   explainer; below it Per Game / Per 36 Min, a favourite heart, a gold Choose Stats button
   (Databallr's grouped-checkbox dialog, `stats=` in the URL), Glossary (the Stats glossary
   definitions for the chosen stats) and Table View / Card View. A Change Player lookup and the
   season and phase controls sit in one console with Data Details (scope, cutoff, sample, method,
   CSV, copy link). Phase defaults to Regular Season + Playoffs when the season has playoff games.
   — One console: Season, phase (Regular Season + Playoffs by default, `phase=` otherwise), Per
   Game / Per 36 Min (`mode=`), heart (workspace favourites), Choose Stats (Counting / Scoring /
   Other, Defaults, Clear All, Save Changes), Glossary (a dialog defining every stat, the chosen
   ones first; the page's stats are box-score formulas, so the definitions live with them rather
   than in the metric catalog), Table View / Card View (`view=`), Data Details (player, scope,
   each phase's cutoff, games, window, release, method notes, Export CSV, Copy Link). The photo is
   the Change Player control, as on Player Comparison. Without a player the minutes leader is the
   default and a one-line note says so ("Example: … Most minutes in 2025-26"). On phones the scope
   goes into the Filters sheet and the mode controls wrap, centred.
2. [x] Window card: the season photo (`era`) beside a "Last N Games" stepper (−1, −5, +5, +1,
   bounded by the games played; `window=` in the URL).
   — 1 to games − 1; buttons disable at the bounds; the photo sits on the team colour with its logo.
3. [x] Comparison: "First K Games · Per Game · Last N Games" for the chosen stats, each window value
   with an arrow and the change, gold when better and blue when worse; the CourtLens wordmark under
   it. Improvements: rates come from summed makes and attempts, not averaged percentages; a change
   with an unknown side reads "—".
   — Live SGA 2025-26 (RS + PO, last 5) matches Databallr on all fifteen box-score rows (PTS 30.8 →
   25.4, TS% 65.7% → 56.7%, FTR 47.0% → 55.6% …). MPG reads 35.2 where Databallr shows 35 (it
   rounds each game's minutes first). TOV and PF rises read blue. Also: when +/- is known in only
   some games, a line under the table says so ("+/- known in 3 of the last 11").
4. [x] Game Logs: the Stats table look (table-lift frame, pinned Date column, sortable headers,
   OPP as logo + tricode with vs / @) in a scrolling panel with a sticky header; the season-phase
   chip; expand opens it full width; "+ Add Season Data" appends the previous season's games.
   Improvement: the window's games carry a gold edge, so the table shows what the comparison
   averages.
   — Game · Counting · Scoring · Other group labels; every header sorts (`sort=`, again for
   ascending); chips per season ("2025-26 (RS + PO)"), added seasons removable. Add Season Data is a
   menu of the catalog's earlier seasons (up to four, `add=`); a season without games says "no
   games". Added seasons join the log and the trend chart; the comparison stays on the chosen
   season. A note under the table explains the gold edge.
5. [x] Rolling Trend Chart: "(N-game moving average)" title and explainer, Stat 1 / Stat 2 selects
   and a Rolling Avg input; smoothed gold and blue lines on two axes with date ticks, a legend and
   the wordmark. Improvements: the last-N window is shaded on the chart, and hovering shows the
   game (date, opponent) with both values.
   — `s1=`, `s2=`, `roll=` (1–20); the Stats trend dialog's monotone curve (never overshoots a
   point); rates from each window's sums; drawn at the plot's pixel width so tick text keeps its
   size on phones; season breaks marked when seasons are added. The shape matches Databallr's
   SGA chart.
6. [x] Card View: one card per game in the window with the chosen stats.
7. [x] Data: a per-game +/- from IM03's accepted stints (2023-24 on, the player's on-floor points
   minus points allowed; unknown when the game's stints are incomplete, never zero), served with
   the game log. Earlier seasons show "—" for +/-.
   — `game_plus_minus` in `services/on_off.py` (the stint acceptance rule factored out as
   `accepted_stint`, shared with shared-floor v2), added to `stats.plus_minus` by
   `GET /api/workbench/players/{id}/games`; read-only, no dataset or snapshot change. Checked: the
   five home players' +/- sum to five times the final margin (game 0022500001). SGA: all 68
   regular-season games known; 7 of 15 playoff games (the stint runs end before the late rounds).
8. [x] Removed: the ContextBar, example-subject card, stat tiles, trajectory SVG, Status and
   Fantasy columns and per-row Lineage buttons (lineage stays reachable from Data Details); the
   "missing games are unknown" rule moves into Data Details.
   — Done, except lineage: `GET /api/workbench/lineage?factType=player_game` ignores the fact id
   and returns the same unrelated facts (an October 2000 game) for every game, so no per-game
   lineage is offered until the endpoint is fixed (it was wrong on the old page too). The unused
   recent-games helpers in `lib/player-pages.ts` and their tests went with the old view.

Verification (2026-10-20): 3180 production sandbox, read-only proxy at 4180 to the owner's API:
SGA (default, window 11 + Per 36, Card View, 2024-25 added with TS% / +/- in the chart), Jokić and
the parameter-free default, 1440 and 390: no overflow and no browser errors. Clicked through the
stepper, Per 36, Card View, sorting, Add Season Data, chart hover, Choose Stats, Glossary, expand
and Change Player. Dashboard lint, typecheck and stylelint clean; Vitest 609/609 (new
`lib/last-games.test.ts`). Python: new `test_game_plus_minus_sums_on_floor_margin_and_keeps_unknowns`;
ruff, format and mypy clean. Playwright on the mock sandbox (fixture `e2e/fixtures/last-games-v1.json`,
real SGA 2025-26 regular season): new `e2e/last-games.spec.ts` 6/6 (18/18 over three repeats);
full suite 500 passed, 28 skipped, 1 failed: `stats-team-move-dates:4` expects the tooltip's older
"Index refreshed" wording where the page now says "Checked" (unrelated). Only the four
`recent-games` / `first-load-recent-games` baselines changed.
Data-blocked: +/- before 2023-24 and in playoff games after the last stint run (SGA's last 8);
per-game lineage (endpoint bug above).
Evidence: docs/evidence/alignment/last-games/ (`before/` holds the survey).

Follow-up instructions (owner, 2026-10-20; "Good first pass"):
9. [x] "The default player needs to be more popular. Either take the top player from the top of the
   main stats table, or the mvp from the prior year."
   — The Stats table's top row as it opens (Overview, DARKO DPM, regular season of the season in
   scope): Nikola Jokić for 2025-26. Chosen over the MVP because it works for every season the Stats
   table covers and matches what people see on Stats; the MVP list is the assistant's name-only
   registry. Falls back to the minutes leader when a season has no DARKO values. The note reads
   "Example: Nikola Jokić · Top of the Stats table (DPM) in 2025-26".
10. [ ] "The table on the left (first 80 games/per games/last 5), should stretch to the height of the
    "Game Logs" container to the right (for a proper bento/puzzle fit). It's probably more
    beneficial as it gives us more space to make the text numbers larger and add a little bit more
    spacing."
    — At 1100px and wider the left column stretches to the row; the comparison card fills it and its
    rows share the height. Numbers and labels went from 16 to 20px (`--text-xl`), headers and changes
    to 14px (`--text-md`), the name 20px, more padding; the column is 440px. (The first pass used an
    undefined `--text-base` token; replaced. Stat Line Shift's CSS uses it too.) The owner's :3100 kept
    serving the stale stylesheet until the import line was toggled. The log scrolls inside the Game Logs panel, so the
    comparison sets the row height (480px at least). Measured on :3100: both end at the same pixel (SGA 1102,
    Jokić 1096), no clipped cells; a new e2e test pins it. Narrower screens keep the stacked layout.
11. [ ] "For our improvement/iteration do you have any suggestions/recommendations to make this page
    much more optimal? What do you think would make this page better than it already is, or what
    we can change about it to make it clearer."
    — Proposed, awaiting the owner's pick (recommended first three):
    a. "Is this a real change?": rank the window against every N-game stretch of the season, e.g.
       "lowest 5-game TS% of the season" or "within his normal range", and mute changes inside the
       middle 80%. Empirical, no model; tells a slump from noise.
    b. Linked panels: clicking a comparison row plots that stat on the chart; hovering a log row
       marks its point on the chart, and the reverse.
    c. Game context in the log: result and score (W 118–109) and rest (back-to-back, days off) from
       the schedule, to explain dips.
    d. Window presets beside the stepper: Last 5 / 10 / 20 and "Since…" a date (trade, return from
       injury).
    e. Opponent defence in the log (opponent defensive rating) and an "against top-10 defences"
       split.
    f. A ten-game sparkline per comparison row.

Follow-up instructions (owner, 2026-10-20; "Nice."):
12. [x] "Can we make the player portrait larger. It seems like it's larger on databallr"
    — 120 → 168px on desktop (88px on phones, where the chooser needs the width).
13. [x] "I feel like we can make number of games chooser much more intuitive and better ui/ux" (the
    Last N stepper)
    — The four chevron buttons (±1, ±5) became one sentence and two tools: "Last [−] 5 [+] Games";
    a slider across the season (gold to the thumb, "1" and "82 · 83 played" at its ends; arrows,
    Page Up/Down and End work); and L5 / L10 / L15 / L20 quick picks (lit when the window matches).
    Same `window=` URL state and bounds.
14. [x] "This table should maybe be formatted like our other tables. It's lacking shading
    segmentation that make it easier to read the table." (the comparison table)
    — The Stats table look: table-lift frame and uppercase column labels, the stat-name column on
    table-lift between table-well value columns, hairline rows with hover, and a Counting /
    Scoring / Other band before each group. Values stay 20px. Measured on :3100 and 3180: the
    comparison and Game Logs still end on one line (1114 / 1124px); no clipped cells; no overflow
    at 390.

Follow-up instructions (owner, 2026-10-20; screenshots of :3100):
15. [x] "It still looks very rough. Is there something I'm missing?" — and: "In "game logs" table
    "Game" should be centered over date. And "Date" should also be centered over it's column"
    — Nothing was missing on the owner's side: their :3100 still served the stylesheet from two
    rounds earlier (old stepper rules, none of the chooser, slider or group bands). Turbopack does
    not watch the files `globals.css` imports (Tailwind's PostCSS plugin inlines them), and the
    chunk keeps its name, so a hard refresh is needed as well. Toggled the import line and checked the
    served chunk for the new selectors. Game Logs: "Game", "Date" and the dates are centred on the
    date column (0px off its centre, measured with `Range`).

Follow-up instructions (owner, 2026-10-20):
16. [x] "counting/scoring/other should be centered in their columns" (the comparison table's group bands)
    — Centred; each band sits 0px off the stat-name column's centre (measured with `Range`).
17. [ ] "we have to find a way to cleanly be able to launch the search from here. It currently
    overlaps, and looks sloppy." (the Change player search under the photo)
    — Pressing the photo opens a "Change Player" dialog (like Select Team on Stat Line Shift): the
    search is focused, the season's leaders and recent picks show before typing, and results list
    inside the dialog under the field instead of floating over the cards. Picking a player loads
    them and closes it; Esc closes. Shared Modal change: a child that focused itself (autoFocus)
    keeps focus instead of the close button taking it a frame later; no other dialog uses
    autoFocus. Full Playwright 502 passed, 28 skipped, 1 failed (the known
    `stats-team-move-dates:4` wording test).

Follow-up instructions (owner, 2026-10-20):
18. [x] "can we make the "Last ... X... Games" centered in the container for a more harmonious look.
    It kind of looks like it's off center. Keep it centered"
    — The line is a five-column grid with equal outer columns ("Last" right-aligned, "Games"
    left-aligned), so − N + sits on the card's centre whatever the words' widths: the number is
    0px off centre at 1440 and 390.
19. [x] "The numbers in the 3 column table are a little large compared to the text size used in the
    container. We should make it look a little more balanced."
    — Values 20 → 16px, stat names 16 → 14px, changes 14 → 13px with a 14px arrow; row heights and
    the bento fit are unchanged (both columns end at 1114 / 1124px).

Follow-up instructions (owner, 2026-10-20; Rolling Trend Chart and the games chooser):
20. [x] "give opportunity to add more stats (up to a certain limit) if the user prefers"
    — Up to four (`trend=pts,ast,ts,pm`; old `s1`/`s2` links still read). Each stat is a compact
    picker with its line colour and a remove button; "Add Stat" offers the next useful one (REB,
    TS%, +/-, MPG …) until four. Two stats keep Databallr's one-axis-each look, ticks now in their
    line's colour; three or four share an axis per unit (counts left, rates right), each shared axis
    named ("PTS · AST · +/-", "TS%"). Lines 3 and 4 use the green and pink trend tokens.
21. [x] "Why is the rolling average drop down box taller than the stats drop downs next to it."
    — It was a text input from a different component family than the kit dropdowns, and it kept
    its own height regardless of the small size asked for. It is gone (22); every picker in the
    row is now 32px (40px touch size on phones).
22. [x] "Should the rolling average number be linked to the "last x games" container. Choose whatever
    is logical."
    — Linked: the moving average follows the games window. The chart's last point then equals the
    table's "Last N Games" value (SGA: PTS 25.4 at L5, 26.1 at L10) and the shaded band is those
    N games, so chart and table never disagree. The title says "(N-game moving average)". A unit test
    checks the endpoint equals the window value for counts, rates and +/-.

Follow-up instructions (owner, 2026-10-20):
23. [x] "The 'x' don't look clear next to the stats, can we make it more clear which stat they belong to."
    — Each stat is one chip: its line-colour swatch, picker and × on the picker's own surface-2
    fill, chips 12px apart, so every × sits inside its stat. Only the wrapper is page CSS; the
    picker and × stay kit controls. No overflow at 390 (the chips wrap).

Follow-up instructions (owner, 2026-10-20; "You can do all of them if you think they will improve
the page", answering the agent's six proposals):
24. [x] Unusual or normal: rank the window against every N-game stretch of the season and say so
    ("lowest 5-game TS% of the season", "within his normal range"); mute changes inside the middle
    80%.
    — `stretchVerdict` ranks the window among every run of N consecutive played games (at least 10
    runs, else "too few stretches to judge"). Outside the middle 80% the change keeps its gold or
    blue; inside it turns grey; a dot marks the season's highest or lowest stretch; hovering gives
    the verdict ("Lowest 28-game MPG of the season", "Within his normal range…"), also in screen
    reader text. A key under the table explains it. A change that rounds to zero has no colour or
    sign ("+0", not "-0"). SGA last 5: 6 unusual, 10 normal; Dončić since the trade: 3 extremes.
25. [x] Game context in the log: result and score, and rest (back-to-back, days off).
    — A Context group after Date: Opp (now with vs / @ from the schedule), Result ("W 140–109",
    green or red), Rest ("1 day", gold "B2B") and Opp DEF (below). Read from the existing team
    schedule endpoint per team and phase, joined by game id; a failed read leaves "—", never
    hides the log. Card View shows the result too. The comparison's Context band adds W–L.
26. [x] Linked panels: a comparison row puts its stat on the chart; hovering a game in the log marks
    it on the chart, and the reverse.
    — Each stat name in the comparison is a button: it adds the stat to the chart (replacing the
    last at four) or removes it; plotted names show their line's colour. Hovering a log row marks
    that game on the chart with the tooltip; hovering the chart tints the matching log row. The
    hover is shared only when the game changes and the lines are memoised (40 moves in ~720ms).
    In-season team changes are marked on the chart ("Joined LAL").
27. [x] "Since…" windows beside L5 / L10 / L15 / L20: a trade, the start of the playoffs, the end of
    a long gap, or a picked date.
    — A "Since…" menu under the quick picks lists facts from the log only: "Since joining LAL
    (Feb 10)", "Since the playoffs began", "Since a 12-day gap" (a gap is named by its length,
    never as an injury), newest first, one per date; "Pick a Date…" opens a calendar limited to
    days he played (the first game excluded, so one earlier game remains). `since=` in the URL;
    the button reads "Since Feb 10, 2025" with a clear button; the stepper, slider and quick picks
    clear it. Dončić 2024-25 since the trade: 28 games.
28. [x] Opponent strength: the opponent's defensive rating in the log and the window's average
    opponent defence against the season's.
    — Opp DEF in the log is the opponent's regular-season defensive-rating rank ("5th"; the rating
    on hover), from `/teams` for the season through its cutoff. The comparison's Context band
    shows the average opponent rank for the first K and last N games and says "tougher" or
    "easier"; W–L sits beside it.
29. [ ] A ten-game sparkline per comparison row — not built: once 26 puts any row's stat on the
    chart, a sparkline repeats it at lower fidelity, and a fourth column would shrink the values the
    owner asked to keep readable (follow-up 19).

Verification (follow-ups 24–28, 2026-10-20): 3180 sandbox with the read-only proxy (SGA 2025-26,
Dončić 2024-25 since the trade, phone): no overflow, no browser errors. Unit tests for the verdict,
anchors and context summary (Vitest 613/613). Playwright: four new Last X Games tests with the
fixture extended by OKC's real schedule and every team's defensive rating; the page's specs 24/24
over two repeats; full suite 506 passed, 28 skipped, 1 failed (the known `stats-team-move-dates:4`
wording test). Lint and typecheck clean. Evidence: `followup6-*`.

Follow-up instructions (owner, 2026-10-20; "Nice."):
30. [x] "You can add the sparkline if you please, if it's not a useful addition leave it off." — Left
    off, for the reason under 29: clicking a stat already plots it at full size.
31. [x] "increase player portrait size to match height of container beside it."
    — The portrait measures the chooser and takes its height (206px square, tops aligned). The
    left column went 440 → 468px and the chooser's side padding 16 → 12px so the full "Last − N +
    Games" line still fits beside it. Phones keep the 88px portrait.
32. [x] "Change "Since..." to simply "Since"" — Done; the menu keeps the trade, playoff and gap starts.
33. [x] "Just use a standard calendar picker (with valid dates only). The current calendar picker is
    terrible."
    — No more Since menu → "Pick a Date…" → dialog → button → calendar. A date button sits beside
    "Since" and opens the app's standard month calendar in place; only days he played (after his
    first game) can be chosen, others are disabled. The browser's native date input was not used:
    it can bound the range but cannot disable the days he did not play.
34. [x] "also the caption at the bottom of the 3 column stats table is too wordy, try to keep it more
    succint and take up less space."
    — One line: "Colour = unusual for his 5-game stretches · ● season high or low" (plus "+/- known
    in 44 of first 45" when it applies); phrases never break mid-way. The verdict stays on hover.

Follow-up instructions (owner, 2026-10-20):
35. [x] "in card view make sure the numbers can actually fit in the boxes"
    — Cards are at least 260px wide (three a row at 1440), so every value fits its box, "100.0%"
    included; measured with no clipped value at 1440, 1100 and 390. The result sits on the date line.
36. [x] "in glossary why are the terms at, and below, oreb grey compared to white/grey like the other
    terms."
    — They were the stats not currently shown, dimmed to set them apart, which read as disabled.
    Now two labelled lists in normal colour: "On This Page" and "More in Choose Stats".
37. [x] "Not sure how the heart feature works here. databallr has a sidebar for your favorite
    players. I imagine this is useful once you setup accounts/auth for users and persist across
    sessions. Thoughts? Courtlens is not meant to be scaled for public use (more of a project meant
    for resume, that recruiters/manager/myself/select few friends/family can use) but still
    publically hosted, however, we can add very simple auth/accounts after we finish all pages. That
    way these preferences (favorite players) can be hooked up/linked to something."
    — Agreed, and the heart is removed from this page until then. It wrote to one install-wide
    workspace list that no page reads, and on the read-only demo the write is refused, so it lit up
    and quietly reverted. Parked for after the last page (owner's plan): simple invite-only
    accounts; favourites per account; Databallr's Favorite Players sidebar in the app shell (a row 0
    change) and a Favorites filter on Stats; the demo's Caddy allowlist then needs the account and
    favourites writes.

Follow-up instructions (owner, 2026-10-20):
38. [x] ""Last ... x ... Games" is still not centered in the container."
    — Follow-up 18 centred the number, but "Games" is longer than "Last", so the phrase overhung
    to the right (5px of room). Now the whole phrase is centred with equal space either side, and
    "Last" / "Games" are 14px (the number stays large): 22.5px from each edge at 1440, 1100 and
    for L5 and L15; 34.5px at 390.

Follow-up instructions (owner, 2026-10-20):
39. [x] "should we use a different colour or a better way to describe this? Yellow = high Blue = low,
    why are we only using yellow" (the comparison's colour key)
    — The changes already used gold for better and blue for worse (a rise in TOV is blue), but the
    key showed only a gold "Colour", so it read as gold = unusual. The key now names all three
    tones in their colours: "Gold better · Blue worse · Grey his usual range · ● season best or
    worst". The dot keeps its change's tone, and the verdict says "(best)" or "(worst)", since a
    season-high TOV is the worst. One line at 1440.
40. [x] "Can we be more succint with the caption under the rolling trend chart title. It's very wordy."
    — "Uses your games window: each line ends on the table's Last 5 value." The early-points and
    colour rules moved into Data Details.

Follow-up instructions (owner, 2026-10-20):
41. [x] "use colons after the "Gold" "Blue", also what is "season best or worst" mean here?"
    — "Gold: better · Blue: worse · Grey: his usual range", then on its own line "●: his best or
    worst 5-game stretch this season". The dot marks a stat whose last N games are his best or worst
    run of that length all season (Jokić's MPG over his last 5 is his most minutes in any 5-game
    stretch); the old wording did not say that.

### 9 Showcase — ✅ aligned (first revision)

Owner start (2026-10-20): "Next alignment page: row 9, Showcase (/showcase), the second item in the
Players menu", with two Databallr references (the page, and the player dialog a card opens) and the
slideshow described in words: "the slideshow starts on the current year, then wraps to the earliest
year on file, 2001, then does a shuffle animation for the player cards, as the years increment and
player shuffle around." Approach as on row 6: replicate Databallr, then iterate past it. The list
below is the agent's replicate-then-improve proposal under that instruction.

Same message, Rankings (row 10): "I think we bin this 'Rankings' page … some of these pages are
exclusively catered towards social media sharing. When our project is more focusing on data
engineering / applied ml / statistics." Row 10 is cut: the page and its Players menu item go.

Starting state (survey, 2026-10-20): `/showcase` is the FO04 single-card page: a left-aligned
"Showcase" header with Find player and an Export menu (PNG / SVG); the shared ContextBar (season,
phase, Through, Overall / Scoring / Playmaking & Defense / Per 36 focus); one 560×700 SVG card
(circle portrait, six stat tiles with rank pill, percentile and bar); Previous / Play / Next with
"1 / 25"; a percentile footnote; a right rail with the player, star / compare-tray / three link
buttons and a 25-player roster sorted by PPG. One season at a time; the slideshow cycles players,
not seasons. Data: DARKO DPM exists for every season on file (2000-01 to 2025-26, the same span as
Databallr's slideshow); the Stats query gives estimated positions, minutes filters, team filter and
league percentiles; the player page's career table can serve the dialog.
Databallr: centred grid-icon title "Player Showcase" and "Explore player statistics with
customizable visualizations". Two consoles: (left) Per Game, Minutes > 400, grid / list toggle,
Search, Choose Stats, Regular, Team, a ‹ 2026 › season stepper, Glossary; (right) Position G / F / C,
Sort by DPM with a direction button, Filters, a green Play Slideshow and a help button. A banner
"2026 · DARKO DPM Leaders · databallr", then 24 cards eight to a row (rank and '26 badges, photo on
the team colour with its logo, name strip, DPM / Points / Assists / TS% in a 2×2 grid, team-colour
border) and Load 10 More. A card opens a dialog: photo, name, Regular Season / Playoffs, Overview /
Shooting / Impact / Advanced tabs, Percentile (Positional) toggle, Per Game / Per 75 / Per 100 /
Totals and the career table with ranks and percentiles.

Instructions (owner, 2026-10-20; "replicate Databallr first, then iterate past it"):
1. [x] Header: the centred icon title "Player Showcase" with a one-line explainer.
   — Grid icon, "Each season's leaders as player cards, ranked by the stat you choose"; title 0px off
   the page centre at 1440 and 390, the explainer wraps on phones.
2. [x] Consoles: two centred, balanced consoles as on Databallr. Scope: counting mode (Per Game /
   Per 36 / Totals), Minutes > N (default 400), Card / List view, Search, Choose Stats, Regular /
   Playoffs, Select Team (the Stats team dialog), a ‹ season › stepper over every season on file,
   Glossary. Order: Stats' position chips, Sort by (any card stat, DPM by default) with a direction
   button, Filters (minimum games, draft class), Play Slideshow and its help. All state in the URL;
   no dead controls.
   — `mode=`, `minMinutes=` (a menu of floors; playoffs default to 100 because they are shorter),
   `view=`, `phase=`, `teamId=`, `season=`, `positions=`, `sort=`, `dir=asc`, `minGames=`,
   `draftYear=`, `stats=`, `show=`. Search, Select Team and the position chips are the Stats
   controls. Glossary lists the card stats first, then every sortable stat, and links the Stats
   glossary. Both consoles 198px tall and centred under the title (0px off); on phones they stack
   and the scope console pairs its controls two a row.
3. [x] Banner: the season in gold, "<Sort stat> Leaders" (DARKO DPM Leaders by default) and the
   CourtLens wordmark.
   — "Lowest" replaces "Leaders" when the direction is ascending. Title 0px off the banner centre.
4. [x] Card grid: 24 cards, eight to a row at 1440: rank and season badges, the season photo
   (`era`) on its team colour with the logo, a name strip, the sort stat plus three chosen stats in
   a 2×2 grid (default DPM, PTS, AST, TS%), team-colour border. "Load More" adds the next 24.
   — `components/showcase-card.tsx` (HTML now; the old SVG card is gone). The sort stat's label is
   gold. Load 24 More up to 96. Live 2025-26 opens on Jokić, Wembanyama, Leonard, Gilgeous-Alexander,
   Antetokounmpo, Edwards, Dončić, Mitchell (DPM +7.5 … +4.6). Players without any NBA portrait
   (Jason Kidd, Andrei Kirilenko in 2003-04) show initials: the portrait endpoint has none for them.
5. [x] List view: the same players in a Stats-look table (rank, player, the card stats).
   — Rank with its change, photo, name and logo (opens the dialog), the four stats with percentiles.
6. [x] Player dialog: a card opens the photo, name, Regular Season / Playoffs and the player page's
   career table (views, counting modes, percentiles), with a link to the full player page.
   — `PlayerCareerTable` gained optional `onPhaseChange` / `onSeasonOpen` so inside the dialog the
   phase is local and a year click shows that season's board; the approved player page passes
   neither and is unchanged. "Open Player Dashboard" keeps the season and phase.
7. [x] Slideshow: Play starts on the season shown, steps one season every few seconds, wraps from
   the latest season to 2000-01, and cards shuffle to their new ranks (a player who stays keeps his
   card and slides; newcomers fade in). Pause stops it; reduced motion swaps without the shuffle.
   — Holds each season 3.2s after its cards land and prefetches the next one (a season query takes
   about 2.4s). Live run: 2025-26 → 2000-01 → 2001-02 → 2002-03 → 2003-04; Pause wrote
   `season=2003-04` to the URL and the board stayed. Each season keeps the filters. A failed season
   stops the show with a one-line note.
8. [x] Improvement: a small league percentile under each card value, coloured like Stats, with a
   key that names every tone.
   — The Stats percentile number (gold high, grey middle, blue low). Key line: scope ("Regular
   season through Apr 13, 2026 · over 400 minutes"), "Small number: league percentile", "Gold: up
   from last season", "Blue: down", "New: not on last season's board".
9. [x] Improvement: during the slideshow (and on any season), each card shows its rank change from
   the previous season ("▲3", "New"), and a season scrubber (2000-01 … 2025-26) lets you jump to or
   pause on a year.
   — The change compares with the previous season's board of the same size and filters (a dash for
   the same rank); the first season on file has none. A '01 … '26 timeline under the banner lights
   the season shown; a click jumps there and pauses.
10. [x] Improvement: Search finds a player in the grid (scrolls to and highlights his card) or, when
    he is outside it, opens his dialog.
11. [x] Removed: the ContextBar, the single SVG card and its Export, the focus presets, the roster
    rail, star and compare-tray buttons (favourites are parked for accounts, row 6 follow-up 37).
12. [x] Rankings (row 10) cut: route, Players menu item, its view and tests; Tier List keeps the
    shared example boards.
    — `/rankings` redirects to `/showcase`. Removed `ranking-boards-view.tsx/.css`, its e2e
    cases and the nav entry. The workspace API's ranking-board endpoints and
    `lib/workspace-client.ts` helpers are left in place (backend, unused by any page now).

Verification (2026-10-20): 3180 production sandbox with the read-only proxy at 4180 (2025-26
default, 2015-16 by PTS, list view, slideshow, dialog, 1440 and 390): no overflow, no browser
errors. Measured: page title, consoles and banner title 0px off centre; consoles 198 / 198px; card
labels and values 0px apart. Lint, stylelint and typecheck clean; Vitest 619/619 (new
`lib/showcase.test.ts`, rewritten `showcase-card.test.tsx`). Playwright on the mock: new
`e2e/showcase.spec.ts` 5/5 (twice); full suite 504 passed, 28 skipped, 3 failed: two relied on
Rankings being the only ungated Players item (header keyboard test, Rankings picker; fixed and
re-run green) and the known `stats-team-move-dates:4` wording test. Visual baselines updated:
`showcase-desktop`, `showcase-phone` and `search-desktop` (the search modal is captured over this
page).
Evidence: docs/evidence/alignment/showcase/ (`before/` holds the survey).

Follow-up instructions (owner, 2026-10-20; "Good first pass, now edits"):
13. [x] "give some seperation between the position buttons they are too close to each other."
    — They had no gap at all: Stats' 4px rule is scoped to the Stats page. Showcase now spaces them
    8px (measured 8 / 8 / 8 / 8 on :3100); the approved Stats page is unchanged.
14. [x] "Yes, you can cut tier list. It doesn't serve any purpose." (row 11)
    — `/tierlist` redirects to `/compare`; removed the page, its Compare menu item, the example
    boards (only Rankings and Tier List used them), their CSS and tests. Header tests that opened a
    menu now use Live, whose items need no catalog capability. The workspace API's tier-list and
    ranking-board endpoints are left in place, unused.
15. [x] "There are some players with no pictures. Is there anything we can do for this? … Are you sure
    there are no db's we can fetch some player images from? It even shows 'Steve Nash' with his coach
    photo … What should we do in cases like this?" — owner chose "BRef before 2015-16".
    — Cause: both photo sources were NBA.com: one "latest" headshot per person (Nash's is his Nets
    coaching photo; Kidd, Marion, Battier, Kirilenko get NBA.com's silhouette, which we reject) and
    team-season headshots, which only exist from 2015-16. Of 2,000 players with a 400-minute season
    since 2000-01, 600 had no photo; 562 of them have a Basketball-Reference headshot.
    New `courtlens acquire-bbref-portraits` (`services/bbref_portraits.py`): reads each player's
    retained Basketball-Reference page for his own headshot URL, fetches serially at the source's
    4 s pace (stops on 403/429; a rerun resumes), keeps the JPEG byte-for-byte and stores a PNG with
    the white studio background cut out (`player_portraits`, source `bbref_headshot`; no
    migration). Targets: players with a season before 2015-16 or no NBA.com photo, most career
    minutes first (954). The portrait endpoint now serves, for a season before 2015-16, the
    career photo first and NBA.com's current photo second; otherwise NBA.com team-season, then
    current, then the career photo. Portrait URLs moved to `crop=face-v3` (API and dashboard) so
    browsers drop day-old copies. Design Language's photo rule records it. Tests:
    `tests/unit/test_bbref_portraits.py` (URL extraction, cut-out keeps a white jersey, refusal
    stops the run, endpoint order). The photo is from his career, not necessarily that team or
    season. Hosted demo: needs the new portrait rows and files synced.
    Run (2026-10-20): 954 of 954 acquired, none refused, about 65 minutes at 4 s; 36 MB of cut-outs
    and 11 MB of originals. Live 2005-06 board: every one of the 24 cards has a photo (Kidd,
    Marion, Battier, Kirilenko; Nash in a Suns jersey). Evidence: `photos-2005-06-1440.png`.
16. [x] "Compared to databallr, our images are much worse/rougher around the edges … don't have the
    weird white edge artifact … they also have a better image of john stockton … they are using the
    nba.com version which is much better. So maybe if there is an nba.com result we keep it?" — owner
    chose "NBA.com first".
    — Cause: every Basketball-Reference headshot is 120x180 (NBA.com's are 1040x760), shown about 2.5x
    enlarged on a card, and the cut-out's hard mask left the outline pixels (half subject, half white
    studio) opaque: a light halo on team colours.
    Edges: `cut_out` now mattes a 2 px outline: each outline pixel takes the nearest interior colour
    and the alpha of its own mix of that colour and white. `courtlens acquire-bbref-portraits
    --recut` re-derives the PNGs from the retained JPEGs without a request (952 of 959 changed; the
    rest have no white background). Order: NBA.com's current photo now comes before the career
    photo for every season; the career photo stays the fallback for silhouettes and first for 22
    players whose only NBA.com photo is post-career (coach or staff, out of uniform), listed in
    `POST_CAREER_NBA_PHOTOS` after a review of all 617 players who have both photos (Nash, Billups,
    Avery Johnson, Redick, Prigioni, Splitter, Jason Terry, Kemba Walker…). Portrait URLs moved to
    `crop=face-v4`. Design Language's photo rule records it. Tests: outline matte, recut, endpoint
    order (Nash career photo everywhere, Duncan NBA.com for 2000-01). Live API: Duncan and Stockton
    from NBA.com for 2000-01, Nash and Kidd from Basketball-Reference without the halo. Evidence:
    `photos-2000-01-nba-first-1440.png`. Hosted demo:
    needs the re-cut portrait files and rows synced.
17. [x] "The 'Load x More' at the bottom of the cards is not showing enough. should be able to see the
    entire button" and "Padding above/below this button should be equal".
    — The page ended on the button's bottom edge. `.sc-more` repeats the page gap (`--space-4`) below
    it: 16 px above and below at 1440x900.
18. [x] "what does the 'New Badge' mean in this context?" … "That would be too large to put in the
    images. Can we have something clearer more succint." and "Why don't we put 'Blue: down from last
    season'?"
    — "New" meant "not on last season's 24-card board", so players ranked 25th and lower showed it.
    Rank changes now compare with the previous season's top 100 (`COMPARE_DEPTH`, the API's page
    limit), on the server and in every slideshow step (each step compares with that season's top
    100, not the cards on screen). The 2025-26 board: Durant ↑24, Cunningham ↑37, Adebayo ↑43; New
    is left on LaMelo Ball only. Legend: "Blue: down from last season", "New: outside last season's
    top 100".
19. [x] "Is there anything else you would suggest/recommend to improve the page past what databallr
    does" — owner: "complete all the three additions".
    — Badge hover: each badge's title names last season's rank ("Up 37: 48th in 2024-25", "New:
    outside the top 100 in 2024-25"), in the card's accessible name too (`changeText`).
    — Keys: Space plays or pauses the slideshow, ← and → step a season. Typing, a select, a focused
    button's own Space, the list's scroll area and open dialogs keep their keys. The slideshow help
    lists them.
    — Compare: the card dialog's "Add to Compare (season)" fills the shared compare tray (up to 8);
    picked cards wear a dashed accent ring and the page leaves room so the tray never covers the
    last row. The tray's Compare or Z opens Compare for that season (the duel for two, the grid for
    more). A card from another season starts a new selection. `compareHref` is shared with Stats.
    Tests: `lib/showcase.test.ts` (ranks, badge text), `showcase-card.test.tsx` (title, name),
    `e2e/showcase.spec.ts` (Space and a focused search box; two cards to the tray, the tray clears
    the last row, Z opens `/compare` with the pair and season). Live: ← and → step 2025-26 to
    2024-25 and back; Space plays and pauses; Jokić and Wembanyama open the 2025-26 duel.
20. [x] Finish: the old Basketball-Reference cut-outs no row names (951 files, 36 MB) and 2,059
    stale display copies removed from the local portrait cache; every active row's file is present.
    Browser suite: 503 passed, 3 failed outside this page (`saved-operations` passed on rerun;
    `stats-team-move-dates` expects "Index refreshed" where the committed tooltip says "Checked";
    `fo13-pages:93` finds two "Email" fields), visual baselines unchanged.
21. [x] "make the player portrait in the expanded view a little larger, and keep the team color/logo
    in the background" — the dialog header shows the card's photo treatment at 112 px (team tint and
    logo watermark, season photo) instead of the 80 px avatar.
22. [x] "remove the caption under the image. It's not providing key information." — the dialog's
    description line is gone.
23. [x] "make it so that it's an integrated component on the site, most people don't know about the
    browser small context box" — the badge's native title became a styled tooltip in the shared
    tooltip's look (`.sc-tip`, shown on hovering the badge or focusing the card, inside the photo,
    wrapping to its width); list-view rank changes use the shared `Tooltip`.
24. [x] "I think we are now finished this page" (2026-10-21) — row 9 ✅ aligned (first revision).
25. [x] "should we make default card width wider to fit longer names like antetokounmpo and shai, or
    should we stack longer names in the same card. Your call?" — stacked: wider cards drop the
    eight-a-row grid at 1440 and still clip "Giannis Antetokounmpo". Long names wrap at their spaces
    only (each word stays whole: "Shai / Gilgeous-Alexander"), every card in a row takes the row's
    height with its name strip growing, and a small-sample stat (no percentile) keeps the full cell
    height. 96-card board at 1440, 1280 and 390: no name clipped, every row's stats level.

### 17 Player Twins — ✅ aligned (first revision)

Owner start (2026-10-21): row 17 with two Databallr references (Shot Profile Twin: the twin cards,
and the Closest matches table). "databallr covers the wnba, however, courtlens is not covering the
wnba at all. So we can skip that info. So we can build out the core nba-based functionality." The
list below is the agent's replicate-then-improve proposal; owner: "Build all extras beyond databallr
that you believe would improve the page", and the agent runs the pbpstats acquisition.

Starting state (survey, 2026-10-21): `/similar-players` is the research-template TabbedPage with
Box Score (per-36 Euclidean twins within one season, `statistical_peers_service`) and Shot Profile
(`ShootingView` on `workbench_shots`, which holds two shots, so it shows nothing). pbpstats player
totals carry AtRim / ShortMidRange / LongMidRange / FG3 / FTA / FtPoints / OffPoss, but only
2025-26 is retained and the player feed caps at 500 rows.
Databallr: League (dropped here), Season, Player and Match pool (Cross / Same / All, All seasons);
"Shot Profile Twin" with the selected player-season and the #1 twin side by side (photo, team,
Selected / match badge, PTS, TS%), FT / RIM / MID / 3P blocks of VOL (attempts per 100 offensive
possessions) and EFF bars diverging from the possession-weighted league-season average with a LG AVG
column; Closest matches table (rank, player-season, Match, relative VOL / EFF per zone; a row click
compares from that player-season); "Similarity equally weights each available league-season
standardized dimension. At least six of eight dimensions must overlap."

Instructions (owner, 2026-10-21; "replicate Databallr, then improve", NBA only):
1. [x] Console: a ‹ season › stepper over the seasons on file (read from the data), Player search,
   Match pool Same season / All seasons. All state in the URL.
   — Two consoles as on Showcase: Shot Profile / Box Score, a ‹ season › stepper over the bundle's
   seasons (1996-97 to 2025-26; nothing hard-coded), Player search over that season's roster;
   Same / All Seasons with a from–to range, possession floor, Own Seasons / Others Only. URL:
   `mode=`, `season=`, `playerId=`, `pool=`, `from=`, `to=`, `minPoss=`, `own=`, `vs=`, `rows=`.
   A season the player didn't play falls back to that season's busiest player and says so.
2. [x] Header and twin cards: "Shot Profile Twin" header; the selected player-season beside the
   #1 match (season photo `era`, team, Selected / match badge, PTS, TS%); FT / RIM / MID / 3P blocks
   of VOL and EFF bars diverging from the league average, LG AVG column, footnote.
   — Eyebrow "NBA · Shot Profile", wordmark and blurb; round season photos with the team logo;
   bars sized by the standardized value (three SDs fill a side), volume blue, efficiency green or
   red, the value on the far side of the centre. Live 2025-26 LeBron James reproduces Databallr's
   card exactly (FT 7.8 / 4.7, 73.7% / 78.3%; rim 8.4, 75.5%; mid 8.3, 41.5%; 3P 6.0, 31.7%) and
   the same #1 twin, 2023-24 Jonathan Kuminga (98.4%).
3. [x] Closest matches: Stats-look table (rank, player-season with photo, Match, relative VOL / EFF
   per zone); a row click puts that player-season on the right card; Load More.
   — Group labels measured 0 px off their two columns; the twin's row is marked; Load 12 More up to
   96. Players with only pre-2000 seasons often show initials (no portrait on file; the
   Basketball-Reference portrait backfill covered seasons from 2000-01).
4. [x] Method: eight league-season-standardized dimensions, equal weights, at least six of eight
   overlapping, a minimum of offensive possessions; regular season.
   — `domain/player_twins.py`: league average pooled over every player in the season
   (possession-weighted rates, attempt-weighted percentages); z-scores within each season among
   500+ possession player-seasons (fixed, so the visitor's floor never moves a distance);
   percentages need 20 attempts; RMS distance over shared measures, six of eight required;
   Match = 100 − 10 × distance. Default floor 1,000 offensive possessions.
5. [x] Data: pbpstats per-team player totals for every season on pbpstats (2000-01 on), at the
   existing 5 s pace, and a zone-totals serving read.
   — `courtlens acquire-shot-zones` (`services/shot_zones.py`): 900 team-season requests
   (1996-97, pbpstats' first season, to 2025-26), each retained; resumable; seals
   `data/derived/shot-zones-v1/<sha>.json` (6.5 MB, `shot_zones_manifest`) only when complete.
   Traded players' team rows are summed; a team-season returned twice is refused. Three read
   timeouts on 2026-10-21 were resumed without refetching. Mid-range = short + long mid-range.
   Hosted demo: needs the bundle synced (it lives under `data/`).
6. [x] Improvement: Box Score mode — today's per-36 box-score twins in the same cards and table.
   — Cross-season, from the same bundle: PTS and TS%, AST and TOV, OREB and DREB, STL and BLK per 100
   offensive (defensive for DREB, STL, BLK) possessions. The old per-36 single-season page and its
   Shot Profile tab are gone; `/similar-players/shot-profile` and `/shot-profile-twin` redirect.
7. [x] Improvement: pool filters — season range, minimum possessions, exclude the player's own
   seasons.
   — Range selects disable on Same Season; the table header states the pool and how many
   player-seasons qualify (10,045 for all seasons at 1,000+).
8. [x] Improvement: each match row shows the zones driving the distance, and a Compare link for the
   pair.
   — Biggest Gap names the furthest measure and its size in SDs (tooltip in words); each row has
   "show beside" (keyboard path to the twin card) and Compare, which opens `/compare` with
   `playerA`/`seasonA` and `playerB`/`seasonB`.

Follow-up instructions (owner, 2026-10-21):
9. [x] "can you put percent sign after the number match '95.8 Match'." — the twin card's badge
   reads "95.8% Match" (its tooltip "95.8% match over 8 of 8 shared measures").
10. [ ] "I want to fill in the gaps where possible" (photos). After the owner's Basketball-Reference
    history crawl and its photo step finish (not before 2026-10-21 ~9:30 PM EDT; never start or
    touch that crawl): count the players in the twins data (and Stats seasons) still without any
    active portrait, then fill what free sources allow, Wikimedia Commons first (license and
    source recorded per photo, labelled as such), initials for the rest. Confirmed gaps today:
    LaPhonso Ellis (`ellisla01`) and Chris Gatling (`gatlich01`) have no NBA.com photo
    (silhouette) and no Basketball-Reference headshot; Ike Austin and Isaiah Rider have no
    Basketball-Reference profile on file yet.
11. [x] "remove this weird 2 yellow lines around the column" — the selected match row's accent
    edges.
    — The selected row's inset accent edges are gone; the name stays gold.
12. [x] "we add an option to compare it to the players position match instead of simply a general
    match."
    — Any Position / "<pos> Only" under the player (`position=same`). A season with an estimate
    (CourtLens' Stats estimate, 2000-01 on) matches only the identical estimate; a season before
    2000-01 uses NBA.com's listed position and matches its G/F/C group (shown with *). LeBron
    2025-26: 1,995 SF player-seasons qualify; Kuminga stays #1.
13. [x] "courtlens wordmark should be in courtlens color + remove the verbose captioning under the
    wordmark, it doesn't have any purpose"
    — Gold (`--color-accent`, as on Showcase's banner), 18 px; the caption is removed.
14. [x] "Indicate the positions of the players. I feel like we are lacking this for a number of
    different pages under 'Players'" (with the Players menu: Last X Games, Showcase, Player Twins,
    Player Directory).
    — Player Twins: a position badge on both cards, in each match row and in the player search.
    Showcase: a position badge at the photo's bottom right and "TEAM · POS" in the player
    dialog. Last X Games: "DEN · C" under the name (the game log API now returns the season's
    estimated position). Player Directory: "TOR · SG" like the Stats table. All are the Stats
    page's estimated positions.
16. [x] "use team color themed circles. Also, make sure the photo used is from the season
    highlighted. We should be using the 2012-13 anthony davis photo here, if he has one
    available."
    — Both avatars take that season's team colour as ring and backing (`teamBrandColor`, era
    colours included: 2012-13 Hornets teal). No 2012-13 Davis photo exists: NBA.com's season
    headshots start in 2015-16 (2012-14 URLs answer 403) and Basketball-Reference has one
    career photo. The portrait endpoint now gives a pre-2015-16 season the player's nearest
    season photo with the same franchise (era codes resolve: NOH → Pelicans), so Davis shows in
    his 2015-16 Pelicans photo instead of his current Dallas one; site-wide (Design Language,
    Identity). Different franchise → unchanged. Portrait URLs moved to `crop=face-v5`.
    Tests: `tests/unit/test_season_portraits.py`.
15. [x] "like we've pretty much comprehensively implemented this page do you have any suggestions
    recommendations for additions to make improve the page over the databallr baseline?"
    — Proposed (2026-10-21): career twin strip; "what came next"; measure weights; a percentile
    per bar; a combined shot + box mode; a twin map. 17–22 build them.
17. [x] "You can build all of those out." — Career twins: a strip of every season the player has in
    the data, each with its nearest *other* player under the current pool rules (seasons, floor,
    position, weights; Same Season means that season only). Selecting a card opens that season.
18. [x] What came next — each match row's Next Season cell (the twin's following season, PTS per
    game change, tooltip with TS% and games), both cards' "Next season" line, and a summary under
    the table (how many shown twins have a next season on record, median PTS/G and TS% change,
    beside the player's own next season when recorded). Missing is unknown and says why ("not in
    the data yet" or "no 2013-14 record"), never retired or zero; labelled "a record of what
    happened, not a forecast".
19. [x] Measure weights — a Measure Weights disclosure under the consoles: Off / ½× / 1× / 2× per
    measure (`w=ft_vol:0,three_vol:2`), Equal Weights resets. Distance becomes the weighted RMS
    over shared weighted measures; the overlap floor is three quarters of the weighted measures
    (6 of 8, 12 of 16, 5 of 6). The last weighted measure can't be turned off; an all-off
    request is a 422. Off measures dim in the cards and the table.
20. [x] Percentile per bar — a PCTL column in each group: the season's rank among player-seasons
    with 500+ offensive possessions (the standardization pool), ties counted half.
21. [x] Combined mode — "Combined" in the profile switch (`mode=all`): all 16 measures, eight
    groups, 12 of 16 shared to qualify. Davis 2012-13's combined #1 is Derrick Favors 2013-14.
22. [x] Twin map — the season's player-seasons (at the pool's possession floor) on the first two
    principal components of the weighted z-scores, fitted on the season's 500+ pool, equal
    scale on both axes; shown twins (any season) on the same axes, numbered by rank, the current
    twin ringed gold; the player in gold. Whole Season / Zoom to Twins. Hover names a point;
    a twin opens beside the player, another dot opens its twins. Axis notes name the top
    loadings and share of spread, and say a 2-D distance is a summary, not the match.
    Ranking moved to one NumPy pass (`Index`/`Ranking`; same order and distances as pairwise
    `compare`, tested), so a request with the career strip takes ~0.05–0.35 s.
23. [x] "I selected 2009-10 lebron whose comp is luka doncic. Why doesn't the comp show luka
    doncic?" — The strip leaves out the player's own seasons; the panel follows Own Seasons /
    Others Only (default Own Seasons, so LeBron 2008-09 is #1 at 98.3%). A career card now opens
    its season with that twin beside the player (`vs`), so the panel shows the card's twin
    (Luka 2019-20, #5 Match, 95.2%), and the caption says own seasons are left out.
24. [x] "It chose lebron's sixers photo instead of his 2010-11 photo?" — No 2010-11 Heat photo
    existed: NBA.com's season photos start in 2015-16 (he left Miami in 2014) and none was with
    the Heat franchise, so the current photo showed, and the 2026-27 release has him on the 76ers.
    Owner chose (2026-10-21): the nearest season's photo (any team) when the franchise has none
    (LeBron 2010-11: 2015-16 Cavaliers), and a Wikimedia Commons acquisition for team-era photos.
    Crop version `face-v6`.
25. [x] Wikimedia Commons team-era photos (`courtlens acquire-commons-portraits`, the `photos`
    extra; `services/commons_portraits.py`). Each pre-2015-16 player-franchise era (SuperSonics
    and Thunder apart) searches `"<player>" <nickname>`; a file qualifies with a free licence
    (CC BY, CC BY-SA, CC0, public domain), the team and the player's surname in its text, no
    All-Star/Olympic/national-team words, and a full date inside one of the era's seasons (the
    photo's season). OpenCV YuNet finds the faces and SFace keeps the one matching the player's
    own NBA.com/Basketball-Reference headshot (cosine >= 0.45, 0.15 clear of any other face, 100px
    wide), so a teammate, opponent or fan is never shown as him; then a head-and-shoulders square
    (<= 576px JPEG). Rows carry author, licence and file page; Methodology lists them under Photo
    credits (`/api/workbench/portrait-credits`). Resumable (each era season ends active or
    missing); 1 request a second. Trial: LeBron 2010-11 Heat (Keith Allison, CC BY-SA 2.0),
    2012-13 Heat, 2007-08/2009-10/2014-15 Cavaliers; Durant, Iverson, Ray Allen, Chris Paul,
    Deron Williams eras all correct by eye. Hosted demo: needs the new portrait rows and
    `data/cache/portraits` files synced.
    Full run (2026-10-21, ~3 h, 4,020 eras): 762 season photos for 450 players, mostly 2007-08 to
    2014-15 (Commons' Flickr era; 2010-11 leads with 153); 5,411 era seasons without a usable
    match; 1,079 eras skipped for want of any headshot to match against (older players; a rerun
    after the owner's photo step picks them up); 1 transient error left for a rerun. A random
    36-photo sample was the named player in every case by eye.
31. [x] "Yes, uniform photos" (owner, 2026-10-21, after some Commons photos showed players in
    t-shirts, warm-ups or at events). Two checks now gate a Commons photo: its title and
    description name no off-court setting (`OFF_COURT`: press conference, parade, signing,
    party, visit, charity, practice, ceremony…), and the photo shows bare upper arms in his skin
    tone beside and below the face (`bare_arm_share` >= 0.15, chroma in YCbCr; a sleeveless
    jersey), else the next candidate is tried (six per season). Applied to the 762 stored
    photos: 19 failed the text check and 179 the arm check; their rows and files were removed
    and their seasons searched again (38 uniform replacements). Now 602 photos for 378 players.
    A random 40 by eye: about 37 in game uniform; a few still pass with covered arms where the
    arm region picks up hardwood or a neighbour's skin.
26. [x] "should we have a toggle on the table to switch from tables that include the player
    themself, and only other players? And should the table also have a year label." — The
    own-seasons switch moved from the pool console to the table header ("With <player>" /
    "Other Players Only", same `own=exclude`); the title names the target ("Closest Matches to
    2025-26 Amen Thompson"); a Season column follows the player (team · position stay under
    the name). Columns narrowed so the table fits 1100px exactly at 1440.
27. [x] "You can put the team logo next to the full name" — each card's name is followed by that
    season's team logo (era logos included); the photo keeps its corner badge.
28. [x] "all players should be searchable … when you press that player it returns their most
    recent season or … some type of clever UI UX" — the player search covers every player in the
    data (`/api/workbench/player-twins/players`, loaded once). The selected season's players come
    first and keep that season ("1999-00 · LAL · SG · …"); everyone else follows by latest season
    and opens there ("Opens 2015-16 · LAL · 1996-97 to 2015-16"). Wembanyama searched from
    1999-00 opens 2025-26.
29. [x] "There is a lot of grey caption text on the page around tables and graphs. Can we minimize
    this." — Gone: both cards' footnotes, "Select a row…", the method paragraph, the Career
    Twins sentence, the map's subtitle and axis paragraph. Their content sits behind an info
    button beside each heading (bars, matches, career twins, map). Kept: the pool line over the
    table and a one-line source credit. What Came Next is one line ("Next season · 11 of 12 twins
    on record · median +1.5 PTS, +1.2 TS% · Scottie Barnes −1.2 PTS, +5.4 TS%"; "not a forecast"
    on hover); the table's column reads "Next".
30. [x] "The Twin Map is a little unclear, can we make it a little more conspicuous." — Opens on
    a Twins Close-Up (Whole Season one click away; the close-up spans at least 1.6 units so a
    tight cluster keeps context); a line joins the player to each numbered twin; the closest three
    are named ("Flagg 2025-26"); each edge says in plain words what that direction means, from
    the axis's two strongest measures ("More rim attempts, fewer threes" / "Fewer rim attempts,
    more threes"); the legend is three short keys.

Verification (2026-10-21): live (owner's :3100 on the sealed bundle) 1440 and 390, Shot and Box:
no overflow, no browser errors. Ruff, mypy, dashboard lint and typecheck clean; pytest 2,238
passed (new `tests/unit/test_player_twins.py`); Vitest 618/618 (new `lib/player-twins.test.ts`;
`make test` still exits 1 on the 4 known header.test.tsx AbortErrors). Playwright on the mock
(real captured answers, `e2e/fixtures/player-twins-v1.json`): new `e2e/player-twins.spec.ts` 5/5;
full suite 493 passed, 7 failed: fixed and re-run green, `entity-selection` (similarity picker
gone), `route-polish:21` (passes alone; aftermath date race under load) and the operation-gallery
phone baseline (7 cards now); not this page, `stats-team-move-dates:4` and `fo13-pages` 47/93/112
(two "Email" fields on /planner). Removed the shot-profile and similar-players first-load
baselines; the Shot Profile tab's ShootingView tests went with it (aftermath keeps ShootingView).

Verification of 17–22 (2026-10-21): pytest 2,248 passed (6 new in `test_player_twins.py`:
weights, vector ranking equals pairwise compare, combined, percentile, next season and map axes,
the view end to end); Vitest 622/622; ruff, mypy, lint and typecheck clean. The fixture was
recaptured from the real API (Shot, picked row, Box, Combined, one weighting). Playwright:
`player-twins.spec.ts` 7/7 (new: Combined + weights; percentiles, next, career, map + zoom);
full suite 500 passed, 1 failed (known `stats-team-move-dates:4`). Live :8000 serves the new
fields.

Data-blocked: none (WNBA out of scope).
Evidence: docs/evidence/alignment/similar-players/

### 22 Player Dashboard — ✅ aligned (first revision)

Owner start (2026-10-21): "The 'Player Directory' is similar to databallr's 'Player Dashboard' page
where there is a slideshow of player cards, that you can select, and pit players against each other
in a more compact view." Last page of the Players menu (Last X Games, Showcase, Player Twins done).
The list below is the agent's replicate-then-improve proposal. Owner approved it on 2026-10-21:
backfill NBA tracking as far back as the free mirror goes; write CourtLens formulas for Databallr's
undefined metrics (drop any not derivable); build all extras (8–10).

Starting state (survey, 2026-10-21): `/players` renders `StatsWorkspace` with a six-column
`PlayerDirectory` table (GP, MPG, PPG, RPG, APG, TS%), a name search and a team filter, which the
Stats table already covers. Databallr: title + ‹ season › stepper + Team filter; "Top 50 DARKO DPM"
card carousel (rank, DPM, season photo on a team-colour card); "Search from N players…" with a
palette toggle and favourites; up to N compact panels (photo, position, share / favourite / swap /
close; season, RS/PO, Advanced, Rate; DARKO O/D/DPM, MP, 3-year O/D/RAPM; six-factor impact
oTS/oTOV/oREB and dTS/dTOV/dREB with dots; Scoring, ORB, Playmaking; Playtypes freq + rTS for
Creation / Spacing / Transition / Finishing; Contesting, DRB, D-Playmaking; percentile bar under
every value); swapping two panels adds a head-to-head panel showing each difference coloured by
the leader with the leader's name; an Add Player slot ("Press 1").

Data survey: on file for every season with impact data: DPM family, MIN, 1/2/3-year RAPM, six
factors (o_ts … d_reb), rTS, 3PR, 3P%, FTR, self-miss / teammate-miss ORB%, bad-pass turnovers,
rim assists, cTOV%, STL, BLK, DRB%, foul frequency, charges. NBA tracking (hoopR mirror, admitted
2023-24 to 2025-26 only): potential assists, on-ball %, defended FGA and DIFF (overall and under
6 ft), hustle deflections and loose balls, Synergy play types.

Instructions (proposal approved by the owner, 2026-10-21):
1. [x] Page: "Player Dashboard", ‹ season › stepper over seasons on file, Team filter; all state in
   the URL. The Player Directory table goes away; header search still finds anyone.
   — `/players` (`components/player-dashboard-view.tsx`, `lib/player-dashboard.ts`). Menu label
   "Player Dashboard", not the proposed "Dashboard": the player page's back button and the command
   palette name it too, and a bare "Dashboard" read as the player page. URL: `season=`, `teamId=`
   (the shared Select Team), `p=<id>.<season>.<rs|po>[.b][g]` joined by `_` (dots and underscores
   survive URLSearchParams unencoded), `vs=<a>.<b>`. Opens on the latest season with 30+ days of
   regular-season games (2025-26 while 2026-27 is a day old). `PlayerDirectory` and the Stats
   workspace's `/players` branch are deleted; its two Playwright tests went with it.
2. [x] Carousel: Top 50 DARKO DPM for the season (Team filter narrows it): season photo on a team-
   colour card with rank and DPM; arrows scroll; clicking a card adds that player.
   — 400+ minutes as Databallr (the floor drops when a team is chosen); a card already on the page
   is ringed; cards disable at four panels.
3. [x] Search adds a panel. Favourites wait for accounts; the palette toggle is dropped.
   — "Search <season> Players…" (LookupInput over the season); key 1 focuses it from anywhere.
4. [x] Panels: DARKO, MP, RAPM; six-factor impact with dots; Scoring / ORB / Playmaking; Play
   Types; Contesting / DRB / D-Playmaking; percentile bar and number under each value. Per-panel
   season (the player's own seasons), RS/PO, Advanced (else a Basic box-score view) and Per 36 /
   Per Game; copy link and close; up to four panels; Add Player slot with key 1.
   — Bars use the Stats percentile scale (gold high → gray → blue low), never red/green (Design
   Language). RAPM shows the longest window on file (3, 2 or 1 year) and says which.
5. [x] Head-to-head: swap on two panels opens Databallr's comparison panel; each value is the
   leader's margin in their identity colour (A gold, B blue) with their surname beneath; a third
   swap replaces the older pick; closing a panel shifts or ends the pair.
   — Play types compare possession share and rPPP per family (Synergy has no FTA, so no TSA/TS).
6. [x] Definitions in every tooltip. Databallr's undefined metrics:
   — ASTEFG = points created by assists ÷ (2 × potential assists); PA/1M = potential assists per
   minute of possession (both CourtLens formulas, said so in the tooltip). SHOTS → Offensive Load
   (LOAD), sTOV% → cTOV%, PASSTOV → AST: each a defined catalog stat in that slot, labelled with
   its own name. STOP% and rFTOV are dropped (no derivation with a league percentile); the second
   D-Playmaking row is CONTEST, OFFD, LBALLS and the DRB column adds DREB. Play-type efficiency
   is rPPP (points per 100 above the league's rate for that family; Synergy has no FTA, so no TS).
   Families as Databallr: Creation = isolation + P&R ball handler + post-up; Spacing = spot-up +
   off-screen + handoff; Transition; Finishing = cut + roll man + putbacks.
6b. [x] Backfill hoopR tracking, defense, hustle and Synergy to their first seasons.
   — `courtlens acquire-stats-feeds --no-pbpstats` for 2013-14 to 2022-23 (reports in
   `data/logs/stats-feeds-backfill-*.json`): tracking and defense from 2013-14, hustle and play
   types from 2015-16 (the mirror has nothing earlier). The mirror's isolation files declare only
   the start year ("2016"); admission now accepts that for play types as for matchups, proven by
   every row's SEASON_ID (`START_YEAR_ENDPOINTS`, test updated). Still rejected by design: 2013-14
   and 2017-18 regular-season defense (one traded player listed twice under one team ID) and the
   mirror's mislabelled lineup files (not used here). `mart_stats_player_defense` read only the
   overall columns, so every zone category (under 6 ft, threes …) was null, on the Defense page
   too; it now coalesces each zone's own columns.
7. [x] Seasons without a feed show "—" with a note naming the feed and its first season; seasons
   before 2023-24 note that RAPM, six factors and the play-by-play rates start in 2023-24.
8. [x] Panels for any season on file (2000-01 onward in the Stats release; DARKO and box score
   throughout, tracking from 2013-14, impact from 2023-24). Box-score panels before 2000-01 wait
   for the full-history Stats data (FH02).
9. [x] The name opens the player page; icons open Player Twins and Player Comparison; the
   head-to-head opens both players in Player Comparison.
10. [x] Each value's tooltip names its percentile cohort and size ("74th percentile among 412
    qualified players (500+ season minutes)"; tracking: "… 380 players with 500+ tracked
    minutes").

Data-blocked: STOP%, rFTOV (dropped); Databallr's exact SHOTS / sTOV% / PASSTOV definitions
(stand-ins above); play-type TS (Synergy has no FTA).
Evidence: docs/evidence/alignment/player-dashboard/


Round 2 (owner, 2026-10-21): "On databallr the player carousel/slideshow is perpetual motion sliding
through all the players (not scrollable) moving from right to left. And when you hover over a player
the slideshow stops and gives you a small hover state of info on the player card." "Make our cards
much bigger similar to databallr's size." "Our compact cards are a little worse compared to
databallr's … improvements to coloring/segmentation."

1. [x] Carousel is a right-to-left marquee (two copies, the second `inert` and `aria-hidden`); hover
   or focus pauses it; a strip that fits the width stands still. Reduced motion: no drift, the
   strip scrolls instead. Arrow buttons removed.
2. [x] Cards 148px wide (phone 120px), 3:4 photo with the name over a bottom fade; hover/focus
   overlay shows name, DPM rank, DPM, team and "Click to add".
3. [x] Panels: slate `--color-table-lift` body, brighter group strips, hairlines between groups,
   16px values, 4px bars on a visible track, six-factor and play types in inset wells,
   team-colour avatar ring and position badge; head-to-head play types as one well with dividers.

Round 3 (owner, 2026-10-23): "add the player's team logo behind their picture like in databallr";
in the head-to-head "add the team logo + name like databallr has in the comparison. Also remove that
weird 'Each value…' caption text … make sure the 2 players take up the top part of the card …
for some reason the 6-factor impact stats are null".

1. [x] Panel avatar: the season team's logo (`TeamWatermark`) behind the headshot inside the
   team-colour ring.
2. [x] Head-to-head top row holds only the two players, each with team logo and code under the
   name. The second row, as Databallr's, carries each side's season · phase (identity colours),
   Per 36 / Per Game and the compare / close actions. The "Each value is the leader's margin"
   caption is gone; the surname under every value already says who leads.
3. [x] Six factors: not a page bug. The one-season impact fit has no row for Jayson Tatum in
   2025-26 (16 games, 522 minutes), so his o_ts … d_reb are null in the release while his 2- and
   3-year RAPM exist. The head-to-head now names whoever has no six-factor estimate.

Round 4 (owner, 2026-10-23): "The comparison card doesn't have the colored ring / team logo bg";
Databallr's "flashing animation once you press the start comparison button on one of the cards
where it will start flashing the start comparison button on another card in a different color blue
and highlight the outer buttons".

1. [x] `RingPhoto` (team logo behind the headshot in a team-colour ring) is shared by the panels
   and the head-to-head header.
2. [x] Pairing: the first swap press makes that panel side A (gold border, gold pressed swap); every
   other panel holds a solid blue border and only its swap button pulses blue (kit `IconButton`
   `identity` + `beckon`, added to control kit v1). Owner follow-up: "all cards have a solid border
   then the comparison buttons starts to smoothly flash". Once paired, A stays gold and B blue.
   Reduced motion holds a still blue ring on the button.

Round 5 (owner, 2026-10-24): "You shouldn't be able to add the same card twice. Are there any edge
cases and common sense changes … we should consider."

1. [x] One card per player, season and phase (`samePanel` / `findPanel`); the same player in another
   season or phase is still a new card. Picking a shown card from the carousel or search scrolls to
   and flashes it instead of adding it (the carousel card says "Already added · Click to view").
2. [x] A panel's season options and RS/PO chip that would duplicate another panel are disabled
   ("· on another panel"). A link with repeated cards keeps the first copy and the URL is rewritten
   to the cards shown.
3. [x] Head-to-head labels add the season (then the phase) when both sides share a surname
   ("Tatum 24-25" / "Tatum 25-26"). Esc cancels a half-made pair; with one panel the note says to
   add another player.
4. [x] Owner left the open questions to the agent ("use your best judgement"): the head-to-head has
   its own Per 36 / Per Game chip (`vr=g|36`, starting from side A's panel; dropped when the pair
   closes), so both players always share one rate. A fresh pairing scrolls to the head-to-head once
   both sides load (not on a reload). Search stays enabled with four panels: a shown player is
   jumped to, a new one gets "Up to 4 players: close a panel to add another."

Round 6 (owner, 2026-10-24): "databallr also has hover info containers when you hover over any of
the stats."

1. [x] New shared `HoverCard` (`components/ui/hover-card.tsx`): portalled to document.body, placed
   below the stat (above when there is no room) and kept inside the viewport; opens after 250 ms on
   hover and at once on keyboard focus; Esc, leaving, blur, scroll and resize close it.
2. [x] Every panel stat: "Dashboard stat" eyebrow, rate pill on counting stats, name, definition,
   and a note with the player, season and value, the rate basis ("Per 36 minutes across 2.4k
   minutes") and the percentile cohort. Six factors: name, plain reading, and a Method note (unit,
   one-season ridge fit, display floor, not additive to RAPM, not causal). Play types: family
   definition, Freq and rPPP with percentile. Head-to-head cells: both players' values and the lead.
3. [x] Correction: six-factor tooltips said "points per 100 possessions"; the contract
   (impact-ratings-v1) reports percentage points of the team's rate. The cards say so.

Round 7 (owner, 2026-10-24): "Can we make the photos in the cards larger like in databallr".

1. [x] Panel avatar 60 → 76 px (portrait `lg`, sharp at 2×), position badge 22 px, name at
   `--text-2xl`; head-to-head photos 44 → 56 px.
2. [x] Header as Databallr: the actions float at the top right inside the name block, so a long name
   wraps beside them and continues full width below; names never split mid-word.

Owner approval (2026-10-25): approved as a first revision when asked whether row 22 should be marked ✅.

### 7 Live — 👀 ready for review

Owner start (2026-10-27): "Let's work on the pages under 'Live'." Owner screenshots of Databallr's
Live page and of X's game summary: "we can also draw inspiration from [X] (note this is in a
smaller sidebar of the X site, ours would occupy a full page)."

Databallr (`/live/<date>`, owner screenshots 2026-10-27): the Live menu holds Live ("Live NBA scores
and box scores") and Playoffs. A centred seven-day strip (month over day, selected day in a gold
box, ‹ › arrows), a "Tip: Press 1-9 to open a game. In detail view, 1-9 jumps between games." hint,
and a four-across grid of game cards: status or tipoff time ("FINAL", "8:00 PM EDT"), a hotkey
badge, spread and O/U chips before tipoff, a chevron; per team logo, abbreviation, record, injury
count ("2 OUT") and score, the winner bold with a marker. Game view: a banner with All Games, status,
logos, abbreviations and scores (loser dimmed), a hotkey badge; tabs Box Score / Play-by-Play /
Pre-Game with a hotkey legend (Q, W, Esc, Tab, Shift+Tab). Box Score: both teams side by side (Press
Q / W), PLAYER, MIN (m:ss), PTS, TS% (coloured high / low), REB (OFF), AST, STL, BLK, PF, TO, 2P,
3PT, +/-; Recent Plays under it with "View all plays". Play-by-Play: search, "549 of 549 plays",
All / Q1–Q4 / OT chips, rows of clock, team logo, score with the scoring side lit, description,
scoring plays bold with a gold edge. Pre-Game: Injury Report per team (position, name, Out badge;
"No injuries reported") and Betting Lines (spread, moneyline, total and a per-book table). A fixed
All Games rail at the bottom (numbered mini cards, the open game outlined).

X game summary (owner screenshots 2026-10-27): Stats / Plays tabs; a period line score with totals;
a shot chart (All / 1–4 periods, made dots and missed crosses per team colour, team FG counts);
team stats as paired bars (FG, 3P, FT with makes-attempts, rebounds, assists, steals, blocks,
turnovers, points in the paint, fast-break points); a per-team box score split into Starters and
Bench (name, position, MIN, PTS, FG, 3PT, FT, REB…; DNP rows as dashes; a Team row); Game
Leaders (points, rebounds, assists with photos, both teams); When / Where / Watch.

Sources (survey 2026-10-27): ESPN's free summary, already the Live provider's game read, carries
plays (561 for MIN–CLE, every field-goal attempt with court coordinates), period line scores,
starters and positions, team stats (paint, fast-break, largest lead, lead changes), leaders,
injuries, venue, broadcasts and one sportsbook line (DraftKings). Databallr's per-book odds table
has no free source.

Instructions (owner, 2026-10-27):
1. [x] Replicate Databallr's Live page (date strip, game cards, game view with Box Score /
   Play-by-Play / Pre-Game, All Games rail, hotkeys), drawing on X's game summary for a full-page
   game view. — See "Done" below.

Owner decisions (2026-10-27, on the agent's proposals):
- Game view: tabs **Summary / Box Score / Play-by-Play / Pre-Game**. Summary (the default) holds
  X's pieces: line score, shot chart, team stat bars, game leaders, When / Where / Watch. Box
  Score is Databallr's side-by-side table, split into Starters and Bench as on X.
- Betting: the one free line (DraftKings via ESPN) as Databallr's spread / moneyline / total
  tiles, labelled with the book, and spread / O/U chips on upcoming cards. No per-book table.
- Menu: as on Databallr, the Live menu holds **Live** and **Playoffs** (owner screenshot of
  Databallr's menu with descriptions). Finals merges into Live: past dates show final games and
  open the same game view; the Live / Finals / Playoffs route tabs go.
- Scope: Live first; Playoffs (row 8) after the owner reviews Live.
- Source: **the API reads ESPN on demand**, like Databallr's "backend live cache". Opening a date
  or game fetches ESPN when the cached copy is stale (seconds for games in progress; a final game
  is fetched once and kept). No worker, opt-in flag, leases or seven-day limit; works on the hosted
  demo. Hashed, append-only storage stays. This retires the lease machinery and revises
  `docs/design/shared-live-v1.md`.

Done (instruction 1, 2026-10-27):
- Source (`docs/design/shared-live-v2.md`): `GET /api/live` and `GET /api/live/games/{id}` read
  ESPN when the cached copy is stale (20 s in progress, 60 s near tipoff, 10 min upcoming, never
  once final), one shared fetch per resource. Finals are appended as hashed evidence; in-progress
  reads only replace the new mutable `live_current` row. Migration `19b810a4f017` drops the
  leases and worker state; the worker's Live thread, `COURTLENS_LIVE_ENABLED`, the lease
  endpoints and the B31/B32 lease verification scripts are gone. Parser `espn-live-v4` adds
  records, line scores, the season calendar, starters, positions, DNP reasons, team totals,
  plays with court spots, leaders, injuries, the line and venue / attendance / officials /
  broadcasts. Players map to NBA IDs (crosswalk, sealed ESPN rosters, unique name): all 28 in
  MIN–CLE 2026-10-26. ESPN's per-play running score lags (one free throw moved it 120 → 123), so
  plays carry the scoring-play sums when those reach the final.
- Menu: Live ("Live NBA scores, box scores and play-by-play") and Playoffs, with icons. The Finals
  entry, the Live / Finals / Playoffs route tabs and the Finals breadcrumb are gone; Playoffs keeps
  its own title.
- Board: Databallr's centred seven-day strip (gold box on the open day, today in gold, days the
  season calendar has no games dimmed), a date picker for older dates, the hotkey tip, and a
  four-across card grid in a 1,088 px column: status or tipoff ("8:00 PM EDT"), HK badge, spread
  and O/U chips before tipoff, logo, code, record, "n OUT", score, winner bold with a marker and
  the loser dimmed. An empty landing day opens the nearest earlier game date (else the next);
  explicit dates stay put. This replaces the PC first-load "Top performers" / "Next games" panel.
- Game view: Databallr's banner (All Games, status, logos, scores with the loser dimmed, hotkey)
  and tabs Summary / Box Score / Play-by-Play / Pre-Game with the hotkey legend; the tab is in
  the URL (`?tab=`). Summary (X): line score with OT, Game Leaders (points, rebounds, assists with
  season photos), a full-court shot chart (period filter, made dots and missed crosses in team
  colours, plotted makes-attempts), Team Stats as split bars (FG, 3P, FT with decimals from makes
  and attempts, rebounds, assists, steals, blocks, turnovers, paint, fast break, largest lead) and
  Game Info (when, where, watch, attendance, officials). Box Score: both teams side by side
  ("Press Q / W"), Starters and Bench, MIN, PTS, TS% (gold ≥ 60, blue < 52), REB (OFF), AST, STL,
  BLK, PF, TO, 2P, 3PT, FT, +/- (green / red), DNP rows with ESPN's reason, a gold Team total, then
  Recent Plays with "View all plays". Play-by-Play: search, "n of N plays", All / Q1–Q4 / OT
  chips, newest first, scoring plays bold with a gold edge and the scoring side's score lit.
  Pre-Game: Injury Report per team (position, name, injury, Out badge, "No injuries reported")
  and Betting Lines as Databallr's spread / moneyline / total tiles, labelled "DraftKings via
  ESPN… Market prices, not a CourtLens forecast".
- All Games rail pinned to the bottom of the viewport, numbered mini cards, the open game outlined.
- Hotkeys: 1–9 open or jump between games; Esc back to All Games; Q / W focus the away / home box
  (switching to Box Score); Tab / Shift+Tab cycle the views only while nothing is focused, so
  keyboard focus still moves normally.
- Verified 2026-10-27: ruff, mypy, pytest (2,321 passed; `tests/unit/test_live.py`,
  `tests/integration/test_live_postgres.py` on a disposable PostgreSQL), dashboard lint,
  typecheck, Vitest (668), `e2e/live.spec.ts` (13, on real ESPN reads saved as fixtures) and the
  FO14 phone-target check; no page overflow at 1920, 1440 or 390 px. Full browser suite: 491
  passed; the remaining failures predate Live (Stats move dates, PC12 directory and FO06 recent-games
  baselines) or come from the uncommitted Player Dashboard work, plus the `playoffs bracket`
  baselines, which differ only because the Live / Finals / Playoffs tabs are gone (not refreshed). The old Live visual baselines
  (`live-finals-*`, `first-load-live-*`) were removed; Live gets new ones once approved.

Data-blocked: Databallr's per-book odds table (no free multi-book source); minutes as m:ss
(ESPN gives whole minutes; NBA.com's live CDN refuses this machine). Shot counts come from the
plays with a court spot, which can differ from the box by an attempt or two (CLE 46-104 vs
46-102 on 2026-10-26).

Evidence: docs/evidence/alignment/live/

Follow-ups (owner, 2026-10-27):
2. [x] "Make the date picker squares a little larger, they are a little small, and give them
   slightly more interior padding." — 52 × 56 px days (were 40 × 40) with 4 px padding, larger
   month and day type; 40 × 52 on phones.
3. [x] "Then make the game containers slightly larger." — 16 px padding (20 at the foot), 32 px
   logos, 40 px team rows, larger codes, records and scores (263 × 164 px at 1440).
4. [x] "For some reason the number beside \"HK\" is not center or bottom aligned with it (it seems
   raised)." — Why: the number was a monospace `kbd` box 16 px tall, centred, so its digit sat
   higher than the label's text. It now uses the label's font on a shared baseline: bottoms and
   centres measured equal (also the banner's "Hotkey:" badge). Evidence: `board-1440.png`,
   `board-390.png`.

Follow-up (owner, 2026-10-27, second pass):
5. [x] "Are you sure the team colors are accurate on the page? The celtics should be green, but they
   are cool blue … databallr doesn't do this." (owner screenshots: BKN–BOS game view with a blue
   Boston edge; Databallr's banner bar black on the Nets' half, green on the Celtics'.)
   — Why: the Nets' brand black is brightened to grey (#666) so it shows on the dark page, and my
   clash check compared brightness only, so grey and Celtics green read as a clash and Boston was
   swapped to the generic identity blue. Fix: each team always keeps its own colour. The banner's
   top bar is split in halves in the true brand colours (#000 / #007A33), as on Databallr, with a
   faint brand tint at each end; shot marks and stat bars use the brightened accents. Only two
   near-identical colours (two reds, by RGB distance) change, and then the away team takes a
   lighter tint of its own colour. Tests: `components/live-game.test.ts`. Evidence:
   `colors-bkn-bos-1440.png`, `colors-min-cle-1440.png`.

Follow-ups (owner, 2026-10-27, third pass):
6. [x] "What does the HK and numbers mean in the game cards?" (owner screenshot of an upcoming card:
   "HK 1", then the -12.5 and O/U 222.5 chips.) — Answer: HK is Databallr's "hotkey"; the number is
   the key that opens the game (1 for the first card through 9). The chips are the home spread and
   the total. Change: "HK" was jargon, so a card shows just the number as an outlined key cap
   (thicker bottom edge, set apart from the line chips) with a "Press 1 to open this game" tooltip
   and screen-reader text, as the All Games rail already did. The banner keeps "Hotkey: 2".
   Evidence: `card-keycap.png`.
7. [x] "If the game hasn't started yet, shouldn't [it] open in Pre-Game instead of Summary?" — Yes:
   a scheduled, postponed or cancelled game opens on Pre-Game; started and final games on Summary.
   A tab the viewer picks wins and stays in the URL while 1–9 jumps between games; with no pick,
   each game opens on its own default. Evidence: `upcoming-opens-pregame-1440.png`.

Follow-up (owner, 2026-10-27, fourth pass):
8. [x] "Why doesn't the betting numbers on the game cards reference the actual teams? … I don't bet,
   so can it be understood who the favorite here is?" (owner screenshot: BKN at BOS card with
   "-12.5" and "O/U 222.5" chips.) — Why: the chip showed ESPN's bare spread, which is the home
   team's line (negative = home favored), so "-12.5" never said it meant Boston. ESPN's own text
   also uses its codes ("NY -4.5", "SA -18.5"). Fix (`lineFavourite` in `lib/live.ts`): the
   favourite comes from the spread's sign and our team codes. Cards end with their own row, "BOS by
   12.5 · O/U 222.5", with tooltips ("Boston Celtics favored by 12.5 points", "about 222.5 points
   combined"); the header keeps just the time, key and arrow, so nothing wraps. Pre-Game tiles name
   the team ("BOS −12.5") with a plain line under each: "Boston Celtics favored by 12.5 points",
   "Boston Celtics favored to win", "About 222.5 points combined"; tiles align from the top.
   Evidence: `cards-favorite.png`, `pregame-lines-favorite.png`.


### 5 WOWY — 👀 ready for review

Owner start (2026-10-25): "On databallr it has its own nav bar entry. We don't have a nav bar entry
for it." "When you press the WOWY nav bar entry, it gives you a team prompt." "Databallr's WOWY
current implementation is quite bad UI wise. Broken layouts etc., the idea is good though. I feel
like we can reorganize and restructure the data (visually speaking) in a better way."

Starting state (survey, 2026-10-25): `/wowy` lives under Research → Impact. It shows one duo from a
team's ten highest-minute players: four split tiles, a ranked net-rating bar chart, a split table
and an every-duo table, with Team / Player A / Player B selects. The shared-floor endpoint
(`POST /api/workbench/operations/wowy`) already takes up to five players as together / apart
conditions and a date range; IM03 stints carry period and opponent, so game-clock and opponent
filters are derivable.

Databallr (`/nba/wowy`, owner screenshots 2026-10-25): top-level WOWY link after Stats; arrival opens
a Select Team dialog (30 logos, 5 × 6). Then "WOWY Combos": team, Players (n), season and phase
chips; Overview / Offense / Defense / Expanded tabs; Pad, Luck, export, share. A left Players list
gives each player a Combo / On / Off segment (up to 5 combo players; On and Off hold for every
row). The table has one row per on/off mix of the combo players (2^n rows, by minutes): big photos
dimmed "OFF", MIN, OFF and DEF ratings with a change vs a baseline and 3P%, NET; one player adds an
ON − OFF row. Filters: dates inside the season, game clock (Full game, halves, quarters, OT, last 5
of Q4 + OT, Custom), exclude garbage time, common games only, opponents (all, by tier on offense /
defense / net top / mid / bottom 10, pick teams), player vs player. A roster drawer at the bottom
repeats the player list.

Instructions (owner, 2026-10-25):
1. [x] WOWY gets its own top-level nav bar entry, as on Databallr. — `DIRECT_LINKS` in
   `lib/nav-model.ts` (Stats, WOWY), rendered by the header and the phone drawer; removed from
   Research → Impact.
2. [x] Opening WOWY prompts for a team (Databallr's Select Team dialog). — Stat Line Shift's Select
   Team modal; closing it leaves "Select a team to begin".
3. [x] Keep Databallr's idea (combo players split into every on/off mix, with On / Off conditions
   and filters) but reorganize and restructure the data visually so it reads better than
   Databallr's layout.

Owner decisions (2026-10-25, on the agent's proposal):
- Layout: **combo matrix**. Each combo player gets a narrow on/off dot column under a small face in
  the header, so each mix is one compact row: MIN, ORtg and DRtg with their change vs the team's
  season rating, and NET with a diverging bar. An On − Off card per combo player sits above the
  table, and rows under the sample rule are muted. There's no duplicate bottom roster drawer.
- Nav: WOWY moves to a top-level link right after Stats and leaves Research → Impact.
- Filters: "Use your best judgment here. I want good comprehensive coverage." Agent scope: dates
  inside the season; game clock (full game, halves, quarters, OT, last 5 of Q4 + OT, custom);
  exclude garbage time (documented rule); common games only; opponents (all, by tier, pick teams);
  player vs player where the stints support it.

Done (instruction 3): new `GET /api/workbench/operations/wowy-combos` (contract
`docs/design/wowy-combos-v1.md`, `domain/wowy_combos.py`, `services/wowy_combos.py`; GET, so the
hosted demo's Caddy allowlist is unchanged). `load_floor_rows(detail=True)` adds the clock, start
margin and both sides' box totals without changing shared-floor hashes. Page `components/wowy-view.tsx`:
- Left rail: Players (Combo / On / Off per player, search, top 12 + All) and Filters (dates; game
  clock presets + custom periods and minutes; exclude garbage time; common games; opponents all /
  by tier with ranked logos / pick teams; player vs player on, off or as a split column). Reset
  and an active-filter count. On phones: Players, then the table, then Filters.
- Main: Overview / Offense / Defense tabs, an "Every row: …" line for held conditions, an On − Off
  card per combo player (net with its ORtg / DRtg parts), and the combo matrix: dot columns under
  small season photos, Min, ratings with the change against the filtered team total, Net with a
  diverging bar, then shooting or four factors; muted rows under the sample gates; a gold Team
  Total foot. Export CSV and evidence JSON in Data Details.
- Verified 2026-10-25: ruff, mypy, pytest (`tests/unit/test_wowy_combos.py`), dashboard lint,
  typecheck, Vitest (`lib/wowy.test.ts`), Playwright `e2e/wowy.spec.ts` plus the touched suites;
  live TOR 2025-26 calls answer in under a second.
- Open: the FO06 `recent games` desktop baseline differs in the header (new WOWY link) and also
  in its console and stat card, drift not from this page; not refreshed. The PC12 directory
  baselines already fail since row 22 replaced the directory table.
Evidence: docs/evidence/alignment/wowy/

Follow-ups (owner, 2026-10-25, after the first build):
4. [x] "I really like the databallr implementation. We should try to replicate it. It's very clear."
   Replicate Databallr's lineup table (owner screenshot): a branded card header ("WOWY Combos •
   season • phase"), LINEUP with the team logo, one row per mix with large photos (on players lit,
   off players dimmed with an OFF label, last names below), MIN, OFF (ORtg, its change, 3P%), DEF
   (DRtg, its change, opponent 3P%), NET in the good/bad colour, and an ON − OFF row for one
   player. This replaces the combo matrix chosen earlier. — `LineupTable` in
   `components/wowy-view.tsx`: CourtLens wordmark card ("WOWY Combos • season • phase", the held
   conditions or "All Games" beneath), LINEUP with the team logo, 64 px team-colour photos (on
   first, off dimmed with OFF), MIN with the "3P%:" label, OFF / DEF with the change against the
   league average (served as `league_rating`, as Databallr's baseline) and 3P% / opponent 3P%, NET;
   gold for the better side and blue for the worse, as on Databallr and Stat Line Shift. One combo
   player adds ON − OFF. Clicking a lineup opens its games, stints, possessions and net interval
   (Databallr's "click a lineup cell"). Offense / Defense keep the four-factor columns. The On − Off
   cards, the dot matrix and the team-total row are gone. Photos shrink to 40 px on phones so all
   five columns fit at 390 px. Photo overrides live in `app/styles/foundation.css` (foundation
   outranks pages).
5. [x] The player photos and entries in the Players list should be much larger; they are much too
   small. — 48 px photos (no logo badge), 56 px rows, `--text-md` names and `sm` role buttons; the
   rail is 360 px wide.

Follow-ups (owner, 2026-10-25, second pass):
6. [x] "The player entries are still clipped off on the left. They should also be slightly larger"
   (owner screenshot of the Players rail: the photo rings are cut at the rail's left edge). — The
   rail's scroll box clipped the rings; it now has inline padding. 56 px photos, 68 px rows, a
   380 px rail.
7. [x] "Try to replicate databallr more." Owner screenshots of Databallr's WOWY Combos card (a
   compact card, Overview / Offense / Defense / Expanded tabs, a "Click for lineup composition"
   hint on the lineup cell, short names such as "CMB" for long ones, "Click a lineup cell for
   detailed information about that lineup combination", "Data sources" and "What is NBA WOWY
   analysis?" disclosures). "There are also lineup compositions you can expand into": Databallr's
   Lineups dialog (brand, team logo, season; the lineup's photos plus a Team Help circle; MIN, NET,
   OFF, DEF, O-3P%, D-3P% with changes; Offensive TS%, TOV%, ORB% and Defensive D-TS%, D-TOV%,
   D-ORB% with changes; shot location; Teammate Help: weighted average DARKO of the other
   teammates on the floor, NET = OFF + DEF; shared floor with the lineup % and DARKO per teammate).
   — The card is Databallr-width (760 px; Offense / Defense / Expanded widen it), with smaller
   column heads, bold short names (initials such as "CMB" for long or hyphenated last names), an
   Expanded tab (both ends' factors), the "Click for lineup composition" hint, Databallr's footer
   line and the two disclosures. A lineup cell opens the composition dialog: brand, team logo,
   "Lineups", season; the photos and a Team Help disc; MIN, NET, OFF, DEF, O-3P%, D-3P%; Offensive
   TS%, TOV%, ORB% and Defensive D-TS%, D-TOV%, D-ORB%, each with its change against the league
   (`league_factors`); Teammate Help (minutes-weighted DARKO of the other teammates, NET = OFF +
   DEF, from the sealed DARKO phase rating); shared floor % with each teammate's DPM; games,
   stints, possessions and the net interval. TOV% here is turnovers per 100 possessions, matching
   the league baseline. Not built: shot location (rim / mid / 3P / corner 3), because the stint
   box has no shot zones.

Follow-ups (owner, 2026-10-25, third pass):
8. [x] "The left sidebar should be a part of the page, not isolated as scrollable." — The rail is no longer
   sticky or scrollable on its own; it scrolls with the page.
9. [x] "The combo/on/off buttons are a little unintuitive when trying to setup. Can we come up with
   something more intuitive to use/setup for the resulting chart." — The Players panel opens on a "Your
   lineups" box with three named groups in plain words: Compare n/5 ("Each player splits the table
   into lineups with and without them"), Always on ("Every lineup has them on the floor") and
   Always off ("…on the bench"). Each lists its players as removable chips and ends with the
   result ("2 players compared: 4 lineup rows"). Each roster row shows minutes and games with one
   Add button, which adds the player to Compare. An added player's row swaps that for a Compare /
   Always on / Always off picker and a remove button. Compare is disabled at five. Evidence:
   `wowy-setup-1440.png`, `wowy-setup-390.png`.

Follow-up (owner, 2026-10-25, fourth pass):
10. [x] "Can we make the pairing determinstic (like binary or whatever), I'm noticing we don't order
    it the same every time. What is a good way to order?" (owner screenshots: rows ordered by
    minutes and photos on-first, so a player's photo changes column between rows.)
    — Rows follow a truth table: everyone on first, then counting down in binary with the last
    added player switching fastest (two players: both, first only, second only, neither). Minutes
    no longer reorder them. Each player keeps one photo column in every row, in the order they
    were added, so their photo stays in the same place and only lights or dims. The composition
    dialog uses the same order. Evidence: `wowy-order-1440.png`.

Follow-up (owner, 2026-10-25, fifth pass):
11. [x] "maybe we can put the players section on the left (as is) and all the other filters sections
    on the right side with the actual WOWY table in the middle."
    — Three columns: Players (340 px) left, the table in the middle, Filters (300 px) right, on a
    page up to 1480 px wide so the Databallr-width card sits between the rails. From 1024 to
    1279 px the filters move under the table. Below 1024 px it's one column: players, table, then
    filters. No page overflow at 1920, 1440, 1200 or 390 px. Evidence: `wowy-three-column-*.png`.

Follow-ups (owner, 2026-10-27, sixth pass):
12. [x] "this sliding selector needs to give a little more breathing room to the entries" (owner
    screenshot: the Compare / Always on / Always off picker on an added player's row). — The picker
    uses the kit's standard (not dense) spacing, so each option has its own padding and a gap
    between options (220 px, still inside the 340 px rail). Evidence: `wowy-role-picker-1440.png`.
13. [x] "the opponents sliding selector needs to be tapered to the actual options." (owner
    screenshot: All Teams / By Tier / Pick Teams stretched across the Filters column.) — The Filters
    column's selectors keep their options' width instead of stretching (Opponents, Rank by and Tier).
    Evidence: `wowy-filters-1440.png`.
14. [x] "\"always off\" is clipped on it's right. Why?" (owner screenshot of the role picker.)
    — Why: the kit's Segmented is capped at its container's width and scrolls when wider. With
    follow-up 12's spacing its content was 229 px in a 220 px column (between the photo and ×), so
    "Always off" was cut off. My follow-up 12 check measured the box, not its content. Fix: the
    picker sits on its own line under both the name and × (about 264 px), measured at 229 / 229 px
    (content / box) at 1440, 1200 and 390 px. Added rows get a little vertical padding.
    Evidence: `wowy-role-picker-1440.png`.
15. [x] "title case for header. Shared floor linkup is squished. If you need to expand spacing for a
    more optimal fit, do it." (owner screenshot of the lineup composition dialog.)
    — Title case: the dialog title is "Lineup Composition", and the section headers are no longer
    forced to capitals ("Offensive", "Defensive", "Teammate Help (16)", "Shared Floor with Lineup %
    · DARKO"). Squish cause: the teammate photos reused the Players list's photo class, which
    follow-up 14 had given a grid position, so each photo was pushed into a column beside its
    name. They now have their own class. Each teammate is an 88 px column (share %, 56 px photo,
    full name, DARKO) with more space between them, in a 620 px dialog (six per row on desktop).
    Also: a change that rounds to zero shows "0.0", not "−0.0". Evidence:
    `wowy-composition-1440.png`, `wowy-composition-390.png`.
16. [x] "WOWY is currently not updated to show the current season. Any reason why?" then, after
    "Databallr has data for the 2026-2027 even with this minimal data": owner chose "Daily, run now"
    (2026-10-27). — Three causes:
    - The weekly current-season job waited for 10 games per team before building anything. The
      new `refresh-season-lineups` (daily 14:05 UTC, `courtlens-lineups-refresh`) builds
      provisional stints and the stint box from the first game; RAPM / BPR still wait.
    - On/off accepted stint statuses `valid` and `patched` but not IM03's `clean`, so every game
      needing no repair was dropped. That emptied 2026-27 and also dropped clean games from the
      sealed 2025-26 playoffs. `clean` is now accepted.
    - WOWY defaulted the phase only when no season was named.
    First run: 46 of 52 games accepted (6 excluded by the play-by-play checks), 12 s. TOR
    Barrett / Barnes give 60 / 33 / 31 / 21 min, as on Databallr. The card says "Provisional", and
    Teammate Help uses DARKO's current board for a season under way.
    Also (owner "Yes"): header menus no longer hide a page whose source lacks the default season,
    which had dropped Stat Line Shift, Player Matchups, Adjusted Shooting, Tracking and
    Defensive Matchups once the default became 2026-27. Evidence: `wowy-2026-27-1440.png`,
    `teams-menu-1440.png`.

