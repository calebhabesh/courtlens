# CourtLens assistant agent rework progress

Parent: [assistant agent handoff](assistant-agent-plan.md). Plans are not runtime evidence.

Allowed states: `planned`, `in_progress`, `implemented_unverified`, `verified`, `source_blocked`,
`verification_blocked`. `verified` requires the completion evidence named in the handoff's block
table.

## Planning baseline: 2026-10-07

- Starting revision: a39d03e, with an uncommitted working tree (AR07–AR09 and dashboard changes).
  Inspect `git status` before each block.
- The owner confirmed every decision in the handoff through a grilling interview.
- Facts checked during planning: no RAPM anywhere in `src/`; Impact/On-Off/Six Factor presets gated;
  general blocks reject numbers (`TextBlock.authority`); the Gemini-only provider hit
  `quota_exceeded` in AR04/AR05/AR08/AR09; Databallr robots.txt allows `/`, but its Terms of
  Service forbid copying materials and reverse engineering, so AD01 permission is required.

## Block status

| Block | Status | Measured evidence |
| --- | --- | --- |
| AG01 | verification_blocked | [Provider foundation and verification](evidence/ag01-providers/README.md): official SDK adapters, current doc/model/tool checks, config/status/env/Compose, price estimates and exact replay. 43 provider/config tests and 1019 unit tests pass; Ruff/mypy clean; 205 Vitest tests and dashboard lint/types pass. Live Gemini smoke stops on `provider_quota` before tools/search; other providers unmeasured without keys. Broader DB/browser gaps recorded separately. Ask routing remains v2 until AG03. |
| AG02 | verified | [Read-only agent tools](evidence/ag02-tools/README.md): six Pydantic-declared tools, canonical warehouse evidence, observed-scope checks, fuzzy candidates, exact book-bound finance and recoverable errors. 53 new tool tests pass (32 PostgreSQL); 109 tool/legacy PostgreSQL regression tests pass at the recorded checkpoint; 1040 unit tests and 205 Vitest tests pass. Ruff/format/mypy clean. Owner authorized continuation despite AG01 quota. Ask routing remains v2; broader AG01 DB/browser gaps are unresolved. |
| AG03 | verified | [Agent loop and v3 durable contract](evidence/ag03-agent-loop/README.md): 60 new tests (43 unit, 17 PostgreSQL), 110 relevant PostgreSQL regressions, 1083 unit tests and 205 Vitest tests pass. Exact owner-example/follow-up replay, limits, numeric repair, limited mode, idempotent v2/v3 history and atomic transcript storage verified. Ruff/format/mypy and dashboard lint/types pass. Backend boundary only; AG04/AG05 streaming/rendering and the AG01 live/DB/browser gaps remain. |
| AG04 | planned | |
| AG05 | planned | |
| AG06 | planned | |
| AG07 | planned | |
| AG08 | planned | |
| AD01 | planned (owner action) | |
| AD02 | source_blocked | AD01 permission not recorded. No Databallr calls or import attempted. |
| AD03 | source_blocked | Requires permitted AD02 data. |
| AD04 | source_blocked | Requires AD03 and AG06. |

## AG01 checkpoint: 2026-10-07

- Actual starting revision: `06034ed`, clean tree. AR07–AR09 and the handoff were committed
  before this session; the planning baseline above records the earlier state.
- The 60,000-token ceiling is retained as a configurable default. New provider defaults are
  `gemini-3.8-flash`, `claude-sonnet-5-5`, `gpt-6.1-sol`; an explicitly configured legacy Gemini
  model alias is preserved. The owner's `.env` was not changed.
- Completion is **not verified**: the configured Gemini smoke returned quota with a 60-second
  retry hint, without retries; no live tool/search success observed. Absent-key providers are
  unmeasured. Evidence includes a safe failure transcript and exact verification limits.
- Gemini's native search lacks a documented hard per-request query cap. AG03 must account for
  sub-calls/queries, stop further search and expose overshoot rather than claim a hard bound.
- AG02–AG08 were not started. AD01 remains owner action; no request date or permission reply
  was supplied. No Databallr access occurred. Sealed AR/v2 evidence and holdouts are unchanged.

## AG02 checkpoint: 2026-10-07

- Starting revision: `b4ac20d`, clean tree. The owner explicitly directed work on the next block
  despite the free-tier Gemini quota stop. AG01 stays `verification_blocked`; no provider smoke
  was retried, and no live-provider success is claimed by AG02.
