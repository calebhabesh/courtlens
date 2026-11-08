# Research design catalog

The work queue for the Research **design phase** ([Research handoff](research-plan.md), D13 and D14):
every Research page redesigned one at a time from the owner's Databallr screenshots or saved pages and
numbered instructions, the way the [alignment catalog](databallr-alignment-catalog.md) ran the core
pages. Started 2026-11-06. It replaces the alignment catalog's rows 18–29 as the place where Research
page instructions and status are kept; those rows point here.

## Rules

- **One page at a time**, in queue order unless the owner picks another. While a page is 🚧, no other
  agent edits it.
- **Design only.** Analyses, frozen results, intervals, unknown states and APIs stay as built. A page
  that needs new data or a new analysis stops and asks; it isn't built quietly.
- **Pattern.** Row 18 (Six-Factor RAPM) set it: the centred `TabbedPage` hero, `ResearchSection`s,
  shared building blocks in `dashboard/components/research/`, `ResearchTable`, the colour rule
  (green/red only where an 80% interval excludes zero) and the alignment plan's "Research pages"
  pattern. Owner instructions win over the pattern.
- **Contracts kept.** Design Language v1, the control kit, logos beside team codes, season-correct
  photos, green/red conventions, no inline styles, source policy v3 and zero recurring cost. Databallr is
  credited as the design reference on each page. Never fetch databallr.com.
- **Only the owner sets ✅.** Agents stop at 👀.

## Status

⬜ not started · 🚧 in progress · 👀 ready for review · ✅ approved by the owner · ⏸ waiting on an owner decision or data

## Steps for every page

1. **Reference:** the owner's saved page or screenshots. Check `~/Downloads/Webpages/` and
   `~/Downloads/Webpages/DraftBallr/` first; ask if missing.
2. **Content check:** list what the reference shows beside what CourtLens serves, and report gaps
   before building. Data the page doesn't have yet is a stop-and-ask.
3. **Instructions:** record the owner's numbered instructions in the page's section below, verbatim
   (lightly tidied), and set the row to 🚧.
4. **Build:** shared components first; new shared pieces go in `components/research/`; CSS colocated
   and imported in cascade order; kit controls only.
5. **Verify:** lint, typecheck, Vitest; the page's Playwright spec with real-API fixtures; the full suite in
   a sandbox; the real-data check at 1440 and 390 (every value equals the API, 0 console errors, 0
   overflow, 0 broken images); the glance test; screenshots viewed.
6. **Record:** evidence in `docs/evidence/research/design-<row>/`, an entry in the
   [progress log](research-progress.md), each instruction ticked with a one-line note, the row set to 👀.
   One page per commit.
7. **Owner review:** ✅, or follow-up instructions that reopen the row. Approved screenshots become
   Playwright baselines.

## Queue

Saved Databallr references are in `~/Downloads/Webpages/` (W) and `~/Downloads/Webpages/DraftBallr/` (D).
Row numbers in brackets are the old alignment-catalog rows.

| # | Page | Route(s) | Databallr reference | Built in | Status |
| --- | --- | --- | --- | --- | --- |
| **A. Pages with a saved Databallr reference** | | | | | |
| RD00 | Six-Factor RAPM [18] | `/research/rapm/six-factor` | D: `Six-Factor RAPM`, `ShotQuality RAPM`; 7 screenshots | R02, design-18, RD00 | ✅ |
| RD01 | Combine & Wingspan [19] | `/wingspan` | D: `Wingspan Database` | R10 data, RD01 | ✅ |
| RD02 | ORtg Calculator [20] | `/calculator` | D: `Offensive Rating Calculator` | R10 data, RD02 | ✅ |
| RD03 | zTS [24] | `/research/zts` | W: `zTS — Playtype-Adjusted Scoring Efficiency` | R04, RD03 | ✅ |
| RD04 | Shot Quality [25] | `/research/shot-quality` | W/D/LocalSend: `ShotQuality RAPM - Scoring Impact Decomposition` | R05, R06, RD04 | ✅ |
| RD05 | Defensive Shot Quality [26] | `/research/defensive-matchups` | W: `Defensive Shot Quality` | R06, RD05 | ✅ |
| RD06 | Learning [21] | `/methodology/learning` | D: `Learning`; `~/Downloads/Projects/Courtlens/Learning _ databallr.html` | R11, RD06 | ✅ |
| RD07 | Patch Notes [21] | `/whats-new` | D: `patch-notes` | R11 | ⬜ |
| RD08 | Draft Classes [28] | `/draft` | D: Draftballr dashboard, lottery, resources (owner: don't copy Draftballr's design; match CourtLens and Databallr) | R09 | ⬜ |
| **B. CourtLens-only pages (no Databallr counterpart; row-18 pattern unless the owner directs)** | | | | | |
| RD09 | Research landing [29] | `/research` | none | R12 | ⬜ |
| RD10 | Metric Backtest [29] | `/research/backtest` | none | R08 | ⬜ |
| RD11 | Projected Impact [29] | `/research/projected-impact` | none | R07 | ⬜ |
| RD12 | Lineup Model [29] | `/research/lineup-model` | none | R14 | ⬜ |
| RD13 | Signal vs Noise [29] | `/research/signal-noise` | none | R03 | ⬜ |
| RD14 | Win Probability [29] | `/research/win-probability` | none | R15b | ⏸ D13 keeps its page unless the owner asks |
| RD15 | RAPM Ratings tab | `/research/rapm` | D: `Six-Factor RAPM` (table) | R01, R02 | folded into RD00 (owner, round 3) |
| RD16 | Points Forecasts | `/forecasts`, `/evaluation` | none | workbench | ⬜ |
| RD17 | Expected Shots, Adjusted Shooting | `/research/shooting`, `/research/shooting/adjusted` | none | B25–B26 (sealed) | ⏸ redesign, fold into Shot Quality / zTS, or keep as is |
| **C. Blocked** | | | | | |
| RD18 | Shot Aftermath [27] | `/research/shooting/aftermath` | D: `Shot Aftermath` | — | ⏸ needs a new play-by-play aggregate by zone; owner's call |
| RD19 | Ask evaluation [29] | `/research/assistant-evaluation` (not built) | none | R16 | ⏸ after R16 finishes |

