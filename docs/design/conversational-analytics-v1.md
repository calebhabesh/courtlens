# Conversational analytics v1 — B33 backend contract

2026-10-03. Implements the bounded backend portion of the [search contract](replica-search-contract.md). [Frozen schemas](conversational-analytics-v1.schema.json) define the request, response, plan and registered operation arguments. B34 owns the conversational interface and real-provider language evaluation; B35 owns explicit saved investigations and exports.

## API and execution

- `GET /api/workbench/assistant/operations` returns schema-derived registered operations.
- `POST /api/workbench/assistant/turn` accepts a required UUID request ID, message of at most 2,000 characters, optional conversation ID/context fingerprint, explicit clarification selection and optional manual canonical plan.
- `DELETE /api/workbench/assistant/conversations/{uuid}` clears local active state. It does not remove datasets, results saved elsewhere or provider-held records.
- The existing `/assistant/status` and `/assistant/query` endpoints remain compatible. Their answers use the same validated execution and server renderer. Legacy provider adapters may propose operations, but their prose, table values and claims cannot become findings.

The registry contains `query`, `definition`, `profile`, `compare`, `team`, `forecast`, `compare_periods`, `distribution`, `splits`, `similarity`, `workload_shifts` and `finance`. Arguments come from the existing typed operations or strict small argument models. Unknown fields, arbitrary SQL, URLs, source acquisition, refresh, training, credential reads and writes are rejected. Plan steps are independent in v1: provider-defined dependencies/arithmetic are rejected. WOWY, shots, matchup, external-rating and model-report tools remain unavailable until independently registered and admitted.

The server resolves and pins release, dataset, season, phase, exclusive cutoff and window before planning. An explicit context-change proposal requires clarification; arguments cannot silently replace pinned inputs. Identity resolution reuses normalized aliases and ranking, restricted to the NBA player namespace. Only unique exact names/verified aliases or existing canonical IDs select automatically. Other candidates require an explicit choice; no first-substring shortcut remains. Identity discovery does not establish membership in a statistical cohort.

Follow-ups receive the prior canonical plan, context and bounded exchanges, rather than provider transcripts or remembered numeric rows. Request-ID repeats return the retained answer; conflicting reuse returns HTTP 409. Identical operations reuse immutable-input cache entries. The registry explicitly rejects unsupported position restrictions, unsupported normalization/denominator filters and other query shapes rather than silently dropping them. A minimum-minutes refinement is supported; “only guards” remains gated on admitted position evidence.

## Evidence and numerical output

Only executed server results supply numbers. Cells carry exact result/operation hashes, entity and row identity, path, metric/version/unit, sample information, input identities and context fingerprint. Binding requires the exact cell and its semantics, not a matching number elsewhere. Comparison sides and differences retain distinct entity attribution and per-metric samples. Null stays null; reported nonappearance never becomes inferred injury or a zero performance outcome. Finance cents and decimals remain strings with independent immutable book/year/known-at/effective-date context. Forecasts retain their own issuance inputs and cannot expose an issuance created after the pinned cutoff.

Manifests hash canonical plans, bound inputs, operation/metric versions, result hashes and evidence IDs. They exclude provider prose, keys and question text. The compatibility facade fills approved observational templates from these cells. New responses expose server-renderable rows/evidence; arbitrary provider claims, numbers and tables are forbidden by the plan schema.

Values preserve **the precision returned by the registered analytical service**. Some existing services round aggregates before B33 receives them. B33 cannot recover full raw precision; a full-precision upstream operation revision remains necessary before claiming that part of the parent evidence contract. Units, samples and metric versions remain explicit.

`workload_shifts` compares disjoint prior/recent windows, each with N appeared games and paired valid minutes/points. It reports minutes/game increase with points/game delta at most zero, stable ranking, complete-window samples, eligible and matching counts. It scans at most 100,000 retained facts and returns bounded top results; no inferred positions. Scoring/minutes distributions disclose each metric's available sample. The minutes-per-game metric now uses actual retained minutes, rather than producing an empty unsupported summary.

