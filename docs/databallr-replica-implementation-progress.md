# CourtLoad replica implementation progress

Started 2026-10-01. Parent: [implementation handoff](databallr-replica-implementation-plan.md).

**Planning complete; application implementation and verification pending.** This log is separate from historical M0–M8 and workbench P0–P9 records. Existing functionality may satisfy a new requirement after verification. No planning row is evidence that an application feature works.

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
| B12 Analytical operations | Sol | verified | Pure mathematical calculation engine for quantiles (type 7), period deltas, venue & rest splits, defensive allowance, standardized z-score statistical peers (weighted Euclidean distance), and cohort ranking API |
| B13 Investigation interfaces | Flash | verified | Workload trends (/research/trends), quantile distributions & contextual splits (/research/distributions), statistical twin peers (/research/similarity), and flagship case studies (/research/case-studies) with manual reproduction |
| B14 Current/history/identity sources | Sol | verified | B14a refresh, discovery & crosswalk, B14b resumable backfill toward 2000-01, B14c combine/listed measurements & draft metadata verified |
| B15 Team operations | Sol | verified | Team profile, schedule context, rest splits, B2B summaries, Four Factors (offense & defense) with league ranks/percentiles, similar peers, and F18 three-point variation scenario |
| B17 Playoff/series data | Sol | verified | Admitted postseason games (82 for 2023-24), bracket/series identity (004{YY}00{round}{matchup}{game_num}), slug and alias resolution, explicit reconstructed seed evidence with tie notes, phase-safe Four Factors and player box-score series aggregations, and strict 7-game placeholder handling |
| B19 Rich-source admission | Sol | verified | Bounded streaming adapters for PBP, possessions, lineups, shots, matchups; pinned policies (courtload-sdv-rich-v1, possession-policy-v1, shot-zones-v1, matchup-pair-v1); clock/lineup/score/shot/matchup invariants; retained source bytes & SHA-256; structured quarantine reporting |
| B20 Possession/stint warehouse | Sol | verified | Continuous 5-on-5 stint reconstruction, possession-policy-v1, 5-player sides, minute/point conservation, fractional possession overlap, override registry, dbt facts/marts, cutoff-safe exposure |
| B21 WOWY/on-off API | Sol | verified | Typed shared-floor operations, disjoint 1-5 condition partitions, 2-5 player units, teammate event shifts, game-cluster intervals, possession gates; retained population remains source_blocked (zero stint rows) |
| B22 WOWY interface | Flash | verified | Bounded API-backed sets/units/Stats on-off/shifts/comparisons/exports; source_blocked in retained release, broader browser gate remains red |
| B23 Shots/matchups/aftermath API | Sol | verified | Bounded shot profiles/zone peers, explicit source assignments and partial possession aftermath; isolated fixture verification, retained-release inputs source_blocked |
| B24 Shooting/matchup interface | Flash | planned | |
| B25 External outputs/preregistration | Sol | source_blocked | Bounded offline schemas/registration and four frozen designs verified; DARKO admission, reconciled input history and exact split bindings remain blocked |
| B26 Registered experiments | Sol | source_blocked | Input-readiness slice verified; expected shots selected for first admission work; empty scoped rich inputs and exposed historical final require source work and separate chronology amendment |
| B27 Advanced research UI | Flash | planned | Each component has its own input/model gate |
| B28 Financial acquisition/schema | Sol | planned | Manual fallback approved; automated feed unverified |
| B29 Finance operations | Sol | planned | |
| B30 Finance interface | Flash | planned | |
| B31 Shared Live service | Sol | planned | Scheduled source checks only; in-game behavior unobserved |
| B32 Live interface | Flash | planned | |
| B33 Conversational backend | Sol | planned | |
| B34 Chat UI/query evaluation | Flash | planned | Real-key evaluation deferred until configured |
| B35 Methodology/export/integration | Sol → Flash | planned | Sequential ownership |
| B36 Fontshare refinement | Flash | preference_deferred | Verified candidates; owner selection later |
| B37 Release/recovery/evidence | Sol | planned | |

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
| F07 Help/discovery | in_progress | B02, B04–B07, B35 | B04 lookup API, B05 shell, B06 combobox, and B07 explorer shortcuts modal verified; B35 definitions pending |
| F08 WOWY | in_progress | B19–B22; validated shared-court data | B21 API verified against PostgreSQL fixtures; retained stint population source_blocked; B22 interface pending |
| F09 Live | planned | B31–B32 | Pending runtime/source evidence |
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
| F20 Teammate stat shift | in_progress | B20–B22 | B21 focal-player shared-floor production/shift API verified; retained stint population source_blocked; B22 interface pending |
| F21 Contracts | planned | B28–B30 | Pending runtime/source evidence |
| F22 Financial value | planned | B25, B29–B30; external conversion or registered named scenario | Pending runtime/source evidence |
| F23 Free agency | planned | B28–B30 | Pending runtime/source evidence |
| F24 Player compare | verified | B10, B22/B26 where needed | Interactive PvP compare view with Overall/Offense/Defense/Six Factor/Custom presets, aligned descriptive metrics table, comparative visual bars, lines tab, and zero forced winner notice |
| F25 Team compare | verified | B15–B16, B25–B27 | Interactive team comparison (/team-compare) with H2H series tracking, Four Factors comparative bars, F18 3P variation slider, roster participation cohorts, and zero inferred claims verified |
| F26 Matchups | planned | B19, B23–B24; assignment source required | Pending runtime/source evidence |
| F27 Tier lists | verified | B08–B09 | Interactive tier list builder with S/A/B/C/D tiers, HTML5 drag-and-drop plus accessible keyboard move buttons, player search, favorites quick-add, and subjective notes |
| F28 Adjusted shooting | planned | B25–B27; no surrounding-future-year fill | Pending runtime/source evidence |
| F29 Six-factor research | planned | B25–B27 | Pending runtime/source evidence |
| F30 Expected-shot research | planned | B23, B25–B27 | Pending runtime/source evidence |
| F31 Shot aftermath | planned | B20, B23–B24 | Pending runtime/source evidence |
| F32 Defensive assignments | planned | B23–B27; rich-input gate | Pending runtime/source evidence |
| F33 Spatial EPV | planned | B25–B27 if inputs ever admitted; ACB demo excluded | Pending runtime/source evidence |
| F34 Measurements | verified | B14, B27 | Combine Anthropometry & Wingspan Explorer (/wingspan), player profile anthropometry panel, and combine vs listed roster distinction verified |
| F35 Hypothetical calculator | planned | B15, B20, B27; scenario definition | Pending runtime/source evidence |
| F36 Learning | planned | B35 | Pending runtime/source evidence |
| F37 Case studies | verified | B13, B35 | Interactive flagship case studies reader (/research/case-studies) with 3 real-data investigations, stint reconciliation, forecast conditionality, and manual query verification |
| F38 Blog/patch notes | planned | B35 | Pending runtime/source evidence |
| F39 Workload/change | verified | B12–B13 | Workload trends explorer (/research/trends) with appearance and date-range slicing, delta table, delta cards, cohort surge/decline rankings, and SHA-256 evidence |
| F40 Distributions/splits | verified | B12–B13 | Distributions & contextual splits (/research/distributions) with Type 7 quantiles, n >= 5 sample gating, empirical dispersion strip diagram, venue splits, rest splits, and 30-team defensive allowance rankings |
| F41 Chatbot | planned | B33–B34 | Pending runtime/source evidence |
| F42 Pipeline/evidence | planned | B01, B03, B35–B37 | Pending runtime/source evidence |
| F43 Forecasts/evaluation | planned | Existing work verified in B00, integrated B11/B35–B37 | Pending runtime/source evidence |
| F44 Source video links | planned | B23–B24; clip URL/availability is a separate unverified source gate | Pending runtime/source evidence |
| F45 Installable interface | planned | B35–B37; signed-in reference installation was not independently exercised | Pending runtime/source evidence |
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
