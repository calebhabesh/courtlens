# RN02 environment, database and volume migration

Verified 2026-10-07. Starting commit: `f39a6ff`. Ran alone; the owner's existing `TODO.md`
change was preserved. No push. Parent: [refresh handoff](../../courtlens-refresh-plan.md).

The new Compose project is `courtlens`; PostgreSQL database/user are `courtlens`, and the active
volume is `courtlens_courtlens-postgres`. The dashboard runs at <http://localhost:3100>, API at
<http://localhost:8000>. The original local reload processes were stopped for this cutover;
the current application runs in Compose. The worker was inactive beforehand and remains inactive
so this naming block does not schedule acquisition, refresh or publication.

| Gate | Measured result | Evidence |
| --- | --- | --- |
| Owner environment | 15 keys migrated, no legacy keys, idempotent rerun; values excluded from evidence | [Environment](environment.json) |
| Backup | 518,600,011-byte self-contained archive, SHA-256 recorded; old application DB untouched | [Backup](backup.json) |
| Restore | `./scripts/restore.sh` completed checksum/history verification with status `restored` | [Restore output, manifest omitted](restore-verification.json) |
| Database migration | `07b810a4f005` → pending AG03 → RN02 `09b810a4f007`; migrations exited 0 | [Migration output](migration.log) |
| Post-migration CLI | `.venv/bin/courtlens verify-restore` returned `verified` | [Exact output](verify-restore.json) |
| Relation preservation | All 109 existing table counts match; only new relation is empty AG03 transcripts | [Database checks](database-verification.json), [Source counts](source-table-counts.json) |
| History preservation | Four threads, nine turns, two inputs and saved findings match the backup exactly | [History checks](history-verification.json) |
| Regression tests | 104 passed; no skips or warnings | [Pytest](tests.log) |
| Static checks | Ruff, format, strict mypy (183 source files) passed | [Ruff](ruff.log), [Format](format.log), [Mypy](mypy.log) |
| Real application | 591 eligible players; 25 rendered Stats rows, real Luka detail; no browser page errors | [Browser checks](browser.json), [Runner](verify-stack.cjs), [Stack](stack.log), [Startup](startup.log) |

[Desktop screenshot](stats-desktop.png) · [Mobile screenshot](stats-mobile.png).
These captures use the restored API without request mocks. They preserve the existing UI;
design-language work has not started. Console logs have terminal control codes and trailing
whitespace removed.

## Backup and cutover details

The owner environment backup is `.env.bak-20261007T213727.430389Z` (ignored, local only). Keys
were rewritten with `scripts/migrate_env_names.py`; the database URL was then updated separately
to the new database/user and the Compose password default. No values or secrets were logged in
the committed evidence. API-provider aliases and all other owner values were retained.

Backup archive: `data/backups/courtlens-backup-20261007T214108Z.tar.gz` (ignored, local only).
SHA-256: `fb0824ebaddcfc748a22e886785ec1dd8021cac2cee27dd0519d386e27d82e6f`.

The first backup attempt failed because the old database was at AG02 revision `07b810a4f005`,
which predates `assistant_agent_transcripts`. The backup retry used the pending RN02 compatibility
change on top of `f39a6ff`: history inventory accepts this exact recognized pre-transcript schema.
Unknown/newer schemas with a missing table still fail, and retained v3 transcript references still
require matching content hashes. Neither attempt upgraded or edited the old application database.

The successful backup command was `./scripts/backup.sh` with `.env` values supplied only through
the subprocess environment and `COMPOSE_PROJECT_NAME=courtload`, before updating the connection
URL. After backup, the old DB/reload processes were stopped, the URL updated, and
`docker compose up -d --wait db` started the new volume. The restore command was
`./scripts/restore.sh data/backups/courtlens-backup-20261007T214108Z.tar.gz`, again supplying
the new `.env` values through the subprocess environment. Restore verified against the original
schema before `docker compose up migrate` applied the two pending revisions. Post-migration CLI
and explicit history checks then ran successfully.

Raw inputs, artifacts and the media cache were copied from the retained local directories into
the new named volumes, with ownership matching the container's `courtlens` user. Evaluation
artifacts also retain their existing read-only host mount. The restore script created a redundant
`evaluation/configs/` copy of `evaluation/config/`; its bytes were compared before removing only
that newly created duplicate. No tracked config or sealed evidence was modified.

