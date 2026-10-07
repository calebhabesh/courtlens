# Replica feature and interface contract

2026-10-01. Parent: [implementation handoff](../databallr-replica-implementation-plan.md). **Prescribed behavior; not completion evidence.**

The [reference inspection](../research/databallr-replica-findings.md) distinguishes rendered/advertised behavior and source/model dependencies. Recreate the applicable workflows using CourtLens identity, data and original explanatory content. A reference route is an inventory key, not an instruction to copy its code, article text, unverified constants or numerical outputs.

## Complete feature map

Every row stays in the implementation coverage ledger. `Gated` means the feature requires its named inputs, not that it may silently disappear from scope. A working partial page declares which components are available. Record exact-parity, named-alternative and unavailable components separately.

| ID / menu | Reference → CourtLens route | Required functionality | Blocks / principal gate |
| --- | --- | --- | --- |
| F01 Stats | `/stats` → `/stats` | Dense player table; grouped headers, season/phase/team/position/draft/measurement/sample/stat filters, sort, browse and paging. | B01–B07, B14; metadata filters only when admitted |
| F02 Stats presets | Stats toolbar | Overview, Shooting, Impact, On-Off, Six Factor, Advanced, Defense, True Shooting plus Workload/Consistency/Custom. Catalog-driven columns. | B02–B07; richer presets use B20–B26 |
| F03 Counting/identity | Stats toolbar | Per Game, Per 75, Per 100, Totals; optional per-36; Photos/Logos/Initials/None; percentile sublabels; density/fullscreen. | B02, B07; actual exposure for possession modes |
| F04 Custom views | Add View/Manage | Up to ten personal views with up to 25 chosen columns each; add/name/default/reorder/edit/delete, import/export preferences; built-in presets recoverable. | B08–B09 |
| F05 Favorite/compare tray | Stats row/toolbar | Favorite players, add/remove selected players, hover/focus details, retained comparison tray and table/compare toggle. | B07–B10 |
| F06 Table plots | Scatter/line controls | Choose two metrics for scatter, identify selected/outlier points; player lines over a chosen window; accessible result tables. | B10 |
| F07 Help/discovery | Help/Glossary/Hotkeys/Search | Definitions, keyboard guide, incremental global lookup, local table-name filter, discoverable tooltip units. | B02, B04–B07, B35 |
| F08 WOWY | `/wowy` → `/wowy` | Team/player-set and leader views, together/apart predicates, exact 2–5-player units, season/sample/leverage controls, exposure/ratings. | B19–B22; validated shared-court data |
| F09 Live | `/live` → `/live`, `/live/[date]`, `/live/games/[id]` | Date strip, game cards/clock/status, selected-game team/player boxes, historical final detail, pause/stale/offline. | B31–B32 |
| F10 Playoffs | `/playoffs` → `/playoffs`, `/playoffs/[seriesId]` | Bracket and explicit seeds/series state, game cards, final-series team/player summaries; gated matchup/rotation sections. | B17–B18, B23/B25 where needed |
| F11 Recent games | `/last-games` → `/last-games` | Last-X-appearance and date/range/player filters, per-game/per-36/custom columns, table/cards, game logs and recent-game comparison. | B03, B10–B11 |
| F12 Showcase | `/showcase` → `/showcase` | Configurable player cards and manually controlled slideshow; metric/year choices and comparison/export actions. | B08–B11; motion can pause |
| F13 Player dashboard | `/dashboard` → `/players/[id]`; `/dashboard` opens player selector | Profile, summary/percentiles, season/multi-season/partial-career, game logs, trends, forecast availability and source evidence. | B03, B10–B14; imported impact gated |
| F14 Statistical peers | CourtLens addition → `/research/similarity` | Recent statistical/workload dimensions, explicit cohort/window/distance, explain matches and open comparison. | B12–B13 |
| F15 Shot twins | `/shot-profile-twin` → same | Shot-location/volume/efficiency player-season peers, feature overlap and league context. | B23–B24 |
| F16 Ranking boards | `/rankings` → `/rankings` | Personal overall/offense/defense/position boards, explicit subjective notes/scopes, favorite IDs, export/import; local aggregate of selected boards with population/missing-rank rules. | B08–B09; no invented global community consensus |
| F17 Teams | `/teams` → `/teams`, `/teams/[id]` | Table/cards, production/allowance, team factors, season/recent windows, participation cohort and historical peers. | B14–B16 |
| F18 Three-point variation | Teams control | Observed versus hypothetical league-reference 3P conversion scenario, with unchanged actual facts. | B15–B16; versioned scenario, never rename as luck removed |
| F19 Roster shapes | `/roster-shapes` → same | Position/player allocation diagrams; selectable observed or explicitly projected minutes/impact/financial sizing inputs. | B14, B25–B27, B28 where finance needed |
| F20 Teammate stat shift | `/StatLineShift` → `/stat-line-shift`; compatibility redirect | Individual production with/without specified on-court teammates; per-minute/possession and sample views. | B20–B22 |
| F21 Contracts | `/contracts`, `/contracts/[team]` → same | Team/year, coverage, known payroll, allocation charts, multi-year salary timeline, contract drawer, embedded player Stats. | B28–B30 |
| F22 Financial value | Contracts Small vs Big | Adjustable salary split, matched-row salary/value/surplus/ROI summaries, mapping/sample coverage and model identity. | B25, B29–B30; external conversion or registered named scenario |
| F23 Free agency | `/free-agency` → same | Status/type/team/search/sort filters, tracked totals, movement, known deal terms, source notes/timestamps, Refresh and import/correction path. | B28–B30 |
| F24 Player compare | `/pvp` → `/compare`; `/pvp` compatibility redirect | Two-player Overall/Offense/Defense/Six Factor/Custom views, up to 25 selected metrics, samples, plots and save/data/image export. | B10, B22/B26 where needed |
| F25 Team compare | `/team-compare` → same | Two-team production/factor/rotation comparison; external or registered impact optional per component. | B15–B16, B25–B27 |
| F26 Matchups | `/matchups` → same | Offensive/defensive player pair matrix, assignment time/possessions/attempts, game detail and coverage. | B19, B23–B24; assignment source required |
| F27 Tier lists | `/tierlist` → same | Local tiers and player cards; drag plus keyboard move; explicit subjective board titles, export/import. | B08–B09 |
| F28 Adjusted shooting | `/zts` → `/research/adjusted-shooting`; `/zts` redirect | Conventional TS first; named playtype-adjusted variant only after admitted inputs, prior-only baselines and evaluation. | B25–B27; no surrounding-future-year fill |
| F29 Six-factor research | `/six-factor-rapm` → same | Registered offensive/defensive factor coefficients, samples/model card, controls and reproducible result views. | B25–B27 |
| F30 Expected-shot research | `/shotquality` → `/research/expected-shots`; `/shotquality` redirect explains identity | Named CourtLens expected-shot experiment with location/type inputs and calibration; externally sourced vendor parity only if admitted. | B23, B25–B27 |
| F31 Shot aftermath | `/shot-aftermath` → same | First-chance shot → recovery/next-possession branches, declared horizon/scoring rules, zone/team/player filters and samples. | B20, B23–B24 |
| F32 Defensive assignments | `/d-shotquality` → `/research/defensive-matchups`; compatibility explanation | Admitted assignment/contest summaries; external expected values or own model clearly identified. Nearest/second defender only with those actual inputs. | B23–B27; rich-input gate |
| F33 Spatial EPV | `/epv` → `/research/epv` | Capability/methodology page; NBA spatial replay only after NBA tracking and model gates. | B25–B27 if inputs ever admitted; ACB demo excluded |
| F34 Measurements | `/wingspan` → same | Listed versus combine measurements, draft/position/active-evidence filters, units, compare/scatter and source export. | B14, B27 |
| F35 Hypothetical calculator | `/calculator` → same | Editable shooting/turnover/rebound assumptions, defined offensive-rating scenario, contribution/flow charts, explicit unsupported inputs. | B15, B20, B27; scenario definition |
| F36 Learning | `/learning` → `/learning` | CourtLens's own metric/model tutorials, worked queries and dataset-bound examples; links to definitions and explorations. | B35 |
| F37 Case studies | `/kawhifiles` → `/research/case-studies`; compatibility redirect | Original reproducible player/team investigations, including previously agreed case studies; saved manifests and cited limits. | B13, B35 |
| F38 Blog/patch notes | `/blog`, `/patch-notes` → same | Original Markdown-based articles and release notes, source/date and links to implemented capabilities; no CMS/account dependency. | B35 |
| F39 Workload/change | CourtLens addition → Stats view and `/research/trends` | Disjoint window deltas for minutes/attempts/production, filter/rank and examine game rows. | B12–B13 |
| F40 Distributions/splits | CourtLens addition → Stats view and `/research/distributions` | Median/IQR/quantiles, rest/home-away/opponent comparisons, samples and overlapping-period disclosure. | B12–B13 |
| F41 Chatbot | Ask CourtLens drawer and `/research/ask` | Natural-language conversation, clarification/refinement, verified cards/plots, evidence, Open in Stats/save. | B33–B34 |
| F42 Pipeline/evidence | `/data-status`, `/investigations`, `/methodology`, `/settings` retained | Source/phase health, refresh/jobs, release pointer, saved results/reproduce/export, definitions and configuration status. | B01, B03, B35–B37 |
| F43 Forecasts/evaluation | `/forecasts`, `/evaluation` retained | Existing points policies/issuance/scoring and sealed historical experiment views, distinct targets/intervals/model cards. | Existing work verified in B00, integrated B11/B35–B37 |
| F44 Source video links | Advertised toolbar video matchup workflow → game/event detail | Link or embed an actually supplied, mapped source clip when permitted; preserve game/event/player identity and unavailable state. | B23–B24; clip URL/availability is a separate unverified source gate |
| F45 Installable interface | Author-advertised web app → application manifest/install flow | Installable app metadata/icons, narrow-screen flows and local static assets; no compulsory push account or offline write sync. | B35–B37; signed-in reference installation was not independently exercised |
| F46 Image sharing | PvP image/share controls → comparison/cards/charts | Download a bounded image of a selected analytical view with title, units, context and evidence identifier; optionally copy an equivalent local query URL. | B10–B11, B35; rendered snapshot is separate from analytical evidence |

