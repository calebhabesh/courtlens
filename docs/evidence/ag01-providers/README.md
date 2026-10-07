# AG01 provider foundation — 2026-10-07

Starting revision: `06034ed`. The working tree was clean: AR07–AR09 were already committed in
`0d3e94a`, and the handoff in `06034ed`. No previous evidence or v2 contracts were regenerated.

**Status: `verification_blocked`.** The foundation passes offline adapter checks. The only
configured provider, Gemini, stopped at quota before a live tool call or web search. Native
tool/search behavior has not been demonstrated live. Ask still uses the existing v2 execution
path; AG03 owns the routing change and real prompt. `/assistant/status` reports the configured
agent provider and limits, with `prompt_version: null` until that prompt exists.

## Implemented

- Normalized messages, function calls/results, citations, cache-aware token accounting, safe
  failure kinds, callbacks, exact native continuation content and SDK response capture.
- Official SDK adapters: `google-genai==2.26.0`, `anthropic==0.125.0`, `openai==2.54.0`.
  SDK dependency ranges are in `pyproject.toml`; exact SDK/transitive additions are in the lock
  file. SDK retries are disabled. The later loop owns the single permitted busy retry.
- Explicit provider/model selection, key aliases, first-key precedence (Gemini → Anthropic →
  OpenAI), explicit `none`, missing-key handling, configurable budgets, server-only secret keys.
  A copied `.env.example` with empty key/selector fields remains valid. An explicit legacy
  Gemini model alias wins over the Gemini default, but not over `ASSISTANT_MODEL`.
- Replay/recording providers: requests, responses and streamed deltas; exact tool-payload drift
  checks; safe quota records; exclusive-create artifacts. SDK headers, keys and exception
  bodies are never recorded. Raw and signed/encrypted provider content stays server-side.
- Dated price estimates include token/cache/search charges. Unknown models, expired prices,
  unknown contexts and invalid cache accounting return unknown cost. Free allowances and
  account discounts are excluded; estimates are not invoices. Gemini's temporary rates expire
  December 31. Compose passes optional provider settings only to the API; the image includes
  the price file. No services were redeployed and the owner's `.env` was not edited.

## Official documentation verification

Checked **2026-10-07**. Model identifiers below are defaults for the new adapters, not an
override of the owner's explicit `COURTLOAD_GEMINI_MODEL` alias.

| Provider | Default | API and tool identifiers | Compatibility and citation handling |
| --- | --- | --- | --- |
| Gemini | `gemini-3.8-flash` | Generate Content; `google_search`, `function_declarations`; `include_server_side_tool_invocations=True`; automatic function execution disabled | Gemini 3 combinations are documented as preview. Preserve returned parts, tool IDs and thought signatures. Grounding chunks/supports supply source URLs, supported text and UTF-8 byte offsets within a part; convert to character spans. |
| Anthropic | `claude-sonnet-5-5` | Messages; `web_search_20260318`, name `web_search`, `allowed_callers=["direct"]`, `max_uses`; custom tools use `input_schema` | Native and custom tools share the tools array. Direct search avoids automatically provisioned code execution. Preserve complete content blocks, including encrypted search results. Citation snippets accompany the text block they support. Body-level search errors remain explicit even with HTTP 200. |
| OpenAI | `gpt-6.1-sol` | Responses; `web_search`, `function`, `function_call_output`; `store=False`, `include=["reasoning.encrypted_content"]` | Functions and native search are supported together. Preserve output/opaque reasoning items and call IDs for stateless continuation. URL annotations carry character spans; do not invent source snippets. `max_tool_calls` bounds built-in calls, not custom calls. |

Sources checked:

