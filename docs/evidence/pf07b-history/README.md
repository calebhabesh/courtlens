# PF07b — durable local assistant history

2026-10-05. Owner requested PF07b after PF07a. **Complete at the durable backend and
same-origin transport boundary.** PF08 still owns rendered conversation/history controls;
PF07c external retrieval, PF07d language acceptance and PF09 resource gates remain pending.
Codex implemented sequentially without delegation, preserving the pre-existing dirty tree.

## Behavior and ownership

- Added three local PostgreSQL tables and additive migration `07b810a4f005`. Accepted user
  questions commit before work starts. Pending/running/completed/failed/cancelled states
  distinguish retained transcript from verified terminal answers and server working context.
- Exact original request-ID replay survives independent sessions and actual process restart.
  Different-content reuse and simultaneous turns return 409. New linked retries execute again;
  edited messages receive new identities. Server records supply bounded prior selections/plan.
- Short database advisory transactions coordinate acceptance, publication, Stop and deletion
  across workers. Cancelled/deleted work cannot publish a late answer. Stop after completion
  preserves the answer. A 50-second lease recovers expired work into a readable interruption;
  recovery occurs on polling/acceptance, without automatically calling a provider.
- Thread/turn pagination, New chat, reopen, delete and Clear history use the frozen v2
  contracts. Scope changes retain immutable old response/evidence hashes. Scope-free guidance
  retains explicit initial drawer selections for the first analytical follow-up.
- Analytical turn inputs have dataset, finance-book and issuance foreign keys. Source excerpts,
  locators, content digests, exact cells and result references stay in the bounded validated
  terminal envelope. No raw provider transport, private exceptions or server keys are retained.
- All v2 mutations use the existing workspace credential dependency. The fixed-target Next
  proxy checks browser same-origin, injects credentials only server-side, rejects redirects and
  unknown paths, strips unregistered query parameters and bounds request buffering to 160KiB.
  Typed history helpers and the local-history/provider notice are ready for PF08.
- Backup archives fence history writes across database dump/manifest generation. Restore
  validates transcript, working-context, retry/lease/sequence and input-reference inventory.
  Older manifests keep their meaning. Separately saved v1 findings remain append-only.

[Owned paths](owned-files.json), [frozen-contract handoff](../../design/polish-assistant-contract.md).
The existing chat UI remains v1 until PF08. No runtime model, analytical operation, source
admission, publication or external-retrieval adapter changed.

## Measured validation

| Check | Result |
| --- | --- |
| Final scoped v1/v2 backend regressions and durable-history integration | **220 passed**, zero failures/skips/warnings; [log](backend-final.log) |
| Durable-history PostgreSQL acceptance alone | **18 passed**: acceptance visibility, exact replay, identity collisions/edits, duplicate race, cancellation/deletion/clear during execution, pending/running restart recovery, explicit provider retry, scope/input preservation, pagination, auth, migration upgrade/downgrade, dump/restore, backup locking/drift rejection, saved-finding independence, drawer scope and acceptance-time recovery without prior polling; [log](history-postgres-final.log) |
| Actual Uvicorn service and restart | **14 HTTP checks pass**, including exact replay after terminating/restarting the process, recovery, retry, Stop, deletion and Clear history; **zero provider calls**; [responses/timings](http.json), [log](http-final.log) |
| Production Next proxy with installed Chromium | **4 browser checks pass**, zero page exceptions: same-origin New chat/turn, reload reads identical retained answer, unknown target rejection; the browser-created thread also survives the backend restart. Cross-origin and missing-origin writes return 403; [browser report](browser.json) |
| Dashboard tests | **29 files / 188 tests pass**, including four proxy trust-boundary regressions; [log](dashboard-unit.log) |
| Full Ruff check/format, strict mypy | Pass, zero diagnostics; [check](ruff-check.log), [format](ruff-format.log), [types](mypy.log) |
| Dashboard lint/TypeScript and isolated production webpack build | Pass, zero warnings; [lint](dashboard-lint.log), [types](dashboard-typecheck.log), [build](build.log), [helper](build-helper.py.txt) |
| Frozen schema/TypeScript drift | Pass; [log](contracts.log) |
| Retained analytical outcomes | **185 unchanged**, including the same **48 existing mismatches**; [report](retained.json), [log](retained-final.log) |
| Retained saved v1 conversations | **33/33 reproduce**, saved inventory unchanged; same [report](retained.json) |
| Preservation | **316 artifact hashes unchanged**; zero unexpected changes against PF07a's 2,137-file baseline, accounting for its recorded owned edits; [report](preservation.json) |
| Local schema | Additive migration applied to the installation; **zero retained history rows**. Runtime/browser mutations use the disposable `courtload_pf07b_history` DB; [schema](local-schema.json), [migration](migration.log) |
| Fresh PostgreSQL database | Entire Alembic chain upgrades through PF07b successfully; [log](fresh-migrations.log) |