Exclusions are explicit: Home basketball game, WNBA/non-NBA products, external draft site, betting/odds, public registration/social consensus, and injury/appearance prediction. The reference's injury/odds HTTP requests do not establish a verified injury-news feature; any later source-reported availability surface needs its own scope/source contract. An absence in data remains unknown.

Compatibility routes are convenient mappings, not a requirement to recreate capitalization or vendor identity in canonical URLs. The navigation selects canonical routes and preserves context. Existing `/players` becomes a compatibility entry into the Stats player explorer; `/players/[id]`, old evaluation URLs and `/schedule`/`/planner` remain available. Root `/` resolves context then opens `/stats`, without a marketing landing page.

## Navigation and screen layout

Desktop uses the full viewport width and two compact horizontal rows:

```text
CourtLens   Stats · Games         [Search players, teams and pages]  Ask  Data status  Settings
Stats  WOWY  Live ▾  Players ▾  Teams ▾  Compare ▾  Research ▾                    Help ▾
───────────────────────────────────────────────────────────────────────────────────────
Season(s) · Phase · Before date · Window · Team · Sample       Release / New data available
View tabs · Filters · counting mode · identity mode · charts · compare · manage
───────────────────────────────────────────────────────────────────────────────────────
Pinned player identity | grouped metric headers / sortable values      | detail drawer
                      | dense table with internal scroll              | or hover sidebar
                      |                                               | evidence / chat
Records · active sample/cohort · pagination · density/fullscreen · keyboard hints
```

