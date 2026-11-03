# Replica data, query and analytical operations contract

2026-10-01. Parent: [handoff](../databallr-replica-implementation-plan.md). Requirements are pending implementation. The existing [workbench data contracts](workbench-data-contracts.md) and [points protocol](points-forecast-protocol.md) remain binding for their retained artifacts and interfaces.

## Context, input identity and capabilities

Use one validated context object for manual queries, saved investigations and chatbot operations. Resolve defaults once through the catalog; pages cannot hardcode season/date/capability availability.

| Context | Required dimensions and interpretation |
| --- | --- |
| Finalized research | Release ID, selected season list, one phase, exclusive `before_date` in America/New_York, optional inclusive lower game date, window specification, metric/operation versions and dataset/transform bindings. |
| External model output | Research context plus external provider/model/output version, effective/forecast date and actual observation time. Today's rating is not a historical rating. |
| Financial research | Release-bound contract book, financial season, effective date, known-at/observation boundary where requested, amount types, status/source rule version and coverage. Basketball season/window remains separately identified when displayed beside finance. |
| Live | Provider/source namespace, game/slate date, observation ID/time and status/finality; explicitly provisional. It does not share the finalized-research cutoff semantics. |
| Hypothetical scenario | Bound factual inputs plus explicit assumption vector/scenario version. Observed and modeled values are separate fields. |

A research release binds its actual admitted input families. Add capability entries with `available`, `partial`, `source_blocked`, `not_configured`, `not_yet_observed` or `not_implemented`, seasons/phases/start/end dates, expected/observed/excluded grains, metric requirements and source/acquisition freshness. A whole-release UUID is provenance; analytical content hashes bind eligible facts/cohorts/transforms/values, excluding unrelated future rows and local installation IDs.

Freeze selected observations/memberships and protect them with database integrity constraints. Later source corrections append observations and form a later release; saved releases, forecasts and fitted artifacts remain unchanged. Use the existing coherent `PublishedSnapshot(public)` swap and retained rollback. Derived relation/input FKs must prevent joining arbitrary datasets under a release label.

Source namespaces remain explicit. NBA game IDs preserve ten characters; ESPN IDs are not NBA IDs. Names/aliases can suggest identity candidates but cannot establish a cross-provider mapping. Metadata/current-team/position/measurement/contract observations carry their own evidence dates. Later identities cannot enter an earlier statistical ranking simply because they are now discoverable.

Current rosters, observed season participation, contract association and projected depth charts are distinct concepts. Keep phase separation throughout facts, windows, cohorts, scenarios and models. Current scheduled zero scores and absent player rows remain unknown outcomes; confirmed appeared zero-point outcomes remain zero.

## Query specification v2

Keep legacy query behavior compatible. Introduce a versioned `QuerySpec`/analytical-operation schema rather than extending loose dictionaries and keyword routing indefinitely.

| Field | Initial contract |
| --- | --- |
| `context` | Fully resolved research context and bound input identities. |
| `entity_kind` / `grain` | Player/team/player-season/team-season; use game/stint/assignment grains through explicit operations. |
| `window` | `season`, `last_n_appearances` (1–82), `last_n_team_games` where appropriate, or `date_range`; explicit lower/inclusive and upper/exclusive dates. Calendar days and appearances are distinct. |
| `season_scope` | One season by default; bounded season list for multi-season/career. Grouped season rows versus aggregate totals is explicit. |
| `team_scope` | Observed participation for selected scope by default; `current_roster` only with admitted association evidence. Team-stint rows and all-team total are labelled. |
| `metric_selectors` | Catalog keys/versions, allowed normalization and denominator type. Ratios/model coefficients are not automatically rescaled by a counting-mode switch. |
| `predicates` | Allowlisted metric/metadata comparisons, `eq/lt/lte/gt/gte/between/in`, bounded AND groups and bounded OR groups; maximum 12 leaf predicates initially. No SQL/identifier expressions. |
| `sample_filters` | Confirmed appearances, total/average valid minutes, and metric-specific valid observations/possessions/attempts, with explicit denominator. |
| `sort` | Up to three allowed metric/identity keys, direction, nulls last and stable identity tie-break. Display ties do not imply rank superiority. |
| `view_state` | Separate presentation preference reference; does not change formulas or evidence identity unless it changes selected analytical output. |
| `page` | Default 50, maximum 100 rows; query/context-bound cursor. Page size/presentation do not change the full eligible cohort. |