## Exact destinations

Stats links serialize the executed QuerySpec, including metric selectors and versions. Profile/Compare/Team retain explicit basketball context; Finance links use B30 financial parameters and keep basketball context separate. Registered research operations expose exact read-only **manual API URLs** using all executed arguments. These reproduce the result in the real HTTP probe.

Existing Research UI URLs do not yet preserve every release/cutoff/operation parameter. B33 therefore does not claim “Open in Research” UI equivalence. B34 must implement the operation view/serializer round trip before labeling those destinations as equivalent UI actions. Operations without an equivalent destination return no URL; no question-keyword routing remains.

## Bounds, lifecycle and failures

| Resource | Enforced bound |
| --- | --- |
| Active conversations | 64 per API process; 30-minute inactivity expiry; eight recent exchanges |
| Request body | 160 KiB before JSON parsing |
| Provider planning | One call per turn; at most 20 seconds; output at most 2,000 tokens; serialized input at most 64 KiB |
| Validated plan | Eight independent registered steps; output plan at most 32 KiB |
| Analytical output | 100 rows per operation; 200 cumulative rows; nested analytical rows count toward limits |
| Result / response | 2 MiB cumulative rendered results; 3 MiB complete response |
| Result cache | At most 128 entries / 8 MiB, keyed by bound inputs and versions |
| Retained retries | Eight per conversation, pruned toward 2 MiB with at most one bounded response retained |
| Deadline | 45 seconds per turn; SQL statements limited by remaining time and at most 20 seconds |
| Concurrency | One active turn per conversation; one provider-backed turn globally per API process |

PostgreSQL analytical operations run in a separate supervised process with a read-only, repeatable-read transaction. Expired work is terminated; late results are discarded. The planning transport is supervised with a hard caller deadline. A misbehaving provider thread remains locked until it exits, preventing overlapping transport; late output cannot change a response. There are no SDK retry loops or automatic paid-provider fallback. Quota responses honor numeric or HTTP-date Retry-After. Secrets and raw provider exceptions are absent from answers and manifests. Actual token usage is recorded when supplied by the provider; missing metadata is labelled unavailable.

State/cache/locks are process-local and reset on API restart. The supported local deployment uses one API worker. Multiple API workers/replicas require shared state and concurrency coordination before claiming installation-wide limits. Active question text is retained locally for bounded follow-ups; clearing local state cannot erase provider-held records. Manual canonical plans use the same validation, execution, evidence and cache without a key or provider call, including during provider quota cooldown.

Responses distinguish answered, clarification required, unsupported, no data, insufficient sample, disabled, quota exceeded, timeout, provider error and busy. Typed API validation errors remain HTTP 422. Context/request conflicts are HTTP 409. No saved investigation, publication pointer, finance book, acquisition or model artifact is written by conversation execution.

## Evidence and remaining gates

The frozen [45-case corpus](../../tests/fixtures/assistant/b33-corpus-v1.json) contains 25 supported, ten clarification/data-limited and ten unsupported/adversarial cases, including twelve held-out cases. Its adjacent SHA-256 freezes the cases before later language evaluation. Fixture providers validate structural plans, execution, state and adversarial rejection; they do not establish natural-language understanding.

[Final real HTTP evidence](../evidence/b33-real-conversation-final.json) exercises retained PostgreSQL inputs with explicit manual plans, cache reuse and local reset. Earlier captures are retained; the first capture predates the minutes-distribution correction and is superseded. [Verification manifest](../evidence/b33-verification.json) records final checks and binds schemas, corpus, code and evidence hashes.

No Gemini inference calls were made for B33 acceptance. B34 must run the bounded opt-in evaluation against an owner-configured eligible project and report actual model/version, tier, calls/tokens, latency and per-case outcomes. No free-tier eligibility or language accuracy is inferred from local fixtures. B34 also owns accessible follow-ups/clarifications, failure/configuration states, operation cards and exact Research UI links. B35 must keep saving/export explicit and retain full verified results independently of ephemeral conversations. B32's real in-game/final acceptance remains open.
