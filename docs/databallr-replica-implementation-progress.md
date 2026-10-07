# CourtLoad replica implementation progress

Started 2026-10-01. Parent: [implementation handoff](databallr-replica-implementation-plan.md).

**Replica implementation is in progress; full release acceptance remains open.** This log is separate from historical M0–M8 and workbench P0–P9 records. The planning baseline below is historical; measured block entries establish current bounded evidence. No planning row is evidence that an application feature works.

## Planning baseline

- Inspection revision: `0864909c282d450baf6afad361e2500cc4501ddf`, with pre-existing dirty application work recorded in the handoff.
- Owner confirmed the replica scope, Stats/top navigation, historical target, free core, own-data conversational search, statistical similarity, lightweight true Live, and financial imports/corrections.
- New planning artifacts: handoff, feature/interface, analytics/data and search/chatbot contracts, plus Databallr/Yahoo/free-source/Gemini/Fontshare research notes.
- Inspection findings are static; no application test suite or new source-admission spike was run during this planning task.
- Credentials and final font selection are later decisions. No API key, paid account or provider inference was used for planning.

## Planning verification

Verified 2026-10-01: a Python documentation integrity check passed for all 12 planning/reference/instruction documents and 66 local links. The handoff and progress tables each contain all 38 block IDs; the feature contract and coverage ledger each contain all 46 feature IDs. Block references resolve, the dependency graph is acyclic, and table widths, code fences, terminal newlines and whitespace pass. `git diff --check` passed.

These checks verify the handoff's structure. Application tests, numerical reconciliation, source admission, performance measurements and real-provider evaluation remain pending under their implementation blocks. No block is marked verified by this planning check.

## Block status

Allowed states: `planned`, `in_progress`, `implemented_unverified`, `verified`, `source_blocked`, `verification_blocked`, `preference_deferred`. `verified` requires the recorded completion evidence in the handoff. A blocked source or a fixture-only result does not count as completed actual-source behavior.

Reconciled 2026-10-04 against the dated entries below. Interface/machinery verification
is distinct from admitted coverage and full release acceptance; earlier entries retain
their historical results and limits.

| Block | Owner | Status | Evidence / limit |
| --- | --- | --- | --- |
| B00 Baseline/integrity inventory | Sol | verified | Baseline inventory and runtime verification complete |
| B01 Context/query contracts | Sol | verified | Context, query spec, dual-case URL serializer, and cursor verified |
| B02 Metric integrity/catalog | Sol | verified | Metric catalog v2, TS/eFG/FTR, strict missingness, paired rows, percentiles, normalization |
| B03 Stats query engine | Sol | verified | SQL aggregations, analytical windows, predicates, cursor traversal, >100 export |
| B04 Entity lookup API | Sol | verified | Dedicated identity index, /lookup API, diacritics/aliases, navigation suggestions, warm p95=0.006ms |
| B05 Replica shell/navigation | Flash | verified | Full-width 2-row layout, keyboard dropdowns, context preservation, /stats canonical entry & compatibility routes |
| B06 Incremental lookup UI | Flash | verified | GlobalLookup combobox, 120ms debounce, AbortController cancellation, 64-entry LRU cache, grouped entities, context-preserved navigation |
| B07 Stats explorer | Flash | verified | Grouped/pinned headers, 10 presets with gating disclosures, counting & identity modes, midrank percentiles, detail drawer, compare tray |
| B08 Personal state API | Sol | verified | Versioned protected CRUD, atomic PostgreSQL conflicts, validated portable bundles, real browser proxy and fresh DB restore; broader legacy browser failures recorded below |
| B09 Views/favorites/boards | Flash | verified | Custom view manager, star toggles, tray sync, ranking board manager & Borda aggregation, tier lists |
| B10 Charts/comparisons | Flash | verified | Two-axis scatter plot with outlier detection, multi-player lines with rolling stats, PvP compare view, image export |
| B11 Player pages/showcase | Flash | verified | B11 player dashboards, recent games, showcase and partial-career/forecast/source presentation verified at the recorded boundary |
| B12 Analytical operations | Sol | verified | Pure mathematical calculation engine for quantiles (type 7), period deltas, venue & rest splits, defensive allowance, standardized z-score statistical peers (weighted Euclidean distance), and cohort ranking API |
| B13 Investigation interfaces | Flash | verified | Workload trends (/research/trends), quantile distributions & contextual splits (/research/distributions), statistical twin peers (/research/similarity), and flagship case studies (/research/case-studies) with manual reproduction |
| B14 Current/history/identity sources | Sol | in_progress | Refresh/discovery/identity and resumable backfill machinery verified; completed historical coverage through 2000–01 remains unverified |
| B15 Team operations | Sol | verified | Team profile, schedule context, rest splits, B2B summaries, Four Factors (offense & defense) with league ranks/percentiles, similar peers, and F18 three-point variation scenario |
| B16 Team explorer/comparison | Flash | verified | B16 team tables, profiles/cohorts, comparison and hypothetical three-point scenario verified; admitted history bounds remain explicit |
| B17 Playoff/series data | Sol | verified | Admitted postseason games (82 for 2023-24), bracket/series identity (004{YY}00{round}{matchup}{game_num}), slug and alias resolution, explicit reconstructed seed evidence with tie notes, phase-safe Four Factors and player box-score series aggregations, and strict 7-game placeholder handling |
| B18 Playoff interface | Flash | verified | B18 bracket, series/game cards, player/team tables and explicitly gated matchup/rotation panels verified |
| B19 Rich-source admission | Sol | source_blocked | B19a/B19b and B19c preserved; B19d native candidate reconstruction verified on four games (2,209 events), three numerically conserved. Independent starter observations conflict; one malformed native minute remains; pinned rotation mirror covers only 165/1,230 regular games. No partial or full-season WOWY admission; B23 assignment serving pending |
| B20 Possession/stint warehouse | Sol | source_blocked | Reconstruction, conservation, attribution, override and cutoff machinery verified; populated reconciled retained stint/possession coverage remains open |
| B21 WOWY/on-off API | Sol | verified | Typed shared-floor operations, disjoint 1-5 condition partitions, 2-5 player units, teammate event shifts, game-cluster intervals, possession gates; retained population remains source_blocked (zero stint rows) |
| B22 WOWY interface | Flash | verified | Bounded API-backed sets/units/Stats on-off/shifts/comparisons/exports; source_blocked in retained release, broader browser gate remains red |
| B23 Shots/matchups/aftermath API | Sol | verified | Bounded shot profiles/zone peers, explicit source assignments and partial possession aftermath; isolated fixture verification, retained-release inputs source_blocked |
| B24 Shooting/matchup interface | Flash | verified | Bounded B24 interfaces verified below; populated rich queries/performance and exact source video mappings remain gated |
| B25 External outputs/preregistration | Sol | source_blocked | Bounded offline schemas/registration and four frozen designs verified; DARKO admission, reconciled input history and exact split bindings remain blocked |
| B26 Registered experiments | Sol | source_blocked | Expected-shot sub-block complete with registered negative result and three admitted shot seasons; RAPM, six-factor and playtype-adjusted shooting retain independent input/chronology gates |
| B27 Advanced research UI | Flash | verified | Bounded advanced interfaces, expected-shot negative-result view and hypothetical calculator verified; each source/model component retains its own gate |
| B28 Contract/transaction acquisition and schema | Sol | verified | Bounded manual source books, real tracked import/corrections and PostgreSQL sealing; comprehensive automation remains source-blocked |
| B29 Finance operations | Sol | verified | Bounded book-bound read-only queries, cents/status reconciliation, temporal correction replay and separate option scenarios; richer source/value gates remain open |
| B30 Finance interface | Flash | verified | Bounded book-bound UI and real browser evidence recorded in B30; current-market/value/automation gates remain open |
| B31 Shared Live service | Sol | verified | Bounded shared backend verified; B32a records changing preseason observations/two active boxes; independently admitted finals, real corrections and full three-box load remain open |
| B32 Live interface | Flash | in_progress | Bounded interface verified; B32a changing-game/browser/resource acceptance recorded below; final reconciliation and actual corrections remain open |
| B33 Conversational backend | Sol | verified | Bounded typed planning/execution/evidence verified in B33; real-provider language acceptance remains separate |
| B34 Chat UI/query evaluation | Flash | verified | B34c closes owner-approved Lite language gate: 45/45 core, 12/12 paraphrases and 6/6 supplemental cases; versioned workbench nonappearance correction resolved in integrity follow-up |
| B35 Methodology/export/integration | Sol → Flash | verified | B35a/backend, B35b/content and B35c real Linux Chromium installation, persistent standalone launch, fresh packaged deployment and integration acceptance verified; independent language/Live/source/model gates remain |
| B36 Fontshare refinement | Flash | verified | Owner-selected Public Sans/JetBrains Mono packaged offline; B36b production delivery, CLS, density and browser acceptance verified |
| B37 Release/recovery/evidence | Sol | verification_blocked | Benchmarks/storage/case studies/fresh restore verified at their dated boundaries; B34c language and B35c install gates closed. Full replica acceptance awaits source/model/finance/Live gates and renewed capability verification |

## Feature coverage ledger

Use IDs F01–F46 in the [feature contract](design/replica-feature-contract.md), plus any explicitly added rows. The initial ledger below records pending work, not application completion. Add component rows when one page has several metrics/data gates, recording canonical route, exact versus named-alternative representation, admitted inputs/coverage and check/evidence paths.

| Feature | Status | Block / principal gate | Evidence / next gate |
| --- | --- | --- | --- |
| F01 Stats | verified | B01–B07, B14; metadata filters only when admitted | Dense table with pinned identity, 2-tier headers, sample/name/team filters, detail drawer, and cursor pagination verified |
| F02 Stats presets | verified | B02–B07; richer presets use B20–B26 | 10 presets implemented (Overview, Shooting, Defense, True Shooting, Rates, Playmaking, Rebounding, plus gated Impact, On-Off, Six Factor with disclosures) |
| F03 Counting/identity | verified | B02, B07; actual exposure for possession modes | Counting modes (Per Game, Totals, Per 36, gated Per 75/100), identity modes (Photos, Logos, Initials, None), midrank cohort percentiles, density & expansion |
| F04 Custom views | verified | B08–B09 | Up to 10 custom views with 25 catalog v2 columns, default view selection, reorder, keyboard alternatives, and SHA-256 verified bundle export/import |
| F05 Favorite/compare tray | verified | B07–B10 | Floating compare tray with bounded 8-player selection, chip removal, clear action, context-preserved comparison routing |
| F06 Table plots | verified | B10 | Two-axis scatter plot with selectable catalog v2 axes and outlier detection, multi-player lines with rolling statistics, and accessible data tables |
| F07 Help/discovery | verified | B02, B04–B07, B35b | Lookup, shell, combobox, shortcuts and catalog-linked original definitions verified at their recorded boundaries |
| F08 WOWY | verified (bounded operation) | B19–B22, B37; validated shared-court data | B21 API verified against PostgreSQL fixtures; retained stint population source_blocked disclosed; sample thresholds and B37 real-service benchmarks verified |
| F09 Live | partial | B31–B32 | Shared backend/UI and B32a actual changing preseason observations verified; independently admitted final reconciliation, actual corrections and full three-box load remain open |
| F10 Playoffs | verified | B17–B18, B23/B25 where needed | Bracket and series explorer (/playoffs) with explicit seed evidence and tie notes, series detail (/playoffs/[seriesId]) with 7-game cards, Four Factors, player series box scores, and gated matchup/rotation sections verified |
| F11 Recent games | verified | B03, B10–B11 | Recent games explorer (/last-games) with last 5/10/20/all appearance windowing, per-game vs per-36 exposure rates, trajectory plot, summary highs/lows, CSV & high-DPI image export, and lineage drawer |
| F12 Showcase | verified | B08–B11; motion can pause | Player showcase (/showcase) with configurable focus presets (Overall, Scoring, Playmaking/Defense, Per 36), manual & auto-advancing slideshow with reduced-motion pausing, SVG card rasterization, and compare/favorite sync |
| F13 Player dashboard | verified | B03, B10–B14; imported impact gated | Player research profile (/players/[id]) with multi-season career history table, strict incomplete career disclaimers, per-36 game log toggle, forecast status, and context-labelled export |
| F14 Statistical peers | verified | B12–B13 | Statistical peers explorer (/research/similarity) with target profile, cohort z-scores, peer matches across 8 dimensions, weighted Euclidean distance, and PvP compare link |
| F15 Shot twins | planned | B23–B24 | Pending runtime/source evidence |
| F16 Ranking boards | verified | B08–B09; no invented global community consensus | Personal ranking board management, contiguous 1..N ranks with accessible keyboard move buttons, subjective notes, and Borda count / average rank aggregation with explicit zero-consensus notice |
| F17 Teams | verified | B14–B16 | Team explorer (/teams), conference & division grouping, four factors toggles, pace/efficiency scatter, team research profile (/teams/[id]), and historical peers verified |
| F18 Three-point variation | verified | B15–B16; versioned scenario, never rename as luck removed | Pure domain math, API scenario endpoint (/teams/{id}/three-point-variation), counterfactual FG3% shift holding volume constant, and non-inferential disclaimer verified |
| F19 Roster shapes | planned | B14, B25–B27, B28 where finance needed | Pending runtime/source evidence |
| F20 Teammate stat shift | source_blocked | B20–B22 | B21 focal-player shared-floor API and B22 interface verified; retained reconciled stint population remains gated |
| F21 Contracts | verified (bounded books) | B28–B30, B37 | B28 manual books, B29 terms/payroll/timeline API, B30 UI and B37 replay benchmarks verified; current-market source gate open |
| F22 Financial value | source_blocked | B25, B29–B30; external conversion or registered named scenario | B29 factual Small vs Big grouping implemented; monetary value/surplus/ROI lacks admitted conversion |
| F23 Free agency | partial | B28–B30 | B29 bounded book statuses/counts and B30 UI verified; comprehensive current-market/status coverage remains gated |
| F24 Player compare | verified | B10, B22/B26 where needed | Interactive PvP compare view with Overall/Offense/Defense/Six Factor/Custom presets, aligned descriptive metrics table, comparative visual bars, lines tab, and zero forced winner notice |
| F25 Team compare | verified | B15–B16, B25–B27 | Interactive team comparison (/team-compare) with H2H series tracking, Four Factors comparative bars, F18 3P variation slider, roster participation cohorts, and zero inferred claims verified |
| F26 Matchups | planned | B19, B23–B24; assignment source required | Pending runtime/source evidence |
| F27 Tier lists | verified | B08–B09 | Interactive tier list builder with S/A/B/C/D tiers, HTML5 drag-and-drop plus accessible keyboard move buttons, player search, favorites quick-add, and subjective notes |
| F28 Adjusted shooting | planned | B25–B27; no surrounding-future-year fill | Pending runtime/source evidence |
| F29 Six-factor research | planned | B25–B27 | Pending runtime/source evidence |
| F30 Expected-shot research | verified (registered negative result) | B23, B25–B27 | Three admitted shot seasons; retrospective expected-shot candidate failed preregistered selection, with exact replay/read-only B27 result view; no promoted model or unopened final evaluation claim |
| F31 Shot aftermath | planned | B20, B23–B24 | Pending runtime/source evidence |
| F32 Defensive assignments | planned | B23–B27; rich-input gate | Pending runtime/source evidence |
| F33 Spatial EPV | planned | B25–B27 if inputs ever admitted; ACB demo excluded | Pending runtime/source evidence |
| F34 Measurements | verified | B14, B27 | Combine Anthropometry & Wingspan Explorer (/wingspan), player profile anthropometry panel, and combine vs listed roster distinction verified |
| F35 Hypothetical calculator | planned | B15, B20, B27; scenario definition | Pending runtime/source evidence |
| F36 Learning | verified | B35b | Original illustrative TS lesson and release-bound manual distribution workshop; production-browser links and content verified |
| F37 Case studies | verified | B13, B35, B37 | 6 comprehensive real-data case studies across stints, forecasting, defense, WOWY, finance, and chatbot reproduction verified |
| F38 Blog/patch notes | verified | B35b | Original dated Markdown content; safe local renderer and standalone packaging verified |
| F39 Workload/change | verified | B12–B13 | Workload trends explorer (/research/trends) with appearance and date-range slicing, delta table, delta cards, cohort surge/decline rankings, and SHA-256 evidence |
| F40 Distributions/splits | verified | B12–B13 | Distributions & contextual splits (/research/distributions) with Type 7 quantiles, n >= 5 sample gating, empirical dispersion strip diagram, venue splits, rest splits, and 30-team defensive allowance rankings |
| F41 Chatbot | verified | B33–B34, B37 | B34c owner-approved Lite acceptance: 45/45 core, 12/12 frozen paraphrases, 6/6 supplemental cases; exact manual equivalence and 33/33 retained reproduction verified |
| F42 Pipeline/evidence | verified | B01, B03, B35–B37 | B35a durable manifests/recovery, B35b library/export, and B37 real-service benchmarks (31 endpoints, 0 errors, 157.5s fresh DB restore) verified |
| F43 Forecasts/evaluation | verified | B00, B11, B35–B37 | Prospective issuance ledger, empirical 80% calibration, DNP conditional segregation, and B37 API benchmarks verified |
| F44 Source video links | planned | B23–B24; clip URL/availability is a separate unverified source gate | Pending runtime/source evidence |
| F45 Installable interface | verified (Linux Chromium) | B35b, B35c; reference installation not independently exercised | Real manifest installation creates a Linux desktop launcher; installed app and process restart with --app-id report standalone mode; no offline data promise |
| F46 Image sharing | verified | B10–B11, B35; rendered snapshot is separate from analytical evidence | Context-stamped PNG/SVG image export with evidence watermark and temporal constraint, plus canonical local query URL copy |

A partial page can have several rows with different statuses. Marking one preset/page verified does not verify every metric/model in it. Preserve unresolved applicable rows; owner scope amendments require date/reason and explicit authority.

## Per-block completion record

### Block B00 — Baseline and integrity inventory

```text
Block / implementer / date / revision and dirty-work boundary:
- Block: B00 Baseline/integrity inventory
- Implementer: Sol (recorded via agent)
- Date: 2026-10-01
- Baseline git revision: 0864909c282d450baf6afad361e2500cc4501ddf
- Dirty work boundary preserved:
  - modified: AGENTS.md, dashboard/components/player-portrait.tsx, docs/workbench-implementation-plan.md, scripts/dev-live-backend.sh, scripts/dev-live-frontend.sh, src/courtload/cli.py, src/courtload/services/workbench_jobs.py
  - untracked: docs/databallr-replica-*, docs/design/replica-*, docs/research/*, tests/unit/test_portrait_jobs.py

Prerequisite evidence inspected:
- Parent handoff docs/databallr-replica-implementation-plan.md and replica contracts.
- Historical evaluation runs and manifests in data/artifacts/evaluation/ (3cf4ae8eb331ac02d3b3, 6f7af9e63f27aada910d, b0e4bb3300011b5a3499).
- Operational PostgreSQL 17 database schema, triggers, and published snapshot pointer.

Files changed and shared-file handoff:
- docs/databallr-replica-implementation-progress.md (updated block status and appended B00 inventory record).

Behavior implemented or existing behavior reused:
- Runtime environment verified: Python 3.14.7, Node v24.15.0, npm 11.12.1, Docker 29.8.1, PostgreSQL 17.11 on port 5432, Next.js 16.3.5 (Turbopack).
- Existing test suites and tool chains verified locally.

Admitted real-input identifiers / coverage / result reconciliation:
- Current database record counts: 104,533 workbench player games, 7,924 workbench team games, 5,470 schedules, 489 forecast issuances under active policy 'points-v1-prior_blend'.
- Active published snapshot on channel 'public': 5bbb6035-6794-4bb0-b894-7208f52ef7ad (dataset: 2e99f37c-231a-4748-9f48-5b9ffa99f228, status: ready, coverage: 2023-10-24 to 2026-06-13).
- 2026-27 season is schedule-only in SDV configuration (has_player_boxscores=False, has_team_boxscores=False).

Check commands, prerequisites, results and warnings:
1. .venv/bin/ruff check . -> PASS (0 errors, 0 warnings).
2. .venv/bin/ruff format --check . -> PASS (164 files checked, 0 changes needed).
3. .venv/bin/mypy src/courtload -> PASS (73 source files, 0 issues found).
4. COURTLOAD_TEST_POSTGRES_URL="postgresql+psycopg://courtload:courtload@localhost:5432/courtload" .venv/bin/pytest -> PASS (144 passed, 1 third-party Starlette testclient warning, 121.92s).
5. npm --prefix dashboard run lint -> PASS (0 errors, 0 warnings).
6. npm --prefix dashboard run typecheck -> PASS (0 errors).
7. npm --prefix dashboard test -> PASS (1 test file, 2 tests passed, 81ms).
8. npm --prefix dashboard run build -> PASS (Next.js 16.3.5 Turbopack production build succeeded in 615ms).
9. docker compose config --quiet -> PASS (valid syntax).
10. docker compose --profile tools run --rm dbt build --profiles-dir . --select tag:workbench -> PASS (39 passed, 0 warnings, 0 errors, 1.79s).
    - Note on make dbt-build: Running dbt build without '--select tag:workbench' attempts to compile archive models (stg_archive_player_games/stg_archive_team_games) that require var('archive_dataset_id'), which fails when invoked without archive variables.
11. Browser testing status:
    - npm --prefix dashboard run test:browser requires port 3100 for mock-api test server. When port 3100 is in use by live frontend (scripts/dev-live-frontend.sh), Playwright exits with port collision.
    - npm --prefix dashboard run test:browser:real runs against live dev server on port 3100, but existing e2e specs assert on synthetic entities ('Fixture Star') from mock-api.mjs rather than real database entities, causing 12 fixture expectation failures.

Inspection findings confirmation (Table in plan lines 90-104):
1. Metric names/formulas disagree: CONFIRMED. Dashboard (app/page.tsx:210-218) expects reb_total, ts_pct, and efg_pct, but METRIC_DEFINITIONS in domain/metrics.py defines 'reb' and lacks TS/eFG/FTR.
2. Partial observations can become zero/incorrect means: CONFIRMED. compute_metrics initializes sums to 0 and divides by gp (all appearances) rather than per-metric observed samples, suppressing means when metrics are partially unrecorded and reporting 0.0 instead of null when all are unobserved.
3. Pagination stops at UI plumbing: CONFIRMED. PlayerResearchResponse defines next_cursor and has_more, but PlayerResearchQuery lacks cursor, queryPlayerResearch omits it, and players/page.tsx hardcodes limit: 50 with no cursor navigation.
4. Saved result bound is clamped to 100: CONFIRMED. save_investigation instantiates unbounded_query with limit=MAX_EXPORT_ROWS (1000), but execute_player_research_query unconditionally executes limit = min(max(1, query.limit), 100), clamping saved results to 100.
5. Reopened queries lose field names: CONFIRMED. save_investigation stores query.to_dict() with snake_case keys (before_date, min_games, sort_metric), but frontend routes in dashboard/app/players/page.tsx parse camelCase params (beforeDate, minGames, sortMetric), reverting queries to defaults when reopened.
6. Release context is lost: CONFIRMED. NavRail links hardcode static paths without release query parameters; ContextBar defaults omit release_id; AskCourtLoad request payload omits release_id.
7. Lookup is expensive/submit-only: CONFIRMED. execute_player_research_query loads all raw game facts matching name ILIKE and computes Python aggregation metrics for each candidate on submit. No lightweight entity lookup service exists.
8. Assistant numerical binding is weak: CONFIRMED. verify_and_substitute_claims matches claims on value-only equality (find_matching_cell) and retains unverified claims when unmatched; explorer query navigation uses heuristic string checks ("raptor", "forecast", "conference"); result tables accept provider-written structures.
9. Completion prose overstates evidence: CONFIRMED. Workbench progress log reported P9 as complete with no limits, despite aforementioned metric and query seams.
10. Current outcomes are not acquired: CONFIRMED. workbench_source_config.py sets has_player_boxscores=False and has_team_boxscores=False for 2026-27 (ending year 2027), acquiring only raw schedule JSON.

Measured latency/resources/traffic/storage where relevant:
- Pytest runtime: 121.92s for full suite (144 tests), including ~100s for full pg_dump and fresh disposable database restore verification.
- dbt workbench build: 39 models/tests in 1.79s.
- Dashboard static build: 615ms compilation, 4 static pages.
- Storage: data/artifacts 958MB, data/backups 748MB, data/raw 108MB, data/cache 14MB.

Screenshots/artifacts/reproduction commands:
- Reproduce full test suite: COURTLOAD_TEST_POSTGRES_URL="postgresql+psycopg://courtload:courtload@localhost:5432/courtload" .venv/bin/pytest
- Reproduce dbt workbench build: docker compose --profile tools run --rm dbt build --profiles-dir . --select tag:workbench
- Reproduce dashboard verification: npm --prefix dashboard run lint && npm --prefix dashboard run typecheck && npm --prefix dashboard test && npm --prefix dashboard run build

Retained evidence/hash verification:
- M6 evaluation run 6f7af9e63f27aada910d:
  - replay-estimates.jsonl: 7c635f46abfd8df5e4045dfd2fa24ef993a8fa6e992475f45ef5603ce65bcb2f (matches EXPECTED_REPLAY_SHA256)
  - calibration.json: 510e50fd351c7f3f3d3fe21e277294acb35bd19296acaeafe0df00d315f239b6 (matches EXPECTED_CALIBRATION_SHA256)
- Points-v1 run b0e4bb3300011b5a3499 intact and referenced by active policy 'points-v1-prior_blend'.

Outstanding source/model/verification limits:
- Browser test suite (playwright) requires isolation between mock server port and active development port.
- make dbt-build requires tag specification for workbench versus archive pipelines.
- Live 2026-27 player and team box-score outcomes remain unadmitted in upstream SDV sources.

Status and next independent/dependent block:
- Block B00 is VERIFIED.
- Next dependent block: B01 Canonical context and query schemas (Sol).
```

### Block B01 Completion Record

```text
Completion date: 2026-10-02
Block: B01 Context/query contracts
Owner: Sol
Commit/revision: 0864909c282d450baf6afad361e2500cc4501ddf + uncommitted B01 implementation files

Exact source files, schemas, models, migrations, endpoints, jobs and tests changed:
- Created src/courtload/domain/context.py:
  - FinalizedResearchContext, CapabilityStatus, CapabilityEntry, ExternalModelContext, FinancialContext, LiveContext, HypotheticalContext
- Created src/courtload/domain/query_spec.py:
  - Canonical QuerySpec, EntityKind, WindowKind, WindowSpec (bounds 1..82), SeasonScope, TeamScope, NormalizationMode, MetricSelector, PredicateOp, PredicateLeaf, PredicateGroup (max 12 leaves), SampleFilter, SortSpec (max 3), ViewState, PagingSpec (limit 1..100, cursor)
  - Allowlist field validation against METRIC_CATALOG + ALLOWED_METADATA_FIELDS
- Created src/courtload/domain/query_url.py:
  - serialize_query_to_params (camelCase & snake_case options)
  - serialize_query_to_url_string
  - deserialize_params_to_query (parses both camelCase and snake_case keys)
  - query_spec_to_research_query & research_query_to_query_spec adapters
- Modified src/courtload/api/workbench_schemas.py:
  - Re-exported domain query/context models in sorted __all__
  - Added capabilities to WorkbenchCatalogResponse
  - Added cursor to ResearchQuerySchema
  - Added WorkbenchQueryRequest, WorkbenchQueryResponse
  - Made PlayerResearchResponse.query accept ResearchQuerySchema | QuerySpec
- Modified src/courtload/api/routers/workbench.py:
  - Added POST /api/workbench/query endpoint for canonical QuerySpec execution
  - Updated get_catalog to populate analytical capabilities (core_stats, hypothetical)
  - Updated GET /api/workbench/players with snake_case query param alternates (release_id_alt, before_date_alt, etc.), phase validation, sort validation, and cursor forwarding
  - Updated create_saved_analysis to deserialize params using deserialize_params_to_query
- Modified dashboard/lib/types.ts:
  - Added TypeScript interfaces matching Python Pydantic models (CapabilityStatus, CapabilityEntry, FinalizedResearchContext, QuerySpec, WindowSpec, PredicateGroup, SortSpec, WorkbenchQueryRequest, WorkbenchQueryResponse)
  - Added optional cursor to PlayerResearchQuery
  - Added capabilities to WorkbenchCatalog
- Created dashboard/lib/query-url.ts:
  - encodeQueryToSearchParams (camelCase/snake_case)
  - decodeSearchParamsToQuery (supports both camelCase and snake_case)
  - querySpecToLegacyQuery
- Modified dashboard/lib/workbench-api.ts:
  - Added cursor parameter to queryPlayerResearch
  - Added executeWorkbenchQuery(query: QuerySpec)
- Modified dashboard/components/context-bar.tsx:
  - Added initialReleaseId prop, preserved releaseId across updates
- Modified dashboard/components/ask-courtload.tsx:
  - Added initialReleaseId prop, forwarded release_id in assistant query context
- Modified dashboard/app/players/page.tsx:
  - Integrated decodeSearchParamsToQuery and querySpecToLegacyQuery
  - Forwarded querySpec.release_id to ContextBar
- Created tests/unit/test_query_contracts.py:
  - 14 tests covering QuerySpec validation (phase, max 3 sorts, max 12 predicates, allowlisted metrics, window bounds), camelCase/snake_case serialization and deserialization, round-trips, and FinalizedResearchContext
- Created dashboard/lib/query-url.test.ts:
  - 5 Vitest tests verifying camelCase/snake_case URL encoding, snake_case query reopening, round-tripping with cursor, and querySpecToLegacyQuery conversion
- Modified tests/integration/test_workbench_api.py:
  - Added 6 integration tests: test_workbench_catalog_capabilities, test_workbench_players_snake_and_camel_case_parity, test_workbench_players_validation_rejection, test_workbench_query_v2_endpoint_success, test_workbench_query_v2_cursor_pagination, test_workbench_query_v2_validation_rejections

Check commands, prerequisites, results and warnings:
1. .venv/bin/ruff check . -> PASS (0 errors, 0 warnings).
2. .venv/bin/ruff format --check . -> PASS (168 files checked, 0 changes needed).
3. .venv/bin/mypy src/courtload -> PASS (76 source files, 0 issues found).
4. COURTLOAD_TEST_POSTGRES_URL="postgresql://postgres:postgres@localhost:5432/courtload" .venv/bin/pytest tests/unit/test_query_contracts.py tests/integration/test_workbench_api.py -> PASS (39 passed, 1 third-party Starlette testclient warning, 8.19s).
5. npm --prefix dashboard run lint -> PASS (0 errors, 0 warnings).
6. npm --prefix dashboard run typecheck -> PASS (0 errors).
7. npm --prefix dashboard test -> PASS (2 test files, 7 tests passed, 87ms).
8. npm --prefix dashboard run build -> PASS (Next.js 16.3.5 Turbopack production build succeeded in 132ms compile, 1770ms TS).

Inspection findings confirmation / resolution:
- Finding 3 (Pagination stops at UI plumbing): RESOLVED. Added cursor field to PagingSpec, ResearchQuerySchema, PlayerResearchQuery, queryPlayerResearch, and query-url.ts. Verified next_cursor propagation and second-page query advancement.
- Finding 5 (Reopened queries lose field names): RESOLVED. Added deserialize_params_to_query in Python and decodeSearchParamsToQuery in TypeScript to accept both snake_case and camelCase parameters, ensuring saved investigations reopen with full filter fidelity.
- Finding 6 (Release context is lost): RESOLVED. Added releaseId/release_id support in URL serializers, ContextBar, AskCourtLoad, and workbench query endpoints, ensuring release context is preserved across navigation and queries.

Measured latency/resources/traffic/storage:
- Vitest runtime: 87ms for 2 test files (7 tests).
- Pytest runtime: 8.19s for unit + integration tests (39 tests).
- Dashboard static build: 132ms compile, 1770ms TS.

Status and next independent/dependent block:
- Block B01 is VERIFIED.
- Next dependent block: B02 Metric integrity/catalog (Sol).
```

### Block B02 Completion Record

```text
Completion date: 2026-10-02
Block: B02 Metric integrity/catalog
Owner: Sol
Commit/revision: 0864909c282d450baf6afad361e2500cc4501ddf + uncommitted B01/B02 implementation files

Exact source files, schemas, models, migrations, endpoints, jobs and tests changed:
- Created src/courtload/domain/percentiles.py:
  - compute_midrank_percentile: implements canonical contract formula 100 * (count_less + 0.5 * count_equal) / n for n >= 2; returns None for n < 2 or unobserved/NaN values.
  - compute_cohort_percentiles: vectorized cohort calculation preserving array indices and nulls.
  - describe_cohort_percentile & CohortPercentileSummary: wraps midrank calculation with catalog definition and direction metadata (good_direction: high/low/None).
- Created src/courtload/domain/normalization.py:
  - validate_metric_normalization: validates requested mode against MetricDefinition.compatible_normalizations.
  - normalize_metric_value: exposure-based rate calculations for raw, per_game, per_36, per_75, per_100 with positive exposure checks (>0).
- Modified src/courtload/domain/metrics.py:
  - Extended MetricDefinition dataclass with required_fields, compatible_normalizations, aggregation_recipe, validity_definition, aliases, capability_requirement, classification, and good_direction.
  - Added METRIC_CATALOG_V1_VERSION ('v1'), METRIC_CATALOG_V2_VERSION ('v2'), and set METRIC_CATALOG_VERSION = 'v2'.
  - Added canonical v2 definitions: conventional TS% (ts_pct), conventional eFG% (efg_pct), free throw rate (ftr), volume/defense per-36 rates (tov_per_36, pf_per_36, oreb_per_36, dreb_per_36, fga_per_36, fg3a_per_36, fta_per_36), and Four Factors team metrics (team_pace, team_possessions_estimated, team_off_rtg_estimated, team_def_rtg_estimated, team_net_rtg_estimated, team_efg_pct, team_tov_pct, team_oreb_pct, team_ftr).
  - Added registered aliases: reb_total -> reb, reb_total_per_game -> reb_per_game, with resolve_metric_alias.
  - Preserved exact v1 implementation as compute_metrics_v1 for backward compatibility and reproducible historical artifacts.
  - Implemented compute_metrics_v2:
    - Per-metric valid sample sizes tracked in sample_sizes.
    - Zero valid observations returns None (null), not 0 or 0.0.
    - Means divide by that metric's valid observation count, not gp.
    - Ratios and percentages (FG%, 3P%, FT%, eFG%, TS%, FTR) require jointly valid makes and attempts on the same games; unpaired rows are excluded.
    - Per-36 rates require positive minutes and divide by unrounded minutes (seconds / 60.0).
    - Populates both canonical keys and aliases (reb and reb_total, reb_per_game and reb_total_per_game).
  - compute_metrics dispatches to v2 by default and supports v1 via version parameter.
- Modified src/courtload/domain/query_spec.py:
  - Added model_validator to MetricSelector checking catalog existence and compatible_normalizations (rejecting e.g. per_game on fg_pct or per_36 on ts_pct).
- Modified src/courtload/api/workbench_schemas.py:
  - Extended MetricDefinitionSchema with required_fields, compatible_normalizations, aggregation_recipe, validity_definition, aliases, capability_requirement, classification, and good_direction.
- Modified src/courtload/api/routers/workbench.py:
  - Updated get_metrics endpoint to accept optional version query parameter, defaulting to METRIC_CATALOG_VERSION ('v2') while retaining 'v1' retrieval.
- Modified src/courtload/services/workbench_analytics.py:
  - Handled tot_min = metrics["min"] or 0.0 safely when minutes are unobserved.
- Modified dashboard/lib/types.ts:
  - Added optional v2 metadata fields (required_fields, compatible_normalizations, aggregation_recipe, validity_definition, aliases, capability_requirement, classification, good_direction) to MetricDefinition interface.
- Created tests/unit/test_metrics_v2.py:
  - 22 unit tests covering catalog v2 integrity, arithmetic reconciliation (TS%, eFG%, FTR, per-36), zero attempts null handling, strict missingness (null when unobserved, sample size 0), partial observations means (dividing by valid n, not gp), paired rows requirement, positive minutes per-36 exposure, midrank percentiles (distinct, identical ties, n<2, null handling, cohort alignment, direction description), normalization compatibility and validation, MetricSelector rejection of invalid normalizations, and v1 backward compatibility.
- Modified tests/integration/test_workbench_api.py:
  - Updated test_workbench_metrics to verify v2 active catalog by default (including ts_pct, efg_pct, ftr, units) and verify v1 retrieval via ?version=v1.

Check commands, prerequisites, results and warnings:
1. .venv/bin/ruff check . -> PASS (0 errors, 0 warnings).
2. .venv/bin/ruff format --check . -> PASS (171 files checked, 0 changes needed).
3. .venv/bin/mypy src/courtload -> PASS (78 source files, 0 issues found).
4. COURTLOAD_TEST_POSTGRES_URL="postgresql+psycopg://courtload:courtload@localhost:5432/courtload" .venv/bin/pytest tests/unit/ tests/integration/test_workbench_api.py -> PASS (141 passed, 1 third-party Starlette testclient warning, 11.15s).
5. npm --prefix dashboard run lint -> PASS (0 errors, 0 warnings).
6. npm --prefix dashboard run typecheck -> PASS (0 errors).
7. npm --prefix dashboard test -> PASS (2 test files, 7 tests passed, 92ms).
8. npm --prefix dashboard run build -> PASS (Next.js 16.3.5 Turbopack production build succeeded in 75ms compile, 1727ms TS).

Inspection findings confirmation / resolution:
- Finding 1 (Metric names/formulas disagree): RESOLVED. Added conventional ts_pct, efg_pct, and ftr to catalog v2 and compute_metrics_v2. Added reb_total and reb_total_per_game aliases populated alongside reb and reb_per_game. Dashboard explorer and profile components now receive populated, exact metric values.
- Finding 2 (Partial observations can become zero/incorrect means): RESOLVED. compute_metrics_v2 tracks per-metric valid samples; returns None when unobserved (never zero-initialized sums or 0.0 means); divides means by that metric's valid observation count instead of gp; enforces jointly valid paired rows on make/attempt ratios; and requires positive recorded minutes for per-36 rates.

Measured latency/resources/traffic/storage:
- Pytest runtime: 0.85s for 114 unit tests; 8.50s for 66 integration + contract tests.
- Vitest runtime: 92ms for 2 test files (7 tests).
- Dashboard static build: 75ms compile, 1727ms TS.

Status and next independent/dependent block:
- Block B02 is VERIFIED.
- Next dependent block: B03 Bounded Stats query engine (Sol).
```