Stats is immediately visible. Games opens Live; it does not open the excluded Home game. Players includes Recent games, Showcase, Dashboard selector, Statistical peers, Shot-profile twins and Rankings. Teams includes Team stats, Roster shapes, Teammate shift, Contracts and Free agency. Compare includes Player, Team, Matchups and Tier lists. Research groups CourtLens investigations/Ask/Forecasts/Evaluation with the advanced/reference research destinations. Help contains Definitions, Learning, Hotkeys and original release notes. Operations/settings remain accessible without consuming the main analytical menu.

Use real dropdown button/menu semantics, pointer and keyboard interaction, visible selected states and an escape path. Large research dropdowns may use columns on desktop; collapse into readable groups on narrow screens. Avoid rendering inert links as if their analytical features work: an unimplemented/gated destination opens an explanatory capability page with its actual missing input and relevant available tools.

## Visual language and dimensions

Preserve CourtLens name and basketball mark. Use Databallr's charcoal surfaces, muted boundaries, restrained warm active accent, dense control groups and table-first hierarchy. Existing orange identity can remain in the mark; selected controls use one consistent semantic accent. Initial values below are design starting points to verify for contrast, not measured colors extracted from the reference.

| Token | Initial value / rule |
| --- | --- |
| Page background | `#20252e` |
| Table/panel | `#282f3b` |
| Raised controls/hover | `#323b49` |
| Border | `#465160`; interactive outlines/focus independently checked |
| Main text | `#f1f3f6` |
| Muted text | `#b4bdca` |
| Active accent | `#ffd166`, dark foreground `#20252e` |
| Positive / warning / failure | Existing semantic tokens with text/icon labels; do not use accent alone as status |
| Main/application rows | Approximately 44–48 px and 36–40 px desktop |
| Page/control spacing | 12–16 px edge padding; 6–10 px control gaps; compact groups |
| Table text / row height | 13–14 px; standard 36–40 px; compact variant after readability check |
| Headings / body | 20–28 px page titles; 14–16 px explanations |
| Portraits / drawer | 28–32 px rows; 72–96 px detail; approximately 320–360 px drawer on wide screens |