Legacy `pts` still means its documented total; generic Stats counting controls resolve to actual versioned metric selectors such as `pts_per_game`. Do not relabel totals as per-game values in the frontend. Names for API JSON and URL parameters are mapped by one encoder/decoder; IDs and filters survive detail/compare/save/chat navigation.

Validate unsupported metrics, mixed phases, out-of-coverage dates, malformed periods, incompatible normalizations, predicates and stale cursors. Use typed errors/capability reasons rather than clamping dates or replacing unknown inputs. Public read endpoints remain read-only; submitting a query must not acquire data, build marts or train.

Keep normal ranking computation in SQL/dbt against indexed eligible facts. Use analytical windows for last-N membership before aggregating. Avoid loading every player-game into Python for each table or lookup request. Materialize measured common scopes where useful; do not eagerly generate player × every date × every filter cubes.

Cache resolved results by semantic input/query/metric/operation identities, not only URL or current publication pointer. Query timeout/work bounds apply equally to manual and AI clients. Initial analytical response target: p95 ≤500 ms for common recent-season tables on recorded local hardware; heavier bounded cross-season/PBP queries may be asynchronous with an explicit status. These are acceptance targets, not existing measurements.

### Paging, complete results and saved evidence

Separate page execution from a bounded full-result iterator. Initial aggregate save/export maximum is 2,000 rows; the page maximum of 100 must not truncate a saved finding. Provide explicit paginated or larger allowlisted CLI export for historical game/event data; do not silently drop rows.

Save canonical operation/query/context, full eligible bounded result, order, eligible/output counts, source/transform/metric/model versions, result hash, warnings and optional verified claim references. References hold retained inputs. Personal titles/presentation preferences are separate from immutable analytical identity. Reopening uses one serializer and the original inputs; reproduction compares the normalized result hash. Unsupported retained formula versions return a reason rather than computing new values under the old hash.

CSV/JSON exports carry a manifest, units, sample/coverage, phase/cutoff and source identities. Escape spreadsheet formula strings. An export-size failure is explicit and actionable. A page screenshot or model narrative is not a reproducible result artifact.

## Metric catalog v2 and validity

Extend the existing registry with required input fields, compatible normalization/exposure, aggregation recipe, validity/sample definition, aliases, capability requirements, cohort rules, provenance and observed/external/modeled/scenario classification. All output values come from registered server computations. Keep v1 behavior accessible for retained evidence rather than rewriting past artifacts.

Compute at full declared precision and round for display. Preserve per-metric valid counts and denominators. A total with no valid observation is null, not a zero-initialized sum. A mean uses that metric's valid observations. For ratios/rates, pair required inputs on the same rows; independently summing incomplete makes and attempts is invalid. Zero valid denominator yields null. Positive recorded exposure is required for rates.

| Metric family | Initial recipe / limitation |
| --- | --- |
| Counts and per-game | Sum valid counts; divide by valid appeared rows for that metric. Confirmed appearance count and field-valid count remain separate. |
| Minutes/per-36 | Sum valid seconds; metric rate uses output/minutes on jointly valid positive-minute rows. Divide using unrounded seconds/minutes. Descriptive normalization is not projected workload. |
| FG/3P/FT percentage | Sum paired valid makes / sum paired valid attempts. Explicit no-attempt versus missing-field reasons. |
| Conventional eFG | `(sum(FGM) + 0.5 * sum(3PM)) / sum(FGA)` over jointly valid required rows. |
| Conventional TS | `sum(PTS) / (2 * (sum(FGA) + 0.44 * sum(FTA)))` over jointly valid required rows. Label conventional approximation; event-based true possessions are a different metric. |
| FTR | `sum(FTA) / sum(FGA)` on jointly valid rows; FTM/FGA, if added, has a distinct key. |
| Per-75/100 | Count / compatible actual on-court team possession exposure × 75/100. Catalog states offensive/defensive/total exposure policy; team-estimated or imported variants use distinct keys. |
| Team factors | Named shooting/turnover/offensive-rebound/free-throw components from valid own/opponent team facts, with formula-specific required denominators. Box-score factors are not player RAPM. |
| Team estimated possessions | A separately named conventional box-score estimate with fixed documented coefficient/version. Do not equate it with reconstructed PBP possessions. |
| Position/percentile | Requires admitted dated position/cohort evidence; never an undefined overall talent rank. |
| Defensive/impact | Box events, on/off differences, imported forecasts and registered coefficients remain distinct. No broad causal defender claim from a named count/rating. |