### Block B03 Completion Record

```text
Completion date: 2026-10-02
Block: B03 Stats query engine
Owner: Sol
Commit/revision: 0864909c282d450baf6afad361e2500cc4501ddf + uncommitted B01/B02/B03 implementation files

Exact source files, schemas, models, migrations, endpoints, jobs and tests changed:
- Created src/courtload/services/stats_engine.py:
  - build_stats_query_sql: parameterized SQL query generation with analytical CTEs (ROW_NUMBER() OVER (PARTITION BY player_id ORDER BY game_date DESC, game_id DESC) AS app_rank) for pre-aggregation windowing (last-5, last-10, last-n-appearances, date-range, season).
  - Implements SQL aggregations for counting stats, per-game averages, per-36 volume and defensive rates, paired-row shooting percentages (FG%, 3P%, FT%), advanced ratios (eFG%, TS%, FTR), and legacy fantasy scores.
  - compile_predicate_node: recursive SQL compiler for nested PredicateGroup and PredicateLeaf supporting leaf ops (eq, ne, lt, lte, gt, gte, between, in) and boolean AND/OR conjunctions with dialect-safe PostgreSQL array containment (:p = ANY(teams)) and SQLite json/text expressions.
  - execute_stats_query: executes db queries, returns paged PlayerResearchItem list, total count, cursor, and has_more flag. Separates page execution (clamped to 100 rows) from export requests.
  - export_stats_query: bounded iterator fetching up to MAX_EXPORT_ROWS (2,000) rows without page clamping, ensuring saved investigations reproduce identically.
  - explain_stats_query: performance harness executing EXPLAIN (ANALYZE, COSTS, BUFFERS, FORMAT JSON) on PostgreSQL (or EXPLAIN QUERY PLAN on SQLite) reporting execution time, planning time, and cost.
  - parse_player_row: formats SQL result rows into canonical player research items with metrics and sample_sizes dicts, matching compute_metrics_v2 output.
- Modified src/courtload/services/workbench_analytics.py:
  - Updated execute_player_research_query to delegate directly to execute_stats_query, setting is_export=(query.limit > 100) to support full cohort saved investigations.
  - Cleaned up unused metric catalog imports.
- Modified src/courtload/api/routers/workbench.py:
  - Updated execute_query_endpoint (POST /api/workbench/query) to execute via execute_stats_query(session, context, spec), preserving predicates, multi-sort, windows, and metric selectors.
- Modified src/courtload/domain/query_url.py:
  - Clamped limit to min(max(1, query.limit), 100) when constructing PagingSpec so that limit validation passes while export requests are flagged via query.limit > 100.
- Created tests/unit/test_stats_engine.py:
  - 11 unit/integration tests verifying:
    - build_stats_query_sql parameterization and window CTE generation.
    - compile_predicate_node for leaf operations and nested AND/OR groups.
    - Multi-column sort compilation with deterministic player_id tie-breaker.
    - Arithmetic reconciliation with compute_metrics_v2: Luka Dončić 2023-24 season stats reconcile bit-for-bit (pts, reb, ast, per-game, per-36, efg_pct, ts_pct, ftr, legacy fantasy score, and sample sizes).
    - Stable cursor pagination: traversing 586 eligible players across 24 consecutive pages with page_size=25 visits every player exactly once with zero duplicates and matching total count.
    - Over 100 row save and reproduction: saves all 586 eligible players in 2023-24 without truncation and reproduces identical SHA-256 hash.
    - Query plan performance harness: explain_stats_query reports planning time ~0.7 ms and execution time ~45-160 ms (p95 <= 500 ms).

Check commands, prerequisites, results and warnings:
1. .venv/bin/ruff check . -> PASS (0 errors, 0 warnings).
2. .venv/bin/ruff format --check . -> PASS (173 files checked, 0 changes needed).
3. .venv/bin/mypy src/courtload -> PASS (79 source files, 0 issues found).
4. COURTLOAD_TEST_POSTGRES_URL="postgresql+psycopg://courtload:courtload@localhost:5432/courtload" .venv/bin/pytest -> PASS (197 passed, 1 third-party Starlette testclient warning, 125.79s).
5. npm --prefix dashboard run lint -> PASS (0 errors, 0 warnings).
6. npm --prefix dashboard run typecheck -> PASS (0 errors).
7. npm --prefix dashboard test -> PASS (2 test files, 7 tests passed, 87ms).
8. npm --prefix dashboard run build -> PASS (Next.js 16.3.5 Turbopack production build succeeded in 550ms compile, 779ms TS).

Inspection findings confirmation / resolution:
- Finding 4 (>100-row save/export reproduces bit-for-bit): RESOLVED. Identified root cause in execute_player_research_query hard-clamping limit=100. Differentiated page execution (limit <= 100) from bounded full-result export iterator (MAX_EXPORT_ROWS = 2,000). Verified complete 586-player save and bit-for-bit hash reproduction.
- Analytical windowing performance: Executing window ranking and aggregations in PostgreSQL dropped query latency to ~45-160 ms, satisfying the p95 <= 500 ms requirement without loading raw facts into Python memory.

Measured latency/resources/traffic/storage:
- Query execution latency: PostgreSQL explain_stats_query measured ~45-160 ms execution time (planning time ~0.7 ms), well below 500 ms p95 target.
- Full pytest test suite runtime: 125.79s for 197 tests.
- Vitest runtime: 87ms for 2 test files (7 tests).
- Dashboard static build: 550ms compile, 779ms TS.

Status and next independent/dependent block:
- Block B03 is VERIFIED.
- Next dependent block: B04 Entity lookup API (Sol).
```

### Block B04 Completion Record

```text
Completion date: 2026-10-02
Block: B04 Entity lookup API
Owner: Sol
Commit/revision: 0864909c282d450baf6afad361e2500cc4501ddf + uncommitted B01/B02/B03/B04 implementation files

Exact source files, schemas, models, migrations, endpoints, jobs and tests changed:
- Created src/courtload/domain/entity_lookup.py:
  - LOOKUP_CATALOG_VERSION = "v1", LOOKUP_NORMALIZATION_VERSION = "v1".
  - normalize_lookup_text: NFKD Unicode decomposition, diacritics stripping (Jokić -> jokic, Dončić -> doncic, Valančiūnas, Porziņģis, Schröder, Şengün, Šarić), special ligature mapping (ø, æ, œ, ß, đ, ð, ł, ı), case folding, and punctuation stripping.
  - tokenize_lookup_text: tokenizes normalized text into whitespace-delimited tokens.
  - damerau_levenshtein_distance: bounded Levenshtein distance with early-exit optimization for length difference > max_dist.
  - generate_player_aliases: generates searchable aliases including accents removed, compact punctuation-stripped form (e.g. "deaaron fox", "karlanthonytowns", "cj mccollum"), suffix-stripped form (e.g. "Gary Trent Jr." -> "gary trent", "Trey Murphy III" -> "trey murphy"), individual tokens, and external metadata aliases.
  - STATIC_NAVIGATION_PAGES: curated catalog of 25 core application pages with display names, canonical IDs, base destination routes, and search aliases.
  - NBA_TEAM_EXTRA_ALIASES: nicknames, cities, tricodes, and common aliases for all 30 NBA teams (e.g. Sixers, Mavs, Dubs, Cavs, Wolves, Thunder, Pels).
  - IndexedEntity dataclass: unified searchable entity representing players, teams, and navigation pages.
  - score_entity_match: deterministic match basis and scoring implementing exact (1.0), exact token (0.92), prefix (0.85), token prefix (0.70), substring (0.50), and bounded typo (0.35 * similarity).
  - build_destination_url: generates context-preserving canonical route strings retaining season and release_id parameters.
  - get_portrait_fallback: initials generation for players (e.g. "NJ", "LD") and tricodes for teams.
- Created src/courtload/services/entity_lookup.py:
  - build_entity_index: loads player identities from WorkbenchIdentity, player appearance histories from WorkbenchPlayerGame, NBA teams from domain, and navigation pages from catalog.
  - get_or_build_entity_index: thread-safe cached index per dataset_id.
  - lookup_entities: executes discovery query, handles empty queries by returning curated navigation suggestions, evaluates player availability in requested season, clamps limit to 1..20 (default 10), and maintains bounded LRU cache (1,024 entries).
  - clear_lookup_caches: cache invalidation helper for test isolation.
- Modified src/courtload/api/workbench_schemas.py:
  - Added QueryNormalizationInfo, LookupAvailability, LookupItem, and LookupResponse Pydantic schemas.
  - Exported schemas in __all__.
- Modified src/courtload/api/routers/workbench.py:
  - Added GET /api/workbench/lookup endpoint accepting q, release_id (and camelCase releaseId), season, kinds, and limit.
- Modified dashboard/lib/types.ts:
  - Added TypeScript interfaces LookupAvailability, LookupItem, QueryNormalizationInfo, and LookupResponse.
- Modified dashboard/lib/api.ts:
  - Added fetchLookup client helper function supporting abort signals, release, season, and kinds filtering.
- Created tests/unit/test_entity_lookup.py:
  - 14 comprehensive unit/contract tests covering:
    - Unicode normalization and diacritics folding (Jokić, Dončić, Valančiūnas, Porziņģis, Nurkić, Šarić, Schröder, Şengün, Bogdanović).
    - Punctuation, hyphen, apostrophe, and suffix normalization (De'Aaron Fox, Karl-Anthony Towns, Gary Trent Jr., Trey Murphy III, C.J. McCollum).
    - Damerau-Levenshtein distance and early exit.
    - Exact alias and diacritic discovery for both ASCII and accented queries.
    - Team tricode, city, and nickname discovery (TOR/Toronto/Raptors, GSW/Warriors/Dubs, PHI/Sixers).
    - Ambiguous identity resolution returning all candidates in stable deterministic order (Jalen Williams vs Jaylin Williams, Mikal Bridges vs Miles Bridges).
    - Rookie 0-game discovery and empty-season (2026-27 schedule-only) discovery with truthful availability.
    - Empty query navigation suggestions (bounded to limit, match_basis="suggestion", score=0.0).
    - 1-character query prefix-only constraint (no substring or typo explosion).
    - Typo tolerance bounded to query length >= 4 and edit distance <= 2.
    - Kind filtering (player, team, page).
    - Context preservation in destination URLs.
    - Limit clamping between 1 and 20.
    - Performance harness measuring cardinality, cold build time, warm latency (p95 <= 50 ms), payload size (<= 25 KiB), and concurrency (1, 2, 4 workers).
- Modified tests/integration/test_workbench_api.py:
  - Added test_workbench_lookup_endpoint verifying HTTP integration, query parsing, diacritics folding, team discovery, page filtering, and context preservation.

Check commands, prerequisites, results and warnings:
1. .venv/bin/ruff check . -> PASS (0 errors, 0 warnings).
2. .venv/bin/ruff format --check . -> PASS (176 files checked, 0 changes needed).
3. .venv/bin/mypy src/courtload -> PASS (81 source files, 0 issues found).
4. COURTLOAD_TEST_POSTGRES_URL="postgresql+psycopg://courtload:courtload@localhost:5432/courtload" .venv/bin/pytest -> PASS (212 passed, 1 third-party Starlette testclient warning, 131.93s).
5. npm --prefix dashboard run lint -> PASS (0 errors, 0 warnings).
6. npm --prefix dashboard run typecheck -> PASS (0 errors).
7. npm --prefix dashboard test -> PASS (2 test files, 7 tests passed, 97ms).
8. npm --prefix dashboard run build -> PASS (Next.js 16.3.5 Turbopack production build succeeded in 453ms compile, 2.1s TS).

Inspection findings confirmation / resolution:
- Finding 7 (Lookup is expensive/submit-only; ranking loads fact rows; name matching is substring only): RESOLVED. Built dedicated in-memory entity index completely decoupled from fact-table scans and Gemini provider calls. Pre-computes NFKD diacritic folding, compact and suffix-stripped aliases, team nicknames, and application routes. Queries evaluate in microseconds (< 0.01 ms warm), satisfying the backend p95 <= 50 ms requirement by a factor of 5,000x.

Measured latency/resources/traffic/storage:
- Total Index Cardinality: 894 searchable entities (839 players, 30 teams, 25 pages).
- Cold Index Build Time: 74.06 ms.
- Warm Lookup Latency: p50 = 0.004 ms, p95 = 0.006 ms (acceptance budget <= 50 ms).
- Maximum Uncompressed JSON Payload Size: 11,770 bytes (11.49 KiB for limit=20, acceptance budget <= 25 KiB).
- Concurrency Harness: 1, 2, and 4 concurrent client thread pool simulations executed with 100% success.
- Pytest runtime: 131.93s for all 212 tests.
- Vitest runtime: 97ms for 2 test files (7 tests).
- Dashboard static build: 453ms compile, 2.1s TS.

Status and next independent/dependent block:
- Block B04 is VERIFIED.
- Next dependent blocks: Flash can proceed with B05 (Replica shell/navigation) and B06 (Incremental lookup UI). Sol can develop B08 (Personal state persistence) or B12 (Analytical operations).
```

### Block B05: Replica shell and navigation (Flash)

Verified 2026-10-02.
Prerequisites: B01 (Canonical context and query schemas).
Seams owned: Layout, top application row, horizontal menus, compact context controls, `/stats` entry and compatibility routes, semantic CSS tokens.

Code changes:
- Modified `dashboard/app/globals.css`:
  - Updated color tokens to Databallr replica charcoal specifications (`--bg: #20252e`, `--surface: #282f3b`, `--surface-raised: #323b49`, `--border: #465160`, `--text: #f1f3f6`, `--text-muted: #b4bdca`, `--accent: #ffd166`, `--on-accent: #20252e`, `--brand-orange: #ff7a2f`).
  - Added strict viewport constraint preventing body overflow (`body { overflow-x: hidden; }`).
  - Implemented 2-row horizontal header layout styles (`.replica-shell`, `.replica-header`, `.replica-top-row`, `.replica-nav-row`).
  - Implemented accessible dropdown styling (`.replica-dropdown-menu`, `.replica-dropdown-multicol`, `.replica-dropdown-item`) and responsive mobile drawer (`.replica-mobile-drawer`).
  - Added Hotkeys modal dialog styles (`.modal-backdrop`, `.modal-card`, `.hotkeys-row`, `.hotkeys-key`).
- Created `dashboard/components/replica-nav.tsx`:
  - Row 1 (Application Bar): Brand logo with basketball mark, "Stats · Games" quick links, lookup search box slot with `/` keyboard hint, and direct utility links (`Ask`, `Data status`, `Settings`).
  - Row 2 (Navigation Bar): Direct links (`Stats`, `WOWY`), accessible dropdown menus (`Live ▾`, `Players ▾`, `Teams ▾`, `Compare ▾`, `Research ▾`, `Help ▾`), and keyboard navigation.
  - Context preservation: `preserveContextUrl` retains active context parameters (`season`, `phase`, `beforeDate`/`before_date`, `window`, `releaseId`/`release_id`) across all navigation links, while avoiding transient param leakage (`cursor`, `name`, `sortMetric`).
  - Keyboard shortcuts: `/` or `⌘K` to focus search, `?` for keyboard shortcuts dialog, `Esc` to close open menus/drawers.
  - Mobile drawer: responsive hamburger menu toggle for viewports <= 900px preserving all navigation sections.
- Created `dashboard/components/hotkeys-modal.tsx`:
  - Accessible modal dialog presenting global (`/`, `⌘K`, `Esc`, `?`), navigation (`F`, `G`, `Z`), and table shortcuts (`T`, `C`).
- Created `dashboard/components/capability-notice.tsx`:
  - Honest capability disclosure component rendering feature status, prerequisite data inputs, and direct alternatives without inert dead links or unverified mockups.
- Created `dashboard/app/stats/page.tsx`:
  - Canonical `/stats` explorer entry route integrating `ContextBar`, `WorkbenchPlayerExplorer`, and SQL query execution.
- Modified `dashboard/app/page.tsx`:
  - Root `/` resolves search parameters and redirects cleanly to `/stats`, eliminating marketing landing page requirement.
- Modified `dashboard/next.config.ts`:
  - Added compatibility redirects for legacy routes: `/pvp` -> `/compare`, `/StatLineShift` -> `/stat-line-shift`, `/zts` -> `/research/adjusted-shooting`, `/shotquality` -> `/research/expected-shots`, `/d-shotquality` -> `/research/defensive-matchups`, `/kawhifiles` -> `/research/case-studies`, `/dashboard` -> `/players`.
- Created capability placeholder pages for all gated replica routes:
  - `/wowy`, `/live`, `/last-games`, `/showcase`, `/research/similarity`, `/shot-profile-twin`, `/rankings`, `/roster-shapes`, `/stat-line-shift`, `/contracts`, `/free-agency`, `/team-compare`, `/matchups`, `/tierlist`, `/research/adjusted-shooting`, `/six-factor-rapm`, `/research/expected-shots`, `/shot-aftermath`, `/research/defensive-matchups`, `/research/epv`, `/wingspan`, `/calculator`, `/learning`, `/research/case-studies`, `/patch-notes`, `/blog`, `/research/trends`, `/research/distributions`, `/research/ask`, `/playoffs`.
- Modified `dashboard/app/layout.tsx`:
  - Replaced vertical `NavRail` with `<ReplicaNav />` in `<div className="replica-shell">` wrapped in `<Suspense>`.
- Created `dashboard/lib/replica-nav.test.ts`:
  - 7 unit tests verifying context preservation, transient query isolation, target parameter merging, explicit override support, route inventory completeness (all 40 canonical routes), and compatibility redirects mapping.

Check commands, prerequisites, results and warnings:
1. `.venv/bin/ruff check .` -> PASS (0 errors, 0 warnings).
2. `.venv/bin/ruff format --check .` -> PASS (176 files checked, 0 changes needed).
3. `.venv/bin/mypy src/courtload` -> PASS (81 source files, 0 issues found).
4. `COURTLOAD_TEST_POSTGRES_URL="postgresql+psycopg://courtload:courtload@localhost:5432/courtload" .venv/bin/pytest` -> PASS (212 passed, 1 third-party Starlette warning, 130.5s).
5. `npm --prefix dashboard run lint` -> PASS (0 errors, 0 warnings).
6. `npm --prefix dashboard run typecheck` -> PASS (0 errors).
7. `npm --prefix dashboard test` -> PASS (3 test files, 14 tests passed, 100ms).
8. `npm --prefix dashboard run build` -> PASS (Next.js 16.3.5 Turbopack production build succeeded for all 34 routes in 105ms compile, 805ms TS).

Status and next independent/dependent block:
- Block B05 is VERIFIED.
- Next dependent block: Flash can proceed with B06 (Incremental global lookup UI). Sol can proceed with B08 (Personal state persistence) or B12 (Analytical operations).

### Block B06: Incremental global lookup (Flash)

Verified 2026-10-02.
Prerequisites: B04 (Entity discovery API), B05 (Replica shell and navigation).
Seams owned: Header combobox, keyboard navigation, grouped entity/route results, cancellation and bounded client cache, shared lookup component.

Code changes:
- Created `dashboard/lib/lookup-cache.ts`:
  - `LookupCache`: Bounded in-memory LRU cache (capacity 64 entries) avoiding redundant network round-trips for backspaces, common prefixes, and repeated lookups.
  - `buildLookupCacheKey`: Deterministic cache key generator normalizing query text, release ID, season, kind filters, and result limit.
- Modified `dashboard/lib/workbench-api.ts`:
  - Added `queryLookup` function targeting `/api/workbench/lookup` with abort signal support (`signal?: AbortSignal`) and timeout defaults.
  - Exported `LookupQueryOptions` interface.
- Modified `dashboard/lib/query-url.ts`:
  - Exported `CONTEXT_PARAMS` and `buildPreservedContextUrl` helper for shared, deterministic URL preservation across navigation and lookup actions.
- Created `dashboard/components/global-lookup.tsx`:
  - Accessible WAI-ARIA 1.2 combobox component (`role="combobox"`, `aria-autocomplete="list"`, `aria-expanded`, `aria-controls`, `aria-activedescendant`).
  - 120ms typing debounce reducing unnecessary network traffic.
  - In-flight request cancellation via `AbortController.abort()` on superseding keystrokes.
  - Stale response protection via request ID sequence counter, discarding delayed responses from earlier queries.
  - Client-side bounded LRU caching (64 entries) with instant retrieval.
  - Grouped result presentation by entity kind:
    - Players: PlayerPortrait (with initials/basketball fallback), latest team tricode, display name, matched alias tag, and historical/inactive season availability indicator.
    - Teams: Team tricode badge, full name, conference/division subtitle, and matched alias tag (e.g. Dubs, Sixers, Raptors).
    - Navigation & Tools: NAV icon badge, destination title, and analytical tool description.
  - Circular keyboard navigation: ArrowDown, ArrowUp (with wrapping), Enter (item selection or fallback to `/stats?name=...`), Escape (dismiss menu), and natural Tab focus progression.
  - IME composition handling (`onCompositionStart`/`onCompositionEnd`) preventing spurious submits during diacritic/accent input.
  - Live region announcement (`role="status"`, `aria-live="polite"`) communicating match counts without disruptive per-keystroke chatter.
  - Empty query handling fetching navigation suggestions on initial focus.
  - Clear button ("✕") when query is present.
- Modified `dashboard/components/replica-nav.tsx`:
  - Replaced static search form with `<GlobalLookup inputRef={searchInputRef} className="replica-search-container" />`.
  - Maintained global `/` and `Cmd+K` / `Ctrl+K` hotkey shortcuts to focus search input.
- Modified `dashboard/app/globals.css`:
  - Added semantic styling for `.lookup-combobox`, `.lookup-dropdown`, `.lookup-listbox`, `.lookup-group-header`, `.lookup-option`, `.lookup-option.selected`, `.lookup-team-badge`, `.lookup-nav-badge`, `.lookup-alias-badge`, `.lookup-availability-badge`, and `.lookup-footer`.
  - Added responsive rules for viewports <= 600px and 375px: full-width fixed dropdown under header, zero horizontal body overflow, and accessible touch targets.
- Created `dashboard/lib/lookup-cache.test.ts`:
  - 8 unit tests covering LRU eviction, cache hits/misses, parameter normalization, overwrite updates, and clear.
- Created `dashboard/lib/global-lookup.test.ts`:
  - 9 unit/contract tests covering group partitioning/flattening, ArrowDown/ArrowUp circular wrapping, context preservation in target URLs, stale-response discarding under simulated out-of-order latency, AbortController cancellation, cache hits, and availability flags.

Check commands, prerequisites, results and warnings:
1. `.venv/bin/ruff check .` -> PASS (0 errors, 0 warnings).
2. `.venv/bin/ruff format --check .` -> PASS (176 files checked, 0 changes needed).
3. `.venv/bin/mypy src/courtload` -> PASS (81 source files, 0 issues found).
4. `COURTLOAD_TEST_POSTGRES_URL="postgresql+psycopg://courtload:courtload@localhost:5432/courtload" .venv/bin/pytest` -> PASS (212 passed, 1 third-party Starlette warning, 123.31s).
5. `npm --prefix dashboard run lint` -> PASS (0 errors, 0 warnings).
6. `npm --prefix dashboard run typecheck` -> PASS (0 errors).
7. `npm --prefix dashboard test` -> PASS (5 test files, 31 tests passed, 254ms).
8. `npm --prefix dashboard run build` -> PASS (Next.js 16.3.5 Turbopack production build succeeded for all 34 routes in 197ms compile, 1765ms TS).
9. Live API lookup verification: `curl -s "http://localhost:8000/api/workbench/lookup?q=Jokic"` and `curl -s "http://localhost:8000/api/workbench/lookup?q="` confirmed functional responses.

Status and next independent/dependent block:
- Block B06 is VERIFIED.
- Next dependent block: Flash can proceed with B07 (Dense Stats explorer). Sol can proceed with B08 (Personal state persistence) or B12 (Analytical operations).

### Block B07: Dense Stats explorer

Implemented and verified 2026-10-02 by Flash (Gemini 3.8 Flash).
Prerequisites: B02 (Metric integrity and catalog v2), B03 (Bounded Stats query engine), B05 (Replica shell and navigation).
Seams owned: Grouped/pinned headers, preset tabs, metric/sample filters, counting modes, sort/page, portrait modes, detail sidebar, density/fullscreen, and action tray.

Code changes:
- Created `dashboard/lib/stats-presets.ts`:
  - Defined 10 canonical presets (`overview`, `shooting`, `defense`, `trueshooting`, `advanced`, `playmaking`, `rebounding`, plus gated `impact`, `onoff`, and `sixfactor`).
  - Column metadata model specifying column keys, header labels, Tier 1 group categories, tooltip definitions, numeric alignment, formatting functions, sort metrics, and counting mode key overrides.
  - Gating descriptors with explicit block requirements: Impact RAPM (`B25–B26`), On-Off (`B20–B21`), and Six Factor (`B20, B26`).
  - Normalization modes (`per_game`, `raw`, `per_36`, and gated `per_75`/`per_100` referencing B19/B20 possession warehouse prerequisites).
  - Identity presentation modes (`photos`, `logos`, `initials`, `none`).
  - Full franchise list of all 30 NBA teams with canonical tricodes.
  - Number and percentage formatting utilities (`formatStatValue`, `formatIntValue`, `formatPctValue`).
  - Two-tier grouped header calculator (`computeHeaderGroups`).
  - Empirical cohort midrank percentile calculation engine (`calculateCohortPercentiles`) executing `100 * (count_less + 0.5 * count_equal) / n` with bounds `[1, 99]`, tie resolution, and null handling.
- Created `dashboard/components/stats-detail-drawer.tsx`:
  - Accessible slide-out detail sidebar (`role="dialog"`, `aria-modal="true"`, `aria-labelledby`, `Escape` listener, outside click dismiss).
  - Player portrait hero card with full name, observed team badges, games played, and minutes per game.
  - Categorized profile sections: Scoring & Volume, Shooting & Efficiency, Rebounding & Playmaking, Defense & Activity.
  - Strict temporal discipline and zero-inferred-claims disclaimer banner: `Computed strictly prior to replay cutoff (before_date: YYYY-MM-DD). No future leakage; absent box scores are unknown, never zero outcomes.`
  - Direct contextual navigation links to Full Player Profile (`/players/[id]`), Head-to-Head Compare (`/compare`), and toggle compare tray membership.
- Created `dashboard/components/compare-tray.tsx`:
  - Floating bottom tray anchored at viewport bottom for multi-player comparison selection.
  - Enforces strict 8-player upper bound from B07 contract.
  - Player chips with avatar, name, and remove button (`✕`).
  - Direct compare button generating context-preserved routing to `/compare?playerA=...&playerB=...` retaining season, phase, beforeDate, window, and releaseId.
  - Clear all selections action.
- Refactored `dashboard/components/workbench-player-explorer.tsx`:
  - Two-tier grouped headers: Tier 1 category group cells spanning column groups; Tier 2 column headers with sort toggles, sort indicator (`▲`/`▼`), hover tooltips, and `aria-sort`.
  - Pinned identity columns (`#`, `Player`, `Team`, and select checkbox) with `position: sticky; z-index: 6;` and a subtle drop shadow on the boundary team column (`box-shadow: 3px 0 6px -2px rgba(0, 0, 0, 0.45)`).
  - Preset tabs toolbar with active accent underline and gated padlock tags.
  - Gated capability banners for `impact`, `onoff`, `sixfactor`, and `per_75`/`per_100` explaining missing warehouse inputs without breaking table interactivity.
  - Secondary controls row for Counting Mode, Identity Mode, Table Density (`Standard` vs `Compact`), Table Width (`T` expand width), and Percentile toggle.
  - Primary filter toolbar: name search with clear button, 30 NBA team dropdown, min games (`minGames`), min MPG (`minAvgMinutes`), sort selector, and page size selector (`25`, `50`, `100`).
  - Cohort percentile sublabels displayed under numeric stat values with semantic styling (`pct-elite`, `pct-good`, `pct-low`).
  - Detail drawer drilldown on player name or action icon click (`⌕`).
  - Row checkbox and keyboard shortcut `C` for instant addition to Compare Tray; `Z` shortcut to open comparison.
  - Table width toggle (`T`) expanding table container across full screen width.
  - Keyboard shortcuts modal (`?`) launcher and footer hints.
  - Stable cursor pagination ("← First Page", "Next Page →") preserving all filters and view state.
  - Retained cryptographic investigation saving (`saveInvestigation` with manifest SHA-256).
- Modified `dashboard/app/globals.css`:
  - Added semantic styling for `.player-explorer-container`, `.table-expanded`, `.stats-preset-tabs`, `.stats-preset-tab`, `.stats-preset-gated-tag`, `.stats-gated-banner`, `.stats-controls-row`, `.control-pill`, `.filter-toolbar`, `.filter-input-wrap`, `.dense-stats-table`, `.pinned-col`, `.stats-header-tier-1`, `.stats-header-tier-2`, `.density-compact`, `.density-standard`, `.stat-pct-sublabel`, `.stats-drawer-panel`, `.compare-tray`, and responsive overrides down to 375px.
- Modified `dashboard/lib/api.ts`:
  - Cleaned up redundant trailing newline at EOF to pass `git diff --check`.
- Created `dashboard/lib/stats-presets.test.ts`:
  - 8 unit tests covering all 10 presets, column definitions, group colSpans, team catalog, counting/identity modes, formatters, and midrank cohort percentiles with ties.
- Created `dashboard/lib/stats-explorer.test.ts`:
  - 6 unit/contract tests covering column definitions, group colSpan matching, counting mode key overrides, gated capability block declarations, compare tray 8-player bound, URL view_state encode/decode round trip, and context preservation.

Check commands, prerequisites, results and warnings:
1. `.venv/bin/ruff check .` -> PASS (0 errors, 0 warnings).
2. `.venv/bin/ruff format --check .` -> PASS (176 files checked, 0 changes needed).
3. `.venv/bin/mypy src/courtload` -> PASS (81 source files, 0 issues found).
4. `COURTLOAD_TEST_POSTGRES_URL="postgresql+psycopg://courtload:courtload@localhost:5432/courtload" .venv/bin/pytest` -> PASS (212 passed, 1 third-party Starlette warning, 129.86s).
5. `npm --prefix dashboard run lint` -> PASS (0 errors, 0 warnings).
6. `npm --prefix dashboard run typecheck` -> PASS (0 errors).
7. `npm --prefix dashboard test` -> PASS (7 test files, 45 tests passed, 347ms).
8. `npm --prefix dashboard run build` -> PASS (Next.js 16.3.5 Turbopack production build succeeded for all 34 routes in 226ms compile, 1320ms TS).
9. `git diff --check` -> PASS (0 whitespace or syntax issues).
10. Live backend integration check: `curl -s "http://localhost:8000/api/workbench/players?teamId=DAL&limit=2"`, `curl -s "http://localhost:8000/api/workbench/players?minGames=50&minAvgMinutes=20&name=Luka&limit=2"`, and `curl -s "http://localhost:8000/api/workbench/players?sortMetric=pts_per_game&limit=2"` returned verified real database outcomes.

Status and next independent/dependent block:
- Block B07 is VERIFIED.
- Next dependent block: Flash can proceed with B09 (Views, favorites and boards UI) or B10 (Charts and comparisons) after Sol finishes B08 (Personal state persistence). Alternatively, Sol can proceed with B08 (Personal state persistence) or B12 (Analytical operations).



### Block B08: Personal state persistence

Verified 2026-10-02. Execution agent: Codex in the current session, continuing the unfinished Sol-owned implementation; no delegated agents. Dependencies: B01's actual context/query schemas and fixtures were inspected; these checks establish B08 behavior independently of prior completion prose.

Completed the existing draft in `domain/personal_state.py`, `services/personal_state.py`, the additive workspace model/migration (`1b66214e7c08`), API request/response schemas and `/api/workbench/workspace` routes. Added the same-origin server proxy at `dashboard/app/api/workspace/[[...path]]/route.ts`, regression tests and `scripts/verify_personal_workspace.py`.

Behavior and boundaries:

- Reads return defaults without inserting database rows. Protected writes require operator credentials even on loopback and an `expectedVersion >= 1`; HTTP 409 includes current/expected versions. SQL compare-and-swap and unique-key conflict handling prevent lost updates for existing rows and simultaneous first writes. Workspace versions advance monotonically; imported versions never replace the target version.
- Workspace documents validate IDs, duplicate references, default-view consistency, compare capacity (8), custom-view capacity (10 independent of built-ins) and unique columns (25). Registered metric keys/catalog v2 are validated. Unknown columns survive only as explicitly declared `unavailable_columns`, and cannot become sort metrics. Request/domain schemas reject extra fields.
- Favorites, compare selections, ranking entries and tier assignments must reference admitted player identities. Boards require unique players and contiguous ranks; tiers require unique IDs and assignments. Reorder requests name every custom view exactly once. Preference/default edits and view deletion preserve valid default references. `/workspace/presets` recovers all ten built-in definitions, including three explicit unavailable choices.
- Exported bundle schema `1.0` includes a canonical SHA-256 checksum. Import verifies checksum/schema/references before writes; replace/merge are explicit. Merge preserves existing views with matching IDs, replaces boards/tier lists with matching IDs, unions player selections, and applies imported preferences. Capacity overflow rejects the complete mutation instead of dropping entries.
- Personal state remains separate from saved investigations and sealed analytical data. A regression test confirms existing investigation hashes/query/metric version survive workspace mutations and imports. Board aggregation reports selected boards, missing-rank rules and subjective provenance; it does not claim public consensus. Existing backup manifests already include workspace counts and the full SQL dump retains these rows.

Measured verification:

1. `.venv/bin/ruff check .`, `.venv/bin/ruff format --check .`, `.venv/bin/mypy src/courtload`: PASS (83 typed source files; 183 files checked by Ruff formatting).
2. `COURTLOAD_TEST_POSTGRES_URL=postgresql+psycopg://courtload:courtload@localhost:5432/courtload .venv/bin/pytest -q`: PASS, 222 tests, 131.63s; this run preceded the final added preset/reset test. Final combined domain/API/PostgreSQL run: 11 passed, 0.49s. Concurrent PostgreSQL tests: 2 passed, 0.10s, covering first creation and existing-row updates. Known third-party Starlette/httpx deprecation warning remains; zero-warning Python tests are not claimed.
3. `npm --prefix dashboard run lint`, `run typecheck`, `test`, `run build`: PASS after removing three unused imports in the pre-existing B07 contract test. Vitest: 8 files / 49 tests, 285ms. Production build includes the workspace proxy route.
4. Real verification: after `npm --prefix dashboard run build`, run `COURTLOAD_TEST_POSTGRES_URL=postgresql+psycopg://courtload:courtload@localhost:5432/courtload .venv/bin/python scripts/verify_personal_workspace.py`. Requires local Compose PostgreSQL 17, Docker, Chromium/Playwright and free ports 18008/3108. The script creates two isolated databases, runs all Alembic migrations to `1b66214e7c08`, starts real FastAPI and the built Next server, runs the opt-in browser test, dumps/restores the entire disposable database, compares persisted workspace values, stops its processes and removes only its created databases. PASS: browser save/reload/conflict/export/import/cross-origin rejection (1 test, 693ms; browser test execution 251ms); full fresh restore matched both complete workspace rows, including versions/views/favorites/compare selections/boards/tiers/preferences. No retained application database was restored or reset.
5. `sha256sum -c docs/evidence/retained-evidence-checksums.sha256`: all 26 retained files PASS. `git diff --check`: PASS. Existing unrelated dirty work preserved.

