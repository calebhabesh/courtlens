# CourtLens assistant revamp

> **Superseded for answering behavior (2026-10-07):** the [assistant agent handoff](assistant-agent-plan.md) replaces this plan's planning, routing, general-knowledge, narrative, clarification, provider and eval-scoring decisions. Layout, side panel, threads, saved findings and streaming transport remain. AR evidence stays sealed.

Prepared 2026-10-06. **The owner confirmed the direction through a grilling interview on 2026-10-06. Blocks AR01–AR09 are pending until the [progress log](assistant-revamp-progress.md) records measured evidence for them.**

This handoff supersedes the [freeze handoff](polish-freeze-implementation-plan.md) for the Ask
experience only: `/ask` layout, answer composition, routing of general basketball questions,
streaming and the assistant panel. It does not replace the analytical contracts: server-owned
scope, typed operations, evidence cells, immutable saved findings, durable local threads and the
"zero inferred claims" rule all still apply. Sealed PF07d/PF09 evidence stays as recorded. It is not
rerun or relabelled.

## Why

The owner asked "Who led the league in assists per game last season." On 2026-10-06 the answer
was "The language planner returned an invalid or unsafe plan." Replaying the turn showed that Gemini
produced a correct `query` plan for `ast_per_game`, but also proposed
`context_changes: {season: "2024-25"}` because its training data predates the current season. The
server had already resolved "last season" to 2025-26. It raised
`ValueError("planner changed server-resolved scope")`, and the catch-all handler reported every
`ValueError` as `malformed_output`. The same plan without the proposed season change answers
correctly (Jokić, 10.7 APG, 65 GP).

The PF09 evidence records the same kind of question passing earlier. The planner is
nondeterministic, so a single pass is not evidence of reliability.

## Product position

The portfolio blueprint does not require an LLM layer. The assistant earns its place only as a
**natural-language query layer over the warehouse that is measured offline**:

- The LLM only plans or routes. The server executes typed operations, and every analytical number
  comes from a result cell.
- A frozen golden-question eval reports accuracy and flakiness with a dev/holdout split. The ML
  experiment follows the same discipline, and no threshold is required to finish. Report the honest number.
- Questions outside the data get a labelled general-knowledge answer, not a blanket refusal.

## Locked decisions

| # | Decision |
| --- | --- |
| Scope authority | Server-resolved season/phase/date/window wins. Conflicting planner `context_changes` are dropped and recorded as a scope assumption, never treated as a failure. The planner payload includes today's date. |
| Repair | One repair retry sends the validation error back to the planner. Failures during planning and failures during execution have distinct reasons. Rejected raw plans are logged server-side. |
| Answer-first (AR09, 2026-10-07) | Answer the answerable part and state any approximation or unapplied restriction next to the answer; try a labelled general answer before refusing; inability is the last resort. Position rankings use release-bound G/F/C starting positions. See the [AR09 contract](design/polish-assistant-contract.md#ar09-answer-first-policy-2026-10-07). |
| General knowledge | Visible "General knowledge, not from CourtLens data" label. No stat numbers. No current rosters, injuries or trades (it says it doesn't know). Concepts, rules, history and CourtLens metric/page help are allowed. Mixed questions get one general sentence plus a data answer. |
| Narrative | A second LLM call writes 1–3 sentences from the result cells only. Every number must match a cell (allowing for display rounding) or be a server-recomputed sum, difference or ratio of cells. Season labels, ranks and scope years are allowed. If the check fails, the template text is used. |
| Streaming | SSE from FastAPI through the Next.js proxy. Phase events (understanding → querying → writing), then narrative tokens, then a final typed response. The narrative is buffered and checked before it streams. Falls back to request/response. |
| Layout | ChatGPT/Claude-style full-height page, collapsible thread sidebar (drawer on mobile), centered column of about 760px, sticky composer (Enter sends, Shift+Enter adds a newline), example prompts in the empty state. Answer = prose, compact table, action chips. Scope chip and collapsed "How I got this". Clear history and privacy text move to Settings. Existing theme, gold accent and ball-lens avatar. User messages are right-aligned bubbles and assistant prose has no bubble. |
| Entry points | `/ask` page plus a header "Ask" side panel that sends `page_context` (route, on-screen player/team IDs, season/phase) with a removable context chip. Only on player, team and compare pages for now. |
| Threads | Server-side conversation storage is unchanged. Old turns render in the new UI (template text when there is no narrative). Saved findings and export are preserved. |
| Forecasts | The `forecast` operation is featured in the example prompts and the eval. It shows the estimate, the empirical interval, the model/baseline identity and the cutoff. No verdict on which player will do better. |
| Provider | Gemini flash-lite free tier behind the provider interface, with a per-turn call budget and a clear quota state. A local Ollama adapter and a model comparison are optional later work. |
| Eval | About 150 questions: leaders, single-player, compare, follow-ups, general knowledge, clarify/refuse. Expected answers come from deterministic SQL against the published snapshot. 3 runs per question. Metrics: exact-answer, plan accuracy, refusal precision, flakiness, latency, calls. Freeze the dev/holdout split before tuning, and do no tuning on the holdout. CI replays recorded provider responses. `make eval-assistant` runs the live eval before a release. |

## Blocks

Execute in order. Each block stops at its verified boundary and records evidence in the progress log.

| Block | Scope | Done when |
| --- | --- | --- |
| AR01 Planner reliability | Server scope authority, repair retry, distinct planning/execution failure reasons, today's date in the payload, rejected-plan logging, regression tests. | The owner's example answers live, and unit/integration tests cover conflict, repair and execution-error paths. |
| AR02 Eval harness | Question set, SQL-derived expectations, recorded-provider replay in CI, live `make eval-assistant`, report. Baseline measurement, then freeze the dev/holdout split. | Baseline report is committed and the replay suite runs in pytest. |
| AR03 Router + general knowledge | Data/general/mixed routing and a labelled general-knowledge answer block. | Eval general/mixed categories are scored, and no numbers appear in general blocks. |
| AR04 Narrative + check | Narrative call, numeric checker, template fallback. | Checker tests cover tolerance, derived arithmetic and rejection. Eval reports the fallback rate. |
| AR05 Streaming | SSE endpoint, proxy, phase events, non-streaming fallback. | Browser test sees phases and the final typed response. The fallback is tested. |
| AR06 Chat UI | Full `/ask` reskin per the layout decision, rendering old threads, moving settings items. | Vitest + Playwright chat flow at 1440p and 375px. Screenshots. |
| AR07 Side panel | Header panel, `page_context`, context chip, server referent resolution. | "his/this team" resolves on player and team pages, verified in a browser test. |
| AR08 Acceptance | Live holdout eval, screenshots, README case study, resume line from measured numbers. | Holdout report exists, and lint/types/tests/browser are green. |
| AR09 Answer-first | Owner-approved policy revision: `position_query` over verified starting positions, unfiltered-and-labelled fallback, general-knowledge fallback for unsupported plans, visible result limitations, a rule planner for when the model is unavailable, and the sourced awards/champions registry. | Real-DB answers, rule-planner eval without a model on dev and holdout, Postgres tests for the position/rule/award paths, unit/browser suites green. A corpus revision and live re-measurement are separate. |
