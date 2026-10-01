# Workbench data, query and assistant contracts

Status: prescribed next-release contracts, 2026-10-01. Parent: [implementation handoff](../workbench-implementation-plan.md). Keep the old [historical contracts](data-serving-contracts.md) authoritative for sealed M5/M6 evidence.

## Source and phase semantics

Use a source adapter to translate provider fields into canonical facts. Source identifiers retain their namespace; NBA `person_id` and ten-character game IDs can link to the existing archive after explicit identity checks. ESPN identifiers require a separate crosswalk. Name similarity can suggest a mapping for review but cannot establish identity automatically.

Canonical phases are `preseason`, `regular_season`, `play_in`, `playoffs`, `cup_final`, `summer_league` and `unknown`. A Cup group/quarterfinal/semifinal game can count toward regular-season results; store both phase and competition annotations where the source establishes that distinction. The Cup final does not become a regular-season label. Provider prefix/phase mappings belong in a versioned adapter, and contradictory values are quarantined. Unknown phases are excluded from phase-specific aggregates.

Schedule placeholders can have unresolved teams, and preseason can include external opponents. Preserve explicit unresolved/external identities; zero or missing IDs cannot become a shared fictitious NBA team. Unknown-participant rows can remain schedule context but cannot supply an eligible forecast target.

NBA Stats source files use ending-year filenames; `2026` means 2025–26. Store a canonical season label and the original provider value. The raw schedule explicitly declares its season. Keep dates in the NBA domain zone `America/New_York` and tipoff timestamps as aware UTC values when supplied. Date-only inputs retain their precision rather than inventing a tipoff.

Scheduled/live rows have no observed final result, even when a payload contains numeric zero scores. Admit final outcomes only when source status and necessary score fields establish finality. Zero points in an actual appeared player's valid final box score remains an observed zero. Missing row, blank count, unknown minutes and explicit nonappearance are separate states.

Retain nonappearance source comments without inferring current injury or future availability. A source-reported DND/injury comment describes that game's report; it is not a current medical/availability model. Parse observed player `m:ss` minutes strictly with seconds 0–59; team minutes can exceed 60 because they sum players. Additional representations require explicit adapter support and tests, not permissive string coercion. Keep originals and parsed seconds.

The phase boundary applies to descriptive windows, features, labels, calibration and comparison cohorts. The separate preseason browser uses admitted preseason data. An available preseason schedule with no validated player outcomes is `schedule_only`, not a populated statistics dataset. Summer League and playoff modeling are outside this release.

## Observation and temporal rules

Keep these times distinct:

| Field | Meaning |
| --- | --- |
| `game_date` / `tipoff_utc` | Outcome/schedule event time and precision |
| `upstream_updated_at` | Provider/mirror metadata; may be absent or unreliable |
| `acquired_at_utc` | Time this installation successfully received the immutable artifact |
| `observed_at_utc` | Local observation of a particular source entity/version |
| `before_date` | Exclusive analytical game-date boundary |
| `issued_at_utc` | Actual forecast creation boundary |

Research and feature windows require `game_date < before_date`. Same-day and future outcomes remain excluded, even if they were acquired earlier that day. A current research request resolves its latest completed-day context explicitly and returns the effective boundary.

Separate analytical content hashes from whole-release provenance hashes. A profile/feature content hash binds its eligible prior facts, target context where applicable, values and metric/feature versions; exclude unrelated future facts, local UUIDs, whole-file download hashes and build times. Release/provenance identity can change when future data changes while an earlier analytical content hash stays identical. Tests must check both legitimate prior-history changes and irrelevant future-outcome mutations.

Historical reconstruction uses revised historical records and reconstructed schedules; it does not claim original publication-time knowledge. For genuine prospective issuance, eligible versions must additionally have `observed_at_utc <= issued_at_utc`. Schedule and team-association evidence must have been observed by issuance. A later correction creates a new observation/version and cannot rewrite the inputs of an old issuance.

Acquisition observations are append-only even when bytes repeat. A→B→A must contain three observations of two content versions in their actual order. An unchanged asset can reuse parsing/facts but records the acquisition result. Hash namespaces must distinguish data content, selected version membership, actual observation selection and transforms. The old archive's `observation_sha256` is a stable locator/content hash, not a timestamp hash; retain its original meaning for M6.

