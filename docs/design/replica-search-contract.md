# Incremental lookup and conversational analytics contract

2026-10-01. Parent: [handoff](../databallr-replica-implementation-plan.md). Prescribed behavior, implementation pending. This contract sharpens the existing assistant and search foundation; it does not introduce a paid search service, arbitrary SQL agent or required vector database.

## Two search jobs

**Lookup** discovers players, teams and application pages while typing. It uses local identity/alias metadata, returns bounded matches and is independent of game-stat aggregation or model access.

**Ask CourtLens** is a multi-turn chatbot for questions, definitions and investigations against admitted site data. Gemini interprets/refines language and proposes registered operations. CourtLens resolves the context/entities, computes results, verifies evidence and renders answers. Optional semantic retrieval of metric definitions/methodology/aliases may help interpretation; embedding numeric rows cannot replace computation.

The first release uses CourtLens data/tools exclusively. Do not enable Google Search grounding or web fetching tools implicitly. Provider background knowledge is not evidence for NBA outcomes. A future explicit web mode needs its own source, cost and provenance contract. [Verified Gemini facts](../research/gemini-chatbot-findings.md)

## Incremental lookup API

`GET /api/workbench/lookup` accepts `q`, optional release/identity catalog context, allowed kinds and bounded `limit` (default 10, maximum 20). Return query normalization, catalog/version identity, ordered matches, match basis/score, typed entity identity, display/subtitle/portrait fallback, relevant availability and a context-preserving canonical destination.

Empty input returns local recent selections and navigation suggestions, not an unbounded list of every identity. One-character input supports bounded prefix candidates; two or more characters permit substring/fuzzy candidates. Historical identity discovery can work when the selected current season has no appearances. Discovery availability is not inclusion in a historical statistical cohort.

Normalize case, Unicode/diacritics, whitespace and punctuation through a versioned routine; retain original display names and source aliases. Handle name suffixes and team city/tricode/common aliases explicitly. Canonical/source identity aliases carry mapping evidence. Never silently choose the first substring match as the analytical target.

Initial deterministic ranking:

1. Exact canonical name or verified alias.
2. Prefix of full name/alias or a name token.
3. Substring match.
4. Bounded typo similarity for queries long enough to be meaningful.
5. Stable kind/display-name/canonical-ID tie ordering.

Recent selection can affect personal suggestion order, with a disclosed local ranking rule; it cannot redefine identity or a statistical result. Do not use current statistical popularity to prevent discovery of historical players.

