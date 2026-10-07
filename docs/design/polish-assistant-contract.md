# CourtLoad hybrid assistant contract

2026-10-05. Parent: [freeze handoff](../polish-freeze-implementation-plan.md). **PF07a contracts frozen and PF07b durable backend history verified on 2026-10-05; PF07c bounded retrieval and PF07d bounded integration/language gate verified on 2026-10-06; PF08 threaded UI acceptance verified on 2026-10-06; PF09 bounded freeze acceptance verified on 2026-10-06; [measured evidence](../evidence/pf09-freeze-acceptance/README.md).** Applies to PF07–PF08. The owner agreed to hybrid NBA/site conversation, verified free external retrieval, sensible assumptions, durable local threads, qualified statistical leaders and reasoned basketball opinions.

This revises the older [search/chatbot contract](replica-search-contract.md) in four specific areas: data-only responses become typed hybrid responses; process-local 30-minute conversation expiry becomes a working-memory policy rather than history deletion; clear conversational context changes work within one thread; explanation/discussion prose is allowed under the provenance rules below. Preserve v1 saved artifacts, typed local computation, immutable inputs, deadlines and the no-paid-fallback rule.

## Product promise

Every submitted question ends in a readable response: a direct answer, a necessary clarification, or a specific honest inability statement with a useful next action. This is a response-completeness requirement, not a promise that arbitrary questions have verified answers. Empty result cards, null manifests, raw unsupported statuses and “Executed query …” are insufficient.

Lead with the answer, usually one short paragraph. Add a small table/chart when it helps, a compact interpreted-scope line, sources when applicable and optional Open in Stats/Research or evidence details. Complex questions may need more explanation; the default is concise. Avoid repeated release UUIDs, planning/tool traces, technical manifests and blanket disclaimers in the thread.

