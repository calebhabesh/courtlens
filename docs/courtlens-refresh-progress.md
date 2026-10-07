# CourtLens refresh progress

Parent: [refresh handoff](courtlens-refresh-plan.md). Design contract:
[design-language-v1](design/design-language-v1.md). Plans are not runtime evidence.

Allowed states: `planned`, `in_progress`, `implemented_unverified`, `verified`,
`verification_blocked`.

## Planning baseline: 2026-10-07

- The owner confirmed R1–R6, L1–L10 and O1 through a grilling interview.
- The GitHub repository was renamed `calebhabesh/courtload` → `calebhabesh/courtlens` with
  `gh repo rename` on 2026-10-07. The local `origin` was updated and verified with
  `git ls-remote`. Local commits after `06034ed` were not pushed at that time.

## Block status

| Block | Status | Measured evidence |
| --- | --- | --- |
| RN01 | verification_blocked | [Code rename and measured checks](evidence/rn01/README.md): frozen hashes and migrations pinned; environment/storage migrations implemented; Ruff/mypy, dashboard lint/types/228 Vitest tests and 169 browser cases pass (3 external skips). Full Python acceptance remains blocked by baseline failures; details and comparisons recorded. |
| RN02 | verified | [Environment/database migration](evidence/rn02/README.md): backed up and restored into the new CourtLens volume; restore verified, revision `09b810a4f007` applied; 109 existing table counts and retained history match; 104 targeted tests, Ruff/format/mypy pass; real-data desktop/mobile screenshots. Old volume retained. |
| QA01 | planned | Added 2026-10-07: full Python suite baseline (128 failed / 19 errors pre-existing). Gates IM02 and AG07. |
| DL01 | planned | |
| DL02 | planned | |
| DL03 | planned | |
| DL04 | planned | |
| DL05 | planned | |
| DL06 | planned | |
| DL07 | planned | |
| DL08 | planned | |

## RN01 — 2026-10-07

- AG05 and the separate planning commits were present at the clean `d584057` baseline. The
  owner's TODO change was saved separately and restored after the rename commit. RN01 ran alone.
- Package/CLI/env/Compose/scripts/CI/dbt/dashboard/living docs renamed. The owner's `.env`,
  database and volumes are unchanged; RN02 is pending. No push was run.
- Pre-rename operation/context/result hashes, 42 frozen identifiers, evaluation/schema bytes,
  18 knowledge sections, six hashed admission contracts and applied migration logic are pinned
  by the rename regression tests. Historical documents retain their content beneath the banner.
- Tests caught a dynamic shotchart-version prefix outside the literal inventory; it now derives
  from the frozen constant. The entire shotchart suite and freeze/template checks pass (66 cases).
- `courtload.allow_admin_mutation` remains temporarily because its applied trigger reads that
  exact key. RN02 must migrate the callers and trigger together, or preserve the key. Legacy
  PostgreSQL function names remain in applied migrations as required; imports alone changed.
- Ruff/format and strict mypy pass (183 source files). Dashboard lint/types and Vitest pass
  (34 files, 228 tests). Full browser suite passes (169 cases, 3 external-integration skips);
  initial Availability timing failure and successful complete rerun are recorded.
- The raw legacy-search command and output, classified zero-unexplained-reference audit,
  isolated CLI help and Compose checks are retained in [RN01 evidence](evidence/rn01/README.md).
- Full Python gate remains unmet. The initial renamed run had 131 failures / 19 setup errors;
  unchanged `d584057` reproduced 128 failures / the same 19 errors. The three additions were
  the corrected scratch `.env.example` omission and two corrected shotchart tests. Existing
  populated-data assumptions and broader assistant/evaluation/database failures remain.
  Complete logs and corrected-run evidence are linked in the RN01 record.
- The corrected broad Python run measured 128 failures, 1382 passes, 2 skips and 19 errors.
  By test ID, 126 failures and all 19 errors repeat the unchanged baseline; the two additional
  shotchart failures were from the already-running pre-fix process and pass freshly. Two
  baseline artifact/schedule-input failures pass with corrected paths. No other new failures.

## RN02 — 2026-10-07

- Ran alone from `f39a6ff`, preserving the existing TODO change. Migrated 15 owner `.env` keys;
  backup is `.env.bak-20261007T213727.430389Z`. Updated the database URL to user/database
  `courtlens`; no old keys remain and rerunning the key migration changes nothing.
- The original database was at revision `07b810a4f005`, without the AG03 transcript table.
  The first backup failed before any database mutation. A narrowly recognized pre-transcript
  inventory path now permits this revision; missing tables on newer/unrecognized schemas and
  missing referenced transcripts still fail. The old application database stayed unchanged.
- `./scripts/backup.sh` against the old Compose project created
  `data/backups/courtlens-backup-20261007T214108Z.tar.gz`, SHA-256
  `fb0824ebaddcfc748a22e886785ec1dd8021cac2cee27dd0519d386e27d82e6f`.
  `./scripts/restore.sh` succeeded in the new `courtlens_courtlens-postgres` volume, including
  bundle checksums and retained-history verification. Raw inputs, artifacts and media cache
  were also copied into the new named volumes; source files and old volumes were retained.
- Applied the pending AG03 migration and the new RN02 migration `09b810a4f007`. The two branded
  PostgreSQL functions now use `courtlens_`; their OIDs, bodies and trigger bindings are preserved.
  The sealed-row function and all current admin callers use `courtlens.allow_admin_mutation`.
  Applied migration files remain byte-pinned and unchanged.
- All 109 existing relation counts across application/derived schemas match. The only added
  relation is the empty transcript table. Public snapshot `5bbb6035-6794-4bb0-b894-7208f52ef7ad`
  and its dataset identity remain unchanged. Four threads, nine turns, two retained inputs and
  saved-conversation inventories match the backup exactly after migration.
- **104 targeted tests pass** on a separate PostgreSQL 17 instance using database/user
  `courtlens`. Tests execute UPDATE/DELETE protection on all 21 database-sealed tables before,
  after and across downgrade/re-upgrade, with identical SQLSTATE/message, plus namespace
  hard-cut/cleanup, backup compatibility, frozen hashes and related recovery/Live/saved findings.
  Corrected a recovery test's hardcoded live-container assumption; its Docker fallback now
  requires an explicit disposable container. Ruff/format and strict mypy pass (183 source files).
- Compose DB/API/dashboard are running at ports 5432/8000/3100. Real browser checks show 25 Stats
  rows, 591 eligible players and a real player detail; desktop/mobile screenshots are linked in
  [RN02 evidence](evidence/rn02/README.md). The previously inactive worker remains inactive;
  this block did not enqueue a refresh or republish. Disposable test containers were removed.
- The old DB container is stopped and the volume is retained. Once satisfied, the owner can run
  `docker rm courtload-db-1` followed by `docker volume rm courtload_courtload-postgres`.
  Neither command was run. RN01's separate broad Python acceptance remains blocked as recorded;
  RN02's scoped verification does not change that status. No push was run.

## RN02 follow-up — 2026-10-07

- At the owner's request, the old DB container `courtload-db-1` and volume
  `courtload_courtload-postgres` were removed after checking the new stack: `courtlens-db-1` at
  revision `09b810a4f007` with 161 published snapshots, API healthy, dashboard `/stats` 200, and
  backup `courtlens-backup-20261007T214108Z.tar.gz` SHA-256 matching the value recorded above.
  Still present: the `courtload_courtload-raw` volume and the stopped
  `courtload-{api,dashboard,migrate}-1` containers. They hold no database state; remove them at
  the owner's discretion.