For cohort percentiles: establish the eligible analytical population before name search/paging. Apply explicit scope/sample/cohort filters; exclude null values per metric. Initial midrank percentile is `100 * (count_less + 0.5 * count_equal) / n` for `n ≥ 2`; otherwise unavailable. High raw-value percentile is not necessarily desirable (e.g. turnovers). Display cohort identity/count and formula, with a distinct good/bad direction only when the metric defines one.

League averages, standardization and reference priors use only eligible earlier facts in the bound context. Adding future games/rookies or changing unrelated future outcomes cannot change earlier analytical content hashes. Historical reconstructed facts still disclose that acquisition today does not prove publication-time availability in the past.

## Analytical operations

Each operation has a typed input schema/version, deterministic output, input/result hashes, samples/coverage, restrictions and an equivalent manual route. Start with these operations; optional tools are enabled only after their actual capabilities pass.

### Trends, distributions and contextual splits

- `compare_periods`: default last 10 versus the preceding 10 confirmed appearances, disjoint and prior to cutoff. Points/minutes/attempts/efficiency have separate jointly valid samples. Report absolute differences; percentage difference is null when the prior denominator is zero. Calendar-range comparisons disclose overlaps and changed cohorts.
- `distribution`: default last 20 appearances, return valid values/game IDs, n, mean/median, min/max, population descriptive SD, and p10/p25/p75/p90 using linear interpolation (quantile type 7). Minimum n=5 for a displayed distribution summary; no prospective floor/ceiling or injury/fatigue claim. IQR is historical dispersion, not a forecast interval.
- `split_profile`: home/away, documented rest buckets, opponent/team and phase-safe scopes. Define **team rest days** as full local calendar days between successive admitted team games (`date difference - 1`, nonnegative); `0` means back-to-back. A gap between player appearances is separately named and does not establish rest/injury. Missing previous schedule/date/side remains unknown. Return cell samples and overlap.
- `opponent_context`: named prior team production allowed, with valid final-team games and coverage. It is per-game allowance unless actual possession normalization is admitted; it is not positional matchup assignment or a future opponent-adjusted player forecast.
- `rank_operation`: sort/filter a registered change/distribution/split output with sample requirements. Searching many players yields descriptive candidates, not significance, causation or automatically selected changepoints.

Explicit differences are server computations and have evidence IDs; Gemini cannot invent them by subtracting unmatched cells. Phase/year/team trades and missing metrics remain visible in both periods.

### Player/team similarity

Statistical profile v1: eligible prior last-10 appearances, default minimum 10 confirmed appearances and 150 valid minutes. Configurable sample thresholds are recorded. Initial dimensions: points, rebounds, assists, turnovers, 3PA and FTA per 36; conventional TS; average minutes. Use paired valid rates. The default cohort is player profiles in the same selected season/phase/cutoff; position constraints require admitted evidence.

Standardize each dimension against that eligible cohort, removing zero-variance dimensions. Compare only disclosed valid overlapping dimensions (at least six of the initial eight), with equal default weights and distance `sqrt(sum(w * squared standardized difference) / sum(w))`. Return raw/standardized values, overlap, per-dimension contribution, cohort/sample and stable-ID tie ordering. Lower distance means closer on those dimensions; it is not a probability or overall ability score. Exclude self. Persist algorithm/cohort/weight identities.

Shot-profile peers use independently admitted volume/efficiency zones and actual compatible exposure, with their own feature/cohort/version. Team historical peers likewise expose factor/pace/production dimensions and era-relative standardization; show which seasons are supported. Multi-season comparisons standardize within declared league-season contexts before combining and disclose those weights. No future/full-season league average enters an earlier cutoff.

### Team scenarios and calculator