For prospective membership, choose the most recently observed eligible version, with a monotonic acquisition sequence as a deterministic tie-breaker. First-seen time alone is insufficient after A→B→A. Freeze that selection into the input manifest.

Freshness is capability-specific: local check age, upstream update age when known, latest finalized outcome date, and missing expected final outcomes based on observed schedule. A freshly downloaded old season is still historical coverage. Before opening day, zero current-season outcomes is expected. After a failed refresh, show both the failed attempt and the last good data. Start with a configurable 36-hour stale-check threshold; absence of games is not itself an outage. Do not claim a mirror-wide service guarantee from its cron schedule.

## Persisted entities and integrity

The following are logical grains. Reuse an existing table only when it fulfills the contract without weakening sealed evidence; otherwise add a focused table. Preserve legacy primary keys and foreign keys.

| Entity | Grain and required content |
| --- | --- |
| Acquisition | One attempted source-resource fetch: status, timestamps, URL/asset identity, HTTP metadata, bytes/hash, bounded error, source contract version. |
| Artifact | One verified content hash/resource: relative storage locator, bytes, MIME/format, source attribution. Installation paths are not portable identities. |
| Source observation/version | Entity namespace/key, canonical payload hash/parser version, acquired artifact and row/JSON locator, ordered observation time. |
| Dataset manifest/member | Immutable selected versions and observations, seasons/phases, parser/quality versions, content/membership hashes, coverage and exclusions. |
| Player/team identity | Stable entity plus source aliases; names and associations carry source/version evidence. |
| Schedule version | Source game ID, teams, season/phase, status, date/tipoff precision, annotations and observed source version; separate from result. |
| Player-game fact | Dataset/player/game identity, observed team/opponent, phase, appearance state, nullable counts/minutes, source links. |
| Team-game fact | Dataset/team/game identity, opponent/side, final-result state, nullable metrics, independently validated coverage and source links. |
| Release/input binding | Ready `ServingSnapshot` plus immutable capability→dataset/transform bindings and semantic serving signature. `PublishedSnapshot(public)` references one ready release. |
| Research summary | Release/entity/season/phase/cutoff/window metrics and validity denominators; no target-game requirement. |
| Evaluation run/artifact | Immutable target/config/splits/input/code/artifact identities and report; runtime status is separate. |
| Model policy activation | Immutable estimator/calibration/eligibility identity, applicable target/mode and activated time. |
| Forecast issuance | Player/target/issued-time/policy/input selection, frozen features/hash, team/schedule evidence, estimate/interval and reason. |
| Forecast score observation | Issuance plus outcome version/observation and scoring-policy identity, scored or unscored reason; corrections append. |
| Analysis run | Query/context/metric/input/result manifest and hash, creation time, retained release refs; display title may be separate metadata. |
| Portrait asset | Player/source/content hash, local locator, format/dimensions, rights/attribution and acquisition status. Independent of analytical hashes. |
| Job/attempt | Mutable operational state with allowlisted kind/arguments, owner/heartbeat, attempts, stage/timings, input/output refs and sanitized failure. |

Use real foreign keys for release inputs, membership versions/observations, artifacts, forecasts and analyses. Enforce membership consistency with composite constraints or equivalent database guards: an observation/version must belong to the same entity, and a dataset cannot contain conflicting active versions of one fact. Add unique grains and indexes for dataset/player/date, release/entity/cutoff, team/game, source observations and target/policy issuance queries.

Seal accepted memberships, normalized fact content, published output and issuance payloads. Use mutation-rejecting database guards or restricted application roles; lifecycle statuses/jobs and the publication pointer remain deliberately mutable. Add tests that ordinary application writes cannot modify sealed facts or cross-wire memberships. Migration/administrative maintenance is explicit and outside ordinary runtime writes.

A semantic serving signature hashes selected normalized content, coverage/exclusions, relevant transforms, metric/feature versions and resulting relation membership. Exclude local UUIDs, storage paths and build times. Portable equivalence must verify this signature and the applicable output/feature hashes. A new local binding can reference verified old evidence while retaining the original manifest's IDs. It must not describe new observations as the original historical observations or make old calibration applicable to new seasons.

