# AG03 agent loop and v3 durable contract

Measured 2026-10-07, starting at `21d63d5` with a clean tree. An unrelated owner edit to
`TODO.md` appeared during work and is excluded from this block. AG01's live-provider gap remains
`verification_blocked`; this block verifies backend behavior with synthetic providers and real
fixture PostgreSQL reads, not live answer quality.

## Implementation

- One `agent/loop.py:run_turn` entry point drives provider steps and recoverable typed tools.
  Ordinary `/v2/turn` requests use v3, including labelled rule-planner limited mode without a
  configured key. Explicit manual plans and injected legacy plan providers retain v2 behavior.
  The old planner/router/narrative modules are retained until AG07's evaluation gate.
- The versioned prompt supplies the civil date, completed season, pinned release, phase,
  glossary, site map, source order, analytical restrictions and answer/assumption/follow-up
  instructions. Server page resolution binds pronoun lookup and operations. Compacted memory
  retains at most eight prior turns within a character budget; old v2 prose and compact tool
  summaries enter that memory without becoming current-turn evidence.
- V3 Pydantic models, [JSON Schema](../../design/assistant-v3.schema.json) and generated
  [TypeScript](../../../dashboard/lib/assistant-v3.generated.ts) enforce source markers,
  executed-result/action identities, per-result scope/evidence bindings, safe URLs, readable
  terminal answers and the warehouse-only saveable rule. Scope is stored beside immutable
  results because several operations omit it from their data payload.
- Numeric parsing/rounding helpers moved into shared `domain/answer_numbers.py`; the sealed v2
  checker still uses its original rules. New provenance binds current-turn cells and same-metric
  arithmetic, supports native grounding/snippets, flags unsupported sentences and assumptions,
  and allows one tool-free repair. A repair failure preserves the original answer and grounding.
  A bounded coverage audit checks named web stat claims against actual non-null warehouse cells
  when the model skipped SQL. Audit evidence stays in the transcript and does not make a web
  answer saveable. Exact player/metric/scope overlaps with returned warehouse results are also
  flagged, including identical values cited to the web.
- Normal model steps, searches, reported tokens and the whole-turn deadline are bounded. One
  extra finalization call and one provenance repair are explicitly tool/search-free. Busy gets
  at most one retry; quota does not retry. Transport supervision fences an adapter that ignores
  its timeout and suppresses late deltas. A late transport keeps its process slot until it exits.
  Actual normalized usage, native sub-call counts and search/token overshoot are exposed. This
  is not a hard native-query or preflight token-count guarantee: Gemini can overshoot within a
  call, and input/finalization usage is known after the response.
- Provider failure uses the limited rule planner when possible, with the failure and retry hint.
  Already executed results survive a mid-turn failure without another SQL execution. Limited
  turns retain rule-plan memory and tool trace for follow-ups after restart.
- An additive migration introduces `assistant_agent_transcripts`. Full key-free provider
  requests/responses and retained tool/audit evidence publish atomically with the response and
  its hashed reference. Existing claims, request-id collisions, duplicate suppression, leases,
  cancellation/deletion fencing and independent saved findings remain. Inventory/restore
  checks validate transcript digests/references. Replay can load the new transcript format and
  detects retained audit/tool drift even after the final model step.
- `/assistant/status` now reports the actual prompt version. SSE can retain/replay the v3 final
  envelope. Live `step`/`delta`/`reset` transport and client parsing are AG04; v3 answer rendering
  is AG05. No browser/UI completion is claimed here.

## Measured verification

Disposable PostgreSQL 17 database: `courtload_ag02_20261007`, with per-test schemas created and
removed by fixtures. The production/application database and owner's `.env` were not changed.
The migration upgrade/downgrade and column parity were tested in a disposable schema.

