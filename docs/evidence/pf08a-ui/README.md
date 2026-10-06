# PF08a — opt-in threaded UI preview

2026-10-06. **Bounded prototype verified; PF08 acceptance remains pending.** The freeze
handoff permits UI prototyping against frozen v2 fixtures before PF07d is fully complete.
PF07d still needs verified free-project eligibility and an explicitly authorized inference
budget. No such authorization was inferred from the owner's question about the budget.
**Zero inference calls were made.** This preview does not establish language accuracy or
replace the default v1/manual experience.

Open `/research/ask?experience=threads` (also linked from the existing Ask page). The header
Ask drawer uses the same component when that query parameter is present. Its full-page link
preserves preview selection and page scope. Standalone preview questions have no hardcoded
season/cutoff; the server resolves defaults. Existing default Ask and retained v1 Research
execution/saving remain available.

## Implemented boundary

- Durable thread selection, New chat, per-thread deletion and Clear history, with an explicit
  local confirmation that saved analytical findings remain. Browser storage holds only the
  active thread ID; transcripts come from the backend. Closing the drawer retains history.
- Server-owned follow-up context; editable catalog-bound next-question scope. New selections
  stay in the same thread; earlier answers retain their own scope and evidence. Multiple
  catalog callbacks merge rather than overwriting season/phase/cutoff edits.
- Concise typed text, judgment labels/criteria, external-source labels, per-turn scope,
  compact supporting results and source records with publisher/update/retrieval/period/support.
  Safe equivalent actions and secondary evidence details. Text is escaped; unsafe link
  schemes, protocol-relative URLs, backslashes and credential URLs are rejected.
- Accepted questions are polled while the POST executes. Stop publishes a durable cancellation
  and fences late UI work, immediately releasing controls. Transport replay keeps the exact
  request body/ID; intentional retry uses a new ID linked to the unsuccessful turn ID.
- Thread/turn pagination, pending-turn recovery on reopen, error/reload actions and preserved
  composer drafts. Loaded tail pages are refreshed without discarding earlier visible turns.
  Requests have the existing server deadline plus a bounded 60-second client transport limit.
- Local numerical results use existing result/evidence rendering. V2 has no save endpoint;
  eligible results direct the user to their equivalent manual view to save evidence, rather
  than manufacturing a v1 conversation or treating external facts as saved local analysis.

Codex substituted for unavailable Flash presentation ownership, sequentially without agents.
The ui-ux-pro-max skill supplied focused React interaction guidance; existing vanilla-CSS
primitives/tokens and native dialog semantics were reused. No dependency/schema/migration,
backend arithmetic, provider configuration or source registry changed. Ownership and initial
state: [files](owned-files.json), [starting hashes](starting-files.json),
[dirty tree](starting-status.txt), [revision](starting-revision.txt).

## Measured verification

| Check | Result / record |
| --- | --- |
| Production rendered fixture workflows | **26 passed**: 13 threaded cases and 13 retained v1 cases; zero failures/skips. [Log](browser-production-fixtures.log) |
| Dashboard unit tests | **188 passed**, 29 files. [Log](dashboard-unit.log) |
| Applicable backend checks, real PostgreSQL | **333 passed**, zero failures/skips/warnings. [Log](backend-tests.log) |
| Dashboard lint and TypeScript | Pass, zero warnings. [Lint](dashboard-lint.log), [types](dashboard-types.log) |
| Production build | Pass. [Log](build.log) |
| Ruff, format, strict mypy, v2 generated-contract drift | Pass. [Ruff](ruff.log), [format](format.log), [mypy](mypy.log), [contract](contract.log) |
| Real production browser + disposable PostgreSQL | New chat, stored knowledge answer, reload, source disclosure, shared drawer and focus return pass; zero page errors. [Envelope/geometry](real-browser.json) |
| Actual backend process restart | Rendered question/answer restored; exact retained envelope equality. [Record](restart-browser.json) |
| Actual Chromium 200% zoom | DPR 1→2; CSS viewport 1279×676, document width 1272; contained overflow and shared drawer pass. [Record](zoom.json) |
| Retained analytical/v1 reproduction | **185 outcomes unchanged**, including the same 48 pre-existing mismatches; **33/33 saved v1 conversations reproduce**. [Record](retained.json), [log](retained.log) |
| Retained artifacts | **316 hashes unchanged**. [Preservation](preservation.json) |