## Admission and warehouse

Validate source capabilities independently. Team outcomes require two valid opposing sides, matching dates/phase/scores, a final state and complete required outcome fields. Player-game admission requires valid identity/grain/appearance/minutes and requested field checks. Whole-player-game quarantine remains appropriate for invalid minutes. Report whether player point sums reconcile to team points; an incomplete player aggregate must not become authoritative team production.

A valid team outcome can survive a malformed player line, but player-dependent team metrics remain incomplete. Team rebounds can include values absent from player sums; do not enforce a false equality. Record per-metric validity and exclusions rather than one opaque global success flag.

Suggested workbench relations: canonical player/team games, observed schedules/associations, player-window aggregates, team-window aggregates, and release capability/coverage. Build privately with dataset/release/metric variables. Include uniqueness, FK joins, phase, denominator, finality, prior-day cutoff and future-mutation tests. Research summaries must not depend on a reconstructed next game.

Bound initially to admitted recent seasons and supported game dates. Measure query cost before materializing every player × every date × every filter. Retained facts with indexed bounded SQL queries plus standard window marts are adequate. User-supplied schema/table/order strings are never executable identifiers.

## Metric catalog and research query

Define `MetricDefinition` with key/version, display name, unit, required fields, formula/aggregation, valid denominator, phase scope, ordering and limitations. One catalog drives warehouse/API definitions, filter validation, assistant tools and export metadata. The frontend formats values and does not compute a competing basketball formula.

Initial catalog: games with confirmed appearance; minutes; points; offensive/defensive/total rebounds; assists; steals; blocks; turnovers; fouls; field-goal/three-point/free-throw makes and attempts; aggregate FG%/3P%/FT%; explicitly labeled per-minute or per-36 rates. Keep the old reference formula as a separately named legacy metric.

Counts/means use valid values and expose per-metric `n`. Percentage = summed paired makes / summed paired attempts; zero attempts gives null. Rate = summed output / summed positive minutes from the same valid pairs. Per-36 is a descriptive normalization, not expected output at a projected workload. Missing values are not zeros. Recent-versus-season views disclose overlapping windows; descriptive changes do not establish causation.

`ResearchQuery` contains release ID, season, phase, exclusive cutoff, `season|last_5|last_10` window, observed-participation team filter, optional name, selected allowlisted metrics, minimum appearances/minutes, sort metric/direction and bounded page size. Distinguish minimum total minutes from average minutes. Filter cohorts and define metric validity before ranking. Sort nulls last and use stable player/team identity for ties. Encode the query/context hash in cursors.

A team filter means statistics recorded for that team in the requested scope. Traded-player summaries can show separate team rows and a clearly labeled all-team season total. A current-roster list has a different query mode and requires admitted current-association evidence. Do not label last-season participation as today's roster.

Historical ranking cohorts require eligible prior participation in the requested scope. Names/associations in historical findings use corresponding prior fact/identity evidence. The general identity catalog can support discovery before a current-season appearance, but such identities do not become a historical statistical cohort through future game rows. Adding a future rookie or changing a future box score must not alter an earlier ranking's analytical content.

Defensive research supports specific steals/blocks/rebounds metrics, rates and samples. Broad best-defender questions ask for a measure or return distinct metric-specific views with limitations. Opponent allowance is per-game production allowed from valid team totals. It is not possession-adjusted efficiency, matchup assignment or causal impact.

Team records derive from valid final games. Show games observed/expected and exclusions. Record-order ties remain tied; an identity tie-break only stabilizes display. Official conference seeds and predictive placement require additional rules/models and are deferred.

## API surface

Preserve existing `/api/analytics` contracts and retained snapshot/run links. Introduce a coherent `/api/workbench` namespace. Proposed names below are implementation contracts; they are not existing endpoints.