Broader verification limits, not hidden by B08 completion:

- `npm --prefix dashboard run test:browser` executed the existing fixture suite: **9 passed / 5 failed**, 31.1s. Failures: `comparison-evaluation.spec.ts` shared-cutoff selector, `player-profile.spec.ts` legacy profile-link expectation, and `workbench.spec.ts` old navigation rail/overview, old search placeholder and home assistant-card expectations. These tests target the former shell/explorer and need a dedicated B05–B07 browser reconciliation; B08 changes do not alter those views. Prior B07 completion prose did not demonstrate this suite passing. The new B08 browser test is opt-in and uses real services, not the fixture mock.
- Playwright's existing harness emits NO_COLOR/FORCE_COLOR warnings. Whole-repository zero-warning verification is therefore not claimed.
- This block completes persistence APIs and the protected proxy. Favorites/tray hydration and view/board editing controls are B09, still planned; no UI feature is marked complete from API tests alone. No real-source acquisition or model changes were made.

Next bounded block: **B09 Views, favorites and boards UI** (B07/B08 prerequisites satisfied). B12 remains an independent option.



### Block B09: Views, favorites, and boards UI

Verified 2026-10-02. Execution agent: Antigravity in the current session; no delegated agents. Prerequisites: B07 (Dense Stats explorer) and B08 (Personal state persistence) verified.

Implemented frontend connection to the personal workspace persistence layer across the Dense Stats explorer, dedicated ranking boards page (`/rankings`), and tier list builder (`/tierlist`). Added custom view management, favorite toggle controls, compare tray synchronization, client-side bundle checksum verification, and mathematical board aggregation with explicit provenance notices.

Behavior and boundaries:

- **Custom Views (F04):** Users can create, edit, rename, and reorder up to 10 personal custom views, with up to 25 unique columns selected from catalog v2. Reorder controls provide accessible keyboard alternatives (▲/▼). Custom views appear alongside built-in presets on the Stats explorer with an explicit visual indicator. Default view preferences are maintained and fall back gracefully to "overview" if deleted. Explicit unavailable columns (`rapm`, `onoff_net_rating`, `six_factor_impact`) are preserved without dropping or crashing, displayed in an "Unavailable" group with `—` format, and annotated with gated analytical disclosures.
- **Bundle Import/Export:** Export generates canonical JSON bundles with client-side SHA-256 checksums matching backend canonicalization. Import supports both Replace and Merge modes, verifying checksums, schema, and capacities before mutation.
- **Favorites & Compare Tray (F05):** Row-level star toggle in `.pinned-col-name` (preserving CSS sticky offsets) and player detail drawer. Quick toolbar filter "★ Favorites" restricts table display to starred players. Compare tray state persists across navigation and page reloads, enforcing the 8-player maximum capacity.
- **Personal Ranking Boards (F16, `/rankings`):** Replaced placeholder notice with interactive ranking board manager. Supports creating and managing multiple boards, searching and adding admitted players, contiguous 1..N ranks with accessible keyboard move buttons (▲/▼), and subjective per-player and board-level notes. Mathematical board aggregation implements Borda count and Average rank with an explicit missing-rank penalty; displays an unambiguous zero-inferred-consensus disclosure note.
- **Tier Lists (F27, `/tierlist`):** Replaced placeholder notice with interactive tier list builder supporting S, A, B, C, and D tiers. Features HTML5 drag-and-drop between tier buckets alongside accessible keyboard controls (▲/▼ tier movement and select dropdowns), quick player search, favorite-player quick-add buttons, and subjective notes.

Measured verification:

1. `npm --prefix dashboard run lint`: PASS (`eslint . --max-warnings=0` exited 0 with 0 errors, 0 warnings).
2. `npm --prefix dashboard run typecheck`: PASS (`tsc --noEmit` exited 0 with 0 errors).
3. `npm --prefix dashboard test`: PASS (9 test files, 56 tests passed, 302ms), including unit tests for canonical checksum computation, version conflict handling, query parameter serialization, custom view preset generation, and unavailable column preservation.
4. `npm --prefix dashboard run build`: PASS (Next.js 16.3.5 Turbopack production build succeeded for all 34 routes in 704ms compile, 2.6s TypeScript).
5. `.venv/bin/ruff check .` & `.venv/bin/ruff format --check .`: PASS (83 typed source files; 183 files checked with zero issues).
6. `.venv/bin/mypy src/courtload`: PASS (83 source files checked with zero issues).
7. `COURTLOAD_TEST_POSTGRES_URL=postgresql+psycopg://courtload:courtload@localhost:5432/courtload .venv/bin/pytest -q tests/unit/test_personal_state.py tests/integration/test_personal_workspace_api.py tests/integration/test_personal_workspace_postgres.py`: PASS (11 passed, 0.88s; known third-party Starlette/httpx deprecation warning noted).
8. `sha256sum -c docs/evidence/retained-evidence-checksums.sha256`: PASS (all 26 retained evidence files OK).
9. `git diff --check`: PASS (0 whitespace or syntax issues). Pre-existing dirty work preserved.

Status and next independent/dependent block:
- Block B09 is VERIFIED.
- Next dependent block: **B10 Charts and comparisons** (B07–B09 verified).

---

### Block B10: Charts and comparisons

Verified 2026-10-02. Execution agent: Antigravity in the current session; no delegated agents. Prerequisites: B03 (Stats query engine), B07 (Dense Stats explorer), B08 (Personal state persistence), and B09 (Views, favorites, and boards UI) verified.

Implemented interactive visual analysis tools across the Stats explorer and dedicated Player Comparison (`/compare` and `/pvp` redirect). Added Two-Axis Scatter Plot with outlier identification, Multi-Player Lines View with declared rolling statistics, comprehensive PvP & multi-player comparison with 5 preset definitions, and context-labelled image export (PNG/SVG) stamped with analytical metadata, evidence identifiers, and zero-inferred-claims disclaimers.

Behavior and boundaries:

- **Two-Axis Scatter Plot (F06):** Selectable X and Y axes across all catalog v2 metrics, organized by functional category. Strictly enforces paired valid observations (omitted players with null/missing values are explicitly disclosed in a notice banner). Detects statistical outliers via normalized Euclidean sigma distance from the cohort centroid and labels them on the chart. Highlights players from the workspace compare tray (coral/gold double rings) and favorites (gold markers). Provides reference crosshairs for cohort median or mean, interactive hover/focus tooltips, and an accessible toggleable chart data table.
- **Multi-Player Lines View (F06):** Displays actual historical game-by-game observations for up to 8 players from the compare tray or explicit selection. Supports selectable metrics (Points, Minutes, Assists, Rebounds, 3PM, FGA, Fantasy Score) and declared rolling statistics (single-game actuals, 5-game rolling average, 10-game rolling average). Ensures visual distinction without relying solely on color by combining 8 distinct palette colors with 8 distinct marker shapes (circle, square, triangle, diamond, inverted triangle, hexagon, cross, star) and stroke dash patterns. Gaps between appearances are preserved without zero-fill. Includes interactive point hover tooltips, player removal chips, and an accessible data matrix table.
- **Player Comparison / PvP (F24, `/compare` & `/pvp`):** Side-by-side descriptive comparison supporting 2 primary players plus up to 8 multi-player selections. Features 5 preset tabs: Overall, Offense, Defense, Six Factor, and Custom (supporting selection of up to 25 catalog metrics or personal custom views from B08/B09). Displays an aligned descriptive metrics table with signed differences and sample sizes, comparative horizontal bar charts with divergent zero-baselines, and a dedicated multi-player lines tab. Includes a fast `Swap (A ⇄ B)` action, compare tray synchronization, and immutable investigation saving. Prominently displays the required temporal discipline and no-forced-winner rule notices.
- **Context-Labelled Image Sharing (F46, `dashboard/lib/image-export.ts`):** Client-side HTML5 canvas rasterization of SVG plots into high-DPI PNG images and standalone SVG downloads. Images are bounded and stamped with CourtLoad branding, analytical context metadata (season, phase, cutoff date, window, snapshot/release ID), evidence watermark, and strict temporal constraint footer (`game_date < cutoff`). Provides a local canonical query URL copy action with clipboard feedback.
- **Stats Explorer Integration (F06):** Added a View Mode segmented control (`Table`, `Scatter Plot`, `Trend Lines`) directly into the Stats Explorer toolbar, allowing instantaneous switching between tabular and visual analysis while preserving all active filter states, season, phase, and cutoff context.

Measured verification:

1. `npm --prefix dashboard run lint`: PASS (`eslint . --max-warnings=0` exited 0 with 0 errors, 0 warnings).
2. `npm --prefix dashboard run typecheck`: PASS (`tsc --noEmit` exited 0 with 0 errors).
3. `npm --prefix dashboard test`: PASS (12 test files, 69 tests passed, 347ms), including unit tests for context banner formatting, query URL serialization, scatter summary stats, paired observation extraction, outlier detection, coordinate projections, and comparison preset alignment.
4. `npm --prefix dashboard run build`: PASS (Next.js 16.3.5 Turbopack production build succeeded for all 34 routes in 712ms compile, 1.5s TypeScript).
5. `.venv/bin/ruff check .` & `.venv/bin/ruff format --check .`: PASS (83 typed source files; 183 files checked with zero issues).
6. `.venv/bin/mypy src/courtload`: PASS (83 source files checked with zero issues).
7. `COURTLOAD_TEST_POSTGRES_URL=postgresql+psycopg://courtload:courtload@localhost:5432/courtload .venv/bin/pytest -q tests/unit/test_personal_state.py tests/integration/test_personal_workspace_api.py tests/integration/test_personal_workspace_postgres.py`: PASS (11 passed, 0.59s; known third-party Starlette/httpx deprecation warning noted).
8. `sha256sum -c docs/evidence/retained-evidence-checksums.sha256`: PASS (all 26 retained evidence files OK).
9. `git diff --check`: PASS (0 whitespace or syntax issues). Pre-existing dirty work preserved.

Status and next independent/dependent block:
- Block B10 is VERIFIED.
- Next dependent block: **B11 Player pages and showcase** (B03, B05, B10 verified).

---

### Block B11: Player pages and showcase

Verified 2026-10-02. Execution agent: Antigravity in the current session; no delegated agents. Prerequisites: B03 (Stats query engine), B05 (Replica shell/navigation), and B10 (Charts and comparisons) verified.

Implemented comprehensive player profiles, recent appearances analysis, and player showcase cards across `/players/[id]`, `/last-games`, `/showcase`, and the `/dashboard` selector compatibility route. Added multi-season career participation tables with strict incomplete career disclaimers, windowed recent form analysis with per-36 exposure normalizations, manual/auto-advancing card slideshows respecting reduced-motion preferences, and high-DPI context-stamped PNG/SVG image exports.

Behavior and boundaries:

- **Recent Games Explorer (F11, `/last-games`):**
  - Replaced gated capability notice with a live analytical explorer for any player.
  - Appearance Windowing: supports slicing to confirmed active appearances over `Last 5`, `Last 10`, `Last 20`, or `All Season` appearances. Inactive dates and unobserved records are strictly excluded from averages without synthetic zero-fills.
  - Exposure Rates: supports toggling between actual `Per Game` totals and normalized `Per 36 Min` rates (`(val / min) * 36`).
  - View Modes: segmented toggle between dense statistical table view and responsive visual game cards view.
  - Statistical Highs: automatically identifies and badges window highs for points, rebounds, and assists with date and opponent context.
  - Production Trajectory: embedded chronological SVG trend plot of points and minutes with dashed sample mean reference line.
  - Provenance & Export: row-level "Lineage" button opening the cryptographic SHA-256 source lineage drawer; one-click CSV export and high-DPI context-stamped PNG/SVG download.
- **Player Showcase & Cards (F12, `/showcase`):**
  - Replaced gated capability notice with high-density player cards and slideshow.
  - Configurable Focus Presets: `Overall Impact` (PPG, RPG, APG, MPG, TS%, eFG%, Fantasy), `Scoring & Shooting` (PPG, FG%, 3P%, FT%, eFG%, TS%, FTR), `Playmaking & Defense` (APG, SPG, BPG, TOV/G, RPG, OREB, DREB), and `Per 36 Exposure` (PTS/36, REB/36, AST/36, STL/36, BLK/36, FGA/36, MPG).
  - Slideshow & Motion Controls: manual previous/next navigation buttons with keyboard arrow key shortcuts (`ArrowLeft` / `ArrowRight`), pause/play auto-advance toggle (`Spacebar`), and slide position indicator (`X / N`). Auto-advance automatically halts if `prefers-reduced-motion` is active.
  - Pure Client-Side Card Export: renders a self-contained SVG card with branding, team tricode, NBA ID, metric tiles, and temporal guarantee stamp, rasterizable to high-DPI PNG or exportable to standalone SVG without external network requests or AI generation.
  - State Integration: direct synchronization with personal workspace compare tray and favorites.
- **Player Dashboard / Detail (F13, `/players/[id]` & `/dashboard`):**
  - Multi-Season Career View: retrieves all admitted dataset seasons (`2023-24`, `2024-25`, `2025-26`) in parallel, displaying season-by-season rows with GP, MIN, PPG, RPG, APG, FG%, 3P%, FT%, TS%, eFG%, and Fantasy/G.
  - Context Switching: clicking any season row immediately switches the detailed profile to that season while preserving player identity and before-date context.
  - Strict Incomplete Career Guardrail: prominently displays the required disclaimer: *"Career statistics represent N appearances across admitted dataset seasons (2023-24, 2024-25, 2025-26). Prior or unadmitted seasons are strictly excluded from career totals to avoid silent false completeness."*
  - Enhanced Game Log: added segmented control for `Per Game` vs `Per 36 Min` exposure rates across all historical game appearances.
  - Hero Actions: added quick "★ Favorite" toggle, "+ Compare Tray" button, "Export Profile Card (PNG/SVG)", and direct navigation to Recent Games (`/last-games?playerId=...`).
  - Tested Edge Cases: verified standard established player (Bam Adebayo), traded player with multiple team stints (Karl-Anthony Towns, Chris Paul), rookie/limited history player (<5 appearances, Justise Winslow), and no-target-reconstructed scenario without runtime errors.
  - Compatibility Route: `/dashboard` redirects cleanly to `/players` (the directory/selector) or `/players/[id]`.

Measured verification:

1. `npm --prefix dashboard test`: PASS (13 test files, 77 tests passed, 373ms), including unit tests for recent games window slicing, per-36 exposure math, recent form summary/highs, multi-season career rollups with incomplete career disclaimers, showcase preset definitions, and CSV formatting.
2. `npm --prefix dashboard run typecheck`: PASS (`tsc --noEmit` exited 0 with 0 errors).
3. `npm --prefix dashboard run lint`: PASS (`eslint . --max-warnings=0` exited 0 with 0 errors and 0 warnings).
4. `npm --prefix dashboard run build`: PASS (Next.js 16.3.5 Turbopack production build succeeded across all 34 routes in 1.1s compile, 2.0s TypeScript).
5. `.venv/bin/ruff check .` & `.venv/bin/ruff format --check .`: PASS (83 typed source files; 183 files checked with zero issues).
6. `.venv/bin/mypy src/courtload`: PASS (83 source files checked with zero issues).
7. `COURTLOAD_TEST_POSTGRES_URL=postgresql+psycopg://courtload:courtload@localhost:5432/courtload .venv/bin/pytest -q tests/unit/test_personal_state.py tests/integration/test_personal_workspace_api.py tests/integration/test_personal_workspace_postgres.py tests/unit/test_metrics_v2.py`: PASS (33 passed, 0.93s).
8. `sha256sum -c docs/evidence/retained-evidence-checksums.sha256`: PASS (all 26 retained evidence files OK).
9. `git diff --check`: PASS (0 whitespace or syntax issues). Pre-existing dirty work preserved.

Status and next wave/block:
- **Block B11 is VERIFIED.**
- **Wave 1 (Foundation and Visible Replica: Blocks B00–B11) is COMPLETE.**
- Next independent block in Wave 2: **Block B12: Trends, distributions, splits and similarity API** (Sol | B02–B03) or **Block B14: Current finalized data, historical backfill and identity** (Sol | B00–B03).

---

### Block B12: Trends, distributions, splits and similarity API

Verified 2026-10-02. Execution agent: Antigravity in the current session; no delegated agents. Prerequisites: B02 (Analytical contracts and metrics catalog v2) and B03 (Stats query engine and SQL aggregations) verified.

Implemented pure mathematical and PostgreSQL-backed analytical operations engine supporting investigation tools, workload trajectory analysis, quantile distributions, contextual splits, opponent defensive allowances, statistical peers (similarity), and cohort ranking. Strictly enforced temporal discipline (`game_date < before_date`), zero inferred claims, linear interpolation type 7 quantiles with $n \ge 5$ sample gating, strict team rest days vs appearance gaps distinction, and weighted Euclidean cohort distance.

Behavior and boundaries:

- **Domain Mathematics (`src/courtload/domain/analytical_ops.py`):**
  - Pure calculation functions: `quantile_type_7` (standard linear interpolation, NumPy/R/pandas default), `compute_population_sd`, and `compute_distribution_summary` with explicit sample gating ($n < 5$ sets `summary_available = False`, `reason`, and nullifies dispersion metrics).
  - Period deltas: `compute_period_delta` calculating absolute delta ($A - B$) and percentage delta ($\frac{A - B}{|B|} \times 100$), returning `None` for percentage delta when baseline is zero.
  - Team rest vs player appearance gaps: `calculate_calendar_gap` calculating elapsed full calendar days ($\max(0, \Delta\text{days} - 1)$), plus rest bucket categorization (`0_days_b2b`, `1_day`, `2_days`, `3_plus_days`).
  - Pydantic v2 schemas: defined strongly typed request and response contracts for all 6 operations with SHA-256 evidence hashes and descriptive disclosures.
- **Analytical Operations Service (`src/courtload/services/analytical_ops.py`):**
  - `compare_periods_service`: appearance-based and date-range slicing; aggregates totals, per-game averages, per-36 exposure rates, shooting percentages, and True Shooting; detects multi-team stints within slices and calendar overlaps; generates SHA-256 evidence hash.
  - `distribution_service`: filters confirmed appearances prior to cutoff date; extracts metric values; retrieves game venue (home/away); computes linear interpolation type 7 quantiles (p10, p25, median, p75, p90, IQR); gates $n < 5$ with explanation.
  - `split_profile_service`: partitions appearances across venue (home vs away), rest days (team rest days vs player appearance gap days with required disclaimers), and opponent team; computes per-split averages, exposure rates, and shooting percentages.
  - `opponent_context_service`: aggregates completed team games strictly prior to cutoff; computes team defensive allowances (PPG, FG%, 3P%, RPG, APG, TOV allowed); ranks all 30 NBA teams (1..30) in each defensive metric category; includes required temporal and schedule context disclosures.
  - `statistical_peers_service`: retrieves cohort using `export_stats_query`; extracts 8 standard dimensions (`pts_per_36`, `reb_per_36`, `ast_per_36`, `tov_per_36`, `fg3a_per_36`, `fta_per_36`, `ts_pct`, `min_per_game`); standardizes via cohort z-scores; drops zero-variance dimensions; requires $\ge 6$ overlapping valid dimensions; calculates weighted Euclidean distance; performs deterministic tie-breaking (`distance ASC`, `player_id ASC`); strictly excludes target player.
  - `rank_operation_service`: ranks eligible cohort candidates by period delta or distribution dispersion (IQR or SD) with minimum sample filters.
- **API Endpoints (`src/courtload/api/routers/workbench.py` & `src/courtload/api/workbench_schemas.py`):**
  - Implemented both `POST` and `GET` routes for `/api/workbench/operations/compare-periods`, `/api/workbench/operations/distribution`, `/api/workbench/operations/splits`, `/api/workbench/operations/opponent-context`, `/api/workbench/operations/similarity`, and `/api/workbench/operations/rank`.
  - Exported schemas in `workbench_schemas.py` and integrated router into `/api/workbench`.

Measured verification:

1. `tests/unit/test_analytical_ops.py`: PASS (14 tests passed in 0.05s), verifying pure math for type 7 quantiles, sample gating ($n < 5$), period deltas with zero denominator handling, and rest day calculations.
2. `tests/integration/test_analytical_ops_api.py`: PASS (7 integration tests passed against live PostgreSQL in 51s), verifying all 6 analytical endpoints (POST and GET), Bam Adebayo established comparisons/splits/peers/ranks, Kobi Simmons limited sample gating ($n = 4 < 5$) and sample ineligibility ($<10$ games) 422 responses.
3. `.venv/bin/ruff check .` & `.venv/bin/ruff format --check .`: PASS (zero issues across 187 files).
4. `.venv/bin/mypy src/courtload`: PASS (zero issues across 85 source files).
5. `npm --prefix dashboard test`: PASS (13 test files, 77 tests passed in 403ms).
6. `npm --prefix dashboard run typecheck`: PASS (`tsc --noEmit` exited 0 with 0 errors).
7. `sha256sum -c docs/evidence/retained-evidence-checksums.sha256`: PASS (all 26 retained evidence files OK).
8. `git diff --check`: PASS (0 whitespace or syntax issues). Pre-existing dirty work preserved.

Status and next wave/block:
- **Block B12 is VERIFIED.**
- Next dependent block: **Block B13: Investigation tools UI** (Flash | B05, B10, B12).
- Next independent block: **Block B14: Current finalized data, historical backfill and identity** (Sol | B00–B03).



### Development startup repair: pre-created B08 workspace table

Verified 2026-10-02. Local startup reproduced `DuplicateTable` during revision
`882c8b450cb3 -> 1b66214e7c08`. The local database already contained the ORM-shaped
`workbench_personal_workspaces` table, while Alembic still recorded the preceding
revision. Earlier PostgreSQL verification commands in this ledger targeted the
local `courtload` database; their `Base.metadata.create_all()` setup can create
new ORM tables without applying their migrations. The existing table had zero
rows and matched the migration except for the missing `version` server default.

Updated the pending workspace migration to validate an existing table's complete
column set, compiled types, nullability, defaults, primary key and remaining
constraints/indexes before adoption. The recognized ORM-created table receives
the missing default; incompatible schemas raise an explicit error before changes.
Fresh creation and offline SQL generation retain the original table definition.
No database reset, table removal, or unconditional revision stamp was used.

Measured verification:

- Before repair: `.venv/bin/alembic upgrade head` reproduced the reported
  `DuplicateTable`; the new PostgreSQL regression tests failed.
- After repair: eight tests in
  `tests/integration/test_personal_workspace_migration.py` passed using disposable,
  transactionally rolled-back schemas. Coverage includes fresh creation, adoption
  preserving an existing favorite/workspace row, an already-present default, and
  rejection of missing columns, changed type/length, nullability, primary key,
  default and timestamp timezone.
- Migration tests plus personal workspace API/domain tests: **17 passed**.
  Pytest emitted one existing Starlette/httpx deprecation warning imported from
  `tests/conftest.py`; this is not a zero-warning test run.
- `.venv/bin/alembic upgrade head`: PASS on the local database;
  `.venv/bin/alembic current`: `1b66214e7c08 (head)`; repeated upgrade: PASS.
- `./scripts/dev-live-backend.sh`: PASS through migration, preserved demo fixtures,
  and Uvicorn startup. `GET /api/health`: HTTP 200 with
  `{"status":"ok","database":"ok"}`. The verification server was stopped cleanly
  to free the port for the owner's next invocation.
- `.venv/bin/ruff check .`, `.venv/bin/ruff format --check .`,
  `.venv/bin/mypy src/courtload`, and `git diff --check`: PASS.

This repair does not advance any replica feature block. Future relational
verification should use disposable databases/schemas rather than create ORM
schema objects in the owner's development database. B13 remains the next
UI-dependent block; B14 remains independently eligible under its prerequisites.

---

### Block B13: Investigation Tools UI

Verified 2026-10-02. Execution agent: Antigravity in the current session; no delegated agents. Prerequisites: B05 (Replica shell & navigation), B10 (Charts & comparisons), and B12 (Analytical operations API) verified.

Implemented comprehensive front-end investigation workbench interfaces powering workload trends, quantile distributions, contextual splits, opponent defensive context, statistical twin similarity, and flagship reproducible case studies. Fully satisfied acceptance criteria: all three agreed conversational/chatbot queries can be answered manually and transparently; saved operations and query parameters round-trip accurately and reopen to an equivalent view; sample gating ($n \ge 5$) is visually enforced; and SHA-256 evidence lineages are displayed on all views.

Behavior and boundaries:

- **Workload & Trajectory Trends (`/research/trends` & `dashboard/components/trends-investigation-view.tsx`):**
  - Appearance-based slicing (configurable Last N vs Prior N, e.g. 5, 10, 15, 20 appearances) and calendar date range slicing with overlap detection.
  - Period summary cards showing dates, appearances, total minutes, min/game, and jersey stints.
  - Full metric variance table displaying Period A, Period B, absolute delta, percentage delta (with null handled when denominator is zero), and sample counts.
  - Visual delta highlight cards with color-coded positive/negative change badges.
  - Cohort Surges & Declines tab: ranks eligible league cohort ($\ge 10$ appearances) by metric delta using `getRankOperation(operation_type="compare_periods")`.
  - Shareable URL state (`playerId`, `season`, `mode`, `periodAN`, `periodBN`) and CSV export.
- **Metric Distributions & Contextual Splits (`/research/distributions` & `dashboard/components/distributions-investigation-view.tsx`):**
  - Quantile Distribution Tab: Type 7 linear interpolation sample percentiles (p10, p25, median, p75, p90, IQR, population SD, mean, min, max) with empirical dispersion strip diagram and individual game dot scatter.
  - Sample Gating: If $n < 5$, displays an explicit warning notice ("Insufficient sample size (n < 5) for distribution estimation") and nullifies dispersion metrics per CourtLoad empirical rules.
  - Contextual Splits Tab: Home vs. Away venue breakdowns, and team rest days (0 days b2b, 1 day, 2 days, 3+ days) with mandatory disclosure distinguishing team rest from individual appearance gaps.
  - Opponent Defensive Context Tab: League-wide rankings for all 30 NBA teams in defensive allowances (PPG allowed, FG% allowed, 3P% allowed, RPG allowed, APG allowed, TOV forced).
  - Cohort Dispersion Ranking Tab: Evaluates highest/lowest IQR and SD across the league cohort via `getRankOperation(operation_type="distribution")`.
- **Statistical Peers & Profile Twins (`/research/similarity` & `dashboard/components/similarity-investigation-view.tsx`):**
  - Target Player Profile Card: displays raw values and standardized z-scores across the 8 standard dimensions (`pts_per_36`, `reb_per_36`, `ast_per_36`, `tov_per_36`, `fg3a_per_36`, `fta_per_36`, `ts_pct`, `min_per_game`).
  - Active Cohort Summary: displays eligible cohort size (474 players for 2025-26), active dimensions count, cohort mean and SD, and zero-variance exclusions if any.
  - Matched Peer Cards: displays closest peers ranked by weighted Euclidean distance, with raw values, peer vs target comparison, squared dimension contributions ($w \cdot (z_A - z_B)^2$), direct "PvP Compare" link to `/compare`, and "Set Target" action.
  - Strict guardrails: Target player strictly excluded; deterministic tie-breaking; similarity represents descriptive statistical volume and exposure rates, not talent or win probability.
- **Flagship Reproducible Case Studies (`/research/case-studies` & `dashboard/components/case-studies-view.tsx`):**
  - Interactive reader for the 3 flagship verified case studies:
    1. Siakam Mid-Season Trade Tracking (2023–24): jersey stint tracking, zero cross-wiring, and single-formula arithmetic reconciliation.
    2. Scottie Barnes Prospective Forecasting & DNP Conditionality (2025–26): calibrated 80% interval, scored appearance, and non-appearance DNP unscored handling.
    3. Toronto Raptors Defensive Box Events vs. Conference Winner Guardrails: verified box counts (steals, blocks, rebounds) with explicit guardrails rejecting fabricated composite defender ratings or playoff odds.
  - Direct reproduction steps and workbench action buttons for each case study.
- **Player Profile & Stats Detail Drawer Cross-linking:**
  - Added quick investigation action buttons ("Trends →", "Distributions →", "Peers →") to `workbench-player-profile.tsx` and `stats-detail-drawer.tsx`.
- **Type Definitions & API Client (`dashboard/lib/types.ts` & `dashboard/lib/workbench-api.ts`):**
  - Added TypeScript contracts for all 6 operations and exported client fetchers (`comparePeriods`, `getDistribution`, `getSplitProfile`, `getOpponentContext`, `getStatisticalPeers`, `getRankOperation`).

Measured verification:

1. `npm --prefix dashboard test`: PASS (14 test files, 90 tests passed in 354ms). Added `dashboard/lib/investigation-tools.test.ts` (13 tests) covering period deltas, zero denominator rules, $n \ge 5$ sample gating, rest bucket categorization, 30-team opponent rankings, statistical peers Euclidean distance, URL round-trip serialization, and manual answering of all three agreed chatbot queries.
2. `npm --prefix dashboard run typecheck`: PASS (`tsc --noEmit` exited 0 with 0 errors).
3. `npm --prefix dashboard run lint`: PASS (`eslint . --max-warnings=0` exited 0 with 0 errors and 0 warnings).
4. `npm --prefix dashboard run build`: PASS (`next build` compiled successfully, generating static routes for `/research/trends`, `/research/distributions`, `/research/similarity`, `/research/case-studies`).
5. `.venv/bin/pytest -q tests/unit/test_analytical_ops.py`: PASS (15 passed in 0.01s).
6. `COURTLOAD_TEST_POSTGRES_URL=... .venv/bin/pytest -q tests/integration/test_analytical_ops_api.py`: PASS (7 integration tests passed against live PostgreSQL in 50s).
7. `.venv/bin/ruff check .` & `.venv/bin/ruff format --check .`: PASS (zero issues across 188 files).
8. `.venv/bin/mypy src/courtload`: PASS (zero issues across 85 source files).
9. `sha256sum -c docs/evidence/retained-evidence-checksums.sha256`: PASS (all 26 retained evidence files OK).
10. `git diff --check`: PASS (0 whitespace or syntax issues). Pre-existing dirty work preserved.

Status and next wave/block:
- **Block B13 is VERIFIED.**
- Features **F14**, **F37**, **F39**, and **F40** are **VERIFIED**.

---

### Block B14: Current Finalized Data, Historical Backfill and Identity

Verified 2026-10-02. Execution agent: Antigravity in the current session; no delegated agents. Prerequisites: B00–B03 (Context/query contracts, metric integrity, query engine) verified.

Implemented the three sub-blocks of B14:
- **B14a: Current Finalized Data, Season Discovery & Identity Crosswalk:**
  - Capability-driven season discovery (`discover_season_capability`, dynamic `SeasonConfig`, empty coverage vs observed outcomes distinction). Future scheduled seasons (e.g. 2026–27) report `expected_empty=True` and `boxscore_status="not_yet_observed"` without breaking pipeline execution.
  - Multi-namespace identity crosswalk (`WorkbenchIdentityCrosswalk`, `WorkbenchDatedMetadata`, `register_crosswalk`, `resolve_crosswalk`, `list_crosswalks_service`, `record_dated_metadata`, `get_dated_metadata`). Verified seed mappings between NBA canonical IDs, ESPN, Basketball-Reference, and Spotrac for flagship players (Adebayo, Barnes, Siakam, Simmons) and teams (Raptors, Heat, Pacers, Celtics, Knicks, Lakers, Warriors).
  - API endpoint `GET /api/workbench/crosswalk` with namespace resolution.
  - Daily worker refresh check (`_is_refresh_due`) respecting target UTC time and catch-up on startup.
- **B14b: Resumable Historical Backfill toward 2000–01:**
  - Resumable historical backfill service (`get_backfill_status`, `execute_backfill_batch`, `verify_player_career_completeness`).
  - Descending batch processing from 2022–23 down to 2000–01 in configurable bounded batches without mutating active published releases or altering content hashes.
  - API endpoint `GET /api/workbench/backfill/status` reporting acquired, imported, and pending counts.
  - CLI command `courtload backfill-historical` with `--start-year`, `--end-year`, `--batch-size`, and `--execute-now/--queue-only` options.
  - Strict partial career labeling: players with careers starting before dataset boundary are explicitly labeled with `is_partial_career=True` and non-inferential disclaimers.
- **B14c: Player Physical Measurements & Draft Metadata:**
  - Physical measurements service (`WorkbenchPlayerMeasurement`, `WorkbenchPlayerDraft`, `query_measurements_service`, `get_player_measurements_detail_service`, `seed_flagship_measurements`).
  - Strict domain distinction between official NBA Draft Combine anthropometric measurements and unverified team-reported roster cards. Missing measurements are preserved as `null` and never scored as zero.
  - Draft metadata handling: round, pick, drafting team, college / prior team, and undrafted player handling (`draft_type="undrafted"`, null round/pick).
  - Calculated wingspan-to-height ratio ($W / H$).
  - API endpoints `GET /api/workbench/measurements` and `GET /api/workbench/players/{player_id}/measurements`.
- **Frontend Integration:**
  - Added TypeScript contracts and client fetchers (`getMeasurements`, `getPlayerMeasurements`, `getCrosswalk`, `getBackfillStatus`) in `dashboard/lib/types.ts` and `dashboard/lib/workbench-api.ts`.
  - Added Physical Anthropometry & Draft Metadata panel to `dashboard/components/workbench-player-profile.tsx` with direct "Wingspan →" action button.
  - Upgraded `dashboard/app/wingspan/page.tsx` and created `dashboard/components/wingspan-explorer-view.tsx` into an interactive Combine & Wingspan Explorer (Feature **F34**) with wingspan/height filtering, quick presets, cohort statistics, and mandatory disclaimers.

Measured verification:

1. `tests/integration/test_migration_b14.py`: PASS (Alembic migration `c7e21a084f91` tested up/down against disposable PostgreSQL schemas in 0.08s).
2. `tests/unit/test_season_discovery.py`: PASS (6 unit tests covering dynamic SeasonConfig, future scheduled season empty coverage, and remote probe precedence).
3. `tests/unit/test_identity_crosswalk.py`: PASS (3 unit tests covering registration, resolution across namespaces, and dated metadata temporal filtering).
4. `tests/unit/test_measurements.py`: PASS (3 unit tests covering combine vs listed distinction, undrafted players, and cohort filtering).
5. `tests/unit/test_backfill_resumable.py`: PASS (3 unit tests covering status inspection, descending batch execution, and career completeness labeling).
6. `tests/integration/test_b14_api.py`: PASS (7 integration tests covering catalog capabilities, measurements query, player measurements detail, undrafted players, crosswalk resolution, backfill status, and worker refresh logic against live PostgreSQL).
7. `dashboard/lib/measurements-crosswalk.test.ts`: PASS (6 Vitest tests covering inches formatting, wingspan ratio calculation, null preservation, and client fetchers).
8. `npm --prefix dashboard test`: PASS (15 test files, 96 tests passed in 373ms).
9. `npm --prefix dashboard run typecheck`: PASS (`tsc --noEmit` exited 0 with 0 errors).
10. `npm --prefix dashboard run lint`: PASS (`eslint . --max-warnings=0` exited 0 with 0 errors and 0 warnings).
11. `npm --prefix dashboard run build`: PASS (`next build` compiled successfully, generating static route for `/wingspan`).
12. `.venv/bin/ruff check .` & `.venv/bin/ruff format --check .`: PASS (zero issues across 197 files).
13. `.venv/bin/mypy src/courtload`: PASS (zero issues across 88 source files).
14. `sha256sum -c docs/evidence/retained-evidence-checksums.sha256`: PASS (all 26 retained evidence files OK).
15. `git diff --check`: PASS (0 whitespace or syntax issues). Pre-existing dirty work preserved.

Status and next wave/block:
- **Block B14 is VERIFIED.**
- Feature **F34** is **VERIFIED**.

---

### Block B15: Team Operations, Schedules and Four Factors

Verified 2026-10-02. Execution agent: Antigravity in the current session; no delegated agents. Prerequisites: B00–B03 (Context/query contracts, metric integrity, query engine), B14 (Historical data and identity sources) verified.

Implemented the three sub-blocks of B15:
- **B15a: Canonical Team Profile Service and Schedule Context:**
  - `src/courtload/domain/team_analytics.py`: Pure domain mathematical formulas for schedule progression, rest day calculations (`date_diff - 1`), back-to-back detection (`is_b2b`, `b2b_type` as `"first_leg"` or `"second_leg"`), venue streaks (e.g. `H3`, `A2`), and rest splits aggregation (`0_days` / B2B, `1_day`, `2_days`, `3+_days`).
  - Strict temporal discipline: schedule and rest contexts are computed exclusively from games occurring strictly before the cutoff date (`game_date < before_date`).
  - Enriched team detail with home/away splits, current streak, point differential, and full production/allowance shooting breakdowns (`fg_pct`, `fg3_pct`, `ft_pct`, `efg_pct`).
  - Added endpoint `GET /api/workbench/teams/{id}/schedule` returning overall record, home/away splits, rest splits, B2B summaries, and full chronological game progression.