- Gemini [models](https://ai.google.dev/gemini-api/docs/models),
  [tool combinations](https://ai.google.dev/gemini-api/docs/generate-content/tool-combination),
  [Generate Content grounding](https://ai.google.dev/gemini-api/docs/generate-content/google-search),
  [pricing](https://ai.google.dev/gemini-api/docs/pricing).
- Anthropic [models](https://platform.claude.com/docs/en/models/overview),
  [tool reference](https://platform.claude.com/docs/en/agents-and-tools/tool-use/tool-reference),
  [web search](https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-search-tool),
  [pricing](https://platform.claude.com/docs/en/about-claude/pricing).
- OpenAI [models](https://developers.openai.com/api/docs/models),
  [Sol model capabilities](https://developers.openai.com/api/docs/models/gpt-6.1-sol),
  [web search](https://developers.openai.com/api/docs/guides/tools-web-search),
  [function calling](https://developers.openai.com/api/docs/guides/function-calling),
  [Responses create reference](https://developers.openai.com/api/reference/cli/resources/responses/methods/create),
  [pricing](https://developers.openai.com/api/docs/pricing).

SDK inspection independently established Gemini's `Segment` offsets are bytes within a part,
and that `GoogleSearch.exclude_domains` is **not supported on the Gemini Developer API**.
The adapter does not pass that unsupported field. OpenAI/Anthropic search declarations exclude
Databallr domains. No adapter exposes arbitrary fetch, URL-context, web-fetch or Databallr tools;
no Databallr request occurred. AD01 remains an owner permission gate, with no recorded request
date or reply supplied in this session.

Older explicit Gemini model overrides use a schema-declared `web_search` function and a
separate native-grounding SDK sub-call, returning a completed tool result and citations to
the caller. The adapter accounts for both model calls and token usage. This path has offline
coverage only. Defaults do not require this compatibility fallback.

**Limit to carry into AG03:** Gemini exposes no documented hard per-request native-query cap.
Queries are counted from grounding metadata and search is removed when the remaining budget is
zero. A single request may already have emitted more queries than the remaining budget. Do not
claim a hard three-query guarantee from this adapter. The loop must account for sub-calls,
disable further search, and expose any overshoot honestly. Likewise, SDK network timeouts alone
do not establish the whole-turn deadline; AG03 owns its supervision. Preserve grounding/search
suggestion metadata in `sdk_response` for the later UI integration.

## Live smoke

Command:

```bash
.venv/bin/python scripts/smoke_agent_providers.py \
  --output docs/evidence/ag01-providers/live-smoke-2026-10-07
```

The smoke requests a harmless fixture function followed by an official NBA search; no SQL or
warehouse acquisition runs. It explicitly selects the new defaults for measurement.

| Provider | Result |
| --- | --- |
| Gemini | `provider_quota`, `retry_after=60`; zero tool calls, searches or citations observed. Single request, no retry. |
| Anthropic | `unmeasured_no_key` |
| OpenAI | `unmeasured_no_key` |

The [summary](live-smoke-2026-10-07/summary.json) and
[safe Gemini transcript](live-smoke-2026-10-07/gemini-transcript.json) retain this incomplete
measurement. Rerun into a new dated directory once an eligible configured provider can complete
the tool/search smoke; do not overwrite this evidence or label absent-key providers passed.

## Verification

Logs are retained under `verification/` (large failure reports compressed).

| Check | Measured result |
| --- | --- |
| Provider/config suite | **43 passed**, including official SDK parsing over mocked HTTP/SSE, native citations, signed/encrypted and ID-less continuation, quotas, 5xx, timeouts, no retries, exhausted search declarations, Unicode/streamed grounding spans, older-model search fallback, replay drift, prices, key secrecy and status API. Fixtures are synthetic response-shape recordings, **not live provider evidence**. |
| Full unit suite | **1019 passed, 2 skipped** (legacy assistant tests require a PostgreSQL URL). |
| Full Python with disposable PostgreSQL | **1362 passed, 9 failed, 19 errors, 1 skipped**. The new database lacks retained archive/source metadata, published pointers and migration-installed triggers required by several older tests. This is not a green full-suite claim. |
| Baseline reproduction | **5 failures reproduced on unchanged `06034ed`** in a separate disposable DB: archive Stats (both variants), sealed trigger, interrupted-job recovery and real-game conservation. Other failures were not independently baseline-rerun. |
| Ruff and formatting | Clean repository-wide; 492 Python files formatted at final check. |
| Strict mypy | Clean; 174 source files. |
| Dependency check | `pip check`: no broken requirements. Compose configuration validates. |
| Dashboard | **205 Vitest tests passed**; lint and TypeScript checks passed. No dashboard source changes. |
| Browser | Normal command blocked by the owner's existing port 3100 server. Ran an isolated dashboard copy on 3117 against the existing mock API on 4100, using webpack and eight workers: **137 passed, 22 failed, 3 skipped**. Serial rerun of failed cases: **17 passed, 5 failed**. Assistant streaming passed on rerun. Persistent failures: two Stats preview cases and three Stats readability/search cases; recorded by exact names in the retry log. No full-browser-green claim. |

Pytest emits one third-party `google.genai.types` Python 3.14 deprecation warning about
`_UnionGenericAlias`; Ruff/mypy have no warnings/errors. A first full run without the test DB
also produced six PF03 setup errors; that incomplete setup was followed by the disposable-DB run.
Two legacy assistant tests in an extra targeted DB run failed because that new DB has no public
snapshot; they do not establish agent regressions or passing legacy acceptance.

Disposable databases: `courtload_ag01_20261007`, `courtload_ag01_baseline_20261007`; retained for
inspection. The main application database, user port 3100 process, v2 schema/generated types,
v2 fixtures, sealed AR evidence, corpora and holdouts were not modified. AG02–AG08 are pending.