Implement semantic CSS variables for surfaces, boundaries, typography, active states, plots and density. Dark controls render consistently on server/client. Scope retained legacy planner CSS. Keep a single icon family or existing code-native SVG system, with readable text labels; remove structural emoji icons in the application shell. An icon-only action needs a name and visible tooltip/focus affordance.

## Stats interactions

- Pinned identity columns contain player, observed team scope and optional portrait/logo. A missing portrait uses the existing fallback; it never removes an identity.
- Group headers organize Profile, Counting, Efficiency, Location, Impact/On-Off and Other as supported by the selected preset. Units, formulas, sample validity and ordering come from the catalog.
- The same control bar supports season/phase/exclusive cutoff/window, observed team participation, metadata filters, minimum valid sample/minutes and compound numeric predicates. Filters produce URL/share/save state.
- Counting-mode switches are server-defined normalizations. Percentages stay percentages; impact outputs retain their own units. Per-75/100 uses admitted possession exposure, not minutes multiplied by an assumed pace.
- Numeric alignment/precision/sign conventions are consistent. Null is `—` with a reason, never zero. Percentiles display as cohort percentiles with their population/filter definition and may be absent.
- Sort uses raw server values; display rounding does not change order. Stable identity breaks display ties without declaring analytical superiority.
- Name filtering updates only the table query. Global lookup navigates/discovers entities independently; neither calls Gemini on each keystroke.
- Column reorder/removal and view reorder have keyboard/button alternatives. Deleted built-in presets can be restored. Empty or unsupported custom metrics remain identifiable and editable.
- Hover details also open on focus/selection. An explicit row action opens full detail. Show the same information through keyboard/touch interaction.
- Initial comparisons use two players; the tray supports bounded multi-player descriptive charts/tables (maximum eight). No winning probability is generated from differences or overlapping forecast intervals.
- Fullscreen is optional and must gracefully fall back to expanded application layout. Density preferences persist locally. A horizontal table scrollbar is confined to its labelled region.
- Show actual eligible record count, page count/next cursor, sample/cohort and last included date. Preserve view/filter/context while changing pages.

Expose the reference's useful shortcuts with a visible guide: `/` or Cmd/Ctrl+K opens lookup; Escape closes overlays; T expands table; F opens filters; G opens glossary; Z switches table/compare; C adds focused row; Tab moves focus normally. A/D and W/E scrolling/density shortcuts apply only when the table shortcut mode is explicitly focused. They must not hijack typing, browser conventions, assistive navigation or ordinary Tab behavior.

## Charts, detail and original content

Scatter plots support selected metrics/cohort, labels for selected/extreme values, table alternatives and open-player actions. Multi-player lines display actual observations and an optional declared rolling statistic, preserving gaps. Distribution charts use empirical samples; calibrated forecast intervals use a separate style and their actual policy/calibration identity.

Charts expose meaningful focusable values or an adjacent data table. Colors have labels and line/marker alternatives. Keep SVG/HTML for bounded plots; add a library only for a demonstrated missing interaction. Initial series/point counts are bounded by the query contract. Table virtualization is optional after measurement; semantic table/navigation behavior is part of acceptance.