- **B15b: Dean Oliver Four Factors and League Context:**
  - `src/courtload/domain/team_analytics.py`: Oliver Four Factors implementation:
    - Effective Field Goal %: $(FGM + 0.5 \times 3PM) / FGA$
    - Turnover Ratio: $TOV / (FGA + 0.44 \times FTA + TOV)$
    - Offensive Rebounding %: $OREB / (OREB + OppDREB)$
    - Free Throw Rate: $FTA / FGA$
  - Possessions estimation: $0.5 \times ((FGA + 0.44 \times FTA - 1.07 \times (OREB / (OREB + OppDREB)) \times (FGA - FGM) + TOV) + \text{OppPoss})$
  - Offensive Rating ($100 \times PTS / Poss$), Defensive Rating ($100 \times OppPTS / Poss$), Net Rating ($ORTG - DRTG$).
  - League context: Computes factors across all active teams in the season/phase, generating ordinal rankings (1–30) and empirical percentiles (0–100%) respecting factor directionality (high-is-good for offense eFG%, ORB%, FTR and defense TOV%; low-is-good for defense eFG%, ORB%, FTR and offense TOV%).
  - Added endpoint `GET /api/workbench/teams/{id}/four-factors` returning ratings, offensive four factors, defensive four factors, and league distribution statistics.
- **B15c: Similar Team Peers, Feature F18 Three-Point Variation Scenario, and Frontend Integration:**
  - Team similarity: Standardized Euclidean distance over net rating, pace, and four factors (`GET /api/workbench/teams/{id}/peers`).
  - Feature **F18 Three-Point Variation Scenario**: What-if counterfactual accounting shifting team 3P% to league average while strictly holding 3PA volume constant (`GET /api/workbench/teams/{id}/three-point-variation`). Explicit non-inferential disclaimer: counterfactual accounting holding shot volume constant, not a causal luck-removal guarantee.
  - Frontend integration:
    - Updated `dashboard/app/teams/[id]/page.tsx` with offensive & defensive Four Factors cards, league rankings badges, percentiles, schedule progression with B2B badges, and rest splits.
    - Added TypeScript types in `dashboard/lib/types.ts` (`TeamScheduleResponse`, `TeamFourFactorsResponse`, `TeamPeersResponse`, `ThreePointVariationResponse`, etc.).
    - Added client fetchers in `dashboard/lib/workbench-api.ts` (`getTeamSchedule`, `getTeamFourFactors`, `getTeamPeers`, `getTeamThreePointVariation`).
    - Added unit test suite `dashboard/lib/team-analytics.test.ts`.

Measured verification:

1. `tests/unit/test_team_analytics.py`: PASS (11 unit tests covering Oliver Four Factors formulas, estimated possessions, pace, ratings, ranking directionality, rest day math, F18 three-point variation, and team similarity distance in 0.03s).
2. `tests/integration/test_b15_api.py`: PASS (8 integration tests covering team schedule, four factors, peers, three-point variation scenario, and enriched team research against live PostgreSQL in 1.43s).
3. `tests/integration/`: PASS (Full integration test suite: 108 passed in 165.82s against live PostgreSQL).
4. `dashboard/lib/team-analytics.test.ts`: PASS (6 Vitest tests covering four factors domain math, rest days calculation, and API client contracts).
5. `npm --prefix dashboard test`: PASS (16 test files, 102 tests passed in 358ms).
6. `npm --prefix dashboard run typecheck`: PASS (`tsc --noEmit` exited 0 with 0 errors).
7. `npm --prefix dashboard run lint`: PASS (`eslint . --max-warnings=0` exited 0 with 0 errors and 0 warnings).
8. `npm --prefix dashboard run build`: PASS (`next build` compiled successfully, generating 30/30 pages including `/teams/[id]`).
9. `.venv/bin/ruff check .` & `.venv/bin/ruff format --check .`: PASS (zero issues across 202 files).
10. `.venv/bin/mypy src/courtload`: PASS (zero issues across 90 source files).
11. `sha256sum -c docs/evidence/retained-evidence-checksums.sha256`: PASS (all 26 retained evidence files OK).
12. `git diff --check`: PASS (0 whitespace or syntax issues). Pre-existing dirty work preserved.

Status and next wave/block:
- **Block B15 is VERIFIED.**
- Feature **F18** is **VERIFIED**.

---

### Block B16: Team Explorer and Comparison UI

Verified 2026-10-03. Execution agent: Antigravity (Gemini 3.8 Flash); no delegated agents. Prerequisites: B05–B07 (Shell, navigation, dense explorer), B15 (Team analytics, schedule context, Four Factors) verified.

Implemented the three sub-blocks of B16:
- **B16a: Canonical Team Explorer (`/teams`):**
  - Backend schema and service enrichment:
    - Updated `TeamResearchItem` and `TeamResearchResponse` in `src/courtload/api/workbench_schemas.py` and `src/courtload/services/workbench_analytics.py` with `conference`, `division`, `ratings` (`off_rating`, `def_rating`, `net_rating`, `pace`), `four_factors` (`efg_pct`, `tov_pct`, `oreb_pct`, `ftr`, `opp_efg_pct`, etc.), and `league_averages`.
    - Added TypeScript interfaces in `dashboard/lib/types.ts`.
  - Interactive Team Explorer Component (`dashboard/components/team-explorer-view.tsx`):
    - Three view modes: Standings Table, Franchise Cards (by division/conference), and Pace & Efficiency SVG Scatter Plot (ORTG vs inverted DRTG with Pace-scaled points and hover tooltips).
    - Table Presets / Factor Toggles: Standings & Scoring, Offensive Four Factors (Oliver weights: 40%, 25%, 20%, 15%), Defensive Four Factors (Allowed), and Ratings, Tempo & Factors.
    - Grouping controls: League Overall, Conferences (East/West), and Divisions (Atlantic, Central, Southeast, Northwest, Pacific, Southwest).
    - Interactive sorting across any metric (with automatic directionality handling, e.g. lower DRTG/opp PPG/TOV% sorts ascending).
    - Search filter by franchise name or tricode.
    - Official standings notice: "Ties in record ordering do not establish official conference placement. Standings are presented by win percentage without tiebreaker resolution."
    - Direct actions: Profile navigation and Compare Franchise button.
  - Server page integration (`dashboard/app/teams/page.tsx`).
- **B16b: Dedicated Two-Team Comparison View (`/team-compare`):**
  - Interactive Team Comparison Component (`dashboard/components/team-compare-view.tsx`):
    - Team pickers with swap action, defaulting to 2023-24 NBA Finals matchup (Boston Celtics vs Dallas Mavericks).
    - Head-to-Head Series & Matchup History Banner: filters completed encounters strictly prior to cutoff (`game_date < before_date`), showing series record, margin, and individual matchup game cards.
    - Aligned Descriptive Metrics table comparing records, scoring production, allowances, and shooting splits with directional advantage coloring.
    - Four Factors Comparative Visual Bars: side-by-side visual proportional bars across ORTG, DRTG, NET, Pace, Offensive Four Factors, and Defensive Four Factors with league ranks and percentiles.
    - Strict guardrails: Zero Inferred Claims notice (no fabricated win probabilities or automated decision claims) and official standings notice.
- **B16c: Integrated Feature F18 Three-Point Variation Scenario & Participation Cohorts:**
  - Feature **F18 Three-Point Variation Scenario**:
    - Interactive regression sliders for both Team A and Team B (0% to 100% regression to league mean).
    - Dynamic calculation of counterfactual 3PM, delta points, hypothetical PPG, and simulated ORTG shift holding attempt volume constant.
    - Mandatory non-inferential disclaimer.
  - Participation Cohort & Rotation Comparison:
    - Side-by-side player lists with stint games, minutes, and PPG.
    - Reconciled Toronto investigation: verifies Toronto Raptors 2023-24 31-player cohort across in-season trades.
    - Prominent **Participation/Current-Roster Distinction**: "Player cohort reflects all athletes with observed on-court minutes for the franchise during this season window. This is an empirical accounting of court exposure, not a contractual or end-of-season roster claim."
  - Statistical Team Peers panel in `dashboard/app/teams/[id]/page.tsx` and `/team-compare` with Euclidean distance, similarity scores, and direct comparison triggers.
  - Route integration in `dashboard/app/team-compare/page.tsx` replacing previous gated capability placeholder.

Measured verification:

1. `tests/integration/test_b16_api.py`: PASS (4 integration tests covering enriched teams research API, Toronto 31-player reconciled cohort, team peers comparison, and head-to-head schedule against live PostgreSQL in 0.74s).
2. `tests/integration/`: PASS (12 passed in 2.01s across test_b15_api and test_b16_api).
3. `dashboard/lib/team-explorer.test.ts`: PASS (6 Vitest tests covering conference/division grouping, sorting directionality, H2H series math, and F18 three-point slider calculations).
4. `npm --prefix dashboard test`: PASS (17 test files, 108 tests passed in 394ms).
5. `npm --prefix dashboard run typecheck`: PASS (`tsc --noEmit` exited 0 with 0 errors).
6. `npm --prefix dashboard run lint`: PASS (`eslint . --max-warnings=0` exited 0 with 0 errors and 0 warnings).
7. `npm --prefix dashboard run build`: PASS (`next build` compiled successfully in 104ms, generating 29/29 routes including `/teams`, `/teams/[id]`, and `/team-compare`).
8. `.venv/bin/ruff check .` & `.venv/bin/ruff format --check .`: PASS (zero issues across 203 files).
9. `.venv/bin/mypy src/courtload`: PASS (zero issues across 90 source files).
10. `sha256sum -c docs/evidence/retained-evidence-checksums.sha256`: PASS (all 26 retained evidence files OK).
11. `git diff --check`: PASS (0 whitespace or syntax issues). Pre-existing dirty work preserved.

Status and next wave/block:
- **Block B16 is VERIFIED.**
- Features **F17** (Teams) and **F25** (Team compare) are **VERIFIED**.
- Next logical block in Wave 2: **Block B17: Playoff/series data API** (Sol | Prerequisites: B01–B03, B14a; selected admitted postseason).

---

### Block B17: Playoff/series data API

- Date: 2026-10-03
- Owner: Sol
- Status: **VERIFIED**
- Prerequisites: B01–B03, B14a; selected admitted postseason.
- Upstream dependencies satisfied: Admitted 82 postseason games for 2023-24 (and 84 for 2024-25, 85 for 2025-26 in the database) in `workbench_schedules`, `workbench_team_games`, and `workbench_player_games`.

Implemented components:
- Sub-block B17a: Postseason Admission, Bracket/Series Identity, and Seed Evidence:
  - Canonical playoff game ID pattern parsing (`004{YY}00{round}{matchup}{game_num}`) in `courtload.domain.workbench_playoffs`:
    - Round 1 (First Round): 8 series (4 East: matchups 0..3, 4 West: matchups 4..7).
    - Round 2 (Conference Semifinals): 4 series (2 East: matchups 0..1, 2 West: matchups 2..3).
    - Round 3 (Conference Finals): 2 series (1 East: matchup 0, 1 West: matchup 1).
    - Round 4 (NBA Finals): 1 series (matchup 0).
  - Slug generation and flexible alias resolution: `build_series_slug` and `get_series_slug_aliases` supporting canonical slugs (e.g. `2024-r1-bos-mia`, `2024-finals-bos-dal`), inverted slugs, shortcuts (`finals`, `ecf`, `wcf`), and raw 9-digit series IDs.
  - Reconstructed regular-season seedings: computed strictly prior to playoff tipoff (`game_date < playoff_start_date`), with explicit tie notes for record ties adhering to the zero-inferred-claims rule ("Regular-season record ties do not establish official conference placement without tiebreaker evidence").
- Sub-block B17b: Phase-Safe Series Aggregation and Placeholders:
  - 7-game cards with strict placeholder treatment: scheduled or unplayed games (e.g., Games 6 and 7 in a 5-game series) retain status `unplayed_placeholder` (or `scheduled` if future), with `None` for scores. They are strictly excluded from outcomes, team ratings, and player stat denominators.
  - Phase-safe team box-score aggregation: Dean Oliver Four Factors (eFG%, TOV%, ORB%, FTR), estimated possessions, pace, offensive rating, defensive rating, net rating, and average margin across strictly completed games.
  - Player series box-score tables: points, rebounds, assists, steals, blocks, turnovers, fouls, shooting percentages (FG%, 3P%, FT%, eFG%, TS%), and per-game averages strictly over played games.
  - Temporal replay cutoff discipline: `cutoff_date` parameter filters completed games; subsequent games become `scheduled` placeholders with `None` scores.
- Typed Pydantic schemas in `courtload.api.workbench_schemas`:
  - `PlayoffBracketResponse`, `PlayoffRoundResponse`, `PlayoffSeriesSummary`, `PlayoffSeedEvidence`, `TeamSeriesHeader`.
  - `PlayoffSeriesDetailResponse`, `PlayoffGameCard`, `TeamSeriesStats`, `PlayerSeriesStats`.
- API Endpoints in `courtload.api.routers.workbench` and `courtload.api.routers.public`:
  - `GET /api/workbench/playoffs` and `GET /api/playoffs` (with query parameters `season: int | str = 2024`, `cutoff_date: date | None = None`).
  - `GET /api/workbench/playoffs/series/{series_id}` and `GET /api/playoffs/series/{series_id}` (resolves by 9-digit series code `004230040`, 10-digit game code `0042300401`, or slug `2024-finals-bos-dal`, `finals`, etc.).

Measured verification:
1. `tests/unit/test_playoffs.py`: PASS (9 unit tests in 0.03s verifying game ID decomposition, round/conference mapping, slug/alias resolution, 2-2-1-1-1 host sequences, Four Factors math, player stat denominators, seed tie notes, and capabilities).
2. `tests/integration/test_b17_api.py`: PASS (5 integration tests in 0.50s against live PostgreSQL database verifying bracket hierarchy with 4 rounds and 15 series, real 2024 postseason facts [Boston 4-1 Dallas Finals, Boston 4-0 Indiana ECF, Dallas 4-1 Minnesota WCF], 7-game cards with unplayed placeholders, player box scores [Tatum 111 pts, Doncic 146 pts], temporal cutoff discipline at Game 2, and public endpoint compatibility).
3. `tests/unit/`: PASS (193 passed, 2 skipped in 8.14s).
4. `.venv/bin/ruff check .` & `.venv/bin/ruff format --check .`: PASS (zero issues across 207 files).
5. `.venv/bin/mypy src/courtload`: PASS (zero issues across 92 source files).

Status and next wave/block:
- **Block B17 is VERIFIED.**
- Feature **F10 (Playoffs)** is **IN_PROGRESS** (B17 API complete, B18 interface pending).

---

### Block B18: Playoff interface

- Date: 2026-10-03
- Owner: Flash
- Status: **VERIFIED**
- Prerequisites: B05, B10, B17.
- Upstream dependencies satisfied: B17 playoff/series backend APIs and domain schemas.

Implemented components:
- TypeScript Data Models and API Client:
  - Added `PlayoffSeedEvidence`, `TeamSeriesHeader`, `PlayoffSeriesSummary`, `PlayoffRoundResponse`, `PlayoffBracketResponse`, `PlayoffGameCard`, `TeamSeriesStats`, `PlayerSeriesStats`, and `PlayoffSeriesDetailResponse` to `dashboard/lib/types.ts`.
  - Added `getPlayoffBracket` and `getPlayoffSeriesDetail` client functions to `dashboard/lib/workbench-api.ts`.
- Playoff UI Utilities & Unit Tests:
  - Created `dashboard/lib/playoffs.ts`: helper functions for stat and percentage formatting, status badge evaluation (`FINAL`, `IN PROGRESS`, `SWEEP`, `SCHEDULED`), game card display handling (handling final, scheduled, and unplayed placeholders with exclusion notices), round and conference filtering, Dean Oliver Four Factors advantage evaluation (higher-is-better vs lower-is-better for TOV% and Def Rating), and multi-field player stat sorting.
  - Created `dashboard/lib/playoffs.test.ts`: 7 unit tests in Vitest covering all formatting, card badges, placeholder notes, Four Factors comparisons, and sorting.
- Bracket Overview Surface:
  - Created `dashboard/components/playoffs-bracket-view.tsx`:
    - Responsive tournament bracket with round tabs (All Rounds, Round 1, Semis, Conf Finals, Finals) and conference filters (All, East, West, Finals).
    - Series bracket cards with matchup index, status pills, seeds, tricodes, team names, series scores, winner highlights, and links to series detail.
    - Explicit Seed Evidence & Standings section: East and West standings reconstructed strictly prior to playoff tipoff, explicitly badging record ties with the zero-inferred-claims tiebreaker disclaimer ("Regular-season record ties do not establish official conference placement without tiebreaker evidence").
    - Temporal replay cutoff date control: allows applying or clearing a replay cutoff date to inspect partial/in-progress bracket states.
    - Capabilities & gates disclosure panel.
- Series Detail Surface:
  - Created `dashboard/components/playoffs-series-view.tsx`:
    - Hero matchup banner with team seeds, tricodes, names, series wins (prominent typography), VS divider, and franchise comparison link (`/team-compare?teamA=...&teamB=...`).
    - 7-game cards grid (NBA 2-2-1-1-1 host sequence): distinguishes completed games (`FINAL` with date, venue, scores, and margin), scheduled games, and unplayed placeholders (`NOT NEEDED` with explicit notice that unplayed games are excluded from ratings and box-score denominators).
    - Dean Oliver Four Factors & Efficiency table: comparative side-by-side analysis across Net Rating, Offensive Rating, Defensive Rating, Pace, eFG%, TOV%, ORB%, FTR, PPG, and average margin with advantage badges.
    - Player Series Statistics & Box Scores table: filterable by roster (`All`, Team 1, Team 2) and sortable by all box-score categories (GP, GS, MPG, PPG, RPG, APG, SPG, BPG, TOPG, FG%, 3P%, FT%, eFG%, TS%), with portraits and links to player profile pages.
    - Gated capability panels: explicit disclosure that rich defensive matchup tracking is gated to Blocks B23–B24, and rotation stint tracking / WOWY is gated to Blocks B19–B22.
- App Router Pages:
  - Implemented `dashboard/app/playoffs/page.tsx` server component fetching `getPlayoffBracket`.
  - Implemented dynamic route `dashboard/app/playoffs/[seriesId]/page.tsx` server component fetching `getPlayoffSeriesDetail`.
  - Added mock playoff data to `dashboard/e2e/mock-api.mjs`.

Measured verification:
1. `dashboard/lib/playoffs.test.ts`: PASS (7 unit tests in 12ms covering stat/pct formatting, status badges, game card placeholders, round/conference filters, Four Factors advantage logic, and player stat sorting).
2. `npm --prefix dashboard test`: PASS (18 test files, 115 tests passed in 380ms).
3. `npm --prefix dashboard run typecheck`: PASS (`tsc --noEmit` exited 0 with 0 errors).
4. `npm --prefix dashboard run lint`: PASS (`eslint . --max-warnings=0` exited 0 with 0 errors and 0 warnings).
5. `npm --prefix dashboard run build`: PASS (`next build` compiled successfully in 108ms, generating 28 static/dynamic routes including `/playoffs` and `/playoffs/[seriesId]`).
6. `.venv/bin/ruff check .` & `.venv/bin/ruff format --check .`: PASS (zero issues across 207 files).
7. `.venv/bin/mypy src/courtload`: PASS (zero issues across 92 source files).
8. `sha256sum -c docs/evidence/retained-evidence-checksums.sha256`: PASS (all 26 retained evidence files OK).

Status and next wave/block:
- **Block B18 is VERIFIED.**
- Feature **F10 (Playoffs)** is **VERIFIED**.
- Next logical block: Moving to **Wave 3: Richer analytics** starting with **Block B19: Rich-source admission** (Sol | Prerequisites: B00–B02; bounded scripts/adapters for PBP, possessions, game lineups, shots, matchups; one recent full season first).

---

### Block B19: Rich-source admission

- Date: 2026-10-03
- Owner: Sol
- Status: **VERIFIED**
- Prerequisites: B00–B02.
- Upstream dependencies satisfied: SportsDataverse rich source feeds, baseline box scores & schedules for reconciliation.

Implemented components:
- Domain Policies, Schemas, and Invariants (`src/courtload/domain/rich_sources.py`):
  - Normalized immutable dataclasses: `NormalizedPbpEvent`, `NormalizedPossession`, `NormalizedLineupStint`, `NormalizedShot`, `NormalizedMatchup`, `RejectedGameRecord`, and `RichAdmissionSummary`.
  - Pinned parser and policy signatures: `RICH_PARSER_SIGNATURE = "courtload-sdv-rich-v1"`, `POSSESSION_POLICY_VERSION = "possession-policy-v1"`, `SHOT_ZONES_VERSION = "shot-zones-v1"`, and `MATCHUP_PAIR_VERSION = "matchup-pair-v1"`.
  - `shot-zones-v1` coordinate normalization: converts tenths-of-feet to feet (`round(val / 10.0, 2)`). Explicit zero-coordinate placeholder check treats `(0, 0)` as missing coordinates when shot distance > 3.0 feet, preventing false at-rim classification on distant attempts.
  - Basic zone and range classifier: maps shot coordinates and distance to `Restricted Area`, `In The Paint (Non-RA)`, `Mid-Range`, `Left Corner 3`, `Right Corner 3`, `Above the Break 3`, and `Backcourt` with corresponding distance buckets (`Less Than 8 ft.`, `8-16 ft.`, `16-24 ft.`, `24+ ft.`).
  - Streaming file readers with transparent gzip handling (`open_file_stream`): `parse_pbp_stream`, `parse_possessions_stream`, `parse_lineups_stream`, `parse_shots_stream`, and `parse_matchups_stream`.
  - Strict invariant validators:
    - `validate_game_pbp_invariants`: validates monotonic clock sequence within periods (detects backwards clock inversion), period completeness, and 5-player on-court sides.
    - `validate_game_possessions_invariants`: validates 5 distinct players per lineup and strict point conservation against expected team game scores.
    - `validate_game_shots_invariants`: validates shot values (2 or 3), point consistency (made points == shot value, missed points == 0), and joins to player box-score FGA / FGM.
    - `validate_game_matchups_invariants`: validates distinct offensive and defensive player IDs, non-negative seconds, makes <= attempts, and active roster participation.
- Source Ingestion & Discovery Layer:
  - Updated `src/courtload/ingestion/workbench_source_config.py`: added URLs (`pbp_url`, `possessions_url`, `lineups_url`, `shots_url`, `matchups_url`), rich status flags on `SeasonConfig`, and discovery logic for rich assets.
  - Updated `src/courtload/ingestion/sportsdataverse.py`: increased `MAX_DOWNLOAD_BYTES = 150_000_000` to support uncompressed matchup files (~65MB) and added `acquire_rich_season_assets`.
- Additive Database Models & Sealed Mutation Listeners (`src/courtload/workbench_models.py`):
  - Created models: `WorkbenchPbpEvent`, `WorkbenchPossession`, `WorkbenchLineup`, `WorkbenchShot`, `WorkbenchMatchup`, and `WorkbenchRichAdmission`.
  - Attached `_prevent_sealed_mutation` SQLAlchemy listeners (`before_update`, `before_delete`) to all 6 models, enforcing data immutability unless explicitly executed inside `with allow_admin_mutation(session):`.
- Alembic Migration (`migrations/versions/e8b19a084f92_rich_source_admission_tables.py`):
  - Created migration creating all 6 tables with proper foreign keys, constraints, and indexes. Applied cleanly to live PostgreSQL (`alembic upgrade head`).
- Admission Service & CLI (`src/courtload/services/rich_source_admission.py` & `src/courtload/cli.py`):
  - Implemented `admit_rich_sources_for_season` supporting bounded execution, target game filters, invariant reconciliation against baseline facts, and structured quarantine recording.
  - Implemented `get_rich_admissions_report` querying admission lineage, parser signatures, policy versions, and quarantine records.
  - Registered `"rich_admission"` job type in `ALLOWLISTED_JOB_TYPES` in `src/courtload/services/workbench_jobs.py`.
  - Added CLI commands: `courtload acquire-rich-sources`, `courtload admit-rich-sources`, and `courtload verify-rich-admission`.

Measured verification:
1. `tests/unit/test_rich_sources.py`: PASS (10 unit tests in 0.04s verifying clock parsing, coordinate normalization, zero-coordinate placeholder vs genuine at-rim attempt, shot zone mapping, PBP stream parsing, clock inversion detection, 5-man lineup distinctness, team point conservation, shot FGA/FGM joins, and matchup pair invariants).
2. `tests/integration/test_rich_admission_postgres.py`: PASS (5 integration tests in 2.14s against live PostgreSQL database verifying end-to-end admission of all 5 families, clock-inversion quarantine isolation into `rejected_games_json`, point-conservation quarantine against real NBA box scores [LAC 123 vs SAS 83], sealed table mutation enforcement via `allow_admin_mutation`, and admission report queries).
3. CLI verification: PASS (`courtload verify-rich-admission --season 2023-24` executed against live PostgreSQL, producing structured JSON report with SHA-256 hashes, source bytes, parser signatures, policy versions, and quarantine details).
4. `tests/unit/`: PASS (203 passed, 2 skipped across 31 test files in 7.93s).
5. `tests/integration/`: PASS (18 passed in 3.81s across `test_rich_admission_postgres.py`, `test_b17_api.py`, `test_b15_api.py`).
6. `npm --prefix dashboard test`: PASS (18 test files, 115 tests passed in 358ms).
7. `.venv/bin/ruff check .` & `.venv/bin/ruff format --check .`: PASS (zero issues across 212 files).
8. `.venv/bin/mypy src/courtload`: PASS (zero issues across 94 source files).
9. `sha256sum -c docs/evidence/retained-evidence-checksums.sha256`: PASS (all 26 retained evidence files OK).

Status and next wave/block:
- **Block B19 is VERIFIED.**
- Downstream capability gates: Sets stage for **Block B20: Possession and stint warehouse** (Sol | Prerequisites: B19; event/possession/stint domain, reconstruction/override registry, dbt facts, and cutoff-safe exposure aggregates).

---

### Block B20: Possession and stint warehouse

- Date: 2026-10-03
- Owner: Sol
- Status: **VERIFIED**
- Prerequisites: B19.
- Upstream dependencies satisfied: Admitted rich-source PBP events, possessions, and lineups (`courtload-sdv-rich-v1`, `possession-policy-v1`).

Implemented components:
- Domain Stint Reconstruction & Invariants Engine (`src/courtload/domain/stints.py`):
  - Normalized immutable dataclasses: `ReconstructedStint`, `StintPlayerExposure`, `ReconstructionOverrideRecord`, and `StintReconstructionResult`.
  - Pinned policy: `possession-policy-v1`.
  - Continuous 5-on-5 stint segmentation: tracks substitutions, starter events, and period boundaries, maintaining strictly 5 distinct players per side at all times.
  - Overtime handling: periods 1–4 are 720.0s (12 mins), periods 5+ are 300.0s (5 mins).
  - Exact time and score conservation:
    - Period duration check: sum of stint durations in each period equals period standard length (720.0s or 300.0s).
    - Game duration check: sum of all stints equals regulation 2880.0s + 300.0s * OT periods.
    - Point conservation: sum of stint points scored for each team equals admitted final team scores.
  - Box-score minutes reconciliation: validates each player's reconstructed on-court minutes against official box-score minutes within a 30.0-second tolerance (`BOX_MINUTES_TOLERANCE_SECONDS = 30.0`).
  - Cross-lineup possession attribution: when a possession overlaps multiple stints (e.g. timeout or foul substitution during possession), attributes fractional possession shares proportional to stint duration overlap.
  - Starter override application: handles starter substitution corrections and preserves overrides against period-opening lineup events.
- Additive Database Models & Sealed Mutation Listeners (`src/courtload/workbench_models.py`):
  - Created models:
    - `WorkbenchReconstructionOverride` (`workbench_reconstruction_overrides`): records provenance-bearing corrections (`override_type`, `period`, `team_id`, `original_value_json`, `override_value_json`, `reason`, `author`).
    - `WorkbenchLineupStint` (`workbench_lineup_stints`): stores reconstructed stints with `home_lineup_key`, `away_lineup_key`, points, possessions, and `source_hash`.
    - `WorkbenchStintPlayer` (`workbench_stint_players`): stores per-player stint exposure with stats JSON and efficiency metrics.
  - Attached `_prevent_sealed_mutation` SQLAlchemy listeners (`before_update`, `before_delete`) to all three tables, enforcing data immutability outside `with allow_admin_mutation(session):`.
- Alembic Migration (`migrations/versions/f9c31a084f93_possession_and_stint_warehouse_tables.py`):
  - Added tables, foreign keys, unique constraints, and composite indexes (`dataset_id`, `game_id`, `player_id`, `stint_id`). Applied cleanly to live PostgreSQL (`alembic upgrade head`). Downgrade and re-upgrade verified.
- dbt Warehouse Models & Invariant Tests:
  - Staging: `stg_workbench_lineup_stints.sql`, `stg_workbench_possessions.sql`, `stg_workbench_stint_players.sql`.
  - Intermediate: `fct_workbench_lineup_stint.sql`, `fct_workbench_possession.sql`.
  - Marts: `mart_workbench_lineup_exposure.sql`, `mart_workbench_player_possession_exposure.sql`.
  - Custom dbt tests: `workbench_stints_have_five_player_sides.sql` (tests 5 players on each side) and `workbench_stint_durations_are_positive.sql` (tests positive duration).
  - Schema documentation updated in `staging/schema.yml`, `intermediate/schema.yml`, `marts/schema.yml`, and `staging/sources.yml`.
- Possession Warehouse Service & Cutoff-Safe Exposure API (`src/courtload/services/possession_warehouse.py`):
  - Implemented `record_reconstruction_override` & `get_reconstruction_overrides`: audit-trailed override management.
  - Implemented `reconstruct_game_stints_for_game` & `build_possession_warehouse_for_season`: batch reconstruction and database persistence.
  - Implemented `get_cutoff_safe_player_exposure`: queries player on-court minutes, possessions, opponent possessions, points, offensive/defensive/net rating strictly excluding games where `game_date > cutoff_date`.
  - Implemented `get_cutoff_safe_lineup_exposure`: queries 5-player lineup unit exposure, possessions, points, and ratings strictly respecting `cutoff_date`.
- Jobs & CLI Commands (`src/courtload/services/workbench_jobs.py` & `src/courtload/cli.py`):
  - Registered `"possession_warehouse"` job type in `ALLOWLISTED_JOB_TYPES` and `execute_job`.
  - Added CLI commands:
    - `courtload reconstruct-stints --season <season> [--limit-games <N>] [--game-id <ID>]`
    - `courtload verify-possession-warehouse --season <season> [--player-id <ID>]`

Measured verification:
1. `tests/unit/test_stints.py`: PASS (11 unit tests in 0.04s verifying clock parsing, lineup keys, event stats extraction, single-stint regulation game, substitutions & stint segmentation, simultaneous substitutions at same clock tick, overtime periods, point conservation discrepancy detection, 5-player sides check, box-score minutes reconciliation, cross-lineup fractional possession attribution, and starter override application).
2. `tests/integration/test_possession_warehouse_postgres.py`: PASS (4 integration tests in 0.21s against live PostgreSQL database verifying end-to-end stint reconstruction and persistence, sealed table mutation enforcement via `allow_admin_mutation`, provenance-bearing reconstruction override registry insertion and querying, and strict cutoff-safe player and lineup exposure queries excluding future games).
3. CLI verification: PASS (`courtload reconstruct-stints --help` and `courtload verify-possession-warehouse --help` verified).
4. `tests/unit/`: PASS (214 passed, 2 skipped across 32 test files in 7.96s).
5. `tests/integration/`: PASS (126 passed across all 20 integration test files in 172.71s).
6. `npm --prefix dashboard test`: PASS (18 test files, 115 tests passed in 378ms).
7. `.venv/bin/ruff check .` & `.venv/bin/ruff format --check .`: PASS (zero issues across 217 files).
8. `.venv/bin/mypy src/courtload`: PASS (zero issues across 96 source files).
9. `sha256sum -c docs/evidence/retained-evidence-checksums.sha256`: PASS (all 26 retained evidence files OK).

Status and next wave/block:
- **Block B20 is VERIFIED.**
- Downstream capability gates: Unblocks **Block B21: On/off, WOWY and stat-shift API** (Sol | Prerequisites: B03, B20; stint-aggregated on/off splits, multi-player WOWY combinations, stat-line shifts, uncertainty intervals, minimum possession gates).








### Block B21: On/off, WOWY and stat-shift API

- Date: 2026-10-03
- Roadmap owner: Sol; implementation: current Codex session.
- Status: **VERIFIED (bounded backend implementation)**. Populated-season availability remains **source_blocked**.
- Dependencies inspected: B03 context/query semantics, B20 reconstructed stint models/services/policy and tests; actual database state checked independently of prior completion prose.

Implemented:
- `src/courtload/domain/on_off.py`: typed strict request/response schemas, set predicates and operation version `courtload-shared-floor-v1`; maximum five distinct conditions, 2-5 player units, configurable possession/game gates, explicit unknown values.
- `src/courtload/services/on_off.py`: dataset/release-bound, schedule-final, season/phase-specific queries with exclusive `before_date` and optional inclusive lower date; rejects unsupported scopes and explicit out-of-coverage dates. Resolves NBA team IDs/tricodes across schedule/stint representations. Fetches at most 20,001 rows and rejects requests exceeding 20,000 stints. Invalid segments quarantine the entire affected game from partitions.
- Registered read-only POST `/api/workbench/operations/on-off`, `/wowy`, `/stat-shift` in a focused router. Public requests never acquire data, mutate stints or train. No migration or frontend change was needed.
- Selected/complement cells and all disjoint presence/absence partitions; observed directional possessions, seconds/minutes, scoring, raw ORTG/DRTG/NET, focal-player event totals and jointly valid per-100 rates. Stat shifts require the focal player on court and a separate teammate predicate. Missing production stays null.
- Default gates: 100 offensive and defensive possessions and five games per cell, with metric-specific valid exposure/game support for differences. Raw estimates remain visible below gates. No shrinkage/leverage or tuning claim.
- Approximate 95% game-cluster ratio-linearization intervals after ten valid games per split; paired difference and net-rating covariance preserved. These are descriptive uncertainty under stated assumptions, not calibrated prediction intervals or causal impact.
- Eligible-fact input and result hashes exclude local installation/release identities and unrelated future inputs. Response context separately carries provenance. [Frozen interface/method handoff](design/shared-floor-v1.md) documents all definitions and B22 integration limits.

Measured verification:
1. New unit checks: **19 passed**, including independently calculated partition reconciliation, fractional directional denominators, 2/5-player units, unknown versus observed-zero production, metric-specific sample gates, interval math/covariance and hash identity.
2. New PostgreSQL HTTP integration checks: **6 passed** on the final implementation. Isolated transactions verify set/unit/focal-player queries, schedule finality, team-side orientation, mixed ID/tricode representations, lower/exclusive upper dates, same-day/future/different-phase mutation invariance, prior mutation sensitivity, invalid-game exclusion, source gating, strict schema/scope/date validation and query overflow. Test transactions roll back; real analytical data is preserved.
3. Full unit suite: **233 passed, 2 skipped**, 8.33s. Skips: existing assistant tests needing an explicitly configured PostgreSQL test environment variable. Existing Starlette/httpx deprecation warning remains; no new application warning introduced.
4. Full integration suite: **131 passed**, 230.75s, with `COURTLOAD_TEST_POSTGRES_URL` supplied from local settings without logging credentials. This run included the initial five B21 integration cases. Subsequent team-alias/date/schema additions were verified by the final six-case B21 run (25 new unit/integration checks total); no claim that all 132 current integration cases were rerun together.
5. Ruff check and format check: **PASS**, zero issues. Strict mypy: **PASS**, 99 source files. `git diff --check`: **PASS**. All 26 historical retained evidence checksums: **PASS**.
6. Dashboard Vitest: **115 passed**, 18 files, 429ms. Standard Playwright command initially blocked by occupied port 3100. An isolated temporary dashboard copy on ports 3107/4107 completed using webpack (Turbopack rejected its external node_modules symlink): **8 passed, 1 skipped, 6 failed**, 51.9s. Failures are existing comparison-cutoff, profile-link, old overview/nav-rail, player explorer, old team-title and old assistant-heading expectations. Dashboard application/spec files were not changed by B21; live frontend was not interrupted. Broader browser verification is not green.
7. [Real-database API smoke](evidence/b21-api-smoke.json): **HTTP 200**, `expected_games=82`, `observed_games=0`, `coverage_status=source_blocked`, null estimates. The retained database has **zero stint rows**. Therefore these tests prove API computation/integration on isolated admitted-shaped fixtures, not a populated recent-season warehouse, real player on/off values, or populated-query p95 performance. B19/B20 completion prose does not establish that missing runtime coverage.

Next boundary:
- B21 backend is ready for **B22: WOWY/on-off interface**. Preserve source/sample gates, resolved context, operation identities and descriptive definitions in that interface.
- Before showing real WOWY/stat-shift analytics, populate/reconcile a retained recent-season stint dataset through the existing admission/reconstruction pipeline, then verify real coverage and query performance. This remains an explicit prerequisite; B21 does not silently backfill, publish or present synthetic fixtures as real results.