**Not in this catalog** unless the owner adds them: Methodology Definitions (`/methodology`), Stats
Glossary (`/stats/glossary`, part of the approved Stats page), Ask (`/research/ask`), Case Studies,
Saved Investigations, the operation gallery (`/research/operation`) and the legacy tracking view
(`/research/defensive-matchups/tracking`).

---

## RD00 Six-Factor RAPM — ✅ approved by the owner (2026-11-07)

Redesigned 2026-11-06 (design-18, `4023a98`); its nine instructions are in the alignment catalog, row 18.
It sets the pattern for every page below, so review it first: changes here are cheapest before they're
copied. Evidence: `docs/evidence/research/design-18/`, then `docs/evidence/research/design-RD00/`.

Instructions (owner, 2026-11-06, round 2; references: three new screenshots of Databallr's Six-Factor page
from the header through the archetypes and the open Caveats & Methodology, plus the saved page):
1. [x] Transition from a full-width page to a centred column like Databallr. Do this for pretty much all
   the Research pages: full width makes the containers look very bulky and the site hard to read.
   — Shared `.rs-column`, 992 px centred (Databallr's width), holding the filter bar and every section; recorded
   in the pattern so each Research page adopts it in its turn. The ratings table fits it unscrolled in all views.
2. [x] Move away from containerizing everything; it's quite ugly and we do it on pretty much every
   Research page. Make it look aesthetic without containerizing everything.
   — Shared components are open: cards take a top rule, glossary a hairline list, method blocks and steps no
   wells, the factor panel and table toolbar no frame, callouts a left rule. Only the table, the framework grid
   and the tree nodes stay framed. Learning, Patch Notes and the landing share the open cards already.

Found before building: at 390 the longest names (Gilgeous-Alexander, Antetokounmpo, Wembanyama) run 24–53 px
past the pinned player column under the RAPM values; fixed with this round (names wrap inside the column).
Evidence: [`design-RD00`](evidence/research/design-RD00/README.md).

Instructions (owner, 2026-11-06, round 3; screenshot of the RAPM Ratings tab at full width):
3. [x] Not done: the RAPM Ratings table is still full width and has the old ugly table/container styling.
   — The tab is in the same column with the shared `ResearchTable` (uncoloured: no interval is served), an open
   leaders chart (still the PC12 first-load headline), open facts and an open experiment block.

Instructions (owner, 2026-11-06, round 4; screenshots: Databallr's Six-Factor page from the header to The Six Factors,
CourtLens's page at the same point, CourtLens's Six Factors panel, CourtLens's RAPM Ratings Leaders and All Ratings):
4. [x] The page should be shaded like Databallr does it; we are currently only using thin white lines.
   — Shared light panels (4% white, soft rim) and darker inner wells, tinted Offense/Defense cards, an accent-ringed factor panel; supersedes round 2's open blocks.
5. [x] Six Factors section: the player photos need to be much larger.
   — 64 px season photos in team colour (48 px on a phone).
6. [x] Same goes for Leaders and All Ratings: the player photos are too small, they don't even have player
   colours in the photos, and they're clipped off on the edges.
   — 44 px (Leaders) and 40 px (tables) in team colour; RAPM Ratings takes teams from the season's six-factor fit.

Instructions (owner, 2026-11-06, round 5; screenshot of the Player Archetypes cards):
7. [x] There is a lot of caption text on this page, like "Rule:" in this image. If it is non-essential we should
   remove it, if it takes away from the key takeaway/point.
   — Every caption on both tabs got one fate (cut, shortened, moved to the collapsed methodology, or kept as an
   honesty statement); archetype rules now live under "How the Archetypes Are Picked". Table in the evidence.

Instructions (owner, 2026-11-06, round 6; screenshot of the Impact Tree with Kawhi Leonard selected):
8. [x] Does there always need to be a player in the "Impact Tree"? Why can't I remove a player? The x button
   doesn't work.
   — No. The top RAPM player still opens the tree on first load, but the X now clears it (`player=none`, kept on
   reload): the picker stays with "No player selected" and a "Show {leader}" button.

Instructions (owner, 2026-11-06, round 7; screenshot of the All Ratings table scrolled under the header):
9. [x] There is a weird bug with this table causing it to overlap the top drop downs.
   — The pinned player column tied the sticky filter bar's layer and, being later, painted over it; the shared table's
   scroll frame is now its own stacking context, so it scrolls under the bar on both tabs at every width.

Owner, 2026-11-07 (given during RD02 round 4, instruction 6): the dividers above and below the intro line removed.

## RD01 Combine & Wingspan — ✅ approved by the owner (2026-11-07)

- **Now:** the combine measurements view plus R10's plain sections: career and current DARKO D-DPM,
  percentiles, positional averages with counts and intervals, the registered correlation (wingspan − height
  against D-DPM r +0.21, +0.15 to +0.27, 822 players), a scatter with selectable axes, nearest builds.
- **Known gaps from the reference:** Databallr's layout, with-shoes and units toggles, CSV, the overlay
  graphic. Players who skipped the combine stay unknown (Databallr uses other sources).

Instructions (owner, 2026-11-07, round 1; references: the saved page `Wingspan Database - NBA Height & Wingspan
Resource _ databallr.html`, rendered offline with every request blocked, beside this page at 1440 and 390; the
owner answered the four questions under the gap list):
1. [x] Yes: fold everything into one Databallr-style page, with R10's correlations below it.
   — One page in Databallr's order: centred hero, a shaded filter panel, the players table beside Positional Averages
   and the overlay, the scatter, Similar Profiles, then Wingspan and Defense and the collapsed Caveats & Methodology.
   The per-class view became a Combine class filter that adds that class's drills; its tiles and second scatter went.
2. [x] With shoes (measured shoe height or Databallr's flat +1.25″): use your best judgement.
   — The measured shoe height, never an allowance: 1,167 of 1,751 have one; the 2000–2003 and 2023–2026 combines
   didn't measure it, so those show “—”. Percentiles and correlations stay barefoot; the methodology says so.
3. [x] Players who skipped the combine (unknown here, filled from other sources by Databallr): use your best judgement.
   — Left unknown: adding them needs a new source and a new frozen analysis (the stop-and-ask rule). The methodology
   names the gap (Wembanyama, Holmgren, Lively); a free source can be its own block if the owner wants it.
4. [x] Colour on Diff and D-DPM: try to make the entire page match Databallr before moving on.
   — Databallr's sign colours as identity tones (gold above zero, blue below) on Diff, D-DPM, career D-DPM and the
   position cards; never green/red, since none has an interval. Also Databallr's wide column (1352 px, not RD00's 992),
   Inches/Ft-In with ¼ ½ ¾, the summary line, CSV with `nba_id`, per-row similar-profile and overlay buttons, the
   overlay drawing and the scatter coloured by position with its r.

Evidence: [`design-RD01`](evidence/research/design-RD01/README.md).

Instructions (owner, 2026-11-07, round 2; screenshots: Databallr's table and filter panel with "che" searched, and this
page's table, overlay, scatter, Similar Profiles and Wingspan and Defense tables):
5. [x] I want full coverage for all players like Databallr has.
   — Owner chose CraftedNBA, labelled: its page (418 current players) is read once and sealed
   (`courtlens-wingspan-coverage-v1`, raw page kept gzipped by SHA-256); all 418 match an NBA ID (4 by a reviewed nickname
   alias). 97 rows gain figures (27 unmeasured combine participants, 70 new players: Wembanyama, Holmgren, Lively…); the combine
   wins for the other 321. Tagged Reported; no percentiles; out of averages, r and the frozen R10 analysis. Active: 362 → 459.
6. [x] Remember to add icons where possible like Databallr has (the filter panel's Height and Units groups).
   — Height (footprints), Units (arrows) and Combine (calendar) groups with Databallr's inset label; icons on the status
   options, the panel titles and the scatter's axis pickers; CSV moved into the panel with "`nba_id` included".
7. [x] Try a main table design that looks more similar to Databallr.
   — Databallr's layout: solid dark table, lighter header holding the search, logo then the name with ◎ and + beside it, no
   photos, centred figures with a small percentile under them, D-DPM to one decimal, 49 px rows.
8. [x] Add a units toggle for people that need it, to switch between ft and inches to m/cm.
   — Units: Ft-In · Inches · m · cm everywhere (table, cards, overlay axis, scatter, similar profiles); differences show in
   centimetres in both metric modes.
9. [x] These tables (Similar Profiles, Wingspan and Defense) are ugly and are remnants from a past design. Use a better
   static table design: more breathing room, and their contents slightly larger (text size, etc.).
   — Shared `rs-static` table style (light panel, 12 × 16 px cells, 14 px text, interval under each r); within-position
   pivoted to one row per position with three r columns; the method tables use it too.
10. [x] The Selected Player Overlay is kind of a bad display. Where are the axis labels? Make it as clear as possible.
   — Replaced the cross with scaled bars from zero on a labelled axis (feet, inches, metres or centimetres): a light
   wingspan bar under the solid height bar per player, the difference at its end, a key, names and figures.
11. [x] Make selected players more notable in the graph. Also, is there a way to clear them?
   — Highlighted players are large, filled in their overlay colour, outlined and named while the rest dim; a chip per player
   above the chart removes it, and Clear all empties the overlay and the similar-profile pick.

Instructions (owner, 2026-11-07, round 3; screenshots: this page's players table and scatter, the Stats page's NBA Player
Statistics table, and the Wingspan and Defense tables):
12. [x] The search bar should be left aligned. Add player photos.
    — The search sits at the left of the pinned player header, as on Stats; each row is the Stats player card: logo, 40 px
    season photo, name over "team · year combine" or "team · Reported", with ◎ and + beside it.
13. [x] Can we make it possible to add multiple players to the graph if possible (hopefully they don't clip into each other).
    — "Add a player to the graph" search on the scatter adds up to 8 more players (`mark=` in the URL) beside the overlay and
    similar-profile picks; every label takes the side its name fits and a line of its own (18 px apart, with a leader line).
14. [x] We should standardize table styling on this website. Use the site's main NBA Player Statistics table as a guide, and use
    scaled equivalents of it: these tables are incongruent with the rest of the site. I want standardization.
    — New shared `StatsGrid` (`components/research/stats-grid.tsx`) renders the Stats table's own classes (frame, group tier,
    lifted header, well cells, pinned player card); `density="compact"` is the scaled version. Every table on this page uses it:
    players, similar profiles, drills, correlations, within position, exclusions, positional averages. Recorded in the pattern;
    the RD00 table (`ResearchTable`) and other pages move to it in their turns (owner's call).

Instructions (owner, 2026-11-07, round 4; screenshots: the Within Position and Correlations tables, the scatter's header):
15. [x] How do we deal with tables like this? It seems like it's broken on the left edge. What is this inset? It doesn't look
    right. These left-most columns don't look right.
    — Two causes: the pinned lead column's header had 4 px of padding and its body 8 px, so labels didn't line up, and the small
    tables repeated labels in two header rows (POSITION over POS). Now one 16 px left edge in every row, header labels aligned,
    and the small static tables have one header row (positional averages keeps its Measured / Rated groups).
16. [x] The player search bar should be centered.
    — The scatter header is a three-column grid: axis pickers left, the add-a-player search centred on the panel, r right; on a
    phone the pickers take the first line and the search the second.

## RD02 ORtg Calculator — ✅ approved by the owner (2026-11-07)

- **Now:** the hypothetical calculator plus R10's observed inputs per season (2014-15 to 2025-26), Poropudas
  and Halme's Eq. (11), μ, rebound rates by miss, ORTG and marginals.
- **Known gaps:** the interactive ORTG Lab itself; the menu label is still "Hypothetical Calculator" (D8
  says "ORtg Calculator").
- **Data check (2026-11-07):** no new data. The lab's xSHOT × xEFF × xPOSS is exactly Eq. (11); every slider input
  (2P%, 3P%, FT%, 3PA rate, FTA rate, TOV%, 2P / 3P / final-FT OREB%) is served for the league and all 30 teams in
  each season, and the rebounds by miss add up to the served ORB% (36,509 = 36,509 in 2025-26). A split-rebound form
  rebuilt from the served counts reproduces the served rating in all 372 league and team rows.

Instructions (owner, 2026-11-07, round 1; references: the saved page `Offensive Rating Calculator _ databallr.html`,
rendered offline with every request blocked, and three screenshots of it, beside this page at 1440 and 390; the owner
answered the five questions under the gap list with "use your best judgement"):
1. [x] Can you use your best judgement and suggestions for optimal layout. I would like our page to be the same as
   Databallr's and then we can build from there. Our current page is too information dense. I like Databallr's layout,
   we should copy it.
   - (a) The lab computes Eq. (11) on the page from the served inputs, with Databallr's split 2P / 3P / FT offensive
     rebounds rebuilt so it equals Eq. (11) at every observed season and team, and its eFG% / TS% master dials.
   - (b) Starting values: season (2014-15 to 2025-26) and a clearable team picker, default the league in 2025-26.
   - (c) The hypothetical calculator (B27) goes: the lab replaces it, as on Databallr.
   - (d) R10's observed tables move into a collapsed section below the lab; the page shows Databallr's layout only.
   - (e) Databallr's sliders panel and stepper board both stay, on one page.
   — Databallr's ORTG Lab at its 1352 px: hero bar (pill, title, Paper), inputs panel (season, clearable team, 12 sliders with
   ΔORTG), the ORTG = xSHOT × xEFF × xPOSS card with Decomposition / Marginal value / Context notes tabs, the stepper board,
   Databallr's methodology panel; R10's tables in the collapsed Observed Inputs & Caveats on `StatsGrid`. The lab equals the
   served Eq. (11) for all 72 fixture rows and stays Eq. (11) on the inputs shown after any move; B27 removed; menu "ORtg
   Calculator".

Evidence: [`design-RD02`](evidence/research/design-RD02/README.md).

Instructions (owner, 2026-11-07, round 2; screenshot: the stepper board's ORTG / xSHOT / xEFF / xPOSS tiles):
2. [x] For ORTG, xSHOT, xEFF, xPOSS there is too much nesting. Only one nest deep.
   — The extra well around the four tiles is gone: panel → tile, the tiles as the panel's wells.
3. [x] (Screenshot: the stepper cards.) Balance the left and right columns in the container, it looks a little weird.
   — Each stepper card is two equal columns, each centred; the label and ΔORTG share one row and the control and its
   figure the next. A phone keeps the stacked two-column board.

Instructions (owner, 2026-11-07, round 4; screenshots: the methodology panel, and the Six-Factor RAPM intro):
4. [x] Why is the text so grey here (the methodology panel)? That's not what we use across the site.
   — The page used the neutral greys (`--color-text-secondary` / `-tertiary`); every one now uses the Research pages'
   blue-tinted `--color-on-bg-secondary` / `-tertiary`, as the other explainers do.
5. [x] Remove the divider above "Observed Inputs & Caveats".
   — Its top rule is gone on this page.
6. [x] Remove the divider above and below "RAPM split into six factors," on the Six-Factor RAPM page. These dividers are ugly.
   — The filter bar's bottom rule and The Framework's top rule are gone on that page (`six-factor-research.css`); its two
   visual baselines regenerated and viewed.

## RD03 zTS — ✅ approved by the owner (2026-11-07)

- **Now:** About and Top 200 replicated, a Player tab built without a reference; registered test: zTS
  tracks oTS RAPM better, predicts next-season rTS worse.
- **Known gaps:** SV/100, the team table, the X/Y explorer and the position filter weren't reproduced. FTA
  per play type isn't derivable, so play-type TS is CourtLens's own.
- **Reference (2026-11-07):** `~/Downloads/LocalSend/zTS — Playtype-Adjusted Scoring Efficiency _ databallr.html` (newer
  than the `~/Downloads/Webpages/` copy), rendered offline with its 12 scripts and every `crossorigin=""` stripped, a
  `<base>` at the saved folder and every non-file request blocked; plus eight owner screenshots. The save holds the About
  essay (768 px column, `max-w-3xl`, in a 1248 px container) and the Top 200 table (hidden in the save, unhidden to render;
  a fit-width table in the same column). The Player tab is not in the save, so it is this page's design.
- **Data check (2026-11-07):** served: league TS by type, the calculation, pair and compare data, the distribution, scoring
  usage, extremes, X/Y fields, TS add / zTS add, season histories, the leaderboard, the registered test and coverage. Not
  served: (A) SV/100 (formula unpublished); (B) Databallr's add-stat R² study and baseline sweep; (C) team playtype
  difficulty; (D) per-season positions; (E) Databallr's role-change slope, team-scheme statistics, shot-quality (Genius
  Sports, not free), PPP and further studies; (F) seasons before 2015-16 and playoffs.

Instructions (owner, 2026-11-07, round 1; the owner answered the seven recommendations under the gap list with "Your
recommendations look good. Go ahead and comprehensively create redesign the page"):
1. [x] Your recommendations look good. Go ahead and comprehensively create redesign the page.
   - (1) Copy Databallr's layout: its article hero through `PageHeader`, one essay column in its section order, the
     floating bottom pill tabs, panels and wells one level deep.
   - (2) Databallr's measured 768 px column.
   - (3) CourtLens's own prose in Databallr's structure with CourtLens's numbers; Databallr's wording and findings are not
     copied or presented as CourtLens's.
   - (4) Gaps: (A) zTS add/100 in place of SV/100; (B) and (E) left out, no stub sections; (C) team playtype difficulty
     from each team's summed player Synergy rows (a new descriptive analysis, no new source; rows under 10 possessions are
     absent, so team totals run slightly low); (D) no position chips; (F) 2015-16 onward, Post disabled.
   - (5) Rules: Finishing-Big and High-Burden keep the five most negative / positive Role with 1,000+ minutes; Playtype
     Difficulty Moves picks its six players by rule (largest role change, 1,000+ minutes in each season).
   - (6) Gold/blue by sign on values and play-type bars; green/red only on the registered test, whose intervals exclude zero.
   - (7) Player tab (own design): clearable picker with season and an empty state, a 64 px photo card and four tiles, the
     play-type mix in Databallr's pair-chart style against the league, the Expected TS / difficulty panel, and the season
     history on `StatsGrid`.
   — Databallr's article at 768 px: hero through `PageHeader`, the essay in its section order without heading icons, panels
   one level deep, the floating About / Top 200 / Player dock; gold/blue signs, green/red only on the registered test; team
   difficulty (`/api/zts/teams`, from the frozen run's own rows) and role moves (`/api/zts/role-moves`) added; rules, the test
   by season, coverage and credits in the collapsed Caveats & Methodology; Top 200 and Player rebuilt on `StatsGrid`. Real data
   6,088 values, 0 mismatches.

Evidence: [`design-RD03`](evidence/research/design-RD03/README.md).

Instructions (owner, 2026-11-07, round 2; screenshot: the hero title):
2. [x] Add a little bit of spacing after "zTS" container, it seems too close to the colon.
   — The title chip has an 8 px (`--space-2`) gap before the colon at every width.

Instructions (owner, 2026-11-07, round 3; screenshot: Compare Players Side by Side):
3. [x] Do these drop downs contain all players? Remember we shouldn't use drop down menus to scroll through player lists, it
   should be a search bar/drop down combo if need be.
   — No: they held only the season's players with a served zTS (313 in 2025-26). Each side now has a Change button that opens
   a search field with suggestions (`LookupInput` over that same served pool, 8 results, the pair excluded); no player dropdown is
   left on the page.

Instructions (owner, 2026-11-07, round 4; screenshot: the compare card with its search open below it):
4. [x] It should enter as search boxes under the player photos.
   — Change turns into the search field in place, under that player's photo and name; its results drop straight beneath it.
   Escape or leaving it empty closes it.
5. [x] The player photos should have the team color/logo behind them. Like we have on other pages. It's important.
   — The compare card and the Player tab use the site's `PlayerAvatar` at 64 px: team-colour fill and ring with the team logo
   badge, the season's photo.

Instructions (owner, 2026-11-07, round 5; reply to the shared phone search-list question):
6. [x] Use your best judgement. Also is this compare players only for 25-26?
   — It followed the page season (2025-26 unless changed in the distribution section further down). Each compared side now has
   its own season select (2015-16 to 2025-26, URL `as`/`bs`); its search lists that season's served players, and its photo and
   logo follow that season. The worked example above it stays the page season's default pair. Judgement on the shared rule:
   fixed site-wide for floating lists only (`.lookup-dropdown:not(.lookup-floating-dropdown)`), so a phone search list opens
   under its field; inline lists keep the old rule.

Instructions (owner, 2026-11-07, round 6; the compare card's season select for Alex Sarr):
7. [x] It should only show years that are valid for a player, why is it serving me years for sarr that he didn't play (back
   to 15-16)
   — The select listed every zTS season. Each side's select now lists only that player's seasons with a served zTS, from his
   history (Sarr: 2025-26, 2024-25; Westbrook skips 2023-24 and 2025-26, which have no served zTS).

## RD04 Shot Quality — ✅ approved by the owner (2026-11-07)

- **Now:** four tabs: Players (ranked per 100 shots), Decomposition (oTS = oSQ + oMake + oFT, offence,
  defence, combined, CSV, intervals), Model, Player. CourtLens's expected-points model (Shot Quality v2)
  replaces the paid ShotQuality feed.
- **Known gaps:** Databallr's four-regression ShotQuality RAPM on its own pool; the Model and Player tabs
  have no reference.
- **Reference:** three identical saves (W, D, and the owner's `~/Downloads/LocalSend/` copy of 2026-11-07, used: the newest);
  the text differs only in one stray number after the footer, the CSS bundle by build. Databallr's column is 1352 px.
- **Data check (2026-11-07):** (A) Databallr pools 2023-24 to 2025-26 in one time-decay ridge fit (673 players, min
  possessions); CourtLens fits each season 2022-23 to 2025-26 separately (379 rated in 2025-26: 20 games and 1,000 shots).
  (B) Poss → Shots. (C) Min poss free entry → min shots from 1,000 (below it there is no value). (D) no player search on our
  board. (E) no Methodology button. (G) our values were coloured green/red by sign, against the colour rule. (H) the Six-Factor
  link card's 98.5% is not served. (I–K) reading guide, glossary and methodology are served, layout only. (L) additivity,
  persistence and data joins have no reference. (M) the Model and Player tabs have no reference. (N) "Request access" dropped.

Instructions (owner, 2026-11-07, round 1; the owner answered the nine recommendations under the gap list with "I agree with
your recommendations. Let's comprehensively build it out."):
1. [x] I agree with your recommendations. Let's comprehensively build it out.
   - (1) Layout: Databallr's centred hero through `PageHeader`; tabs Decomposition (default) · Shot-making · Player · Model;
     Decomposition in Databallr's order (toolbar panel, table, colour key, Six-Factor link card, How to Read, Column Glossary,
     collapsed Caveats & Methodology); the three result tiles move to Model.
   - (2) Width: Databallr's measured 1352 px column on every tab.
   - (3) CourtLens's own prose in Databallr's structure with CourtLens's numbers; none of Databallr's wording or claims.
   - (4) Gaps: (A) per-season fit with a season select, said in one line, no pooled run; (B, C) Shots and min shots from
     1,000; (D, E) player search and a Methodology button that opens and scrolls to Caveats & Methodology; (H) the link card
     without 98.5%; (K) four regressions as steps, the foul-baseline table and a worked example with our avg_pts, calibration,
     the second stage and credits in Caveats & Methodology; (L) the persistence verdict as a short results section after the
     glossary, additivity and data joins in Caveats & Methodology.
   - (5) Colour: bars and the 80% interval line stay; green/red only where the interval excludes zero, neutral otherwise (the
     RD00 table rule), on every tab. The board on RD00's `ResearchTable`; every other table on `StatsGrid`.
   - (6) Shot-making tab: the same toolbar and table look; FGA, FG%, 3PA share, PPS, xPPS and shot-making/100 with its
     interval.
   - (7) Model tab (own design): the three test tiles, the model card in panels, the test gates (green/red, intervals exclude
     zero), the calibration chart, the slices coloured by interval, persistence; selection metrics, calibration bins and the
     data check in Caveats & Methodology.
   - (8) Player tab (own design, RD03 pattern): clearable search with an empty state (`player=none`), a 64 px `PlayerAvatar`
     card with four tiles from the latest season, the season history on `StatsGrid`, and the player's oTS/oSQ/oMake/oFT per
     season from the existing season boards; no season picker (it lists every season the player has data for).
   - (9) Phone: the interval on one line under each value, the toolbar wraps, controls at least 40 px, the table scrolls in
     its frame.
   — Databallr's centred hero and 1352 px column; Decomposition first on RD00's `ResearchTable` (three sides merged, search,
   min shots, team, season, Methodology, CSV), then the colour key, Six-Factor card, How to Read, glossary, the persistence
   verdict and collapsed Caveats & Methodology; Shot-making on the same table (95% key); Model and Player in panels and
   `StatsGrid`; green/red only where an interval excludes zero on every tab. Real data 50,550 values, 0 mismatches.

Evidence: [`design-RD04`](evidence/research/design-RD04/README.md).

Instructions (owner, 2026-11-07, round 2):
2. [x] Can we use the same team picker we use on the other pages. I don't like drop down selector for teams.
   — Both tables' team filter is now the site's picker (WOWY's and Contracts'): a button with the logo and code opening the
   Select Team dialog of 30 logos (`TeamGrid`), with Show All Teams to clear. Shared as `components/research/team-picker.tsx`,
   opt-in on `ResearchTable` (`teamPicker`), so the approved RD00 and RD01 tables are unchanged.

Instructions (owner, 2026-11-07, round 3; screenshot: the hero):
3. [x] The "Shot Quality" icon looks wonky, and not centerd.
   — An unlayered `display: inline-flex` beat the page's grid centring, leaving the glyph in the tile's corner; it is now centred
   with flex alignment. Measured at 1440 and 390: glyph to tile centre 0 px both ways, tile level with the title, the pair centred
   in the column.

Instructions (owner, 2026-11-07, round 4; screenshots: the Wingspan players table beside the Decomposition table):
4. [x] Again we neeed to make sure table styling is standardized. Why does it look different compared to the combine and wingspan
   table
   — Because round 1 put both tables on RD00's older `ResearchTable` (bars, its own header) instead of `StatsGrid`, the site look
   settled in RD01. Both are now `StatsGrid`, as Wingspan: search in the Player header, a group tier (Offense/Defense · points per
   100 shots, Sample; Shooting, Shot-making), the pinned logo/photo/name card with a subtitle, the value over its interval line,
   sortable headers; the toolbar panel above keeps min, team picker, season, Methodology, CSV, count and the side views. Bars are
   gone with the old table. `GridValue` gains `tone` (green/red only where the interval excludes zero); `ResearchTable` is back
   as it was before RD04.

Instructions (owner, 2026-11-07, round 5; screenshots: the Decomposition table and the NBA Player Statistics table's search):
5. [x] Decision for you: use your best judgment here, choose the optimal deciison. (The question: the shared header capitalises
   oTS, oSQ and dContest.)
   — Judgement: keep the metric labels' own case. The o/d prefix is the only thing telling oTS from dTS, and capitals turn it into
   "OTS" / "DCONTEST". `StatsGrid` columns take `keepCase`; this page sets it on oTS, oSQ, oMake, oFT, the d- labels and xPPS. Group
   labels and plain words (FGA, Shots) keep the site's capitals.
6. [x] If there is a search bar in the table, rememeber it shoudl be standardized design like the main nba player statistics table.
   — Shared `GridSearch` renders the NBA Player Statistics table's own search markup (`stats-header-search` › `lookup-input-wrapper`
   › icon and `lookup-input`), so the Stats CSS styles it: the bordered field in the Player header. Both Shot Quality tables use it.

Instructions (owner, 2026-11-07, round 6; screenshot: the Player header with its search):
7. [x] padding above and below the search bar should be equal
   — The field had 10.5 px from the PLAYER label above it (the two header tiers share one background) and 4 px to the first row
   below. It now sits on the tier line with the label's own gap below it: 6.5 / 7 px at 1440 and 7.5 / 8 px at 390, on both
   tables, checked in every scene. Scoped to `GridSearch`, so Wingspan's approved header is unchanged.

## RD05 Defensive Shot Quality — ✅ approved by the owner (2026-11-08)

- **Now:** ranked defender cards, All / 2PT / 3PT, ranks, RAPM headline, Key Matchups, paging; matchup data
  from 2017-18; expected PPS is the shooters' own shooting.
- **Known gaps:** no tracking, so no contest-based expectation and no 2nd defender (help columns empty).
- **Reference:** `~/Downloads/Webpages/Defensive Shot Quality - NBA Defense Analytics _ databallr.html` (`/d-shotquality`). The
  file the owner attached in round 1 (`~/Downloads/Projects/Courtlens/ShotQuality RAPM …`) is another save of `/shotquality`
  (RD04's page; its text equals the LocalSend copy), so the Webpages save was used. Databallr's column measures about 1368 px.
- **Data check (2026-11-08):** (A) 2nd Defender: not served (help columns are zero in the free matchup data). (B) Closest
  Defender: our rows are tracked matchups, not the nearest defender. (C) Opponent Shot Quality EV: ours is expected PPS from
  the shooters' own shooting. (D) Data Source ↔ our Rank by. (E) per-card All/2PT/3PT: the three served boards joined by
  player. (F) player search: filters the served rows. (G) team-colour cards: `team-colors` and `TeamWatermark` exist. (H) Key
  Matchups FGA · SQ · PPS ↔ FGA · xPPS · PPS (ours has five; Databallr's are empty). (I) the RAPM chip is our dSQ (80%, from
  2022-23). (J) D-SQ per 100 with its 95% interval is ours only. (K) seasons from 2017-18. (L) Powered by ShotQuality and
  Request access dropped. (M) signal checks, season table, definitions, method and hashes are ours only. (N) 329 served, not 478.

Instructions (owner, 2026-11-08, round 1; the owner answered the gap list and recommendations with "Yes, go with your
recommendations for an optimal layout and presentation of this page. Comprehensively build out the page now."):
1. [x] Yes, go with your recommendations for an optimal layout and presentation of this page. Comprehensively build out the page now.
   - (1) Layout: the centred hero ("Defensive Shot Quality", one line; no ShotQuality logo or Request access); RD04's 1352 px
     column; cards three across on a desktop, one on a phone.
   - (2) Toolbar panel: the Stats search look filtering the cards on the left; season (kit select, 2017-18 on), Rank by (kit
     select, our stand-in for Data Source), `TeamPicker` and the global All/2PT/3PT on the right; then the count.
   - (3) Cards after Databallr's: 60 px season photo, name, logo beside the team code, #N badge, the D-SQ RAPM chip (80% interval
     under it; "from 2022-23" before); the card's own All/2PT/3PT, starting from the global one; a D-SQ per 100 tile (value over
     its 95% interval, rank); then Matchup shots, Expected PPS and Actual PPS tiles with ranks. (A) 2nd Defender tiles dropped,
     one line under the cards says why.
   - (4) Colour: green/red only where the served interval excludes zero (D-SQ 95%, RAPM 80%); expected and actual PPS neutral.
     (G) a subdued team-colour tint and the logo watermark, not solid team fills. `ToneLegend` above the cards.
   - (5) Key Matchups as a small table in each card: player (photo, logo, code), FGA, xPPS, PPS; an empty state.
   - (6) Paging: "Show next 6 players (6/329 shown)".
   - (7) Below the cards: How to read (`ReadingGuide`-style), the glossary from the served definitions, "Is it signal?" (the three
     tiles and the checks on `StatsGrid`), and collapsed Caveats & Methodology (hindsight, the by-season table on `StatsGrid`,
     method, Tracking link, credits with Databallr as the design reference, hashes).
   - (8) Phone: the toolbar wraps, controls at least 40 px, no sideways scroll.
   - (9) Design only: no API or analysis change; labels say what our numbers are.
   — Centred hero and 1352 px column; toolbar with search, season, Rank by, `TeamPicker`, All/2PT/3PT; team-tinted cards three
   across with photo, RAPM chip (80%), #N, their own shot-type switch, D-SQ (95%) and three ranked tiles, Key Matchups on `StatsGrid`;
   no 2nd Defender (said why); reading notes, glossary, signal checks and collapsed Caveats & Methodology. Real data 67,960 values, 0
   mismatches.

Evidence: [`design-RD05`](evidence/research/design-RD05/README.md).

Instructions (owner, 2026-11-08, round 2; screenshot: the first three cards):
2. [x] remove the team logo under the cards. It's a little distracting. The team color match is enough.
   — The logo watermark behind each card is gone; the team-colour tint, the photo's logo badge and the logo beside the code stay.
   Checked on real data: no image behind any card, every card tinted.

Instructions (owner, 2026-11-08, round 3; after asking whether Key Matchups should be searchable, the owner accepted the
recommendation with "Sounds good build it comprehensively."):
3. [x] Sounds good build it comprehensively.
   - (1) An "All matchups" link on each card opening Player Matchups (`/matchups?playerId=…&side=defense&season=…`), every player
     that defender guarded, searchable there. The frozen results keep only five key matchups, so no search is built into the card.
   - (2) Each Key Matchups row opens that head-to-head (`…&opponentId=…`).
   - (3) Say that Player Matchups is NBA tracking's season matchups, a different source with no expected PPS; coverage checked
     from 2017-18 (it serves every D-SQ season).
   — Each card's Key Matchups head has an "All matchups" link to everyone that defender guarded on Player Matchups (searchable
   there), and each shooter's name opens that head-to-head. A line under the cards, the glossary and Caveats & Methodology say
   it is NBA tracking's season matchups with no expected PPS. Coverage checked on real data: 2017-18 to 2025-26, every top-12
   defender's list and every key-matchup pair sampled (96) served; the links followed on real data in 2025-26 and 2017-18.

## RD06 Learning — ✅ approved by the owner (2026-11-08)

- **Now:** 22 topics in 5 tiers, each with formula, key takeaways and links; 12 "Measured in CourtLens"
  boxes (the build-phase note said 14; the page serves 12); a league-trends table (2014-15 to 2025-26). Plain build.
- **Known gaps:** Databallr's topic layout and the league-trends chart; no league averages before 2014-15.
- **Reference:** `~/Downloads/Projects/Courtlens/Learning _ databallr.html` (+ `_files`), the save the owner attached in round 1
  (`~/Downloads/Webpages/DraftBallr/` has no Learning save). No screenshots came with the round 1 prompt. Rendered offline (scripts
  and `crossorigin` stripped, a `<base>`, every non-`file://` request blocked; its scroll-in cards forced visible). Measured: a
  1368 px container, a sticky 224 px topic sidebar with "Search topics…" (384 px) above it, 32 px gap, 1112 px topic cards. Without
  its scripts the save does not lay out at 390 px (the sidebar stays 224 px wide), so there is no phone reference.
- **Data check (2026-11-08):** (A) league averages before 2014-15: the Teams API serves box-score league eFG%, TOV%, ORB%, FTr, ORtg
  and pace from 1983-84 (eFG% from 1946-47), a different source with different definitions (2014-15: TOV% 12.8% vs 15.3%, ORB%
  25.1% vs 31.0%, ORtg 103.7 vs 106.8) and no TS%; not joined. (B) offensive rebound rate by shot zone: not served (only missed 2s
  vs missed 3s, from counts). (C) Volume-Efficiency Tradeoff: Databallr's topic, no CourtLens result behind it.

Instructions (owner, 2026-11-08, round 1; the owner answered the gap list and recommendations with "Go with your recommendations
and suggestions for optimal construction of the page. Comprehensively build it out now."):
1. [x] Go with your recommendations and suggestions for optimal construction of the page. Comprehensively build it out now.
   - (1) Hero: the settled centred hero titled "Learning"; Learning gets its own header instead of the shared Methodology tabs;
     Definitions and Glossary become intro links; the Definitions page stays as it is.
   - (2) Layout: Databallr's: a 1352 px column, a sticky 224 px sidebar with a topic search filtering the cards (`GridSearch` look)
     and the numbered tier and topic links (current topic highlighted), beside the topic cards. On a phone the search and a collapsed
     "Topics" index sit above the cards.
   - (3) Cards: a tier pill in a subdued categorical tint (tells tiers apart, never good/bad); title, subtitle in
     `--color-on-bg-secondary`, prose at card width; each formula in its own labelled well; Key Takeaways with gold dots;
     prerequisite chips with our topic titles; links as `ButtonLink`; Measured in CourtLens as a well with its R-block chip. One
     nesting level.
   - (4) Myth / Reality callouts in our own words, only where a CourtLens result answers the myth (about four, each quoting a frozen
     number).
   - (5) League trends: one line chart with a metric switch (TS% / eFG% / TOV% / ORB% / 3PA rate / ORTG), never two y-axes, plus a
     `StatsGrid` compact table; 2014-15 to 2025-26 only (data check A, option a).
   - (6) Workshop: removed from Learning.
   - (7) Credits folded into a short collapsed "About this page" (Databallr credited as the design reference, evidence links).
   - (8) Content: our own prose and numbers stay; the catalog's "14 Measured boxes" corrected to 12.
   - (9) Tests: design only; the R11 spec's Learning tests updated to the new layout, Patch Notes tests unchanged.
   - Agent's reading of the two open data questions (the recommendations did not cover them): (B) not shown, since the page would
     need a new derived series; (C) added as our own topic in Tier 3 with no Measured box, linking to Stats and Compare.
   — Centred "Learning" hero (Definitions keeps its tabs); topic search and a sticky numbered index beside the cards (a collapsed
   index on a phone); tier pills, labelled formula wells, four myths answered by their measured result, prerequisite chips; league
   trends as one-axis chart with a six-measure switch plus `StatsGrid`; workshop removed; 23 topics. Real data 613 values, 0
   mismatches.

Evidence: [`design-RD06`](evidence/research/design-RD06/README.md).

Instructions (owner, 2026-11-08, round 2; screenshot: the desktop index with the search field above it):
2. [x] the search topics bar is arbitrarily placed. Should we make it width of column
   - Agent's answer, built: the index column's width (224 px), at the top of that column, sticky with the index; full width above
     the Topics button on a phone.
3. [x] it's squished to the content below it. Add a natural padding (screenshot: the search over "1. Core Concepts").
   — The search now heads the index column at its 224 px width and stays sticky with it, 24 px above "1. Core Concepts"; full width
   above the Topics button on a phone. Real data 620 values, 0 mismatches.
4. [x] the search bar is still squished for some reason. (screenshot: :3100, scrolled, the index against the search)
   — No code change. :3100 was serving round 1's `learning-view.css` (384 px search, the index list itself sticky) with round 2's
   markup, so on scroll the sticky list slid up against the search (the Turbopack stale-import issue). Toggling the import line in
   `app/globals.css` (file unchanged) made :3100 serve the current rules; measured there: 24 px gap at scroll 0, 250 and 3000.

## RD07 Patch Notes — ⬜

- **Now:** releases newest first (merged PRs and the research branch), grouped entries with badge, date,
  Explore, commit and progress-log links. Plain build. Data in `dashboard/content/patch-notes.json`,
  checked by `dashboard/scripts/check-patch-notes.mjs`.
- **Known gaps:** CourtLens has no version numbers (Databallr shows v4.x).
- **Instructions:** _(owner)_

## RD08 Draft Classes — ⬜

- **Now:** rookie tracker, value by pick with intervals, class redrafts, steals and misses, combine beside
  value; no prospect model (D4).
- **Known gaps:** owner direction is to match CourtLens and Databallr, not Draftballr's own look. The Stats
  pre-2000 draft filter isn't wired; one 1982 pick is misattributed (disclosed).
- **Instructions:** _(owner)_

## RD09 Research landing — ⬜

- **Now:** five headline cards (R15, R08, R07, R05 numbers; R16 in progress), how the results were tested,
  every Research page by group.
- **Instructions:** _(owner)_

## RD10 Metric Backtest — ⬜

- **Now:** nine metrics fixed before each game, 11,979 games; RMSE, gains with intervals, orderings,
  calibration, the 2026-27 prospective score.
- **Instructions:** _(owner)_

## RD11 Projected Impact — ⬜

- **Now:** frozen 2026-27 projections with intervals (roster / rookies / everyone), aging curve, the test
  against carry-forward and time decay, the weekly prospective score (first scheduled run 2026-11-12).
- **Instructions:** _(owner)_

## RD12 Lineup Model — ⬜

- **Now:** registered verdict (ridge better, no practical difference), the lineup tool with intervals, the
  backtest placement, the UMAP player map with its seed-instability notice.
- **Instructions:** _(owner)_

## RD13 Signal vs Noise — ⬜

- **Now:** stabilization points for 20 stats with intervals, the shrinkage test, a player lookup; Stats has a
  Shrunk toggle.
- **Instructions:** _(owner)_

## RD14 Win Probability — ⏸

- **Now:** the live model's page with the final-test report, the nightly scorecard and WPA.
- **Decision:** D13 keeps this page as it is unless the owner asks. Include it in the design phase?

## RD15 RAPM Ratings tab — folded into RD00 (round 3)

- **Now:** the 1Y / 2Y / 3Y ratings table and the sealed experiment, a tab of Six-Factor RAPM; its header
  already follows row 18.
- **Instructions:** _(owner)_

## RD16 Points Forecasts — ⬜

- **Now:** next-game points estimates, their out-of-time test, the prospective ledger; Evaluation Archive
  linked from it.
- **Instructions:** _(owner)_

## RD17 Expected Shots and Adjusted Shooting — ⏸

- **Now:** the sealed B26 experiments (expected-shot v1 is a registered negative result), tabs of Shooting.
- **Decision:** Shot Quality v2 and zTS now cover the same ground. Redesign them, fold them into those pages
  (keeping the sealed results reachable), or leave them as they are?

## RD18 Shot Aftermath — ⏸

- **Now:** a per-player page whose play-by-play tables hold two test games in the published database.
- **Decision:** matching Databallr (league, team and position results by shot zone over two seasons) needs a
  new frozen play-by-play aggregate. Build it, or keep the page as it is?

## RD19 Ask evaluation — ⏸

- **Now:** not built. R16 is running (development set partly done, holdout unopened).
- **Waits for:** R16's results; then a page with accuracy, intervals, failure categories and per-tool errors.
