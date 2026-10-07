# AG04 live agent streaming

Measured 2026-10-07, starting at `f02470a`. Only the owner's `TODO.md` edit was initially
uncommitted; it is preserved and excluded. This verifies streaming with synthetic providers,
fixture PostgreSQL and paced browser fixtures, not live-provider answer quality.

## Implementation

- The v3 Pydantic/generated contract adds `step` (`thinking`, `tool`, `search`, `writing`),
  `delta`, `reset` and a final envelope accepting either response version. The sealed v2 contract
  is unchanged; its `phase` and retained, checked `narrative` events remain supported.
- `complete_turn` forwards agent callbacks into the existing SSE worker. Deltas arrive while
  the provider executes, before publication. Final follows the same atomic response/transcript
  publication as the non-streaming route. Ten-second keep-alives and waiting for the worker after
  disconnect remain. Retained v3 replay sends `accepted` and `final` without another provider call.
- The loop clears a draft before another provider attempt, including tool commentary, the one
  busy retry, limit finalization and provenance repair. Provider failure clears interrupted prose
  before a limited-mode final. The first delta announces writing. Native search reports
  **completion** when SDK usage arrives; no per-search start notification is claimed.
- The parser handles v2/v3 events, chunked CRLF/UTF-8, multiline data and keep-alives. It ignores
  future event types and sends malformed known events to same-ID fallback. Earlier valid frames
  are delivered before corruption is handled, preserving acceptance and 409 polling. Reset clears
  prose; final replaces it with retained prose, including fallback finals. Explicit abort does
  not replay. Reader locks and replay timer listeners are released.
- The shared Ask page/drawer shows step labels and drafts, with one atomic accessible status
  region. History accepts both response versions and inherits v3 selections. V3 final prose gets
  minimal plain rendering and basic limited/unverified labels. AG05 owns source chips, tables,
  detailed provenance styling, banners, follow-ups, trace/accounting, settings and saved actions.
  V2 rendering remains intact.
- The production proxy is unchanged. Browsers use its real route against a paced synthetic SSE
  server; browser history fixtures are synthetic. PostgreSQL HTTP tests independently execute
  real claim/complete/publish and verify retained response/transcript identity.

## Measured verification

| Check | Result |
| --- | --- |
| Targeted Python units | [55 passed](verification/targeted-unit.txt), including three new loop cases (live repair, tool-commentary replacement/search, busy retry) and three SSE cases (pre-publication delivery, retained replay, disconnect publication). Existing timeout/late-delta suppression and limit tests remain green. |
| Agent PostgreSQL | [20 passed](verification/agent-postgres.txt), including three HTTP stream cases: answered, repaired, quota fallback. Final equals same-ID POST fallback and history, the transcript hash validates, deltas are retained, and re-streaming executes no provider calls. Repair removes the unsupported value rather than merely setting a repair flag. |
| PostgreSQL regressions | [110 passed](verification/postgres-regressions.txt): history, hybrid/API/legacy streaming, conversations, saved operations, AG02 tools and finance. |
| Full Python units | [1089 passed, 2 skipped](verification/unit.txt). Two existing DB-dependent legacy skips and the existing third-party `google.genai.types` Python 3.14 deprecation warning remain. |
| Python checks | [Ruff](verification/ruff.txt), [format](verification/format.txt), [strict mypy](verification/mypy.txt) and [contract generation](verification/contracts.txt) pass. [Sealed contract/corpus hashes](verification/retained-contract-hashes.json) match AG03. |
| Dashboard | [213 Vitest tests](verification/dashboard.txt), [types](verification/dashboard-types.txt) and [lint](verification/dashboard-lint.txt) pass. Eight new parser/transport cases cover live replacement, corrupt streams, same-ID publication polling, abort and byte-split UTF-8. |
| Browser through real proxy | [Five focused cases pass](verification/browser-streaming.txt): v3 live repair at 1440/375 px, v3 fallback, retained v2 streaming and v2 fallback. On the final dashboard files, [all 45 threaded cases pass](verification/browser-threaded.txt), including limited/unverified labels, reload, cancellation, retry, history, scope and page/drawer compatibility. |

PostgreSQL uses the existing disposable `courtload_ag02_20261007` database with per-test schemas
created and removed by fixtures. The application database and owner's environment are unchanged.
The scratch dashboard runs on 3200, mock API on 4100; the developer's server on 3100 is untouched.
The [initial browser infrastructure failure](verification/browser-initial-infrastructure.txt)
was Turbopack rejecting a dependency symlink outside its root. A local copy of the installed
dependencies resolved it; no product change was made for that failure. The prior "retains history
and retry" strict-mode flake family passed serially; this does not establish that it is eliminated.

Commands from the repository root:

```bash
env -u COURTLOAD_TEST_POSTGRES_URL .venv/bin/pytest tests/unit -q
COURTLOAD_TEST_POSTGRES_URL=<disposable-postgres-url> .venv/bin/pytest \
  tests/integration/test_agent_loop_postgres.py -q
COURTLOAD_TEST_POSTGRES_URL=<disposable-postgres-url> .venv/bin/pytest \
  tests/integration/test_assistant_history_postgres.py \
  tests/integration/test_hybrid_assistant_postgres.py tests/integration/test_conversation_postgres.py \
  tests/integration/test_saved_conversation_postgres.py tests/integration/test_agent_tools_postgres.py \
  tests/integration/test_finance_query_postgres.py -q
.venv/bin/ruff check .
.venv/bin/ruff format --check .
.venv/bin/mypy src/courtload
.venv/bin/python scripts/generate_hybrid_contract.py --check
npm --prefix dashboard test
npm --prefix dashboard run typecheck
npm --prefix dashboard run lint
# From an isolated dashboard copy; its Playwright port is changed to 3200:
npm run test:browser -- e2e/threaded-assistant.spec.ts --workers=1
```

## Boundary

**AG04 is verified at its streaming boundary.** No live SDK call, successful native-web-search
smoke, provider quality baseline, full browser suite or broad database acceptance is claimed.
AG01's live/DB/browser gaps remain. Rich v3 rendering is AG05; AG06 owns the new frozen eval
corpus. Prior AR/PF evidence, v2 fixtures and evaluation corpora/holdouts are unchanged. No
Databallr access occurred; AD01 remains unresolved and AD02–AD04 remain source-blocked.