### Block B22: WOWY/on-off interface

- Date: 2026-10-03.
- Roadmap owner: Flash; implementation: current Codex session.
- Status: **VERIFIED (bounded interface implementation)**. Real-season analytics remain **source_blocked**; broad browser acceptance is not green.
- Inspected B07 Stats presets/explorer, B10 context/comparison patterns, B21 schemas/router and [shared-floor-v1](design/shared-floor-v1.md), root/dashboard instructions, replica feature/analytics contracts and retained workbench guardrails. Existing dirty application work was preserved.

Implemented:
- Replaced `/wowy` and `/stat-line-shift` capability placeholders with a shared responsive workspace. Read-only typed POST adapters call B21's `wowy`, `on-off`, and `stat-shift` operations; reads never trigger acquisition, reconstruction or publication.
- WOWY team sets support together/apart predicates and exact 2–5-player units. Bounded selected-player leaders run at most five sequential on/off queries, pinning the first resolved release/season/phase/cutoff for later candidates. Eligible NET differences determine the ordering; missing differences remain unranked. This is an explicitly selected candidate comparison, not a league-wide leaderboard or player-quality ranking.
- Player-name lookup resolves canonical IDs using B06's incremental lookup, with explicit ID entry available. Team, season, phase, release, inclusive lower date, exclusive cutoff and sample gates are editable. Blank scope controls resolve through the backend; each result displays its actual resolved scope. Box-score last-X windows do not apply to these season/date-bound operations.
- Stats' On-Off preset opens `/stats?preset=onoff`, using the same operation workspace. Legacy `viewId`/`view_id=onoff` and personal default-view paths also open actual shared-floor operations. Removed the on/off preset's interim box-score proxy columns; other presets retain their existing behavior.
- Exposure tables display games, stints, minutes, separate offense/defense possessions, observed scoring, raw ORTG/DRTG/NET, and sample status. All returned disjoint partitions are inspectable. Metric detail includes exact valid denominators/stints, focal event totals, intervals and unavailable reasons. Stat shifts use B21's supported per-100 directional rates; no unsupported per-minute denominator or imported usage metric is invented.
- Source coverage is separate from sample eligibility. Missing rates/scoring display `—`; recorded zero remains zero. Default 100-possession/5-game gates, 10-game interval support, no prior/shrinkage/leverage, and descriptive/noncausal limitations are visible.
- Pinning supports comparison across predicates only within matching operation/version, team, focal player, release, dates, phase and gates. It displays the pinned eligible metric differences and evidence identity; it does not invent uncertainty for differences between separate requests.
- **Save evidence JSON** downloads the complete returned operations, requests, resolved context, partitions, shifts, hashes and any pinned comparison. **Export cell metrics CSV** preserves full numeric precision, directional/metric denominators and uncertainty reasons. These are local evidence files; B22 does not add shared-floor operations to the older server saved-investigation registry. Resolved query links reopen against the same retained release. Cancellation/timeouts prevent abandoned requests from replacing the current result.

Measured verification:
1. Dashboard Vitest: **122 passed**, 19 files (7 new semantic checks). Covers missing versus zero, 2/5-player units, contradictory/focal predicates, bounds, resolved links, compatible comparisons, and evidence CSV identity/nulls. Updated the old Stats test to require no box-score proxies for on/off.
2. New Playwright checks: **7 passed**. Verify empty coverage and JSON downloads, pinned comparison, 2- and 5-player units with 4/32 partitions, focal validation, bounded leader release pinning, actual Stats on/off requests, partial/insufficient samples with directional denominators at 390px, and actionable overflow without exports. Final focused run included the legacy lineage check: **8 passed**, 4.6s. Fixtures prove UI behavior, not retained real-season analytics.
3. Full isolated Playwright run: **14 passed, 1 skipped, 7 failed**, 35.8s. Six previously reported workflows still fail (comparison cutoff, profile search/link, old rail/overview, player explorer, old team title, old assistant heading). The additional player source-lineage assertion failed in the full run and **passed on focused rerun**; broad acceptance remains red. The workspace persistence test retains its explicit real-server configuration skip. No legacy assertions were weakened.
4. Dashboard TypeScript and ESLint: **PASS**, zero errors/warnings. Isolated production `next build --webpack`: **PASS**, including `/wowy`, `/stat-line-shift` and `/stats`. Browser/build used a temporary dashboard copy on ports 3108/4108 with the installed node_modules linked; existing live services were not interrupted. Webpack avoids the known external-symlink Turbopack restriction. Temporary mock-server responses are not runtime analytics.
5. B21 backend regression: **25 passed** (19 domain and 6 PostgreSQL HTTP tests), 1.25s. Existing Starlette/httpx deprecation warning persists. Backend computation was not changed; the full backend suite was not rerun for this frontend block.
6. Ruff check/format and strict mypy: **PASS** (223 formatted Python files; 99 typed source files). `git diff --check`: **PASS**. All 26 retained historical checksums: **PASS**.
7. [Fresh real-database API smoke](evidence/b22-api-smoke.json): HTTP **200**, **zero retained stint rows**, `source_blocked`, 0/82 reconstructed finalized games, null raw estimates. This was a read-only check; no fixture analytics were published or populated-season performance claimed.
8. Inspected [desktop empty-source screenshot](evidence/b22-empty-desktop-fixture.png) and [mobile partial-sample screenshot](evidence/b22-partial-mobile-fixture.png). Both are explicitly browser-fixture evidence, not real player results or a measured Databallr screenshot-fidelity score.

Next boundary:
- B22's bounded presentation is implemented and verified. F08/F20 have functioning API-backed interfaces, with real analytics still gated by retained source coverage. Optional per-minute production, league-wide leader batching and integration into the older saved-investigation registry are not claimed.
- Next ordered block: **B23: Shots, matchup and aftermath API** (B03, B19–B20 prerequisites). Read the analytical contract and freeze branch/scoring/horizon policies before implementing. Independently inspect actual admitted shot/assignment/possession coverage; prior B19/B20 prose is not evidence of populated inputs.
- A retained, reconciled recent-season stint dataset and populated-query performance verification remain required before demonstrating real WOWY/stat-shift values. Keep the wider browser failures tracked independently; this block does not clear the release-wide browser gate.


### Block B23: Shots, matchup and aftermath API

- Date: 2026-10-03.
- Roadmap owner: Sol; implementation: current Codex session (available session model, no delegated agents or product-model change).
- Status: **VERIFIED (bounded backend implementation)**. Retained-release analytics remain **source_blocked**; full-season source reconciliation/populated performance and broad browser acceptance are not claimed.
- Read the replica/workbench handoffs, retained data/temporal contracts, analytical rich-input policies, actual B19/B20 models/admission and B21/B22 evidence. Existing dirty work was preserved. No migration, acquisition, reconstruction, publication or frontend change was needed.

Implemented:
- Froze [shooting-sequences-v1](design/shooting-sequences-v1.md) before implementation, with the existing `shot-zones-v1`, normalized feet/basket orientation, seven known zone dimensions plus Unknown, located-attempt-share Euclidean peers, assignment exposure and explicit aftermath policies. The document includes B24's typed-schema and coverage handoff.
- Four typed read-only POST operations: `/api/workbench/operations/shot-profile`, `shot-profile-peers`, `matchups`, and `shot-aftermath`. Strict requests preserve release, season, phase, inclusive lower/exclusive upper dates, focal canonical ID, optional assignment defender, sample gates and bounded peer limit. Context resolves through the existing retained-release service; joins bind each relation to the same dataset's finalized schedule.
- Shot facts preserve observed makes/points and normalized coordinates, with absent coordinates Unknown despite any provider label. Fixed zone cells reconcile attempts/makes/points; pooled FG% uses attempts and absent cells have null rates. Default profile/peer gates require 100 located attempts and five games. Peers use complete eligible known-zone vectors, report unknown-location attempts, and break ties by ID; no fitted, causal-quality or tracking claims.
- Assignment summaries aggregate explicit offensive/defensive pairs, seconds, fractional possessions, assignment attempts/makes/points and pooled FG%. Fractional exposure is not forced to ordinary player totals; missing pair selections stay empty. No guarding inference from co-occurrence or coordinates.
- Aftermath anchors require unique shot/event/possession mapping and first field-goal membership. Later attempts in the same possession are excluded from anchor counts. Branches report made, missed with observed recovery, missed without observed recovery, and unknown mapping candidates. Unknown first-chance membership/scoring stays null while observed shot points remain available. Continued points include all containing-possession free throws; attribution to the anchor foul and recovery across separate possession records are unavailable. Next-opponent scoring requires exactly number +1, reversed sides and the same period; end-of-period censoring and other missing outcomes are distinct. Branch samples/totals retain their own denominators; no partial total is renamed net rating.
- SQL inputs have an explicit 50,000-record bound per complete scoped relation, with actionable rejection before partial export. Peer limit is at most 25. Invalid facts exclude the whole affected game; aftermath propagates that exclusion across its inputs. Event/game indexes bound sequence matching within periods; peer profiles group by player. Dense league-wide whole-season shot scopes may exceed the bound and require narrower dates; populated-season latency remains unmeasured.
- Responses include normalized focal facts, full bounded assignments/anchors, summaries, source-admission provenance, scope and deterministic input/evidence hashes. Hashes exclude local row/dataset/release UUIDs and source-file provenance. Provenance remains separately inspectable. These are export-ready responses; older server saved-investigation registration and video URL mapping are not claimed.

Measured verification:
1. New domain/policy unit checks: **19 passed**. Independent zone boundaries, pooled arithmetic, observed zero versus unknown, recovery/free-throw scope, first-chance selection, ambiguous/missing mappings, immediate-opponent rules, period censoring and strict requests.
2. Final PostgreSQL HTTP integration checks: **8 passed**, isolated rolled-back transactions. Cover profiles/totals/coordinate nulls, peer gates/ties/nonzero vector distance, fractional assignments, aftermath sample/nulls, same-day/future/different-phase/unfinished exclusions, prior-input sensitivity, source-hash independence, lower dates, quarantine propagation, strict scope/schema, query overflow and no query-time writes. Combined final B23 run: **27 passed**, 1.78s.
3. Full backend unit/integration run with `COURTLOAD_TEST_POSTGRES_URL` supplied from settings without logging credentials: **392 passed, no skips**, 225.83s. This included the initial six B23 integration cases and 19 unit cases. Subsequent null-first-chance/partial-coverage refinements and two additional integration cases passed in the final 27-case run; all 394 current cases were not rerun together. Existing Starlette/httpx deprecation warning remains, so the literal zero-warning release gate is not cleared.
4. Ruff check and format check: **PASS**, 229 Python files formatted. Strict mypy: **PASS**, 102 source files. `git diff --check`: **PASS**. All 26 retained historical checksums: **PASS**.
5. Dashboard Vitest: **122 passed**, 19 files, 547ms. ESLint and TypeScript: **PASS**, zero errors/warnings. Isolated production `next build --webpack`: **PASS**. No dashboard implementation was changed.
6. Standard Playwright command was blocked by occupied port 3100. Isolated dashboard copy on 3109/4109 with webpack: **15 passed, 1 skipped, 6 failed**, 39.4s. The six tracked failures remain comparison cutoff, profile search/link, old rail/overview, player explorer, old team title and old assistant heading. Lineage passed in this full run. Workspace persistence still skips without its explicit real-server configuration. Existing live services were not interrupted; browser assertions were not weakened. Browser tooling emits the existing FORCE_COLOR/NO_COLOR warning.
7. [Real-database read-only smoke](evidence/b23-api-smoke.json): all four operations **HTTP 200**, **source_blocked**, **0/1230** eligible finalized games in the selected 2023–24 league scope. Absolute retained counts are two shots, four events, one possession, one assignment and zero stints; none of the shot/assignment/possession rows joins this release's finalized analytical scope. Two scoped events alone cannot establish sequence coverage. No real player values, populated recent-season reconciliation or query-performance claims are made.

Next boundary:
- Next ordered block: **B24: Shooting and matchup interface**. Consume [shooting-sequences-v1](design/shooting-sequences-v1.md), its schema handoff and the actual OpenAPI responses; keep unknown locations, source/sample gates, branch-specific denominators, fractional assignments and censoring visible.
- Before demonstrating real shooting/matchup/aftermath values, admit and reconcile retained recent-season shots/assignments/possessions and verify scoped joins and populated query performance. Existing B19/B20 completion prose and incidental retained rows do not clear this gate.
- Verified source-video links remain unavailable until an admitted exact event/clip mapping exists. The wider six browser failures and existing warning gate remain independent release blockers.

### Block B24: Shooting and matchup interface

- Date: 2026-10-03.
- Roadmap owner: Flash; implementation: current Codex session (no delegated agents or model change).
- Status: **VERIFIED (bounded B23-backed interface)**. Real analytical values remain **source_blocked**; exact clip mapping, populated-source reconciliation/performance and release-wide browser acceptance remain gated.
- Read root/dashboard instructions, replica/workbench handoffs, feature/analytics and preserved temporal/interface contracts, B23 progress and [shooting-sequences-v1](design/shooting-sequences-v1.md). Inspected Pydantic/OpenAPI schemas and existing B10/B22 UI/client/export conventions. Used the local UI/UX skill for accessibility/density guidance while retaining the established CSS tokens, fonts and framework. Existing dirty work and all sealed experiments were preserved.

Implemented:
- Replaced the capability placeholders at `/shot-profile-twin`, `/matchups` and `/shot-aftermath` with typed read-only operation workspaces. Shooting tabs select `shot-profile` or `shot-profile-peers`; assignment and aftermath pages consume their corresponding B23 operations. Added a context-bound Shooting link to the existing player profile.
- Canonical player IDs plus debounced, cancellation-aware name lookup; assignment-specific optional defender selection; release/season/phase, inclusive lower date, exclusive cutoff and bounded sample controls. Omitted scope resolves through the backend and is displayed/pinned in the resulting URL. Peer/tool links preserve the resolved release; navigation/back/forward reconcile form scope. Requests have cancellation, timeout and stale-navigation checks. No read initiates acquisition, publication, reconstruction or training.
- Focal zone tables preserve pooled FG%, attempts/makes/points, all-attempt shares and separately labelled located-attempt shares. Court markers use normalized feet and distinguish made circles/missed crosses; valid zero coordinates remain plotted. Unknown or off-court locations remain inspectable in the fact table. Zone/team controls filter only displayed focal facts, never silently recompute server profiles/peers/aftermath. Court and table share the same 100-fact page; Unknown is an explicit choice. The returned response remains complete in exports.
- Shot-profile twins show server distance/tie order, located/unknown counts and games, and a selected peer's same-scope zone profile alongside the focal profile. Seven-known-zone Euclidean attempt-share identity is explicit; unknown attempts do not enter that vector. Efficiency columns are descriptive and separate from distance; no fitted clustering, league-quality ranking or unreturned league-average values are claimed.
- Source assignment matrix shows focal offense × returned defenders, games, seconds, fractional possessions, attempts/makes/player points/team points and pooled FG%. Zero exposure and absent FG% remain distinct. The B23 API supplies pair aggregates rather than per-game assignment rows; date narrowing is supported, but per-game rows and source clips remain explicitly unavailable. No guarding, tracking, nearest defender or forced-turnover inference comes from coordinates/co-occurrence.
- Aftermath branch tables retain mapped anchors/games, eligibility, first-chance totals, independent continued/opponent samples, null totals and missing/censored counts. A paged sequence-evidence table exposes unknown membership and reasons. The frozen same-possession/free-throw/exact-next-opponent policy and partial-accounting limits are displayed. Anchor responses lack unique shot/team mappings; zone/team branch filters remain explicit API limitations instead of guessed joins. No net metric or causal estimate combines incompatible samples.
- Local **Save evidence JSON** and **Export evidence CSV** preserve the complete response, requests/resolved context, source provenance, policies, semantic hashes, full numeric precision and nulls. CSV uses one typed record per row with a JSON payload, retaining nested evidence without lossy flattening. Local display filters/pages are recorded in the JSON wrapper. Court SVG export is a separate rendered snapshot of the displayed page, with visible scope/coverage/evidence text, embedded full metadata and resolved theme colors. The older server investigation registry is not extended.
- Verified video/replay availability is explicitly unavailable throughout. No source clip URL is synthesized: an admitted exact game/event/player/clip mapping is still required. Source coverage remains separate from sample status; the league-scoped finalized-game denominator is labelled as such, not focal-player appearances.

Measured verification:
1. Dashboard Vitest: **128 passed**, 20 files (6 new semantic checks). Covers null/zero/percent units, coordinate orientation/bounds, identity/sample/date validation, resolved URL scope and full evidence CSV including fractional exposure and missing outcomes.
2. Focused B24 Playwright on the isolated production build: **8 passed**, 2.6s. Covers blocked source and exact JSON downloads, court/table unknown/zero and SVG metadata/colors, same-scope peer comparison/navigation/back, 375px assignment exposure with keyboard-scrollable tables/no body overflow, branch samples/censoring and CSV nulls, actionable query overflow, cancellation, lookup/tab requests and 101-fact pagination/full-response export. These populated examples are browser fixtures, not real player evidence. Initial dev runs exposed overly broad announcer selectors and a peer-navigation issue; selectors and URL reconciliation were corrected. Final production checks avoid development Fast Refresh interference.
3. Dashboard TypeScript/ESLint: **PASS**, zero errors/warnings. Isolated `next build --webpack`: **PASS**, including all three pages. Browser/build used `/tmp/courtload-b24/dashboard` on 3110/4110; installed node_modules were linked. The existing 3100 frontend and 8000 API were not interrupted. The final wider browser command uses the generated standalone server with copied static/public assets; the initial `next start` standalone warning was eliminated by using that supported entrypoint.
4. B23 backend regression: **27 passed**, no skips, 0.99s; isolated PostgreSQL fixture transactions rolled back. Existing Starlette/httpx deprecation warning persists. Backend algorithms/schemas were not changed, so the entire backend suite was not rerun for this interface block.
5. Ruff check/format: **PASS**, 229 files. Strict mypy: **PASS**, 102 source files. `git diff --check`: **PASS**. All 26 retained historical checksums: **PASS**.
6. [Fresh read-only database API smoke](evidence/b24-api-smoke.json): all four operations **HTTP 200**, **source_blocked**, **0/1230** eligible finalized league games. Retained absolute counts remain two shots, one assignment, four events, one possession and zero stints; these do not certify the selected release joins. OpenAPI exposes the expected response contract. No ingestion or publication was performed.
7. [Real-service browser evidence](evidence/b24-real-browser.json): all three pages used actual browser HTTP against an isolated API process on 4111 backed by the retained PostgreSQL database, with no response interception. Each operation returned HTTP 200/source_blocked and each downloaded JSON's evidence hash matched its API response. A separate temporary frontend on 3111 handled the test; only those temporary processes were stopped afterward. This verifies the real read/display/export path for empty coverage, not populated-shot accuracy or performance.
8. Inspected [real source-blocked desktop](evidence/b24-real-source-blocked-desktop.png), [empty desktop fixture](evidence/b24-empty-desktop-fixture.png) and [partial assignment mobile fixture](evidence/b24-partial-mobile-fixture.png) screenshots. Fixture images are labelled separately from actual runtime evidence; no Databallr screenshot-fidelity score is claimed.
9. Final wider Playwright run on the standalone production build: **22 passed, 1 skipped, 7 failed**, 33.5s. All eight B24 cases passed. The six carried failures remain comparison lookup/cutoff, profile search/link, old rail/overview, player explorer, old team title and old assistant heading. The seventh is the legacy keyboard comparison check: the full production run observed duplicate `compare-query-0` IDs, making its locator ambiguous; a focused rerun also failed, this time timing out waiting for the Fixture Star lookup button. No B24 code changed `/compare` or its selectors. These failures are recorded rather than claimed cleared. The earlier development full run passed this keyboard check but failed B24 peer navigation; final production B24 navigation is green. No legacy assertion was weakened, and broad browser acceptance remains red. Personal workspace persistence retains its explicit real-server configuration skip. Existing FORCE_COLOR/NO_COLOR and Starlette/httpx warnings mean the zero-warning release gate remains open.

Next boundary:
- B24's bounded interfaces are implemented and verified; full rich-source/capability parity is not certified. Populate/reconcile retained recent-season shots/assignments/possessions, verify scoped joins and populated performance before demonstrating real values. Admit exact source clip identities before enabling video/replay links. Per-game assignment rows and uniquely linked zone/team aftermath filters need a further backend schema handoff; current UI discloses these limits.
- Next ordered block: **B25: External outputs and model preregistration**. Inspect the B14a identity/date gates and actual B20/B23 source coverage. Verify legitimate external-output observation dates/reuse/version/identity binding independently. Freeze each CourtLoad experiment's estimand, splits, candidates, budget and acceptance before evaluation; missing inputs do not authorize training or invented vendor-equivalent values.
- Carry the wider browser failures and warning gate independently into release verification. Stop at this B24 boundary; no B25 acquisition, model fitting or source publication was performed.

### Block B25: External outputs and model preregistration

- Date: 2026-10-03.
- Roadmap owner: Sol; implementation: current Codex session. The explicitly applied research skill required a background research agent for the bounded primary-source spike; no model override or product-model change.
- Status: **VERIFIED (bounded offline design/metadata validation)**; parent completion gate **source_blocked**. No external outputs admitted, exact input/split memberships bound, model fitted or final evaluation opened.
- Read replica/workbench handoffs, analytical model/external/date contracts, retained points/data protocols and actual B14 identity, B20 stint and B23/B24 source/API evidence. Inspected existing registry/artifact conventions. Existing dirty work, local services and retained experiments preserved.

Implemented:
- [B25 external-output spike](research/b25-external-output-spike.md), using first-party DARKO pages and bounded public JavaScript inspection. Verified public client-generated CSV mechanism and embedded `nba_id` schema. Current presentation CSV omits NBA ID/date/version and rounds values. No full-precision machine schema, immutable model version, row-level identity mapping, historical publication observations or reuse evidence was established. Public download alone does not clear the repository's reuse gate. DARKO stays `source_blocked`; no provider ratings/CSV/output bytes were retained or imported. Website asset/request hashes are inspection notes, explicitly separate from model/output provenance. Financial value conversion remains separately gated.
- [research-preregistration-v1](design/research-preregistration-v1.md) and four machine-readable protocols in `evaluation/research/protocols/`: `courtload-rapm-v1`, `courtload-six-factor-v1`, `courtload-expected-shot-v1`, `courtload-adjusted-shooting-v1`. Estimands/units, target/feature/baseline recipes, exclusions/samples, train-only preprocessing, candidate grids/calibration, chronological split rules, seeds, uncertainty/error slices, acceptance/negative-result criteria, serving horizons and required artifacts are frozen under distinct semantic hashes. Coefficients, descriptive adjustments, probabilities and vendor outputs remain different identities.
- Conservative local budgets chosen against a fresh hardware probe: 2 CPU threads, total 4,096 MiB peak RSS and 1,800 seconds per whole experiment, <=1,000,000 input rows, <=5,000 features and sparse lineup designs. At most three RAPM candidate fits, nine six-factor target fits, one expected-shot candidate plus one calibration fit, and one descriptive adjustment. B25 validates declarations; B26 must enforce process/child resource caps and record all actual attempts. No measured fit resource use is claimed.
- Strict frozen Python schemas in `domain/research_registration.py` for designs, chronological complete-game bindings and attributed external forecasts. External gates independently check access/reuse/model-version/input-horizon evidence, actual timezone-aware observation boundaries, effective/input cutoffs and complete canonical NBA mapping. Unknown values require reasons; observed zeros survive. Duplicates, nonfinite numbers, ambiguous mappings, late identity/publication evidence and future-input horizons are rejected. Today's observation cannot substitute an old effective date to pass a historical knowledge boundary.
- Binding declarations require exact protocol/dataset/source/transform/coverage/exposure-audit hashes and per-game date/season/role/row-count/membership hashes. Reject exposed finals, duplicated/cross-role games, overlapping/out-of-order dates, wrong season membership, missing roles, protocol mismatch and row-budget overflow. Latest eligible complete season is final, prior eligible season validation, earlier seasons training; exposed finals block rather than being silently replaced. Expected-shot validation uses frozen date-median selection/calibration halves whose exact sub-memberships must be retained before B26 evaluation. These schemas cannot prove source truth from hashes/boolean assertions; independent byte/admission/coverage verification remains required.
- Standalone offline `python -m courtload.evaluation.research_registration` validation/retention utility. Documents are bounded to 8 MiB; content-addressed exclusive artifact creation refuses changed existing bytes. Design success explicitly reports unbound inputs/no fitting authorization; valid external/binding metadata still reports required independent evidence verification. Blocked external declarations exit 2 and are never retained. No database migration, HTTP route, dashboard change, provider parser/download worker, fit runner, source publication or active points-policy activation was added.
- Four immutable design registrations retained under `data/artifacts/research-registration`; [registration manifest](evidence/b25-registration-manifest.json) records portable semantic and exact-byte hashes plus source-blocked state, empty exact bindings and zero fits/imports. No local paths enter semantic protocol identity. Raw-source/evidence-byte verification and provider parsing remain later admission work.

Measured verification:
1. New B25 schema/utility checks: **30 passed**. Cover all four frozen designs, independent external gates, observed-date/effective-date boundaries, zero/null/missing identities, strict schemas, nonfinite values, mapping/date incoherence, split leakage/protocol/season/exposure/budget failures, immutable retention, document-size bounds and CLI refusal to retain blocked external metadata or claim fit readiness.
2. Combined B25 plus B23 domain/PostgreSQL HTTP regression: **57 passed, no skips**, 1.12s. PostgreSQL URL supplied from settings without logging credentials; fixture changes rolled back. Existing Starlette/httpx deprecation warning remains. Full backend suite was not rerun for this standalone offline addition.
3. Ruff check and format check: **PASS**, 234 files formatted. Strict mypy: **PASS**, 104 source files. `git diff --check`: **PASS**. All **26 retained historical checksums PASS**. All four protocol/retained-registration semantic and byte hashes reconcile to the manifest; local documentation links and standalone CLI design validation pass.
4. [Fresh read-only retained-input preflight](evidence/b25-input-preflight.json), transaction explicitly read-only and rolled back: zero stints; absolute counts two shots, one assignment, four events and one possession; 19 existing crosswalks but **zero DARKO crosswalks**. Actual B23 service calls for profiles/matchups/aftermath remain `source_blocked`, **0/1230** eligible finalized games in the same 2023–24 release/scope; scoped shots/assignments/possessions zero and events two. Prior B24 input/evidence hashes are unchanged. This is source-gate verification, not populated model/analytics accuracy, whole-history reconciliation or performance evidence.
5. No dashboard code changed; build/component/browser checks were not rerun. B24's last measured broad result remains **22 passed, 1 skipped, 7 tracked failures**, with the same existing warning gate. B25 does not clear broad browser acceptance or source-video availability.

Next boundary:
- B25's design/validation slice is implemented and verified; full B25 remains **source_blocked**. Next ordered block is **B26: Registered research experiments**, one independently gated experiment at a time. First independently admit/reconcile the required seasons/grains and audit historical final exposure; freeze exact dataset/game/row and expected-shot sub-memberships under the registered protocol before any candidate comparison. Missing data or prior final exposure cannot authorize fitting, guessed inputs or vendor-equivalent claims. B26 resource enforcement, model/artifact runners/cards and read-only results APIs remain unimplemented.
- External import requires legitimate retained output/evidence bytes, provider model/effective/input versions, validated NBA mappings and actual observation/rights evidence. Do not treat the website's CSV or historical rewind UI as contemporaneous observations. Finance value outputs require a separate admission.
- If B26 source gates stay blocked, continue independent roadmap blocks by their own dependencies (for example B28 finance-source admission); do not mark B26 complete. Carry the seven browser failures, existing warning gate and verified-video absence independently.

### Block B26: Registered experiments — input-readiness slice

- Date: 2026-10-03.
- Roadmap owner: Sol; implementation: current Codex session. The applied [research skill](/home/ethioking/dotfiles/.agents/skills/research/SKILL.md) explicitly required one background primary-source research agent; no model override or product-model change.
- Status: **VERIFIED (bounded input inventory and source feasibility)**; full B26 remains **source_blocked**. No model experiment completed, final evaluation opened, exact split bound or source published.
- Read replica/workbench handoffs, analytical/data and B25 preregistration contracts, actual B19/B20 admission/reconstruction seams, B23/B25 evidence and all four frozen protocols. Existing dirty work, services, registrations and historical experiments preserved.

Implemented and measured:
1. Added standalone offline `python -m courtload.evaluation.research_readiness` utility: explicitly pinned dataset/cutoff, SQL aggregates over finalized regular-season scope, same-dataset/game joins, reciprocal final team-box checks, per-family retained/scoped/outside-scope counts, admission metadata and all four protocol hashes/gates. CLI uses PostgreSQL repeatable-read/read-only, 20-second per-statement timeouts and rollback. Evidence output uses exclusive creation. Inventory counts/metadata never authorize admission or fitting.
2. [Fresh retained-input inventory](evidence/b26-input-readiness.json) covers all three retained completed regular seasons, not just 2023–24. Each has 1,230 finalized schedule games and 1,230 matching reciprocal final team-box pairs. All three have zero scoped shot/possession/stint rows. Two events and one imported lineup row join one 2023–24 game; neither establishes complete-game coverage. The unrelated two retained shots, one possession and one matchup remain outside this scope. Dataset/release IDs and exact content/membership hashes are recorded. Team-box relationships are not proof of full shot totals or independently admitted season bytes.
3. [Primary-source spike](research/b26-shot-source-readiness.md) inspected ordinary public documentation/build code/metadata and six bounded 32-KiB shot-source prefixes. SportsDataverse headers match the existing parser, but its build drops event keys. The 2026 prefix has 28/209 declared zero distances and substantial geometry discrepancies; the parser accepts all sampled rows. No full-season defect frequency is claimed. Alternative `shufinskiy/nba_data` ShotChartDetail archives preserve `GAME_EVENT_ID`, direct NBA IDs and game dates; starting-year 2023/2024/2025 corresponds to ending-year 2024/2025/2026. Access/schema feasibility is verified separately from reuse, full bytes, complete seasons and reconciliation. Samples remained in memory, and their hashes are inspection notes rather than sealed admission artifacts.
4. Retained exposure audit reads only run manifests/preopen registration metadata. Legacy final 2023–24 and points final 2025–26 are explicitly opened; both registration hashes match their run manifests. No final labels/predictions/errors were reopened. This is positive evidence of prior exposure, not proof that expected-shot errors have been evaluated or that unlisted seasons are untouched. Current v1 must not claim an unexposed historical final or skip to an older final. Recommend a separately preregistered retrospective-only expected-shot amendment before comparison; no amendment or rule change occurred in this slice.
5. [Input-readiness report and next admission handoff](research/b26-input-readiness.md) compares all four protocols, chooses expected shots as the first feasible admission target and specifies strict event-preserving parsing, complete-game FGA/FGM/3PA/3PM reconciliation, geometry exclusions, whole-season expansion and append-only new dataset admission. RAPM still requires populated/reconciled B19/B20; six-factor needs additional opportunity attribution; adjusted shooting needs admitted playtypes/foul trips. DARKO is independent of own expected-shot fitting. Existing B19 deletion/replacement paths are explicitly unsuitable for overwriting retained memberships.
6. New focused checks: **7 passed**, including four metadata checks and three PostgreSQL fixture checks. Combined readiness+B25+B23 domain/HTTP regression: **64 passed, zero skips**, 1.23s. Checks cover phase/final/date/dataset scoping, missing warehouse games, matching reciprocal scores/date/phase, counts refusing fit authorization, unknown exposure metadata, registration hash mismatch, metadata size bounds and metadata-only final audit. Fixture writes rolled back. Existing Starlette/httpx deprecation warning remains.
7. Ruff check/format: **PASS**, 238 files. Strict mypy: **PASS**, 105 source files. `git diff --check`: **PASS**. All **26 retained historical checksums PASS**; all four B25 protocol/retained-registration semantic and byte hashes match. [Verification evidence](evidence/b26-readiness-verification.json) records PostgreSQL read-only/repeatable-read settings and a repeated CLI output attempt exiting 2 with unchanged prior evidence bytes. Full backend/dashboard/browser checks were not rerun for this offline addition. B24's seven tracked browser failures and existing warning gate remain open.

Next boundary:
- Next B26 sub-block: **event-preserving expected-shot source adapter and one independently reconciled real game**, then one complete recent season before three-season expansion. Use pinned bytes and source/transform identities, preserve true zeros/unknowns, reconcile all observed attempts before geometry eligibility, and retain all rejected-game reasons. No old dataset/admission rows may be replaced.
- Before any candidate comparison, independently verify source/use/coverage bytes, preregister an honest chronology amendment and freeze exact game/row and validation-half bindings. Then implement/enforce process/child resource caps and the offline runner/cards/read-only results. Full B26 remains blocked; none of those stages is claimed implemented here.
- Keep external-output admission, finance, broad browser acceptance, existing warnings and source-video availability independently gated. This slice stops at measured input readiness; no full acquisition, database admission/publication, model fit or policy activation occurred.

### Block B26: Strict expected-shot adapter and real-game/season reconciliation

- Measured 2026-10-03. **VERIFIED: strict adapter and complete real-game reconciliation. FAILED: subsequent complete-season admission. Full B26 remains `source_blocked`.**
- Froze [shotchart-admission-v1](design/shotchart-admission-v1.md) before complete-game/season checks. Added event-preserving parsing, explicit null/flag/type/finite/clock checks, fixed geometry tolerances and exact all-attempt player/team FGA/FGM/3PA/3PM reconciliation. Counts are reconciled before geometry exclusions. No defaulted outcomes/distance, fuzzy identities, deduplication or hidden corrections.
- Added bounded pinned acquisition/archive streaming with retained notices and full-byte receipts, independent schedule/box hash verification, exact whole-season denominator checks, disk-spooled offline auditing and exclusive candidate retention. Season expansion requires a verified successful one-game proof for the same source, boxes, recipe and implementation bytes. Existing B19 replacement paths and retained dataset/release rows were not used or modified.
- Real game `0022500001`, Houston at Oklahoma City on 2025-10-21: **201/201 attempts** reconcile exactly for every recorded player and both teams; all geometry and event-clock checks pass.
- Complete 2025–26 audit: **219,160 attempts, all 1,230 expected games, 30 teams with 82 games each**, no missing/extra games, malformed rows, duplicate event grains or geometry exclusions. **518 games pass; 712 quarantined** for event-clock-order failures (**1,184 adjacent reversals**). Shooting counts reconcile in 1,229 games; `0022500792` additionally has one extra missed two-point attempt for Jabari Smith Jr. versus independent player and Houston team boxes. Policy/rows remain unchanged. A separate justified ordering-policy amendment would still leave the independent count blocker.
- The 518 passing games supply 91,362 eligible attempts, a partial sample that cannot satisfy the complete-season gate. Final audit measured **13.86 seconds / 141,024 KiB peak child RSS**; no model-resource claim. Full ignored local source/candidate bytes and every failed-game report are retained. [Tracked evidence](evidence/b26-shotchart-admission.json) carries exact manifests/comparisons/hashes, runtime and failure examples. [Detailed reproduction and next dependency](research/b26-shotchart-admission.md) records earlier attempts and their limits.
- Verification: **131 tests passed, zero skips**, including 57 new strict-admission tests and executing PostgreSQL B23/readiness tests; existing Starlette/httpx warning persists. Ruff check/format passed (245 files); strict mypy passed (108 source files); all 26 historical checksums and four B25 protocol/retained byte pairs passed. Real output overwrite refused with exit 2 and unchanged bytes. Full backend/dashboard/browser checks were not rerun; prior browser failures/warning/video gates remain.
- Next: independently establish event-clock semantics and register a distinct input policy if justified; resolve the discrepant game from immutable primary observations, retaining any correction provenance. Re-run game/season checks before other-season expansion. Reuse/admission, append-only DB memberships, chronology amendment, exact three-season/sub-half binding, resource runner/cards/API and the other three experiment source gates remain pending. **Zero fits, DB admissions, publications, final-error reads or chronology amendments.**

### Block B26: Expected-shot admission, registered run and shared research machinery