Real-service tests ran on fresh disposable `courtload_pf08a_ui`, migrated to current head,
Uvicorn `127.0.0.1:8188`, and production Next `127.0.0.1:3188`. Both Gemini key environment
variables were explicitly empty. The real knowledge answer records zero provider, source and
analytical calls. The disposable database has no published research release: its catalog 503
is an expected data-availability state, not a proof of analytical workflows. Retained-input
reproduction used read-only transactions against the existing installation. The initial New
chat probe left an empty header only in the disposable database.

Screenshots were inspected: [2560×1440](ask-real-wide.png), [1440×900](ask-real-desktop.png),
[375×812](ask-real-mobile.png), [mobile drawer](drawer-real-mobile.png),
[actual 200%](ask-real-200-percent.png), [200% drawer](drawer-real-200-percent.png).
The fixture test's half-size CSS viewport is explicitly named **zoom-equivalent**, distinct
from the headed Chromium/xvfb/xdotool zoom evidence. No physical monitor claim is made.

Initial failures: default Playwright server launch encountered an already occupied development
port; the initial fixture harness had unscoped alert locators, missing catalog fixtures and
CSS `zoom` that did not exercise browser zoom. A concurrent development rebuild produced a
transient duplicate rendered tree; final fixture verification uses the production server.
The real New chat probe found asynchronous clearing could lose a newly typed draft; clearing
now occurs at action start, and completion clears only the submitted draft. A rendered
regression verifies a next-question draft survives execution. Pagination expectations now
verify explicit loading on reopen, since in-flight acceptance automatically reaches the new
turn. [Initial fixture log](browser-fixtures-initial.log),
[development run](browser-fixtures.log), [repeat](browser-fixtures-repeat.log),
[initial real probe](real-browser-initial.log).

## Reproduction

```bash
npm --prefix dashboard test
npm --prefix dashboard run lint
npm --prefix dashboard run typecheck
COURTLOAD_API_INTERNAL_URL=http://127.0.0.1:8188 \
 NEXT_PUBLIC_COURTLOAD_API_URL=http://127.0.0.1:8188 npm --prefix dashboard run build
# Start the disposable no-provider backend and production Next server with the same URLs
# and a matching disposable operator token; never point this mutation harness at retained DB.
PLAYWRIGHT_EXTERNAL_SERVER=true PLAYWRIGHT_BASE_URL=http://127.0.0.1:3188 \
 npm --prefix dashboard run test:browser -- threaded-assistant.spec.ts conversation.spec.ts --workers=2
node scripts/verify_pf08a_browser.cjs
# Restart the disposable backend process before this command:
node scripts/verify_pf08a_browser.cjs --restart
xvfb-run -a -s '-screen 0 2560x1440x24' node scripts/verify_pf08a_browser.cjs --zoom
```

## Remaining gates

PF07d real-model eligibility/budget/evaluation remains required before PF08 acceptance.
This is an opt-in prototype, not the default UI cutover. Later PF08 work must finish production
analytical task coverage, v2/manual evidence-saving handoff, scope-chip/navigation synchronization,
multiple mounted/cross-tab thread synchronization, broad provider/source failure workflows,
large-history costs and complete presentation/accessibility measurements. This block does not
claim those requirements or full PF09 acceptance. Preserve roster/injury/dated-position/official
leader gaps and the original replica source/model/finance/Live gates.

No retained personal transcript writes, publication, data admission/acquisition, training,
paid fallback, billing change, Live demand or hosting occurred. Test services are stopped at
the block boundary; only the disposable database and reviewable evidence remain.
