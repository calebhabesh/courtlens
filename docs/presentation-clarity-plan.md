# CourtLens presentation clarity: graphics, populated pages and a hosted demo

Prepared 2026-10-11. **The owner confirmed every decision below through a grilling interview on
2026-10-11. Blocks PC00–PC13 are pending until the [progress log](presentation-clarity-progress.md)
records measured evidence.** A plan is not runtime evidence.

## Why this exists

The [frontend overhaul](frontend-overhaul-plan.md) (FO00–FO14) fixed page structure. The owner
still finds the pages too black and white: data is dumped on screen without the labels, color,
charts and default states that make it readable at a glance. Examples from the owner on 2026-10-11:

- **Compare** opens to two empty search boxes and "Select two players to compare." Databallr opens
  with large headshot cards, a games badge ("26 rs"), Overall/Offense/Defense/Six Factor/Custom
  tabs, a per-game toggle and a three-column table with colored "+6.1" difference chips.
- **Roster Shapes** opens to a 30-logo picker, and clicking many teams crashes
  (`wholeMinutes(null)` in `components/roster-allocation-view.tsx`). Databallr shows all 30 rosters
  at once as Wyman diagrams (size = value, color = role, outline = fit) with sorting.
- **Contracts / Free Agency** render empty. Databallr shows a cap utilization bar with
  cap/tax/apron markers, a payroll flow diagram, a color-coded multi-year contract grid, and payroll
  donuts.

The planning check found about 12 routes that open empty with no URL parameters. FO14's glance test
missed them because every capture used pre-seeded query parameters (`docs/evidence/fo14/measurements.json`).

**Lesson for every block below:** judge each page on **first load with no URL parameters**, at
desktop and phone width. A page that opens on a prompt, a gate notice or a single line fails.

## Owner context

- CourtLens is a **non-commercial résumé/portfolio project**, hosted as a live demo on the owner's
  Oracle Cloud VPS at a subdomain such as `courtlens.calebhabesh.com`. It is not meant to compete
  with Databallr; visitors are recruiters and reviewers clicking around for a few minutes.
- **Databallr is an approved design reference.** Its presentation patterns may be copied or
  replicated freely. Data never comes from Databallr; CourtLens builds its own pipelines from the
  same public sources.
- **Zero recurring cost.** No monthly data or service fees (one-time payments are acceptable). If a
  feature's data can't be obtained for free, the feature is **removed**, not gated or left thin.
- **No dead ends.** The hosted site must be fully usable: every reachable page shows real data on
  first load.

## Scope and precedence

- This handoff **supersedes** the frontend overhaul for chart and data presentation, color
  semantics, first-load default states, which pages exist, and D21 (Compare). It supersedes the
  replica handoff's finance/free-agency **source gates** and
  [nba-direct-admission-v1](design/nba-direct-admission-v1.md) through the new source policy (PC01).
- It **keeps** the overhaul's page templates, filter bar, header, missing-data line + "Why?",
  Data details drawer and glance test, and every analytical contract: temporal discipline,
  append-only hashed data, sealed evidence, and **unknown is never shown as zero**.
- [Design Language v1.1](design/design-language-v1.md) stays in force; PC03 amends it to **v1.2**.
- Ask's layout and agent loop stay with the [assistant agent handoff](assistant-agent-plan.md); this
  plan adds only the hosted-demo mode in PC13.

## Locked decisions