| Check | Result |
| --- | --- |
| AG03 unit + PostgreSQL | **60 passed**: 43 unit, 17 PostgreSQL. Owner examples and DRAPM follow-up exact replay; typed warehouse ranking and award sources; step/search/token stops; unsupported-number repair; repair outage; quota-to-limited results; ignored adapter deadline/late-delta suppression; real SQL payload drift; audit drift; v2/v3 history; idempotency, restart, cancellation/deletion/lease fencing; no-key API/final SSE replay; page pronouns; limited follow-ups; transcript migration and hash tampering. [Log](verification/agent.txt). |
| Relevant PostgreSQL regressions | **110 passed**: legacy history, hybrid/API/streaming compatibility, conversation and saved-finding execution, all AG02 tools and sealed finance query. [Log](verification/postgres.txt). |
| Full unit directory | **1083 passed, 2 skipped**; existing DB-dependent legacy tests are skipped without their DB URL. Existing third-party `google.genai.types` Python 3.14 deprecation warning remains. [Log](verification/unit.txt). |
| Ruff / formatting / strict mypy | Clean repository-wide; 507 formatted Python files and 182 typed source files. [Ruff](verification/ruff.txt), [format](verification/format.txt), [mypy](verification/mypy.txt). |
| Generated contracts | V2/v3 generator `--check` passes. Sealed v2 schema, generated TS, fixtures and AR02 corpus hashes are unchanged from AG02. [Contract check](verification/contracts.txt), [hash inventory](verification/retained-contract-hashes.json). |
| Dashboard | **205 Vitest tests pass**; TypeScript and ESLint pass. Only a new generated contract was added, without UI changes. [Tests](verification/dashboard.txt), [types](verification/dashboard-types.txt), [lint](verification/dashboard-lint.txt). |

The first broad regression checkpoint had **106 passes and four failures** because historical
API tests implicitly selected the former default v2 route. They now explicitly inject their
legacy fixture provider; their v2 assertions remain. The final 110-test run passes. The initial
[failure log](verification/postgres-initial.txt) is retained. During exploratory legacy/API
runs, tests that had not yet been updated reached the installation's configured SDK path and
returned failures. Those calls are not successful live smoke evidence. Final AG03 and compatibility
verification uses synthetic/replay or explicitly injected legacy providers.

The [four exported fixtures](fixtures/) and their [SHA-256 inventory](fixture-sha256.json) record
measured synthetic MVP, best-defender, RAPM and follow-up response/transcript shapes. The RAPM/DRAPM
values and citations are scripted test data at `example.org`, not verified NBA values or live
search results. The best-defender fixture tests a stated blocks reading and warehouse ranking;
it does not establish defensive-impact quality or a live provider's choice of interpretation.
SQL values come from the disposable synthetic box-score fixture. Fixture UUIDs identify that
measurement; these artifacts are not AG06's frozen fixture-DB/replay corpus.

Commands (from the repository root):

```bash
COURTLOAD_TEST_POSTGRES_URL=postgresql+psycopg://courtload:courtload@localhost:5432/courtload_ag02_20261007 \
  .venv/bin/pytest tests/unit/test_agent_loop.py tests/integration/test_agent_loop_postgres.py -q
# Export to a NEW directory only; the fixture exporter refuses overwrites.
COURTLOAD_AG03_EVIDENCE_DIR=<new-directory> COURTLOAD_TEST_POSTGRES_URL=<disposable-postgres-url> \
  .venv/bin/pytest tests/integration/test_agent_loop_postgres.py -q
COURTLOAD_TEST_POSTGRES_URL=<disposable-postgres-url> .venv/bin/pytest \
  tests/integration/test_assistant_history_postgres.py \
  tests/integration/test_hybrid_assistant_postgres.py tests/integration/test_conversation_postgres.py \
  tests/integration/test_saved_conversation_postgres.py tests/integration/test_agent_tools_postgres.py \
  tests/integration/test_finance_query_postgres.py -q
env -u COURTLOAD_TEST_POSTGRES_URL .venv/bin/pytest tests/unit -q
.venv/bin/python scripts/generate_hybrid_contract.py --check
.venv/bin/ruff check .
.venv/bin/ruff format --check .
.venv/bin/mypy src/courtload
npm --prefix dashboard test
npm --prefix dashboard run typecheck
npm --prefix dashboard run lint
```

## Boundary

**AG03 is verified at its backend/replay/storage boundary.** Full database acceptance and the
browser suite were not rerun; AG01's separately recorded DB/browser gaps remain unresolved.
No provider/model accuracy, live grounding success, latency baseline or full Ask UI acceptance
is asserted. Provenance verifies numeric bindings, not attribution to the correct entity; its
coverage audit recognizes named stat claims and cannot certify every pronoun or linguistic
paraphrase. AG06 measures broader accuracy and conflict behavior.

AG04 streaming is next. AG05 renders the new backend contract; until then, existing frontend
v2-only consumers have not been adapted to ordinary v3 responses. AG06 owns the new frozen corpus,
holdout, broad replay set and live evaluation. No sealed AR/PF evidence, v2 fixtures, corpora or
holdouts were changed. No Databallr access or import occurred; AD01 is still unresolved.