Store actual metrics and hypothetical output separately. A three-point-reference scenario can replace the selected team's 3P make rate with a prior-context league rate, holding its observed attempts/other terms fixed; it is a what-if accounting exercise, not a discovered causal luck correction. Reference inputs, assumptions and delta recipe are saved.

The offensive calculator requires a versioned possession-flow model, defined inputs, constraints and example checks before exposing derived ORTG/marginals. Traditional box factors may support a simpler named model; event-specific FT/2P/3P rebounds require admitted event data. A scenario cannot change stored games, train a model or imply a validated prediction. Roster diagrams use explicit observed/projected minute/value/allocation inputs; shape fit is not causal team compatibility.

An implementable initial alternative is `hypothetical-possession-flow-v1`, explicitly a design model: after a per-chance turnover probability `t`, choose a 2P attempt, 3P attempt or two-FT trip with probabilities `p2 + p3 + pft = 1`; make probabilities are `m2`, `m3`, `mft`; missed terminal attempts recover with probability `r`. Define expected score per chance `s = (1-t) * (2*p2*m2 + 3*p3*m3 + 2*pft*mft)` and recovery continuation `q = (1-t) * r * (p2*(1-m2) + p3*(1-m3) + pft*(1-mft))`. Under the stated independent repeated-chance assumptions, `PPP = s/(1-q)` and scenario `ORTG = 100*PPP`. Validate probabilities in [0,1], category sum, and `q < 1`; show assumptions and finite-difference sensitivities. Here turnover is per chance, and FT recovery refers to the last attempt; these are not automatically the usual box-score TOV/FTR/ORB denominators. Defaults are user-selected hypothetical values unless an admitted conversion recipe exists. A more faithful literature/event model is a distinct later version reviewed against its primary methodology before use.

## Rich inputs: events, possessions, stints, shots and assignments

Concrete candidates are listed in [source feasibility](../research/replica-free-source-feasibility.md). Download a bounded complete recent season for admission before wide backfill. Asset filenames/release documentation do not establish row grain, correctness or refresh.

Add focused additive entities/relations:

| Grain | Required identity/evidence |
| --- | --- |
| Canonical event | Dataset/game/provider event ID/order/period/clock, event class, involved player/team IDs, status and raw locator/hash. |
| Possession | Game/sequence, offensive/defensive teams, start/end event boundaries, event membership, point attribution and policy/version. |
| Lineup stint | Game/time interval and ordered event boundaries, five-player set on each side, duration, relevant events/exposure and reconstruction/override version. |
| Shot | Game/event/player/team, outcome/points, type/distance/coordinates/zone validity and source locator. |
| Matchup assignment | Game/offensive/defensive NBA identities, source assignment minutes/fractional exposure/shot fields and denominator/version. |
| Identity/measurement | Entity/source observation, effective season/date, taxonomy/unit, measurement type and mapping evidence. |
| Model output | Provider/experiment/output date/entity/input/fit/calibration signatures and observed version, or explicit missing reason. |

Before B20 computes exposure, freeze `possession-policy-v1`: event ordering, period starters, substitutions at the same clock, cross-lineup possessions, offensive rebounds, and-one/multi-FT/technical/clear-path sequences, lane violations, team rebounds, jump balls, turnovers and overtime. Evaluate a maintained parser such as pbpstats against source grains; pin code/transform/override versions. Imported season/game summaries cannot substitute for arbitrary cutoff/event reconstruction.

Choose and document cross-lineup possession attribution during the source spike, then use it consistently: event scoring follows the reconstructed event lineup; full or fractional possession exposure follows the declared policy. Do not force a possession spanning substitutions into a false constant lineup. Different defensible policies have different metric identities. This is a gated technical decision based on source/event evidence, not a remaining product interview.

Reconcile player/team minutes with game duration, five players per side, chronological clock bounds, start/end continuity, scorer/score increments, shot attempts/makes and complete outcomes. Tolerances for rounding are explicit and fixed before large backfill; unexplained differences quarantine affected capabilities/games. Unknown starters/substitutions cannot be repaired from a future appearance. Manual overrides are provenance-bearing immutable inputs, not hidden edits.

### On/off, WOWY and teammate shifts

Operate on shared-court exposure, not whole-game attendance. Support typed sets of together/apart players and exact 2–5-player units, bounded to one team/context and maximum five conditions initially. Define set predicates precisely and verify disjoint partitions; no appearance inference from a missing box row.

