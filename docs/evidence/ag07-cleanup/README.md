# AG07 — compatibility retirement and shared-helper extraction

The owner explicitly accepted the missing AG06 live quality comparison on
2026-10-08 and requested finishing without spending Gemini quota. This clears the
procedural prerequisite; it does not establish provider access or V3 accuracy.

The handoff permits **deletion or retirement**. Call tracing found supported V1
query/conversation APIs, explicit V2 manual plans, historical evaluations and their
regression tests. Accordingly `hybrid.py`, `planner.py`, `narrative.py` and
`retrieval.py` were retired into `assistant/legacy/`, with no forwarding modules
left at their former paths. Their compatibility tests and evaluation imports
follow the move. This is not a claim that every legacy implementation was deleted.

New Ask uses the existing V3 agent. `history` loads the retired pipeline only for
an explicitly injected V2 provider or manual plan. Package initialization, status,
agent runtime, streaming and ordinary durable-history imports no longer load it.
A fresh-interpreter regression enforces that boundary. Shared player identity
resolution moved to `entities.py`, the response bound to `limits.py`, and provider
status to `status.py`. Numeric parsing/display rounding was already shared through
`domain.answer_numbers`; no duplicate implementation was introduced.

V1 `/assistant/query`, conversation services, typed operations, rule-planner limited
mode, saved findings, history rendering and old schemas remain supported. Existing
scripts remain callable for historical evaluations; `make eval-assistant` already
selects V3 and required no change. No AGENTS command was removed.

[Caller proof](caller-proof.json) records zero former-module callers and zero agent
imports of the retired package. [Line counts](line-counts.json) report the actual
before/after totals; retirement is not presented as a net reduction. The rename
regression maps the four moved paths before checking the original frozen identifier
counts; its sealed baseline stays unchanged.

Verification results are recorded below. The first Python attempt
identified stale test monkeypatch targets after the lazy import move. The first
browser attempt failed because Turbopack rejects dependencies symlinked outside its
root; the scratch copy now has physical dependencies. These diagnostic logs remain
retained. Browser runs use isolated ports 3300/4300 and a private evidence copy;
DL/IM evidence-capture specs are excluded from the final regression, and their
milestones are not reopened. No provider, Databallr or direct NBA request is made.

## Final offline results

- Full isolated Python suite: **1,845 passed**, one existing isolated-browser skip,
  19 published-data deselections, one inherited google-genai deprecation warning
  ([log](verification/python-accepted.log)). Disposable PostgreSQL; no owner data/keys.
- Ruff and formatting: clean; strict mypy: **207 source files**, clean.
- Dashboard lint/types: clean; Vitest: **286 passed** across 39 files.
- Isolated production build: passed. No dashboard source changes.
- Production browser regression: **180 passed, 15 skipped, 10 failed**
  ([log](verification/browser-production.log)). One of those failures was the new
  synthetic owner capture; its separate final run passed all six captures. The other
  nine failures concern existing threaded-assistant scope controls, transport/drawer
  timing, mobile send-button obstruction and landscape focus. No assertions were
  weakened. The two scope tests expect a removed “Edit scope for the next question”
  control. Dashboard bytes are unchanged and tests use a mock backend, so this backend
  retirement cannot explain those UI failures; they still remain acceptance gaps.
- Six synthetic owner-example captures: **6 passed**, desktop/mobile. See AG08.
- **3,006 pre-existing evidence/corpus/fixture files** preserved byte-for-byte;
  tracked sealed schemas/generated types/fixtures/evidence have no diff.

AG07 is **implemented_unverified** against its original all-green-browser criterion.
The owner-approved AG06 quality gap permits this implementation, but is not proof of
browser acceptance. This requested no-live closure is complete with that limitation
recorded; no DL/IM milestone was repeated or reopened. Total assistant Python lines:
12,280 before and the exact final count in `line-counts.json` after; 1,966 lines are
retired compatibility code, not deleted functionality.
