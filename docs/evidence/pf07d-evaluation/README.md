# PF07d — integration and language evaluation

2026-10-06. Owner requested the next eligible block after PF07c. **Deterministic backend
integration is verified; PF07d remains partial because its real-model language gate has
not been evaluated.** PF08 threaded UI and PF09 acceptance remain pending. Codex worked
sequentially without delegation and preserved the starting dirty tree.

## Implemented and measured

- New [checksum-frozen hybrid corpus](../../../tests/fixtures/assistant/pf07d-hybrid-v1.json):
  **49 cases, including 12 held-out cases**, frozen before evaluation. Existing B33/B34,
  PF07a routing/held-out corpora, v1 saved evidence and v2 wire schemas are unchanged.
- **49/49 disposable PostgreSQL-backed durable HTTP cases pass**, plus the corpus integrity
  check. Every case verifies the terminal response, original question, persisted answer and
  exact idempotent replay. Fixture analytical planning matches manual canonical operations,
  context, exact results and evidence. Only request/turn IDs, latency and step labels are
  excluded from equivalence. Provider fixtures establish deterministic behavior, not language
  understanding. External source records are acquired PF07c support used as fixtures here.
- [Read-only retained-data evaluation](retained-corpus-accepted-v2.json): **48/48 applicable
  cases pass**, including **11/11 applicable held-out**, **16/16 critical inability/clarification**,
  **4/4 answer-required external facts**, **48/48 readable responses and binding checks**.
  Outcomes are **32 answers, 15 honest inability responses and one clarification**.
  Inability is never counted as a factual answer. The remaining frozen case asserts an empty
  synthetic scope; the actual retained release has playoff observations there. It is explicitly
  excluded from this run and passes on the synthetic database. It is not a retained success.
- Fixed the measured knowledge miss for “Explain assists per game” by adding `assists` to
  the metrics entry keywords. This changes its content identity; the knowledge registry advances to v2 with the actual
  2026-10-06 verification date. No formula, date interpretation,
  source parser, router prompt, schema, migration, dashboard or analytical data changed.
- Added acceptance scoring with negative checks for a readable inability on an answer-required
  case, a source URL without supporting facts, and an equal value bound to the wrong period.
  Local claims must belong to an actual result and the resolved context; external claims must
  match exact adapter-owned entity/metric/value/unit/period/qualifier/locator/excerpt/parser fields.
- Re-ran actual source fetches and the PF07c Uvicorn/restart harness into this new evidence
  directory: **3/3 fresh source acquisitions**, **13/13 real HTTP/restart checks**, zero provider
  or analytical calls in that service harness. Actual network records are [sources](sources.json);
  persisted source/replay/restart records are [HTTP](http.json). Maximum source body **133,532
  bytes**, extracted text **14,795 bytes**, source latency **169.685ms**, HTTP latency **343.227ms**.
  These narrow measurements are not general factual accuracy or PF09 resource acceptance.

## Checks and preservation

| Check | Measured result |
| --- | --- |
| Scoped v1/v2, retrieval, history and evaluation backend checks | **333 passed**, zero failures/skips/warnings; [log](backend-final.log) |
| New corpus/integration checks | **50 passed**; [log](corpus-final.log) |
| Dashboard unit checks | **188 passed across 29 files**; [log](dashboard-unit.log) |
| Dashboard lint / TypeScript | Pass, zero diagnostics; [lint](dashboard-lint.log), [types](dashboard-typecheck.log) |
| Full Ruff / format / strict mypy | Pass, zero diagnostics; [Ruff](ruff-check.log), [format](ruff-format.log), [mypy](mypy.log) |
| Frozen schema / generated TypeScript | Unchanged, drift check passes; [log](contracts.log) |
| Retained analytical outcomes | **185 unchanged**, including **48 existing mismatches**; [report](retained.json) |
| Saved v1 conversations | **33/33 reproduce**, saved inventory unchanged; same retained report |
| Retained artifacts / starting files | **316 artifact hashes unchanged**, no unexpected owned-boundary changes; [report](preservation.json) |

The HTTP harness reuses the existing empty disposable `courtload_pf07c_retrieval` database,
upgrades it to the unchanged migration head and creates/deletes only its own verifier threads.
PostgreSQL integration fixtures create/drop generated schemas in `courtload_pf00_baseline`.
Retained evaluation and reproduction use read-only transactions. No personal history in the
retained installation is mutated. No publication, warehouse admission/acquisition, training,
Live demand, paid dependency, billing change or hosting occurs.

