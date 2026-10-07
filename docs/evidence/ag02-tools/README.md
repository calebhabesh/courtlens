# AG02 read-only agent tools

Measured 2026-10-07, starting at `b4ac20d` with a clean tree. The owner explicitly directed
continuation to AG02 despite AG01's free-tier Gemini quota stop. AG01 remains
`verification_blocked`; AG02 does not make provider requests or claim live-provider success.

## Implementation

`services/assistant/agent/tools.py` provides `declarations()` and one `dispatch()` seam:

- `query_stats`: a Pydantic discriminated union derived from every existing operation schema,
  except finance. Canonicalization and supervised read-only execution are reused. The release
  is server-owned. Optional season/phase/cutoff select scope, with inherited context/window
  retained when applicable. With no season selection, the server's completed-season calendar
  selects 2025-26 on 2026-10-07. `last season` / `last_season` override stale inherited seasons.
  Observed season/phase coverage is checked explicitly; a manifest entry alone is insufficient.
- `lookup_entity`: reuses canonical identity resolution, returning close candidates rather than
  ending a turn in clarification. Long agent lookup strings allow three edits, so `wenbeyama`
  returns Victor Wembanyama. The shared helpers' default matcher remains unchanged for old callers.
- `list_metrics`: catalog keys, labels, units, formulas, limitations and release-bound observed
  season/phase coverage. Twenty-five entries per page, with key/category filters and `next_offset`.
  Observed coverage does not certify complete seasons or every metric denominator.
- `awards`: the existing integrity-checked, NBA.com-sourced registry; uncovered seasons/awards
  return a recoverable source error. No retrieval or new historical claims.
- `finance`: the existing immutable book query, separately scoped by book, financial year,
  known-at and effective date. A basketball release is unnecessary. Existing execution/rendering
  helpers now accept absent basketball context **only for finance**; existing context-bearing
  operation hashes are preserved. Exact cents remain strings and unknown amounts remain null.
- `site_help`: the existing hashed guide and its topic/route index, available without a release.

Each executed warehouse result retains the full typed `OperationResult`, exact cells, canonical
arguments, operation/result hashes, context fingerprint and existing equivalent URL. Model payloads
include scope, named units and limitations; floats are rounded to four decimals, every list is
capped at 25 entries, and truncation names the original count/path. The server retains the uncapped
operation response (including the operation's existing paging/export bounds). `position_query`
keeps its existing `open_url: null`, because a plain Stats link cannot reproduce its position filter.

Arguments are bounded to 16 KiB and recursively checked for unknown fields before older nested
Pydantic models can ignore them. Function schemas have an object root. Analytical execution uses
the existing spawned read-only worker, statement timeout and deadline, capped at 20 seconds per
tool or the smaller caller deadline. Parent resolution runs inside a savepoint, allowing the next
tool to run after a failed SQL read. Unknown tools/operations, malformed/injected arguments,
unsupported scopes, ambiguous identities, missing observations/issuances/sources, insufficient
samples, deadlines and worker disconnects return safe structured errors with `recoverable: true`.
No model text becomes executable SQL, shell, Python, acquisition or a write operation.

## Measured verification

Disposable database: `courtload_ag02_20261007`, on the existing local PostgreSQL 17 container.
Fixtures create and remove their own schemas. The database has no production snapshot or real
archive data. The main application database and the owner's `.env` were not changed.

| Check | Result |
| --- | --- |
| New AG02 unit/Postgres tests | **53 passed**: 21 unit and 32 PostgreSQL integration cases. Six tools, registry operations and recoverable gaps, latest-season/default/inherited scope, unsupported season/phase, typo/ambiguous identities, injection rejection, exact/unknown money, cutoff exclusion, full versus compact rows, post-error recovery, worker disconnect. [Log](verification/tools.txt). |
| Legacy PostgreSQL/tool regression subset | **109 passed** (52 AG02 tests at that checkpoint plus 57 existing tests): conversation and hybrid history/execution, position, rule-planner and sealed-finance query suites. A subsequently added worker-disconnect unit regression passes in the final 53-test run. [Log](verification/postgres.txt). |
| Full unit directory | **1040 passed, 2 skipped**. The two existing legacy assistant tests require a configured DB with application data; the unit run omits that URL. [Log](verification/unit.txt). |
| Ruff | Repository-wide check passes. [Log](verification/ruff.txt). |
| Formatting | 495 files already formatted. [Log](verification/format.txt). |
| Strict mypy | Clean, 175 source files. [Log](verification/mypy.txt). |
| Dashboard Vitest | **205 passed**, 31 files. No dashboard source changes. [Log](verification/dashboard.txt). |
| Retained contracts | V2 schema, fixtures, generated TS and frozen AR02 corpus hashes match AG01's inventory. [Hashes](verification/retained-contract-hashes.json). No sealed AR evidence edits. |

The unit run still emits the previously recorded third-party `google.genai.types` Python 3.14
`_UnionGenericAlias` deprecation warning. Ruff/mypy have no warnings or errors.

[Tool declarations](tool-declarations.json) and [measured fixture payloads](tool-results.json)
record the actual new schemas and representative successful/error outputs. These are synthetic
PostgreSQL fixture evidence, **not live model transcripts or real NBA statistical results**.
The future-outcome control uses the repository's existing `allow_admin_mutation` fixture override
only inside its disposable schema; the first attempt confirmed ordinary ORM mutation is blocked.

Commands, from the repository root:

```bash
export COURTLOAD_TEST_POSTGRES_URL=postgresql+psycopg://courtload:courtload@localhost:5432/courtload_ag02_20261007
.venv/bin/pytest tests/unit/test_agent_tools.py tests/integration/test_agent_tools_postgres.py -q
.venv/bin/pytest tests/unit/test_agent_tools.py tests/integration/test_agent_tools_postgres.py \
  tests/integration/test_assistant_positions_postgres.py \
  tests/integration/test_assistant_rule_planner_postgres.py \
  tests/integration/test_finance_query_postgres.py \
  tests/integration/test_conversation_postgres.py tests/integration/test_hybrid_assistant_postgres.py -q
# Unit-directory run recorded above did not set COURTLOAD_TEST_POSTGRES_URL.
env -u COURTLOAD_TEST_POSTGRES_URL .venv/bin/pytest tests/unit -q
.venv/bin/ruff check .
.venv/bin/ruff format --check .
.venv/bin/mypy src/courtload
npm --prefix dashboard test
```

## Boundary and remaining gates

**AG02 is verified against its fixture PostgreSQL completion criterion.** The full database/browser
suites were not rerun for this backend-only block; AG01's separately recorded failures and baseline
comparisons remain unresolved. This is not a full application acceptance claim.

Ask routing remains v2. No agent loop, v3 response, prompt/history/provenance rework, streaming or UI
wiring was started. AG03 consumes `DispatchedTool.result` for model messages and retains
`warehouse_result` / `context` server-side for provenance, rendering and saving. The agent can use
returned identity candidates or errors for another step rather than ending the turn.

No Databallr fetch, internal API request, test fetch or import occurred. AD01 permission is still
absent. Sealed AR/PF evidence, corpora and holdouts remain unchanged.