Return observed offensive/defensive possessions, minutes, points, rating denominators, relevant player event production, coverage and min-sample status. Min possessions are adjustable with documented defaults after source reconciliation. Leverage filters require a named event-time score/clock model; no generic garbage-time threshold is implied by a UI toggle.

Show raw estimates first. Optional shrinkage has a declared prior strength/population and metric version, fitted/selected on pre-test evidence. Databallr's published constants are reference facts, not approved CourtLens tuning values. On/off differences reflect lineup/opponent/role context and are descriptive. Player RAPM requires a separate registered model.

### Shots, assignments and aftermath

Normalize shot coordinates/units/orientation through the source adapter. Validate zero coordinates versus missing, event type, distance, NBA IDs and box-score totals. Freeze zone definitions and dimensions before deriving rim/midrange/corner/above-break splits. Recorded shot labels do not establish defender distance, player trajectories or full Synergy playtypes.

Assignment metrics use source-established pair identities and exposure. Fractional possessions/help responsibilities need not sum to ordinary player totals; define aggregation carefully and preserve coverage. Co-occurring players do not establish a guarding matchup. Nearest/second defender is unavailable unless that actual input is admitted.

B19b freezes `assignment-exposure-v1` in independent append-only
`assignment_datasets`/`assignment_games`/`assignment_members` inputs, with local
`assignment_observations`. A source member is the retained artifact SHA-256 plus
its one-based CSV data-row locator; the complete decoded row is hashed and retained.
Dataset/game memberships seal in their admission transaction. Corrections create
new datasets; repeated identical admissions reuse the dataset and append an
observation. No existing workbench or published dataset membership is extended.

Arithmetic exposure uses exact decimal `matchup_minutes_sort` seconds and source
fractional `partial_possessions`, stored as PostgreSQL `NUMERIC`. Retain display
MM:SS and all source fields independently. Provider time shares refer to defender
floor time, offensive-player floor time and shared floor time respectively; their
tracking denominators are source-reported, not reconstructed CourtLens exposure.
Aggregate shooting rates use summed makes/attempts, with unknown results at zero
attempts. Missing source percentages remain unknown. Pair/help credits need not
conserve ordinary player totals. Independent participation identities do not certify
player floor minutes, so malformed box minutes are never silently repaired.

See [B19b measured admission](../evidence/b19b-assignment-acceptance.md) for the
2025–26 population, source methodology provenance and sealing/reproduction checks.
Assignment admission alone does not grant B20/WOWY or B23 serving availability;
consumers must explicitly bind this independent dataset and policy identity.

Aftermath operations freeze branch membership/scoring/horizon: first-chance attempt, offensive recovery and continued sequence, immediate next opponent possession, associated free-throw treatment and end-of-period censoring. Return observed branch counts, samples, missing branches and declared partial-accounting scope. Avoid renaming partial branch values net rating.

## Registered experimental alternatives

The owner accepts distinctly named internal alternatives. This does not authorize unregistered ratings, vendor-equivalent claims, arbitrary player-quality rankings or final-test tuning. Current basketball-points-v1 and sealed reference-points-v1 remain independent.

Each B26 sub-block must write a protocol before comparing candidates: task/estimand, admitted seasons/grains, model/feature/schema versions, baseline, fixed candidate/tuning budget, chronological fit/validation/final memberships, train-only preprocessing, sample/exclusion/censoring, calibration where applicable, error slices/uncertainty, serving scope, artifacts and stop/promotion criteria. Reserve the latest eligible completed season for final evaluation only when genuinely unexposed; disclose prior exposure and amend chronology honestly. Derive exact splits from admitted coverage, never from desired results.