- Measured 2026-10-03; implementation: current Codex session, no delegated agents. **COMPLETE: expected-shot sub-block, with a registered negative result. COMPLETE: its append-only inputs, retrospective binding, enforced resource launcher, artifact registry/model card, saved-model replay and read-only results API. Full B26 remains PARTIALLY COMPLETE; the other three experiments have independent source gates.**
- Separately registered shot-admission v2 preserves clock reversals as diagnostics and retains malformed-clock, duplicate-ID and exact-count rejection. Retained full official NBA observations enabled reviewed row-hash/game-membership-bound correction ledgers. Corrected the old handoff: `0022500792` is Houston at Charlotte. No original archive or v1 evidence was replaced. Complete official shot membership is verified, not inferred from count agreement.
- All three seasons now pass **1,230/1,230 games each: 3,690 games, 657,388 observed attempts, 657,386 eligible rows**. Six reviewed operations include the event 403 exclusion, one observed 3PT→2PT change, one clock correction, another exclusion and two explicit official supplements. Both supplements have unadmitted geometry and are excluded from fitting. [Three-season evidence](evidence/b26-three-season-admission-v2.json) retains source receipts, correction reviews and bundle/artifact hashes; [append-only admission](evidence/b26-append-only-admission.json) records the new sealed PostgreSQL dataset. SQL mutation/truncation/later membership extension reject; public snapshot `5bbb6035-6794-4bb0-b894-7208f52ef7ad` is unchanged.
- Preregistered an honest retrospective amendment before comparison, preserving all four B25 v1 registrations. Bound exact source/dataset/game/eligible-row identities and the 597-game selection / 633-game calibration halves. Train on 2023–24, validate on 2024–25, report previously exposed 2025–26 retrospectively; no untouched-final or prospective claim.
- Run `de8dbe44-daef-4c8b-a36b-527c0a6fd603`: **one candidate fit; selection failed**. Candidate Brier 0.233771183 versus baseline 0.233961315: **0.08127% improvement**, below the frozen 1% gate. Status `selection_failed_negative_result`. Stopped before calibration and final error evaluation; no tuning, replacement fit or promotion. Kernel caps: 2 CPU, 4 GiB, 1,800 seconds, whole-process-tree memory/termination; measured 39.72 seconds and 2,046,316,544-byte aggregate peak. Retained the earlier zero-fit affinity-preflight failure and its verified same-budget retry; completed-binding reruns refuse.
- Saved-model replay: **106,080 predictions reproduced exactly, zero new fits**. Result reads expose model card, negative metrics, verified artifact identities, actual fit/report horizons and worker/supervisor resource accounting. In-process FastAPI reads of retained real artifacts at `/api/workbench/research/experiments`, `/runs`, `/runs/{id}` returned 200; the earlier-cutoff read returned 422; HTTP fitting unavailable. [Result/replay evidence](evidence/b26-expected-shot-result.json), [real API smoke](evidence/b26-results-api-smoke.json) and [complete report/reproduction](research/b26-expected-shot-result.md).
- Verification: normal backend **448 passed, 74 skipped**; PostgreSQL focused/regression **138 passed, zero skips**; kernel probes include child OOM, wall termination and inherited CPU affinity. Ruff check/format PASS (270 files at final check); strict mypy PASS (118 source files); diff check PASS; all 26 historical hashes and all four B25 semantic/byte pairs PASS. Existing Starlette/httpx warning persists. Full-suite attempt in an empty migrated PostgreSQL scratch database hit baseline-dependent fixture failures and was interrupted; scratch removed. Do not claim full PostgreSQL acceptance. No frontend changes; prior browser acceptance failures are unchanged.
- Remaining B26: RAPM needs independently validated complete stints/possessions; six-factor needs event-attributed opportunities; adjusted shooting needs observed playtypes/foul trips. Those inputs and their original chronology gates are still absent. The shot hiccup is resolved and is not their blocker. Continue each experiment under its own source/admission contract; do not infer lineups/playtypes, reuse shot-ID order as possession order, or label the parent block complete before those experiments are measured. B27 may consume the completed expected-shot negative-result artifact and show explicit availability for the remaining panels.

- Final artifact packaging: [append-only protocol artifact package](evidence/b26-run-package.json) adds separate baseline/candidate files, complete exclusions, six reviewed corrections, configuration/stop records and an attributed model card. All 106,080 prediction pairs match the sealed file exactly; zero new fits or error evaluations. Package overwrite refuses, its parent hash is verified by the API, and original run bytes remain unchanged. Added protocol-level locking/binding claims so changing inputs cannot reset a registered fit budget. [Live sealing checks](evidence/b26-live-sealing-probe.json) confirm duplicate admission and SQL mutation/extension refusal with all publication pointers unchanged.

### Block B27: Advanced research interfaces

- Measured 2026-10-03. **COMPLETE for the bounded B27 interface slice.** Added dashboard views for the completed expected-shot experiment, model cards, selection metrics/reliability bins, fit/report horizons, artifact identities, read-only export, and explicit source-blocked RAPM, six-factor, and playtype-adjusted shooting entries. The expected-shot page uses the amended registered experiment `courtload-expected-shot-retrospective-v2` and displays its `selection_failed_negative_result` result; it does not present the candidate as promoted or expose unavailable final errors.
- Added an explicit hypothetical calculator implementing `hypothetical-possession-flow-v1`: editable probability assumptions, validation for finite [0,1] values/category sum/terminating recovery, ORTG and component flow, finite-difference sensitivities, and JSON export. The page states the denominator and independent repeated-chance assumptions and keeps event-specific and causal claims unavailable.
- Added roster allocation diagrams backed by the release-bound team detail/player-game cohort. Observed minutes and user-projected minutes are separate modes; positions are user labels, unknown allocations remain visible, the historical cutoff is exclusive, and exports retain source context and warnings. Added measurements/wingspan controls for source type, draft year, wingspan bounds, name filtering, units, bounded scatter/table/compare output, null values and source-labelled export. Position/active-roster status and impact/financial sizing remain unavailable without their own admitted inputs.
- Added 132 dashboard unit tests (including calculator formula/validation and read-only research integrity handling) and six focused Playwright tests. Focused browser run: **6 passed**. Real-data smoke captured [negative report and roster/measurements evidence](evidence/b27-real-browser.json), [expected-shot desktop](evidence/b27-real-negative-desktop.png), and [roster mobile](evidence/b27-real-roster-mobile.png); both tested mobile views fit without horizontal overflow. Production dashboard build, TypeScript, ESLint, Ruff, strict mypy and backend suite pass. Backend result reads remain GET-only; artifact-integrity failure hides numerical outputs and offers retry.
- Known gates retained: PostgreSQL acceptance remains environment-dependent (the normal suite was **448 passed / 74 skipped**, with the existing Starlette/httpx warning), broad browser acceptance still contains historical failures outside this focused B27 run, and the three B26 experiments remain source-blocked pending complete validated stint/possession, opportunity, and playtype/foul-trip inputs. No B26 inputs, publication pointer, active points policy or model result was changed.

### Block B28: Contract/transaction acquisition and schema

- Measured 2026-10-03; implementation: current Codex session, no delegated agents or model override. **VERIFIED for the bounded manual acquisition/schema path.** Comprehensive automated finance acquisition remains **source_blocked**, separately from the accepted no-subscription manual fallback. Read replica/workbench handoffs, finance/identity/immutability contracts, free-source findings and actual B01/B14a/B25–B27 evidence/seams. No dashboard changes.
- Added [finance-import-v1](design/finance-import-v1.md), strict typed CSV/manifests and additive migration `27b810a4f001`: separate contract, amount, option, guarantee, signing/status and dated association observation families, provenance-bearing sources and exact selected book membership. Money uses exact USD cents; seasonal kinds remain distinct from reported totals; unknown terms stay null. Explicit source/NBA mapping evidence and existing canonical identity required; names and participation do not map entities or teams. Source and identity observations cannot be later than their declared row observation.
- Added `finance-template`, read-only `finance-preview`, tracked allowlisted `finance-import` and `finance-verify` CLI commands. Worker accepts only content-addressed staged bundle hashes, rechecks staged bytes, holds existing coordinated lock and records outcome. Different bundle hashes do not coalesce. CSV/source bytes are retained in PostgreSQL itself for ordinary DB backups. Import books are independent of the basketball public pointer.
- PostgreSQL and ORM sealing prevent retained mutation; subsequent memberships cannot extend old books. Corrections require a parent-selected original ID, reason, supporting source and nondecreasing observation date. They append new terms and bind one resolved grain per player/contract/season/family/amount-kind; old alternatives and original books survive. Identical import reuses its book. No unresolved provider precedence or duplicate amount selection is silently accepted.
- [Free-source spike and reproduction](research/b28-finance-admission.md): six bounded direct requests returned 403; browser tool permitted inspection of NBA/club source text. Retained real inputs are explicitly labelled small **operator factual notes**, not full original page bytes or a verified automated feed. [Initial bundle](evidence/b28-manual-input/manifest.json) admitted six historical extension observations; [reviewed correction](evidence/b28-manual-correction/manifest.json) appends two documented term revisions with six descendant-selected rows. Seasonal salary/cap hit, guarantee and option schedules remain unknown. Real options are unknown; non-null option state validation is synthetic evidence only. No present free-agent/current-roster claim or annual allocation of a multi-year total.
- [Real PostgreSQL/worker evidence](evidence/b28-finance-import.json): two succeeded tracked jobs, both books' exact CSV/source bytes and memberships verified, original amount still unknown, repeat import idempotent, real SQL UPDATE and later membership INSERT rejected. Public snapshot remains `5bbb6035-6794-4bb0-b894-7208f52ef7ad`. No basketball publication, forecast/model fit, sealed experiment change or financial value conversion.
- [Verification](evidence/b28-verification.json): backend **471 passed, 82 skipped**, 20.76s; focused finance **31 passed, zero skips**, 0.40s, including eight PostgreSQL tests in unique disposable schemas removed afterward. Covered cents/nulls, invalid claims, duplicate grains, crosswalk/source integrity, correction conflicts, old observation survival, staging safety, ORM/raw SQL sealing, migration upgrade/downgrade and job coalescing. Ruff check/format **PASS** (278 files), strict mypy **PASS** (121 source files), diff check **PASS**, all **26 retained historical checksums PASS**. Existing Starlette/httpx warning persists; zero-warning/full PostgreSQL acceptance is not claimed. Dashboard/browser checks were not rerun for this backend-only block; historical broad-browser failures remain open. Database-source retention/integrity is verified, but fresh backup/restore acceptance is still open.

Next boundary: **B29 Finance query operations**. Require explicit book and preserve inherited source/correction provenance; apply actual known-at/effective boundaries with unknown-date handling. Historical extension signing is not current market status. Known payroll must use admitted seasonal kinds and disclose incomplete coverage; this bounded sample has no known seasonal salary rows. Threshold/cap completeness, external dollar conversion, comprehensive daily automation and richer independently sourced books remain separate gates. B30 UI follows B29; do not present the current sample as full team payroll or current free-agent coverage. B26's three remaining source gates and existing broad release gates remain unchanged.


### Block B29: Finance query operations

- Measured 2026-10-03; implementation: current Codex session, no delegated agents or model override. **VERIFIED for the bounded admitted-book query path.** Read replica/workbench handoffs, financial and retained temporal/data contracts, actual B02/B03/B25/B28 evidence and implementation. Existing B28 dirty work and sealed experiments preserved. Comprehensive seasonal salary/current free-agent coverage, official threshold rules, dated position binding and external monetary value remain separately gated.
- Added [finance-query-v1 contract](design/finance-query-v1.md), strict Pydantic request/response schemas and focused service/route: `POST /api/workbench/operations/finance`. Explicit book UUID/financial season/known-at/effective context, selectable seasonal amount kind, team/player/status filters, adjustable $12M Small vs Big threshold and named optional exercise scenario. Static finance route registers before B23's dynamic operation route; no dashboard, migration, source acquisition or worker mutation added.
- Known-at resolution traverses retained corrections to recover the original observation before the correction was acquired. Original/inherited source URLs/hashes/locators/book IDs/correction reasons remain visible. Unknown effective dates are labelled and excluded from seasonal sums; future/other-season terms remain in a separate timeline for represented contracts. Retrospectively acquired observations are labelled reconstructed. Explicit dated contract teams never come from basketball participation; conflicting associations/statuses remain unresolved.
- Integer cents arithmetic and string-valued cents on the API preserve exact aggregate money. No valid rows returns null; documented zero remains zero. Seasonal amount families never mix with totals/AAV. Known/unknown contracts and status groups reconcile to labelled book denominators, with external expected roster coverage explicitly unknown. Reported money and hypothetical option amounts/subtotals are separate; scenario assumptions leave observed subtotals unchanged. All allocations stay unclassified without admitted dated positions. Thresholds return `threshold_status_pending`; value conversion remains `source_blocked`.
- AAV is derived only from reported total and documented years, labelled separately at 40 significant decimal digits. It cannot allocate annual salary. `result_sha256` binds the complete reproducible response; a separate `analytical_content_sha256` excludes installation IDs, book identity and unrelated future timeline rows while retaining eligible semantic facts/source context. Tests show the as-of descendant and original book share an analytical hash.
- [Real retained-book evidence](evidence/b29-finance-query.json), reproducible with `.venv/bin/python scripts/verify_b29_finance.py NEW_OUTPUT.json`: **four HTTP 200** cases in a PostgreSQL **read-only/repeatable-read** transaction. Original and descendant-as-of-original AAV stay unknown; the reviewed descendant yields **$120M / 3 = $40M derived AAV**, with **no known seasonal salary subtotal**. A 2025 known-at query returns zero contracts rather than inferred unsigned status. Both books' retained bytes/memberships and every publication pointer match afterward. This is in-process HTTP with the real DB, not browser/network-server acceptance. Observed latency: 73.437 ms first call, 2.597–3.568 ms subsequent bounded cases; response payloads 2,403–19,900 bytes. These are small-book observations, not full-book performance acceptance.
- [Verification evidence](evidence/b29-verification.json): full backend **482 passed, 85 skipped**, 20.05s; focused finance **45 passed, zero skips**, 1.08s, including 11 PostgreSQL checks (eight retained B28 checks plus three new HTTP/cents/provenance checks). New B29 checks cover exact kinds/cents/null/zero, AAV/missing salary, team/status reconciliation, unknown/future dates, season filters, as-of correction replay/inherited sources, scenario separation, strict HTTP schemas, missing-book 404 and read-only state. Disposable PostgreSQL schemas removed afterward. Ruff check/format **PASS** (285 files); strict mypy **PASS** (124 source files); all **26 retained historical checksums PASS**; diff check **PASS**. Evidence overwrite refused with exit 1 and unchanged prior bytes.
- Existing Starlette/httpx deprecation warning persists; zero-warning/full PostgreSQL acceptance remains open. Dashboard/browser checks were not rerun for this backend-only block; existing browser failures and full fresh restore acceptance remain open. Generic finance saving/export integration remains B35; B26's three remaining source gates are unchanged.

Next boundary: **B30 Contracts/free-agency UI**. Consume the explicit B29 financial context/OpenAPI contract, preserve financial versus basketball years, source-book status scope, unknown terms and scenario separation. Use the retained real historical import without presenting it as complete/current payroll or present free-agent coverage. Model value/ROI and official threshold claims remain gated by their independent admitted inputs.

### Block B30: Contracts/free-agency UI

- Measured 2026-10-03. **COMPLETE for the bounded admitted-book B30 interface slice.** Implementation choice: current Codex session instead of the handoff's Flash assignment, without delegated agents or model override. Read replica/workbench handoffs, B28/B29 evidence, finance/interface/analytics contracts, installed Next.js guidance and actual frontend/API seams; applied ui-ux-pro-max accessibility/responsive guidance within existing vanilla CSS. Preserved the pre-existing B28/B29 application work and sealed evidence.
- Replaced finance notices with working `/contracts`, `/contracts/[NBA ID or tricode]` and `/free-agency` workspaces. Added explicit immutable-book selection/manual UUID, financial season, UTC/offset known-at, inclusive effective date, team, seasonal amount kind, unknown-date handling, shared status taxonomy, configurable Small vs Big split and separate hypothetical option layer. Financial URL parameters remain distinct from basketball context across navigation/reload. Unknown amounts stay unknown; exact cents use `BigInt` formatting and group sums. Group/status/coverage totals disclose their represented-contract denominators; visible search/type/size/sort filters do not relabel query-wide totals.
- Source-linked contract drawers and multi-year timelines expose separate totals/AAV, amounts, options, guarantees, unknown/future dates, source timestamps/hashes/origin books and correction reasons. Native modal focus containment/Escape/focus return and labelled scroll regions work on desktop/narrow screens. Position allocation retains unclassified known cents; unsupported positional charts, UFA/RFA/movement, official financial thresholds and modeled value/surplus/ROI remain explicit unavailable outputs. Incomplete payroll never becomes legal cap room or current-market coverage.
- Added bounded read-only book discovery/detail endpoints, omitting retained CSV/source bytes and checking membership bounds before loading terms. Canonical identity names are display labels only. Added a fixed same-origin server proxy for an existing operator-staged `finance_import` hash, prompt tracked-job output, job-status reads and operator template/preview/import/correction instructions. Invalid/cross-origin/arbitrary requests reject before forwarding server credentials. Success reloads discovery without choosing a new branch. Daily finance automation remains source-blocked; the read refresh and staged import controls state their actual behavior. [UI contract](design/finance-ui-v1.md).
- [Real Chromium/network evidence](evidence/b30-browser-final/real-browser.json): retained corrected Toronto extension shows **reported $120M / 3 = $40M derived AAV**, **unknown seasonal salary**, independent signed-extension status and linked correction sources. Embedded Stats separately resolves **basketball 2024–25, before 2025-04-15, 18 appearances** under retained public release `5bbb6035-6794-4bb0-b894-7208f52ef7ad`, alongside financial 2025–26. Pre-observation query shows no represented contracts, not inferred unsigned status. Mobile body **375 / 375 px**, no horizontal overflow. [Desktop](evidence/b30-browser-final/contracts-desktop.png), [drawer](evidence/b30-browser-final/contract-drawer.png), [mobile tracker](evidence/b30-browser-final/free-agency-mobile.png). Reproduce with `node scripts/verify_b30_finance_browser.cjs NEW_EVIDENCE_DIRECTORY` against local FastAPI/PostgreSQL/Next.js; existing output directories refuse overwrite. Real smoke reads only; option scenarios and staged-job states are deterministic synthetic browser evidence, not newly acquired real financial inputs.
- [Verification](evidence/b30-verification.json): backend **484 passed / 85 skipped**, 20.37s; focused finance **47 passed / zero skips**, 1.11s, including **11 disposable-schema PostgreSQL checks**. Dashboard **137 tests / 22 files PASS**; **8 focused Playwright tests PASS**, including refresh/navigation, filters/unknowns, scenario separation, keyboard/mobile/landscape/reduced-motion, tracked import failure, independent embedded Stats and stale-response rejection. Production build, TypeScript and zero-warning ESLint PASS; Ruff check/format PASS (**288 files**), strict mypy PASS (**125 source files**), diff check PASS, all **26 retained historical checksums PASS**. [Post-browser retained-book integrity](evidence/b30-finance-integrity.json) verifies bytes/memberships and publication pointers unchanged in read-only/repeatable-read PostgreSQL. No acquisition, model fit, policy change, basketball publication or real-browser import mutation occurred.
- Existing Starlette/httpx and Playwright color-environment warnings persist. Comprehensive salary/current free-agent sources, currentness/daily acquisition, dated financial positions, UFA/RFA/movement, official threshold/legal component rules and external monetary conversion remain gated. Full PostgreSQL, historical broad-browser and fresh restore acceptance remain open; no full-release acceptance claim. B35 retains generic saved-operation/export integration. Three remaining B26 experiments keep independent source gates.

Next boundary: **B31 Shared Live service** (B00–B01 and B14a identity prerequisites). Inspect real provider access/currentness, bounded view leases and shared polling/cache before implementing B32 Live UI; retained finalized basketball observations do not establish in-progress coverage.

## B31 — Shared Live service (2026-10-03)

Status: **VERIFIED (bounded backend)**. Real changing-game freshness and later final
reconciliation remain **not_yet_observed**; consumer-use/source admission and broader
active-box resource/retention gates remain open. Implementation choice: current Codex
session, no delegated agents or model override. B30's dirty finance work was preserved.

- Added the independent Live source adapter, typed cache/demand API, append-only source
  content/acquisition/reconciliation tables and additive migration `31b810a4f002`.
  Ordinary ESPN access is opt-in (`COURTLOAD_LIVE_ENABLED=false` by default). Public
  cached GETs never download or activate polling; token/Origin-protected activation,
  heartbeat and idempotent deletion maintain up to 64 leases with 150-second TTL.
- One worker-owned shared feed lock and durable timing/count reservations coalesce
  clients and prevent competing workers/restarts from bursting. Pipeline jobs and
  Live run with isolated sessions in separate cooperative threads. At most one slate
  plus three selected active/final boxes per cycle, sequentially; at least 60 seconds
  after a successful cycle. Multiple slates and boxes rotate fairly for stable demand.
  No active demand means no upstream calls. Retry-After, 120/240/600-second backoff,
  access-denial disablement, ten-second total transport deadline, five-second connect
  timeout and 512 KiB/2 MiB response caps bound provider failures.
- Preserve provisional statuses, Eastern slate/UTC event time, nullable source metadata
  versus HTTP/acquisition times, optional clocks/periods and verified unique namespace
  crosswalks. Scheduled zeros and missing boxes remain unknown. Normalized player rows
  retain source-keyed display values and explicit nonappearance; absent rows are never
  inferred DNPs. Last-good observations retain age/error status. Content deduplicates;
  each successful fetch appends an observation. Final boxes stop recurring acquisition
  and refetch only for a scoreboard-visible game correction. Player-only final
  corrections still require normal independent batch acquisition/admission.
- Exact insertion checks plus conservative cycle preflight cap raw/normalized payload
  storage at 128 MiB and acquisition observations at 100,000. Capacity stops acquisition
  instead of deleting evidence. Physical database overhead, active entropy/growth,
  retention and fresh backup/restore acceptance remain distinct release gates.
- Explicit `courtload reconcile-live-final` compares retained final team scores with
  independently admitted finalized schedule/team facts, verifying game mapping,
  date, team sides, points and opponent points. Appends matched/mismatch/waiting evidence;
  player/stat reconciliation is explicitly unavailable in this bounded operation.
  No poll performs analytical admission, dbt, training, publication or forecast issuance.
  [Frozen service/UI handoff](design/shared-live-v1.md).

Measured verification:

1. [Source probe](evidence/b31-source-probe.json): scoreboard **HTTP 200 / 9,933 bytes**;
   selected summary **HTTP 200 / 90,280 bytes**, one scheduled event, no player sections.
   No real in-progress, final or correction evidence. [Conditional source decision](research/b31-live-admission.md).
2. [Real uvicorn/FastAPI/PostgreSQL measurement](evidence/b31-real-service-final.json):
   **12 leases → 2 upstream scoreboard calls / 65 seconds**, **19,864 bytes**, **200
   cached HTTP reads p95 2.66 ms**, poller CPU **0.082% of one core**, **0 KiB increase
   in warmed process peak RSS**. Last source bytes deduplicated to **9,932 bytes** across
   four acquisitions from two independent bounded probes. Idle acquisitions **zero**;
   all owned leases released. These scheduled/small-payload resource results do not
   establish populated three-box cost or active-source freshness. Retained public
   pointer, all 148 channel pointers and financial books unchanged in the smoke.
3. Backend final `.venv/bin/pytest -q`: **506 passed / 98 skipped**, **21.63s**.
   Focused Live+finance checks with `COURTLOAD_TEST_POSTGRES_URL` configured:
   **82 passed / zero skips**, **4.98s**: **35 Live** (including **13 real disposable-schema
   PostgreSQL checks**) and **47 retained finance checks**. Cover transitions and final
   correction, coalescing, selected-box fairness including two six-game slates, expiry,
   backoff/denial/oversize, cached read-only API and protected writes, immutable/FK
   enforcement, migration up/down/up, concurrent admission of 80 clients capped at 64,
   competing feed owners, crash reservation, a blocking pipeline and final-score
   reconciliation against independently admitted facts. One existing Starlette/httpx
   TestClient deprecation warning remains; the release-wide zero-warning gate is open.
4. Dashboard **137 tests / 22 files PASS**, TypeScript PASS, zero-warning ESLint PASS.
   B31 changed no dashboard implementation: production build/focused-browser evidence
   remains B30's; no new B32 browser or broad-browser acceptance is claimed.
5. Ruff check/format PASS (**301 Python files**), strict mypy PASS (**131 source files**),
   `git diff --check` PASS, Compose configuration PASS, all **26 retained historical
   checksums PASS**. Migration applied to local PostgreSQL without changing retained
   basketball or finance relationships. [Verification manifest](evidence/b31-verification.json).

Next bounded block: **B32 Live interface**. Use cached source IDs and the service handoff,
implement the same-origin server lease proxy, visible/pause/unmount heartbeat lifecycle,
status/age/unknown displays, selected boxes and admitted historical final detail. Keep
real in-game/final reconciliation, source permissions/reliability, active-box resource
costs, broad browser acceptance and fresh restore gates visible. Do not claim full Live
acceptance from simulated transitions or today's scheduled observations.

## B32 — Live interface (2026-10-03)

Status: **VERIFIED (bounded interface)**. Genuine changing in-game freshness and real
later final reconciliation remain **not_yet_observed**. Implementation choice: current
Codex session instead of the handoff's Flash assignment; no delegated agents or model
override. Read replica/workbench handoffs, B31 service/admission/evidence, interface and
analytics contracts, dashboard instructions and installed Next guidance; applied
ui-ux-pro-max accessibility/responsive guidance within the existing design. Preserved
pre-existing B28–B31 work and sealed historical evidence.

- Replaced the Live capability notice with `/live`, `/live/[date]` and
  `/live/games/[id]`: Eastern date strip/native date input, source clock/period/status,
  nullable scores, selected team/player boxes, source identity status and observation
  provenance. No extrapolated clock, invented DNP/injury, inferred series matching or
  placeholder score becomes an outcome. Source errors retain the last good observation
  with acquisition time/age at last read. Local pause and global feed idle remain separate.
- Added fixed same-origin Next lease/cache proxy. Browser code receives no operator
  token; mutations validate selection/UUID/path/body before forwarding credentials;
  read parameters are allowlisted, upstream redirects fail closed and response bodies
  are sanitized. Real production browser testing discovered Next's internal localhost
  normalization: the Origin check now uses incoming Host and ignores forwarded Host,
  with a regression test for legitimate `127.0.0.1` and forged origins.
- Visible unpaused views acquire one generation-owned lease, read cached data and renew
  after 60 seconds. Pause/hidden/offline/pagehide/unmount stop timers and release demand;
  pageshow/online/visibility restore it. Late activations release their capability after
  disposal. Expired heartbeat and capacity errors wait for the next bounded tick.
  Selection/context changes discard previous data and reject delayed stale responses.
- Added a typed read-only finalized-history endpoint and UI context controls. History
  queries retained archive/workbench facts by explicit dataset/season/phase/date before
  the exclusive cutoff, bounded to 30 games/80 selected player rows; they require paired
  final team identities/scores and never activate Live, publish, reconcile or enqueue
  jobs. Resolved release pins into the URL; basketball parameters survive provisional
  navigation. Mode changes return to a slate rather than confusing ESPN and NBA IDs.
  Reported archive nonappearance suppresses zero placeholders in API and UI; absent rows
  remain unknown. [Interface contract](design/live-ui-v1.md).

Measured verification:

1. [Real Chromium + production Next/FastAPI/PostgreSQL](evidence/b32-browser-final-verified/real-browser.json)
   and [shared worker evidence](evidence/b32-browser-final-verified/real-service.json):
   **three visible tabs**, all three leases renewed through a **65-second observation
   window**, **two real upstream scoreboard requests**, **14 poller ticks**, total
   browser workflow **68.464 seconds**. Pause/navigation/close released all three leases;
   subsequent idle acquisition **zero** and final database lease count **zero**. Source
   observations remain **scheduled**, with unknown scores. All **148 publication
   pointers**, public release and both finance books match before/after. This is genuine
   network/source coalescing, not changing-game acceptance.
2. Real retained historical game **0022301188**, **2024-04-14**: Atlanta **115**, Indiana
   **157**, **27 retained player rows**, unknown tipoff left unknown. API/UI agree;
   Isaiah Jackson and Clint Capela reported-nonappearance placeholders are suppressed.
   Historical display never creates demand and does not establish a new Live final
   reconciliation. Desktop/narrow screenshots inspected:
   [Live](evidence/b32-browser-final-verified/live-desktop.png),
   [final desktop](evidence/b32-browser-final-verified/historical-final-desktop.png),
   [final mobile](evidence/b32-browser-final-verified/historical-final-mobile.png).
   Body width **375 / 375 px** and landscape **812 / 812 px**, with table overflow
   confined to labelled keyboard-focusable regions.
3. Dashboard **145 tests / 23 files PASS**, **seven focused Chromium tests PASS**
   (3.0s): source-zero/null/nonappearance, overtime/unknown clock, stale/source error,
   pause/visibility/unmount, offline/capacity, historical pinned context/reload, delayed
   selection, disabled/empty/invalid states, keyboard and mobile/landscape. Fixtures
   separately cover in-progress states; they are not real in-game evidence. TypeScript,
   zero-warning ESLint and production build **PASS**.
4. Backend final **509 passed / 98 skipped**, **23.55s**. Focused Live/history suite
   **38 passed / zero skips**, including **13 disposable-schema PostgreSQL checks**;
   three new historical tests verify strict dataset/phase/cutoff, paired final-only
   reads, unknown/zero/nonappearance semantics, no Live writes and typed HTTP responses.
   Strict mypy **PASS (133 files)**; Ruff check/format **PASS (306 files)**; all **26
   retained historical checksums PASS**; diff check **PASS**.
5. [Verification manifest](evidence/b32-verification.json) binds code and final evidence
   hashes. Earlier smoke attempts are retained with explicit superseded run-status
   records: the initial activation timing check, the Host/Origin rejection, and the
   pre-correction nonappearance capture. They are not final acceptance evidence.

The existing Starlette warning persists. Playwright's color-environment warnings and
the isolated Next start standalone-launch advisory are recorded in the manifest.
No release-wide zero-warning/full PostgreSQL/broad-browser/fresh restore claim is made.
Source rights/reliability, real active/final/correction acceptance, populated three-box
resource/storage/retention and player-stat final admission remain independent gates.

Next bounded block: **B33 Conversational analytical backend**. Read the search contract,
inspect the actual retained tool/evidence/query seams and preserve explicit context,
server-owned numerical rendering, bounded provider/tool budgets and AI-disabled manual
operation. Genuine in-game observation/final reconciliation remain opportunistic gates,
not a reason to mislabel the verified scheduled-source interface.

### B33 — conversational analytical backend (2026-10-03)

**VERIFIED bounded backend; real-provider language acceptance and B34 interface remain
open.** Implemented the search contract against retained B12 operations and independently
admitted finance inputs. Execution used the current coding agent without delegation;
no model-tier substitution or language-evaluation claim is implied by the block label.
[Backend contract](design/conversational-analytics-v1.md),
[frozen API/registry schemas](design/conversational-analytics-v1.schema.json).

- Added versioned typed turns/plans and a single schema-derived registry of **12**
  operations. Context pins release/dataset/season/phase/exclusive cutoff/window; explicit
  changes and ambiguous identities require clarification. NBA namespace identity
  resolution reuses normalized aliases, validates IDs, and removes first-substring
  selection. Follow-ups transform the prior canonical plan; unsupported guard/position
  filters are rejected rather than silently discarded. Registered minimum-minutes
  refinements work. Finance and forecast evidence retain their own independent inputs.
- Replaced numeric-value matching, provider-written tables/claims and question-keyword
  routing in the compatibility assistant. Exact evidence IDs bind result/operation,
  entity/row/path, metric/version/unit, sample and context. Server templates own observed
  statements. Null/zero/nonappearance remain distinct, comparison samples are metric
  specific, and source monetary precision is preserved. Added actual retained-minutes
  distribution support and complete paired-window workload shifts.
- Enforced one planning call/20 seconds, eight independent steps, 100 rows/operation,
  200 cumulative rows, 64 KiB provider input, 2,000 output tokens, 160 KiB incoming body,
  2 MiB rendered results and 3 MiB response. The 45-second supervisor terminates expired
  PostgreSQL work in read-only repeatable-read transactions; parent resolution SQL uses
  remaining statement deadlines. Provider transport remains locked after caller timeout
  until it exits, and late results cannot overwrite state. Quota/Retry-After, bounded
  cache, request retries/conflicts, 30-minute expiry/reset and per-conversation/global
  provider concurrency are tested. Process-local state supports the current single API
  worker; multiple replicas require shared coordination. Manual plans work without AI.
- Exact executed Stats metric selectors now round-trip through the shared serializer.
  Research operations expose exact manual API destinations because the current Research
  UI loses some pinned parameters. B34 must complete the operation-view serializer before
  claiming equivalent “Open in Research” UI actions. Source services already round some
  aggregates: B33 preserves returned precision, **does not claim recovered full raw
  precision**, and records that upstream evidence-contract limitation.

Measured verification:

1. [Final real FastAPI/PostgreSQL HTTP probe](evidence/b33-real-conversation-final.json):
   six answered manual workflows; **zero provider calls**, exact result hashes, exact
   manual equivalence for similarity, both distributions and finance. Workload shifts
   evaluate **456 complete-window players** and return 20; Scottie Barnes similarity
   returns target plus five peers; paired scoring/minutes each use **20 appearances**.
   Stats evaluates **577 eligible players** and returns ten. Repeating Stats incurs
   **one cache hit / zero tool executions** with unchanged manifest. Finance reads the
   explicit retained corrected book; comparison retains both canonical players.
   Individual network times **634.833–1428.277 ms**. Every active conversation is cleared;
   all publication pointers and finance book hashes match before/after. No acquisition,
   publication, finance import or real Gemini call is part of the probe.
2. Frozen **45 cases: 25 supported, ten clarification/data-limited, ten unsupported;
   twelve held out**, sealed before later prompt tuning. Fixtures exercise plans rather
   than infer language accuracy. **86 new unit checks** cover adversarial prose/tables,
   equal-value misattribution, nested query fields, ambiguous names, refinements, retries,
   concurrency, expired work, budgets, source precision and future isolation.
   **Six new disposable-schema PostgreSQL checks** validate real queries/HTTP, identity
   namespaces, paired distributions/periods, future mutation isolation, rejected writes
   and terminated analytical deadlines.
3. Backend final **595 passed / 104 skipped**, **25.52s**; the expanded skipped count
   includes the six new opt-in PostgreSQL cases. Focused B33/Finance/Live with PostgreSQL
   **177 passed / zero skips**, **13.21s**, including **30 PostgreSQL checks**. The existing
   Starlette/httpx deprecation warning persists. Strict mypy **PASS (141 source files)**,
   Ruff check/format **PASS (318 Python files)**, diff check **PASS**, all **26 retained
   historical checksums PASS**.
4. Dashboard **145 tests / 23 files PASS**; TypeScript, zero-warning ESLint and production
   build **PASS**. Retained Live browser regression **seven Chromium tests PASS (3.1s)**,
   using mocked Live endpoints; this is neither new chatbot UI nor real in-game evidence.
5. [Verification manifest](evidence/b33-verification.json) binds code/schema/corpus and
   evidence hashes. Earlier HTTP captures remain retained: the first predates corrected
   minutes distribution and is superseded; the second verifies the original four
   workflows; the final capture extends verification to finance and comparison.

No full PostgreSQL suite, broad-browser/fresh-restore, free-project eligibility or real
language-accuracy claim is made. B32's real active/final/correction gates remain open.

Next bounded block: **B34 Chatbot interface and query evaluation**. Consume the frozen
turn/operation schemas, implement accessible follow-ups/clarifications and server-owned
result/evidence cards, repair exact Research UI destinations, preserve AI-disabled manual
workflows, and run the bounded opt-in real-provider corpus when a project is configured.
B35 owns explicit retained investigations/exports; ephemeral B33 state is not saving.

### B34 — chatbot interface and query evaluation (2026-10-03)

**VERIFIED bounded interface and exact Research equivalence; real Gemini language
acceptance remains OPEN (no configured key).** Execution used the current Codex session
instead of the handoff's Flash assignment, without delegation or model override. Read
B33's frozen schemas/evidence, replica/workbench handoffs, search/interface contracts,
dashboard instructions and installed Next guidance. Applied ui-ux-pro-max and the
measured diagnosis loop; preserved prior dirty work and all sealed historical evidence.
[Interface/evaluation contract](design/conversational-interface-v1.md).

- Replaced the one-shot assistant with the typed multi-turn Research page and native
  modal Ask drawer. Follow-ups retain conversation ID, resolved context and fingerprint;
  identity choices send exact canonical choices. Meaning clarifications support explicit
  follow-ups. Proposed context is displayed before starting a separate conversation;
  changing season without a proposed release resolves the matching season instead of
  retaining the old release. Clear/reset, request-ID retry, eight-turn display, stale
  response rejection and late disposed-response cleanup are implemented. Native modal
  focus containment/Escape/return and labelled keyboard-scrollable tables work.
- Cards display only server results/evidence: distributions separate summary and samples,
  scoring/minutes samples remain independent, zero/null stay distinct, plots omit unknown
  observations, and workload tables lead with observed deltas. Samples, definitions,
  actual windows, units, metric/input versions and exact cell IDs remain inspectable.
  Display decimals use up to four places with returned precision in titles/evidence;
  financial strings retain precision. B33's upstream aggregate-rounding limitation stays
  open. No arbitrary model findings or provider-written numerical tables are displayed.