Initial failures are preserved in [classifications](classified-checks.json),
[initial integration log](corpus-initial.log) and [initial retained run](retained-corpus-initial.json).
The first retained reproduction invocation from stdin failed because its saved-result workers
require an importable main file; the new main-guarded verifier resolves that harness failure.
The initial HTTP harness passed `provider` twice and read a nonexistent top-level question
field; these were harness errors. The retained empty-scope mismatch was an input-applicability
error. The assists explanation miss was a product defect. Final assertions retain the frozen
expectations; no corpus checksum changed after evaluation. Held-out results are now observed
regressions; no real-model prompt tuning or semantic acceptance is claimed.

## Pending real-model gate and UI boundary

**Zero real inference calls. Real-model canonical accuracy is unmeasured.** Free-project
eligibility and this evaluation's inference budget have not been established. Prior B34c
v1 acceptance and its owner-declared tier do not verify the PF07d v2 gate. The requested
eligibility/budget clarification remains separate from completed independent integration work.

The new evaluator defaults to provider-free fixture execution, explicitly disabling inference
for unexpected routes. Its opt-in path requires a dated eligibility record (`verified_free`,
`checked_at`, `verification_method`, `authorized_calls`), configured server credentials and an
explicit bounded call limit no greater than 24. Store no secret in that record. Public pricing
and a present key are insufficient project verification. The runtime model remains configured
unchanged. The evaluator records observed model version, SDK, input digests, usage, latency,
failures, canonical equivalence and separate factual/critical/completeness outcomes. It has a
20-second provider timeout within each 45-second turn, 4.5-second pacing and stops on provider
failure without retry. Output files cannot overwrite prior evidence. This path has not been
executed and is not claimed verified against a real provider.

The language gate requires at least 90% correct on actually model-evaluated supported cases,
all critical cases correct, every response readable, all evidence safety checks passing and
all answer-required external facts correct. Fixture planning and honest inability cannot fill
that gate. Broader paraphrase/current-fact coverage remains limited to actual registered paths.
Current roster, injuries, dated positions and official full-league rankings remain explicit gaps.

No new rendered thread/history/citation-controls, browser acceptance or production dashboard
build is claimed. Those remain PF08. Finish PF07d's real-model gate before claiming its full
completion or advancing PF08 acceptance. Original replica source/model/finance/Live gates stay open.

## Reproduction

```bash
COURTLOAD_TEST_POSTGRES_URL=postgresql+psycopg://courtload:courtload@127.0.0.1:5432/courtload_pf00_baseline \
 .venv/bin/pytest tests/unit/test_assistant_retrieval.py tests/unit/test_hybrid_assistant.py \
 tests/unit/test_hybrid_evaluation.py tests/unit/test_conversations.py tests/unit/test_saved_conversations.py \
 tests/integration/test_hybrid_assistant_postgres.py tests/integration/test_hybrid_evaluation_postgres.py \
 tests/integration/test_conversation_postgres.py tests/integration/test_saved_conversation_postgres.py \
 tests/integration/test_assistant_history_postgres.py tests/integration/test_assistant_retrieval_postgres.py -q
.venv/bin/python scripts/evaluate_pf07d_hybrid.py /tmp/pf07d-new-fixture-report.json
.venv/bin/ruff check .
.venv/bin/ruff format --check .
.venv/bin/mypy src/courtload
.venv/bin/python scripts/generate_hybrid_contract.py --check
npm --prefix dashboard test
npm --prefix dashboard run lint
npm --prefix dashboard run typecheck
.venv/bin/python scripts/verify_pf07d_integration.py --retained-only
.venv/bin/python scripts/verify_pf07d_integration.py
```

The main-guarded `verify_pf07d_integration.py` wrapper reuses
`verify_pf07c_retrieval.verify_sources` and `verify_http`
with `DIRECTORY` set to this evidence directory; retained reproduction reused
`verify_pf07a_assistant.verify_retained` with the same directory override. See their documented
service/port/database prerequisites; the harness performs no retained transcript writes.
The opt-in command, only after eligibility and budget verification, is:

```bash
.venv/bin/python scripts/evaluate_pf07d_hybrid.py /tmp/pf07d-new-provider-report.json \
 --real-provider --free-project-evidence /path/to/nonsecret-eligibility.json --max-calls 24
```

[Environment](environment.json), [starting revision](starting-revision.txt),
[starting dirty tree](starting-status.txt), [starting hashes](starting-files.json),
[owned files](owned-files.json).
