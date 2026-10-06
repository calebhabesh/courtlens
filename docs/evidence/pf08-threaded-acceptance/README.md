# PF08 — threaded assistant UI accepted

2026-10-06. **PF08 meets its bounded threaded UI acceptance gate.** PF07d's scoring repair
and language evidence remain unchanged. PF09 final freeze/restore/resource acceptance and the
original replica source/model/finance/Live gates remain pending. Codex substituted for unavailable
Flash presentation ownership, sequentially without delegation. The ui-ux-pro-max skill supplied
focused interaction/accessibility guidance; existing vanilla CSS and shared controls were reused.

## Resulting behavior

`/research/ask` and the header Ask drawer now use the same durable threaded assistant by default.
`?experience=threads` remains compatible. Manual research remains available through
`?experience=manual`; retained v1 readers and separately saved analytical evidence still work.
Standalone questions receive server-resolved defaults, without the old page's hardcoded season
and cutoff. Earlier preview evidence is historical; its eligibility/budget prerequisites were
superseded by the owner's clarification and PF07d's measured backend gate.

- History selection, New chat, deletion, Clear history, reload, pending-turn recovery,
  pagination, stop, transport replay and linked intentional retry reuse the existing implementation.
- Page/drawer instances and tabs receive bounded history notifications. Other instances reread
  the server; message bodies are not placed in browser storage. Independent composer drafts survive
  updates. Same-page events work even if optional storage is unavailable; focus/visibility refreshes
  reconcile retained history. Backend concurrency/idempotency remains authoritative.
- URL/navigation selections update only the next question. Catalog-bound scope edits merge;
  follow-ups without edits inherit on the server. Retained answers keep their original scope.
- Answers, clarifications, discussion criteria, provenance, compact supporting results and truthful
  inability states reuse the frozen v2 renderer. Sources show dates/support; unsafe URLs and hostile
  text remain rejected/escaped. Error/retry/stop controls preserve durable questions.
- Eligible local results expose **Review and save**. It serializes the executed operation, exact
  arguments and pinned scope to the existing manual Research route. That route supports the
  registered operations, reruns without AI, and now retains its temporary turn while the user
  explicitly saves evidence. Client navigation clears temporary state; hard unload retains the
  existing bounded working-memory expiry. New saved evidence is independently reproducible.
  External/knowledge/discussion blocks never manufacture local analytical findings.

Ownership: [files](owned-files.json), [initial hashes](starting-files.json),
[dirty tree](starting-status.txt), [revision](starting-revision.txt). No backend/schema/migration,
analytical formula, provider prompt/configuration, source registry, global CSS or dependency edits.

## Measured acceptance

| Gate | Measured result |
| --- | --- |
| Production rendered fixtures | **56 passed**, zero failures/skips: 24 threaded, 13 retained conversation, 19 saved-operation cases. [Final log](browser-final-verified.log) |
| Dashboard unit tests | **188 passed**, 29 files. [Log](dashboard-unit-final.log) |
| Focused backend + real PostgreSQL checks | **357 passed**, zero failures/skips/warnings; exact test selection recorded below. [Log](backend-complete.log) |
| Dashboard lint / TypeScript | Pass, zero warnings. [Lint](dashboard-lint-final.log), [types](dashboard-types-final.log) |
| Production build | Pass. [Log](build-final.log) |
| Ruff / format / strict mypy / generated v2 drift | Pass. [Ruff](ruff.log), [format](format.log), [mypy](mypy.log), [contract](contract.log), [diff](diff-check.log) |
| Production real services / configured provider | Knowledge, scoring-only query, natural season transition, point-guard inability, exact manual saving/reproduction, cross-tab updates/drafts and shared drawer pass. [Envelopes and geometry](real-browser.json), [final probe](real-browser-last.log) |
| Actual backend process restart | Original rendered question/answer and exact retained envelope survive. [Record](restart-browser.json), [log](restart-final.log) |
| Actual Chromium 200% zoom | DPR 1→2, CSS viewport **1279×676**, document width **1272**; drawer/history render, zero page errors. [Record](zoom.json), [log](zoom-final.log) |
| Large durable history | **105 turns**, pages of **100 + 5**, **236,294 + 12,111 bytes**. Browser loads both without losing turns; thread list expands **20→27**. [HTTP costs](large-history.json), [browser](large-history-browser.json) |
| Contrast / focus / controls | Representative text contrast **16.15:1**, muted text **8.13:1**, button text **14.18:1**; solid **2px** keyboard outline, measured action buttons **40px** high. [Measurements](presentation.json) |
| Exact manual equivalence / clear vs save | V2 and actual manual result hashes match; UI Clear history removes transcripts, then saved finding reopens/reproduces and exports JSON/CSV. [Record](deletion-save-integrity.json) |
| Retained historical/v1 evidence | **185 outcomes unchanged**, same **48 pre-existing mismatches**, **33/33 saved v1 conversations reproduce**. [Report](retained.json), [log](retained.log) |
| Retained files | **316 artifact hashes unchanged**. [Record](artifact-preservation.json) |

Screenshots were inspected: [2560×1440](ask-real-wide.png), [1440×900](ask-real-desktop.png),
[375×812](ask-real-mobile.png), [mobile drawer](drawer-real-mobile.png),
[actual 200%](ask-real-200-percent.png), [200% drawer](drawer-real-200-percent.png).
CSS viewports and DPR are measured; no physical-monitor claim is made. The narrow fixture named
zoom-equivalent remains distinct from actual headed browser zoom.