The real-service run uses an empty disposable database and the frozen supported knowledge
question, not admitted basketball facts. Arithmetic/provenance checks use disposable synthetic
PostgreSQL facts and the supervised read-only executor. All 185 retained outcomes and 33 v1
saved conversations use actual retained data in read-only transactions. Tests simulate provider
failures without contacting Gemini. Actual dump/restore is restricted to a disposable fixture
schema; no retained database restore occurred.

The final runtime run's slowest of 14 recorded HTTP requests was **16.122ms**; responses total
**16,381 bytes**. These small deterministic tasks do not establish large-history query cost,
whole-installation memory, provider latency or PF09 acceptance. Thread-list order is stable UUID
order; turns are chronological. Every history request is bounded to at most 100 records.

## Limits and classified checks

Recovery is lease-based and requested by polling/acceptance, rather than an unconditional
startup sweep that would cancel another live worker. Stop immediately fences answer publication;
already dispatched provider/analytical work remains bounded by its existing deadline. No
provider-side cancellation claim is made. History persists without applying the old process
cache's 30-minute expiry or 64-conversation eviction limit.

Actual rendered threaded answer/history controls and privacy-notice placement are PF08.
The browser check exercises production same-origin transport from the existing Settings page;
it does not claim a new rendered chat UI. No external adapter or shared external-source cache
exists yet; PF07c remains pending. No acquisition, inference, publication, analytical-data
mutation, paid dependency, hosting, Live demand or retained personal mutation occurred.

Initial authentication/schema, multiprocessing-stdin, absent bundled-browser and unsupported
knowledge-fixture issues were classified and corrected without weakening final assertions:
[classifications](classified-checks.json). Initial logs remain available. Existing PF00 broad-suite
failures and all unresolved replica source/model/finance/Live gates remain open.

## Reproduction

```bash
COURTLOAD_TEST_POSTGRES_URL=postgresql+psycopg://courtload:courtload@127.0.0.1:5432/courtload_pf00_baseline \
 .venv/bin/pytest tests/unit/test_hybrid_assistant.py tests/unit/test_conversations.py \
 tests/unit/test_saved_conversations.py tests/integration/test_hybrid_assistant_postgres.py \
 tests/integration/test_conversation_postgres.py tests/integration/test_saved_conversation_postgres.py \
 tests/integration/test_assistant_history_postgres.py -q
.venv/bin/ruff check .
.venv/bin/ruff format --check .
.venv/bin/mypy src/courtload
.venv/bin/python scripts/generate_hybrid_contract.py --check
npm --prefix dashboard test
npm --prefix dashboard run lint
npm --prefix dashboard run typecheck
.venv/bin/python scripts/verify_pf07b_history.py --retained-only
```

The runtime verifier expects the migrated disposable `courtload_pf07b_history` database,
the production build named in `build-directory.txt`, free ports 8178/3178, local Chromium and
local PostgreSQL credentials used by this installation. Run
`.venv/bin/python scripts/verify_pf07b_history.py`; it starts/stops its own services and clears
its disposable transcript. The isolated build helper preserves workspace build declarations.

Next bounded block: **PF07c — verified free-source registry and bounded retrieval**.
