# The reference site's NBA replica reference findings

Inspected **2026-10-01** for CourtLoad's proposed reference-inspired NBA foundation. Status: **reference investigation complete; product scope and implementation contracts still require the owner's architecture decisions**. The owner has clarified that the desired foundation is essentially the NBA Stats-through-Research experience, with CourtLoad additions. This note records the reference; it does not establish feature completion, authorize paid dependencies, change existing contracts, or prove that CourtLoad can supply every referenced metric.

Subsequent owner decisions are now recorded in the [replica handoff](../replica-implementation-plan.md). It resolves the product-scope/layout questions and expands the previous workbench exclusions. The investigation-stage status above and narrower-contract references below remain historical context, not the current implementation authority.

Read alongside the [current workbench handoff](../workbench-implementation-plan.md), [source findings](workbench-source-findings.md), [interface contract](../design/workbench-interface-contract.md), and [data contracts](../design/workbench-data-contracts.md). The existing handoff excludes several capabilities listed here, including play-by-play/on-off models and league transactions. A subsequent owner-approved plan must explicitly reconcile those exclusions with the expanded replica scope. This research document does not silently supersede them.

## Evidence and inspection boundaries

Four evidence labels are used:

- **Observed:** rendered official page or navigation inspected in Chromium without signing in.
- **Official description:** the reference site's own help text, methodology, source credit, or page description. These are first-party claims, not an independent validation of accuracy.
- **Author claim:** the site author's saved Reddit post or comments. Historical claims are not evidence that the same functionality or implementation remains current.
- **CourtLoad inference:** a proposed dependency or guardrail deduced from the observed functionality and CourtLoad contracts. These are not reference implementation facts.

The web tool initially timed out for some routes or returned only `Loading` for the stats single-page application. The installed local Chromium browser successfully rendered the stats page, opened its menus and help dialog, and loaded the analytics pages identified below. No authentication, purchase, data-access request, or contact with anyone was performed. Menu checks used the actual rendered links; their grouping was cross-checked against the delivered application bundle. Stats page, inspected first-party bundle

The bundle URL is an inspection-time asset and may disappear after deployment. No copy of the site's code, downloaded dataset, or browser snapshot is retained in this repository. The supplied screenshots support visual comparison but are not executable evidence of every interaction. Application code, CourtLoad data, existing contracts, and existing dirty paths were not changed during this investigation.

