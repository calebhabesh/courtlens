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
| RD00 | Six-Factor RAPM [18] | `/research/rapm/six-factor` | D: `Six-Factor RAPM`, `ShotQuality RAPM`; 7 screenshots | R02, design-18, RD00 | 👀 |
| RD01 | Combine & Wingspan [19] | `/wingspan` | D: `Wingspan Database` | R10 data | ⬜ |
| RD02 | ORtg Calculator [20] | `/calculator` | D: `Offensive Rating Calculator` | R10 data | ⬜ |
| RD03 | zTS [24] | `/research/zts` | W: `zTS — Playtype-Adjusted Scoring Efficiency` | R04 | ⬜ |
| RD04 | Shot Quality [25] | `/research/shot-quality` | W/D: `ShotQuality RAPM - Scoring Impact Decomposition` | R05, R06 | ⬜ |
| RD05 | Defensive Shot Quality [26] | `/research/defensive-matchups` | W: `Defensive Shot Quality` | R06 | ⬜ |
| RD06 | Learning [21] | `/methodology/learning` | D: `Learning` | R11 | ⬜ |
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

## RD00 Six-Factor RAPM — 👀 awaiting the owner (round 5)

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

## RD01 Combine & Wingspan — ⬜

- **Now:** the combine measurements view plus R10's plain sections: career and current DARKO D-DPM,
  percentiles, positional averages with counts and intervals, the registered correlation (wingspan − height
  against D-DPM r +0.21, +0.15 to +0.27, 822 players), a scatter with selectable axes, nearest builds.
- **Known gaps from the reference:** Databallr's layout, with-shoes and units toggles, CSV, the overlay
  graphic. Players who skipped the combine stay unknown (Databallr uses other sources).
- **Instructions:** _(owner)_

## RD02 ORtg Calculator — ⬜

- **Now:** the hypothetical calculator plus R10's observed inputs per season (2014-15 to 2025-26), Poropudas
  and Halme's Eq. (11), μ, rebound rates by miss, ORTG and marginals.
- **Known gaps:** the interactive ORTG Lab itself; the menu label is still "Hypothetical Calculator" (D8
  says "ORtg Calculator").
- **Instructions:** _(owner)_

## RD03 zTS — ⬜

- **Now:** About and Top 200 replicated, a Player tab built without a reference; registered test: zTS
  tracks oTS RAPM better, predicts next-season rTS worse.
- **Known gaps:** SV/100, the team table, the X/Y explorer and the position filter weren't reproduced. FTA
  per play type isn't derivable, so play-type TS is CourtLens's own.
- **Instructions:** _(owner)_

## RD04 Shot Quality — ⬜

- **Now:** four tabs: Players (ranked per 100 shots), Decomposition (oTS = oSQ + oMake + oFT, offence,
  defence, combined, CSV, intervals), Model, Player. CourtLens's expected-points model (Shot Quality v2)
  replaces the paid ShotQuality feed.
- **Known gaps:** Databallr's four-regression ShotQuality RAPM on its own pool; the Model and Player tabs
  have no reference.
- **Instructions:** _(owner)_

## RD05 Defensive Shot Quality — ⬜

- **Now:** ranked defender cards, All / 2PT / 3PT, ranks, RAPM headline, Key Matchups, paging; matchup data
  from 2017-18; expected PPS is the shooters' own shooting.
- **Known gaps:** no tracking, so no contest-based expectation and no 2nd defender (help columns empty).
- **Instructions:** _(owner)_

## RD06 Learning — ⬜

- **Now:** 22 topics in 5 tiers, each with formula, key takeaways and links; 14 "Measured in CourtLens"
  boxes; a league-trends table (2014-15 to 2025-26). Plain build.
- **Known gaps:** Databallr's topic layout and the league-trends chart; no league averages before 2014-15.
- **Instructions:** _(owner)_

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