The migration renames two functions via `ALTER FUNCTION`, retaining their OIDs and trigger
bindings. No existing trigger name contains the old brand. The deployed workbench guard's
definition is preserved except for its setting name; all callers move to the new namespace in the
same commit. Downgrade restores the original names/setting. Tests compare every function definition
and binding across up/down/up, and compare SQLSTATE and primary exception message for UPDATE and
DELETE on all 21 database-sealed tables. Row-level guards encounter actual fixture rows.

The public pointer remains `5bbb6035-6794-4bb0-b894-7208f52ef7ad`, bound to dataset
`17251a08-a4eb-4f46-b356-999fcf37c65d`. No publish or source acquisition ran.

## Reproduce the targeted tests

Use a separate PostgreSQL instance. **Never point these tests at the retained owner database.**
The temporary initial test database on the old cluster was dropped; final verification used the
following isolated container, removed after the tests:

```bash
docker run -d --name courtlens-rn02-test \
  -e POSTGRES_USER=courtlens -e POSTGRES_PASSWORD=courtlens -e POSTGRES_DB=courtlens \
  -p 127.0.0.1:55432:5432 postgres:17-alpine
# Wait for pg_isready to report accepting connections.
docker exec courtlens-rn02-test pg_isready -U courtlens -d courtlens
COURTLENS_DATABASE_URL=postgresql+psycopg://courtlens:courtlens@127.0.0.1:55432/courtlens \
  COURTLENS_ENVIRONMENT=test .venv/bin/alembic upgrade head

COURTLENS_DATABASE_URL=sqlite:///:memory: \
COURTLENS_TEST_POSTGRES_URL=postgresql+psycopg://courtlens:courtlens@127.0.0.1:55432/courtlens \
COURTLENS_TEST_POSTGRES_CONTAINER=courtlens-rn02-test \
COURTLENS_ENVIRONMENT=test COURTLENS_REQUIRE_POSTGRES_TESTS=1 \
.venv/bin/pytest -q \
  tests/integration/test_rename_database_postgres.py \
  tests/unit/test_backup_connection.py tests/unit/test_migrate_env_names.py \
  tests/unit/test_frozen_identifiers.py \
  tests/integration/test_workbench_postgres.py::test_postgres_sealed_trigger_rejects_raw_sql_mutation \
  tests/integration/test_assignment_admission_postgres.py \
  tests/integration/test_live_postgres.py tests/integration/test_saved_conversation_postgres.py \
  tests/integration/test_assistant_history_postgres.py::test_dump_restore_history_and_provenance \
  tests/integration/test_assistant_history_postgres.py::test_backup_lock_fences_history_writes_and_restore_rejects_drift
docker rm -f -v courtlens-rn02-test
```

The first broader run had 103 passes and one failure: the existing history-recovery test invoked
`pg_dump` in the live Compose container despite its fixture URL targeting the disposable instance.
Its fallback now requires `COURTLENS_TEST_POSTGRES_CONTAINER` explicitly; native clients also honor
the URL's port. The complete corrected targeted run has 104 passes.

## Verification limits and retained volume

RN01's full Python acceptance gate remains blocked by the recorded baseline failures. This scoped
run is RN02 evidence and does not relabel the global suite. No dashboard source changed; the
production Docker build and real desktop/mobile browser checks passed.

The existing workbench CLI verifier reports `games: 0` and total points under a
`points_per_game` field for its fixed 2023–24 example. Those inherited reporting limitations were
not changed in this naming block. The exact output is retained above; the independent current-season
API/browser check reports Luka's 64 games and binds the result to the restored release. CLI status
alone is not evidence of every analytical formula's correctness.

The stopped container `courtload-db-1` still references **`courtload_courtload-postgres`**.
The old volume is not mounted or managed by the new project; its external declaration is kept
in the documented Compose comment. The owner may remove it once satisfied:

```bash
docker rm courtload-db-1
docker volume rm courtload_courtload-postgres
```

**Neither command was run.** The archive and owner environment backup are also retained.
