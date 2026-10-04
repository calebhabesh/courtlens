# Staged replica acceptance and recovery

2026-10-04. B37 consumes the replica handoff, its feature/data/search contracts and
sealed B35 evidence. This checklist records the remaining acceptance boundaries;
passing a fixture suite or installing metadata does not complete the replica.

## Verification slice B37a

Run the entire Python suite with `COURTLOAD_TEST_POSTGRES_URL` and
`COURTLOAD_DATABASE_URL` pointing to a clone of the populated working database,
`COURTLOAD_REQUIRE_POSTGRES_TESTS=1`, and `pytest -W error`. Several existing
integration checks assume actual retained data and write publication/test state;
the working database must never be their target. The fresh-restore test backs up
the clone, restores a second disposable database and reproduces every retained
conversational analysis there. Only disposable test databases may be removed.

Run the complete Vitest and Playwright fixture suites, then a standalone production
build against real FastAPI/PostgreSQL. The workspace browser test runs separately
with `COURTLOAD_REAL_WORKSPACE_TEST=1`; it creates only uniquely named personal
workspaces and validates conflict, export/import and cross-origin rejection. Its default
player is admitted NBA ID `1630567`; set `COURTLOAD_REAL_WORKSPACE_PLAYER_ID` to
another admitted identity for installations with different coverage.
Retained-operation browser checks reuse the existing explicit saved record; no
new analytical save, provider inference, acquisition, training or publication is
required. Their screenshots/exports are new evidence, not copies of old captures.

Next normalizes some internal request hosts to localhost. Workspace, finance and
Live writes compare Origin with the incoming Host and internal URL protocol using
one helper; forwarded Host values do not authorize mutations. Tests cover the
127.0.0.1 production path and forged/missing origins. Backend test clients use
Starlette's supported httpx2 adapter; ordinary provider transport retains httpx.
Resource teardown closes test pools and the SQLite shot-audit spool explicitly.
Warnings are resolved at their sources and not filtered out.

## Remaining release gates

| Gate | Required evidence |
| --- | --- |
| Gemini | Explicit opt-in, verified eligible model/project, original and supplemental language corpus, actual calls/quota/configuration and query/evidence equality |
| OS installation | Actual supported browser/secure-origin installation and standalone launch; synthetic install events are insufficient |
| Live | Actual changing in-game clock/scores, finality and correction observations, measured shared polling/storage/resource bounds |
| Rich sources/models | Each applicable feature's reconciled admitted inputs and registered experiments, or a specifically evidenced source/model gate |
| Typography | Owner selection before optional B36 packaging; current font stays until selection |
| Release package | Fresh real-service resource/latency/storage benchmarks, full capability ledger, demo/case-study links, applicable warehouse checks and complete recovery relationships |

B35 and B37 remain in progress until their applicable gates have evidence. Earlier
workbench numbers remain dated historical results. A staged usable release may
be described as a stage; full replica completion is not implied.
