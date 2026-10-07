# CourtLens refresh: full rename and design language

Prepared 2026-10-07. **The owner confirmed every decision below through a grilling interview on
2026-10-07. Blocks RN01–RN02, QA01 and DL01–DL08 are pending until the
[progress log](courtlens-refresh-progress.md) records measured evidence.** A plan is not runtime
evidence.

Two tracks:

- **RN:** finish the CourtLoad → CourtLens rename everywhere, except frozen hash identifiers.
- **DL:** a standard design language (tokens, components, borderless surfaces, one-row header,
  full motion coverage), specified in [design-language-v1](design/design-language-v1.md).

Both keep every analytical and data contract: temporal discipline, append-only hashed data, sealed
evidence, no inferred claims. They are presentation and naming work only.

## Locked decisions

| # | Decision |
| --- | --- |
| R1 Scope | Full rename: Python package and distribution, CLI, env vars, Docker project/services/user, Postgres database, user, volume and object names, scripts, CI, dashboard, browser storage keys, living docs. The GitHub repo was renamed on 2026-10-07: `calebhabesh/courtlens`, with the local `origin` updated. |
| R2 Frozen identifiers | Existing version strings that feed content hashes (`courtload-…-vN`, about 1,900 hits, for example `courtload-assistant-operations-v1`, `courtload-rapm-v1`, `courtload-analysis-plan-v1`) **stay unchanged**. New schema/contract versions use `courtlens-…`. A test pins the frozen list. |
| R3 Env | Hard cut. `COURTLOAD_*` → `COURTLENS_*`. A one-time script rewrites the owner's `.env` and keeps a backup. At startup, any `COURTLOAD_*` still set raises an error naming the replacement. No silent fallbacks. Third-party aliases (`GEMINI_API_KEY`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`) stay. |
| R4 Database | Rename the database, user and volume to `courtlens` through backup → restore into a new volume → `courtlens verify-restore`. The old volume is retained until the owner deletes it. A **new** Alembic migration renames `courtload_*` Postgres functions and triggers. Applied migration files change only their Python imports. |
| R5 History | Sealed evidence, progress logs and superseded plans keep their text. Each historical log/plan gets one banner line: "CourtLoad was renamed to CourtLens on 2026-10-07; identifiers below are historical." Living docs are fully renamed. |
| R6 Browser storage | Rename keys (for example `courtload_table_density` → `courtlens_table_density`) with a one-time read-old/write-new/delete-old migration. |
| L1 Look | Tonal surfaces plus soft shadows. Hairlines only at 6–10% white. No bright container borders. Blur only on the sticky header and overlays. |
| L2 Header | One 56px row: logo, menus, ⌘K search pill opening a command palette, Ask, and a `⋯` menu (Settings, Data status, Availability, Help). The divider and the duplicated "Stats · Games" links are removed. |
| L3 Animation tech | CSS + motion tokens by default, View Transitions where supported, and the `motion` library only in allowlisted components (layout and spring animations). |
| L4 Personality | Subtle 140/200/320ms ease-out fades and slides. Springs only on small interactive pieces. The "reduce motion" setting is always respected. |
| L5 Coverage | Pages, menus, popovers, tooltips, drawers, modals, hover/press, tabs and segmented controls, table sort/filter/columns, skeleton loading, chart draw-in, chat streaming, toasts, accordions. **No count-up on data values.** |
| L6 Inline styles | Migrate all ~1,257 `style={{}}` uses to tokens and classes. Lint bans raw values in style props. |
| L7 CSS approach | Vanilla CSS split into ordered `@layer`s (tokens, base, components, pages). CSS Modules allowed for large one-off components. No Tailwind. |
| L8 Theme | Dark only. Tokens are structured so a light theme can be added later. |
| L9 Type | A fixed type scale and three weights. `tabular-nums` on all numeric cells. |
| L10 Guards | Stylelint + ESLint rules, a Playwright motion-coverage test, screenshot baselines for 16 key pages at 1440 and 375px, and a hidden `/design` style guide. |
| O1 Order | AG05 finishes and commits → RN01 → RN02 → DL01…DL08. **No other agent runs during RN01/RN02.** During DL page-migration blocks, no other block edits `dashboard/`. Python-only blocks (IM01–IM05, AG06) may run in parallel with DL after RN02 is committed. |

## Facts checked during planning (2026-10-07)

- "courtload" appears 4,304 times in 468 files outside `docs/evidence` (159 files in `src`, 119 in
  `tests`, 57 in `scripts`, 50 in `dashboard`). There are 57 distinct `COURTLOAD_*` variables; the
  most frequent is `COURTLOAD_TEST_POSTGRES_URL`, with 668 hits.
