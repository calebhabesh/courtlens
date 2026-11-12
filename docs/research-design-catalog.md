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
| RD07 | Patch Notes [21] | `/whats-new` | D: `patch-notes`; `~/Downloads/Projects/Courtlens/databallr — NBA & WNBA analytics, impact metrics, and draft games.html` | R11, RD07 | ✅ |
| RD08 | Draft Classes [28] | `/draft` | none (owner, 2026-11-08: no Databallr page; never copy Draftballr; built from approved CourtLens Research patterns) | R09, RD08 | ✅ |
| **B. CourtLens-only pages (no Databallr counterpart; row-18 pattern unless the owner directs)** | | | | | |
| RD09 | Research landing [29] | `/research` | none | R12 | ✂️ cut by the owner (2026-11-09) |
| RD10 | Metric Backtest [29] | `/research/backtest` | none (built from approved CourtLens Research patterns) | R08, RD10 | ✅ |
| RD11 | Projected Impact [29] | `/research/projected-impact` | none (built from approved CourtLens Research patterns) | R07, RD11 | ✅ |
| RD12 | Lineup Model [29] | `/research/lineup-model` | none (built from approved CourtLens Research patterns) | R14, RD12 | ✅ |
| RD13 | Signal vs Noise [29] | `/research/signal-noise` | none (built from approved CourtLens Research patterns) | R03, RD13 | ✅ |
| RD14 | Win Probability [29] | `/research/win-probability` | none | R15b | ✅ (owner, 2026-11-11; finish plan F03); model upgrade F05 next |
| RD15 | RAPM Ratings tab | `/research/rapm` | D: `Six-Factor RAPM` (table) | R01, R02 | folded into RD00 (owner, round 3) |
| RD16 | Points Forecasts | `/forecasts`, `/evaluation` | none (built from approved CourtLens Research patterns) | workbench, RD16 | ✅ |
| RD17 | Expected Shots, Adjusted Shooting | `/research/shooting`, `/research/shooting/adjusted` | none | B25–B26 (sealed), RD17 | ✅ merged into Shot Quality and zTS (owner, 2026-11-10) |
| **C. Blocked** | | | | | |
| RD18 | Shot Aftermath [27] | `/research/shooting/aftermath` | D: `Shot Aftermath` | R17, RD18 | ✅ |
| RD19 | Ask evaluation [29] | `/research/assistant-evaluation` (not built) | none | R16 | ✂️ cut by the owner (2026-11-10): public Ask on the hosted demo replaces it |

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

Owner, 2026-11-09 (given during RD12 round 2, instruction 4): "the palyer photos are still square cropped". The Leaders chart on RAPM Ratings no longer clips the photos' rings. Evidence: [`design-RD12`](evidence/research/design-RD12/README.md).

Owner, 2026-11-09 (given during RD12 round 3, instruction 6): the Leaders chart's source label no longer carries the project code IM04.

Owner, 2026-11-09 (given during RD12 round 4, instruction 8): the Leaders chart's old blue-on-black bars replaced with the Research look.

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

## RD07 Patch Notes — ✅ approved by the owner (2026-11-08)

- **Now:** releases newest first (merged PRs and the research branch), grouped entries with badge, date,
  Explore, commit and progress-log links. Plain build. Data in `dashboard/content/patch-notes.json`,
  checked by `dashboard/scripts/check-patch-notes.mjs`.
- **Known gaps:** CourtLens has no version numbers (Databallr shows v4.x).
- **Reference:** `~/Downloads/Projects/Courtlens/databallr — NBA & WNBA analytics, impact metrics, and draft games.html` (+ `_files`),
  the save the owner attached in round 1; the same changelog as `~/Downloads/Webpages/DraftBallr/patch-notes.html`, saved later, so
  the attached save was followed. Rendered offline (scripts and `crossorigin` stripped, a `<base>`, every non-`file://` request
  blocked, scroll-in content forced visible). Measured at 1440: a left-aligned hero ("Changelog" kicker, latest month, 60 px title,
  one subtitle line); releases in a 976 px column, each a 160 px release column (month in small capitals over a 36 px version,
  not sticky) beside 776 px entries; group labels in 11 px capitals over a hairline; entries as plain rows between hairlines, a
  24 px title with a New (accent) or Updated (grey) pill, Explore on the right, one sentence and dot bullets. At 390 the month
  and version share a row and Explore drops under the title.
- **Data check (2026-11-08):** (1) version numbers: none in CourtLens. (2) The notes stop at 2026-11-06; the design phase
  (RD00 to RD06, 2026-11-06 to 2026-11-08) is not listed.

Instructions (owner, 2026-11-08, round 1; the owner answered the gap list and recommendations with "Go with your recommendations
and suggestions for optimal construction and layout of this page. Build it comprehensively."):
1. [x] Go with your recommendations and suggestions for optimal construction and layout of this page. Build it comprehensively.
   - (A) Version numbers: CourtLens's releases numbered in merge order, v1.0 (research workbench) to v1.6 (PR #42); the unmerged
     research branch shows v1.7 with an "Unmerged" pill. Kept in `patch-notes.json`, checked by `check-patch-notes.mjs`, and an
     About line says they were assigned on 2026-11-08.
   - (B) Content: one Updated entry per approved Research redesign (RD00 to RD06) in the research release, each linked to the
     commit that shipped it, checked by the script.
   - (1) Hero: the settled centred hero "Patch Notes", one line, then the latest date, release and change counts and links to
     Learning and Research; Patch Notes draws its own header; the version-number paragraph moves to a collapsed "About this page"
     that credits Databallr as the design reference.
   - (2) Layout: Databallr's article layout, about 1000 px centred, a 160 px release column (month range in small capitals, large
     version, a small "PR #42 · merged Nov 3" line linking the merge commit) beside the entries; sticky while its release is read;
     month and version on one row on a phone. No index or search.
   - (3) Entries: no cards; rows between hairlines; title, a badge pill (New gold, Updated grey, Removed outlined grey, never
     green/red) and Explore on the right with the `arrow-right` icon; the sentence and dot bullets; one quiet footer line (date ·
     commit · Progress log).
   - (4) Release summary: one line in secondary text above each release's entries.
   - (5) Tests: design only, no data or API change beyond (A) and (B); the R11 spec's Patch Notes tests updated, Learning tests
     unchanged.
   — Centred "Patch Notes" hero with the latest date and counts; releases v1.0 to v1.7 in a 1000 px column, each with a sticky 160
   px release column beside plain entry rows (badge pill, Explore, quiet date · commit · log line); seven RD00 to RD06 redesign
   entries; version order checked by the script (107 references). Real data 1,366 values, 0 mismatches; full Playwright 605 passed.

Evidence: [`design-RD07`](evidence/research/design-RD07/README.md).