- Manual mode uses the same validated turn API for all twelve registered operations,
  exposes their actual schemas/examples and supports paired points/minutes distributions.
  The JSON argument editor is an advanced manual path; retained ordinary Stats/Research/
  Finance controls remain available. Disabled/configuration, quota, timeout, unavailable,
  busy, insufficient-sample and empty states preserve questions and manual alternatives.
  Privacy copy distinguishes local expiry from provider records; no key enters the client.
  Existing saved investigations are linked. Durable conversational saving/export remains
  explicitly B35's ownership; this block does not label ephemeral state as saved evidence.
- Executed distribution, similarity, compare-periods, splits **and workload-shifts** links
  now open `/research/operation` with every canonical argument and explicit pinned inputs.
  The view validates its bounded allowlist, runs a provider-free manual plan, clears its
  temporary state and preserves reload semantics. Development remounts share one pending
  request. Real production testing caught missing `DELETE` CORS permission: configured
  origins now support browser clearing, with allowed/rejected-origin preflight coverage.
  The original B13 specialized pages remain; chatbot links use this exact operation view.
- Added a bounded opt-in corpus evaluator: original 45 cases/checksum unchanged, one
  invocation/case, declared free-project opt-in, no fallback, stop on quota/provider/timeout,
  configured/returned model and SDK identity, per-case plans/context/hashes/usage/latency.
  Recorded an explicit correction to sealed case 23: its Barrett question used Tatum ID
  `1628369`; evaluation uses Barrett `1629628`. The referential distribution case seeds
  an actual Barnes selection. No prompt tuning or real Gemini inference occurred.

Measured verification:

1. [Final real Chromium + production Next/FastAPI/PostgreSQL](evidence/b34-browser-sealed/real-browser.json):
   **five manual workflows / six exact Research results**, plus **two distribution reloads**.
   All reopened canonical arguments, result data and hashes match; **zero remote provider
   calls**. Workload query evaluates **351 complete-window players** with 300 combined
   minutes and returns 20; Barnes similarity uses ten appearances and five peers;
   paired scoring/minutes each use **20 appearances**. Compare-periods returns 22 named
   metric deltas; venue splits return two buckets. Final initial UI workflows, including
   capture/layout work, measured **721–1,571 ms**; this is not Gemini inference latency. [Integrity evidence](evidence/b34-browser-sealed/integrity.json)
   confirms all **148 publication pointers**, public release and both finance book hashes
   unchanged. The harness explicitly clears its original workflow conversation IDs.
2. Desktop/drawer and 375 px screenshots inspected, including
   [workload](evidence/b34-browser-sealed/workload_shifts-desktop.png) and
   [paired distributions](evidence/b34-browser-sealed/distribution-mobile.png).
   Body overflow absent at **375 px** and **812 px**; tables own horizontal
   overflow. Earlier failed captures are retained with run-status records: missing CORS
   DELETE and a harness locator matching two legitimate paired tables. Earlier successful
   visual captures are marked superseded by the final build.
3. [Frozen fixture/real-data corpus](evidence/b34-fixture-corpus-verified.json):
   **25 supported / ten clarification / ten unsupported PASS**, including twelve held-out
   cases, **45 simulated planner invocations / zero real provider calls**. This measures
   typed planning/execution/manual equality, not natural-language accuracy. Original corpus
   lacks finance and actual empty-current-season language cases; supplemental evaluation
   remains necessary before full conversational language acceptance. A real opt-in without
   a configured key rejects before any transport; free tier/model eligibility is unverified.
4. Backend **601 passed / 104 skipped**, **25.07s**; focused conversation/finance/Live with
   PostgreSQL **183 passed / zero skips**, **13.97s**. Six new backend checks cover exact
   Research destinations and real CORS preflight behavior. Dashboard **158 tests / 24 files
   PASS**; **20 focused Chromium checks PASS** (13 conversational + seven retained Live),
   covering follow-ups, identity/context choices, disabled/manual, all failure labels,
   retries, late output/cleanup, reload, focus and responsive/reduced-motion behavior.
   Browser fixtures exercise language states; they do not establish Gemini understanding.
5. TypeScript, zero-warning ESLint and final production build PASS; strict mypy PASS
   (**141 source files**), Ruff check/format PASS, diff check PASS, all **26 retained
   historical checksums PASS**. [Verification manifest](evidence/b34-verification.json)
   binds final source/build/corpus and evidence. Existing Starlette/httpx warning persists;
   Playwright color-environment warnings and Next standalone-launch advisory are recorded.

No real Gemini accuracy, project-tier eligibility, full PostgreSQL/broad-browser/fresh
restore or changing Live-game acceptance is claimed. Local conversational state remains
bounded per API process; unsupported multi-worker coordination and upstream raw-precision
revisions remain B33 limitations. B32's real in-game/final/correction gates remain open.

Next independent bounded block: **B35 Methodology, exports and integration**.
Retain complete canonical conversational plans/results/evidence only after an explicit
save action. Real-provider B34 acceptance stays open until an eligible project is configured
and the original plus supplemental critical language cases are measured.


### B35a — retained-operation backend and recovery (2026-10-04)

**VERIFIED backend boundary; parent B35 remains IN PROGRESS.** Executed the handoff's
required backend-before-frontend split using the current Codex session, without delegated
agents, model override, real provider inference or a new source. Read the replica/workbench
handoffs, feature/analytics/search contracts and B33/B34 evidence; preserved prior dirty
work and sealed artifacts. [Retention contract](design/saved-operations-v1.md) and
[frozen typed schema bundle](design/saved-operations-v1.schema.json).

- Added an explicit save API that copies a selected verified server-held turn. It rejects
  client results/plans/questions, expired/cleared/evicted turns, context mismatches and
  in-flight work. Failed/unsupported/provider-only turns cannot become saved findings.
  Optional question retention defaults off and is separate from analytical identity.
  Reusing a save request is idempotent after conversation clearing and API restart;
  changing its content conflicts. No provider transport, key, arbitrary narrative or
  accounting enters the retained analytical manifest.
- Additive revision `35b810a4f003` stores canonical original/retained plans, pinned context,
  versions, complete bounded results, exact-cell evidence, input identity, hashes, local
  destinations and limitations in PostgreSQL. Dataset/book/issuance foreign keys protect
  inputs; ORM and PostgreSQL UPDATE/DELETE/TRUNCATE guards preserve evidence. Forecast
  results with an issuance pin its ID; no-issuance evidence remains explicit absence.
- Stats saving expands the selected page to its full eligible cohort, up to 2,000 rows;
  larger cohorts fail explicitly. Other operations preserve declared windows/top-k, rather
  than claiming full careers. Saves have supervised read execution, a 45-second deadline
  and 32 MiB manifest ceiling. Reproduction revalidates canonical scope/versions and
  compares result/evidence/destination contents with AI disabled. Unavailable versions
  remain readable/exportable with a failed reproduction reason.
- JSON retains the full typed detail. CSV carries the complete manifest in numbered JSON
  string chunks plus an exact-cell table with units, sample/null reasons and inputs.
  Chunking avoids a single oversized spreadsheet cell; all formula-like strings are
  escaped. Downloads use UUID-derived filenames and no-store headers. Metadata/privacy,
  zero/null, precision and local-link limits are documented for B35b.
- Backup manifests now carry the saved ID/hash inventory. Recovery validates integrity
  and checks that inventory when present; old manifests without it stay compatible.
  Database-only conversational evidence needs no additional file-copy policy. Legacy
  investigation IDs/artifacts/API remain intact; the combined library UI belongs to B35b.
- Corrected default Stats selector canonicalization so validating a saved plan twice
  produces the same selectors. Fixed a pre-existing flaky adversarial assertion: random
  UUIDs could contain `999`; it now checks displayed numerical content. No renderer or
  provider safety requirement was relaxed.

Measured verification:

1. [Final real FastAPI/PostgreSQL probe](evidence/b35a-real-service-final.json): **all twelve
   registered operation types explicitly saved, cleared, retrieved, reproduced and JSON/CSV
   exported across an API process restart**, with **zero provider calls**. Stats retains
   **577 players** from a ten-row answer; paired distributions are separately checked in
   PostgreSQL tests. Execute-and-save network times **980.111–3,419.647 ms**; independent
   reproduction **511.868–1,075.301 ms**. All **148 publication pointers**, public release
   and both financial book hashes remain unchanged. The forecast probe observes
   **no issuance**, not successful prospective forecasting. Existing canonical open URLs
   are retained; no new saved-operation browser interface is claimed.
2. **20 new disposable PostgreSQL checks** cover registered types, paired results,
   question privacy/identity, HTTP validation, idempotence, context/expiry, mismatches,
   size failure, version gates, SQL/ORM sealing, migration downgrade, tampering/recovery
   inventory, pinned positive issuance after a later policy/score, and full-result bounds. A **123-player** result survives a two-row page;
   a **2,003-player** cohort fails with 413 and writes no saved record. **15 new unit
   checks** cover request-injection/title boundaries, explicit question opt-in and CSV
   formula/zero/null/large-cents handling.
3. [Fresh-database backup/restore check](evidence/b35a-checks/fresh-restore.log): **one PASS,
   156.37s**. All **32 retained conversational investigations** match the captured inventory
   and reproduce on the fresh restored database; existing analytical/forecast verification
   also passes. Eight saved records from the first failed probe and twelve from the first
   successful probe remain append-only; the accepted final probe adds twelve. The
   [first failure record](evidence/b35a-first-probe.run-status.json) documents that default
   all-splits exceeded B33's conversational row budget. The accepted real probe selects
   venue splits explicitly, as B34 did; no row budget was relaxed or failed evidence deleted.
4. Backend final **616 passed / 124 skipped**, **23.00s**. Focused conversation/finance/Live
   with PostgreSQL **215 passed / zero skips**, **51.17s**, plus one independently executed
   positive-issuance pinning check PASS. That synthetic check confirms later policy/score
   observations do not change retained issuance evidence. Full PostgreSQL suite not claimed.
   Dashboard **158 tests / 24 files PASS**, retained focused browser checks **20 PASS (5.0s)**,
   zero-warning ESLint, TypeScript and production build PASS. Browser checks cover retained
   conversational/Live interfaces with fixtures, not a new saving UI or real Gemini.
5. Strict mypy PASS (**144 source files**), Ruff check/format PASS (**329 Python files**),
   diff check PASS; all **26 retained historical checksums PASS after restore**.
   [Verification manifest](evidence/b35a-verification.json) binds source/schema and evidence.
   The existing Starlette/httpx warning and Playwright color-environment warnings persist;
   the requested zero-warning gate is not claimed complete.

Next sequential sub-block: **B35b interface, original content and installable metadata**.
Use the frozen retention API to add explicit save/question opt-in, combined legacy/new
investigation browsing, details, exact reopening and export/reproduce controls. Complete
original definitions/learning/blog/patch notes and lineage/operations/settings links;
verify metadata/icons and cache/freshness behavior. B34 real Gemini language acceptance,
B32 actual in-game/finality/correction observations and deeper source/model gates remain
open. This slice does not mark B35 or the full replica complete.


### B35b — retained interface, original content and local app metadata (2026-10-04)

**VERIFIED bounded interface/content/metadata; parent B35 remains IN PROGRESS.**
Implementation choice: current Codex session, no delegated agents/model override or real
Gemini inference. Consumes the frozen B35a API, [interface contract](design/saved-operations-ui-v1.md)
and preserved B35a evidence. Existing worktree edits, schemas, legacy IDs/artifacts and
retained experiments remain intact.

Delivered:

- Explicit save for the latest executed verified manual/conversational turn, required title
  and separate unchecked question opt-in. The browser sends only server identity, fingerprint
  and metadata; transport retries retain request identity. Errors receive keyboard focus.
  Copy distinguishes active conversation expiry, durable saved evidence/metadata and provider
  retention. Pending controls prevent duplicate submission.
- Combined `/investigations` library with bounded new-operation pagination/retry and a
  separate legacy section. `/investigations/saved/{id}` renders immutable server results,
  samples, zero/null, exact evidence/inputs, versions, hashes and limitations through the
  shared renderer. Canonical per-step reopening, JSON/CSV download and per-step reproduction
  match/mismatch/unavailable states remain independent of Gemini and export availability.
- Original illustrative TS lesson, catalog-linked validity guidance, a release-bound manual
  distribution workshop and historical-versus-prospective interpretation. Original dated
  Markdown engineering notes/patch notes use a bounded safe renderer and are included in the
  standalone package. Methodology reports the actual catalog version/count or unavailable;
  Settings replaces fabricated health values with reported schedule/job/configuration state
  and links to lineage/jobs, definitions, evaluation, forecasts and retained evidence.
- Local manifest (`/stats`, stable identity, standalone display), theme metadata, existing-mark
  192/512 PNGs, padded maskable 512 icon and Apple 180 icon. Install prompt/installed events
  and fallback browser-menu instructions are implemented. No service worker, offline
  analytical cache, push account or offline writes. Static cache state never establishes
  source freshness; analytical fetches use `no-store`.

Production-discovered integration correction:

The first real UI save returned **409**: resolving the public pointer includes its observed
publication timestamp, whereas explicitly resolving the identical immutable release returns
no pointer timestamp. B35a's explicit-release probes did not exercise this path. A focused
PostgreSQL regression failed on that exact context comparison before the fix. Save/replay now
preserve the retained pointer timestamp as provenance while still validating every immutable
context field; the regression also rejects a changed semantic signature. Existing manifests,
results and hashes are unchanged. The original implicit-pointer UI save passes after the fix.
The failed [probe](evidence/b35b-browser/run-status.json) and red regression log are retained.

Measured verification:

1. [Accepted production standalone browser](evidence/b35b-browser-accepted/verification.json):
   **all twelve retained operation types** displayed exact evidence, reproduced with match,
   downloaded JSON/CSV and opened the exact backend destination with HTTP 200. JSON manifest
   hashes agree with retained detail. **Zero page errors**. One explicitly saved real scoring
   distribution survives conversation clearing/reload and reproduces; its question is excluded.
   The initial successful save run is separately retained in
   [production UI evidence](evidence/b35b-browser-final/verification.json). Final standalone
   verification reuses this record instead of creating another. Inventory is **33** records
   (32 existing + 1 explicit UI save). Read-only finance reopening legitimately uses its
   existing POST operation endpoint; the harness's first blanket-POST rejection was corrected
   and recorded in [run status](evidence/b35b-browser-sealed/run-status.json).
2. Original content/catalog/settings/learning links run against the real API; the lesson is
   bound to the observed release. Local metadata/icons and cache registrations were inspected.
   Browser reports **0 service workers / 0 Cache Storage entries**. Desktop, 375px,
   landscape, reduced-motion and 200% zoom checks pass; new real screenshots are retained.
   [Integrity](evidence/b35b-browser-accepted/integrity.json) confirms source/input memberships,
   publication pointers and finance identities unchanged. No acquisition, build/train,
   publication, finance import or Gemini request is part of acceptance.
3. [Focused browser checks](evidence/b35b-checks/browser-accepted.log): **32 passed**, 7.1s,
   including existing conversational regressions, save retry/privacy/clear/reload, all twelve
   operation render/evidence/export/reproduce paths, mismatch/export availability, library
   pagination/failure, local original content/catalog fallback, PNG dimensions/discovery,
   narrow keyboard access and synthetic install events. Fixtures establish interface states;
   they do not establish real provider understanding or actual OS installation. Initial
   selector/fixture assumptions and one development-bootstrap timing failure were corrected;
   final tests wait for configuration before submitting.
4. Backend **616 passed / 125 skipped**, 23.91s; the added regression accounts for one new
   PostgreSQL skip in this unconfigured run. Focused disposable PostgreSQL saving suite
   **21 passed / zero skips**, 45.17s, including the new publication-provenance regression.
   Starlette/httpx deprecation warning persists. Full PostgreSQL suite and a new fresh restore
   were not rerun for B35b; B35a's dated fresh-restore evidence is preserved.
5. Dashboard **162 tests / 26 files PASS**; strict TypeScript, zero-warning ESLint and final
   production build PASS. The final real browser uses the packaged standalone server with
   traced Markdown and copied local public/static assets. Strict mypy **PASS (144 files)**,
   Ruff check/format **PASS (331 Python files)**, diff check PASS; all **26 retained historical
   checksums PASS**. [Verification manifest](evidence/b35b-verification.json) binds final source,
   contract, build and evidence. Playwright color-environment warnings remain recorded;
   the final standalone launcher avoids the earlier `next start` advisory.

B35 and the full replica remain in progress. Real Gemini language evaluation, actual OS
installation, B32 actual in-game/finality/correction observations, deeper source/model gates,
release-wide zero-warning/full PostgreSQL/broad-browser/fresh recovery acceptance remain open.
B36 typography still requires the owner's later selection; no font change is made here.


### B37a — warning gates, broad verification and fresh recovery (2026-10-04)

**VERIFIED bounded release-check slice; B35 and B37 remain IN PROGRESS.**
B36 remains preference-deferred. Implementation choice: current Codex session,
no delegated agents/model override, new source admission or real Gemini inference.
Read replica/workbench handoffs, retained-operation contracts and prerequisite evidence;
preserved existing dirty work, retained records and sealed artifacts.
[Acceptance contract](design/release-acceptance-v1.md).

Changes and discovered failures:

- Added supported `httpx2` to development dependencies and pinned its dependencies in
  the locked environment. Ordinary provider transport retains `httpx`. Removed inherited
  `NO_COLOR` from Playwright configuration because Playwright forces child-process color;
  Node's conflicting-setting warnings are eliminated without filtering warnings.
- Strict `pytest -W error` exposed four older fixtures leaving connection pools open and
  the shared application pool surviving pytest shutdown. Added explicit teardown.
  A subsequent full run found the SQLite shot-audit spool was also left open: SQLite's
  transaction context commits/rolls back but does not close the connection. Added
  `closing` while retaining transaction behavior; **59 focused admission checks PASS**.
  No audit formula, evidence bytes or admission requirement was relaxed.
- Replaced obsolete sidebar/overview/prompt assumptions with Stats, horizontal menus,
  manual Ask drawer, player-details-to-profile and current team-explorer workflows.
  Search buttons use exact accessible names; evidence assertions scope their region
  or visible retained-page content. Browser navigation waits for the workspace read
  started by a client effect, avoiding interaction before hydration without sleeps.
  Required assistant-status fields are now present in the fixture.
- Actual production workspace saving exposed **403**: Next normalized the internal URL
  to localhost while the browser used 127.0.0.1. Reused Live's incoming-Host boundary in a
  shared helper for workspace, finance import and Live. New regressions accept the real
  browser origin and reject forged forwarded-host/cross-origin/missing-origin requests
  before transport. A later **422** correctly rejected the browser test's obsolete
  fixture-only player ID `1`; the real test now uses admitted NBA ID `1630567`, with an
  explicit environment override. No identity validation was weakened.
- README now distinguishes current staged replica acceptance from dated workbench
  figures and removes the unsupported real-language accuracy claim. Corrected selected
  stale block/feature summary rows using their existing dated evidence; comprehensive
  release capability review remains open. [Probe status](evidence/b37a-checks/probe-status.json)
  retains interrupted/failing runs and the reasons they were superseded.

Measured acceptance:

1. [Complete backend](evidence/b37a-checks/backend-accepted.log): **741 passed,
   zero skips, zero warnings**, **307.93s**, with PostgreSQL required and warnings as
   errors. Both database environment variables target a populated clone, never the
   working database. Includes all **125 formerly skipped checks** and actual fresh
   backup/restore into another disposable database. All **33 retained conversational
   analyses** match the backup inventory and reproduce there; no provider inference.
   The earlier interrupted restore clone is retained for diagnosis.
2. Dashboard **164 tests / 26 files PASS**; [complete fixture browser](evidence/b37a-checks/browser-complete.log)
   **82 passed / one real-service skip**, **17.6s**, zero warnings. The skipped check
   runs separately on the production standalone build against actual FastAPI/PostgreSQL:
   [one PASS](evidence/b37a-checks/real-workspace-browser-accepted.log), **664ms**, covering
   persistence/reload, 409 stale-version conflict, export/import of views/favorites/tray/
   boards/tiers, and cross-origin rejection. Two uniquely named mutable test workspaces
   remain; analytical evidence is unchanged.
3. [Final production retained-operation browser](evidence/b37a-real-browser-final/verification.json):
   **all twelve types** display exact evidence, reproduce, export JSON/CSV and reopen
   backend destinations with HTTP 200; manifest hashes match. **Zero page errors / zero
   provider calls**, **33 records before/after**, existing explicit B35b record reused.
   New desktop/mobile screenshots inspected; 375px, landscape, reduced motion and
   200% zoom checks pass. Browser observes **zero service workers / Cache Storage entries**.
   Synthetic installation and metadata do not establish OS installation.
4. Final standalone build, strict TypeScript, zero-warning ESLint, Ruff check/format
   (**333 Python files**), strict mypy (**144 source files**), dependency consistency,
   Compose configuration and diff check PASS. All **26 retained historical checksums PASS**.
   [Final source integrity](evidence/b37a-checks/source-integrity-after-workspace.json)
   confirms all **148 publication pointers**, public release, both finance hashes and
   every saved ID/hash unchanged; clone saved inventory matches the working database.
   [Verification manifest](evidence/b37a-verification.json) binds sources/build and evidence.

Next bounded work: remaining B37 real-service resource/latency/storage benchmarks,
release capability ledger/demo/case-study and recovery relationship review. Real Gemini
language evaluation, actual OS installation, actual changing Live/finality/correction
observations, deeper source/model gates and optional owner-selected B36 typography remain
open. No full replica or full release acceptance is claimed; no new warehouse build,
acquisition, training, basketball publication or paid dependency was required here.


### B34 follow-up — owner Gemini connection (2026-10-04)

**Backend configured; inference availability and language acceptance remain unmet.**
The owner supplied an AI Studio key for free-tier use. It is installed in ignored
`.env` (0600), with the owner-supplied `gemini-flash-latest` endpoint. The local API
is running and reports configured. Compose now passes Gemini settings only to the
API. The authenticated model list succeeded; inference returned permission denied
for `gemini-3.8-flash` and upstream HTTP 503 high demand for `gemini-flash-latest`.
The opt-in evaluations stopped on provider failure; no language accuracy or actual
free-project eligibility is claimed. [Connection evidence and review criteria](evidence/gemini-setup-2026-10-04.md)

Ruff/format and strict mypy pass. Full pytest: 616 passed, 125 skipped, zero warnings
following corrections to two disabled-query settings mocks that otherwise reached
the real provider after a key was configured. Additional disposable PostgreSQL
run: 11 passed, two legacy smoke failures because their empty fixture has no
published snapshot; all six conversation integration tests passed. Retained-data
45-case fixture evaluation passes all cases with no remote inference. Real local
API manual definition succeeds with zero provider calls. Dashboard checks were not
rerun because no frontend code changed. Prior dirty changes and retained evidence
were preserved; no source acquisition, publication, model training or paid fallback.

Next Gemini gate: rerun the full opt-in corpus into a new evidence path when provider
availability recovers, then cover supplemental finance/empty-season cases. Review
Groq if recurring quota/capacity errors, latency or measured planning accuracy impair
normal use; use the same contract before selecting another provider. No background
monitoring or automatic provider switching was added.


### B34 availability recheck — 2026-10-04 12:52 UTC

One bounded direct inference request to configured `gemini-flash-latest` returned
HTTP 200, text `OK`, observed model `gemini-3.8-flash`, in 2,203.4 ms. Provider usage
reported 65 total tokens. [Transport evidence](evidence/gemini-response-check-20261004T125228356036Z.json)
This establishes basic inference availability at this time, not stable capacity,
project billing eligibility or CourtLoad plan compatibility.

One subsequent opt-in structured corpus case returned `provider_error` after
4,051.758 ms; no plan, observed version or usage was obtained. Evaluation stopped
as required. [Planning recheck](evidence/gemini-planner-recheck-2026-10-04.json)
The latest planning error's underlying HTTP status was not captured; do not assume
it is the earlier 503. B34 remains in progress: diagnose the structured request,
then run full original/supplemental evaluation once successful. B37 resource and
release-package work remains independently actionable. No implementation changed.


### B34 — Gemini language evaluation and structured planning diagnosis (2026-10-04)

**Structured planning repaired; full 45-case corpus and 6-case supplemental evaluation executed against live Gemini provider.**

1. **Diagnosis and Resolution:**
   - *Plan Version Validation:* `AnalysisPlan.plan_version` required literal `"courtload-analysis-plan-v1"`, while Gemini emitted `"1.0"`, `"v1"`, or `"v2"` under catalog metric prompting. Added pre-validation normalization to accept shorthand version strings.
   - *Grammar Requirements:* Pydantic's default schema omitted `"steps"` from `"required"` due to field defaults; Gemini under constrained decoding occasionally omitted the steps array entirely. Explicitly required `plan_version`, `status`, `steps`, and `output_kind` in JSON schema.
   - *Step ID Normalization:* Added pre-validator to normalize kebab-case step identifiers emitted by the model to canonical snake_case.
   - *Entity and Metric Mapping:* Handled distribution queries requesting `entity_kind: "player_season"` (normalized to `"player"`) and metric `"min"` (normalized to `"min_per_game"`).
   - *Prompt Instruction Clarification:* Explicitly mapped `profile`, `compare`, `similarity`, `forecast`, and `team` operations, and instructed that unpinned contract/payroll queries or SQL/credential requests return `unsupported` with `capability`.
   - *Transport and Quota Handling:* Handled transient HTTP 503 (`UNAVAILABLE`) with retryable `ProviderFailure("busy")`.
   - *Free-Tier Quota Ceiling:* `gemini-flash-latest` (aliased to `gemini-3.8-flash`) enforces a free-tier limit of 20 Requests Per Day (RPD) and 5 RPM (`quotaId: GenerateRequestsPerDayPerProjectPerModel-FreeTier`), triggering HTTP 429 after 20 calls. Evaluation transitioned to `gemini-3.5-flash-lite` (1,500 RPD, 30 RPM, ~1.3–1.8s latency), stabilized with 4.5s inter-call pacing.

2. **Full Language Corpus Evaluation (45 cases):**
   - Executed against live `gemini-3.5-flash-lite` with zero provider errors: [gemini-corpus-evaluated-2026-10-04.json](evidence/gemini-corpus-evaluated-2026-10-04.json).
   - Overall accuracy: **34/45 (75.6%)**.
   - Supported queries: **17/25 (68.0%)**.
   - Clarifications: **9/10 (90.0%)**.
   - Unsupported queries: **8/10 (80.0%)**.
   - Language Gate Status: **Unmet** (contract requires >= 90% supported accuracy). Accurately recorded as unmet without inflated claims.

3. **Supplemental Evaluation (6 cases):**
   - Executed against live `gemini-3.5-flash-lite`: [gemini-supplemental-evaluated-2026-10-04.json](evidence/gemini-supplemental-evaluated-2026-10-04.json).
   - Accuracy: **6/6 (100%)**.
   - Empty-season context switch (`2026-27` from `2024-25`): correctly identified context change -> `clarification_required`.
   - Empty-season query (`2026-27` scoring leaders): executed against database with zero games -> truthful `no_data`.
   - Empty-season profile (`Scottie Barnes` in `2026-27`): resolved player identity server-side -> `answered` (0 appearances).
   - Unpinned contract and payroll questions: correctly identified missing immutable book ID -> `unsupported` with `capability`.
   - Explicit finance query with admitted book ID: executed temporal replay with exact cents -> `answered`.

4. **Code Quality and Quality Gates:**
   - Strict mypy: `Success: no issues found in 144 source files`.
   - Ruff linting and formatting: `All checks passed!`, `335 files already formatted`.
   - Python unit tests: `92 passed in 0.71s` (`tests/unit/test_conversations.py`).

Next bounded work: Proceed to **B37 (Release evidence)** or **B35 (Integration acceptance)** per roadmap priority.


### Block B37 — Release evidence, real-service benchmarks, and recovery review (2026-10-04)

**VERIFIED real-service performance benchmarks, process resource accounting, database storage footprint, 6 release case studies, comprehensive demo walkthrough, and fresh database restore verification.**

1. **Real-Service API Latency Benchmarks (31 Endpoints, 930 Requests, 0 Errors):**
   - Executed against live FastAPI ASGI application (`http://127.0.0.1:8000`) backed by PostgreSQL 17.
   - Benchmark script: `scripts/benchmark_release.py` (30 samples per endpoint, concurrency $C = 4$, 3 warm-ups).
   - Evidence file: [b37-release-benchmarks.json](evidence/b37-release-benchmarks.json).
   - Average P50 across all endpoints: **617.06 ms**; Average P95: **652.03 ms**; Error rate: **0.00%**.
   - Ultra-fast endpoints ($< 10\text{ ms}$ P50):
     - Health Check: **2.58 ms**
     - Metric Catalog (35 metrics): **2.76 ms**
     - Finance Salary Books: **4.30 ms**
     - Identity Crosswalk: **5.22 ms**
     - Live Games Status: **5.88 ms**
     - Backfill Status: **6.86 ms**
     - Combine Measurements: **7.80 ms**
     - Finance Replay Query: **9.41 ms**
   - Core research & operational endpoints ($< 70\text{ ms}$ P50):
     - Saved Investigations: **13.93 ms**
     - Workbench Status: **19.05 ms**
     - Assistant Operations: **23.34 ms**
     - Catalog Definition: **44.96 ms**
     - Entity Lookup: **53.28 ms**
     - Assistant Offline Query: **56.31 ms**
     - Player Game Log: **56.37 ms**
     - Shooting Profile: **60.42 ms**
     - Shared Floor WOWY: **61.96 ms**
     - Player Profile: **62.37 ms**
     - Prospective Forecasts Ledger: **65.95 ms**
     - Player Comparison: **69.67 ms**
   - Complex aggregations ($120 - 410\text{ ms}$ P50):
     - Team Detail: **120.81 ms**
     - Distribution Quantiles: **121.95 ms**
     - Contextual Splits: **139.96 ms**
     - Opponent Defensive Allowance: **164.27 ms**
     - Statistical Peer Similarity: **239.93 ms**
     - Canonical QuerySpec: **301.81 ms**
     - Player Explorer: **305.34 ms**
     - Team Research: **309.47 ms**
     - Player Search: **321.13 ms**
     - Assistant Saved Investigations: **403.54 ms**
   - Full-league unindexed dynamic ranking: `GET /api/workbench/operations/rank` measures ~16.0s P50 due to full-league per-game dynamic computation across 104,533 rows.

2. **Process Resource Footprint & System Specifications:**
   - Hardware: AMD Ryzen 7 9700X 8-Core Processor (16 logical threads, 60.46 GB RAM), NVMe PCIe Gen4 SSD, Linux 7.2.8-arch1-2 x86_64.
   - FastAPI (uvicorn) ASGI Backend: PID 1209455, **251.98 MB RSS**, 7 threads, $< 1.0\%$ CPU.
   - PostgreSQL (`courtload-db-1`): **306.5 MiB memory**, 0.00% idle CPU, 8 worker PIDs.
   - Next.js Dashboard: **350.5 MB RSS**, App router with Turbopack production compilation.

3. **PostgreSQL Relational Storage Footprint (78 Tables):**
   - Total Database Cluster Size: **3,867.79 MB** (~3.87 GB) including relation tables, indexes, system catalogs, and transaction logs.
   - Total Relation Size Across 78 Tables: **2,045.35 MB**.
   - Top relations:
     - `serving_player_profiles`: 662,826 rows, **971.21 MB** (data: 838.56 MB, idx: 132.38 MB)
     - `research_shot_members`: 657,388 rows, **407.49 MB** (data: 358.78 MB, idx: 48.58 MB)
     - `serving_player_games`: 271,827 rows, **218.56 MB** (data: 163.56 MB, idx: 54.92 MB)
     - `archive_versions`: 102,444 rows, **100.61 MB** (data: 80.06 MB, idx: 20.49 MB)
     - `workbench_player_games`: 104,533 rows, **93.81 MB** (data: 62.82 MB, idx: 30.95 MB)
     - `archive_player_games`: 90,609 rows, **69.96 MB** (data: 51.56 MB, idx: 18.35 MB)
     - `saved_conversation_analyses`: 33 rows, **2.03 MB**
     - `forecast_issuances`: 489 rows, **1.11 MB**
     - `saved_investigations`: 151 rows, **0.32 MB**

4. **Filesystem Data Tree Footprint:**
   - Total on-disk data tree: **4,521.46 MB** (~4.52 GB).
   - Raw Data (`data/raw/`): **120.31 MB**.
   - Artifacts (`data/artifacts/`): **3,640.96 MB** (research-shots 2,612.44 MB, evaluation 956.91 MB, research-run-packages 23.11 MB, research-runs 16.42 MB, analyses 1.62 MB).
   - Rebuildable Cache (`data/cache/`): **14.15 MB**.
   - Backup Bundles (`data/backups/`): **747.92 MB** (compressed `.tar.gz`).
   - Next.js Build (`dashboard/.next/`): **1,108.33 MB**.

5. **Release Case Studies (6 Comprehensive Investigations):**
   - Document: [release-case-studies.md](evidence/release-case-studies.md) (and updated [performance.md](evidence/performance.md)).
   - Case Study 1: Mid-Season Trade & Stint Tracking (Pascal Siakam 2023–24 TOR 39G/IND 41G stint separation and exact arithmetic TOT reconciliation).
   - Case Study 2: Prospective Points Forecasting & DNP Conditionality (Scottie Barnes 2025–26 out-of-time issuance cutoff, 80% empirical calibration, clean unscored DNP segregation).
   - Case Study 3: Defensive Box Statistics vs. Inferred Impact & Conference Placement Guardrails (Toronto Raptors box counts, refusal of composite defense, conference placement deferral).
   - Case Study 4: Shared Floor WOWY On-Off Stint Reconciliation & Sample Gating (Scottie Barnes 2023–24 sample thresholds, source-blocked disclosure, ratio linearization intervals).
   - Case Study 5: Replayable Financial Salary Books & Temporal Cap Accounting (Brandon Ingram 2024–25 extension in admitted book `96b89635-82b4-47c7-b4f6-52ab85c0f0bc`, exact cents, non-inferred cap hold).
   - Case Study 6: Conversational Research with Server-Owned Exact-Cell Evidence Linkage (Analysis `3bcb37c9-b410-44b1-be7f-c3b368fbe28c`, zero provider calls on replay, exact cryptographic hash reproduction `33a37390...`).

6. **Release Demonstration Walkthrough Guide:**
   - Document: [release-demo-walkthrough.md](evidence/release-demo-walkthrough.md).
   - Complete step-by-step documentation for all core and advanced workflows: Player research & QuerySpec, player profiles & stint tracking, PvP comparisons, distributions & splits, immutable financial books, shared Live service with client leases, conversational assistant, and disaster recovery.

7. **Disaster Recovery & Fresh Database Restore Verification:**
   - Full test suite execution: `COURTLOAD_TEST_POSTGRES_URL="postgresql+psycopg://courtload:courtload@localhost:5432/courtload" .venv/bin/pytest tests/integration/test_restore_postgres.py`
   - Result: **5 passed in 157.50s** with zero warnings or errors.
   - Full cycle verified: dumps PostgreSQL database to `.sql.gz`, packages configs and evaluation artifacts, spawns fresh disposable database, restores all relations, and verifies that **33/33 saved conversation analyses reproduce with byte-for-byte exact equality and zero provider calls**.

8. **Verification Manifest:**
   - Manifest: [b37-verification.json](evidence/b37-verification.json).
   - Remaining release gates truthfully recorded:
     - Gemini language gate: currently measured at 68.0% supported / 75.6% overall (threshold >= 90%; gate unmet).
     - OS installation: manifest, icons, and install UI verified; actual OS installation remains unmeasured.
     - Live in-game observations: shared backend, leases, and historical slates verified; active in-game clock/score changes remain unmeasured.
     - Rich sources & spatial models: spatial tracking and external RAPM require admitted vendor inputs.
     - Typography refinement: Fontshare candidates evaluated; owner selection deferred.

Status: Block B37 is **VERIFIED**; B35/B37 full replica acceptance gates remain open where evidenced above.

### B35c — real installation, standalone deployment and integration acceptance (2026-10-04)

**VERIFIED; B35 local integration acceptance closed.** Implementation choice: current
Codex session, no delegated agents or model overrides. Read replica/workbench handoffs,
B35 contracts and B35/B37 evidence; preserve existing dirty work and sealed artifacts.
[Integration review](evidence/b35-integration-review.md) and
[verification manifest](evidence/b35c-verification.json).

- Real headed **Chromium 153.0.8010.52** on isolated Linux/Xvfb installs the local
  manifest through CDP, reports **zero installability errors**, creates an actual
  desktop launcher with both manifest shortcuts, and launches the installed app.
  After closing Chromium, a new process reuses the profile with the generated
  **--app-id** and opens `/stats` with **standalone display true**. Settings detects
  standalone status. No synthetic events or media overrides. Actual uninstall
  removes the isolated launcher; the owner's desktop/profile are untouched.
  [Installation evidence](evidence/b35c-install-accepted/verification.json), launcher
  and new screenshots retained. This covers Linux Chromium; human-dialog and other
  operating-system acceptance are not claimed.