| Method/path | Behavior |
| --- | --- |
| `GET /catalog` | Ready release, semantic identity, sources, seasons/phases, supported/default cutoffs, capability states, metric/policy versions. |
| `GET /players` | Browse/search/filter/sort research table, bounded stable cursor pagination. |
| `GET /players/{id}` | General research profile independent of forecast eligibility; photo/association refs and forecast status. |
| `GET /players/{id}/games` | Prior-only game log by default, bounded pagination and source links. |
| `GET /teams`, `GET /teams/{id}` | Team research and participation-scoped player cohort, record/coverage and schedule. |
| `GET /compare` | Two players with one resolved query context, aligned metrics, samples and estimate metadata. |
| `GET /metrics` | Versioned catalog definitions and capabilities. |
| `GET /lineage` | Bounded contributing fact/source refs and transform path; sanitized locators, not server filesystem access. |
| `GET /status`, `GET /jobs`, `GET /jobs/{id}` | Workbench-specific source/build/quality/job/release health; real records. |
| `POST /jobs` | Allowlisted bootstrap/refresh/portrait job creation; returns `202` plus job ID. |
| `GET /evaluations`, `GET /evaluations/{id}` | Registered, verified old/new experiment metadata/reports; unrelated target identities remain explicit. |
| `GET /forecasts`, `GET /forecasts/{id}` | Issued or registered replay results and versioned scoring history. |
| `POST /analyses`, `GET /analyses/{id}`, `GET /analyses/{id}/export` | Save and retrieve/reproduce bounded evidence manifests; CSV/JSON exports. |
| `POST /assistant/query` | Optional bounded question-to-tools workflow and verified result cards. |
| `GET /media/players/{hash}` | Cached allowlisted image asset; no arbitrary URL/path proxy. |

Use typed Pydantic request/response models and update/generate TypeScript types with a contract check. API responses identify release/input hashes, season, phase, effective cutoff, metric version, data mode, coverage and warnings. Forecasts identify their **own** issuance input release as well as the page context. An old forecast must never be relabeled as using the current snapshot.

Start with 50 rows/page, maximum 100; bounded exports maximum 2,000 aggregate rows or an explicit paginated game-log export limit. Reject unsupported inputs with `422`, missing entities with `404`, genuinely retired inputs with `410`, and unavailable ready data with `503`. Analytical unavailability is a typed status with useful descriptive data, not a numeric zero or a page-wide error. Cursor mismatches are explicit. Do not clamp invalid dates silently.

## Saved investigations

Saving computes the result through the analytical service, then stores a manifest containing canonical query, input/transform/metric identities, row ordering, result artifact hash, warnings and software provenance. Use a content hash for reproducible analytical identity and a separate local run UUID. Reopening after refresh uses the retained release. Reproduce must compare the normalized result hash; unavailable retained inputs return a reason.

Exports include a machine-readable manifest and typed results; CSV includes metadata through an accompanying manifest. Bound output size, escape spreadsheet formula cells in string fields, and include phase/cutoff/units. Save provider-independent tool results and verified claims for an AI investigation; raw provider conversation retention is not required. Saving user questions is explicit.

## Worker, locks and recovery

One worker claims jobs with database transaction/lease semantics, maintains heartbeats and executes bounded stages. Queue states: `queued`, `running`, `succeeded`, `failed`, `interrupted`. An expired lease requires checking the actual lock/owner before recovery. A killed worker cannot cause an already committed pointer swap to be blindly reclassified as an unpublished failure; reconcile its output release.

Hold a dedicated session advisory lock through the coordinated mutation sequence. Refactor nested publication locking; do not bypass protection with a process-global boolean. CLI and worker paths share protected primitives. Evaluation artifact registration/writes also use an appropriate exclusion lock and atomic file creation; training should not unnecessarily monopolize the refresh lock. Acquire locks in one documented order. Backup capture coordinates with mutations.

Suggested initial limits: 20-second connection/read timeouts, source-specific byte caps established from the spike, three bounded acquisition retries with backoff, 30-minute stage timeout for dbt, and an explicit total job deadline. Check disk headroom before acquisition/candidate copy. Logs and errors redact credentials and user keys. Subprocesses use allowlisted argument arrays and sanitized environments.

