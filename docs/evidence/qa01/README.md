# QA01 — reproducible Python baseline

**Verified.** Starting revision `d9c700a`. The Python-only QA snapshot is the clean
detached commit `18b76e0`; concurrent DL/IM work and the owner's TODO change were
excluded. No dashboard source, owner database, dotenv or sealed evidence was changed.

| Measurement | Result |
| --- | --- |
| RN01 corrected baseline | 128 failed, 1382 passed, 19 errors, 2 skips |
| QA01 initial reproduction in the shared tree | 127 failed, 1428 passed, 19 errors, 2 skips; concurrent IM additions explain the different collection |
| Clean full run 1 | **1556 passed, 0 failed, 0 errors**, 1 skipped, 19 deselected; 294.57 s |
| Clean full run 2 | **1556 passed, 0 failed, 0 errors**, 1 skipped, 19 deselected; 290.39 s |
| Ruff / formatting | Clean; 524 files already formatted |
| Strict mypy | Clean; 183 source files |

Both clean runs used `.venv/bin/python scripts/test_python.py -ra` at the same
commit, each with a fresh disposable PostgreSQL 17 container migrated to Alembic
head, an empty data directory, no owner dotenv and no configured provider keys.
The local interpreter symlink is excluded through Git's local exclude file.
The runner is exposed through `make test-python` and CI. These checks certify the
ordinary offline suite; they do not certify a restored historical release.

[Per-test diagnosis](root-causes.md) contains 158 IDs from the RN01 baseline and
subsequent isolation runs. No assertions were relaxed. HTTP tests use private
synthetic publications; fixture source rows now have complete strict-FK provenance;
legacy assistant tests inject the supported v2 provider. Migration-installed sealing
triggers and actual dump/restore run against the disposable instance. The real code
defect corrected here is the offline provider's RJ Barrett ID (`1629628`).

The sole skip is
`tests/integration/test_assistant_panel_browser.py::test_rendered_panels_resolve_page_referents`:
an isolated Next browser server is required. There are **no xfails**. The
[19 published-data checks](published-checks.md) keep their original historical/M6
assertions and run separately through `make test-published` against an explicitly
restored disposable backup and artifact tree. They were not run against owner data.
Pytest reports the existing third-party `google.genai.types` Python 3.14 deprecation;
Ruff and mypy have zero warnings/errors.

Logs are retained in [verification](verification/). Frozen schema/corpus/artifact
bytes and the RN01 identifier/hash inventory pass unchanged in both full runs.
The IM possession reconstruction, cutoff exposure and shared readiness/source
fixtures pass. IM02's QA prerequisite is satisfied; source/fitting gates remain
owned by the impact contracts. AG07 still needs its separate AG06 quality gate.