- The package is `src/courtload`, the distribution name `courtload`, the console script `courtload =
  courtload.cli:app` (`pyproject.toml`). The Makefile, `Dockerfile` (system user `courtload`),
  `docker-compose.yml` (`name: courtload`, `POSTGRES_DB/USER/PASSWORD: courtload`, volume
  `courtload-postgres`), `alembic.ini`, `.github` workflows, `warehouse/` dbt files and
  `evaluation/` all reference it.
- Migrations import `courtload.*` and create functions such as `courtload_live_append_only()`.
- No pickled/joblib artifacts exist under `data/` or `evaluation/`, so moving the package breaks no
  serialized object.
- Dashboard: `globals.css` is 3,258 lines, plus `stats-explorer.css` (159). There are 1,257 inline
  `style={{` uses (largest: distributions view 181, team compare 156, trends 92, manage-views modal 79,
  ranking boards 71). There are 6 `@keyframes` and about 20 transitions. `--border: #707783` is
  used for 45 full borders, and that's the bright line the owner dislikes. The current
  reduced-motion rule disables all animation with `!important`. Dependencies: Next 16.3,
  React 19.2.8, lucide-react; no animation library. `experimental.typedEnv` is on.
  `app/loading.tsx` was deleted in the working tree before this plan.
- The Playwright suite (22 specs) has no `toHaveScreenshot` baselines.

## Track RN: rename

### RN01 Code rename (Sol, one session, no parallel agents)

1. Read `git status`. Stop if another agent's work is uncommitted.
2. Write the frozen-identifier inventory **first**: list every string literal matching
   `courtload-[a-z0-9-]+-v[0-9]+` (and any other hash-input constants) in `src/`, `dashboard/`,
   `evaluation/`, `tests/`, fixtures and `docs/design/*.schema.json`. Save it as
   `src/courtlens/frozen_identifiers.py` (`FROZEN_IDENTIFIERS: frozenset[str]`) with a docstring
   explaining R2. Before renaming, record operation/context/result hashes for a fixed set of
   fixture operations, plus the SHA-256 of `evaluation/assistant/*.json` and of the v2 schema.
3. Run `git mv src/courtload src/courtlens`, then rewrite imports, `pyproject.toml` (name `courtlens`,
   script `courtlens = "courtlens.cli:app"`, packages, mypy/coverage paths), Makefile, Dockerfile
   (user `courtlens`, uvicorn module path), `alembic.ini`, migrations' imports only, scripts, tests,
   `.github`, `warehouse/` profile and model names, `dashboard` env usage and package name.
4. Env vars: `COURTLOAD_*` → `COURTLENS_*` in `config.py` (`validation_alias`), compose, scripts,
   tests, dashboard (`COURTLENS_API_URL`, `COURTLENS_API_INTERNAL_URL`, and so on), CI and
   `.env.example`. Add a startup guard in `config.py`: if any `COURTLOAD_*` is in the environment,
   raise a configuration error listing each old name → new name and pointing to
   `scripts/migrate_env_names.py`. Do the same in the dashboard's server env loader.
5. `scripts/migrate_env_names.py`: rewrite `.env` keys in place, after first copying it to
   `.env.bak-<timestamp>`. Report each change, never print values, and be idempotent.
6. Browser storage: find every `localStorage`/`sessionStorage`/cookie/IndexedDB key containing
   `courtload` and add a one-time migration in a shared `lib/storage-keys.ts`.
7. Display strings and UI text still saying "CourtLoad": rename them.
8. **Do not change** any string in `FROZEN_IDENTIFIERS`, any file under `docs/evidence/`, or applied
   migration logic.
9. Tests: add `tests/unit/test_frozen_identifiers.py`. It (a) asserts every `courtload-…-vN`
   literal in the codebase is in the frozen set, (b) asserts no new `courtload` string exists outside
   the frozen set, historical docs and the env-guard mapping, and (c) recomputes the recorded
   fixture hashes and checks they are byte-identical to step 2.
10. Living docs: README, AGENTS.md (commands become `courtlens …`, `mypy src/courtlens`),
    CONTRIBUTING, SECURITY, `.env.example`, active plans/contracts. Historical logs/plans get the
    R5 banner line only.

Done when: the full Python suite, strict mypy (`src/courtlens`), Ruff/format, dashboard
lint/types/Vitest and the full Playwright suite pass. The hash-stability test passes.
`git grep -i courtload` outside `docs/evidence`, historical docs, the frozen set and the guard
mapping returns nothing, with the command and its output recorded. `courtlens --help` works.

### RN02 Environment, database and volume migration (Sol, owner present)