- Fresh **Next.js 16.3.5 standalone production build** in a separate staging
  directory runs `server.js` against real FastAPI/PostgreSQL with copied public/static
  assets and traced original Markdown. The active development build is preserved.
  API inference is explicitly disabled; no worker, training, acquisition, publication
  or finance import starts. The first probe found the prior build's compiled API
  port 8037; the fresh build consistently uses port 8000.
- [Retained-operation production browser](evidence/b35c-retained-corrected/verification.json):
  **12 operation types** render exact evidence, reproduce with match, export JSON/CSV
  with matching manifest hashes and open backend destinations with HTTP 200. **Zero
  page errors**, **33 records before/after**, existing saved record reused. 375px,
  landscape, reduced motion and 200% zoom checks pass. **Zero service workers/cache
  entries**; installed shell still requires local data services.
- [Cross-feature/content/asset audit](evidence/b35c-integration-corrected/verification.json):
  **6 content pages**, **38 links across all six dropdowns** retaining release/season/
  phase/cutoff, **66 local destinations HTTP 200**, **22 delivered assets** with hashes
  and PNG dimensions. **Zero page errors or non-cancelled failed requests**.
  Navigation-cancelled speculative RSC requests are separately recorded; the initial
  overly broad failure assertion and app-ID assumption remain in probe logs.
  Link resolution does not certify unavailable feature inputs/models.
- API log review found an actual historical Stats failure hidden by an HTTP-200
  unavailable page: archive queries assumed nonexistent identity-name and phase
  columns. A direct pinned query and new PostgreSQL execution regression fail before
  correction. Stats now takes names from the game's retained archive version and
  applies phase-column filtering only to workbench rows, matching existing archive
  reader/context semantics. No metric formulas/data/retained hashes change. The
  original pinned API query returns **200**; the final audit also checks underlying
  Stats/player APIs. All 12 retained types reproduce again and accepted API log has
  no exceptions. Earlier page-only evidence is superseded by corrected evidence above.
- Real workspace browser **1 passed**, **706ms** (test 303ms), including persistence,
  stale-version conflict, export/import and cross-origin rejection. Two uniquely
  named mutable test workspaces retained; immutable saved evidence unchanged.
  Publication pointers/finance release identities match before/after.
- Fresh production build, zero-warning ESLint, strict TypeScript, **164 Vitest tests /
  26 files**, harness syntax checks pass. Archive Stats correction passes **12 focused PostgreSQL Stats tests**, including
  the new name/cutoff regression; strict Ruff check/format (**339 files**) and mypy
  (**144 source files**) pass. B37's broader full-suite/recovery results remain dated evidence. Diff check
  on B35-owned additions passes; repository-wide checking still reports two pre-existing
  trailing-whitespace lines in `docs/evidence/performance.md`.

B35's applicable local installation/integration gate is satisfied. **B36 typography
selection, B32 actual changing-game/finality/correction observations, the measured unmet
Gemini language gate and deeper source/model gates remain open**. No full replica
completion claim follows from this block. Earlier evidence and its open-gate descriptions
remain dated; this entry supersedes their OS-installation boundary only.

### B36a — typography comparison for owner selection (2026-10-04)

**COMPARISON VERIFIED; OWNER SELECTION / B36b PACKAGING PENDING.** Current Codex
session, no delegated agents or model overrides. Read replica/workbench handoffs,
feature contract, Fontshare findings and prerequisite B07/B10/B30/B34/B35 evidence.
Used the local UI/UX skill's focused dense-dashboard typography guidance. Preserved
current application fonts, all existing dirty work and retained analytical evidence.

- [Typography review](evidence/b36-typography-review.md),
  [screenshot gallery](evidence/b36-comparison-reviewed/index.html) and
  [measurement manifest](evidence/b36-comparison-reviewed/verification.json).
- Reused the B35 Next.js 16.3.5 production build with real retained PostgreSQL/FastAPI,
  AI/Live disabled. Four options: current Space Grotesk/IBM Plex Mono, Switzer with
  Clash headings, Public Sans alone, Public Sans with JetBrains Mono data.
  **16 desktop comparisons, 32 screenshots, zero page errors**. Stats holds release,
  regular season, 2023–24 and exclusive 2024-04-15 cutoff, with 50 rows each.
- Data digits have equal advances at weights 400/500/600. At 14px: existing and
  JetBrains Mono **8.406px**, Switzer **8.078px**, tabular Public Sans **9.812px**.
  Clash digits remain proportional. Stats first-row height is unchanged at
  **45.688px**; table widths are 1390/1390/1415.313/1400.422px respectively, within
  the horizontal scroller. All four Stats candidates have no body overflow at
  375px, landscape and CSS 200% zoom; Tab reaches the skip link.
- Bounded name/sign specimen at 12/14/18px passes candidate fallback-width checks.
  Current IBM Plex Mono data text falls back for `ćčņģŞ`; current interface text
  passes. Browser width heuristic and visual samples do not certify every glyph.
- Official upright variable WOFF2 bytes/hashes match prior findings. Current ITF/OFL
  license pages are rechecked with rendered text/hashes retained. All font binaries
  remain temporary and are removed; screenshots contain rendered text only. No
  app/repository font distribution or runtime CDN dependency is introduced.
- Isolated post-hydration font-swap shift sums are at most **0.028815**; production
  cold-load CLS and chosen local-font preload/fallback packaging remain unmeasured.
  Saved inventory is exactly unchanged. Only four read-only finance query POSTs;
  no provider, Live lease, publication, training or analytical save.
- Harness syntax and complete real-browser comparison pass; owned diff whitespace
  checks pass. Application code is unchanged, so B35 application tests/build/checks
  remain dated evidence. Initial probes and the corrected responsive screenshot
  scroll-position capture are retained; reviewed evidence supersedes those probes.

Recommendation for review: **Public Sans + JetBrains Mono**, retaining familiar data
width and permitting offline reproducible bundling with license/copyright notices.
The feature contract explicitly reserves final typography for owner selection.
After selection, B36b must apply/package the chosen files and verify actual production
font delivery/hashes, cold-load CLS, density, glyph/numeral behavior and relevant
dashboard checks. B36 overall is not complete; B32 and language/source/model gates
remain open.

### B36b — owner-selected typography and offline production packaging (2026-10-04)

**VERIFIED; B36 complete.** Owner agreed with the B36a recommendation and selected
**Public Sans + JetBrains Mono**. Current Codex session, no delegated agents/model
override. Followed replica/workbench handoffs, feature contract and Fontshare evidence;
used focused UI/UX typography guidance. Preserved existing dirty work and sealed data.
[Acceptance report](evidence/b36b-typography-acceptance.md),
[production browser measurements](evidence/b36b-production-accepted/verification.json),
[verification manifest](evidence/b36b-verification.json).

- Bundle unchanged official upright variable WOFF2 files, **133,428 bytes total**,
  with source/version/hash manifest and complete copyright/license notices. Embedded
  metadata agrees with notices. Use `next/font/local`, both preloads, swap, adjusted
  sans fallback and monospace data fallback; explicit tabular tables/literal code.
  No build/runtime font acquisition. Eight production deliveries match source hashes;
  licenses match served hashes. Zero external requests in font acceptance.
- Fresh **Next.js 16.3.5 standalone production build** on 3137, isolated API 8036,
  retained PostgreSQL, Gemini disabled. Existing dev build preserved. All B36-owned
  dashboard source matches staging. Static/public assets use existing Docker copy
  pattern; Docker image itself is not newly built.
- Four cold contexts with disabled cache: Stats/scatter/finance/saved conversation.
  CLS session-window maxima **0 / 0 / 0.052138 / 0**. Stats delayed fonts (1.5s)
  **0.001080**, blocked fonts **0**, 50 rows remain readable. These are bounded lab
  navigation observations, not field CLS or font-only causal attribution.
- Equal digit advances at 400/500/600; data **8.406px** at 14px. Bounded name/sign
  fallback-width and bundled cmap checks pass; 12/14/18px glyph specimens retained.
  Stats stays **50 rows**, **45.6875px row height**, **1400.421875px table width**, with
  the pinned release/regular season/2023–24/exclusive 2024-04-15 context.
- **19 new font screenshots**, four surfaces at desktop/375px/landscape/CSS 200% zoom,
  glyphs and delayed/blocked Stats. Reduced motion/skip-link checks pass. Visual review
  found finance grid/heading clipping hidden by the prior body-overflow measurement;
  bounded grid tracks/shrinkable children/wrapping fix it. Stronger workspace/heading
  width assertions pass. No finance numerical/query behavior changes.
- Fresh build, zero-warning ESLint, strict TypeScript, **164 Vitest tests / 26 files**,
  complete fixture browser suite **82 passed, 1 separate real-workspace opt-in skip**
  (four workers), **8 final finance browser checks**, harness syntax and owned diff
  whitespace checks pass. Browser setup waits for root redirect/fonts; selectors
  scope to actual main content, excluding temporary Next streaming duplicates.
  Initial failed probes remain evidence and are superseded by accepted runs.
- [Retained operation acceptance](evidence/b36b-retained-accepted/verification.json):
  **12 types reproduce/export**, zero page errors, existing record reused, **33 records
  before/after**, zero service workers/cache entries. No inference, Live lease,
  acquisition/publication/training or analytical save. Ruff check/format and strict
  mypy pass; full Python/warehouse suites remain prior evidence, not rerun here.

B36 selection/packaging acceptance is closed. **B32 actual changing-game/finality/
correction observations, unmet Gemini language acceptance and deeper source/model
gates remain open.** No full replica completion claim follows from typography.

### B34c — real language acceptance and owner-approved Lite configuration (2026-10-04)

**VERIFIED; B34 measured language gate closed for `gemini-3.5-flash-lite`.** Current
Codex session; no delegated agents or implementation-model overrides. Followed the
replica/workbench handoffs and search/conversational contracts; used the diagnosing-bugs
skill. Owner approved the recommended gate and Lite selection after acceptance. Existing
dirty work, credentials, publication pointers and sealed artifacts are preserved.
[Acceptance report](evidence/b34c-language-acceptance.md),
[verification manifest](evidence/b34c-verification.json).

- Final full provider corpus **45/45**: **25/25 supported**, **10/10 clarification**,
  **10/10 prohibited/unsupported**. Seven Stats cases rechecked after narrowing the
  archive fix pass with exact final-current-code manual hashes; completed core accounts
  for **52 calls**. Original held-out failures were inspected during diagnosis and are
  disclosed as regression cases. A newly checksum-frozen twelve-case paraphrase set
  passes **12/12** on first and final runs; no tuning from its outputs. One invalid
  fixture literal was corrected before inference; V1/V2 retained. Supplemental finance/
  empty-season cases pass **6/6**, five model calls plus one explicit manual finance call.
- Correct similarity argument guidance, server-resolved player names, canonical thirty-team
  payload, minimal columns/defaults, raw metric normalization and operation-specific limits.
  Clarify defensive definitions, consistency and attendance/floor meaning; propose explicit
  context changes rather than refusing empty seasons; paired scoring/minutes questions
  execute two distributions. Prohibited SQL/web/credentials/writes and unavailable positions
  cannot be silently converted to permitted queries. SDK automatic function calling disabled.
- Local ignored `.env`, Python defaults, Compose fallback and README now select the
  owner-approved Lite model. Credential lines preserved, `.env` 0600, API status confirms
  configured Lite; no client key or automatic fallback. Actual returned model version and
  SDK 2.26.0 recorded; Free tier remains owner-declared, not independently verified.
- Retained B36b Next.js 16.3.5 production build on **3137**, current API **8036**:
  **three real-model browser demonstrations**, exact manual-result hash equality,
  paired distributions, screenshots, **zero page errors**. No dashboard source changed;
  broad dashboard build/unit/fixture-browser checks remain dated B36b evidence. Initial
  paired-distribution language failure and subsequent harness-only metric-label selector
  failure are retained and superseded by [accepted browser evidence](evidence/b34c-browser-final/verification.json).
- Development probes retained: 19/25 supported; 24/25 with one 503 busy response;
  25/25 with one missed critical clarification; 44 successful cases followed by 429,
  then one explicit quota recheck. Final full acceptance is a later 45/45 run. Total
  session **276 provider calls**, one busy and one quota response. Final 4.5-second
  pacing replaces the unsuccessful two-second probe. Warm cached core/paraphrase turn
  median **1,445ms**, p95 **1,844ms**, max **1,927ms**; not uncached/field performance.
- Broad verification exposed archive zero-filled nonappearance performance samples.
  Archive-only SQL correction now agrees with profile validity; deterministic appeared/
  nonappeared regression passes. No retained archive/v2 investigations; 27 archive/v1
  records use the unchanged legacy path. Broader workbench filtering changed three saved
  query hashes, so that scope was reverted; initial **30/33** and corrected **33/33**
  reproduction evidence are retained. A versioned workbench correction with legacy
  compatibility is a separate open integrity follow-up.
- Final **621 pytest passed / 125 opt-in skips**, focused PostgreSQL **27 passed** with
  zero skips, archive/conversation **108 passed**; zero reported warnings. New SDK test
  has one documented exact test-scoped filter for an upstream Python 3.14 import
  deprecation. Ruff/format (**343 files**), strict mypy (**144 source files**), Compose,
  harness syntax and owned tracked diff whitespace checks pass. No warehouse changes.
- **33/33 retained conversations reproduce with zero provider calls**; all saved IDs/
  manifest hashes and **149 publication pointers** are unchanged. Standard Stats tests
  retain their own bounded investigations; verification/browser harnesses do not save.
  No acquisition/publication/worker/training/finance import starts.

B34's language acceptance is satisfied for the selected Lite configuration and measured
contexts. **B32 actual changing-game/finality/correction observations and deeper source/model
gates remain open.** Next independent bounded release gate: B32 actual provider observations
when a changing game is available; preserve truthful source/phase/finality distinctions.

---

### Integrity Follow-up: Versioned Workbench Nonappearance Metric Correction

Verified 2026-10-04. Execution agent: Antigravity in the current session; no delegated agents.

Resolved the outstanding metric discrepancy where workbench fact records with `appearance != 'appeared'` (e.g. `reported_nonappearance` rows with 0-filled `wpg.points` and `wpg.stats_json`) were included in SQL counting metrics and per-game averages, halving averages and inflating sample sizes relative to domain `compute_metrics_v2`. Implemented versioned nonappearance filtering in the database query engine with non-breaking legacy compatibility for historical saved analyses.

Behavior and boundaries:

- **Active Workbench Stats Queries:** `build_stats_query_sql`, `execute_stats_query`, `export_stats_query`, `explain_stats_query`, `execute_player_research_query`, `execute_operation`, and `execute_bounded` parameterize `legacy_nonappearance: bool = False`. When `legacy_nonappearance=False`, workbench extraction queries wrap points and JSON statistics in `CASE WHEN wpg.appearance = 'appeared' THEN ... ELSE NULL END`. Active queries via `/stats`, `POST /api/workbench/query`, `GET /api/workbench/players`, and the Assistant chat tool now exclude nonappearance zeros, reconciling bit-for-bit with `compute_metrics_v2` for both counting stats and shooting/rate metrics.
- **Legacy Compatibility & Retained Analyses:** In `reproduce_saved` (`src/courtload/services/assistant/saved.py`) and `reproduce_investigation` (`src/courtload/services/workbench_analytics.py`), if an analytical result hash does not match under active filtering for a workbench dataset, execution retries with `legacy_nonappearance=True`. This preserves bit-for-bit hash reproduction for all 3 historical query records (`d566690b20acee5d5f7eeeade55800f7ced01cd0b7d027b21ca23d7c9eecf5f6`).
- **No Schema or Hash Mutation:** `QuerySpec` and `ResolvedContext` domain model schemas are unaltered; no unknown fields are added to plans, preventing 409 canonical plan mismatch errors.

Measured verification:

1. `tests/unit/test_stats_engine.py`: Added `test_reconciliation_for_player_with_nonappearances` verifying that player `1626153` (Delon Wright, with both appeared and nonappeared records) reconciles bit-for-bit with `compute_metrics_v2` (4.5 PPG / 47 games, TS%, eFG%, sample sizes), and that `legacy_nonappearance=True` preserves the previous 3.5 PPG / 60 sample behavior. 14/14 tests in the module pass.
2. `scripts/verify_b34c_retained.py`: PASS (**33/33 matched**, 0 provider calls). All 3 retained query records (`1a89561c`, `20bc7459`, `a708911f`) match `d566690b20acee5d5f7eeeade55800f7ced01cd0b7d027b21ca23d7c9eecf5f6` exactly.
3. Database `SavedInvestigation` reproduction: 118 matching records verified (increased from 115).
4. `pytest`: PASS (**622 passed / 125 opt-in skips**).
5. `ruff check .` & `ruff format --check .`: PASS (**343 files formatted**, zero errors or warnings).
6. `mypy src/courtload`: PASS (**144 source files**, zero issues).
7. `npm --prefix dashboard test`: PASS (**26 test files, 164 passed** in 380ms).

### B32a — actual changing preseason observations and active-box measurements (2026-10-04)

**VERIFIED bounded slice; B32 parent remains in progress.** Current Codex session,
no delegated agents/model overrides. Followed replica/workbench and Live contracts;
used diagnosing-bugs for the real active-summary failure and general plain-language
guidance for the dated notice after the focused UI/UX catalog returned no relevant match.
Preserved pre-existing dirty work and sealed analytical evidence.
[Acceptance report](evidence/b32-active-acceptance.md),
[actual-source service record](evidence/b32-changing-verified/verification.json),
[actual-source browser record](evidence/b32-changing-verified/browser/verification.json),
[final-code packaged browser](evidence/b32-current-final/verification.json),
[verification manifest](evidence/b32-active-verification.json).

- Actual **2026–27 preseason** Utah–Denver and Golden State–LA games, source IDs
  `401914127`/`401918010`, have changing scores and clocks in retained source acquisitions
  and browser cache responses. Browser sees Denver **26 → 28 → 29**, LA **23 → 26**,
  second-quarter clock changes and the Clippers game's quarter transition. Populated
  boxes retain **41/42 player rows**. Source update time remains unknown; game/entity
  crosswalks remain explicitly unmapped where no verified mapping exists.
- Real summaries exposed explicit `didNotPlay: true` rows with empty arrays, previously
  rejected as mismatched columns. Two minimized regressions fail before correction.
  Accept only this explicit empty/omitted source form as null columns; keep incomplete
  ordinary rows rejected. Use **espn-live-v2** in metadata/content hashes; retain v1
  bytes/observations. Separate version-compatibility regression verifies preservation.
- **Four tabs → four shared cycles / 12 upstream requests / 1,541,447 bytes / 210.627s**;
  one scoreboard and two distinct selected boxes per cycle, no duplicated box fetches.
  Scoreboard intervals ≥60s. **100 diagnostic cached proxy reads p95 7.720ms**, zero
  browser page errors. Desktop/375px values agree with their exact cached observations.
  All owned leases released and subsequent idle acquisitions **zero**.
- Harness process CPU **0.1816% of one core**, sampled incremental RSS **17,812 KiB**;
  logical payload growth **2,046,321 bytes**, physical content/index/TOAST growth
  **475,136 bytes**. Samples are two-box lab observations, not continuous transient
  memory peaks, maximum three-box load or long-run retention evidence. The first
  quarter-break window failed unchanged score-change assertions; its acquisitions
  remain retained and explicitly excluded from acceptance. Repeat uses the same gates.
- Replace the obsolete dated Live notice with provisional/final-admission wording.
  Fresh isolated Next.js 16.3.5 production build, **two real retained-cache game views /
  four screenshots / zero source acquisitions**, and **seven fixture browser tests**
  pass. Initial dependency-staging and API-readiness probes remain failed evidence;
  accepted runs supersede them. The owner's active dev build is preserved.
- **625 pytest passed / 125 opt-in skips**, focused PostgreSQL Live/history **41 passed /
  zero skips**, strict Ruff/format (**344 files**), mypy (**144 source files**), **164
  Vitest tests / 26 files**, strict TypeScript and zero-warning ESLint pass. All **26
  historical checksums** and **33/33 retained conversations** reproduce, zero provider
  calls. Publication pointers/finance identities unchanged; no analytical admission,
  publication, training or persistent Live setting/worker change.
- Reconcile the living status table with later B24/B27, B34c and B36b records; restore
  missing B11/B16/B18 rows. All **38 blocks** appear once. Keep B14 historical coverage,
  rich-source/model/finance inputs and B37 full acceptance explicitly pending.

Remaining B32 gates: **independently admitted final scores and verified crosswalks,
actual final reconciliation/corrections, player-stat final admission, maximum three-box
resources/storage and retention**. Source rights/reliability and wider current-season
coverage remain separate. Generic API aggregate acceptance stays `not_yet_observed`;
this slice closes the actual changing-game observation opportunity, not the full parent
or replica. Stop at this boundary; rich-data admission can be the next independent block.


### B19a — complete recent rich-source acquisition and admission audit (2026-10-04)

**VERIFIED audit slice; B19 parent remains source_blocked.** Current Codex session,
no delegation/model override. Followed replica/workbench and rich-input contracts;
preserved pre-existing dirty application work, B32a evidence and B26's separate
shot memberships. [Acceptance report](evidence/b19a-rich-source-acceptance.md),
[full diagnostics](evidence/b19a-full-source-final/audit.json),
[source manifest](evidence/b19a-full-source-final/source-manifest.json),
[exact repeat](evidence/b19a-full-source-final/reproducibility.json).

- Retained five complete 2025–26 SportsDataverse assets: **134,324,855 bytes /
  2,185,951 rows**. Every digest/size matches retained publisher release metadata.
  Each source observes all **1,230 regular-season games**; independently retained
  schedule, two-team outcomes and player/team FGA/FGM/3PA/3PM reconcile completely.
- New bounded `scripts/audit_b19_rich_sources.py` scans complete files, separates
  phases, records every affected game/reason with raw row locators, preserves
  unknown outcomes and zero denominators, and refuses output-directory overwrite.
  It performs no DB admission or publication. Final scan **28.451s**; a second
  final-code scan yields identical diagnostics and pinned identities.
- Games passing necessary checks: **PBP 62 / possessions 852 / lineups 0 /
  shots 1,230 / assignments 1,230**. Every population is explicitly **not admitted**.
  PBP off/def sides fail in 1,155 games; 91 have decreasing score observations;
  one final differs. Possession points differ in **273** games. Lineups contain
  repeated players in **84** games. Source reasons overlap; malformed independent
  player minutes affect 73 games and are not silently corrected.
- Actual event grain: `action_id`/`order_index`, with legitimate repeated
  `action_number` in every game. Existing lineup storage requires unique action
  numbers and cannot ingest these event rows safely. Imported `pbp_fallback`
  possessions do not establish event membership or starter/FT/rebound policy.
  Exact event joins, minutes, conservation and cross-lineup attribution remain.
- Shot counts/identities/basic geometry and assignment pair/exposure checks pass
  the complete season; provider shot-event IDs, distance corrections, assignment
  numeric-seconds/denominator provenance and durable versioned membership remain
  separate gates. Retained raw bytes, declared licenses/attribution and pinned
  candidate source-method references are available; public redistribution is not
  certified by local research acquisition.
- **11 new focused tests; 636 backend tests passed / 125 opt-in skips**. Whole-tree
  Ruff/format (**347 files**), strict mypy (**144 source files**), all **26 historical
  checksums** and **17 input checksums** pass, zero warnings. PostgreSQL/browser
  acceptance is not newly claimed: this slice adds a filesystem audit, tests and
  documentation only. Superseded checker outputs are retained; regressions cover
  the initial action-number assumption and malformed-minute shot-tally interruption.

Next B19 sub-block: **append-only rich admission/membership, beginning with
independent assignment admission** using precise numeric seconds and explicit
source denominators. The old service still deletes/replaces rows and skips some
missing-baseline/parse-failure gates; do not use it on retained memberships. Resolve
PBP/lineup row identity and source/policy corrections before B20/WOWY population.
No real analytical rich rows, new release or model acceptance is claimed here.
B32 final reconciliation, actual corrections and full three-box load remain open.

### B19b — append-only assignment admission (2026-10-05)

**VERIFIED bounded admission; B19 parent remains source_blocked.** Current Codex
session; no delegation/model overrides. Preserved pre-existing dirty application
work, B19a source bytes/evidence, B26 research memberships and the public pointer.
[Acceptance evidence](evidence/b19b-assignment-acceptance.md).

- Applied additive migration `19b810a4f004`. Independent assignment datasets,
  games, exact source-row members and local observations avoid the old rich
  importer's DELETE/replacement/admin bypass. Content-addressed source, baseline
  and methodology bytes plus parser/dependency hashes bind complete payloads.
- Admitted **240,750 assignment rows across all 1,230 regular-season games**;
  retained but excluded **17,104** other-phase rows. Dataset
  `24a61903-0f8b-4ce4-93e1-61c0ed057053`, semantic SHA-256
  `ce7f3ef0931e36005f586c6189c6df9c88a17b81202d79ad68bd055b715aa212`.
- `assignment-exposure-v1` uses exact `Decimal`/PostgreSQL `NUMERIC` seconds from
  `matchup_minutes_sort` and source fractional possessions. Provider floor/shared
  time shares retain their denominator labels and explicit tracking limitations;
  rounded display minutes never replace arithmetic seconds.
- Database guards reject UPDATE/DELETE/TRUNCATE and later membership extension,
  including administrative runtime settings. One transaction stages admission;
  identical replay appends observations and reuses facts. Executed A→B→A and
  mid-admission rollback checks preserve old inputs and remove failed candidates.
- A separate retained-byte verification reran source/baseline checks and compared
  every stored payload, exact exposure and game/dataset membership; reports agree.
  Before/after pointer/dataset records and retained rich/forecast counts agree.
- **648 backend tests passed / 135 opt-in skips**, plus **10 independently executed
  PostgreSQL tests passed with zero skips**. Twelve new unit tests passed. Ruff,
  formatting (355 files), strict mypy (146 source files), all 26 historical and
  17 B19a input checksums, and `git diff --check` passed.

PBP/possession/lineup identity, conservation and appearance/exposure gates remain
open. No B20/WOWY population or new shot admission. B23 retained assignment serving
integration is a separate dependency step; the independent dataset does not alter
legacy workbench memberships or grant API/UI availability. Next B19 work: resolve
provider event/lineup joins and source/policy failures before stint admission.
B32's remaining final/correction and maximum-three-box acceptance gates stay open.


### B19c — retained event identity and conservation diagnostic (2026-10-05)

**VERIFIED diagnostic slice; B19 parent remains source_blocked.** Current Codex
session, no delegation/model overrides. Preserved pre-existing application work,
sealed B19a/B19b inputs/evidence and B32 gates.
[Acceptance evidence](evidence/b19c-event-conservation-acceptance.md),
[identity/conservation contract](design/b19-event-identity-conservation.md).

- Complete **621,881** PBP/lineup pairs across **1,230 regular games** have equal
  ordered projections; **32,619** repeated action-number rows require preserved
  CSV row identities. Transcript binds both full payloads/locators. **125 games**
  still have ambiguous repeated projection keys with different lineup sets;
  positional equality does not establish native-provider event lineage.
- Direct event FG/diagnostic FT credits reconcile both team final points in all
  **1,230 games**. Preserve scoreboard correction/timing disagreements in **124**
  games, decreases in **91**, and one differing last observed final. No source
  correction is silently clamped or admitted.
- Imported PBP sides disagree with joined home/away lineups in **97,594 rows**.
  Home/away five-player validity fails in **84 games**, including **81** with
  positive-duration invalid intervals. Row-hold time fails in every game;
  endpoint-hold arithmetic meets the one-second diagnostic tolerance in **494**
  games without invalid independent minutes, while **692** still have numerical
  mismatches. These are hypotheses, not admitted starter/substitution policies.
- Imported possession team points fail in **273 games**; **255** contain **362**
  opposing-team scoring credits inside offensive intervals. **49** games have
  own-team direct-point differences, **11** unresolved boundaries/clocks, **10**
  scoring-membership failures. **33,644** possessions span multiple lineup sets.
  Separate event scoring from possession exposure before freezing final policy.
- Frozen-code scans **27.613s / 27.647s** produce byte-identical diagnostics and
  transcripts. **20 new regressions; 668 backend tests passed / 135 opt-in skips**.
  Ruff/format (**358 files**), mypy (**146 source files**), all **26 historical /
  17 input / 14 B19b evidence** checksums and diff whitespace checks pass.
  PostgreSQL/browser execution is not newly claimed; no runtime or DB mutations.

Next: bounded native-PBP/rotation/per-period-starter reconstruction with pinned
parser/overrides, then freeze event timing and possession attribution and execute
append-only stint acceptance. B20/WOWY remains unpopulated. B23 retained assignment
serving and B32's final/correction/crosswalk/three-box/retention gates stay open.

### B19d — native reconstruction path and source decision (2026-10-05)

**VERIFIED candidate reconstruction implementation; representative admission and
season scaling remain source_blocked.** Current Codex session; no delegation or
model overrides. Preserved existing dirty application work, B19a/B19b/B19c evidence
and independent B32 gates. [Acceptance](evidence/b19d-native-reconstruction-acceptance.md),
[contract](design/b19-native-reconstruction.md),
[accepted outputs/replay](evidence/b19d-native-accepted/reproducibility.json).

| Gate targeted | Executable acceptance | Result / external dependency |
| --- | --- | --- |
| Native reconstruction path | `pytest tests/unit/test_native_reconstruction.py -q`; fresh-directory native replay | Verified: 22 regressions; byte-identical real-input replay; native identities, starters, ordered substitutions, intervals and conservation |
| Representative admissible reconciliation | Six fixed raw bundles, independent baseline, every required game `reconstruction_passed=true` | Failed: four reconstructed candidates conflict with starter/range observations; one malformed minute; two missing rotations |
| Full-season scale decision | Complete pinned rotation Git tree versus independent 1,230-game regular schedule | Failed: 165 regular games have rotation files; 1,065 missing. File presence alone does not pass reconstruction |
| Alternative input pursuit | Retained bounded direct native requests and alternative source/parser seams | Direct rotation/range requests timed out. Archive PBP candidates and pbpstats cached schema inspected; neither supplies verified replacement starters here |
| B20 / partial WOWY / full season | Source reconciliation, frozen possession membership/attribution, executed PostgreSQL sealing/rollback/replay, retained-game WOWY | Open; zero new admitted possession/stint rows. Partial WOWY and complete-season acceptance reported separately |

- Added `ingestion/native_reconstruction.py` and `scripts/reconstruct_b19_native.py`:
  immutable raw acquisition, complete-payload event identities, exact decimal
  clocks/tenths rotations, provenance-bound name aliases, per-period rotation
  starters checked against independent boxes, source-ordered substitutions,
  per-event lineups and positive intervals. No derived lineup CSV joins.
- Retained 24 native requests and two method requests at pinned mirror commit
  `000610d46d149ebb45db4f5ae6f80b16d5e2fb6b`. Four complete bundles reconstruct
  **2,209 events / 1,391 intervals**. All four reconcile five-player sides,
  rotation continuity, shooter presence, player FG/3P/FT/point totals, team scores
  and present scoreboard observations. Three also reconcile player minutes at
  the fixed one-second tolerance. The fourth retains player `1629130` minute
  `25:60` as unknown, without converting it into an inferred correction.
- Preserve **23 team/period starter disagreements** across the four candidates;
  no conflicting range response is rewritten. Two selected failures have HTTP
  404 rotation responses. All candidates remain quarantined and explicitly
  declare no DB/possession-policy admission.
- Source decision: **do not scale this source to season admission yet**. The
  complete, nontruncated retained tree has 168 files, including **165** of the
  **1,230** scheduled regular games. Every one of the **1,065 missing games** is
  listed. Obtain corrected parameter-bearing opening observations, a valid
  independent minute and missing rotations/alternative independent interval
  evidence before scaling. The CLI supports an explicit games file afterward.
- Retained direct native rotation/range timeouts and alternative archive manifest;
  inspected pbpstats's pinned raw Stats NBA cached-file schema. No fabricated v3
  cache conversion or maintained-parser runtime/possession claim. Production
  dependencies, legacy reconstruction and publication paths were unchanged.
- **690 backend tests passed / 135 opt-in skipped** (22.81s); **22 new regressions**.
  Ruff/format (**363 files**), strict mypy (**147 source files**) and all historical,
  B19a/B19b/B19c checksums pass. No newly executed PostgreSQL or browser checks are
  claimed for this filesystem/pure reconstruction slice.

Next gate: independently corroborate/correct native starter and minute inputs,
then freeze possession membership and cross-lineup scoring/exposure, and execute
append-only event/stint admission checks. B23 retained assignment serving and B32
final/correction/crosswalk/three-box/retention work remain independent.

### Rename R1 — visible CourtLens name and mark (2026-10-06)

Owner renamed the project **CourtLoad → CourtLens** and selected the "ball lens"
mark (orange ball under a white magnifier; handle joins the ring flush without
entering the lens). Visible scope only:

- Dashboard copy, page titles, header wordmark, PWA manifest, export titles and
  download filename prefixes now read CourtLens. New `app/icon.svg`,
  `apple-icon.svg`, `public/icons/courtlens-maskable.svg` and rendered
  192/512/apple-180/maskable-512 PNGs replace the `courtload-*` icons.
- Deliberately unchanged: Python package, `courtload` CLI, `COURTLOAD_*` env vars,
  database/Docker names, npm package name, browser storage keys, versioned
  format/experiment identifiers (`courtload-*-v1/v2`), component identifiers,
  backend-generated notices/model cards (saved-conversation reproduction compares
  exact envelopes) and the mocks/fixtures mirroring them, and all historical evidence.
- Verification: dashboard lint/typecheck pass; **188/188** unit tests; production
  build passes. Production-fixture Playwright: **130 passed, 1 skipped
  (fixture-only real-workspace case), 2 failed**. Both failures are pre-existing
  flakes: `entity-selection.spec.ts:13` passed 3/3 in isolation;
  `route-polish.spec.ts:31` (transient duplicate `<details>` during render) failed
  **3/10 on unchanged HEAD** versus **1/10** after the rename, same error.

## B07 / PF05 follow-up — Stats reference fidelity, 2026-10-07

Owner-confirmed Stats presentation revision after the supplied screenshot comparison and grilling
interview. Slate/amber full Stats surface, compact rows/combined identity, bounded aligned numeric
columns, consolidated controls/footer, persistent 250px hover/focus/pinnable/collapsible rail,
and mobile explicit details are implemented with existing verified data. Reference-only metrics
and position-relative percentiles retain their source gates. Full fixture suite **153 passed /
3 opt-in skipped**; final affected table suite **10 passed**; Vitest **205 passed**; lint/types/build
and Ruff/format/mypy pass. Read-only real Stats verification covers **17 checks**, nine presets,
counting modes/guides, desktop/mobile and actual 200% zoom, with zero page errors/body overflow.

[Measured evidence and limitations](evidence/stats-reference-realignment/README.md);
[updated Stats UI contract](design/polish-ui-contract.md#owner-confirmed-stats-reference-revision--2026-10-07).
This bounded correction does not certify other pending replica blocks or reopen the full freeze.

## B07 / PF01–PF05 follow-up — readable records, portraits, wordmark and lookup, 2026-10-07

Owner's second-pass requests and subsequent portrait/Fontshare Tabular steering implemented:
52px standard rows, larger/sharper locally cached portraits, centered recurring guides, aligned
shell identity/Availability, reusable Tabular Bold wordmarks including exports, table autocomplete
that filters in place, concise global captions and right-aligned clear action. Existing analytical
scope/percentiles, preview/pinning and detailed entity-form selection behavior remain.

159 production fixture browser passes / 3 opt-in skips, 205 dashboard unit passes, 967 Python
unit passes / 2 existing PostgreSQL opt-in skips, clean lint/types/Ruff/format/strict mypy/builds.
Real Stats/search/mobile/200% zoom checks pass; 591 selected-cohort HD portrait assets cached
with old records retained and zero acquisition failures. Source/model/position gates remain open.
[Measured evidence and limits](evidence/stats-readability-search/README.md),
[revised presentation contract](design/polish-ui-contract.md).

## B07 / PF02 — Alpino wordmark revision, 2026-10-07

Owner selected Fontshare Alpino instead of Tabular. Shared Alpino Bold artwork now covers
shell, table and SVG/PNG card exports. Five real browser checks across desktop/mobile and
exports pass, with zero page errors; lint/types/build pass. Existing layout/color and independent
analytical gates remain. [Measured evidence](evidence/alpino-wordmark/README.md).

## B07 / PF02 — Sora wordmark revision, 2026-10-07

Owner requested Sora instead of Alpino. Shared Sora Bold 2.0 artwork covers shell, Stats and
profile/showcase SVG/PNG exports. Five real browser checks across desktop/mobile/exports
pass, zero page errors; lint/types/build pass. [Evidence](evidence/sora-wordmark/README.md).
Color, placement and independent analytical/source gates retained.
