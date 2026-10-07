# RN01 code rename evidence — 2026-10-07

Status: **verification_blocked**. Code is implemented; the full Python suite does not satisfy
RN01's green-suite acceptance gate. No production environment or database migration was run.

The clean implementation baseline is `d584057`, after AG05 (`5f3cbb1`) and the separate impact
and refresh planning commits. The owner's uncommitted TODO entry was saved separately before
implementation and is restored after the RN01 commit. No parallel agents ran.

## Implemented and preserved

- Python distribution/package/CLI, imports, Docker/Compose configuration, environment aliases,
  CI, scripts, warehouse names, dashboard identifiers and living documentation use CourtLens.
- Runtime settings reject legacy process and dotenv keys, list replacements and point to the
  one-time migration script. Dashboard startup checks server and public variable names.
  The script preserves values and file permissions, retains an exact timestamped backup,
  refuses conflicting old/new keys and is idempotent. It has **not** run on the owner's `.env`.
- All four branded browser storage keys migrate through the shared helper. Existing new values
  win; old keys are removed only after successful persistence.
- [The inventory](../../../src/courtlens/frozen_identifiers.py) pins **42** identifiers collected
  before the package move. Three are legacy storage migration sources, rather than hash contracts.
  [The baseline snapshot](../../../tests/fixtures/rn01-hashes.json) records the original commit,
  per-module version occurrences, context and three executed metric-definition operation/result/
  rendered-result hashes, all evaluation JSON and design JSON hashes, six hashed admission
  contract files, 18 knowledge section hashes and applied migration bytes with imports normalized.
- Applied migration logic is unchanged. The two legacy PostgreSQL functions remain until RN02.
  `courtload.allow_admin_mutation` also remains: the applied workbench trigger reads that exact
  setting, so changing only its callers would break administrative operations. RN02 must preserve
  or migrate both sides together. The regression audit documents this bounded compatibility case.
- Existing `docs/evidence/` files are unchanged. Historical plans, logs and research/decision
  documents receive the agreed banner; active agent/impact plans also receive the package-path note.
  The refresh handoff retains its original rename instructions and historical planning facts.

## Measurements

| Check | Result | Evidence |
| --- | --- | --- |
| Frozen versions, sealed files, knowledge hashes, applied migrations, legacy-reference audit | Passed | [Rename tests](verification/rename-tests.log), [frozen and shotchart](verification/frozen-and-shotchart.log) |
| Template, frozen and full shotchart tests after correcting the dynamic version | **66 passed**, existing SDK warning | [Focused final run](verification/rename-regression-final.log) |
| Environment guard and migration | Passed in rename set; exact backup, collision, permissions, no logged values, idempotence | [Rename tests](verification/rename-tests.log) |
| Ruff / format / strict mypy | Passed; **183** Python source files checked by mypy | [Ruff](verification/ruff.log), [format](verification/format-check.log), [mypy](verification/mypy.log) |
| Dashboard lint / TypeScript | Passed | [Lint](verification/dashboard-lint.log.gz), [types](verification/dashboard-types.log.gz) |
| Vitest | **34 files, 228 tests passed** | [Vitest](verification/vitest.log.gz) |
| Full Playwright | **169 passed, 3 skipped** | [Final full browser run](verification/browser-second.log) |
| CLI help | Passed from a clean temporary working directory | [CLI](verification/cli-help.log.gz) |
| Compose configuration | Passed with `--env-file /dev/null` | [Compose](verification/compose.log) |
| Legacy search | **0 unexplained references** | [Raw git grep](verification/git-grep.log.gz), [classified audit](verification/git-grep-audit.log) |

The browser skips require external real-server panel/workspace fixtures. The first full browser
run had 168 passes and one Availability-menu timing failure; a complete rerun with four workers
passed all 169 runnable cases. No UI timing code changed to obtain that result. The owner's
port-3100 development server was left running; the temporary dashboard used ports 3111/4111.
The scratch copy supplied the shared evidence directory and allowed the dependency symlink in
its temporary Turbopack root. Those are verification setup changes only.

## Python acceptance gate

A PostgreSQL 17 container on port 55432 with separate disposable databases provided database
fixtures. Application-default settings used SQLite memory, without reading the owner's `.env`.
Several legacy suites expect populated published/admitted application data rather than a fresh
fixture database; additional assistant/evaluation, trigger, recovery and conservation failures
also remain. These are failed checks, not successful acceptance evidence.

The first full renamed run measured **131 failed, 1378 passed, 2 skipped, 19 errors**. The unchanged
`d584057` checkout measured **128 failed, 1372 passed, 2 skipped, 19 errors**. Every baseline failure
and error also appeared after the rename; the only three additions were:

1. `.env.example` was accidentally omitted from the initial scratch directory. The corrected
   harness includes it; the corresponding provider-template test passes.
2. Two shotchart tests detected the renamed dynamic `transform_version` expression. The code now
   derives the prefix from `TRANSFORM_VERSION`, retaining the exact frozen version. All 59
   shotchart tests and six freeze tests pass, plus the provider-template case.

Both first runs also omitted local retained-artifact/raw-path context. The corrected harness
sets project/raw roots to the existing inputs while keeping all database tests disposable. The
retained-M6 and local-schedule checks pass with those inputs. The corrected broad run measured **128 failed, 1382 passed, 2 skipped, 19 errors**. It began before the dynamic-version correction; any two shotchart failures
in that process are superseded by the fresh, focused 66-test run.

Compared by test ID, the corrected broad run repeats **126** baseline failures and all **19**
baseline errors. The two additional shotchart failures are from that already-running pre-fix
process and pass in the fresh follow-up. The two baseline-only failures (local schedule and
retained M6 artifact inputs) pass with the corrected paths. No other additional failures appear.

See [corrected broad run](verification/python-corrected-full.log.gz), [failure comparison](verification/failure-comparison.log),
[initial renamed full suite](verification/python-full.log.gz),
[unchanged baseline full suite](verification/baseline-full.log.gz) and the recorded harnesses.
The third-party `google.genai` Python 3.14 `_UnionGenericAlias` deprecation warning remains.

## Reproduction and remaining work

[Python harness](verification/rn01-run-python.py.txt),
[baseline harness](verification/rn01-run-baseline.py.txt), and
[browser harness](verification/rn01-run-browser.py.txt) preserve the exact local setup. They use
known disposable test credentials, not owner secrets. The baseline harness requires the detached
baseline worktree; recreate it before running. The temporary container/worktree are removed
when verification finishes.

The raw search command is `git grep -n -i courtload -- . ':(exclude)docs/evidence/**'`.
The classifier is `tests/unit/test_frozen_identifiers.py::test_no_unexplained_legacy_brand_references`;
it removes pinned identifiers, byte-pinned artifacts/migrations, recorded historical documents,
rename instructions (including the owner's verbatim TODO rename note) and explicit
environment/browser/database compatibility mappings. Tests pin
the inventory itself, so extending the legacy identifier list is not silently accepted.

RN01 is committed independently. No commits were pushed. RN02 is still pending: migrate the
owner's `.env`, back up/restore the database into the new stack, migrate PostgreSQL objects and
verify real-data operation. The existing database and Docker volumes remain in place.