| Experiment | Bounded initial design to preregister |
| --- | --- |
| `courtload-rapm-v1` | Ridge lineup model of possession/stint point differential with offensive/defensive player columns and declared exposure weighting. Baselines: league/team/context-only predictions. Fit earlier games; choose a small fixed regularization grid on chronological validation. Coefficients describe a model under lineup confounding, not causal isolated skill. |
| `courtload-six-factor-v1` | Separate shooting, turnover and offensive-rebound target models using valid opportunity denominators and lineup design. Report offense/defense coefficients and held-out target reconstruction, with input/exposure support. In-sample fit is not forecast accuracy. |
| `courtload-expected-shot-v1` | Shot make/point model using admitted shot type/location/distance and prior-context features only. Compare zone/type empirical baseline against one bounded logistic/boosted candidate; fit/calibrate chronologically. Report Brier/log-loss/calibration and expected-points error by zone/sample. No optical or nearest-defender claim. |
| `courtload-adjusted-shooting-v1` | Playtype-based descriptive adjustment using actually admitted frequencies/outcomes and prior-only reference rates. Missing playtypes stay unknown or use explicitly registered one-sided estimation; no surrounding-future-year fill. Evaluate measurement stability/missingness and any predictive claim separately. |

Model uncertainty/stability/support should accompany coefficients where feasible; unsupported intervals remain unavailable. Training is explicit offline CLI, never a query/assistant action. Heavy experiments cannot monopolize the Live loop or rewrite the active points policy. A failed challenger is a valid recorded result; it does not become a good model through different labels.

Protocol registration includes local compute budgets: start with at most two CPU threads, sparse lineup matrices rather than dense player-by-event allocations, and an explicit measured memory/time cap chosen from B00 hardware. Record rows/dimensions, peak RSS, fit duration and all attempted configurations. Exceeding a cap yields a recorded failed/limited experiment or a justified new preregistration before final evaluation; it does not start an unbounded search. Browser/assistant requests only read registered artifacts.

Serving checks the fit/calibration/input horizon against the requested analytical cutoff. A model learned from later games cannot decorate an earlier profile as information available then. A retrospective model report may explicitly show its later fit horizon as a separate research context; it does not replace the earlier profile/feature hashes or historical forecast policy. Coefficient/model snapshots are versioned outputs with their actual effective/observed dates.

External DARKO may be imported if legitimate output access, NBA identity, model/date/version, observation history and reuse are established. Label it an external forecast. A current CSV cannot recreate historical publication-time ratings. External salary value conversion requires its own admitted model/output and matching coverage.

EPV/raw spatial and vendor ShotQuality gates remain unmet by current research. Preserve their applicable workflow in capability pages/ledger; do not fabricate tracking. An own expected-shot alternative is not vendor ShotQuality, and a PBP timeline is not spatial EPV.

## Financial data and operations

The owner approved contracts/free agency and versioned CSV/manual corrections when free automation is insufficient. [Reference finance](../research/databallr-replica-findings.md) uses partial salary mapping/external model values; [source research](../research/replica-free-source-feasibility.md) has not established a reliable free complete feed.

### Financial entities and import

Add contract, contract-season amount, option/guarantee observation, transaction/free-agency status observation, roster association and financial-source manifest. Store provider namespace/ID and independently verified NBA crosswalk; contract ID/terms/effective dates/season/team, original labels/currency, source URL/document locator, announced/effective/observed times and amount type. Amounts use exact decimal or integer minor units (USD cents), not binary float arithmetic.

Keep base salary, cash, cap hit, total/average/guaranteed contract value, cap holds, dead money and tax components distinct. An unspecified salary amount remains unspecified. Unknown option/guarantee/years/terms is null; blank salary does not establish expiration, open-market status or zero payroll. AAV can be derived only from known total and documented year denominator, with a derived label.

CSV template includes source namespace/entity ID/NBA ID mapping, financial season, amount kind/currency/value, team association/effective date, contract/status/option/guarantee label, source reference and observation date. Preview validates identity/duplicates/types/coverage before an allowlisted import job seals a dataset. Reject unsafe CSV formula strings in exports; preserve original imported bytes. A manual correction references the original observation, supporting source, reason and new content version; it does not modify a sealed term.

Multiple source rows cannot double-count a player/contract-season/amount-kind. Resolve disagreements through an explicit source-precedence/review policy and retain alternatives. Status and monetary terms have independent source validity. Do not automatically join a contract to today's team from last season's appearances.

### Financial calculations