- Added `agent/tools.py` with schema-derived declarations and a single dispatcher over existing
  operations, identity lookup, metric catalog, awards, finance and site guidance. Scope checks
  reject unobserved seasons/phases instead of falling back to old data. "Last season" resolves
  to 2025-26 at the measured clock. Long-name typo candidates include "wenbeyama" → Wembanyama;
  legacy matching defaults are preserved.
- Shared helper changes are limited to the optional typo-distance argument and finance-only
  execution/rendering without a basketball context. Warehouse cells, hashes and equivalent
  links are retained server-side; model lists are capped at 25 and carry truncation counts.
  Unknown/malformed arguments, missing sources/observations, sample gaps, timeouts, failed SQL
  reads and worker disconnects become structured recoverable errors.
- Measured: 53 AG02 tests pass, including 32 disposable-Postgres integration cases. A 109-test
  checkpoint includes 57 existing conversation/hybrid/position/rule/finance regressions; the
  later worker-disconnect unit case passes in the final 53-test run. Full unit directory:
  1040 passed, two DB-dependent legacy skips, one existing SDK deprecation warning. Vitest:
  205 passed. Ruff/format and strict mypy pass. Evidence and command details are linked above.
- The future-outcome fixture control confirms prior result/operation/context hashes are stable.
  V2 contract/fixture/generated-type and AR02 corpus hashes match the AG01 inventory. No sealed
  evidence, holdout, dashboard source, production data or owner environment changes occurred.
- AG02 is verified at its fixture-tool boundary. Full database/browser acceptance was not rerun;
  the AG01 gaps remain unresolved. AG03 is next: agent loop, prompt/history/provenance, v3
  contract and durable routing. Ask still uses v2. AD01 remains owner action, and no Databallr
  access occurred.

## AG03 checkpoint: 2026-10-07

- Starting revision: `21d63d5`, clean tree. An unrelated owner edit to `TODO.md` appeared during
  the block and is excluded. AG01 remains `verification_blocked`; no successful live-provider
  tool/search smoke or quality baseline is claimed.
- Ordinary Ask turns now use one typed tool loop and the separate `courtlens-assistant-v3`
  response, or labelled rule-planner limited mode without a key. Explicit manual plans and
  injected legacy providers preserve v2 compatibility. Prompt, compacted v2/v3 memory, scope
  pinning, server page referents, limits, accounting and nonblocking numeric repair are in place.
- The additive transcript table, hashed references and per-result scope preserve durable
  claim/publish, idempotency, restart/follow-up memory, cancellation/deletion fencing and dataset
  input references. Inventory validates transcript digests. Warehouse-backed turns are saveable;
  web-only answers and provenance audits are not saved findings. Existing review/rerun-to-save
  behavior is preserved; AG05 supplies its v3 UI.
- Measured: 60 new tests pass (43 unit, 17 disposable PostgreSQL), including exact replays of
  owner-example/follow-up shapes, step/search/token stops, repair and provider failure, real SQL
  and audit payload drift, v2/v3 history, races, migration parity and page pronouns. Relevant
  PostgreSQL regressions: 110 passed. Full unit directory: 1083 passed, two existing DB skips,
  one existing SDK deprecation warning. Vitest: 205 passed. Ruff/format, strict mypy and dashboard
  lint/types pass. Logs, synthetic transcripts and hashes are linked above.
- Initial compatibility tests still assumed default v2 API routing; four failures were fixed by
  explicitly injecting their legacy fixture provider, keeping their v2 assertions. Exploratory
  tests reached the configured SDK failure path before those fixtures were adapted; no live
  success is inferred. Final verification uses synthetic/replay or injected legacy providers.
- V2 schema, generated TS, fixtures and the frozen AR02 corpus hashes match AG02. Sealed AR/PF
  evidence and holdouts are untouched. The application database and owner's environment were
  not changed. Provenance's numeric-value/linguistic-coverage limits and native search/token
  overshoot are explicitly recorded; they are not broad accuracy or hard preflight guarantees.
- AG03 is verified at the backend boundary. Basic retained v3 final SSE envelopes are supported;
  live step/delta/reset and client parsing remain AG04, which is next. V3 answer UI remains AG05;
  existing v2-only consumers are not yet adapted. Full database/browser acceptance was not rerun,
  and the AG01 gaps remain unresolved. AD01 is still owner action; no Databallr access occurred.