The final real scoring request selects only `pts_per_game` and renders verified local values.
The follow-up changes to 2024–25 without relabelling the earlier 2025–26 turn. On the current
clock, the point-guard/last-season question resolves to **2025–26**, then specifically explains
that dated PG/whole-cohort leader evidence is unavailable; it offers Stats and retry. This is an
accepted honest inability response, not a sourced leader success. Required external citation,
clarification, discussion labeling and provider/source/backend failures are exercised separately
through rendered fixtures and prerequisite backend evidence. No current roster/injury/position
coverage is invented.

## Runtime boundaries and probe classifications

Real mutations occurred only in fresh `courtload_pf08_acceptance`, migrated to head and populated
from read-only retained inputs using binary COPY. Only the disposable destination temporarily
relaxed FK triggers for bulk copy. [Migration](migrations.log), [copy measurements](clone.json),
[copy harness](clone.py.txt). This copy is **not** PF09 backup/fresh-restore certification.
Uvicorn used `127.0.0.1:8189`; production standalone Next used `3189`. Fixture production Next
used `3190` with the existing mock service on `4100`. Disposable CORS explicitly allowed the two
browser origins. Existing installation services/configuration were preserved.

The owner's dated confirmed Free-project eligibility remains applicable. All probes retain
`gemini-3.5-flash-lite`, provider project quotas and existing execution bounds. Across preserved
initial/repeated UI probes, **15 actual inference requests**, all HTTP 200, were recorded.
[Usage](provider-usage.json). The final workflow uses two model-planned turns; knowledge and
point-guard inability use zero model calls. These are **repeated UI regressions**, not a new
independent language holdout or a broad NBA accuracy claim. No provider failure was retried,
paid grounding/fallback, model switch, billing activation or key/configuration change occurred.

Initial failures are retained in their logs: ambiguous multi-instance locators; a malformed test
URL after changing the default route; fixture failure names differing from the frozen schema;
legacy tests needing explicit manual entry; immediate assertions before asynchronous completion;
missing standalone static assets; a relative URL without browser baseURL; a second isolated browser
context rather than a shared tab; duplicate thread titles in the selection harness; disposable
CORS; and a preview request launched during a rebuild. These were harness/setup defects corrected
before acceptance. The actual implementation gaps repaired were default cutover, cross-instance
updates, URL scope synchronization and the prematurely cleared evidence-saving turn. An unnecessary
retained-verifier repeat was interrupted after the first complete successful report; no incomplete
repeat is counted. Final production checks have no failures/skips/warnings.

The large-history generator uses 105 real knowledge turns with zero inference calls and explicit
thread pagination. Its initial measurement guessed a cursor of 100; final pagination follows the
actual server cursor **200** and proves 100+5 rather than counting overlapping pages. Samples
are workload measurements, not general latency/resource ceilings. Broad concurrency, full fresh
backup/restore, route-wide production acceptance and operational ceilings remain PF09.

## Reproduction

Use a fresh disposable database; never point the mutation browser harness or history deletion at
the retained installation. Apply migrations, copy retained inputs read-only, and run Uvicorn with
the configured provider and disposable operator token/CORS. Build and run standalone Next with
matching internal/public API URLs; copy `public` and `.next/static` **before** server startup.

```bash
npm --prefix dashboard test
npm --prefix dashboard run lint
npm --prefix dashboard run typecheck
COURTLOAD_API_INTERNAL_URL=http://127.0.0.1:8189 \
 NEXT_PUBLIC_COURTLOAD_API_URL=http://127.0.0.1:8189 \
 COURTLOAD_OPERATOR_TOKEN=pf08-disposable-operator npm --prefix dashboard run build
PLAYWRIGHT_EXTERNAL_SERVER=true PLAYWRIGHT_BASE_URL=http://127.0.0.1:3190 \
 npm --prefix dashboard run test:browser -- threaded-assistant.spec.ts conversation.spec.ts saved-operations.spec.ts --workers=2
node scripts/verify_pf08_browser.cjs
# Restart the disposable backend before:
node scripts/verify_pf08_browser.cjs --restart
xvfb-run -a -s '-screen 0 2560x1440x24' node scripts/verify_pf08_browser.cjs --zoom
.venv/bin/ruff check .
.venv/bin/ruff format --check .
.venv/bin/mypy src/courtload
.venv/bin/python scripts/generate_hybrid_contract.py --check
```

The 357-check command sets `COURTLOAD_TEST_POSTGRES_URL` to the disposable baseline database
and runs: unit `test_assistant`, `test_conversations`, `test_saved_conversations`,
`test_hybrid_assistant`, `test_assistant_retrieval`, `test_hybrid_evaluation`,
`test_hybrid_evaluation_quota_policy`, `test_entity_lookup`; integration `test_conversation_postgres`,
`test_assistant_history_postgres`, `test_assistant_retrieval_postgres`, `test_hybrid_assistant_postgres`,
`test_hybrid_evaluation_postgres` (each filename has `.py`). It is a focused selection, not the full
repository suite. Helpers for [large history](large-history.py.txt), [rendered pagination](large-history-browser.cjs.txt),
[presentation](presentation.cjs.txt) and [clear/save integrity](deletion-save-integrity.cjs.txt)
are retained. Run restart/zoom/presentation **before** the clear-history probe.

Test services are stopped at the block boundary; the disposable database and evidence remain.
No retained transcript/finding mutation, data admission/acquisition/publication, training, Live
polling/demand, paid fallback or hosting occurred. **Next independent block: PF09 freeze acceptance.**
