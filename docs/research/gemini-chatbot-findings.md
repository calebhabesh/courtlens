CourtLoad was renamed to CourtLens on 2026-10-07; identifiers below are historical.

# Gemini conversational analytics and web-context findings

Checked 2026-10-01 for the proposed CourtLoad capability revamp. This note answers how an optional Gemini chatbot could investigate CourtLoad data and whether Google web search is inherent or separately configured. It separates verified provider facts from proposed application architecture. No API key, project account, or live Gemini request was accessed.

Subsequent owner decisions confirmed a conversational, CourtLoad-data-only first release with later credential configuration. The [replica search contract](../design/replica-search-contract.md) now specifies the bounded state, tools, evidence and evaluation requirements. Proposal/unsettled wording below records the investigation stage; it does not override that current handoff. Final key UX/storage and runtime model remain deferred.

## Verified provider facts

| Question | Verified fact | Primary source |
| --- | --- | --- |
| Can Gemini work with CourtLoad's database? | Function declarations expose application capabilities. The model proposes a function name and arguments; the application executes the function and returns its result to the model. Gemini does not execute the declared application function itself. | [Function calling](https://ai.google.dev/gemini-api/docs/function-calling) |
| Does using Gemini automatically enable Google web search? | The documented grounding workflow explicitly enables the `google_search` tool. Once enabled, the model can decide whether to issue searches and return grounded information. This is a separate provider capability from application-defined analytical functions. | [Google Search grounding](https://ai.google.dev/gemini-api/docs/google-search) |
| Can an API chatbot run without inference charges? | The API has a Free tier with input/output tokens for selected models. Entitlement is model-specific. Availability to try a capability in AI Studio is not equivalent to Free API access. | [Pricing](https://ai.google.dev/gemini-api/docs/pricing) |
| Is Google Search always free alongside a free model? | No general entitlement can be assumed. Pricing distinguishes inference from grounding and varies by model. Several entries mark Free API grounding unavailable while allowing AI Studio testing; paid-tier free allowances are not proof of a no-billing setup. | [Pricing](https://ai.google.dev/gemini-api/docs/pricing) |
| What limits apply? | Limits include requests per minute, input tokens per minute, and requests per day. They depend on usage tier/account/model and are visible in AI Studio. Published capacity is not guaranteed. | [Rate limits](https://ai.google.dev/gemini-api/docs/rate-limits) |
| Does upgrading require billing? | Moving from Free to a paid tier requires billing setup. Free operation should not rely on that upgrade. | [Rate limits](https://ai.google.dev/gemini-api/docs/rate-limits) |
| How is the key obtained and used? | Google AI Studio manages project-associated Gemini API keys. Google advises against exposing keys in web/mobile client code and describes a backend proxy for client applications. | [API keys](https://ai.google.dev/gemini-api/docs/api-key) |

These facts establish a feasible integration path, not the success rate, speed, current owner quota, or output accuracy of a CourtLoad implementation. An implementation-agent model mentioned in the project conversation does not settle the chatbot's runtime model or its Free-tier eligibility.

## Proposed CourtLoad architecture

The following is an architectural proposal for owner review. It has not been implemented or approved through this research. It extends the existing [assistant contract](../design/workbench-data-contracts.md) and [P8 milestone](../workbench-implementation-plan.md), without changing either document.

Default to questions answered from CourtLoad's admitted data. Expose typed read-only tools around the same analytical services used by filters, tables, and saved investigations. Useful operations include resolving an entity, reading metric definitions and capability states, filtering/ranking a cohort, comparing periods/players, obtaining game logs, and inspecting registered forecast evidence. The model selects an allowed operation; the server validates and executes it. No unrestricted SQL, arbitrary Python, downloads, training, or publication belongs in the conversation loop.

Bind each conversation to a visible analytical context: immutable release identity, season, phase, before-date cutoff, window, and metric versions. Allow conversational refinements such as “only Toronto,” “use per 36,” or “compare the previous 10 games.” Display the resulting query so the user can inspect the interpretation. A changed context must be visible and explicit; ambiguous metric/date requests require clarification or a supported alternative.

Render numbers, tables, chart data, sample sizes, and source links from server-validated evidence objects. The model can explain those objects, but generated narrative must not substitute for unavailable metrics or forecasts. Return an Open in explorer action and the reproducible analysis manifest used by manual research. Saving a finding and saving the entire conversation are separate product decisions.

If the owner wants outside knowledge, offer a separately labeled optional web-context mode. Enable Google Search only for that mode and only after verifying the chosen model/project entitlement. Keep external citations distinct from CourtLoad numerical evidence. A news result cannot silently become an admitted injury fact, roster association, or forecasting feature. Unsupported own-data questions should first explain the missing capability and offer available analytical alternatives; automatic web search is a product choice, not required for semantic analytics.

Keep ordinary incremental entity search operational independently. Natural-language analytical search and entity autocomplete solve different jobs. A missing key, provider outage, or exhausted quota should leave structured exploration and existing saved evidence available.

## Boundaries and completion gates

| Area | Proposed gate |
| --- | --- |
| Tool authority | Server allowlist, typed parameters, validated entity/metric IDs, and read-only service access. Reject invented metrics and unsupported dates instead of silently changing the question. |
| Evidence | Every displayed quantity identifies its verified result/evidence reference, sample, query, metric version, and input release. Test unsupported questions and missing data as explicitly as successful queries. |
| Conversation | Bounded working state for refinements, pinned context, explicit context changes, and a clear new-conversation/reset action. Persistence and retention need an owner decision. |
| Budgets | Bound tool rounds, requests, result rows, input/output tokens, execution time, concurrency, and retries. A timeout/error must not erase valid manual analytics. |
| Free operation | Select a supported Free-tier model on an owner-confirmed Free project. Do not upgrade billing, choose paid fallback models, or treat a paid-tier allowance as a Free project. Application token caps alone cannot prove zero provider charges. |
| Quota failure | Stop with a usable status and preserve the question/evidence already obtained. Offer ordinary search/filter workflows; do not silently route to a paid service. |
| Optional web mode | Verify separate grounding availability/cost; expose mode and provenance. If unavailable under the selected free configuration, keep it unavailable rather than changing billing. |
| Credentials | Keep provider calls and keys on the server. Exclude credentials from client bundles, result cards, saved findings, exports, logs, and repository files. |
| Provider configuration | Recheck official model/tool compatibility, Free eligibility, active account quotas, and current SDK before implementation. Record the verified configuration and optional live-smoke outcome. |

The owner's key-entry experience and storage policy remain unsettled: environment configuration, UI-assisted entry, session-only retention, and durable server storage involve different usability and operational choices. This note does not select among them. The existing P8 document supplies a server-environment baseline; any revised configuration contract belongs in the agreed implementation plan.

## Supported demonstration candidates

- “Which players' points rose most over their last 10 appearances compared with the previous 10?” followed by “Only include players with at least 20 minutes per game.”
- “Show Toronto players by blocks per 36, requiring 300 minutes” followed by “Compare the top two players' game logs.”
- “Explain this stored points forecast and how the baseline performed on similar samples.” A missing registered forecast returns a descriptive research alternative.
- “How did this player's home and away production compare before this date?” The answer includes sample counts and a descriptive, non-causal interpretation.

These are proposed contract fixtures. They do not establish measured semantic-query success. Broader defensive-quality claims, injury inference, and new projections remain outside the evidence unless separately admitted or evaluated.

## Investigation limits

This investigation read the five linked official Google documentation pages. It did not inspect the owner's AI Studio account, confirm project billing/tier, retrieve an API key, make API calls, test model responses, or measure latency. The architecture above is a proposal for CourtLoad; it is not a provider guarantee.

Provider pricing, model availability, tool compatibility, quotas, and data-use/storage terms can change. Exact runtime model selection, credential UX, conversational retention, and permission for web context require owner decisions and implementation-time verification. This note makes no claim that browser access to Gemini or a Google subscription grants a particular API allowance.
