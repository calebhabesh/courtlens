# PF07c — bounded retrieval

2026-10-06. Owner requested PF07c after the verified durable-history boundary.
**Complete at the bounded backend retrieval boundary.** PF07d integration/language evaluation,
PF08 threaded UI and PF09 freeze acceptance remain pending. Codex implemented sequentially
without delegation, retaining the pre-existing dirty tree.

## Behavior and owned seams

- Added a versioned registry of **three actually accessible primary NBA pages**, with canonical
  URLs, publishers/titles, acquisition/reuse policy, represented periods and source-specific TTLs.
  [Registry contract](../../design/pf07c-free-sources.md), [actual source observations](sources.json).
  Historical and upcoming-season schedule announcements bind dates; the NBA Video Rulebook
  binds its assist explanation. Existing deterministic local site/metric knowledge remains usable.
- V2 routing uses the existing frozen source/fact/block/accounting schemas. Structured parsing
  binds entity, metric, value, unit, period, qualifier and paragraph locator to acquired text.
  Fixed server templates render verified tuples; no model extraction/memory supplies facts.
  Mixed requests keep origins distinct and share cumulative retrieval work bounds.
- Exact HTTPS source identities, redirects and **all** DNS answers must pass validation.
  Public numeric addresses are pinned for the connection while TLS checks the approved hostname;
  there is no second hostname lookup that can substitute a private address. Mixed private/public,
  loopback, link-local and multicast answers fail. No ambient proxy, cookie, key or workspace
  credential goes to a source. Active/explicitly hidden markup is ignored. Fetched instructions
  cannot request tools, appear as answer prose or authorize database/other writes.
- Bounds: four requests per entire turn (including each redirect), two redirects per fetch,
  256 KiB accepted HTML per response, 128 KiB cumulative extracted text. Source reads return
  within eight seconds or the remainder of the existing 45-second turn deadline. Four worker
  slots cap outstanding network/DNS work; late completions cannot publish or cache support.
  No nested retries, discovery engine, provider tool or expanded provider/analytical budget.
- At most 32 deep-copied structured support records occupy the process cache. Cache hits make
  zero source requests and preserve the original source/retrieval identity. Expiry requires a
  fresh read; failed refresh retains labelled stale support without verified facts. Conflicting
  values fail rather than selecting one. Unknown page-update dates remain unknown.
- Durable history retains exact source excerpts/facts/locators/digests after cache expiry or
  process restart. Cancellation fences late verified retrieval publication. Actual dump/restore
  preserves the source envelope and history inventory. External answers are not saveable local
  analytical findings, do not invent equivalent CourtLoad queries and never enter the warehouse.

Owned paths: [inventory](owned-files.json). V2 wire schemas, migrations, dashboard controls,
local analytics, published inputs and saved v1 evidence keep their existing contracts.

## Measured validation

| Check | Result |
| --- | --- |
| Full scoped v1/v2 assistant and new retrieval regressions | **279 passed**, zero failures/skips/warnings; [final log](backend-final.log) |
| New retrieval tests | **56 unit and 3 PostgreSQL checks**: host/IP/TLS/redirect boundaries, content/budget/deadline limits, cache isolation/expiry, source period/locator/conflict/exact tuple, injected content, shared mixed-turn budget, durable replay, in-flight cancellation and actual dump/restore |
| Real primary-source fetch/parse | **3/3 verified** without account/API key/provider calls; largest body **133,532 bytes**, largest extracted article text **14,795 bytes**; slowest source **462.633ms**; [records](sources.json) |
| Actual Uvicorn + PostgreSQL HTTP/restart | **13 checks pass**, zero provider/analytical calls; published historical/upcoming dates, external definition, local guidance, truthful current/position/arbitrary-URL gaps, mixed answers, zero-request cache reuse, exact replay, retained sources and identical history after process restart; [report](http.json), [log](http.log) |
| Runtime budget measurements | Slowest recorded HTTP call **184.721ms**; 13 recorded JSON payloads total **43,799 bytes**. These bounded deterministic tasks do not establish general language accuracy or whole-installation PF09 resource acceptance. |
| Dashboard tests/lint/TypeScript | **29 files / 188 tests pass**, lint/types pass, zero warnings; [unit](dashboard-unit.log), [lint](dashboard-lint.log), [types](dashboard-typecheck.log) |
| Full Ruff check/format and strict mypy | Pass, zero diagnostics; [check](ruff-check.log), [format](ruff-format.log), [types](mypy.log) |
| Frozen JSON Schema/TypeScript drift and diff check | Pass; [contracts](contracts.log), [diff](diff-check.log) |
| Fresh disposable DB migration chain | Upgrade through existing PF07b head succeeds; no new migration needed; [log](fresh-migrations.log) |
| Retained analytical outcomes | **185 unchanged**, including the same **48 existing mismatches**; [report](retained.json), [log](retained.log) |
| Retained saved v1 conversations | **33/33 reproduce**; saved inventory unchanged; same retained report |
| Preservation | **316 artifact hashes unchanged**, no unexpected changes outside owned paths against the starting file inventory; [report](preservation.json) |