Source-provided game/event video can appear as a link or bounded embed after identity/source checks. A recorded event does not imply an available clip; fabricated URLs, unverified clip matching or a compulsory video subscription do not satisfy the feature. Installable app metadata uses the existing mark and legitimate static assets. If a service worker is used, version static caches and retain explicit release IDs for analytical cache entries; never cache credentials or treat cached source freshness as current. A simple installable shell does not promise full offline database operation or background synchronization.

Image exports render the selected server-backed comparison/chart/card and include its dataset/period/units and saved-result identifier when available. Use local SVG/canvas or an allowlisted rendered-view capture, without fetching arbitrary URLs or requiring AI-generated images. Text/data exports remain the reproduction path; an image is a presentation artifact. A copied local URL is labelled local and is not promised accessible to another person without the same retained inputs/application.

Profiles show observed identity/team context, eligible time coverage, sample sizes, game logs, season/partial-career summaries, trends, lineage and forecast availability. Latest portraits do not establish historical team membership. Career totals require admitted seasons and are not silently completed from missing years.

Learning/blog/case studies use the project's own Markdown and saved investigations. Patch notes describe actual releases. Definitions connect metric keys/formulas/limitations to working explorer examples. Avoid decorative fake charts or arbitrary highlight numbers.

## Finance and Live presentation

Contracts shows salary/contract observation coverage, amount type, financial year and team-association evidence. Known payroll is explicitly known payroll. Position allocations and timelines disclose the represented rows. Drawers distinguish base salary, cash and cap hit, guarantees/options and source dates. Future unexercised options or assumed contract outcomes are scenario layers, not current facts.

Small vs Big uses a configurable salary threshold; only mapped comparable rows enter model value/surplus/ROI. Unmapped players keep their factual contract data and show unavailable modeled value. The model-to-money identity and limitations are accessible. Incomplete financial components suppress exact cap/tax/apron labels.

Free agency uses a single status taxonomy/count source for tabs and summaries. Team/type/name/source-note filters, sort, source timestamp/staleness and known terms are functional. Signing status and verified financial terms are independent. Refresh returns a tracked job promptly; imports/corrections use the operator boundary and display their provenance.

Live shows its provisional observation time, last successful fetch, game status/clock and pause/stale state. Game cards can work without player boxes. Historical finals use retained finalized facts where admitted. Opening a Live view never changes the Stats release or a saved investigation. Hidden/unmounted views release demand; users can pause updates. Source failure retains the last observation with its age.

Playoff brackets/series are factual views with explicit source and phase. Scheduled/unplayed entries retain placeholders; missing matchup/rotation capability does not erase final box-score summaries. Previous/current season context is labelled.

## Accessibility, narrow layout and acceptance

At 1440–1536 px show full controls/table and optional side detail; at 1024 px reduce peripheral content; at 375 px collapse menus and use a labelled horizontal table region or compact row summaries with detail access. Preserve core filters, lookup, player detail, comparison, chat and finance on narrow screens. The body itself must not overflow. Hover-only data, drag-only controls and tiny glyph-only navigation do not satisfy the contract.

Check 4.5:1 text contrast and 3:1 interactive boundaries/focus. Maintain proper table headers and `aria-sort`, labelled controls, live query-completion status, dialog focus/return, reduced motion and 200% zoom usability. Active/selected/error states have text or structure as well as color. Focus must remain visible below sticky controls.

Create reference/replica screenshots for desktop Stats, custom view/compare, WOWY, player, teams, contracts/free agency, Live/series and chatbot. Compare control hierarchy, navigation, working-area density, grouped headers, scroll/detail behavior and responsive flow. Fidelity does not require illegible screenshot-scale text or reference bugs. Screenshots follow numerical reconciliation and include source context.

## Typography deferred

Keep current fonts until actual table/control layouts exist. Later compare the [verified candidates](../research/fontshare-interface-findings.md): Clash Grotesk headings + Switzer UI/data, or Public Sans with optional JetBrains Mono. Verify glyphs, numerals and packaging for the chosen files. The closed Fontshare license and OFL have different redistribution conditions; use a legitimate local acquisition/package path. No runtime font service is required.

Final typography is an owner preference, not a prerequisite for data/search/Live implementation. A font decision cannot silently introduce network dependence or change the dense-table acceptance budgets.