Refresh due time is configurable, initially 09:00 UTC daily; manual requests coalesce with an active equivalent job. Missed days trigger one bounded catch-up, not a job per missed day. Compare fetched hashes and selected manifests to avoid unnecessary rebuilds; an unchanged result still records a successful check. Superseded schedule/results are retained.

Default ports bind to `127.0.0.1`. New browser mutations go through same-origin Next server routes that verify request origin and add a server-only installation control token. FastAPI operator routes require that token; the worker/CLI can use local trusted access. Keep the token out of browser bundles and exports. This is a local control boundary, not a user-account product.

Store content-addressed artifacts under configured roots with relative manifest locators. Retain active/previous good releases, sealed experiments, analyses and all forecast evidence. Add a dry-run reference report and measure growth before any garbage collection. No automated deletion of immutable dataset/forecast evidence ships initially. Candidate scratch schemas and reproducible unreferenced image cache can have explicit cleanup. Free-space exhaustion fails safely rather than deleting protected inputs.

Backup holds coordinated mutation exclusion while producing a DB dump and manifest-referenced file bundle, verifies hashes, then atomically installs the archive. Include evaluation configs and current-source files; record media inclusion policy. Restore targets a separately named database, fails on SQL errors, validates every included artifact, and verifies the expected release/channel and forecast/analysis dependencies. Convert SQLAlchemy URLs for PostgreSQL CLI tools without logging credentials. A real dump→fresh-database restore is required.

## Optional assistant

One Gemini adapter is enough. Use the currently supported `google-genai` SDK, pin the verified dependency, and configure model/key on the server. Keep a small provider interface for future adapters without promising universal compatibility. Select a model with verified tool/structured-output support; free-tier availability is account/model-dependent. The user can choose their own supported model.

The default assistant is stateless at the provider. For an API that persists interactions by default, explicitly disable provider storage where supported. This does not override provider data-use terms. Cloud AI is an optional internet capability; the underlying local database is not automatically uploaded. The UI explains that the question and bounded selected evidence go to the configured provider.

Allowlisted read-only tools:

- `get_catalog` and `get_metric_definition` for capabilities and semantics.
- `search_players` / `rank_players` using `ResearchQuery`.
- `get_player_profile`, `get_team_summary` and `compare_players`.
- `get_forecast` / `get_evaluation_summary` for already registered artifacts and issuance.

Pin one release/cutoff/season/phase context per supported investigation. Validate every proposed argument against the same query schema and access rules used by manual search. An explicit request to change context creates a resolved new context before data tools run. Current-year questions cannot silently fall back to 2025–26 data. Tools cannot execute SQL, filesystem paths, URLs, jobs or new model training.

Start with a 2,000-character question limit, four tool rounds/eight calls, at most 100 rows per result/200 total returned rows, approximately 12,000 input tokens, 2,000 output tokens, and a 45-second request deadline. Enforce byte/token bounds before sending payloads. At most one short retry for transient provider failure; then return typed failure with working manual alternatives. These are project limits, not claims about provider quotas.

Return a typed `AssistantAnswer`: resolved context, interpretation, tool trace, evidence refs, result tables/chart specs, supported claims, limitations and explorer query. Numerical claim fields reference server-owned evidence cells/derived values rather than accepting model-written numbers. Backend calculations provide rankings/differences. Renderer substitution supplies displayed values, units and dates. Validate narrative claims conservatively; if unsupported or malformed, render the verified table and a deterministic explanation instead. Schema-valid JSON alone does not guarantee factual correctness.

For 'best defenders on the Raptors', ask for a defensive measure or present explicitly named steals/blocks/rebound views with sample limits and their scoped team definition. For conference placement, return `model_not_available` and an actual team-record/production alternative. For a forecast explanation, show its target, conditionality, history, estimator, interval/calibration and evaluation evidence. No LLM-generated projection replaces a missing model.

Evaluation uses offline tool fixtures for correct entity/season/phase resolution, query equivalence, numerical references, unsupported requests, adversarial instruction text, malformed args, quota/key/timeouts and empty data. Add a curated real-data question set with expected tool/query/evidence invariants; report success counts and failures. A live-key smoke is manual/opt-in. Ordinary search and all core checks run without an API key.