- Known payroll sums the selected amount kind on valid resolved rows. Expose known/expected/unknown identities and representation of dead money/holds/guarantees/options. Position allocation uses admitted positions and keeps unclassified shares.
- Timeline distinguishes guaranteed years, partial guarantees, exercised/unexercised player/team options, reported/projected seasons and unresolved terms.
- Financial thresholds use admitted season-specific official cap/tax/apron values and a versioned rule contract. Exact cap position requires all required components; summed known salaries alone cannot establish legal room, tax owed or apron compliance. Unknown components produce `threshold_status_pending` with the known subtotal. Contracts (alignment row 14, owner 2026-10-19) shows Databallr's "Below/Above <line> by $X" on known reported salaries with a "known salaries only, N unknown" cue; that is arithmetic on the known subtotal, not a legal cap position.
- Small vs Big defaults to a documented $12M selectable threshold for the selected known salary kind; grouping is factual. Modeled value/surplus/ROI requires an admitted conversion/output/scenario. Compute all modeled aggregates on the same matched subset; show total salary separately. `surplus = modeled_value - matched_salary`; `ROI = surplus / matched_salary`, null for nonpositive/unknown denominator. Monetary value assumptions/version are explicit. Do not invent a dollar conversion from a rating.
- Free-agency status taxonomy initially: unknown/review, unsigned, signed, returned, option_pending, two_way. Define group predicates and whether categories are exclusive. Summaries/tabs use the same filtered/unfiltered denominator labels; totals must reconcile. Signing announcements with undisclosed money populate status while terms stay unknown.
- Observed reports are distinct from future option/cap/value scenarios. Effective and known-at boundaries govern historical finance queries; retroactively acquired information is labelled reconstructed rather than originally known.

Refresh submits a bounded tracked job; it does not promise upstream availability or verified terms. Manual imports/corrections are local operator mutations through the existing same-origin/server token boundary. No public account service, transaction advice, autonomous signing action or subscription is required.

## Live service: low intensity by design

Use an independent provisional read model and source adapter. [Current checks](../research/replica-free-source-feasibility.md) found NBA CDN access rejected here and ESPN consumer endpoints returning scheduled data only. Select a freely accessible candidate through admission; do not bypass access controls or claim an officially supported API/SLA from consumer JSON.

The poller is owned by the worker, with a dedicated feed lease/lock and isolated database sessions. Browser/API reads return cached observations and never download directly. Same-origin protected activation/heartbeat routes maintain bounded view leases; defaults: 150-second demand TTL and 60-second visible-view heartbeat. No active lease means no recurring Live acquisition.

The first active lease can schedule a prompt coalesced poll within the same rate budget; initial GET remains a cache read and can return `awaiting_first_observation`. Visibility/pause/unmount releases the lease when possible, with TTL recovery for abrupt disconnects. Start with a 512 KiB scoreboard response cap and 2 MiB selected-game response cap, then record actual provider sizes/transfer totals. An oversized payload fails explicitly instead of creating uncontrolled memory/storage growth.

| Budget | Initial rule / acceptance |
| --- | --- |
| Source polling | One shared scoreboard request per approximately 60 seconds while demanded. Minimum source interval 60 seconds unless an explicit later measured decision changes it. |
| Boxes | At most three selected active games globally; one box/summary per selected game per poll. Historical/final boxes cache and reconcile, without recurring historical polling. |
| Client reads | Cache GET at most once per 60 seconds plus initial load; visibility/unmount/pause stops heartbeat and timer. Multiple tabs share upstream observations. |
| Concurrency | At most two upstream calls at once; overlapping cycles coalesce. |
| Failure budget | 5-second connection / 10-second total per fetch (or remaining cycle budget), bounded bytes, no retry storm; backoff 120/240/600 seconds on repeated transient failures and respect Retry-After. Access denial disables that candidate with a clear capability state. |
| Traffic cap | ≤4 regular upstream requests/minute for one scoreboard plus three selected boxes; retries count toward the same bound. Record bytes/poll/hour and actual request count. |
| Idle cost | No upstream Live requests when no demand, apart from a specifically scheduled one-time source health check; no spin loop. |
| Local targets | Cached Live API p95 ≤100 ms; mean poller overhead ≤2% of one CPU core and ≤128 MiB incremental RSS on recorded hardware. Measure and adjust explicitly if unrealistic. |