1. Run `scripts/migrate_env_names.py` on the owner's `.env` (backup kept).
2. Back up the current DB with `./scripts/backup.sh` against the old compose project/volume, and
   record the archive SHA-256.
3. Compose: `name: courtlens`, `POSTGRES_DB/USER: courtlens`, volume `courtlens-postgres`. The
   password stays a local default from env (`COURTLENS_POSTGRES_PASSWORD`, default `courtlens`).
   Declare the old volume as `external: true` under its old name in a commented, documented block,
   so it is never deleted by `docker compose down -v` on the new project.
4. Start the new stack, run `./scripts/restore.sh <backup>` into the new volume, then
   `courtlens verify-restore`. Record the output.
5. New Alembic migration `rename_courtload_db_objects`: `ALTER FUNCTION … RENAME TO courtlens_…` for
   each `courtload_*` function, and rename triggers as needed. Append-only behavior must be
   unchanged: a test attempts an UPDATE/DELETE on each sealed table and expects the same
   exception. A downgrade renames back.
6. Point `COURTLENS_TEST_POSTGRES_URL` at the new database name in test scripts and docs.
7. Leave the old volume in place. The progress log tells the owner the exact
   `docker volume rm courtload_courtload-postgres` (or the actual name) command to run once they're
   satisfied. Do not run it.

Done when: restore verified, migration applied, append-only tests pass, dashboard loads real data
on the new stack (screenshot), and the owner's `.env` works with no `COURTLOAD_*` left.

## Track DL: design language

Every DL block reads [design-language-v1](design/design-language-v1.md) first. "Sol" means the
stronger model, "Flash" the faster one. Flash blocks follow the contract mechanically; anything the
contract doesn't cover goes back to Sol (record the question in the progress log rather than
inventing a pattern).

| Block | Owner | Depends | Scope | Done when |
| --- | --- | --- | --- | --- |
| DL01 Foundation and baselines | Sol | RN02 | Capture **before** screenshots of the 16 key pages (below) at 1440/375 into `docs/evidence/dl01-before/`. Split `globals.css` into `app/styles/{tokens,base,motion,components,pages}.css` imported in `@layer` order with zero visual change. Add the v1 tokens with old names aliased. Contrast script with measured ratios. Add Stylelint and ESLint rules at **warn** level and record the warning counts as the migration backlog. Rewrite the reduced-motion handling. | Screenshot diff of the split is pixel-identical (or explained). Lint warning counts recorded. All test suites green. |
| DL02 Primitives and motion | Sol | DL01 | Add the `motion` dependency (pinned). `lib/motion.ts` (tokens, spring, `useReducedMotion`, allowlist). Build every primitive listed in the contract, the `/design` route, `Presence` and `template.tsx` route enter. Check View Transitions support in the pinned Next/React (docs plus a spike) and record the decision. | Vitest for each primitive (states, keyboard, reduced motion). `/design` screenshots. Bundle size delta recorded (first-load JS per route before/after); `motion` is absent from routes that don't use it. |
| DL03 Header and command palette | Flash (Sol review) | DL02 | One-row header per the contract, the `⋯` menu, sliding active indicator, scrolled-state blur, mobile drawer, and a ⌘K/Ctrl+K/`/` command palette on `global-lookup`. Remove the old top row and divider. | Playwright: keyboard nav through menus and palette, focus trap and return, 1440/375 screenshots, no layout shift on scroll. All header-related specs updated and green. |
| DL04 Stats, players, teams, compare | Flash | DL03 | Migrate `stats-workspace`, `stats-explorer.css`, table UI, player/team pages and compare views to the primitives. Table motion (sort/filter/columns), skeletons, inline-style removal in these files. | Lint warnings for touched files = 0. Motion-coverage test passes on those pages. Screenshots. Existing specs green. |
| DL05 Research, live, playoffs, games | Flash | DL04 | Migrate `research/*`, investigations, live pages, playoffs, schedule, matchups, WOWY and shot pages. Chart draw-in and morph rules. | Same as DL04 for these pages. |
| DL06 Ask, finance, settings, remaining | Flash | DL05 | Ask page and panel (chat motion pattern, drawer), contracts/free-agency, settings, data-status, methodology, blog/patch-notes, tier list, calculator and everything else. | Same as DL04. The `git grep "style={{"` count is reported, with every remaining use justified (custom properties or chart geometry). |
| DL07 Loading, transitions and polish | Sol | DL06 | Restore route `loading.tsx` with skeletons where data is fetched (the root one was deleted), toasts for actions, View Transitions if approved in DL02, a performance pass (INP, CLS, long tasks during animation). | Lighthouse/Playwright trace numbers for 4 pages recorded before and after. CLS ≤ before. No animation causes a long task over 50ms. |
| DL08 Enforcement and acceptance | Sol | DL07 | Raise lint rules to **error**. Delete old token aliases. Add screenshot baselines (16 pages × 2 widths). Motion-coverage test in the suite. Update AGENTS.md with the design rules (one paragraph plus a link). After screenshots go into `docs/evidence/dl08-after/`, with a before/after index. | Zero lint violations. All suites green, including baselines. The owner reviews the before/after index. |