Instructions (owner, 2026-11-08, round 2; screenshot: v1.7's release column beside its first three Models entries):
2. [x] Looks good. Can we add some type of color attention grabbing to the left side which has the version numbers (which are
   visual dividers).
   — Each release column is now a gold-tinted tile with a 3 px accent rail, the month and version in gold, and the merge line on
   two lines (PR, then date); on a phone the tile is one wrapped row above its entries.
3. [x] I would like a more condensed note of the features added, they take up a little too much space.
   — Entries are condensed: 18 px titles, 14 px text at a 760 px measure, tighter padding and bullets, and the date · commit · log
   line moved into the title row beside Explore. The page is 36% shorter at 1440 (11,840 to 7,567 px) and 23% at 390.

Instructions (owner, 2026-11-08, round 3; screenshot: :3100, v1.7's release column circled, still without the gold tile):
4. [x] I meant the left part with the actual version number
   — No code change: round 2's gold tile is on that column. :3100 was serving round 1's `patch-notes-view.css` with round 2's
   markup (no tile rules, no `pn-entry-side` rule; the Turbopack stale-import issue). Toggling the import line in
   `app/globals.css` (file unchanged) made :3100 serve the current rules; its screenshot then showed the gold tile.

Instructions (owner, 2026-11-08, round 4):
5. [x] remove the vibecodey edge highlight. Unecessary.
   — The 3 px gold rail on each release tile is gone; the tile keeps its gold tint, thin rim and gold version.
6. [x] Don't link any commits/progress log or anything. It should be a very simply list of the features, for end users front facing
   to see. Not really related to the repo or more technical things. (screenshot: v1.7's tile and its first entries with the date,
   commit and Progress log links)
   — The page shows only what a visitor needs: each release's month, version, name and dates, and each entry's title, badge,
   Explore link and one plain sentence. No commit, progress-log or merge links, no per-entry dates, no "Unmerged" pill or branch
   and PR lines, no bullets. Every entry was rewritten in plain language and release names made readable ("Core pages
   redesigned", "Consistent controls", "First release"); five internal entries were dropped (warehouse, offline evaluation,
   evaluation baseline, source policy, Ask provider pool), leaving 58. The JSON keeps each entry's commit, date and log, so
   `check-patch-notes.mjs` still verifies all 85 references.

Instructions (owner, 2026-11-08, round 5; screenshot: :3100, v1.7's tile still with the gold left edge):
7. [x] you are still including that yellow edge highlight. It looks vibecoded remove it
   — No code change: round 4 removed it. :3100 was serving round 2's `patch-notes-view.css` (the 3 px rail and the removed meta
   rules) with round 4's markup. One quick import toggle did not refresh it; removing the import, requesting the page for 12 s,
   re-adding it and requesting again did. :3100 then measured only the 1 px rim (`box-shadow`), no rail.

## RD08 Draft Classes — ✅ approved by the owner (2026-11-09)

- **Now:** rookie tracker, value by pick with intervals, class redrafts, steals and misses, combine beside
  value; no prospect model (D4).
- **Known gaps:** owner direction is to match CourtLens and Databallr, not Draftballr's own look. The Stats
  pre-2000 draft filter isn't wired; one 1982 pick is misattributed (disclosed).
- **Reference:** none. There is no Databallr page for it and Draftballr's look is not copied (owner, 2026-11-06 and 2026-11-08);
  the Draftballr saves were not opened. Each section borrows a named, approved CourtLens Research precedent instead.
- **Before (round 1, :3100):** five tabs (Rookies 2026-27, Value by pick, Classes, Steals & misses, Combine) under the old left-aligned
  header and four stat tiles; three dropdowns (a player dropdown for the rookie, class, combine measurement); old `Table`s; surplus
  green/red without an interval; Coverage, Caveats, Credits and Method (with hashes) repeated under every tab. 4,480–8,861 px tall at
  1440, 7,621–14,133 px at 390; 0 console errors, 0 overflow, 0 broken images.
- **Design check (2026-11-08):** nothing needs new data, an API field or a new analysis. Open questions: (A) the value-by-pick chart
  needs an interval band on the shared `SeasonLineChart`; (B) the rookie colouring is R09's registered 10th–90th percentile rule, not
  an interval; (C) surplus has no interval; (D) old seasons may lack a season photo (Len Bias has no player ID); (E) the combine
  section overlaps Wingspan; (F) the class picker; (G) the hero stat tiles.

Instructions (owner, 2026-11-08, round 1; the owner answered the design proposal and its recommendations with "Go with your
recommendations and suggestions for optimal construction and layout of this page. Build it comprehensively."):
1. [x] Go with your recommendations and suggestions for optimal construction and layout of this page. Build it comprehensively.
   - (1) One scrolling page instead of five tabs: RD04's 1352 px column, RD06's sticky 224 px numbered index beside the sections (a
     collapsed "Sections" disclosure on a phone); old `?tab=` links scroll to their section.
   - (2) Hero: the settled centred hero, one tagline, a meta line (games through, picks, classes) and intro links (Wingspan, Players,
     Learning). The four stat tiles are dropped (G); pick 1 against pick 30 is one line at the start of the slot section.
   - (3) 2026 rookies: a spotlight card after RD05's (team tint, no watermark, season photo, logo beside the code, #pick badge, tiles with
     percentiles, DARKO and RAPM shown, not compared), chosen with `EntityField` over the rookies who have played (never a `<select>`);
     the 60-pick `StatsGrid` with `GridSearch` and `TeamPicker`; then the chosen rookie's past same-pick rookies on `StatsGrid`.
   - (4) What a slot is worth: one line on one axis with the 95% interval as a band (A: an optional band and plain x labels added to
     the shared `SeasonLineChart`), the span, era and measure switches, and its `StatsGrid`.
   - (5) Ranges: the bands on compact `StatsGrid`, green/red only where the 95% interval excludes zero, with a 95% `ToneLegend`.
   - (6) Classes and redrafts: a class search field with suggestions plus previous and next buttons (F), Draft / Redraft / Career,
     `GridSearch`, `TeamPicker`, Steal and Miss as category-tint labels, surplus in gold/blue.
   - (7) Steals and misses: two columns (stacked on a phone), the top three of each as cards, then all 25 on `StatsGrid`; surplus in
     gold/blue (C); the miss wording and Len Bias kept.
   - (8) Combine beside value: correlations on `StatsGrid`, one scatter after RD00's with a measurement switch, and a link to Wingspan
     for every per-player measurement (E).
   - (9) Rookie colouring: R09's registered rule kept, with its own legend line (B).
   - (10) Photos: the season's photo or the site's initials avatar, never a later season's; fallbacks counted in the real-data check (D).
   - (11) How to read and a glossary, then a collapsed "About this page": coverage by class, caveats, sources and credits, method, the
     Walker Russell 1982 #78 disclosure, evidence links and hashes. No design reference credit (none of the layout is Databallr's).
   - (12) Design only: no API, analysis or frozen result changes; the Stats pre-2000 Draft Class filter and any prospect model stay out.
   — One scrolling page in a 1352 px column with a sticky numbered index (a Sections list on a phone; old `?tab=` links scroll to their section); centred hero with a meta line, no stat tiles; a searchable, team-tinted rookie card
   beside its past same-pick rookies, then all 60 picks; one line with a 95% band; ranges green/red only where the interval excludes zero; class search with earlier/later buttons; steals and misses as cards then grids; combine
   correlations, scatter and a Wingspan link; how to read; collapsed About this page. Surplus gold/blue. Real data 212,435 values, 0 mismatches; every photo requested for its own season and team; early classes mostly initials
   (1984: 21 of the 58 who played have a photo). Full Playwright 605 passed.

Instructions (owner, 2026-11-09, round 2):
2. [x] This table needs a title or something telling us that it's the stats of the rookies this year. Also why iss it per 36 stats? you can try designing like the main stats page but for rookies only.
   (Screenshots: the 60-pick rookie table, then the Stats page's NBA Player Statistics table.)
   — Titled "2026-27 rookie stats". Rebuilt on the Stats table's groups and columns (Draft, Profile, Impact, Counting, Eff, Shooting, Other) with its repeated photo strips, from the Stats query's own draft-class filter, default Per Game, with Per 36 and Totals. Per 36 was there because the past-picks comparison uses it; that comparison keeps its own "Vs Past Picks" view and says so.
3. [x] The search bar is too squished.
   — The rookie table had no group header row, so the field sat against the top of the header. It now has the Stats header (30 px of air above the field) and a wider column: 268 px at 1440 (was about 228), 192 px on a phone; the class table's search widened the same way.

Instructions (owner, 2026-11-09, round 3):
4. [x] the search bar is still cramped why is the padding above and below not equal.
   (Screenshot: the rookie table's Vs Past Picks view.)
   — The Vs Past Picks view had no group row and the header cell padded only below. The search now fills both header rows, centred: 17.25 px above and below in every rookie view and the class table at 1440, 18.25 px at 390. Vs Past Picks has group labels too.
5. [x] why is the past picks not ordered by draft year? Is there a reason for the arbitrary order.
   (Screenshot: the rookie card beside "Past number 2 picks over their first 10 games".)
   — No reason: it was the API's order, highest PTS/36 first, with no sign of that. The table now has a Year column, newest first with the current rookie on top, and every column sorts.
6. [x] should we denote draft pick and round with something like "R1P1" or something more commonly known. I don't know if we do that with ours currently.
   (Screenshot: the rookie table's Per Game view.)
   — Used "R1 #2" (round, overall pick), the form the Players page bio already uses, in the rookie and class tables, cards, search suggestions and steal and miss lists; the class table's separate Rd column is merged into it. The overall number is kept so second-round picks read R2 #31, and value-by-slot stays a plain pick number.

Instructions (owner, 2026-11-09, round 4; answering the list of glaring improvements proposed after round 3):
7. [x] Fix them all, comprehensively.
   - (1) Retitle "Biggest steals" and "Biggest misses" "Most above their slot" and "Furthest below their slot"; the maths and the Steal/Miss tags stay.
   - (2) Dates in the Stats format instead of 2026-11-08.
   - (3) Old classes: only picks who played by default, with a switch to show everyone.
   - (4) Steal and Miss tags in their own narrow column beside Surplus, not in "From".
   - (5) "First NBA team CHI" becomes "CHI · 1984-85".
   - (6) Combine chart axis numbers the same size as the slot chart's.
   - (7) Rookie picker: one field instead of a chip and a search box above the card.
   - (8) Slot table: a narrow pick column.
   - (9) Ranges table: no Verdict column repeating the same answer on every row.
   — All nine done: "Most above their slot" and "Furthest below their slot"; dates as Nov 8, 2026; classes open on Played with an All picks switch (a never-played Miss such as Len Bias stays); a Tag column beside Surplus; subtitles CHI · 1984-85; the combine chart redrawn at its real width with 10 px labels; one rookie search field; an 80 px pick column; one sentence for a shared verdict, the column only when rows differ.

Instructions (owner, 2026-11-09, round 5):
8. [x] is there a reason this table also uses pts/36? I'm confused. also make the table bottom aligned with the card to the left of it.
   (Screenshot: "Past number 4 picks over their first 9 games".)
   — Answered: it is the same comparison as the card, per 36 so rookies on different minutes compare fairly, and only per-36 lines are served. The heading now says "per 36 minutes". The table ends level with the card at 1024 px and wider (0 px apart, measured); stacked on narrower screens. Column widths now leave room for a scrollbar, so TS% is not clipped.
9. [x] Also it only goes back to 1983-84 for a reason correct?
   — Answered, no change: yes. Comparing first N games needs game-by-game logs, and complete box scores and logs start in 1983-84 (R09's `ROOKIE_POOL = (1983, 2025)`; full-history plan).

Instructions (owner, 2026-11-09, round 6):
10. [x] can this chart mark commonly known ft'in" heights?
   (Screenshot: "Height (no shoes) against first-four-season win shares".)
   — Done: height, wingspan and standing reach now mark the axis in feet and inches, every 3 inches (6′0″, 6′3″, 6′6″), every 6 on a phone, and hovering a dot gives the same form. Wingspan minus height stays in inches because it is a difference.

Evidence: [`design-RD08`](evidence/research/design-RD08/README.md).

## RD09 Research landing — ✂️ cut by the owner (2026-11-09)

- **Now:** five headline cards (R15, R08, R07, R05 numbers; R16 in progress), how the results were tested,
  every Research page by group.
- **Instructions (owner, 2026-11-09):**
  1. [ ] Why is there a research landing page? Should we just cut that? The pages speak for themselves.
     — Answered: it repeated numbers and links the menu already gives. Owner: "Yes, cut it." See 3.
  2. [x] also can you make the drop down section headers more prominent. They kind of blend in, with the grey text (impact/models/shooting/etc.)
     (Screenshot: the Research menu.)
     — Done: bold white capitals in the menu and the phone drawer, replacing the dim grey. Not gold, which marks the page you are on. Then blue, see 4.
  3. [x] Yes, cut it.
     — Done: the page and the menu's Overview group are gone; `/research` redirects to Six-Factor RAPM; the Research links on Learning and Patch Notes are removed. Learning's Out-of-Time Testing and Prospective Scoring topics already cover how models are tested, so nothing was moved.
  4. [x] Also, make the menu headers a different colors or a different shade of grey. THey kind of blend in with the other subheaders.
     (Screenshot: the Research menu with white capitals.)
     — Done: blue (`--color-category-2`) capitals in the menu and the phone drawer, apart from the white item names, grey descriptions and the gold current page. Then smoke white, see 5.
  5. [x] Can we try a smokier white or something. Not the grey caption text, or white subheader titles
     — Done: `--color-text-smoke` (#c8cdd4) capitals, between the white item names and the grey descriptions. Owner: "Great, that works."

## RD10 Metric Backtest — ✅ approved by the owner (2026-11-09)

- **Now:** nine metrics fixed before each game, 11,979 games; RMSE, gains with intervals, orderings,
  calibration, the 2026-27 prospective score.
- **Reference:** none. No Databallr page for it; each section borrows a named, approved CourtLens Research precedent.
- **Before (round 1, :3100):** ten stacked sections under the old left-aligned header and four stat tiles; old `Table`s; an overlaid RMSE chart with gold and blue as metric
  colours; calibration served but drawn only as one number per metric; hashes and a seed in the page body; raw ISO dates. 5,644 px tall at 1440, 9,475 px at 390; 0 console errors, 0 page overflow.
- **Design check (2026-11-09):** nothing needs new data, an API field or a new analysis. The pooled table misleads row against row (each row covers its own seasons: Projected Impact has the
  highest pooled RMSE, 14.66, and the largest gain over the baseline, +0.86, on two seasons). The served 2026-27 summary stops at Nov 4, 2026 with 0 prospective games: R08's timer was never installed, and only the owner runs the refresh.

Instructions (owner, 2026-11-09, round 1; the owner answered the design proposal and its recommendations with "Go with your
recommendations and suggestions for optimal construction and layout of this page. Build it comprehensively."):
1. [x] Go with your recommendations and suggestions for optimal construction and layout of this page. Build it comprehensively.
   - (1) RD00's 992 px column, centred hero (tagline, meta line, links to RAPM Ratings, Projected Impact, Learning), no index; the four stat tiles, the overlaid RMSE chart, swatches and the chart source line are cut.
   - (2) The answer: one plain sentence, the two unranked pairs, and that this tests ratings, not game forecasts.
   - (3) Head to head: a 9×9 compact `StatsGrid` of all 36 RMSE gains with intervals, green/red only where the interval excludes zero, a 95% `ToneLegend` (Q1: yes).
   - (4) Other scores: the paired table on `StatsGrid` with Against and Seasons selects; Verdict becomes one sentence when every row agrees.
   - (5) Season by season: one line with a 95% band, a chosen metric's gain over a chosen reference (Q2: replaces the overlay), then RMSE by season on `StatsGrid`.
   - (6) Scores and calibration: the pooled grid headed "each over its own seasons", then predicted against observed for a chosen metric against Team net.
   - (7) 2026-27: prospective first, hindsight apart and labelled, on `StatsGrid`.
   - (8) How to read: three short cards and a `Glossary` of the nine metrics, DARKO's omission and credits. Then a collapsed About this page: caveats, method, rule, hashes, the R08 evidence link.
   - (9) Rows stay in registered order, Team net first; the page never ranks anything itself.
   - (10) Nine-row tables take no `GridSearch` (Q3: RD08's compact tables have none). Team net's Minutes replaced shows a dash (Q4: the baseline rates no players).
   - (11) Shared additions: an optional zero line on `SeasonLineChart`; optional axis and unit wording on `ReliabilityPlot`.
   — Built as proposed: the answer in one sentence, a 9×9 of all 36 gains coloured only where the interval excludes zero, every score against a chosen metric, one line with a band and zero on the axis, pooled scores with a warning not to compare rows, a calibration plot in category tints beside its bins, 2026-27 kept apart, How to read and a collapsed About. Real data 29,440 values, 0 mismatches; full Playwright 609 passed, 17 skipped, 0 failed. The page shows 0 prospective games until the owner runs the 2026-27 refresh.

Instructions (owner, 2026-11-09, round 2; answering the five improvements proposed after round 1):
2. [x] Yes, do all 5. Complete it comprehensively.
   - (1) Run the 2026-27 refresh, so games since the freeze are scored, and re-check the prospective table on real data.
   - (2) Collapse the metric glossary, keeping the three short cards; DARKO's omission stays visible as one line.
   - (3) Show Winner picked gains in percentage points.
   - (4) Trim the answer section's unranked-pairs paragraph.
   - (5) Cut the calibration chart's extra captions; the source moves to About.
   — All five done: 2026-27 refreshed to 25 prospective and 121 hindsight games through Nov 8, 2026; definitions collapsed with one visible DARKO line; Winner picked gains in pts; the answer's unranked line shortened; the calibration panel's captions gone, source in About. The refresh exposed hindsight gains drawing as dashes (pairs served Team net first); the page now reads either direction. Real data 29,738 values, 0 mismatches; full Playwright 611 passed, 17 skipped, 0 failed.

Instructions (owner, 2026-11-09, round 3):
3. [x] Approved, install the timer.
   — Approved. Timer `courtlens-metric-backtest` added to `scripts/install_data_refresh.sh` and enabled: it fires daily at 15:00 UTC and scores only when the last score is at least 7 days old, so 2026-27 updates about weekly.

Evidence: [`design-RD10`](evidence/research/design-RD10/README.md).

## RD11 Projected Impact — ✅ approved by the owner (2026-11-09)

- **Now:** frozen 2026-27 projections with intervals (roster / rookies / everyone), aging curve, the test
  against carry-forward and time decay, the weekly prospective score (first scheduled run 2026-11-12).
- **Reference:** none. No Databallr page for it; each section borrows a named, approved CourtLens Research precedent.
- **Before (round 1, :3100, 2026-11-09):** four stat tiles and eight stacked sections, full width with no side gutter, old tables. 4,857 px tall at 1440, 6,507 px at 390; 0 console errors, 0 overflow, 0 broken images. Range bars clipped at −6 while served lows reach −6.99 (71 of 661 players); green/red contribution bars with no interval; gold/blue aging lines as labels; copy saying the weekly score reports ridge while the table left it out; 107 hindsight games with a green +28.43; project wording, ISO timestamps and hashes in the body; per-season results served but not drawn.
- **Design check (2026-11-09):** nothing needs new data, an API field or a new analysis. Not served and left out: position, an interval on the aging curve, time decay's test gain over carry-forward (not computed), the weekly trend (`prospective_by_week` is empty until scheduled runs).

Instructions (owner, 2026-11-09, round 1; the owner answered the design proposal and its four recommendations with "Go with your
recommendations and suggestions for optimal construction and layout of this page. Build it comprehensively."):
1. [x] Go with your recommendations and suggestions for optimal construction and layout of this page. Build it comprehensively.
   - (1) 992 px column, centred hero (tagline, meta line, links); the four stat tiles are cut.
   - (2) The answer in one sentence: yes against carry-forward, small against time decay; the numbers stay in the grids.
   - (3) 2026-27 projected RAPM, points per 100 possessions: `StatsGrid`, `GridSearch`, `TeamPicker`, the three-way switch, the value with its interval under it, a range bar on desktop whose axis fits the served intervals, age, last season, minutes. The "not true ability" line stays. Q1: projections come before the test. Q2: the `#` column is cut, sorted by Projected. `Why` becomes a small tool on the player row; `?player=` stays.
   - (4) Why a player is projected there: a tinted player card, `LookupInput` search over the frozen players, training average + sources = projection, gold/blue bars readable on a phone, the player under all five ratings.
   - (5) The test: Pooled / 2024-25 / 2025-26 switch, compact Players and Games grids, gains against both baselines, registered order, the ridge line visible, a small rookies and returners grid.
   - (6) 2026-27 score: prospective first, hindsight apart and labelled, all five ratings, the formula in About. Q3: hindsight gains stay uncoloured. Q4: the score is not forced; the first scheduled run is 2026-11-12.
   - (7) Aging curve: category tints, captions cut, the "ends are thin" line kept, a statement that no interval is served.
   - (8) Do the intervals hold: a five-row compact grid and one plain sentence that they ran wide.
   - (9) How to read: three short cards, glossary collapsed. (10) About this page, collapsed: method, target, limits, hashes, DARKO and EPM credit, evidence link.
   - (11) "What did not work" is dissolved: each finding moves beside its evidence and stays visible.
   — Built as proposed: the answer in one sentence, the projections on `StatsGrid` with bars on one scale, a tinted Why card with search, per-season test grids, 2026-27 prospective first and hindsight uncoloured, category-tinted aging lines, coverage, How to read and a collapsed About. Real data 105,044 values, 0 mismatches; full Playwright 613 passed, 17 skipped, 0 failed. The page shows 0 prospective games until the first weekly score, due around Nov 12, 2026.

Instructions (owner, 2026-11-09, round 2; asked "Are there any things we can do to improve the page?", then, answering the nine improvements proposed):
2. [x] Yes, do them all comprehensively.
   - (1) Rookies and returners view: drop the RAPM and Minutes columns (every row is a dash) and show Years in league.
   - (2) Say what "it" is: the answer names the frozen model, and the row reads "Projected Impact" with LightGBM under it.
   - (3) Put the size of the edge in the answer: one line with game error for the model, time decay and carry-forward.
   - (4) Phone table: the Why arrow stays on the player's line, and names aren't cut off.
   - (5) Test grids: gain columns ahead of RMSE, so they are on screen on a phone.
   - (6) Collapse hindsight, with one visible line saying it isn't a test.
   - (7) Why card on a phone: a switch between By source and Largest inputs instead of stacking them.
   - (8) Bar scale: −7, 0 and +10 labelled in the column header; that sentence leaves the legend.
   - (9) Small fixes: the same projection takes one colour in the card header and its tile; coverage rows in minutes order, "Under 500" before "No RAPM"; aging dots only on hover.
   — All nine done: no all-dash columns, the model named in the answer and rows, the size of the edge in one line, the phone table's arrow on the player's line and names whole, gains first, hindsight collapsed, a phone switch for the two lists, the scale in the header, and the three small fixes. Real data 108,497 values, 0 mismatches; full Playwright 616 passed, 17 skipped, 0 failed.

Instructions (owner, 2026-11-09, round 3):
3. [x] looks good, approved.
   — Approved. The settled rules are in the alignment plan's "Research pages" pattern ("Settled in RD11"). The prospective table still needs a real-data check after the first weekly score, due around Nov 12, 2026.

Instructions (owner, 2026-11-09, round 4; asked "Can we do that now?" about the prospective table's real-data check, then answered the recommendation to force the score):
4. [x] Yes do that now.
   - Force the 2026-27 score (`courtlens refresh-projected-impact --force`) and check the prospective table on real data.
   — Done: 39 games added, 25 prospective and 121 hindsight through Nov 8, 2026, the earlier rows unchanged. The table renders on real data, 108,627 values, 0 mismatches. The first result goes against the model: margin RMSE 16.80 against 15.10 for time decay, on 25 games. The next automatic score moves to about Nov 17, 2026.

Instructions (owner, 2026-11-09, round 5; answering the recommendation to connect the prospective result to the test):
5. [x] Yes, go with your recommendation.
   - One line above the prospective table: the games so far are too few to overturn the test, and the section will settle as the season goes.
   — Done: the line sits above the table with served counts, and shows only while the sample is under one test season. Real data 108,631 values, 0 mismatches; full Playwright 616 passed, 17 skipped, 0 failed.

Instructions (owner, 2026-11-09, round 6):
6. [x] Okay. I approve this page.
   — Approved after five build rounds. The first prospective score is on the page (25 games, verified on real data); the next automatic score is about Nov 17, 2026.

Evidence: [`design-RD11`](evidence/research/design-RD11/README.md).

## RD12 Lineup Model — ✅ approved by the owner (2026-11-10)

- **Now:** registered verdict (ridge better, no practical difference), the lineup tool with intervals, the
  backtest placement, the UMAP player map with its seed-instability notice.
- **Reference:** none. No Databallr page for it; each section borrows a named, approved CourtLens Research precedent.
- **Before (round 1, :3100, 2026-11-09):** four stat tiles and ten stacked headings, full width; 9 old tables, 5 native player dropdowns. 7,246 px tall at 1440, 10,530 px at 390; 0 console errors, 0 overflow, 0 broken images. The top chart fits its axis to ±0.000029, so a 0.000011 gap fills the frame in red; the map's warning sits below the map; correlation reads 1.0000 (served 0.9999999982 at its lowest); backtest rows alphabetical, 2-season rows unmarked; the Example note shows with no result when weights are absent; R01, R08, IM02, a docs path and hashes in the body.
- **Design check (2026-11-09):** nothing needs new data, an API field or a new analysis. Not served and left out: team or real lineup presets (only the default five), the 200 panel lineups (only the count), a per-player share of a five's net rating, an interval on the interaction, position or style on the map. The tool's `newcomer` state never occurs (546 own vector, 256 box).

Instructions (owner, 2026-11-09, round 1; the owner answered the design proposal and its three recommendations with "Go with your
recommendations and suggestions for optimal construction and layout of this page. Build it comprehensively."):
1. [x] Go with your recommendations and suggestions for optimal construction and layout of this page. Build it comprehensively.
   - (1) Hero: centred, 992 px column, one line, links to RAPM Ratings and Metric Backtest; the four stat tiles are cut.
   - (2) Does it beat ridge? One sentence (both miss by 94.08 per 100, ridge's registered edge is 0.000011, no practical difference), then one pooled interval strip on a shared scale: ridge over home court only, lineup over home court only, lineup over ridge.
   - (3) Lineup tool: five player cards with subdued team tint, `PlayerAvatar` and search in place, a reset to the default five; a two-row compact grid of net rating and 80% interval at 2 decimals; the interaction as one sentence; "model output, not a forecast" visible. One Rating column, a sentence saying ridge and additive ratings differ by at most 0.0066. Weights absent: one plain line, no pickers, no Example note.
   - (4) The test: gains first, then errors, by season and pooled, 95%, including the home-court gains; interaction size against additive size; correlation at full digits.
   - (5) In the game backtest: 11 rows in registered order, gains before RMSE, a "don't compare rows across different seasons" line, a link to Metric Backtest, no `GridSearch`.
   - (6) Player map: warning above the map (1.9% against 1.8%), neutral dots, the five in `--color-category-3`, names on hover, a statement when a chosen player has no dot.
   - (7) How to read: three short cards and a collapsed glossary. (8) About this page, collapsed: selection grids, coverage, cold start, rule, method, credits, hashes, the restored-scores disclosure in plain words, the evidence link.
   - Q1: the ridge-against-lineup gains stay neutral, with "better by the registered rule, no practical difference"; other backtest rows keep green/red. Q2: the tool comes before the test detail. Q3: the map stays visible, last among the results, no player search.
   — Built as proposed: the answer in one sentence with the gap drawn to scale on zero, five team-tinted player cards with search in place, net rating with its 80% interval, gains before errors, the backtest in registered order, the warning above the map, How to read and a collapsed About. Real data 6,628 values, 0 mismatches; full Playwright 620 passed, 17 skipped, 0 failed.

Instructions (owner, 2026-11-09, round 2; three screenshots, the search open in the first card and the Six-Factor Leaders list):
2. [x] the player search in the lineup looks wonky
   — The search now takes the name block's place at the card's full width, so the photo and rating stay and nothing moves. The card's own tool turns into the cancel, with no stray X; the list opens only once you type; Escape or a click elsewhere leaves it.
3. (Question) Should we add symbol pg,sg,sf,pf,c positions, or does that matter fro the lineup tool?
   — Answered, no change: position is not an input to either model, and the tool's API doesn't serve it (only the Stats query has estimated positions). Recommended leaving it off. Awaiting the owner.
4. [x] on six-factor rapm page, the palyer photos are still square cropped, and it looks weird with their circle portraits.
   — The Leaders chart's label box clipped the photos' rings flat at the top and left. It no longer clips; the name and caption still truncate themselves. All portraits on both Six-Factor tabs checked at both widths.
5. (Question) Are there any more improvements we can make to the page?
   — Answered with a list of proposals; nothing built. Awaiting the owner.

Instructions (owner, 2026-11-09, round 3; answering the six improvements proposed after round 2, and the offered IM04 label fix):
6. [x] You can make all of those improvements, comprehensively
   - (1) Show how close the two models are: a line with the actual gap for that five.
   - (2) Stop the jump when swapping a player: keep the old result dimmed until the new one arrives.
   - (3) Trim the test section's intro to two text blocks.
   - (4) Shorten the backtest row captions: "3 seasons · 3,655 games", naming seasons only on the two shorter rows.
   - (5) Smaller photos on phone cards, saving about 200 px down the tool.
   - (6) One line saying the model doesn't use positions.
   - (7) The Leaders chart on RAPM Ratings: drop "IM04" from its source label.
   — All seven done: the tool says how far apart the two models are for that five, a swap keeps the last result dimmed with no jump, the test's intro is two blocks, backtest captions read "3 seasons · 3,655 games" except on the two shorter rows, phone cards are 196 px shorter down the tool, one line says neither model reads positions, and the Leaders source reads "CourtLens lineup model". Real data 6,730 values, 0 mismatches; full Playwright 622 passed, 17 skipped, 0 failed.

Instructions (owner, 2026-11-09, round 4; two screenshots of the RAPM Ratings Leaders chart):
7. (Question) what does 0 and 9.6  on the left and right mean.
   — Answered: the ends of the bars' scale. 0 is an average player and 9.6 was the leader's 9.61, rounded. The new scale says so in words.
8. [x] Also these blue/black bars are remannts of the old ugly design. Make sure you clean them up to the updated design
   — The Leaders chart is a new Research-native list (`LeaderBars`): thin gold bars on the Research track, the scale labelled above them and lined up with the bars, the unit in the title. Blue was wrong for values above zero. Real data 598 values across 4 scopes, 0 mismatches; full Playwright 622 passed, 17 skipped, 0 failed.

Instructions (owner, 2026-11-10, round 5):
9. [x] I approve this page.
   — Approved after four build rounds. Left open from round 4, not built: whether the Leaders scale keeps "9.61 is the top of this list", and whether the three older `RankedBars` views (tracking stats, play-type shooting, defensive matchups) move to `LeaderBars`.

Evidence: [`design-RD12`](evidence/research/design-RD12/README.md).

## RD13 Signal vs Noise — ✅ approved by the owner (2026-11-10)

- **Now:** stabilization points for 20 stats with intervals, the shrinkage test, a player lookup; Stats has a
  Shrunk toggle.
- **Reference:** none. No Databallr page for it; each section borrows a named, approved CourtLens Research precedent.
- **Before (round 1, :3100, 2026-11-10):** four stat tiles and seven stacked sections under the old left-aligned header, full width; 5 old tables, 3 native selects (20 stats, 43 prior seasons, 43 example seasons not limited to the player's). 5,258 px tall at 1440, 8,086 px at 390; 0 console errors, 0 page overflow, 0 broken images (the nine-column table runs 651 px wide inside its scroll frame at 390). The 3P% curve draws the fitted line out to 7M/3 (1,057 3PA), so it visibly crosses 0.5 at about 419 while the page says "not reached"; the example shows the player twice (EntityField chip and identity block); the season path draws 3P% only (FT% and TS% are served) in gold/blue; prior minus shrunk is served but not drawn; a project code and two hashes in the body.
- **Design check (2026-11-10):** nothing needs new data, an API field or a new analysis. A player's seasons come from the existing `GET /api/workbench/players/{id}/career`, limited to seasons with a prior (1984-85 to 2026-27). 3P%'s largest bin is 0.486 with a 95% interval of 0.401 to 0.549 and M's interval reaches 500, so "not reached" is worded with that interval. Prior minus shrunk includes zero for 3P% and TS% under 50 attempts (neutral). Not served and left out: stabilization by season or position, 3P% beyond 480 attempts, an interval on the season path, a per-season shrinkage test, shrinkage for per-36 rates.

Instructions (owner, 2026-11-10, round 1; the owner answered the design proposal and its four recommendations with "Go with your
recommendations and suggestions for optimal construction and layout of this page. Build it comprehensively."):
1. [x] Go with your recommendations and suggestions for optimal construction and layout of this page. Build it comprehensively.
   - (1) Hero: centred, 992 px column, one line, a meta line (player-seasons, players, seasons), links to the Stats Shrunk columns and Learning; the four stat tiles are cut.
   - (2) The answer in one sentence: FT% after about 27 attempts, TS% after 169, 3P% not reached in the observed bins (0.49 at 480), shrinking predicts next season better for all five stats tested.
   - (3) How many attempts: an interval strip with a Percentages / Per 36 switch, a dot at 0.5 with its 95% interval, a hollow mark at 0.7, a tick at the typical season; 3P% drawn only over its observed range and labelled "Not reached". Then a compact `StatsGrid` (0.5 and 0.7 with intervals under them, typical season, largest bin), no `GridSearch`.
   - (4) Reliability by sample size for one stat: bins with 95% bars, the 0.5 and 0.7 lines, the fitted line drawn only over the observed bins; the bins table collapsed under it.
   - (5) Worked example: a team-tinted card with `PlayerAvatar` and search in place, a season picker listing only that player's seasons, the selection rule in one line, a compact grid (made/attempts, raw, shrunk with its interval, a small raw-against-shrunk strip with the league prior), one formula line, the season path with a 3P% / FT% / TS% switch in `--color-category-3` / `-4`.
   - (6) Does shrinking help: one sentence, a compact grid with an All / under 50 / 50–199 / 200+ switch, gains over raw and over the prior mean with intervals first, then errors; green only where an interval excludes zero.
   - (7) Priors over time: one line per stat from 1984-85 to 2026-27 with a Prior mean / Strength switch, points on hover, one line comparing strength with the stabilization point.
   - (8) What this doesn't cover: the 7 families with reasons, visible. (9) How to read: three cards and a collapsed glossary. (10) About this page, collapsed: method, coverage, seed check, credits, registration and hashes.
   - Q1: the strip is sorted fastest to slowest within each family, with no rank. Q2: clicking a strip row opens its curve, with kit chips grouped by family. Q3: errors as RMSE in percentage points, gains as served in squared points with their intervals. Q4: the priors-over-time chart is added.
   — Built as proposed: the answer in one sentence, strips per family with 3P% drawn only over its observed range, the curve with chips, a team-tinted example card with search in place and the player's own seasons, the test with gains first, the prior over 43 seasons, coverage visible, How to read and a collapsed About. One change: the fitted curve is drawn only for stats that reach both levels, because for 3P% it crosses 0.5 at 419 inside the observed range. Real data 10,221 values, 0 mismatches; full Playwright 624 passed, 17 skipped, 0 failed.

Instructions (owner, 2026-11-10, round 2):
2. [x] give the selector highlight breathing room around the stats (fts, ftr, fg, etc.) It seems squished.
   — The stat names in the strip are now the kit's ghost button (12 px each side) instead of the unpadded text variant, so the pressed outline no longer hugs the label; the phone label column went from 72 to 80 px so "Rim FG%" fits.
3. [x] why does pressing a menu button in this chart/table auto scroll? I thought it wouldn't is there better behaviour?
   — It scrolled because round 1 made a strip press both select the stat and jump to its curve (Q2). Now a press only selects: the row stays outlined, the page holds still, and the curve below changes. Moving there is the reader's choice, through a "{stat} curve" button at the end of the strip's key (a smooth scroll, instant under reduced motion), and the heading lands at the site default, 80 px under the header. 625 passed, 17 skipped, 0 failed

Instructions (owner, 2026-11-10, round 3):
4. [x] make the attempt number axis a little more visible
   — The strip's attempt axis is 12 px (was 10) in the secondary on-background colour (was tertiary), weight 500.
5. [x] Should we add a small button near the stats to jump to their curves instead of the button in the bottom right
   — Yes: every strip row has a kit chart icon button ("Go to the {stat} curve") in one column beside the names; it selects that stat and scrolls to its curve. The name still only selects. The button at the bottom right is gone. On a phone each row puts the name, icon and value on one line with the track full width under them (342 px, was 154).
6. [x] can we make this content below the table center aligned
   — The chart keys on the page are centred.
7. [x] Is there anything more we can do to improve this page.
   — Answered with suggestions in the session, nothing built until the owner picks.

Instructions (owner, 2026-11-10, round 4; the owner answered the six suggestions of round 3 with "Do them all comprehensively."):
8. [x] Do them all comprehensively.
   - (1) Brighter axes on every chart. — The curve, the example scale (which gains a 0% to 100% axis, 0/50/100 on a phone), the season path and the league prior use the strip's 12 px secondary axis labels.
   - (2) Tie the strip and the curve together. — The curve marks each reached level where it crosses (filled 0.5, hollow 0.7, in the curve's colour) with its served 95% interval, and a typical-season line; 3P% has only the typical season.
   - (3) Clearer sample wording. — Sentences spell the unit out ("480 three-point attempts", "70 attempts at the rim"); the strip and tables keep "3PA".
   - (4) Fewer rows of curve chips. — One kit select beside the curve's heading, grouped Percentages / Per 36 minutes.
   - (5) The test table on a phone. — A Gains / Errors, RMSE switch at phone width, so the table never scrolls sideways; desktop unchanged.
   - (6) A what-if in the worked example (approved by the owner here). — Sliders for attempts and raw rate on 3P%, FT%, 2P% and Rim FG% (when served), starting from the player's season; shrunk value, raw, league prior, the weight on the player's own attempts, the formula, a reset; a posterior mean from the served prior, no interval, said on the page.
   — Built as listed. Real data 10,613 values, 0 mismatches, 0 console errors, 0 overflow; 12 portraits, 0 faults; `r03-signal-noise` ×3 27/27; Vitest 854. Full Playwright not run: no shared code changed (owner's rule, 2026-11-10).

Instructions (owner, 2026-11-10, round 5):
9. [x] Alright. I approve this page.
   — Approved after four build rounds; the settled rules are in the alignment plan ("Settled in RD13"). The full Playwright run owed under the owner's rule: 627 passed, 17 skipped, 0 failed.

Evidence: [`design-RD13`](evidence/research/design-RD13/README.md).

## RD14 Win Probability — ✅ approved by the owner (2026-11-11)

- **Now:** the live model's page with the final-test report, the nightly scorecard and WPA.
- **Decision (owner, 2026-11-10):** a uniform design pass so it looks like the other Research pages, then a model upgrade (F05). Presentation only: model, frozen results, ledger and API unchanged.
- **Reference:** none. No Databallr page for it; each section borrows a named, approved CourtLens Research precedent.
- **Before (:3100, 2026-11-10):** the old full-width layout under four stat tiles (test log loss, calibration error, prospective games, drift), then old tables for the scorecard (two rows), a 15-game ledger, the phase grid and two 15-row WPA lists side by side, a bulleted "What did not work", and a visible model card with every hash; 4,072 px at 1440, 7,141 at 390. Screenshots: [`f03-before-full-1440`](evidence/finish/f03/f03-before-full-1440.png), [`f03-before-full-390`](evidence/finish/f03/f03-before-full-390.png).
- **Content check (2026-11-11, read only):** the R15b freeze serves the card (2,439 test games in 2024-25 and 2025-26; gates A1 +0.0130, 95% +0.0089 to +0.0169, and A2 0.0083 against 0.02, both passed), the nightly scorecard (47 prospective games Nov 4 to Nov 9: CourtLens 0.3287 log loss, ESPN 0.3212, gap −0.0075, 95% −0.0336 to +0.0167; 107 pre-freeze replay games; drift 0.0448 inside 0.0306 to 0.1121; 60 recent games) and WPA for 2026-27, 2025-26 and 2024-25 (the 200 highest by WPA and by clutch WPA, 236, 242 and 236 players). Found: the old "What did not work" read every step's gain as "over S2"; R15a's table shows the selection gains are 90% intervals against S0, S0, S1, S2, S2, S2, the test gains 95% against S0, S0g, S1, S2, S2, S2, and S0g was a diagnostic, not a rejected step.

Instructions (owner, 2026-11-11, round 1; the owner was asked to confirm their seven-point proposal and answered "Approve as written"):
1. [x] Approve as written.
   - (1) A centred hero, "Win Probability", over a meta line: frozen date · prospective game count · checked nightly against ESPN. 992 px column.
   - (2) The answer first: one sentence computed from the scorecard (2026-27 prospective log-loss gap against ESPN, with its 95% interval). "Can't be told apart" when the interval includes zero.
   - (3) The live scorecard as a compact `StatsGrid` with intervals under each value, and drift as one line. The two calibration charts restyled with 12 px axes and centred keys (RD13). The per-game ledger behind a small toggle in the same section (RD16 pattern), with team logos beside codes.
   - (4) The final test (2024-25 and 2025-26): a phase Segmented over one `StatsGrid` with intervals, plus its calibration chart.
   - (5) "What didn't help": the negative results, with pass and fail as words, not colours.
   - (6) Win probability added: one sortable `StatsGrid` with `GridPlayer` photos, columns for WPA and clutch WPA, season switch and phone column groups. Labelled credit assignment, sorted not ranked.
   - (7) How-to-read cards, a collapsed glossary, and a collapsed About holding the model card, identifiers and hashes.
   — Built as proposed: the centred hero and meta line; the answer ("Not so far … the two can't be told apart"), with the final test's own gap as a second line and both log losses and the gap drawn on one axis from zero (RD12); the scorecard grid (gap with its interval first, then log loss, Brier and calibration error, phone column groups), drift in one line, the live calibration chart, the 107 replayed games behind one line and a toggle (RD11, never coloured), the 60 most recent games behind a toggle with logos beside both codes; the final test as one grid per phase (CourtLens, ESPN and the gap with intervals; green only where the gap clears zero), its chart and the two rules in words; "What didn't help" as a grid of every step with its selection gain (90%) and test gain (95%) against the right reference, "Kept", "Not kept" or "Diagnostic" in words, uncoloured, and four short findings; WPA as one sortable, searchable grid with season photos and logos, sorted not ranked, season in the URL, phone column groups; How to read, the glossary and a collapsed About with the model card and identifiers. On a phone the phase switch is a select (six choices) and the GP column moves under the name. Calibration axes are HTML at 12 px over a square plot, so they stay 12 px at every width; points show on hover. The fixture now holds the real API's answers of 2026-11-11 (47 prospective games; three full WPA seasons). Evidence: [`f03`](evidence/finish/f03/README.md).

Instructions (owner, 2026-11-11, round 2):
2. [x] Okay. I approve this page.
   — Approved after one build round; the settled rules are in the alignment plan ("Settled in RD14"). Full Playwright for this state: 641 passed, 17 skipped, 0 failed (round 1).


## RD15 RAPM Ratings tab — folded into RD00 (round 3)

- **Now:** the 1Y / 2Y / 3Y ratings table and the sealed experiment, a tab of Six-Factor RAPM; its header
  already follows row 18.
- **Instructions:** _(owner)_

## RD16 Points Forecasts — ✅ approved by the owner (2026-11-10)

- **Now:** next-game points estimates, their out-of-time test, the prospective ledger; Evaluation Archive
  linked from it.
- **Reference:** none. No Databallr page for it; each section borrows a named, approved CourtLens Research precedent.
- **Before (round 1, :3100, 2026-11-10):** `/forecasts` under the old left-aligned header, full width: a coverage chart, four stat tiles, then gates, holdout, slices and ledger as 5 old tables with badges; 5,397 px tall at 1440, 6,570 at 390. `/evaluation` the same look, 1 old table, 1,544 / 1,976 px. 0 console errors, 0 overflow, 0 broken images, 0 native selects on both. Project codes in the body (`basketball-points-v1`, `prior_blend`, `player_only`, `player_plus_context`, "Block F", "M6"); the phone subtitle is cut mid-word; the ledger has no photos and no logo beside CLE, PHI, IND, NOP, MIN or HOU.
- **Content check (2026-11-10):** (A) the "prospective" ledger is a back-dated pipeline test: all 489 forecasts were issued Oct 1, 2026 for games on Jan 15–17, 2026, inside the 2025-26 final-test season (`issue-forecasts --as-of-date 2026-01-15`, workbench progress log), yet the page calls it "Genuine Prospective Issuance" and "Live Scored"; no 2026-27 forecast has been issued. (B) The ledger API sorts on tied fields, so paging 489 rows by 100 returns 420 unique. (C) The archive's Data Health rows describe today's database (latest build Nov 10, 2026), not the frozen experiment. (D) Slice changes are coloured by sign with no interval, slice labels show raw keys, and the "Awaiting 2026-27 tipoff" note contradicts the served status. (E) The archive's split dates and reference-points formula are fixed in `evaluation/config/baseline-v1.yaml`, not served.

Instructions (owner, 2026-11-10, round 1; the owner answered the design proposal and its four recommendations with "Go with your
recommendations and suggestions for optimal construction and layout of this page. Build it comprehensively."):
1. [x] Go with your recommendations and suggestions for optimal construction and layout of this page. Build it comprehensively.
   - (1) One centred hero with two route tabs, Points Forecasts and Evaluation Archive; `/evaluation` keeps its URL.
   - (2) The answer in one sentence (the simple blend stays; player-only 0.015 points better, 95% interval −0.052 to +0.014, can't be told from zero), then a meta line; the model reads as "Points Forecast" with its technical name under it.
   - (3) The three models: the paired gap to scale on a shared axis including zero, then a compact `StatsGrid` (MAE, RMSE, player-balanced MAE, coverage, width, rows), uncoloured.
   - (4) Interval coverage, core and early season against the 80% target on one 0–100% scale, key centred.
   - (5) Promotion gates: four rows, rule in one sentence and the observed value; pass/fail in neutral tones, not green/red.
   - (6) Slices: a grouped select of dimensions and a compact `StatsGrid` of the three models' MAE and the change in points, uncoloured; a phone column switch.
   - (7) Ledger: `StatsGrid` player cards with 2025-26 season photos and logos, interval bars on one shared scale, nonappearances as unknown.
   - (8) Archive tab: the answer (context model worse than EWMA-20 by 0.11 to 0.18 reference points, 95%, red because the interval excludes zero), three models on a zero axis, gates with the failed slice named, slices with coverage, splits.
   - (9) How to read (cards, collapsed glossary) and a collapsed About (protocol, splits, policy, run, hashes, reproduce commands, the served model card).
   - Q1: the ledger is relabelled as a back-dated test of the issuance pipeline (issued Oct 1, 2026 for games Jan 15–17, 2026, inside the test season; not a prospective result), collapsed behind that one line and never coloured. Q2: the first 50 rows from one request, with the total stated; no API change. Q3: the live-database rows leave the archive; the experiment's own counts go to About. Q4: route tabs, not one long page.
   — Built as proposed: one hero over both tabs, the answer in one sentence with the typical misses and the paired gain on one axis from zero, the models grid with the gain first (uncoloured), coverage against the 80% target, the four rules in words, slices through one grouped select, the ledger behind one line saying it is a back-dated test (50 rows with 2025-26 photos and ranges on one scale), How to read and a collapsed About; the archive tab with its red gain (95% interval below zero) and no live-database rows. Phone tables switch column groups, none scrolls sideways. One shared change: `StatsGrid` draws `headerAfter` on unsorted columns. Real data 2,470 values, 0 mismatches, 100 photos; full Playwright 630 passed, 17 skipped, 0 failed. Evidence: [`design-RD16`](evidence/research/design-RD16/README.md).

Instructions (owner, 2026-11-10, round 2; the owner asked "Is there anything else we can improve on the page, before moving to the next?",
was given six suggestions, and answered "Build them all comprehensively."):
2. [x] Build them all comprehensively.
   - (1) The ledger's list is a small "Show the 50 forecasts" toggle inside its section, not a second full-size heading.
   - (2) Under the miss chart, one line saying the gain is drawn to the same scale and is too small to see (RD12).
   - (3) Each coverage row gives its distance from the 80% target in points (RD10), bars unchanged.
   - (4) A collapsed "How the models were chosen" grid after the rules: the simple averages and every tree setting on both validation folds, the chosen ones marked.
   - (5) One line on the slices' clearest pattern (the trees did best early in the season), saying no slice has an interval, so it is a pattern, not a result.
   - (6) The archive tab gets the same How to read cards and a collapsed glossary.
   — All six built: the ledger opens from a small toggle under one heading; a centred scale note under each miss chart; every coverage row gives its distance from 80% in points; a collapsed validation grid on both tabs (every candidate on both folds, the chosen ones named, the lowest-pooled sentence shown only when the numbers bear it out); a computed pattern line on every slice that calls it a pattern, not a result; the archive gains How to read and a glossary. Real data 2,820 values, 0 mismatches; `comparison-evaluation` ×3 33/33; Vitest 868; no shared code, so no full suite. Evidence: [`design-RD16`](evidence/research/design-RD16/README.md).

Instructions (owner, 2026-11-10, round 3):
3. [x] Great, I approve this page.
   — Approved after two build rounds; the settled rules are in the alignment plan ("Settled in RD16"). The full Playwright run owed under the owner's rule: 632 passed, 17 skipped, 0 failed.


## RD17 Expected Shots and Adjusted Shooting — ✅ approved by the owner (2026-11-10)

- **Now:** the sealed B26 experiments (expected-shot v1 is a registered negative result), tabs of Shooting.
- **Decision (owner, 2026-11-10, "I agree", answering the recommendation below):** merge both, keeping every sealed result reachable and unrenamed.
  - Expected Shots → Shot Quality's Model tab as "An earlier attempt": one line and a collapsed section with the sealed v1 negative result (RD16's
    earlier-experiment pattern); `/research/shooting` redirects there.
  - Adjusted Shooting: the offensive view (points per possession against the league's play-type expectation) is dropped as a duplicate of zTS; the
    defensive view (points allowed against the play-type expectation; 433 players, 7 play types in 2025-26) becomes a Defense tab on zTS;
    `/research/shooting/adjusted` redirects there.
  - The Shooting page and its menu entry go; Shot Aftermath stands alone at `/research/shooting/aftermath` (no tab bar). The Research → Shooting group
    becomes the handoff's target menu: Shot Quality, zTS, Shot Aftermath, Defensive Shot Quality.
  - Check first: whether the Adjusted page shows anything from the sealed `courtload-adjusted-shooting-v1` result or only the live play-type feed; any
    sealed result moves with the defensive section, unchanged.
- **Reference:** none. No Databallr page covers either; each change borrows a named, approved CourtLens Research precedent.
- **Before (:3100, 2026-11-10):** Expected Shots under the old left-aligned Shooting header, full width: a run select (two runs: the sealed negative result and an empty preflight failure), a reliability chart, four tiles and 2 old tables; 1,645 px at 1440, 1,800 at 390. Adjusted (both sides): four tiles, twelve ranked bars, a 433/439-option player dropdown, a play-type table and a percentile-shaded player table (2 old tables, 3 native selects, no photos or logos); 5,340 / 6,011 px offence, 5,168 / 5,909 defence; on a phone both tables scroll sideways (273 to 373 px). Shot Quality's Model tab shows the project code `courtlens-expected-shot-v2` in a chart source line. 0 console errors, 0 overflow, 0 broken images on all five views; no hashes in visible text.
- **Content check (2026-11-10, read only):** (A) Expected Shots reads only the sealed `courtload-expected-shot-retrospective-v2` run `de8dbe44…` through `GET /api/workbench/research/runs/{id}`: status, selection metrics (Brier 0.233961 → 0.233771, +0.08127% against the 1% gate, ECE 0.0052 → 0.0348), ten fixed reliability bins, dates, model card and hashes; no interval is served. Its "v1" (`courtload-expected-shot-v1`) never ran (source-blocked: prior exposure needed the retrospective amendment), so the sealed negative result is the retrospective v2 run; a second registered run (`d1dbc7ee…`) is the empty affinity-preflight failure, no fit. (B) Adjusted shows only the live play-type feed (`GET /api/workbench/play-types`); `courtload-adjusted-shooting-v1` is registered but source-blocked ("requires admitted playtypes and foul trips"), never run, so no sealed result moves with it. (C) The defensive feed serves 2015-16 to 2025-26, regular season and playoffs (2025-26: 433 players, 317 qualified at 250+ possessions; playoffs 146 / 104 at 40+), always the same 7 play types; no interval, so no green or red; percentiles only. Traded players carry several team codes in team-id order, not by date. (D) References: menu entry and `TAB_SHORTCUTS`, `TABBED_PAGES.shooting`, `OWN_HEADER_TABS`, two FO07 redirects and two old aliases (`/zts` → Adjusted, `/shotquality` → Expected Shots), the availability gate, a Learning link ("Shooting decomposition" → `/research/shooting`), the backend search entry `page_shooting`, Shot Aftermath's tabs; Vitest `nav-model`, `nav-trail`, `replica-nav`, `route-consolidation`; specs `route-consolidation`, `shot-aftermath`, `advanced-research`, `pc11-gated-pages`, `pc12-headlines`, `visual-baselines` with six baselines (`expected-shots-*`, `pc11-adjusted-shooting-*`, `pc12-b-shooting-*`).

Instructions (owner, 2026-11-10, round 1; the owner answered the content check with "Go with your recommendations and suggestions for optimal construction and layout of this page. Then fully build it comprehensively."):
1. [x] Go with your recommendations and suggestions for optimal construction and layout of this page. Then fully build it comprehensively.
   - (1) Shot Quality Model tab: a section "An earlier attempt" after persistence (RD16 earlier-experiment section): one visible line computed from the sealed run (a simpler location-and-type model, +0.08% Brier against the 1% gate, stopped before calibration and test), then a small toggle in the same section (RD16 ledger toggle) opening a compact `StatsGrid` of the five selection metrics, baseline against candidate, uncoloured with "Failed" in words, and the reliability chart; its identifiers, the model card, the empty preflight run and the report download in the tab's collapsed Caveats & Methodology.
   - (2) Shot Quality Model tab: the chart source line names "Shot Quality v2", not the project code (RD07, RD10).
   - (3) zTS Defense tab (fourth in the dock, after Player; RD03 page, RD13 and RD16 rules): a season select and a Regular season / Playoffs switch; one computed pattern line naming the season's lowest and highest qualified defender against expectation, called a pattern (no interval); the league's points allowed per play type as `LeaderBars`; every defender on `StatsGrid` (season photo, logos beside every code, `GridSearch`, sortable, not ranked, values uncoloured, thin samples dimmed and never ranked or coloured, column groups switch on a phone); a selected defender's play-type breakdown (64 px `PlayerAvatar` card, four tiles, a compact grid) chosen by search or the row's own icon, never scrolling; honesty lines (Synergy's defender credit, season totals, absent play types unknown); a collapsed About with qualification rules and sources.
   - (4) Shot Aftermath standalone: its own centred hero with no tab bar, URL kept; the Shooting layout, tabbed page and own-header entry removed.
   - (5) Menu: Research → Shooting is Shot Quality, zTS, Shot Aftermath, Defensive Shot Quality; the Shooting entry and the Shot Aftermath tab shortcut go.
   - (6) Redirects straight to the final tab: `/research/shooting` and `/research/expected-shots` → Shot Quality Model; `/research/shooting/adjusted` and `/research/adjusted-shooting` → zTS Defense.
   - Q1: the "v1" in the decision reads as the sealed retrospective-v2 run, the only expected-shot run sealed; the page calls it the earlier attempt and names the identifiers only in About. Q2: the empty preflight run is one sentence in About, not a run select. Q3: the Defense tab serves playoffs too, since the feed has them (zTS's own tabs stay regular season). Q4: the old aliases `/zts` → zTS and `/shotquality` → Shot Quality, the pages Databallr's own paths name. Q5: the Learning link goes to Shot Quality's Decomposition. Q6: the backend search entry `page_shooting` is replaced by entries for Shot Quality, zTS and Shot Aftermath (corrected while building: neither Shot Quality nor zTS had one). Q7: `play-type-shooting-view.tsx` is deleted with its route (nothing else renders it); `ResearchResultsView` stays for RAPM. Q8: traded players show every team code with its logo, the photo without a team tint.
   — Built as proposed. Shot Quality's Model tab ends with "An earlier attempt": one line computed from the sealed run (0.08% better Brier than a zone rate against the 1% it needed, never calibrated or tested), a small toggle opening the five selection scores uncoloured, "Failed" in words and the reliability chart (12 px axes, centred key); identifiers, the model card, the empty preflight run and the report download in Caveats & Methodology. zTS gains a Defense tab: season and Regular season / Playoffs, a pattern line, the league's play types as `LeaderBars`, every defender on `StatsGrid` (photos, a logo per code, search, sortable, no rank or colour, thin samples dimmed and last), a crosshair selecting a defender in place, the defender card and play-type grid with Clear and an empty state, a collapsed About. Shot Aftermath stands alone with no tab bar; the menu, redirects, Learning link and search entries follow. Found and fixed: Shot Quality's Caveats widened the phone page when opened (pre-existing on the approved page), the new grid's sideways scroll and cut names. Real data 30,937 values, 0 mismatches; touched specs ×3 49/49; full Playwright 628 passed, 17 skipped, 1 failed (`route-polish` expected the old "Shooting" link; updated). Evidence: [`design-RD17`](evidence/research/design-RD17/README.md).

Instructions (owner, 2026-11-10, round 2):
2. [x] Sounds good. I approve them. (RD17 and RD18 together.)
   — Approved after one build round. Full Playwright for this state: 628 passed, 17 skipped, 1 failed (`route-polish` expected the old "Shooting" drawer link; updated, then the touched specs 49/49 over three runs).

## RD18 Shot Aftermath — ✅ approved by the owner (2026-11-10)

- **Now:** a per-player page whose play-by-play tables hold two test games in the published database.
- **Decision (owner, 2026-11-09):** build it, after RD12, RD13 and RD16: a new frozen play-by-play aggregate matching Databallr (league, team and position results by shot zone) for 2024-25 and 2025-26, then the design rounds.
- **Content check (2026-11-10, counts only):** of 219,527 (2024-25) and 219,160 (2025-26) shots, 216,313 and 218,625 join a sealed R01 possession; the rest are in the 18 and 4 games R01 excluded (plus 1 stray). First-chance attempts 193,336 and 194,813 (Databallr prints 190,685 for 2024-25; cause not visible from its page); zones with rim labels first come close to Databallr's but not exactly. Opponent's next possession missing at period ends after 919 / 1,180 makes and 2,860 / 2,380 defensive rebounds; every shooter has a position estimate (group accuracy 85.5% out of sample; centres weakest). Evidence: [`design-RD18`](evidence/research/design-RD18/README.md).
- **Owner, 2026-11-10 (answer to Q1–Q6 of the content check):** "Go with your recommendations and suggestions for optimal construction and layout of this page. Build it comprehensively." Q1 95% game-bootstrap intervals on every rate, cost and net (2,000 replicates, seeded), green/red only on cost and net where the interval excludes zero; Q2 every cell served with counts and interval, flagged thin below 100 attempts or 50 opponent possessions, no smoothing; Q3 the After a miss and After a defensive rebound views defined from Databallr's formulas; Q4 Guards, Forwards, Bigs labelled estimates, no Unclassified; Q5 the tab body replaced, the old player operation and its POST endpoint left unchanged; Q6 `courtlens-shot-aftermath-v1`, block R17, evidence in `docs/evidence/research/r17-shot-aftermath/`.
- **Feasibility (read 2026-11-09; nothing built or run):** no new source is needed. On disk: `expected-shot-v2` per-shot tables (zone, event id, `after_oreb`), the sealed possessions Shot Decomposition uses, and `position-estimates-v1`. Measure first how many shots fail to match. To work out: opponent cost (each possession against the opponent's next, and a league-normal baseline), blocks, free throws after a rebound, and-ones and period ends, with unmatched shots counted as unknown; position groups are estimated and the page says so. Usual Research path: register the method before reading results, freeze, API, then design.

- **Built (R17, 2026-11-10):** `courtlens-shot-aftermath-v1` registered (`7bc242ab…`), frozen (results `5aa5161b…`, two byte-identical runs) and served at `GET /api/shot-aftermath`, `/scope`, `/teams`. Evidence: [`r17-shot-aftermath`](evidence/research/r17-shot-aftermath/README.md).

Instructions (owner, 2026-11-10, round 1; the owner answered the design proposal and its five recommendations with "Go with your
recommendations and build it comprehensively."):
1. [x] Go with your recommendations and build it comprehensively.
   - (1) A centred hero for this tab, "What happens after the shot?", with the Shooting route tabs under it and the URL kept.
   - (2) The 992 px centred column.
   - (3) A sticky filter bar: Season (segmented), Shooting team (`TeamPicker`), Position (All, Guards, Forwards, Bigs, labelled estimates), Export CSV; a meta line under it.
   - (4) The answer in one sentence, computed from the served scope.
   - (5) The view switch: All attempts / After a miss / After a defensive rebound.
   - (6) Four small charts by zone (own scoring, second chances, opponent cost, scoring minus cost) with 95% whiskers; cost green/red only where its interval excludes zero; a scale note when a value is too small to see.
   - (7) Databallr's three tables as compact `StatsGrid`s with intervals; column-group switch on a phone.
   - (8) All 30 teams for one zone (logos, sortable, not ranked, thin rows dimmed) with one line on chance colours.
   - (9) Visible honesty lines: positions are estimates (85.5%; centres weakest), values aren't Databallr's (second chances named); a collapsed count comparison.
   - (10) How to read cards and a collapsed glossary. (11) A collapsed About: method, matching and unknowns, limits, credit, hashes.
   - Q1 a hero for this tab only (Expected Shots and Adjusted keep theirs, RD17 is paused); Q2 one shared points axis from zero for own scoring, second chances and net, cost on its own axis centred on zero, labelled; Q3 the team table included; Q4 2025-26 by default; Q5 the per-player tool leaves this tab, its POST endpoint unchanged.
   — Built as proposed: its own centred hero over the Shooting tabs; a sticky filter bar (season, team logo grid, estimated position, CSV); the answer in one sentence from the scope (thin zones named, never ranked); the view switch over Databallr's small zone charts with 95% whiskers, points on one axis from zero and cost on its own centred axis, coloured only where the interval excludes zero; Databallr's three tables as compact grids; all 30 teams with logos, sortable as a view, thin rows dimmed, a line on chance colours; the position and Databallr honesty lines with a toggle for the count comparison; How to read, glossary and a collapsed About. Phone tables switch column groups, none scrolls sideways. Real data 4,976 values, 0 mismatches; spec ×3 21/21; full Playwright 629 passed, 1 baseline changed by design (regenerated). Evidence: [`design-RD18`](evidence/research/design-RD18/README.md).

Instructions (owner, 2026-11-10, round 2; the owner asked "Where is shot aftermath?" with a screenshot of the Research menu, was offered its own
menu entry, and answered "Sure."):
2. [x] Sure. (Give Shot Aftermath its own entry in Research → Shooting.)
   — Listed after Shot Quality ("What first-chance shots score, what misses win back and what the opponent scores next", split icon) as a tab
   shortcut like Learning, staying a Shooting tab; the Shooting entry now reads "Expected shots and adjusted shooting". Found while checking it: the route
   was still gated on the old workbench shot source (unavailable), which hid the entry; the gate is gone, since the page reads only the frozen R17 file.
   Vitest 877; full Playwright 629 passed, 17 skipped, 1 failed (`route-consolidation` still asserted no Shot Aftermath entry; updated to expect it, then 39/39 over three runs with the page spec). Evidence: [`design-RD18`](evidence/research/design-RD18/README.md).

- **Open for the owner's review (2026-11-10, proposed after round 2, not built):** six suggested improvements, none needing new analysis:
  (1) one line in the answer saying whether the zone order and the rim-rebound effect held in the other season (they did);
  (2) a small icon on each team row that scopes the page to that team without scrolling (RD13);
  (3) a compact grid of guards, forwards and bigs by zone (net and rebound cost, with intervals);
  (4) round steps on the cost charts' axis (thin scopes give ±1.44 with ticks at 0.72);
  (5) tighter phone labels under the cost bars (the interval wraps onto two lines);
  (6) on the After a defensive rebound view, opponent points per possession after a make and after a rebound side by side against the league line.
  Recommended: 1, 2, 4 and 5 together; 3 and 6 each add a section (owner's call). Also: delete the now-unrendered `components/shooting-view.tsx`
  and `components/catalog-scope-fields.tsx` (the old per-player tool; its POST endpoint stays), or keep them?
  Round 4 built 1, 2, 4, 5 and the `shooting-view.tsx` deletion; 3 and 6 stay open.

Instructions (owner, 2026-11-10, round 3):
3. [x] Sounds good. I approve them. (RD17 and RD18 together.)
   — Approved after two build rounds and RD17's removal of the tab bar. The six suggestions and the deletion question above stay open and unbuilt; nothing in this approval chose them.

Instructions (owner, 2026-11-10, round 4; after approving, the owner was offered the open suggestions with 1, 2, 4 and 5 recommended and the two-file deletion, and answered "Yes, add these"):
4. [x] Yes, add these. (Suggestions 1, 2, 4 and 5, and the deletion.)
   - (1) One line under the answer on the other season, same team and position: whether the zone order held (thin zones left out, as in the answer) and whether the clearest rebound effect kept its sign with an interval clear of zero.
   - (2) A crosshair on every team row that scopes the whole page to that team, and back on a second press, without moving the row on screen.
   - (4) The cost axis ends on a round step (0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5), at most two ticks each side of zero: BOS bigs after a defensive rebound reads ±2.00 with ticks at whole points, not ±1.44 / ±0.72.
   - (5) On a phone, cost intervals under the bars drop their leading zeros ("−.389 to +.215"), the length of the points intervals that already fit, and never wrap.
   - Deletion: `components/shooting-view.tsx` and its stylesheet are gone. `components/catalog-scope-fields.tsx` stays: the check found the Ask scope editor and the contract drawer still use it, so the question was wrong to call it unrendered.
   — Built as listed. Nationally, 2024-25 kept the order (rim, three, short mid, long mid) and the rim rebound effect, read independently from the served rows. Row stays ✅ from round 3; this round is for the owner's look.

Instructions (owner, 2026-11-10, round 5; offered suggestions 3 and 6 as optional, the owner answered "Yes, add these to the plan (not optional)"):
5. [x] Suggestions 3 and 6. (Finish plan F02.)
   — Built 2026-11-11: By estimated position (guards, forwards, bigs by zone; net or rebound cost; intervals, colour only where clear of zero, thin cells dimmed; phone column groups) and After a make or after a rebound on the rebound view (neutral paired bars, whiskers, league line). Specs ×3 72/72. Evidence: [`f02`](evidence/finish/f02/). 👀 for the owner's look; the row stays ✅.

## RD19 Ask evaluation — ✂️ cut by the owner (2026-11-10)

- **Now:** not built. R16 is running (development set partly done, holdout unopened).
- **Waits for:** R16's results; then a page with accuracy, intervals, failure categories and per-tool errors.
- **Cut (owner, 2026-11-10):** asked "WHat exactly is ask evaluation page? Should we even have this?", the owner chose to put Ask itself on the hosted demo with per-visitor and site-wide daily limits instead, then "Yes cut it". R16 stays unfinished on its branch (`research-r16`, dev 117/573, holdout unopened); its replay of the 214 recorded stats calls drove the stats-tool argument repair (46e1f707).

## W4/W5 Win Probability v4 (Live cards, Pre-Game why, the page) — round 2 (2026-11-12)

- **Round 1** (W4 #101, W5 #103): the card row and Pre-Game "CourtLens prediction" panel from the
  plan's mock-ups; the page reordered to slate, track record, how it thinks, trial, then Evidence.
- **Owner instruction (2026-11-12, verbatim in part):** "The current win prob page, doesn't show any
  upcoming games, and what courtlens' model predicts. It's not user friendly … bring some more clear,
  nice ux focused design to the forefront (that doesn't mean the statistics, and data goes away, I
  just want it to look nice). A nice example is our 'Live' page … user centric but still rich with
  data." On the open decisions: "use your best judgment and select the optimal choice."
- **Round 2 built:** the page opens on a prediction board: Live's date strip (any day, past days
  show results), one card per game with both logos, the sealed chance for each side (the favourite's
  large), a bar split at that chance in each team's colour, the call, the line and who's out; a
  final card shows the score and "Called X ✓ right / ✗ wrong". A card opens the game (Pre-Game
  "why" for past games). The three model steps are cards; the track record is tiles.
- **Decisions taken (owner delegated):** (1) the 100% weight is said plainly: "when there is a line,
  the pregame margin follows it, and the own read is the fallback when there is none"; (2) the
  why panel's bars run away (left) to home (right), the site's away-first order, not the mock-up's;
  (3) the hero names the serving model and its freeze ("Market-informed model, on trial · frozen
  Nov 12, 2026 · graded every morning"); the Original's game counts stay in Evidence.