Give selected-game leases bounded fair arbitration; do not fetch all games' boxes because the scoreboard lists them. A final transition may use the next scheduled cycle for final detail; it does not require a burst beyond the traffic cap. No five-second clutch polling is required. This is a lightweight scoreboard/box experience, not streaming tracking.

Normalize scheduled/in_progress/final/postponed/cancelled/unknown, period/clock precision, slate versus event date, source metadata time and acquired time. Preserve namespaces and verify crosswalks. Absent player sections are unknown; scheduled zero points are placeholders; in-progress appeared zero points are provisional observations and never finalized labels. Record last successful observation and actual source state separately from poll time.

Deduplicate unchanged content while retaining acquisition observations. Keep retained final/source observations and anything referenced by saved evidence. Establish measured growth/disk bounds before a retention/cache policy; do not delete protected raw/forecast/analysis evidence automatically. Live cache lifecycle and durable analytical storage are distinct.

Final live outcomes enter the normal admission/reconciliation path before a ready research release uses them. No dbt build, training, pointer swap or forecast issuance per poll. Preserve lock ordering: the Live feed owner lock does not acquire the publication lock during provider I/O; durable analytical admission/publication uses the existing coordinated mutation primitives. The pipeline and cooperative Live loop cannot share mutable sessions or block each other's heartbeats.

Acceptance includes a fake source with scheduled→in-progress→final/correction/postponement transitions, ambiguous IDs/date/clock/empty boxes, several clients, hidden views, worker interruptions and failure backoff; count actual upstream calls. Also observe a real active game's changing source values and later final reconciliation when available. Before that opportunity, actual in-game freshness is `not_yet_observed`, not proven by simulation or a page labelled Live.

## Proposed API seams

Paths are under `/api/workbench`, additive unless a compatible existing endpoint serves the behavior. Final Pydantic/OpenAPI schemas are frozen in B01 and generated/checked against TypeScript before parallel UI work.

| Interface | Behavior |
| --- | --- |
| `GET /catalog`, `/metrics` | Actual sources/releases, season/phase/date/metric/operation/capability catalog; defaults and reasons. |
| `GET /lookup` | Identity-only bounded incremental discovery; see search contract. |
| `POST /query` | Read-only typed v2 query execution; complex predicates do not become URL SQL. Compatible `/players`, `/teams`, `/compare` remain. |
| `POST /operations/{registeredName}` | Read-only bounded analytical operation with fixed schema; supports trends/similarity/WOWY/shots/finance/scenarios. |
| `GET /players/{id}`, `/players/{id}/games`, `/teams/{id}` | Context-bound profile/log/team detail and capability availability. |
| `GET /playoffs`, `/playoffs/series/{id}` | Factual bracket/series context and admitted aggregates. |
| `GET /contracts`, `/contracts/{id}`, `/free-agency` | Typed financial context, terms/status and coverage; no inferred unknown values. |
| `GET /live`, `/live/games/{id}` | Cached provisional observations/status; no acquisition in a read request. |
| `POST /live/subscriptions`, heartbeat/delete | Same-origin protected bounded demand; worker-owned source polling. |
| Personal workspace CRUD | Validated versioned views/favorites/boards/preferences, protected local operator boundary. |
| Analysis save/retrieve/reproduce/export | Complete bounded results and retained canonical operation/context/evidence. |
| Existing jobs/media/forecasts/evaluations | Reuse tracked mutations, safe media cache and registered immutable evidence. |

Query errors are typed: invalid schema/metric/cursor `422`, missing entity `404`, genuinely retired evidence `410`, no ready data `503`. Analytical unavailability is a capability/result status with useful descriptive data, not a fabricated number or generic exception. Mutations follow the existing same-origin/token design and allowlists. Saved evidence, release inputs, model artifacts, finance/correction relationships and personal workspace state are included in backup/fresh restore.

### B19c event identity and conservation gate

Use the [B19c identity/conservation contract](b19-event-identity-conservation.md)
for retained PBP/lineup row identities and replay diagnostics. Equal complete
ordered source projections do not resolve repeated keys with different lineup
sets. The row-hold/endpoint-hold calculations and direct FT-description scoring
are diagnostic hypotheses, not admitted reconstruction or possession policies.
Native/builder lineage, independent period starters/rotation, complete event
membership and separate team scoring versus possession exposure remain required
before append-only stint admission or B20/WOWY population.
