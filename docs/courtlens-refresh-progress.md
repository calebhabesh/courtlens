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
| RN02 | planned | |
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