**The 16 key pages:** `/`, `/stats`, `/players`, `/players/[id]` (one fixture player), `/teams`,
`/teams/[id]`, `/compare`, `/live`, `/live/games/[id]`, `/playoffs`, `/research/ask` (empty and
with an answer), `/research/rapm`, `/wowy`, `/contracts`, `/settings`, `/data-status`.

## Track QA: full-suite baseline

Added 2026-10-07 after RN01. The full Python suite had **128 failed, 19 errors** on both the renamed
tree and the unchanged pre-rename `d584057` (RN01 evidence, `verification/failure-comparison.log`).
Earlier blocks recorded targeted runs only. Every later block needs a trustworthy full-suite gate.

### QA01 Full Python suite green (Sol; Python only, may run alongside DL01–DL03)

Failure groups from the RN01 corrected run (counts by file):

| Group | Files (failures/errors) | Treatment |
| --- | --- | --- |
| Legacy v2 assistant | `test_hybrid_evaluation_postgres.py` (61), `test_assistant_retrieval_postgres.py` (3), `test_assistant_history_postgres.py` (1) | AG03 made v3 the default route. Pin these tests to the still-supported legacy path (explicit manual plan or injected legacy provider) so they keep testing code that still exists. Where that's impossible, mark them `xfail(strict=True, reason="v2 pipeline removed in AG07")`. AG07 later deletes the tests along with the code. Never skip silently. |
| Populated-data assumptions | `test_workbench_api.py` (21), `test_b14/b15/b16/b17_api.py` (23), `test_b21_api.py` (6E), `test_b23_api.py` (8E), `test_analytical_ops_api.py` (6), `test_workbench_postgres.py` (1) | Give them a deterministic seeded fixture database (extend the existing fixture builders; no network, no owner data) or, only where a fixture is unreasonable, a `requires_published_data` marker excluded by default and runnable through `make test-published` against a restored backup. Document which and why. |
| Possible real defects | `test_restore_postgres.py` (3), `test_workbench_jobs_postgres.py` (4), `test_possession_warehouse_postgres.py` (2E), `test_research_readiness_postgres.py` (3E), `test_rich_admission_postgres.py` (1), `test_stats_engine.py` (2), `test_shotchart_admission.py` (2) | Diagnose each: fix code if it's a bug, fix the test if the test is wrong. Record the root cause per test ID. `possession_warehouse` must be fixed before IM02/IM03. |

Rules: do not loosen assertions to pass. Do not change frozen identifiers or sealed evidence. Do
not touch `dashboard/`. A `make test-python` target (or documented command) runs the whole suite
with the disposable PostgreSQL fixture setup used in RN01, so any agent can reproduce the gate.

Done when: the full Python suite shows **0 failed, 0 errors** (skips/xfails listed with reasons),
twice in a row from a clean checkout. Ruff/format/mypy are clean. The progress log records
before/after counts and the per-test-ID root-cause table. From then on, every block's "done when"
includes this full-suite gate.

## Risks and notes

- **The rename is a large mechanical diff.** Do it in one commit (plus the RN02 migration commit) so
  `git log --follow` and blame stay usable. Use `git mv` for the package directory.
- **Hash drift is the main way RN01 can go wrong.** The pre-rename hash snapshot and the R2 test
  exist to catch it. If any recorded hash changes, stop and find the renamed hash input. Do not
  update the expected hash.
- **Other plans name `src/courtload/...` paths.** After RN01, agents translate those paths to
  `src/courtlens/...`. RN01 adds one line to each active plan (agent, impact metrics) saying so,
  rather than rewriting them.
- **Screenshot baselines are fragile.** Mock the API, load fonts, disable animations and the caret
  during capture, and use a fixed viewport and clock.
- **Motion and performance:** large tables (hundreds of rows × dozens of columns) must not use
  per-row layout animation above the 100-row threshold. Charts with many series crossfade instead
  of morphing.
- **Accessibility:** keep focus visible, trap focus in modals, drawers and the palette and return it
  on close, give menus the correct ARIA roles, and respect reduced motion. The palette is reachable
  without a mouse.
- **Dirty tree:** at planning time AG05 had staged dashboard changes and `TODO.md` was modified by
  the owner. Never revert others' changes.