Sources use actual unauthenticated public HTTPS requests through the runtime pinned-address
fetcher. Service checks use the migrated empty disposable `courtload_pf07c_retrieval` database,
create only their own threads and delete them after the recorded restart checks. PostgreSQL
fixtures use disposable schemas in `courtload_pf00_baseline`; restoration drops/restores only
those generated fixture schemas. Retained outcomes and saved v1 findings use actual retained
data in read-only transactions. No retained transcript or analytical data is mutated.

Unit tests use controlled source/transport fixtures and do not contact public sources. Provider
configuration is blank in the runtime verifier; all evidence uses zero model calls. The existing
v1 dashboard is unchanged. No new production build, rendered threaded UI/browser/citation-control
acceptance or screenshot is claimed for this backend block. PF07b's production proxy remains
the unchanged transport; PF08 owns its new rendered usage.

## Limits, freshness and classified checks

This is a deliberately small source-specific lookup registry, not an internet-wide answerer.
Known question templates and exact source-owned extraction are the enabled path. Current-day
roster/injury news, a dated PG cohort, official complete-league APG rankings and arbitrary URL
requests remain unavailable. Their useful inability responses establish response completeness,
not factual-answer accuracy. The future-season answer is a **published schedule announcement**,
not a live schedule, game outcome or assertion that the page changed today. Cache-expiry/failure
and contradictory source-value paths are exercised with fixtures; no upstream failure was
manufactured against the public sites.

The initial NBA.com history/glossary probes exceeded the body bound, and guessed endpoints
returned 404. They stay disabled. The rulebook parser initially targeted its video container;
it now targets the measured prose container. Initial harness mistakes and corrected assertions
are recorded in [classifications](classified-checks.json), including the preserved incorrect
readiness-path [log](http-readiness-initial.log). Final acceptance assertions are unchanged in
strength. Source layout/access changes may cause useful failure rather than an invented answer.

Provider Search/URL-context documentation was rechecked; no tool/key/billing/paid fallback was
activated. Registered excerpts require source attribution and remain within private local scope;
whole copyrighted articles/media are not retained or redistributed. Public support is separate
from admitted facts, immutable analytical results, source admission and forecasts. Existing
baseline failures and replica source/model/finance/Live gates remain open.

## Reproduction

```bash
COURTLOAD_TEST_POSTGRES_URL=postgresql+psycopg://courtload:courtload@127.0.0.1:5432/courtload_pf00_baseline \
 .venv/bin/pytest tests/unit/test_assistant_retrieval.py tests/unit/test_hybrid_assistant.py \
 tests/unit/test_conversations.py tests/unit/test_saved_conversations.py \
 tests/integration/test_hybrid_assistant_postgres.py tests/integration/test_conversation_postgres.py \
 tests/integration/test_saved_conversation_postgres.py tests/integration/test_assistant_history_postgres.py \
 tests/integration/test_assistant_retrieval_postgres.py -q
.venv/bin/ruff check .
.venv/bin/ruff format --check .
.venv/bin/mypy src/courtload
.venv/bin/python scripts/generate_hybrid_contract.py --check
npm --prefix dashboard test
npm --prefix dashboard run lint
npm --prefix dashboard run typecheck
.venv/bin/python scripts/verify_pf07c_retrieval.py --retained-only
.venv/bin/python scripts/verify_pf07c_retrieval.py
```

The runtime verifier needs local PostgreSQL/container tools, the repository virtual environment,
public NBA HTTPS access, a free loopback port 8179 and the local disposable DB credentials in
its source. It creates/upgrades its own database, starts/stops Uvicorn and removes only its own
threads. It never restores a retained database. [Environment](environment.json),
[starting revision](starting-revision.txt), [starting status](starting-status.txt),
[starting file hashes](starting-files.json).

Next bounded block: **PF07d — integration and language evaluation**. Threaded UI remains **PF08**.
