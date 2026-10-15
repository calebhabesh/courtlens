# Branch checkpoint, 2026-10-15

Verification before pushing `databallr-alignment`, including verified search nicknames,
clearable recents, team portrait tiles, enlarged watermarks and owner instruction 71's
return to plain logos.

The checks found three issues, corrected in separate cleanup commits:

- Strict mypy rejected the Gemini adapter's invariant `list[Content]`. Using the SDK's
  `ContentUnionDict` input type fixes both generation calls. All 40 offline provider tests pass.
- The control geometry test still expected four variants. It now checks all five variants
  across four sizes, including the text variant's zero inline padding.
- The roster projection test raced streamed HTML after a legacy-route redirect. It now opens
  the canonical depth-chart URL through the shared hydration helper and retains its assertions
  for observed minutes, projected minutes and invalid-input export blocking.

Measured results:

- `make test-python`: **2,117 passed, 1 skipped, 24 deselected** against disposable PostgreSQL.
  Published-data and deliberate kernel-limit tests retain their default exclusions. The skip
  requires a separate isolated Next browser fixture. Pytest reports 34 warnings from Google SDK
  deprecation, scikit-learn solver options and an unclosed SQLite connection.
- `.venv/bin/ruff check .` and `.venv/bin/ruff format --check .`: pass.
- `.venv/bin/mypy src/courtlens`: pass for 252 source files.
- `npm --prefix dashboard run lint` and `npm --prefix dashboard run typecheck`: pass.
- `npm --prefix dashboard test`: **540 passed** across 83 files.
- Production webpack build and full Playwright suite: **474 passed, 28 skipped**.
  The initial run had 471 passes and the three browser failures described above; the full rerun
  passed after their correction.
- After the other session finished instruction 71, dashboard lint, types, all 540 unit tests
  and a fresh production build pass. Playwright visual baselines, Compare, player career,
  player reference, Players, workbench and search specs: **125 passed, 1 skipped**.

Browser checks used production copies with the mock API on separate ports, following the
alignment handoff. All scratch workspaces were disk-backed and removed, and the test servers
and disposable PostgreSQL containers were stopped.