| # | Decision |
| --- | --- |
| C1 Reference | Databallr is a direct visual reference (copy freely). Data comes only from CourtLens pipelines. Wyman diagrams are credited to @taylormetrics. |
| C2 Order | Crash fix → source policy → audit (**gate G1**) → tokens, D21 revision and chart kit → Compare and first-load defaults (**gate G2**) → data pipelines → finance views (**gate G3**) → value metric and archetypes → Roster Shapes (**gate G4**) → gated-page verdicts → remaining audit batches → hosting and Ask demo mode. |
| C3 First load | Every page opens on real content with no URL parameters. Pages that need a subject pick a **fixed default by rule** (e.g. the season's minutes leader; for WOWY that player's team's top duo), labeled "Example: Nikola Jokić · Change", and written to the URL. **Compare** is the exception (C5). |
| C4 Page anatomy | Headline visual above the fold → labeled KPI tiles → detail table. Sample-size and uncertainty badges are always visible. Pages that are tables by nature (Stats, Players) get percentile-shaded cells and column-group headers instead of an extra chart. |
| C5 Compare default | Two grayed placeholder slots with silhouettes, plus one-click suggested matchups ("Top 2 by minutes", "Position leaders", "Recently viewed"). The selection lives in the URL. |
| C6 Compare structure | Replicates Databallr: large headshot cards on team-tinted backgrounds with a games badge; tabs Overall / Offense / Defense / Six Factor / Custom; Per Game / Per 75 / Per 100 / Totals; centered three-column table; Share image (reuses the export preview). Custom metric picks persist in the URL. |
| C7 D21 revised | Each metric row gets a **difference chip in the leading player's identity color**. The metric catalog flags lower-is-better metrics (TOV, fouls). Still **no** overall verdict, composite score or "winner" label. |
| C8 Color semantics | New tokens in v1.2, used by every chart: **identity A/B** (amber vs a cool blue); **percentile ramp** (one hue rising with rank, never red/green); **categorical palette** (about 6 colors for archetypes and position groups); **status** colors (guaranteed / player option / team option / two-way / projected / unknown, with unknown hatched or muted). The raw hex palettes in `multi-player-lines-view.tsx`, `scatter-plot-view.tsx` and `player-compare-view.tsx` move to tokens. |
| C9 Team colors | Team colors are for **identity**: headshot backgrounds, card logos, team chips, Roster Shapes card borders. Data encodings always use semantic tokens. |
| C10 Percentiles | Comparison group: same season and phase, minutes-qualified (at least 500 minutes or 25% of available minutes, fixed in the catalog). Each value shows a small percentile number plus cell shading. Unqualified players get a "small sample" badge and a muted percentile. |
| C11 Charts | No chart library. Add only d3 layout modules (`d3-shape`, `d3-hierarchy`, `d3-sankey`, `d3-scale`) for geometry. Render SVG with tokens in a new `components/charts/` kit: `DeltaChip`, `ValueBar`, `ThresholdBar`, `Donut`, `Sankey`, `TimelineGrid`, `PercentileCell`, `ShapePack`. |
| C12 Missing data | Live sources first, a dated real snapshot second, **never demo or fake data**. If no free source exists, remove the feature (C14). |
| C13 Sources | All sources are free. See "Source plan" below. Paid APIs (BallDontLie GOAT, $39.99/month, the only one with contract endpoints) are out. |
| C14 Cut, don't gate | Every gated or near-empty page is either **populated** or **removed** (navigation, route, availability entry, gate notice), with a redirect to the nearest useful page. Verdicts are under PC11. |
| C15 Current season | Ingest 2026-27 rosters and transactions. Roster Shapes, Contracts and Free Agency default to **"2026-27 · projected"** (current rosters, each player drawn from 2025-26 numbers), labeled "Projected: no 2026-27 minutes played yet." Stats pages switch to 2026-27 once games start. |
| C16 Value metric | Build a **box-prior RAPM blend** (DPM/EPM style): a box-score regression trained out-of-time to predict RAPM, used as the RAPM prior; hashed artifact under the evaluation protocol. Interim: sealed RAPM where available, else a box composite, with the label saying which. |
| C17 Archetypes | A Gaussian mixture on per-100 rate stats (usage, AST%, 3PA rate, rim rate, OREB%, DREB%, BLK%, STL%, FT rate) over minutes-qualified players across several seasons, about 6–8 clusters, named by hand after inspection. Soft membership ("72% creator · 28% shooter"); color = primary archetype. Refit each season as a hashed artifact, always labeled "derived archetype". Listed positions come from the NBA player index. |
| C18 Roster Shapes | Landing page: a grid of all 30 team diagrams with Fullest / Best fit / A–Z sorting; clicking opens the team detail. The existing depth-chart allocation view stays as a tab inside team detail. |
| C19 Live off-season | With no games today, show the most recent game day (final scores, top performers) plus a "Next games" strip. |
| C20 Phone | Every new graphic works down to 390px with simplified forms (flow diagram → stacked bars; contract grid scrolls sideways with a sticky name column). No horizontal page scroll. |
| C21 Hosting | Oracle Cloud Always Free VM running the existing Docker Compose stack, behind Cloudflare DNS or a Tunnel. Scheduled pipelines on the VM. Backups to free object storage. Keep the site light. |
| C22 Refresh | In season: nightly cdn.nba.com play-by-play and box scores, the hoopR cache, pbpstats totals and injury reports; weekly Basketball-Reference and Spotrac; monthly player index. Off-season: weekly for everything. Each run publishes through the atomic snapshot swap; the header shows "Data as of …". |
| C23 Ask on the demo | **Replay mode** by default: 10–15 curated real threads recorded locally, replayed with streaming and tool calls. An opt-in "Try a live question" uses a free-tier LLM (Gemini or Groq free) with hard per-visitor and daily caps, falling back to replays. Web search on the hosted site only through a free tier, otherwise off. Cost stays at $0. |
| C24 Reviews | Each gate gets a shareable artifact page: before/after screenshots at 1440px and 390px, a glance-test score per page, plus a local run to click through. The next block starts only after owner approval. |

## Owner decisions after PC07 (2026-10-12)

Confirmed by the owner on 2026-10-12 after PC06/PC07 source evidence. These amend the plan below.

| # | Decision |
| --- | --- |
| D1 Identity | Basketball-Reference players map to NBA ids by the **name-and-team rule**: exact normalized name plus same current team in the pinned NBA index, unique on both sides, recorded as `name_team_unique` with evidence ([finance refresh v1](design/finance-refresh-v1.md)). Nicknames, ties and collisions stay unresolved. |
| D2 Spotrac/HoopsHype | Spotrac stays stopped (robots 403). HoopsHype was probed once: its robots.txt disallows Anthropic agents, so it is not used. BRef remains the only contract source. |
| D3 Free Agency | **Removed** under C14: no admitted free source. Players with expiring contracts are never labeled free agents. PC08 removes the page with a redirect to Contracts. |
| D4 WOWY | Derived in PC11 from lineup data (existing stints or hoopR lineups); pbpstats WOWY is not ingested. |
| D5 Seasons | Season feeds beyond 2025-26 are fetched only when PC09 needs them. |

## Owner decisions at G4 (2026-10-12)

The owner approved G4 with the recommended defaults ("I approve, you can begin the next block").

| # | Decision |
| --- | --- |
| D6 Playoff toggle | **Dropped.** PC10's Regular season vs Playoff-adjusted toggle is not built: the only sealed playoff BPR is 2025-26 alone (230 players, 5 meeting the 20-game rule). Roster Shapes stay regular-season. |
| D7 Fit and white space | Kept as built in PC10: outline = continuity (returning / new arrival / no 2025-26 sample); Best fit sorts by the returning share of value; white space is the gap to the league's fullest roster. |

## Source plan (checked 2026-10-11)

Every source below returned HTTP 200 from the development machine with a browser User-Agent,
except where noted. Test responses were captured in the planning session's scratchpad.

| Need | Primary | Fallback | Notes |
| --- | --- | --- | --- |
| Contracts, multi-year, options | Basketball-Reference `/contracts/{TEAM}.html` (2026-27 → 2031-32, options marked by `salary-pl`/`salary-tm`) | Spotrac team cap pages (guaranteed, two-way, contract type, cap holds, option deadlines); HoopsHype embedded JSON | BRef robots.txt Crawl-delay 3; Spotrac Crawl-delay 5. Weekly, about 60 pages, low rate. RealGM 403. |
| Cap / tax / apron | Official 2026-27 release, entered by hand: cap $164.961M, tax $200.428M, first apron $209.015M, second apron $221.686M, minimum $148.465M | Spotrac `/nba/cba/`, BRef salary-cap history | Tiny table, one row per season. |
| Free agents | Spotrac `/nba/free-agents/_/year/2026` (signed + pending UFA/RFA) | — | BRef FA page now redirects; ESPN 404. |
| Positions, height, weight, roster status | `cdn.nba.com/static/json/staticData/playerIndex.json` (season 2026-27) | hoopR `playerindex` | Was 403 in IM work; now 200. |
| Play types, tracking, matchups, hustle | GitHub `sportsdataverse/hoopR-nba-stats-raw` (raw stats.nba.com JSON incl. `synergyplaytypes`, `leaguedashptstats`, `leaguedashptdefend`, `leagueseasonmatchups`, `leaguedashlineups`) | `shufinskiy/nba_data` (Apache-2.0) | `stats.nba.com` itself times out from here; cloud IPs are typically blocked. |
| Play-by-play, shots, lineups, on/off | Existing cdn.nba.com and sportsdataverse paths | pbpstats API (`get-totals`, Lineup, `get-wowy-stats`; no key) | pbpstats: low rate, credited. |
| Combine, draft | hoopR `draftcombine*`, `drafthistory` | BRef draft pages | — |
| Injuries | Official NBA injury report PDFs (`ak-static.cms.nba.com/referee/injury/…`) | ESPN injuries JSON, labeled secondary | Absent box-score row with no report entry stays unknown. |

All sources are credited on a Data Sources page and in chart footers. The public site serves derived
views only, never raw dumps.

## Glance test additions

The overhaul's 10-item glance test still applies. Add:

1. **First load with no URL parameters** shows real content (not a prompt, gate notice or single line).
2. At least one labeled visual (chart, bar, chip or shaded cell) carries the page's main result.
3. Every color on the page maps to a v1.2 semantic or identity token, and a legend or label explains it.
4. Sample size and source are visible next to the main result.

## Blocks

### PC00 Roster Shapes crash fix

- `get_team_detail()` (`src/courtlens/services/workbench_analytics.py`) adds players whose rows for
  the team are all non-appearances, with `games_played=0` and `total_minutes=None`. Keep them but
  type the field honestly, or exclude non-appearance-only players from the cohort; either way the UI
  must render `—` for unknown minutes, never 0.
- Fix `dashboard/lib/types.ts` `player_cohort` (`total_minutes: number | null`) and the per-game
  field-name mismatch (the API sends `pts_per_game`/`reb_per_game`/`ast_per_game`).
- Guard `wholeMinutes`/`tenthMinutes` call sites (chip, lane, table, sort). Regression tests:
  backend unit test plus Vitest for a null-minutes row; check all 30 teams load in 2025-26 regular
  season and playoff phases.

### PC01 Source policy v2

- Write `docs/design/nba-direct-admission-v2.md`: admits the sources in "Source plan" for this
  non-commercial portfolio demo with low-rate fetching, robots.txt crawl delays, attribution, and
  derived-views-only serving. v1 stays frozen as history.
- Update AGENTS.md's Databallr sentence: approved design reference, may be replicated visually;
  data must come from CourtLens pipelines.
- Update capability declarations so admitted sources stop reporting `source_blocked`.

### PC02 Page audit (gate G1)

- Run every route in a production build at 1440×900 and 390px, **with no URL parameters**.
- For each page record: what first load shows, glance-test score (old 10 + new 4), the missing
  visual, bugs, and a proposed fix with its block.
- Publish as an artifact; the owner picks batch priority for PC12. **Stop for approval.**

### PC03 Design Language v1.2, D21 revision and chart kit

- Add the C8 tokens to `app/styles/tokens.css` with contrast checks; document them in v1.2.
- Revise D21 in the overhaul plan's table (cross-reference this plan); add lower-is-better flags to
  the metric catalog.
- Add the d3 layout modules (exact versions, pinned) and build `components/charts/` (C11), each with
  Vitest coverage, reduced-motion behavior, and a `/design` style-guide entry.
- Move raw hex palettes to tokens; Stylelint/ESLint stay at 0 errors and 0 warnings.

### PC04 Compare rebuild and first-load defaults (gate G2)

- Compare per C5–C7.
- Apply C3 to every subject-driven page: Matchups, WOWY, Stat Shift, Shot Profile, Shot Aftermath,
  Contracts, Free Agency (default book and dates once PC06 lands), Last Games, Similar Players.
- Research Operation without `?operation=` shows a gallery of available operations instead of an error.
- Live off-season fallback (C19).
- Add first-load-without-parameters captures to `e2e/visual-baselines.spec.ts`. **Stop for approval.**

### PC05 Data: rosters, positions, injuries

- Ingest `playerIndex.json` into dated, hashed metadata (positions, height, weight, roster status,
  2026-27 team).
- Ingest 2026-27 rosters and transactions; build the "2026-27 projected" context (C15).
- Parse official injury report PDFs into dated status observations; ESPN JSON as a labeled
  secondary source.

### PC06 Data: finance

- Basketball-Reference team contract pages plus Spotrac team cap pages into finance releases
  (existing `finance_*` tables and import contracts), one immutable release per weekly fetch.
- Hand-entered threshold table per season.
- Spotrac 2026 free-agent tracker into dated FA observations.
- Coverage check: every active roster player has a 2026-27 salary row or an explicit unknown reason.

### PC07 Data: tracking, play types, matchups, combine, on/off

- hoopR-nba-stats-raw files (and release tarballs) into raw acquisitions → normalized tables →
  dbt marts: play types, tracking dashboards, hustle, defensive tracking, matchups, lineups, combine,
  draft history.
- pbpstats totals, lineups and WOWY as a secondary source for possessions and on/off.
- Capability declarations updated with real season/phase coverage.

### PC08 Contracts and Free Agency views (gate G3)

- Contracts: team header, known payroll tile, cap utilization `ThresholdBar` (cap/tax/aprons),
  payroll `Sankey` (total → position group → player), contract `TimelineGrid` with status colors and
  legend, payroll and high-earner `Donut`s, team roster table with impact columns.
- ~~Free Agency: 2026 class board~~ — **removed** (D3): drop navigation, route, availability entry
  and search, redirect to Contracts.
- Phone forms per C20. **Stop for approval.**

### PC09 Value metric and archetypes

- Box-prior RAPM blend (C16) with out-of-time validation and a recorded evaluation report.
- Archetype GMM (C17), cluster naming review with the owner, hashed artifacts, catalog entries and
  methodology text.
- Serve both through the API with clear labels.

### PC10 Roster Shapes (gate G4)

- 30-team grid of shape diagrams (`ShapePack`): size = value metric, color = primary archetype,
  outline = fit, white space = what a full team would add; legend; Fullest / Best fit / A–Z;
  Regular season vs Playoff-adjusted; 2026-27 projected default.
- Team detail: large diagram, roster table, and the existing depth-chart allocation view as a tab.
- Credit @taylormetrics for Wyman diagrams. **Stop for approval.**

### PC11 Populate or remove gated pages

| Page | Verdict |
| --- | --- |
| Defensive Matchups | Populate (hoopR matchups) |
| Playtype-adjusted shooting | Populate (hoopR Synergy play types) |
| Six-Factor RAPM | Populate, following the [impact metrics handoff](impact-metrics-plan.md) |
| Combine & Wingspan | Populate (hoopR combine, through 2027) |
| WOWY / on-off | Populate (derived from lineups per D4) |
| Tracking (drives, catch-and-shoot, touches) | Populate as new tabs on player and Stats pages |
| EPV | **Remove** (needs non-public player-location tracking) |
| Planner | **Remove from the hosted demo** (empty without a signed-in league) |

Removed routes redirect, and leave navigation, `lib/route-availability.ts` and search.

As built (contract: [gated pages v1](design/gated-pages-v1.md)): Player Matchups (`/matchups`) is
populated from the same season matchups; Planner leaves the hosted build through
`NEXT_PUBLIC_COURTLENS_HOSTED_DEMO=1` (nav link hidden, `/planner` redirects to `/`) and stays
available locally; EPV redirects to RAPM Research.

### PC12 Remaining audit batches

- Work through PC02's batches in the owner's order: percentile-shaded tables (C10), headline
  visuals (C4), KPI tiles and legends on every page.
- One commit per batch, with screenshots and the extended glance test.

### PC13 Hosting, schedules and Ask demo mode

- Deploy the Compose stack to the Oracle VPS behind Cloudflare; production env and secrets;
  memory/CPU check under typical demo use.
- Schedulers per C22, with failure alerts, retained logs and the "Data as of" stamp.
- Backups to free object storage and a tested restore (`courtlens verify-restore`).
- Ask replay mode and capped live mode per C23; abuse protection (rate limits per IP, daily cap).
- Data Sources page with credits for every source.

## Order and coordination

Blocks run in order, one commit per block, on branch `presentation-clarity` (further branches per
block are fine). Data blocks PC05–PC07 may overlap with each other once PC01 lands, but views that
need their data wait for them. Stop at G1 (after PC02), G2 (after PC04), G3 (after PC08) and G4
(after PC10). Every UI block needs Vitest, Playwright, lint and typecheck passing, plus the extended
glance test on desktop and phone screenshots; every backend block needs pytest, mypy and Ruff
passing.