**Revised 2026-10-07 by [AR09 answer-first](#ar09-answer-first-policy-2026-10-07); the position rules below are superseded there.** The owner clarified the point-guard example as “answer or explain inability.” Local position admission is not a prerequisite to completing this freeze. Try verified local operations when their required metadata exists; otherwise use the approved sourced external path. If neither establishes the PG cohort/leader, say exactly what could not be verified. Never infer PG from a name, assists or a generic G label.

## Answer routing and knowledge

Use a server-validated typed intent/router, extending the current planning/execution module rather than replacing it with an unrestricted agent. A mixed question can have multiple typed blocks with distinct origins.

| Answer kind | Authority | Required behavior |
| --- | --- | --- |
| Verified local analysis | Registered CourtLoad operations and exact evidence cells | Compute numbers/ranks/differences on the server; bind entity, metric, unit, scope, sample and input identity. Provide equivalent manual navigation. |
| Site guidance / sourced explanation | Versioned site knowledge, catalog and approved explanatory sources | Explain actual routes, controls, definitions and limitations. Capabilities come from runtime state rather than stale prose. |
| External answer | Verified free public sources retrieved through bounded server adapters | Cite the pages supporting claims; retain source/retrieval/period identity. Distinguish these from admitted CourtLoad data. |
| Basketball discussion | Stated criteria and supported factual inputs | Allow clearly labelled judgment and general explanation. A viewpoint is not a measured player-quality score, causal estimate or winner probability. |
| Clarification / inability | Resolved ambiguity or actual failure/gap | Ask one material question or explain the specific gap. Preserve the original request and applicable useful alternatives. |

Curated Markdown is useful for site navigation, metric explanations, NBA concepts and common task examples. Create a small versioned knowledge registry, with source references, content hashes, update dates and route/capability links. Begin with deterministic section/keyword retrieval appropriate to measured size; a vector database and bulk database embedding are unnecessary prerequisites.

Knowledge entries distinguish stable explanations from time-sensitive facts. A comprehensive static league file cannot keep rosters, statistics or news current. Prefer admitted data or retrieved sources for those claims. General conceptual explanations and opinions can use model prose; specific numerical, historical-outcome and current factual claims require their matching evidence/source. Source material is content, not instructions to the model or server.

The initial knowledge set should cover finding/comparing players and teams, WOWY meanings/availability, seasons/phases/windows, common basketball/metric definitions, forecasts versus descriptive analysis, saved findings and the main settings tasks. Omit engineering block IDs and unreleased features from everyday guidance. Source-backed facts do not silently become warehouse rows, roster evidence, injury facts, model features or forecasts.

## Defaults, time and qualification

Resolve these rules on the server and expose the resulting short scope line:

- Ordinary statistical questions default to regular season. “Recently” uses the registered last-ten-appearance default; changes use the preceding ten disjoint appearances. Existing operation-specific defaults remain explicit.
- “Last season” uses the most recently completed NBA season relative to the actual current date, unless the message explicitly establishes a historical frame. A stale hardcoded page season or missing local coverage must not change what the phrase means. For example, on 2026-10-05 it resolves to 2025–26, independent of an old 2024–25 page default.
- Use a verified/versioned season calendar and an injectable clock, with the as-of civil date in America/New_York unless the message establishes another frame. A whole NBA season is completed after its Finals conclude; the interval between regular-season completion and the Finals does not make the ongoing whole season “last season.” Record verified completion boundaries, exceptions and calendar source identity rather than assuming June 30 or using the latest dataset label. Handle season transitions and unusual historical calendars. “This season,” “last year,” a calendar year and a basketball season are distinct. Ask only when the distinction materially changes the request and cannot be resolved from the message/thread.
- The drawer inherits page scope for questions without an explicit or relative-time override. New standalone chat resolves actual catalog defaults. Follow-ups inherit the previous resolved selections/scope unless their language changes them. Once resolved, a retained turn is not reinterpreted on a later day.
- Clear season/window changes execute inside the same thread and display their new scope. Materially ambiguous changes need a short choice. Each turn retains its own immutable local release/context; refreshing the public pointer cannot rewrite earlier turns. A needed release change must be explicit rather than silently substituting inputs.
- “Most assists per game” as a league-leader request uses a named versioned NBA qualification policy. NBA's current assists rule is 70% of team games (58 of 82), with the documented season-end missed-games exception; verify current official rules, season lengths and metric-specific differences before implementation. [NBA statistical minimums](https://www.nba.com/stats/help/statminimums)
- User-selected research minimums are separate from official qualification. APG from valid admitted observations does not automatically establish official league leadership. Complete coverage or a directly sourced published ranking is required for that claim; otherwise label the available cohort and limitation.
- *(Superseded by AR09 for G/F/C rankings.)* Exact position subsets need season-specific source labels and a declared combination-position policy. Where a source explicitly lists PG/SG, a PG filter can include that label. Unknown or broad G classifications remain unresolved. Current mutable position fields cannot define historical cohorts.

Use sensible defaults without turning every query into a form. Clarify genuinely ambiguous identities, materially different metrics or on-court versus game-appearance meaning. For a broad opinion such as “better defender,” state criteria and discuss supported facts; a requested statistical ranking selects a named measure/model. Preserve absence-as-unknown and other original data/forecast guardrails.

## Typed v2 responses and answer rendering

PF07a freezes the exact Pydantic/TS request, response and persistence schemas before frontend integration. Preserve the current assistant namespace and strict v1 readers/reproduction; introduce an explicit versioned v2 path/envelope rather than changing the meaning of old plans or evidence hashes.

The v2 envelope needs thread/turn/request identities, terminal status, interpreted intent, per-turn context/assumptions, typed answer blocks, sources/evidence references, safe equivalent actions and internal accounting. Blocks can contain verified text claims, small result tables/charts, sourced explanation, discussion or a clarification/inability response. Context is optional for a pure knowledge answer; do not manufacture a research release for it.

For local analytical text, the server binds structured claim slots to exact computed evidence. Result ordering and selected entity must match the question; equal numeric values in different rows are not interchangeable. Keep server-generated answer templates where appropriate, with concise phrasing such as entity + value + scope + qualification, followed by a useful supporting result. The model may paraphrase nonnumeric explanations; it cannot introduce unbound local numerical findings or arithmetic.

For external factual claims, bind source fields/spans and locators to the actual entity/metric/value/unit/period and qualifier, using tested structured parsing or source-supported extraction/validation. Model-generated extraction is a candidate claim, not verification. Apply binding to nonnumeric claims such as position, roster association and source-reported availability too; preserve the original no-inferred-injury rule. A citation URL alone is not proof of a number or position. A partial table cannot establish a full-cohort ranking. If reliable extraction fails, explain the inability rather than producing a plausible answer from memory.

Open in Stats/Research uses an executed local operation and the shared serializer. An external result links to its source; it does not create a fake equivalent CourtLoad query. Save analytical finding applies to supported verified local results, preserving current immutable manifests. External/explanation/opinion turns remain in chat history with their actual sources; they are not labelled reproducible CourtLoad analytical findings.

Progress can describe bounded useful work. Stream verified answer blocks or show progress until verification completes; do not expose speculative numerical tokens as verified results. Cancelled, late or duplicate requests cannot overwrite newer turns or scope. Empty/error turns show a sentence and next action, not empty manifest disclosures.

## Free external retrieval

Checked official provider documentation on 2026-10-05: the configured gemini-3.5-flash-lite supports Google Search and URL context, but built-in Google Search grounding is unavailable on its free API tier. URL context is listed free for the free tier but requires supplied public URLs and does not independently discover arbitrary pages. These are dated facts to reverify before integration. [Model](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite), [pricing](https://ai.google.dev/gemini-api/docs/pricing#gemini-3.5-flash-lite), [URL context](https://ai.google.dev/gemini-api/docs/url-context)

PF07c establishes a tested free-source registry and bounded read-only adapters for approved public NBA information. Prefer primary sources. Record actual endpoint/page accessibility, source authority, acquisition method, reuse/attribution requirements, periods and update behavior. A URL, free browser visit or AI Studio allowance is not proof of reliable free API retrieval. Enable only paths whose real access and cost behavior have been verified.

Discovery comes from verified free search capability or registered source-specific lookup/query adapters. Supplied-URL tools alone do not supply general web discovery. An unavailable discovery/source path produces an honest inability response; do not silently activate paid Search grounding or promise internet-wide coverage. Core local/manual workflows remain independent.

The retrieval contract includes:

1. **Source identity:** canonical page/endpoint, publisher, title, publication/update date when known, retrieval time, period represented, content digest and the claim's locator. Retrieved-today does not imply updated-today.
2. **Trust boundary:** validate source hosts, redirects and resolved public addresses; source content cannot authorize SQL, writes, shell, keys, local/private fetches or arbitrary further tools. Render safe Markdown/links and sanitize fetched text. Allowlisted retrieval is the explicit exception to the old no-web rule; unrestricted URL access remains prohibited.
3. **Work bounds:** start with at most four source requests per turn, at most two validated redirects each, at most 256KiB response bytes each and 128KiB extracted text total. Include discovery/tool requests in accounting. Provider input remains within the existing 64KiB budget; trimming cannot turn incomplete evidence into a whole-cohort claim. Revisit a bound only with measured evidence and a documented decision.
4. **Time:** all retrieval/model/local work shares the existing 45-second deadline. Individual source requests have explicit bounded timeouts within remaining time. Repairs/retries count toward existing four-provider/eight-analytical-call limits; no independent nested retry loop.
5. **Freshness/cache:** use source-appropriate bounded cache TTLs and content/source versions. Retain a bounded supporting structured record/excerpt, locator, content digest and verification outcome with the durable turn, consistent with source reuse policy. A URL/hash alone cannot show what supported an answer after the source changes or the cache expires. Record failures/staleness. Answer-changing source disagreements are exposed rather than merged into a fake fact.
6. **Isolation:** retrieval never publishes/imports data, starts downloads of analytical datasets, trains models or mutates local findings. External information cannot fill missing local box scores or rewrite historical results.

The registry should demonstrate one factual historical/statistical answer, one site/definition answer and one time-sensitive question with either verified current evidence or a truthful freshness failure. If no free source supports a requested question, the response must explain that limitation. No billing upgrade, paid fallback or secret exposure is authorized.

PF07c implementation and verified source scope: [registered free-source contract](pf07c-free-sources.md).
The v2 wire schemas remain unchanged; retrieval uses the reserved source/fact/accounting fields.

## Durable local threads

PF07b uses additive local database storage for thread headers and bounded paginated turns, with exact per-turn input/result/source references. Distinguish durable transcript/history from active working context, provider state and explicitly saved analytical evidence. The existing 30-minute TTL may evict working memory; it must not erase the retained conversation.

- Threads survive browser reload and backend restart; select/reopen/New chat/delete thread/Clear history work. Provider context remains bounded to relevant recent exchanges or a versioned structured summary, not all history.
- Persist the accepted user message before work starts. Track durable pending/running/completed/failed/cancelled turn states and recover interrupted work after restart. Stop creates a terminal cancellation state and prevents late answer publication; partial blocks cannot be labelled verified.
- Use explicit request IDs, concurrency control and idempotent turn insertion. Transport retransmission after a lost response reuses the request ID. An intentional retry of a completed provider/source failure creates a new linked attempt ID, so it can execute rather than replay the cached failure. Message editing is a new identified request. Preserve the user question through interruption; do not store duplicate or partially committed verified answers.
- Each scope transition creates a new per-turn context segment. Reopening a thread preserves old evidence and resolves any new request explicitly; a later publication cannot relabel earlier turns.
- Deleting thread/history removes active state and its durable transcript/source references according to the schema's retention policy. Separately saved analytical findings remain retained. Shared source-cache bytes follow their bounded retention policy; this action does not promise deletion of provider records.
- Server-side keys, provider exceptions and raw transport transcripts are excluded. Store user questions and displayed answers needed for history; inform users concisely that questions/context may be sent to the configured provider and history is local.
- Protect user-initiated history mutations with the existing local workspace/same-origin pattern. The model has no history-delete/save tools. Backup/restore covers the new history schema and supported provenance relationships.

History limits and query costs are measured in PF09. Paginate history and manage active/cache memory independently; do not silently delete durable threads to enforce the old 64-active-conversation bound.

## Failure behavior and runtime configuration

Separate no observations, insufficient sample, unsupported local operation, external lookup failure/staleness, provider disabled/quota/busy/timeout, malformed output and backend execution failure. User messages are short and specific; sanitized diagnostics/request IDs are secondary. Key configured is not an inference-health check.

When the local operation is unavailable, try the approved external/knowledge route when it can answer the actual question. A provider outage cannot be fixed by repeatedly asking that provider for another plan. When no path succeeds, preserve the question/thread and offer an applicable manual view or retry action. “AI temporarily unavailable” must not stand in for every database or extraction failure.

Keep the existing configured chatbot model unless a verified eligible free alternative is explicitly recorded. Sol/Flash implementation choices do not change runtime model selection. No provider calls are required in CI.

**Owner clarification, 2026-10-06:** CourtLoad must remain free for the owner to use with an
eligible Gemini Free-tier project. Normal usage follows the provider's established project/model
quotas; there is no additional CourtLoad daily or lifetime inference allowance and no separate
call-count approval for the finite PF07d evaluation. This supersedes the earlier evaluation-budget
approval requirement. Retain bounded per-turn work, payload sizes, concurrency and deadlines;
these protect correctness/responsiveness and are not usage subscriptions or billing quotas.

Google's documented limits include requests per minute, input tokens per minute and requests
per day, applied per project rather than per API key. Active model limits come from AI Studio;
do not assume one universal free allowance or derive billing tier from a timeout. Quota errors
stop work with a readable quota state, without retry loops or switching providers/models.
Timeout, capacity and malformed-response failures remain distinct.
[Google rate limits](https://ai.google.dev/gemini-api/docs/rate-limits),
[troubleshooting](https://ai.google.dev/gemini-api/docs/troubleshooting).

An API key does not encode a trustworthy free-versus-paid declaration. For the owner's real
evaluation, retain dated nonsecret confirmation that the configured key's project shows Free
in AI Studio's Billing Tier column. Public model pricing or a successful inference call alone
cannot establish that. Never activate billing, paid grounding or a paid fallback for the owner.
[Google billing/tier verification](https://ai.google.dev/gemini-api/docs/billing#verify-billing-status).

Other installation owners may explicitly configure their own paid provider accounts at their
own expense. Paid Gemini keys work through the existing Gemini adapter; other vendors need a
compatible provider adapter and separate contract/evidence checks. Bring-your-own-provider
support is permitted without making paid services a dependency of the free core. A key from
an arbitrary vendor is not interchangeable with a Gemini key. Preserve the current configured
Gemini model during this freeze; additional vendor adapters are separate implementation work.

## Evaluation and completion

Preserve existing B33/B34c corpora and accepted hashes; create a new versioned corpus for hybrid behavior rather than relabelling previously unsupported cases as old successes. Freeze at least 12 varied held-out cases before prompt tuning; retain at least 45 total cases, extending the existing demonstrations with the owner's exact failure example and these branches:

- “Which point guard had the most assists per game last season?” with a frozen current date, followed by a team/sample refinement; include sourced answer and honest missing-position/source paths.
- “Who leads in assists?” with qualified official evidence versus partial local coverage, ties, valid denominators and no eligible rows.
- “Explain pick and roll,” “How do I compare two players here?” and a site feature whose runtime availability changed.
- “Whose minutes increased without scoring increasing?”, Scottie Barnes similarity and scoring/minutes variability; retain equivalent manual computations.
- Relative dates at a season boundary, an explicitly historical frame, a phase change within a thread, a traded player and a new public release while a thread is open.
- A reasoned defender comparison/opinion, a requested objective ranking and an unregistered future winner probability.
- Current roster/news with stale or conflicting sources, unsupported web discovery, failed source retrieval, wrong citation/value/position binding and fetched prompt injection.
- Reload/restart/history deletion with separately saved findings; duplicate/cancelled turns; provider 429/timeout/disabled and backend failure.

Use fixture providers/sources plus real DB inputs for deterministic equivalence, error and provenance tests. Run actual rendered UI/history flows. Bounded real-provider evaluation records model/version, project eligibility, date/input/source identities, calls/tokens, latency and every failure. Target at least the existing 90% correct supported canonical intent/entity/context/definition gate and 100% rejection of fabricated local findings, fabricated external facts, wrong source/position/period binding, unsupported whole-cohort ranking claims and prohibited actions; every case needs a readable terminal response. Record external factual-answer accuracy independently. Report correct factual answers, appropriate clarifications and honest inability separately. An inability response counts for response completeness, not factual-answer accuracy, and fails an answer-required case whose registered source supplied sufficient evidence.

Reproduce old saved conversation/investigation hashes and retained experiments with zero provider calls. Publish measured failure limits honestly; neither fixture planning nor a universal error message establishes reliable NBA understanding.


## PF07a frozen implementation boundary

The explicit execution endpoint is `POST /api/workbench/assistant/v2/turn`; the original
`/turn` and all v1 saved readers/manifests retain their meaning. The generated
[JSON Schema](assistant-v2.schema.json),
[TypeScript types](../../dashboard/lib/assistant-v2.generated.ts), and
[measured response fixtures](assistant-v2-fixtures.json) freeze the request, terminal
answer envelope, source/fact tuples, exact-cell local claims, safe actions, accounting,
thread headers, paginated history envelopes and durable turn payload. Regenerate with
`.venv/bin/python scripts/generate_hybrid_contract.py`; `--check` detects drift.
Server validators enforce cross-record bindings beyond JSON Schema/TypeScript shapes.

At PF07a acceptance the endpoint was execution-only. PF07b now wraps `run_hybrid_turn`
with durable acceptance, server-owned inherited context/previous plan, database lifecycle
locks, replay, cancellation, recovery and credential-protected same-origin history mutations. Never accept a client-authored prior response as evidence.
`saveable` expresses local-result eligibility; it does not add a v2 save endpoint or permit
external/explanation/discussion artifacts to enter the v1 finding store.

A pure explanation has no analytical release. Guidance uses the small packaged Markdown
registry and release-bound observed coverage where applicable. Missing catalog source
families remain undeclared, rather than inferred from general source admission prose.
The lexical router recognizes the frozen cases; other local questions use the existing
bounded typed planner. No prompt tuning or real-provider accuracy acceptance is claimed.
Mixed clauses separated by a semicolon, question boundary or “and also” support up to four
blocks of work and one analytical plan under a shared deadline. Multiple independent
analytical questions require a choice. Broader language understanding belongs to PF07d.

The verified calendar covers final-game boundaries from 2018–19 through 2025–26, including
the delayed 2020 and 2021 Finals. With a civil-date clock, completion takes effect the next
civil day after the final game; this avoids claiming the game has finished earlier on its
own date. The calendar can establish the last completed season through 2027-04-11, the
verified scheduled end of the next regular season, and refuses later relative dates until
updated. The 2026–27 opening boundary is explicitly registered; other materially ambiguous
“this season” frames ask a choice. Explicit basketball seasons, phases, recent windows and
before-date overrides preserve the selected release. “Last year”/calendar-year ambiguity
asks a season/year question. This does not certify local coverage of the interpreted season.

The APG policy is versioned separately from research minimums. Its exact decimal helper
requires verified team-game exposure and applies the season-end missed-games exception only
against a supplied qualified leader. It does not establish that the retained local release
has complete league coverage or dated position labels. Leader/position/current/external
routes currently return the actual gap; PF07c must supply tested retrieval and verified fact
tuples before they can produce external answers. URLs alone and model extraction candidates
cannot populate the verified source-fact registry. Provider, malformed-plan, database,
missing-observation, insufficient-sample and scope failures retain distinct reasons.

Measured evidence and remaining limits: [PF07a](../evidence/pf07a-assistant/README.md).


## PF07b durable backend handoff

The additive migration `07b810a4f005` stores thread headers, bounded per-turn request/answer
payloads and relational analytical input references. Transcripts are mutable local personal
history; saved v1 analytical evidence remains separately append-only. The v2 schemas above
are unchanged. The existing v1 chat UI still uses v1; its replacement/history controls are PF08.

- `POST /api/workbench/assistant/v2/threads` creates an empty New chat header.
- `POST /api/workbench/assistant/v2/turn` durably accepts the question before execution and
  returns the terminal v2 envelope. A request without a thread creates one. Prefer creating
  a header first so the UI can poll or stop the identified turn while its HTTP request runs.
- `GET /api/workbench/assistant/v2/threads?limit=20&cursor=<thread UUID>` returns up to 100
  headers in stable UUID order; `next_cursor` continues that ordering.
- `GET /api/workbench/assistant/v2/threads/{thread_id}/turns?limit=20&cursor=<sequence>`
  returns up to 100 chronological turns, including accepted questions without answers.
- `POST /api/workbench/assistant/v2/threads/{thread_id}/turns/{turn_id}/cancel` publishes a
  terminal cancellation. Repeated Stop is idempotent; Stop after completion preserves the
  completed answer. Late work cannot replace cancellation or recreate deleted rows.
- `DELETE /api/workbench/assistant/v2/threads/{thread_id}` deletes one transcript;
  `DELETE /api/workbench/assistant/v2/threads` implements Clear history. Neither deletes saved
  findings or their analytical inputs. No external source cache exists yet.

All v2 mutations, including turn acceptance, require the existing workspace operator token.
The fixed-target `/api/assistant-v2/...` Next proxy enforces the existing browser same-origin
rule and injects the token server-side. Reads omit credentials; redirects, arbitrary targets,
extra query parameters and over-budget bodies are rejected. The typed client and concise
local-history/provider notice are in `dashboard/lib/assistant-history.ts`, ready for PF08.

Replay requires the identical original request body and request ID, including the original
optional thread field. Concurrent retransmission while running returns 409; poll the thread
and retransmit the same request after completion. Reuse with edited content returns 409.
Intentional retry uses a new request ID and `retry_of` equal to an unsuccessful terminal turn's
**turn ID**, in the same thread. An edited message uses a new request ID. Server records,
never client responses, provide the latest bounded selections and prior plan. Guidance can
retain explicit initial drawer selections without manufacturing a response's analytical scope.

Lifecycle mutations use short PostgreSQL advisory transactions across workers; analytical
work runs outside that lock. Pending/running work has a 50-second lease, allowing the existing
45-second executor deadline and a bounded publication margin. Another worker's startup does
not cancel live work. Expired work is recovered on turn polling or acceptance into a readable
interruption failure; no automatic provider retry occurs. Without polling/acceptance, the
retained active record remains until recovery is requested. Stop fences publication immediately;
already dispatched execution retains its existing deadline rather than promising provider-side
cancellation. No partial result becomes verified history.

Backup archives hold the history lock across database dump and manifest creation. The
manifest covers validated transcript digests, working selections/plan, retry/sequence/lease
and relational dataset/finance/issuance references. Restore compares that inventory when
present; older manifests retain their prior meaning. Actual PostgreSQL dump/restore, backup
locking and drift rejection are verified. Whole-installation performance/large-history query
costs remain PF09; actual rendered conversation controls remain PF08. External retrieval
remains pending in PF07c.

Measured evidence: [PF07b](../evidence/pf07b-history/README.md).

## PF07c retrieval boundary, verified 2026-10-06

[Registered free-source contract](pf07c-free-sources.md) documents the three enabled primary
pages, supported deterministic bindings, measured access, reuse policy, dates and cache TTLs.
[PF07c evidence](../evidence/pf07c-retrieval/README.md) records actual network/service checks,
trust/budget regressions, durable support and retained v1/analytical preservation. It supersedes
the earlier PF07a/PF07b statements that no external adapter/cache exists. V2 wire schemas and
history storage are unchanged.

External support uses the reserved `external_claim`, `AnswerSource.facts` and `source_requests`
fields. Source links do not become equivalent CourtLoad queries or saveable analytical findings.
Bounded cached supporting records are independent of transcripts; Clear history does not evict
these reusable public records. The cache never serves expired support as a verified current fact.
Cache hits retain their original retrieval timestamps. Stop/deletion fence late publication just
as for analytical work. No model receives retrieved content; no paid grounding/discovery or
warehouse admission occurs. Current roster/injury, position-qualified leader and unmatched web
requests still explain their actual verification gap. PF07d language/integration, PF08 rendered
threads/sources and PF09 acceptance remain separate pending gates.

## PF07d integration boundary, 2026-10-06

The checksum-frozen `pf07d-hybrid-v1` corpus contains 49 cases, including 12 held-out
cases frozen before evaluation. Disposable PostgreSQL HTTP checks cover every case,
exact request replay and persisted question/response. Fixture plans produce the same
canonical operations, context and exact computed results as manual plans. Actual retained
inputs cover 48 applicable cases; the synthetic empty-scope case remains separately
verified on its declared fixture and is not a retained-data success.

The scorer separates answer-required external facts, honest inability, clarification,
response completeness, exact evidence binding and manual equivalence. A readable inability
fails a supported answer-required case. Source links without exact supporting tuples fail.
The assists knowledge keyword repair changes no analytical formulas or frozen wire fields.

`scripts/evaluate_pf07d_hybrid.py` defaults to fixture-only read-only evaluation with an
explicit disabled provider for unmatched routes. Real inference requires `--real-provider`,
a dated free-project eligibility record. Under the owner's quota-policy clarification above,
the record needs `verified_free`, `checked_at` and `verification_method`, without credentials
or an `authorized_calls` field. The default runs the finite frozen corpus until completion or
the first provider failure; Google enforces the project's actual quotas. `--max-calls` is an
optional smoke-test stop, not a mandatory budget, not capped at 24 and not a normal-usage quota.
Public pricing or a configured key alone is insufficient account-tier evidence.
The evaluator records actual model/version, SDK, call input digests, usage, latency and
failures; it stops on provider failure without retries and refuses to overwrite evidence.

No real inference was run for this boundary. **PF07d remains partial until eligible-project
real-model evaluation passes the language gate.** The former B34c v1 acceptance does not
establish v2 language accuracy. Actual rendered conversation/history/citation UI remains PF08.
Evidence, classifications, preservation and reproduction: [PF07d](../evidence/pf07d-evaluation/README.md).

## PF07d first real-model measurement under clarified quotas, 2026-10-06

The owner confirmed the configured NBA-Analytics key's Free tier with an AI Studio screenshot;
its displayed key suffix matches local configuration. The finite evaluation made **10 actual
model calls**, with no provider failure, retry, model switch or paid tool. All **48 applicable
cases** completed; **45/48** were canonically correct, **48/48** readable and evidence-safe,
**16/16** critical cases correct and **4/4** answer-required external facts correct. Only ten
cases actually called the model: **7/10** canonically correct, below the required 90% gate.
Do not report the overall 45/48 rate as language accuracy.

Three scoring-table cases (one originally held out) added an unrequested minutes selector,
failing exact manual equivalence. Those observed cases are now regression evidence; do not
claim their independent holdout status for later prompt tuning. Original corpus/checksums,
provider prompt, mathematical implementation and historical evidence are unchanged.
**Eligibility and call authorization are resolved; PF07d remains partial on language accuracy.**
Next bounded work is repairing the scoring-table planning defaults and evaluating the repair
under the preserved evidence/holdout rules. PF08 acceptance and PF09 remain pending.
[Measured quota-policy and model evaluation](../evidence/pf07d-quota-policy/README.md).

## PF07d scoring repair and bounded language acceptance, 2026-10-06

This measurement supersedes the preceding pending-language status; preserve those historical
reports. Named-metric tables/lists/rankings explicitly select the requested metrics and sort by
the primary metric unless otherwise requested. Scoring means PPG unless a different definition
is explicit. Generic scoring/minutes defaults apply only when no metric is requested; sample
thresholds do not add columns. Single-metric variability requests do not add another distribution.
These are planner instructions, not formula changes or output trimming.

Final real-model original-corpus regression passes **10/10 model-planned** and **48/48 applicable**
cases, with **16/16 critical**, **4/4 required external facts**, and complete/evidence-safe responses.
A separate **12-case supported analytical holdout**, frozen before prompt tuning, passes **12/12**
with the final prompt and no subsequent tuning. Original held-out flags are historical regression
labels; the fresh holdout is now observed evidence too. The two final runs share the same prompt
identity. Neither deterministic responses nor missing-source inability inflate language accuracy.

**PF07d's bounded backend language/integration gate is met.** The unchanged model/project policy,
raw runs, initial candidate failure, scoped checks, preserved analytical outcomes and limitations
are in [the scoring-repair evidence](../evidence/pf07d-scoring-repair/README.md). This does not
establish arbitrary-question reliability, admit missing data sources, complete PF08's rendered
threaded UI acceptance or satisfy PF09 resource/recovery gates.

## PF08 threaded UI acceptance, 2026-10-06

The default Ask page and shared drawer now use durable v2 threads; `?experience=manual` retains
manual/v1 research. Scope navigation and cross-instance updates preserve retained per-turn inputs
and independent drafts. Eligible local results can rerun the exact pinned manual operation and
explicitly save independently reproducible evidence. Provider/source/backend failures remain
specific, retry-linked and question-preserving. No v2 schema/provider/source-registry change.

[Measured UI evidence](../evidence/pf08-threaded-acceptance/README.md) records 56 production browser
cases, real service/provider workflows, restart, actual 200% zoom, large history, save/clear
integrity and retained hashes. Earlier pending UI language in this document is historical.
Full PF09 freeze/restore/resource acceptance and unresolved original source gates remain pending.

## AR07 additive page-context request

AR07 adds optional `HybridTurnRequest.page_context` without changing the v2 version or old
response/evidence semantics. It contains the rendered player/team/compare route, bounded canonical
player/team IDs and the page's resolved analytical selections. The UI's human-readable entity label
stays local and is not submitted as analytical evidence. Routes and entity selections must agree.
No prior transcript, claims, arbitrary routes or provider instructions are accepted in this field.

The page selections override inherited thread scope for this turn; explicit next-question `context`
then overrides those selections. Server calendar resolution and existing pinned-operation rules
still win. Singular player/team references and an unambiguous two-player comparison are resolved
server-side before planning, with canonical identities included in the planner payload and the
resolution recorded in scope assumptions. Ambiguous references require clarification. Plans cannot
change a resolved entity, and player/team query plans must retain the matching entity restriction.
The normal single repair budget applies to a rejected provider plan.

The header panel is available on loaded player, team and player-comparison pages. Other header Ask
entries open the full Ask page. Removing the page chip omits `page_context` from subsequent requests;
existing thread history and analytical scope remain available. Opening the full Ask page carries
resolved scope in its URL. Context applies only to new turns and never rewrites retained evidence.
Requests without page context serialize exactly as before AR07, including their durable hash input.
The existing request byte limits, history protections and provider-call budget remain in force.

## AR09 answer-first policy, 2026-10-07

The owner asked that every question get an answer. On 2026-10-07, “Who were the top 10 centers in
ppg last season” was refused. The router sent every position word to the external route, and that
route had no registered position source. The refusal text also wrongly said “no dated PG cohort.”
The language provider was never called, so this was not a provider failure. The owner approved
changing the policy from “refuse unless fully verified” to **answer first, and say what was
assumed**:

1. **Answer the answerable part.** When a requested restriction can be approximated from
   release-bound evidence, run the approximation and show the approximation next to the answer.
   When it cannot, run the rest of the request where that is still meaningful, and say which
   restriction was not applied. Never drop a restriction silently.
2. **Labelled general fallback.** If the planner finds no registered operation for a question, the
   turn tries the labelled, number-free general-knowledge answer before refusing. It says that
   CourtLens data cannot compute the exact request. Prohibited actions and current
   roster/injury/news facts are still declined.
3. **Inability is the last resort.** It names the specific gap and offers the closest useful
   alternative.

Unchanged: every number comes from an executed result cell or a verified source fact; there is
no stat answered from model memory, no inferred injury or absence, no winner probability or
start/sit verdict, and general-knowledge text remains labelled and number-free.

**Positions (`position_query`, policy `starting-position-majority-v1`).** Admitted NBA box scores
record a G/F/C position for each game's starters. A player's position for the selected season and
phase is the one recorded in more than half of their starts in games before the cutoff, among the
release's `appeared` player-games. Players without that majority, including bench-only players,
are unlabelled and excluded from a position ranking. These are game-dated observations, so later
games cannot change earlier labels. Before use, the raw files' aggregate hash must equal the
release dataset's `content_sha256` (the importer's own hash). Otherwise the turn runs the
unfiltered ranking and says the position filter was not applied. Point/shooting guards, wings and
small/power forwards are answered as the matching G/F group, with that stated next to the answer.
Labels never come from names, roles, assists or current roster fields. They are not official
roster positions. A position answer is a ranking of the labelled cohort; it does not establish
official league leadership.

Results show their limitations directly below the compact answer table. They also stay in
“How I got this” and the scope assumptions.

**Rule planner when the model is unavailable.** If the language provider fails (quota,
disabled, busy, timeout or error), a deterministic rule planner may plan the question. It only
covers unambiguous shapes: leaderboards (with position, team, order and count), single-player
stats, profiles, comparisons, team summaries, forecasts and simple count/position follow-ups.
Its plans pass the same canonical validation, and it never repairs. It asks the same
clarifications the planner contract requires, refuses prohibited requests and leaves everything
else as the real provider failure. Each answer says it was planned by rules, and no narrative
call follows. Rate and lowest-value rankings add labelled minimum-volume filters.

**Official awards and champions.** Award and championship winners come only from the pinned
`nba-awards-v1` registry. Each record was read from a cited NBA.com page and is presented as a
verified external claim with its source link. Counts, all-time questions, predictions and
seasons outside the registry are never filled from memory. Evidence:
[AR09](../evidence/ar09-answer-first/README.md).