Use a dedicated normalized identity/alias index and versioned cache. Start with bounded SQL/in-memory prefix/token matching appropriate to measured cardinality. A Trie is an option if prefix latency warrants it; PostgreSQL trigram indexing is an option if substring/typo lookup warrants it. Decide after B04 measures historical cardinality, payload and query plans. A trigram index can degrade for very short queries, so the short-prefix path stays explicit. [PostgreSQL primary documentation](https://www.postgresql.org/docs/17/pgtrgm.html)

Cache keys include normalization/identity catalog version, scope, query and limit. Lookup cannot scan or aggregate every player-game. Historical IDs, routes and portrait loading remain bounded; do not preload all portraits or all fact rows into the browser.

### Lookup UI and budgets

One accessible global combobox opens by click, `/`, or Cmd/Ctrl+K outside editable controls. Group player/team/page results; show enough identity detail to distinguish names and indicate unavailable selected-season statistics. Up/down changes active result, Enter selects, Escape closes, and normal Tab behavior remains usable. Announce completion/count without disruptive per-keystroke chatter.

Use approximately 100–150 ms debounce; cache recent results; cancel obsolete requests and discard responses whose query/context sequence is stale. Support IME composition and diacritic input. Empty/error/loading states preserve the input. Selection retains the current release/season/phase/cutoff where applicable; an intentional context change is explicit. Table filtering reuses normalization but remains a separate analytical query.

Initial targets on recorded local hardware: backend warm lookup p95 ≤50 ms; settled-input to usable results p95 ≤200 ms including debounce; maximum 20 result rows and roughly ≤25 KiB uncompressed JSON. Measure cold cache and 1/2/4 concurrent clients separately. These are targets, not existing benchmark claims. Avoid premature infrastructure when a small identity index meets them.

Acceptance covers Jokić/Jokic, Dončić/Doncic, apostrophes/hyphens/suffixes, partial surname/full name, TOR/Toronto/Raptors, ambiguous names, future discoverable rookie with no prior cohort membership, empty-season context, slow response reordering, failed API, keyboard selection, IME and 375 px layout. Typing causes no Gemini calls and no ranking scans.

## Conversational request and state

Preserve the existing assistant namespace while adding versioned request/response schemas. A request includes message text (maximum 2,000 characters), optional conversation ID, client context fingerprint and any explicit clarification choice. The server resolves/pins context before model transport; neither the model nor the client can substitute a different release unnoticed.

Maintain bounded local conversation state: current resolved context, canonical entity selections, executed operation manifests/evidence IDs and up to eight relevant recent exchanges or a structured server-generated summary. Raw provider transcripts are not required for saved analytical evidence. Default active conversation can expire after 30 minutes of inactivity; explicit saved investigations remain retained. Clear/reset controls remove active conversational state according to its documented policy.

Each turn has its own immutable result/input identity. Follow-ups such as “only guards, at least 300 minutes” transform the previous canonical plan through validated operations; they do not ask the model to remember numeric rows informally. Changes to period, team, phase or release are parsed into an explicit context-change proposal and echoed before execution when ambiguous. A newly published release does not automatically replace the conversation's inputs.

Provider calls receive the pinned context, available operations/metric definitions and only bounded necessary results. The API key stays server-side. The local database is not uploaded as a bulk asset. Questions and selected evidence are sent to the configured provider. Show a concise user-facing configuration/privacy description; avoid displaying implementation internals such as tool-round counts as primary product copy.

Verify the chosen API's storage/data-use behavior when configuring it. Disable provider interaction persistence where the API supports that setting; keep conversational working state local. Do not describe local conversation expiry as deletion of Google's records or promise provider retention/data-use terms that were not verified. The owner can still use the whole manual application with the provider disabled.

## Intent and operation planning

Use one versioned `AnalysisPlan` schema:

```text
plan_version
resolved_context + explicitly requested context changes
entity selections / unresolved candidate choices
operation steps [{ registered operation, typed arguments, permitted dependency refs }]
metric/window/sample/cohort definitions
interpretation and clarification requirements
requested output kind (table / chart / comparison / definition / forecast / scenario)
```

It is a structured analytical plan, not executable SQL/code. Bound steps and predicate depth. Validate all metric/entity/operation/context references server-side, resolve dependency DAGs and reject cycles. Bound workload before executing. Derived differences/ranks/quantiles are registered server operations, not model-generated arithmetic.

Clear supported questions can execute immediately and display the interpreted scope/definitions with editable controls. Materially ambiguous concepts require a short choice or a labelled alternative:

- “Similar” defaults to the disclosed statistical/workload profile, with selectable dimensions; playstyle/projected similarity is a different operation.
- “Consistent” can mean historical spread, stable minutes, or a threshold frequency. Ask when that distinction changes the answer; otherwise show the chosen documented default and allow refinement.
- “Recently” defaults to last 10 appearances with previous 10 for change, with samples shown.
- “Best defender” needs a named metric/model; present supported choices and limitations. Availability expands when actual registered assignment/impact capabilities exist, not by hardcoded keyword refusal or invented overall quality.
- “With/without” requires on-court versus game-level meaning when unclear. A missing row cannot become confirmed absence.
- “Which team will win?” stays unsupported unless a separate registered team forecast exists; current records and named descriptive scenarios remain available.

Ambiguous player identity returns canonical candidate choices; no `.limit(1)` substring shortcut. Clarifications retain the same context and are part of the reproducible plan. Unsupported requests return the failed capability plus applicable alternatives; they do not silently answer a different question.

### Allowlisted tools and operations

Reuse catalog/definition/entity/profile/team/compare/forecast/evaluation tools after context/evidence fixes. Add registered query/trend/distribution/split/similarity operations, then independently admitted WOWY/shots/matchups/finance/scenarios. Keep one tool registry derived from actual schemas/capability requirements. Tool descriptions disclose definitions/denominators and do not promise unavailable data.

The model cannot issue SQL, shell/file access, arbitrary URLs, writes, source downloads, dbt builds, refreshes, training, activation, deletion or credential access. Saving/exporting requires an explicit user action after a verified result. The chatbot may explain how to open an operator workflow without initiating it.

## Numerical evidence and rendering

Remove numeric-value matching, heuristic explorer routing, provider-written table acceptance and retention of unverified claims. A valid value appearing somewhere in the ledger does not prove the model assigned it to the right player/metric/window.

Server evidence cells identify:

```text
evidence_id, operation/run/result hash, canonical entity/grain/row identity
metric/formula/model version, full-precision value and display unit
sample/denominator, cohort, phase/window/cutoff
input/transform/source identities and contributing evidence
```

Evidence IDs address exact cells or server-computed relationships; binding validates entity, metric, unit, context and calculation semantics. Equal values across two rows cannot substitute for one another. Null remains null with its reason. Old forecast output carries its own issuance inputs, separate from the current page context.

The provider may request result IDs, column selections and approved claim templates with evidence slots. The server builds tables/charts/figures from executed results and fills those slots. Quantitative statements, derived differences and observational conclusions use server-owned templates/comparators and verified references. Arbitrary model prose is not displayed as a data finding. Catalog-grounded definitions can be paraphrased with their definition reference; unverified factual/causal assertions are removed or converted to an unavailable/clarification response.

The answer schema returns `answered`, `clarification_required`, `unsupported`, `no_data`, `insufficient_sample`, `disabled`, `quota_exceeded`, `timeout` or typed `provider_error`; resolved interpretation/context; server-renderable result/evidence; limitations; and exact open/save actions. User-visible statuses use plain language.

Open in Stats/Research/Finance/WOWY is generated from the **executed canonical operation**, through the shared serializer. No question-keyword route heuristics. Round-tripping the link must reproduce the same analytical result against the retained inputs. For a result not expressible as the basic Stats table, open its operation view rather than manufacturing a similar-looking table query.

Save stores the canonical plan/steps, selected inputs, operation/metric/model versions, complete bounded results and verified evidence references. Provider narrative or API key is not part of the analytical identity. A saved question is explicitly requested and has an independent privacy/metadata field.

## Free-operation, latency and failure budgets

Google documents free inference for selected models; rate limits vary by project/model, and web grounding has separate availability/pricing. Verify the selected model/tool/structured-output support against current official docs and the owner's project when configuring. The implementation models in the handoff are not the required chatbot model. [Provider research](../research/gemini-chatbot-findings.md)

Core analytical/search UI works with no key. Initially reuse server environment configuration and settings status; final key-entry/storage UX is deferred. Never put secrets in client bundles, logs, saved questions/results, exports or provider exception text. No automatic paid model/provider fallback or billing upgrade. A paid-project key cannot be made free merely by an application token budget; the owner must configure an eligible free-tier project.

| Limit | Initial contract |
| --- | --- |
| Provider/model calls | Maximum four per user turn, including repairs; maximum eight analytical tool calls. Simple intent usually needs one planning call plus an optional explanation call. |
| Evidence | Maximum 100 rows/tool and 200 cumulative rows/turn; provider payload ≤64 KiB serialized, with bounded columns/fields. Full saved result can be larger via the server iterator, without sending it all to Gemini. |
| Output/input | Provider output capped at 2,000 tokens/call; bounded context/message/result input. Use actual provider usage metadata where available; local estimates are labelled estimates. |
| Time | End-to-end 45-second deadline; each provider/network call receives the remaining deadline and explicit ≤20-second timeout. Validation between calls alone is insufficient. Query service has its own work timeout. |
| Concurrency | One active turn per conversation and initially one provider turn globally for the local installation; cancel/coalesce repeats. |
| Repetition | Cache reusable operation results by bound inputs/query versions. Repeated questions must not reexecute expensive facts unnecessarily. |
| Quota/failure | Respect 429/Retry-After; fail clearly without retry loops or expensive automatic fallback. Unsupported/invalid plan repairs count toward the same call/deadline budget. |

Enforce cumulative row/call/time/payload limits in code, not only declarations/system prompts. Share the timeout with streaming progress/transport. Do not silently shorten evidence while claiming to rank the full cohort: aggregation/ranking happens server-side before bounded top results reach Gemini, with actual eligible count.

Optional SSE can show bounded progress events and verified final result cards; model token streaming is not necessary. An interrupted/late result cannot overwrite a newer turn/context. UI messages such as “Comparing recent appearances” help users; raw tool traces stay in diagnostic evidence.

## Evaluation and acceptance corpus

Three owner-agreed demonstrations are mandatory:

1. “Whose minutes increased recently without scoring increasing?” → compare disjoint windows, compute deltas, filter/rank with samples, show both periods and exact definitions.
2. “Which players have produced similarly to Scottie Barnes over their last ten appearances?” → resolve identity/context, registered profile similarity, explain features/distance, open equivalent peer comparison.
3. “How variable has this player's scoring been, and did their minutes vary too?” → paired/disclosed samples, historical points/minutes distributions; no injury or future-floor claim.

Add real refinement “Only guards, with at least 300 minutes,” an ambiguous name/metric, no current-season outcomes, a traded player, missing field/zero denominator, a registered points forecast, a current external rating requested for an earlier cutoff, and salary/free-agent queries with unknown terms. Model/finance/PBP cases activate only once their actual source operations exist.

Create at least 45 cases: 25 supported, 10 clarification/insufficient-data and 10 unsupported/adversarial. Separate development examples from a frozen held-out subset of at least 12 varied cases before prompt/adapter tuning. Include paraphrases, role/prompt injection, invented metrics/IDs, contradictory dates, wrong evidence attribution, model-written table numbers and requests to refresh/train/read keys/SQL/web search.

Offline acceptance validates typed plans, deterministic tools, evidence bindings, equivalent manual queries and state transitions with fixture providers plus real database inputs. Fixture providers do not establish language understanding or real-model accuracy.

When a key is later configured, run a bounded opt-in real-provider evaluation and record actual model/version, date, dataset, quota/project tier, calls/tokens/latency/failure and outcomes. Initial language target: ≥90% correct canonical operation/entity/context/definition on supported cases, 100% rejection of fabricated numerical rendering and prohibited tools, and correct clarification/unavailability on all critical cases. Report counts and failures, not only a percentage. If the model misses the target, fix the bounded planner/definitions or report an unmet chatbot gate; do not call deterministic fixtures a successful semantic engine.

Provider-free CI remains mandatory. Manual operations, incremental lookup and saved investigation reproduction are independently verified with AI disabled.