The saved local source is [the supplied Reddit HTML](</home/ethioking/Downloads/Webpages/I built a free NBA analytics site — new features and patch notes _ r_nbadiscussion.html>). Its embedded post metadata identifies author `gosuruss`, timestamp `2026-03-06T00:12:28.436000+0000`, and the canonical [announcement](https://www.reddit.com/r/nbadiscussion/comments/1rlyily/i_built_a_free_nba_analytics_site_new_features/). File size: 2,684,569 bytes. SHA-256: `415228a162605028f717b7945bdd9795eb05202ef815bbfe0efc76887246a1b4`. The local HTML is historical evidence; it was not modified.

## Exact NBA route and menu map

**Observed.** The application has a top product bar with Stats/Games, global search, authentication controls, and a second row with NBA/WNBA and analytics navigation. The analytics row has Home, Stats, WOWY, Live, Players, Teams, Compare, Research, and Help. The requested replica foundation excludes the Home/game experience. This map captures the current NBA analytics menus, not the WNBA counterpart or private staff menus. Official stats navigation, inspected menu configuration

Stats and WOWY are top-level direct links. Players and Teams omit their duplicate Stats/WOWY entries in the visible dropdowns. Research uses two columns. `/StatLineShift` preserves the reference's capitalization. Some routes redirect to a trailing slash; `/live` redirects to a date-specific page. Official navigation

| Placement | Label | Exact destination | Observed function or official description |
| --- | --- | --- | --- |
| Direct | Stats | the reference site's `/stats` page | Master player table, filters, presets, percentiles, charts and comparison workflow. |
| Direct | WOWY | the reference site's `/wowy` page | With/without-player and exact-lineup exploration; team and league-leader modes. |
| Live | Live | the reference site's `/live` page | Date navigation and game score cards; a completed historical date was inspected. Active-game updates remain unverified. |
| Live | Playoffs | the reference site's `/playoffs` page | Bracket and linked historical series detail, including team comparisons, player averages, matchup coverage and DPM rosters. |
| Players | Last X Games | the reference site's `/last-games` page | Recent-window comparison, game logs, per-game/per-36 views, custom stat selection, table/card modes. |
| Players | Showcase | the reference site's `/showcase` page | Configurable player cards, season/team/position/minutes filters, sorting and slideshow. |
| Players | Shot Profile Twin | the reference site's `/shot-profile-twin` page | Similar player-seasons by league-relative FT/rim/midrange/three-point volume and efficiency. |
| Players | Dashboard | the reference site's `/dashboard` page | Player exploration; initial screen includes season/team selection and top DARKO DPM players. |
| Players | Rankings | the reference site's `/rankings` page | Build overall/offense/defense/position ranking boards; consensus entry point. |
| Teams | Teams | the reference site's `/teams` page | Six-factor team analysis, ranking, time windows, table/cards and three-point-luck control. |
| Teams | Roster Shapes | the reference site's `/roster-shapes` page | Two- or three-dimensional roster shapes using DPM, style, minutes and projected rosters. |
| Teams | Stat Line Shift | the reference site's `/StatLineShift` page | Individual production with or without teammates; initial team selection and stat customization. |
| Teams | Contracts | the reference site's `/contracts` page | Team/year selection, known-payroll charts, contract timeline/details, coverage warnings and Small vs Big value/surplus comparison. |
| Teams | Free Agency | the reference site's `/free-agency` page | Signing/return/option/two-way/unsigned status, team and UFA/RFA filters, deal/source columns and freshness status. |
| Compare | PvP | the reference site's `/pvp` page | Two-player comparison; Overall/Offense/Defense/Six Factor/Custom views, metric editing and image sharing controls. |
| Compare | Team Compare | the reference site's `/team-compare` page | Menu describes side-by-side rotations by DPM or time-decay RAPM. |
| Compare | Matchup Matrix | the reference site's `/matchups` page | Defenders faced/players guarded, direct guarding matchup metrics and a Matchup PBP view. |
| Compare | Tier List | the reference site's `/tierlist` page | Menu describes drag-and-drop player tier lists with real statistics; full editing workflow was not inspected. |
| Research | zTS | the reference site's `/zts` page | Playtype-adjusted scoring-efficiency explanation, player metrics and historical comparisons. |
| Research | Six Factor RAPM | the reference site's `/six-factor-rapm` page | Shooting/turnover/rebounding impact decomposition and methodology. |
| Research | ShotQuality | the reference site's `/shotquality` page | Shot-quality/making/free-throw lineup-adjusted impact table, methodology and CSV controls. |
| Research | Shot Aftermath | the reference site's `/shot-aftermath` page | First-chance shots, recovered scoring and immediate opponent cost, with team/position/season filters. |
| Research | EPV Replays | the reference site's `/epv` page | Liga ACB tracking replays, possession list and expected possession value. This is not an NBA tracking dataset. |
| Research | D-ShotQuality | the reference site's `/d-shotquality` page | Closest/second defender expected and actual scoring, defended attempts and shot-type filters. |
| Research | Wingspan | the reference site's `/wingspan` page | Measurements, position/active filters, units, CSV, player overlays and historical measurement comparisons. |
| Research | Offensive Calculator | the reference site's `/calculator` page | Interactive offensive-rating model with shooting, volume, turnover and rebound controls. |
| Research | Learning | the reference site's `/learning` page | Educational guides and metric primers. |
| Research | The Kawhi Files | the reference site's `/kawhifiles` page | Menu link observed; article content was not independently inspected. |
| Research | Blog | the reference site's `/blog` page | Menu describes basketball essays about decisions, measurement and possession value; articles were not inspected. |
| Research | Patch Notes | the reference site's `/patch-notes` page | Menu describes recent changes; detailed history was not inspected. |
| Research | NBA Draft | the draft site | External draft-analysis product; linked from the menu, not independently investigated. |

The metric glossary is a supporting route at the reference site's `/stats/glossary` page. The stats page exposes its entry point; the web fetch timed out and this investigation did not validate the entire glossary catalog.

## Stats interaction and visual inventory

**Observed.** The main page is a dark charcoal application shell with muted borders, gold active controls, compact stacked controls and a large horizontally and vertically scrolling table. The table has grouped headers, player identity, numeric values accompanied by small percentile values, and a record count. A right-side panel provides hotkeys and hover-player information. The rendered page reported 500 records; that number is an inspection-time UI observation, not a CourtLoad capacity requirement. Stats

| Area | Visible controls or official page guidance | Verification boundary |
| --- | --- | --- |
| Context | Previous/next season, year selector, Regular/Playoffs, team selector, PG/SG/SF/PF/C, Draft Class. | Controls observed; not every option combination tested. |
| Metric views | Overview, Shooting, Impact, On-Off, Six Factor, Advanced, Defense, True Shooting. | Tabs opened; no numeric reconciliation performed. |
| Counting mode | Per Game, Per 75, Per 100, Totals. | Labels observed; exact denominators and missing-data rules not audited. |
| Identity density | Photos, Logos, Initials, None. | Controls observed. |
| Help | How to Use This Page, Stats Glossary, Hotkeys, patch-note teaser. | Main help dialog opened and read. |
| Scatter workflow | Click scatter icon, then two column headers; help describes automatically labeled outliers and active filters. | Official help description; end-to-end plot behavior not measured. |
| Trend workflow | Select players with checkmarks, then a stat column for multi-player trends. | Official help description. |
| Comparison | Selected-player comparison table; help says current filters apply and multiple players can be compared. | Official help description; no stress test of selection limits. |
| Custom columns | Drag reorder/remove columns in custom views. | Official help description; authenticated custom-view workflow unverified. |
| Numeric filtering | Minimum/maximum statistic ranges and active-filter pills. | Official help description; no exhaustive range/combination tests. |
| Player drilldown | A small dashboard icon beside a player opens a detailed sidebar; help describes categories, percentiles, season, playoffs, counting/advanced views. | Affordance and official help observed; full profile modes not independently validated. |
| Table footer | Density selectors, horizontal scroll controls, inline-filter control and fullscreen control. | Visible controls observed; performance and mobile behavior not benchmarked. |

All claims in this interaction table refer to the official stats page and its in-page help. They establish the reference workflow, not tested acceptance criteria for CourtLoad.

The hotkey panel advertises `T` fullscreen, `W`/`E` density, `F` inline filters, `G` glossary, `A`/`D` horizontal scrolling, `Z` main/comparison toggle, `C` add the hovered row to comparison, `Escape` return to the main table, and `Tab`/`Shift+Tab` change views. Exact keyboard behavior, conflict with focused inputs, accessibility and touch equivalents remain unverified. Stats hotkey panel

Search has two visible scopes: a dedicated `Search players...` field in the stats table and a global search button whose accessible label is `Search pages and games`, with a command-key shortcut. **CourtLoad inference:** these do not prove that the global search provides the player/team/entity suggestions requested for CourtLoad, nor do they identify its indexing algorithm. A replica plan needs an explicit CourtLoad search contract rather than inferring one from the button. Observed stats inputs

### Signed-in features and unverifiable functions

**Observed.** The logged-out stats page says `Log in for full functionality`. Custom-view creation/management controls in the supplied screenshot were absent in this rendered session. Favorites-related help says the favorites comparison control is only visible when logged in with saved favorites. The recent-games page also says signing in enables favorite-player persistence. Stats, Last X Games

**Author claim.** The saved announcement describes up to ten personalized views, reorderable columns and tabs, a saved default view, toolbar video matchups/favorites, and saved custom comparison selections of up to 25 metrics. It also describes career profiles, possession-weighted multi-year dashboards, mobile improvements and installable-web-app support. These were not verified behind authentication. [Saved author announcement](https://www.reddit.com/r/nbadiscussion/comments/1rlyily/i_built_a_free_nba_analytics_site_new_features/)

**CourtLoad inference:** persistent favorites, custom views, boards and comparison configuration require a defined persistence model. Reference authentication is not evidence that a local single-user workbench needs registration. Local settings and saved investigations may serve the approved local workflow; the plan must decide storage, portability and result provenance explicitly. [Current local-workbench decisions](../workbench-implementation-plan.md)

## Official methodologies and data requirements

### Team factors and player factors are different projects

**Official description.** The team page says its current six-factor values are calculated directly from box-score components and are not ridge-regressed yet. Offensive shooting, turnovers and rebounds combine with the corresponding defensive components, expressed relative to league performance. The page offers overall/offense/defense, table/cards, full-season/recent windows, per-100/totals and a three-point-luck control. Historical team-similarity functionality is described in the saved announcement but was not exercised during this inspection. Teams, [author announcement](https://www.reddit.com/r/nbadiscussion/comments/1rlyily/i_built_a_free_nba_analytics_site_new_features/)

**Official description.** Player Six-Factor RAPM uses a player-in-lineup design matrix, common stints and ridge machinery for three outcome regressions: true shooting, turnover rate and offensive rebound rate. Offensive and defensive coefficients give six factors. The page describes approximately six seasons with a 550-day half-life and no box-score priors. Its reported `R² = 0.985` is a reconstruction claim about that model, not out-of-time forecast validation or CourtLoad evidence. Six-Factor RAPM

**CourtLoad inference:** basic team decomposition can be scoped around admitted team/opponent counts and explicitly defined denominators. Player RAPM requires valid lineup reconstruction, possessions or stints, complete game coverage, model fitting and chronological validation. Adding names to a metric catalog does not create those prerequisites. Reference team methodology, reference player methodology, [CourtLoad contracts](../design/workbench-data-contracts.md)

### WOWY and teammate stat shifts

**Official description.** WOWY compares players together/apart or exact two-to-five-player units across seasons, leverage filters and lineup sizes. The official FAQ explains that the observed difference does not establish player causation because teammates, opponents, roles and sample size matter. League leaders add league-average performance equivalent to 550 offensive and 850 defensive possessions. Stat Line Shift separately describes individual production with and without selected teammates. WOWY, Stat Line Shift

**CourtLoad inference:** both need reliable substitutions, starting lineups, event order, player identity, on-court exposure and outcome attribution. Team/co-player appearance in aggregate boxes cannot stand in for on-court overlap. Any CourtLoad shrinkage policy needs documented priors, sample displays and reproducible validation; reference constants are not automatically approved defaults. WOWY explanation, [CourtLoad temporal and missingness rules](../../AGENTS.md)

### DARKO DPM and rotation comparisons

**Observed.** The dashboard explicitly credits `Top 50 DARKO DPM (via @kmedved)`. Team Compare describes rotations evaluated by DPM or time-decay RAPM. Dashboard, Team Compare

**CourtLoad inference:** exact DPM parity requires a verified external-output source, dates/versions, attribution and admissible reuse. This investigation did not establish an accessible integration or redistribution conditions. An internally trained replacement would be a different metric with its own validation, not DARKO DPM. Historic snapshots cannot use a currently retrieved rating as if it existed at the replay cutoff. DPM credit, [CourtLoad contracts](../design/workbench-data-contracts.md)

### ShotQuality and defensive attribution

**Official description.** ShotQuality RAPM decomposes shooting-efficiency impact into shot quality, making/contest and free-throw value, with offensive/defensive counterparts. The methodology credits ShotQuality spatial tracking for pre-shot expected values, explains foul-type-specific free-throw baselines, uses per-year additive expected-value calibration and fills missing initial expected values with that year's average actual points. Both ShotQuality pages show data-access request links. Defensive ShotQuality displays closest and second defenders, defended attempts, opponent expected value and actual points per shot. ShotQuality RAPM, D-ShotQuality

The current ShotQuality introduction describes a three-year model with a 550-day half-life, while its longer methodology mentions six seasons. The saved March announcement instead describes approximately 650,000 non-turnover possessions from 2023–24 through 2025–26 and 700-day time-decay weighting. These differences show that exact horizon/weighting details cannot safely be copied from the announcement or treated as one settled contract. No vendor access was requested. Current official methodology, [saved author description](https://www.reddit.com/r/nbadiscussion/comments/1rlyily/i_built_a_free_nba_analytics_site_new_features/)

**CourtLoad inference:** expected-value, defender and shot-context inputs are separate acquisition gates. Aggregate boxes cannot reconstruct vendor pre-shot expected values or nearest-defender assignments. Reuse of annually calibrated values in a historical replay also requires calibration restricted to information available before the cutoff. ShotQuality data credit and calibration, [CourtLoad temporal discipline](../../AGENTS.md)

### zTS and playtype difficulty

**Official description.** zTS adjusts efficiency for scoring playtype difficulty. Its methodology names Synergy playtypes from NBA Stats, estimates missing frequencies with surrounding-year playtype frequencies and other shooting information, and counts actual free-throw possessions instead of only the usual `0.44 × FTA` approximation. It applies a described technical-free-throw adjustment. zTS methodology

**CourtLoad inference:** playtype outcomes/frequencies and foul/event-level details are required for exact parity. Surrounding-year filling can use future information and therefore conflicts with CourtLoad historical feature discipline if copied directly. A CourtLoad counterpart must specify one-sided available-at-time imputation or explicit unavailability; missing frequencies cannot silently become known observed facts. Official missing-frequency method, [CourtLoad guardrails](../../AGENTS.md)

### Shot-profile similarity, shot aftermath and EPV

**Official description.** Shot Profile Twin compares eight FT/rim/midrange/three-point volume/efficiency dimensions relative to possession-weighted league-season averages. Similarity equally weights available standardized dimensions and requires at least six of eight dimensions to overlap. It includes cross-league and multi-season choices. **CourtLoad inference:** shot-location aggregates and appropriate exposure/league-average data are necessary; conventional boxes alone supply FT and three-point information but not the entire location profile. Similarity describes selected dimensions, not overall player equivalence. Shot Profile Twin

**Official description.** Shot Aftermath follows first-chance attempts, scoring recovered through offensive rebounds and the immediate opponent scoring branch. It labels its result partial accounting, not net rating or a shot-quality adjustment. Made-field-goal points exclude associated free throws, and the defensive-rebound branch does not cover every later opponent possession. **CourtLoad inference:** ordered shot/rebound/possession events and location classifications are needed to reproduce those branches. Shot Aftermath

**Observed and official description.** EPV Replays is labeled `LIGA ACB · PLAYER TRACKING`. Its inspected sample lists ten games, 1,467 possessions and 5 Hz updates. It describes expected possession value as the remaining expected scoring from the current state. **CourtLoad inference:** borrowing this visualization does not provide NBA tracking. An NBA version requires independent spatial/ball tracking, event alignment and a validated expected-value model. EPV Replays

### Roster shapes, measurements, finance and calculator

**Official description.** Roster Shapes credits Taylormetrics' Wyman Diagrams and Justin Liu's model/packer. Its inspection-time default was a projected 2026–27 roster view using a contract-book date of 2026-09-10, previous-season DPM/style and projected minutes/games. Its size formula uses DPM above replacement raised to a power and multiplied by minutes; outline fit is explicitly described as only a weak estimate. **CourtLoad inference:** attractive shape output cannot be presented as a validated causal roster-fit result or actual current-season performance. Roster Shapes

**Observed and official description.** Wingspan includes active/inactive and position filters, measurement units, a no-shoes/with-shoes display, CSV with NBA identity, overlays and comparison charts. It names NBA Combine, Nick Kalinowski, NBA.com and CraftedNBA as sources. Contracts offers team/year choices from 2022–23 to projected 2028–29. Free Agency names NBA.com signing status with manually verified contract-term overrides and exposes update/staleness status. **CourtLoad inference:** measurement evidence, financial terms, roster affiliation and transactions are independent source families; the reference interfaces do not prove their accuracy or available reuse. Wingspan, Contracts, Free Agency

**Official description.** The offensive calculator credits the paper *Dean Oliver's Four Factors Revisited* by Jirka Poropudas and Topi Halme, then describes its own adaptations. Controls manipulate efficiency, shot mix, turnovers and rebound recovery, and the page displays marginal changes and possession-flow decomposition. **CourtLoad inference:** a clearly labeled hypothetical calculator is feasible as a separate model surface, but event-specific 2P/3P/free-throw rebound baselines and exact possession turnover rates need more detail than ordinary aggregate boxes. The paper was not independently reviewed in this bounded inspection. Calculator and methodology

## Focused finance and Live follow-up: 2026-10-01

The owner explicitly includes contracts and free agency in the intended NBA replica foundation. The following expands the initial inventory with selected-team finance and historical playoff inspection. Figures are observations of what the reference displayed, not independently verified NBA salary, transaction or result facts. Follow-up browser artifacts were kept under `/tmp` only; no authentication or access requests were made.

### Contracts: selected team and financial assumptions

**Observed.** Choosing Toronto opens the reference site's `/contracts/TOR` page. The team selector and season dropdown cover 2022–23 through 2028–29; the default was 2026–27. Two tabs are available: Overview and Small vs Big. Both tabs and an individual contract drawer were opened. Changing every year/team combination was not tested.

| Surface | Concrete observed content/action | Status or assumption |
| --- | --- | --- |
| Roster coverage | Covered/active player counts, excluded salary rows, corrected stale team assignments, expandable unmatched-player list. | Toronto displayed 16 of 21 salary matches, five unmatched players and two corrected assignments. The text names **BDL** as the unavailable-salary source; underlying records and correction rules were not audited. |
| Threshold summary | Known Payroll, Known Cap Utilization, cap/tax/first-apron/second-apron markers and a focused monetary range. | Toronto displayed approximately $205.7M known payroll and **Threshold status pending**. It explicitly says missing salary rows must be filled before threshold status is exact. Threshold projection formulas were not exposed in the inspected UI. |
| Allocation charts | Total → position group → player payroll flow, payroll pie, guard/forward/center shares, and high-earner pie restricted to $8M+ players. | Denominators are known salary rows; coverage does not establish a complete team payroll or legal cap calculation. Pie legends provide selectable group/player controls. |
| Timeline | Multi-year player salary bars/values with guaranteed, player-option, team-option and free-agent legend, plus a DPM legend. | Toronto's inspected timeline spans 2026–27 through 2030–31. Option markers and future FA labels were visible; their source accuracy was not independently verified. |
| Contract drawer | Per-season cap hit/base salary/total cash, rank label, current and expired contract records, years, total/average/guaranteed value, signing mechanism, FA year/type. | Scottie Barnes' drawer displayed a current designated rookie extension and an expired rookie contract. The displayed `Team Rank #33` label was not reconciled or assumed correct. |
| Embedded research | Familiar Stats metric tabs, counting modes, identity controls and player table. | This combines salary context with player analytics; current projections and historical statistical context need distinct labels in CourtLoad. |
| Export | No finance-specific CSV/download/export control was observed in these views or the contract drawer. | Historical author descriptions do not establish a currently working finance export. |

The table records the rendered Toronto contracts page. **CourtLoad inference:** salary guarantees, options, partial guarantees, dead money, cap holds, exceptions and tax/apron calculations require explicitly admitted terms and a financial rules contract. Their complete handling cannot be inferred from four threshold markers or a known-payroll total. BDL was a visible source credit, not a verified zero-cost salary acquisition path. [CourtLoad source budget/admission requirements](../workbench-implementation-plan.md)

**Observed and official description.** Small vs Big credits `DARKO salary data via darko.app by Kostya Medvedovsky` and states that value, surplus and ROI use mapped rows only. Toronto showed 13 of 16 salary contracts mapped. The default split was small below $12M and big at least $12M, with a threshold control displaying $1M–$40M endpoints. Each side shows player salary/surplus plus group salary paid, mapped value, mapped surplus, mapped ROI and mapping counts. Unmapped players display `N/A` surplus. Threshold adjustment behavior and the model-to-dollar conversion were not tested. Small vs Big on Contracts

**CourtLoad inference:** model-derived value/surplus/ROI is an independent external-model capability, not factual contract value or a financial recommendation. The apparent aggregation cannot be reproduced by subtracting total team payroll when only mapped salaries enter the model comparison. A CourtLoad version must expose mapping coverage and verify its formulas; exact DARKO salary parity needs admitted external outputs. Reference mapping warning

### Free agency: filters, provenance and missing terms

**Observed.** Free Agency has All/Unsigned/Signed/Returned/Option/Two-way/Review status tabs with counts, a team selector, ALL/UFA/RFA buttons, `Search player, team, or source note`, and a Refresh button. Column buttons expose NAME, STATUS, TEAM, STATS and AGE sorting affordances. The grouped table shows player name/position/FA type/option label, movement status, team/open-market context, previous-season PTS/REB/AST, age/experience, deal terms and source note/link. Summary cards show tracked, unsigned, signed/returned, in-review and market-moved totals. A timestamp and Source current/stale state are separate from those counts.

The inspection displayed 239 tracked entries. The unsigned summary showed 71 while the dedicated Unsigned tab showed 45; the UI alone did not explain that difference. Zero-valued statistical rows were also visible for some players, but no missingness interpretation was established. No dollar-valued terms appeared in the inspected full rendered text, and sampled Terms cells were `—`. A replica must not treat missing financial terms or missing outcomes as zero. No CSV/export action was observed. Filter/sort/refresh result correctness was not established; some follow-up control locators did not resolve within the bounded browser wait. Observed tracker

**Official description and observed links.** The page identifies NBA.com signing status and reference manually verified term overrides; its footer distinguishes status from verified terms. The source button links to [NBA 2026 free-agent tracker](https://www.nba.com/players/free-agent-tracker/2026), while individual rows link to NBA/team announcements, [transactions](https://www.nba.com/players/transactions), or [option/qualifying-offer news](https://www.nba.com/news/2026-free-agency-options-and-qualifying-offers). These links were observed but every underlying announcement was not fetched. **CourtLoad inference:** source status, normalized movement, unresolved/review state and independently verified deal terms need separate observations and versioned provenance. Manual override capability is not permission to invent unsupported amounts. Reference tracker credits

### Live and playoffs: current updates versus historical analysis

**Observed.** `/live` redirected to the inspection date, which had no games. A seven-day strip has previous/next-day controls. May 30, 2026 rendered a completed game card with final status, team records, score and numeric hotkey hint. That visit requested the public backend live-games endpoint plus separate standings, injury and odds paths. The existence of those requests does not admit those source families to CourtLoad; betting/odds remain outside its stated scope.

**Observed first-party implementation detail.** The delivered live-games hook contains a 30-second default, server hints bounded to 5–300 seconds, a five-second clutch cadence and retry/error behavior. However, its imported frontend polling flag is `false`, disabling that hook's recurring polling branch in the inspected deployment. A 12-second historical-date observation showed one games request. Backend refresh cadence, any other update mechanism and actual active-game reliability remain **unverified**; the `Live` label and dormant constants are not refresh acceptance evidence.

**Observed.** Playoffs presents east/west bracket paths with series outcomes and a Finals link. The bracket retained a June Game 1 teaser while Finals detail showed a completed 4–1 series. Series detail includes seeds/regular-season records, series winner, game-by-game final cards, unplayed-game placeholders, team ORTG/DRTG/net comparisons, four factors, sortable-looking player series averages, Basic/Advanced and Both/team controls, matchup-data coverage, and roster comparisons by DARKO or time-decay RAPM with offensive/defensive switches. The inspected basic table displayed 5-of-5 box-score coverage while the matchup area displayed 0-of-5 and a claim that matchup ingestion occurs about five minutes after a final. That delay was not measured.

**CourtLoad inference:** playoff bracket/series facts and completed-game analytics form a historical capability that can be built independently of active-game polling. Possession/matchup/model components still need their own admission gates. Unplayed placeholders must remain non-outcomes. A replica plan must choose refresh requirements explicitly and reconcile the reference's stale bracket teaser with its populated detail, rather than treating all playoff surfaces as equally current. Bracket, series detail

## Dependency classes for implementation planning

These classes are **CourtLoad inferences**, not assertions about the reference site's internal architecture. A view can cross several classes; its dependency is determined per metric or interaction rather than by its menu label. The existing recent-source investigation verified conventional player/team boxes and schedules, not these richer source families. [CourtLoad source findings](workbench-source-findings.md)

| Class | Candidate functionality | Admission/engineering prerequisite |
| --- | --- | --- |
| UI, content and local state | Shell/menu layout, table density, sorting/filter controls, generic comparison, custom views, favorites, educational pages, boards. | Working typed query contracts, accessible interactions, bounded persistence and explicit data-unavailable states. The interface alone does not validate metrics. |
| Player/team box scores | Traditional counts and ratios, recent-window production, conventional efficiency, descriptive teams, basic trends/cards/rankings. | Reconciled observations, identities, phases, windows, minimum samples, summed-make/attempt percentages and documented denominator choices. Exact per-possession variants may require another class. |
| Ordered play-by-play and lineups | WOWY, on/off, Stat Line Shift, RAPM/Six-Factor RAPM, exact foul/free-throw accounting, shot aftermath, possession-normalized exposure. | Ordered events, substitution/starting-lineup validation, possession/stint reconstruction, reconciliation, coverage reporting and model evaluation. WOWY, Six Factor, Aftermath |
| Shot locations and playtypes | Shooting-location presets, full shot-profile twins, playtype-adjusted zTS. | Admitted location/playtype frequency/outcome data, compatible definitions and explicit missingness; these do not follow from aggregate boxes. Twin, zTS |
| Tracking, guarding and vendor expected values | Direct Matchup Matrix, closest/second defender analysis, ShotQuality and spatial EPV. | Verified rich input access and reuse, identity/event alignment, expected-value validation and source-specific coverage gates. Matchups, ShotQuality, EPV |
| External models and contextual metadata | DARKO DPM, DPM rotation comparisons, roster shapes, measurements. | Versioned model outputs or distinctly named internal models; admitted measurement/style/depth-chart data; published assumptions. Dashboard, Roster Shapes, Wingspan |
| Live, roster, transaction and financial inputs | Live games, current rosters, playoff state, contracts, free agency. | Independently verified freshness, event/status semantics, financial detail and operational update paths. Historical boxes and a future schedule do not prove live coverage. Live, Contracts, Free Agency |

## Temporal and claim conflicts to resolve

The following are **CourtLoad architectural implications** derived from the reference and existing [guardrails](../../AGENTS.md). They are proposed requirements for the new plan, not changes made by this note.

1. **Cutoff-safe estimation:** replace or constrain surrounding-year zTS filling; bind all priors, league averages, standardization, calibration and model fits to information available before the replay cutoff. Full-season/vendor corrections cannot silently change prior feature/profile hashes. zTS filling, ShotQuality annual calibration
2. **Observed versus projected:** distinguish current-season observations, previous-season reference ratings, reconstructed historical schedules and projected depth charts. Default projected roster shapes do not establish current results. Roster Shapes projection labels, [workbench issuance rules](../workbench-implementation-plan.md)
3. **Descriptive versus causal:** preserve the reference's WOWY caveat and Shot Aftermath accounting limits. Do not infer guarding assignments from shared games, explain DPM as observed causation, or rank an overall best defender using isolated defensive counts. WOWY, Aftermath, [CourtLoad player/team rules](../design/workbench-data-contracts.md)
4. **Metric parity versus approximation:** label conventional TS, estimated possessions, imported impact outputs and internal alternatives by their actual definitions. Exact free-throw accounting, tracking expected values and possession exposure cannot be substituted with an unlabeled approximation. zTS, ShotQuality, DPM credit
5. **Capability-level availability:** a working menu does not establish admitted data, reliable refresh, tested behavior or a validated model. Show real unavailable reasons and keep each feature's source gate independently reviewable. [Current source limitations](workbench-source-findings.md), [current workbench release gates](../workbench-implementation-plan.md)
6. **Reference version ambiguity:** resolve inconsistent ShotQuality horizons and the difference between historical patch notes and present descriptions before choosing any implementation constants. Reconstruction `R²` does not substitute for CourtLoad's chronological evaluation. Current ShotQuality, Six Factor, [March announcement](https://www.reddit.com/r/nbadiscussion/comments/1rlyily/i_built_a_free_nba_analytics_site_new_features/)

## Historical author claims retained separately

The saved announcement is useful for product intent and workflow details that were not all accessible in a logged-out session. The following are **author claims only**, sourced to the [March announcement](https://www.reddit.com/r/nbadiscussion/comments/1rlyily/i_built_a_free_nba_analytics_site_new_features/):

- Stats had more than 100 metrics; its toolbar supported scatter plots, line trends, video matchups, comparisons, favorites and column reordering.
- Custom views supported up to ten tabs, reorderable columns/tabs and a saved default view.
- Clicking a player opened career statistics and percentile breakdowns.
- Teams provided historical similarity across 2002–2026, card/tree and sortable-table views, and arbitrary-stat scatter plots.
- PvP's fifth/custom tab combined up to 25 chosen metrics and saved the view.
- Player Dashboard supported single-year, multi-year and career modes from 2001 onward, with possession-weighted aggregates and counting/totals modes.
- Live was described as a basic skeleton still under construction and advertised game/box-score keyboard shortcuts.
- The site supported improved mobile interactions and installation as a web app.

In saved comments, the author names NBA API for play-by-play and PBPStats for many statistics. This is a first-party source-use claim, not a verification of endpoint access, completeness, reuse terms or CourtLoad ingestion suitability. The author's informal statements about terms of service were not adopted as source-admission evidence. [Saved announcement and author comments](https://www.reddit.com/r/nbadiscussion/comments/1rlyily/i_built_a_free_nba_analytics_site_new_features/)

## Remaining verification limits

- Initial rendered interfaces and navigation were inspected; complete interaction flows, numeric correctness, exports, persistent state, mobile behavior, latency and scale were not benchmarked.
- No signed-in feature was exercised, so the current limits and persistence behavior of custom views, favorites and saved comparison selections remain unverified.
- No active live game or ongoing playoff series was available in the inspected flow. Historical live-date cards and completed Finals detail were inspected in the focused follow-up above; active-game refresh and matchup-ingestion delay remain unverified. Live, historical series
- Vendor requests were not made. Vendor access, pricing, coverage, metadata, licensing and redistribution remain unestablished; access-request links are evidence of a gate, not its result. ShotQuality, D-ShotQuality
- Several research/content destinations and the external draft site were mapped from official navigation only, as identified in the route table.
- Site-reported model performance and methods were recorded without independent reproduction. No CourtLoad application verification suite was run because this task changed one planning evidence document only.
- Yahoo Fantasy Plus, semantic search architecture, incremental entity-search indexing and Fontshare selection are separate investigations; this note does not claim to have researched them.

The next implementation plan can use this inventory to assign per-feature evidence, data gates and acceptance criteria. It should distinguish replica workflow fidelity from the availability and validity of the analytical inputs behind each page, then record owner decisions about unsupported or newly acquired capabilities before implementation blocks are assigned.
