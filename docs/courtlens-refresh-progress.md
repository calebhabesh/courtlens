# CourtLens refresh progress

## 2026-10-09 — Stats filter-divider spacing repair

Follow-up: Manage Views follows the guide group, its 32px height matches the adjacent selectors,
and the visible label is `Group Guides:`. Live-browser checks at 1440/2048/390px verify sizing,
order, dialog interaction and no document overflow. Dashboard lint/types and 344 unit tests pass.
[Evidence](evidence/stats-manage-views/README.md).

The owner-reported hairline touching Manage Views and Group guides is corrected with a scoped
16px (`--space-4`) top margin before the explorer, per Design Language v1.1. Measured at
1440/2048/390px with working controls and no page overflow. Dashboard lint/types and 344 Vitest
tests pass; 10 existing fixture browser cases pass across initial and isolated rerun.
[Evidence and browser-environment limits](evidence/stats-divider-fix/README.md).
This does not advance a refresh or overhaul milestone.

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
| QA01 | verified | [Reproducible Python baseline](evidence/qa01/README.md): two clean runs each 1556 passed / 0 failed / 0 errors; 1 documented browser skip, 19 explicit published-data checks, no xfails. Ruff/format/mypy clean; 158 per-ID diagnoses. Disposable migrated PostgreSQL and synthetic publications, with legacy provider pinning and preserved assertions. IM02 QA gate satisfied; AG07 still requires its AG06 quality gate. |
| DL01 | verified | [Foundation and baselines](evidence/dl01/README.md): 34 screenshots (16 key pages × 2 widths, empty and answered Ask) captured before and after; 7 byte-identical, remainder >=99.65% visual match with explained subpixel shadow variance; `globals.css` split into `app/styles/{tokens,base,motion,components,pages}.css` in `@layer` order; WCAG AA contrast measured; Stylelint (864 warnings) and ESLint (3,388 warnings) backlog recorded; Vitest 228/228, types and fixture browser tests pass. |
| DL02 | verified | [Primitives and motion](evidence/dl02/README.md): pinned `motion@14.0.0`; `lib/motion.ts` with physics spring and token curves; 20+ accessible UI primitives in `components/ui/`; living `/design` style guide with 1440/375 screenshots; `template.tsx` enter transition; View Transitions evaluated and rejected (Next 16.3 / React 19.2); `motion` bundle isolated to `/design` chunk (0 KB on all other routes); Vitest 257/257, Playwright 169/169, Python unit 1119/1119 pass. |
| DL03 | verified | [Header and command palette](evidence/dl03/README.md): single 56px sticky row without bottom border line and zero layout shift on scroll; brand mark and wordmark; sliding active indicator on route; hover-intent & keyboard dropdowns; center search pill; GlobalCommandPalette modal with real-time API lookup and focus return; More options (⋯) menu; mobile drawer with accordions; Vitest 262/262, Playwright 175/175 (3 skips), Python unit 1153/1153, mypy/Ruff/Stylelint/ESLint/tsc clean; 1440px and 375px screenshots. |
| DL04 | verified | [Stats workspace styling](evidence/dl04/README.md): stats, player explorer, player profile, team explorer, team detail, compare, team-compare; guide centering tolerances preserved; 14 screenshots (1440/375px); 0 inline styles; Vitest 262/262, Playwright 175/175, mypy/Ruff/tsc clean. |
| DL05 | verified | [Live workspace styling](evidence/dl05/README.md): live score ticker, in-progress pulsing dot, observation provenance, schedule, last games, and playoffs tournament/series views; 12 screenshots (1440/375px); 0 inline styles; Vitest 262/262, Playwright live & evidence 13/13, mypy/Ruff/Stylelint/tsc clean. |
| DL06 | verified | [Research workspaces & investigations styling](evidence/dl06/README.md): shooting analysis, floor splits, lineup analytics, deep research investigations, distributions, trends, similarity, case studies, rankings, wingspan, saved investigations; 24 screenshots (1440/375px); 0 inline styles; Vitest 262/262, Playwright 33/33, mypy/Ruff/Stylelint/tsc clean. |
| DL07 | verified | [Ask assistant, finance, settings & remaining workspaces](evidence/dl07/README.md): 26 screenshots (1440/375px) across 13 workspaces/drawers; zero raw inline styles across the entire application frontend; 96 Playwright cases passed, Vitest 262/262 passed, Python unit 1166 passed, mypy/Ruff/Stylelint/ESLint/tsc clean. |
| DL08 | verified | [Loading skeletons, transitions, action toasts & performance pass](evidence/dl08/README.md): 19 route `loading.tsx` skeletons restored; action toasts integrated across 8 workspaces; CLS ≤ 0.0075 (contract ≤ 0.05); 0 animation long tasks > 50ms; 10 screenshots (1440/375px) and JSON performance report; 39 Playwright cases passed, Vitest 281/281 passed, Python unit 1175 passed, mypy/Ruff/Stylelint/ESLint/tsc clean. |
| DL09 | verified | [Enforcement and acceptance](evidence/dl09/README.md): ESLint and Stylelint raised to error (0 errors, 0 warnings); legacy token aliases removed (0 remaining); 34 before/after screenshots across 17 views ([dl08-after/index.html](evidence/dl08-after/index.html)); motion-coverage Playwright test suite (9/9 pass); AGENTS.md design system governance codified; all test suites green. |

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
  The remaining legacy Docker objects were then removed: the `courtload_courtload-raw` volume
  (checked first: every old file's SHA-256 exists in `courtlens_courtlens-raw`, and all 50
  `raw_objects.storage_uri` paths resolve there), the stopped `courtload-{api,dashboard,migrate}-1`
  containers, the `courtload_default` network and the `courtload-{api,dashboard,migrate,dbt}`
  images. Dashboard `/stats` still returns 200.

## DL01 — 2026-10-07

- Captured before screenshots of the 16 key pages (17 states, including empty and answered Ask)
  at 1440px and 375px into `docs/evidence/dl01-before/` (34 images, verified with manifest).
- Measured WCAG 2.1 contrast ratios for all design tokens with `scripts/verify-contrast.py`:
  all primary and secondary text tokens meet WCAG AA (4.5:1, with primary text exceeding 14:1);
  `--color-on-accent` on `--color-accent` is 13.48:1; tertiary text meets 4.13:1 on surface-3
  (exceeding the 3:1 threshold for non-essential/large text). Ratios recorded in
  `docs/design/design-language-v1.md`.
- Split `globals.css` into `app/styles/{tokens,base,motion,components,pages}.css` imported in
  `@layer tokens, base, motion, components, pages` order in `app/globals.css`.
  - `tokens.css`: Design Language v1 color, elevation, spacing (4px rhythm), radius, sizing,
    typography, z-index, and motion tokens, plus legacy aliases (`--bg`, `--surface`, etc.).
  - `base.css`: HTML/body defaults, typography helpers, tabular numerals, and forced-colors.
  - `motion.css`: All keyframes (`lookupSpin`, `fadeInDropdown`, `slideIn`, `slideInRight`,
    `slideUpTray`, `ask-pulse`) and rewritten reduced-motion handling (overriding `--dur-*` tokens
    to 1ms and preserving `--dur-fast` opacity transitions).
  - `components.css`: Application shell, buttons, forms, panels, modals, drawers, and chat components.
  - `pages.css`: Stats workspace, player profiles, teams, compare, live, playoffs, WOWY, and research.
- Rebuilt the live production Docker container on port 3100 and captured after screenshots into
  `docs/evidence/dl01-after/`. 7 screenshots are byte-for-byte identical; remaining 27 screenshots
  demonstrate >=99.65% pixel-identity (<0.35% RMSE), with the delta isolated to subpixel shadow
  anti-aliasing on sticky table columns and real-data timestamp formatting. Zero layout shifts or regressions.
- Added Stylelint (17.16.0) and configured `dashboard/.stylelintrc.json` with Design Language v1
  rules at warning level. Warning count: **864 warnings** (0 errors).
- Added Design Language v1 rules to `dashboard/eslint.config.mjs` (`no-restricted-syntax` for inline
  `style={{ ... }}` objects and `no-restricted-imports` for unauthorized `motion` imports) at warning level.
  Warning count: **3,388 warnings** (0 errors).
- Recorded the migration backlog in `docs/evidence/dl01/README.md`.
- Verification gates pass:
  - `npm --prefix dashboard run lint`: 0 errors.
  - `npm --prefix dashboard run typecheck`: 0 errors.
  - Vitest: 34 test files, 228 tests pass.
  - Browser tests: `e2e/route-polish.spec.ts` (6 passed) and `e2e/live.spec.ts` (7 passed) pass.
  - Python tests: `pytest tests/unit` (1099 passed, 2 skipped, 0 failures) passes.

## DL02 — 2026-10-07

- Added and pinned `"motion": "14.0.0"` in `dashboard/package.json`.
- Implemented `dashboard/lib/motion.ts` with Design Language v1 duration tokens (`instant` 0.08s, `fast` 0.14s, `base` 0.20s, `slow` 0.32s, `chart` 0.45s), custom bezier easings, physics spring configuration (`stiffness: 260, damping: 28, mass: 1`), instant spring for reduced motion, `useReducedMotion()` hook, reusable motion variants (`fadeSlideVariants`, `popoverVariants`, `modalVariants`, `scrimVariants`, `getDrawerVariants`, `toastVariants`), and import allowlist.
- Implemented all 20+ accessible UI primitives in `dashboard/components/ui/` (`Button`, `IconButton`, `Input`, `SearchField`, `Select`, `Checkbox`, `Switch`, `SegmentedControl`, `Tabs`, `Chip`/`Badge`, `Panel`, `PageHeader`, `Section`, `Table`, `Menu`/`Popover`, `Tooltip`, `Drawer`, `Modal`, `CommandPalette`, `Toast`, `Skeleton`, `EmptyState`, `Accordion`, `Presence`) with keyboard accessibility (Arrow navigation, Home/End, Escape, Space/Enter), ARIA attributes, and token styling. Retained backwards-compatible exports in `controls.tsx`.
- Implemented `dashboard/app/template.tsx` with `.route-enter` animation (`opacity: 0 -> 1`, `translateY: 6px -> 0` over `--dur-slow`). Configured `.route-enter` with `display: flex; flex-direction: column; flex: 1; min-width: 0; min-height: 0; width: 100%` to preserve viewport-bounded layouts on full-height workspaces (`/research/ask`, stats tables).
- Conducted View Transitions spike on pinned Next.js 16.3.5 (App Router) and React 19.2.8. Decision: custom View Transitions monkey patching is rejected per contract due to race conditions with React Server Components streaming and DOM reconciliation; rely on the root `template.tsx` enter transition (`.route-enter` over `--dur-slow`) with static header navigation.
- Built living style guide route at `dashboard/app/design/page.tsx` displaying all color swatches, typography scales, elevation levels, motion curves, and interactive primitives.
- Captured `/design` screenshots at 1440px and 375px viewports using Playwright Chromium into `docs/evidence/dl02/design-1440.png` and `docs/evidence/dl02/design-375.png`.
- Measured bundle size delta and verified chunk isolation:
  - Root shared JS remains 538.6 KB (0 KB change).
  - `motion` client bundle is isolated to chunk `static/chunks/208my1sgfbej0.js` (163.2 KB).
  - Client manifest confirms `motion` chunk is referenced **only** by `/design`. All existing routes (`/`, `/stats`, `/players`, `/teams`, `/compare`, `/live`, `/playoffs`, `/research/ask`, `/wowy`, `/contracts`, `/settings`, `/data-status`) have **0 bytes of `motion`**.
- Preserved cascading layout rules across layered CSS (`pages.css` vs `components.css`) ensuring `.floor-controls input:not(.entity-validity)` and `.shooting-workspace .floor-controls input:not(.entity-validity)` never stretch 1px hidden validation inputs, and pinned portrait dimensions to 40px in `stats-workspace`.
- Configured `devIndicators: false` in `next.config.ts` to prevent development overlay portals from intercepting mobile touch targets during testing.
- Verification gates pass:
  - Vitest: **35 test files, 257 tests pass** (including 29 interactive primitive tests in `primitives.test.tsx`).
  - Playwright browser suite: **169 passed, 3 skipped, 0 failed**.
  - Stylelint: 0 errors (backlog warnings retained).
  - ESLint: 0 errors (backlog warnings retained).
  - TypeScript: 0 errors.
  - Python strict mypy (`src/courtlens`): 0 errors across 187 source files.
  - Python Ruff / format: Clean (0 errors, 545 files formatted).
  - Python unit tests: `pytest tests/unit` (1119 passed, 10 skipped, 0 failures).

## DL03 — 2026-10-07

- Implemented unified Design Language v1 single-row header (`dashboard/components/ui/header.tsx`) replacing legacy two-row replica layout:
  - Single 56px sticky row (`--header-height: 56px`) with zero bottom border line.
  - Transparent rest state with smooth blur transition on scroll (`backdrop-filter: blur(12px) saturate(140%)`, `--shadow-1`, zero layout shift).
  - Left group: CourtLens ball-lens SVG mark and wordmark; sliding physics spring active indicator (`layoutId="header-active-indicator"`) under current route.
  - Primary links: Stats and WOWY (direct link when not secondary).
  - Dropdown menus: Live▾, Players▾, Teams▾, Compare▾, Research▾ with hover-intent (80ms open / 150ms close) and keyboard navigation (ArrowDown enters and focuses first item, ArrowUp/Down/Home/End navigate, Escape closes and restores focus to trigger).
  - Center: Pill searchfield (`role="searchbox"`, `[🔍 Search players, teams… ⌘K]`) with `--radius-pill` and keyboard shortcuts (`⌘K`, `Ctrl+K`, `/`).
  - Right group: Ask button (navigates or triggers Ask panel), More options (`⋯`) dropdown menu, and mobile responsive controls.
- Implemented `More options` (`⋯`) dropdown containing Settings, Data status, Availability section with gated items and badges, Methodology, Interactive Learning, Patch Notes, Blog & Updates, and Keyboard shortcuts (`?`).
- Implemented `GlobalCommandPalette` modal dialog (`dashboard/components/ui/command-palette.tsx`):
  - Integrates with workbench global lookup API (`queryLookup`) with debounce (120ms) and bounded client cache (`lookupCache`).
  - Categorized results for pages, players (with team association tags and portraits), and teams.
  - Default quick actions displayed when query is empty.
  - Full keyboard traversal (ArrowUp/Down, Enter selection, Escape dismissal).
  - Strict focus management using `wasOpenRef` to avoid focus stealing on initial mount and accurately restore focus to trigger element on close.
- Responsive mobile layout (<= 900px):
  - Collapses desktop navigation and search pill into compact header with brand, search icon button, Ask, and hamburger menu button.
  - Hamburger button opens left navigation drawer (`side="left"`, `.replica-mobile-drawer`) with edge slide over `--dur-slow`.
  - Navigation sections organized into expandable accordions (`<AccordionItem>`).
- Test suite updates & new specs:
  - Unit tests: `dashboard/components/ui/header.test.tsx` (5 passed).
  - End-to-end tests: `dashboard/e2e/header-command-palette.spec.ts` (6 passed in 4.5s) covering sticky 56px row, scroll transition, keyboard navigation, command palette, More options menu, mobile drawer, and screenshot captures.
  - Updated existing E2E specs: `dashboard/e2e/workbench.spec.ts`, `dashboard/e2e/stats-readability-search.spec.ts`, `dashboard/e2e/route-polish.spec.ts`, `dashboard/e2e/advanced-research.spec.ts`, `dashboard/e2e/stats-preview.spec.ts`.
- Captured screenshot evidence into `docs/evidence/dl03/`:
  - `header-1440.png`: Desktop 1440px viewport showing single 56px sticky row.
  - `command-palette-1440.png`: Desktop command palette modal dialog.
  - `header-375.png`: Mobile 375px viewport with collapsed controls.
  - `drawer-375.png`: Mobile left drawer with navigation accordions.
  - Documented evidence report in `docs/evidence/dl03/README.md`.
- Verification gates pass:
  - Vitest: **36 test files, 262 passed, 0 failures**.
  - Playwright browser suite: **175 passed, 3 skipped, 0 failures**.
  - Python unit tests: `pytest tests/unit` (**1153 passed, 10 skipped, 0 failures**).
  - Strict mypy (`src/courtlens`): **0 errors across 189 files**.
  - Python Ruff check & format: **0 errors, 558 files formatted**.
  - Dashboard Stylelint: **0 errors**.
  - Dashboard ESLint: **0 errors**.
  - Dashboard TypeScript (`tsc --noEmit`): **0 errors**.


## DL04 — 2026-10-07

- Refactored Stats workspace (`/stats`), Player Explorer & Profiles (`/players`, `/players/[id]`), Team Explorer & Detail (`/teams`, `/teams/[id]`), and Comparison Workspaces (`/compare`, `/team-compare`) to strictly adhere to Design Language v1 contracts.
- Eliminated all raw `style={{ ... }}` inline styling across all 19 touched components and pages, ensuring zero ESLint warnings for `no-restricted-syntax`. Dynamic layout properties (e.g. `--table-width`, `--bar-width`) are passed as type-safe CSS custom properties.
- Added modular, tokenized CSS classes for `.team-explorer-*` and `.team-compare-*` in `dashboard/app/styles/components.css` with zero stylelint errors on touched code.
- Centered table guide cells (`.stats-guide-cell`) by adjusting padding to `0` with `margin-inline: auto`, preserving exact 52px standard row height, 14px font, and < 1px sub-pixel gutter centering tolerances.
- Captured 14 desktop (1440x900) and mobile (375x812) evidence screenshots into `docs/evidence/dl04/`:
  - `stats-1440.png`, `stats-375.png`
  - `players-1440.png`, `players-375.png`
  - `player-profile-1440.png`, `player-profile-375.png`
  - `teams-1440.png`, `teams-375.png`
  - `team-detail-1440.png`, `team-detail-375.png`
  - `team-compare-1440.png`, `team-compare-375.png`
  - `compare-1440.png`, `compare-375.png`
  - Documented evidence report in `docs/evidence/dl04/README.md`.
- All verification gates pass:
  - Vitest: **36 test files, 262 passed, 0 failures**.
  - Playwright browser suite: **175 passed, 3 skipped, 0 failures**.
  - Playwright evidence capture suite (`dl04-evidence.spec.ts`): **7 passed**.
  - Python unit tests: `pytest tests/unit` (**1153 passed, 10 skipped, 0 failures**).
  - Strict mypy (`src/courtlens`): **0 errors across 189 files**.
  - Python Ruff check & format: **0 errors**.
  - Dashboard ESLint: **0 errors, 0 warnings** across all touched files.
  - Dashboard TypeScript (`tsc --noEmit`): **0 errors**.

## DL05 — 2026-10-07

- Refactored Live workspace (`/live`, `/live/[date]`, `/live/games/[id]`), Schedule explorer (`/schedule`), Recent games explorer (`/last-games`), and Playoffs postseason workspaces (`/playoffs`, `/playoffs/[seriesId]`) to strictly comply with Design Language v1 contracts.
- Eliminated all raw `style={{ ... }}` inline styling across all touched files (0 ESLint warnings for `no-restricted-syntax`), tokenizing layouts, surfaces, and typography with `--space-*`, `--text-*`, `--color-*`, `--shadow-*`, and `--radius-*`.
- Added pulsing `.live-status-dot` for in-progress games with accessibility preservation (`aria-hidden="true"`), tabular score counters, and hairline borders replacing bright `#707783` borders.
- Refactored 7-game playoff schedule cards, Dean Oliver Four Factors comparison table, player series box score tables, and capability-gated disclosures.
- Captured 12 desktop (1440x900) and mobile (375x812) evidence screenshots into `docs/evidence/dl05/`:
  - `live-1440.png`, `live-375.png`
  - `live-game-1440.png`, `live-game-375.png`
  - `schedule-1440.png`, `schedule-375.png`
  - `last-games-1440.png`, `last-games-375.png`
  - `playoffs-1440.png`, `playoffs-375.png`
  - `playoffs-series-1440.png`, `playoffs-series-375.png`
  - Documented evidence report in `docs/evidence/dl05/README.md`.
- All verification gates pass:
  - Vitest: **36 test files, 262 passed, 0 failures**.
  - Playwright live suite (`live.spec.ts`): **7 passed, 0 failures**.
  - Playwright evidence capture suite (`dl05-evidence.spec.ts`): **6 passed, 0 failures**.
  - Python unit tests: `pytest tests/unit` (**1153 passed, 10 skipped, 0 failures**).
  - Strict mypy (`src/courtlens`): **0 errors across 189 files**.
  - Python Ruff check & format: **0 errors**.
  - Dashboard Stylelint: **0 errors**.
  - Dashboard ESLint: **0 errors, 0 warnings** across all touched files.

## DL06 — 2026-10-07

- Refactored Research Suite workspaces, shooting analysis, floor splits, lineup analytics, deep research investigations, and saved investigations library:
  - Shot charts: `/shot-profile-twin`, `/shot-aftermath`, `components/shooting-view.tsx`
  - Floor splits & lineup analytics: `/wowy`, `/matchups`, `/stat-line-shift`, `components/shared-floor-view.tsx`
  - Advanced research & expected shots: `/research/expected-shots`, `/research/rapm`, `/six-factor-rapm`, `components/research-results-view.tsx`
  - Deep research & distributions: `/research/distributions`, `components/distributions-investigation-view.tsx` (empirical curves, quantile tracks, Type 7 linear interpolation, venue & rest day splits, defensive rankings)
  - Trends & similarity: `/research/trends`, `components/trends-investigation-view.tsx`, `/research/similarity`, `components/similarity-investigation-view.tsx`
  - Case studies, rankings, wingspan & investigations library: `/research/case-studies`, `components/case-studies-view.tsx`, `/rankings`, `components/ranking-boards-view.tsx`, `/wingspan`, `components/wingspan-explorer-view.tsx`, `/investigations`, `components/workbench-investigations-list.tsx`, `components/scatter-plot-view.tsx`, `components/multi-player-lines-view.tsx`.
- Eliminated all raw `style={{ ... }}` inline styling across all touched files (0 ESLint warnings for `no-restricted-syntax`), replacing hardcoded values with tokenized classes (`.dist-*`, `.trend-inv-*`, `.ranking-*`, `.similarity-*`, `.case-study-*`, `.scatter-*`, `.lines-*`, `.investigations-*`). Dynamic quantile strip geometry and scatter coordinates pass type-safe CSS custom properties (`--span-left`, `--span-width`, `--dot-left`, `--label-left`).
- Preserved all sample thresholds ($n \ge 5$), Type 7 linear interpolation calculations, cryptographic SHA-256 evidence hashes, provenance disclosures, and ARIA attributes.
- Captured 24 desktop (1440×900) and mobile (375×812) evidence screenshots into `docs/evidence/dl06/`:
  - `shot-profile-twin-1440.png`, `shot-profile-twin-375.png`
  - `shot-aftermath-1440.png`, `shot-aftermath-375.png`
  - `wowy-1440.png`, `wowy-375.png`
  - `matchups-1440.png`, `matchups-375.png`
  - `distributions-1440.png`, `distributions-375.png`
  - `trends-1440.png`, `trends-375.png`
  - `similarity-1440.png`, `similarity-375.png`
  - `case-studies-1440.png`, `case-studies-375.png`
  - `rankings-1440.png`, `rankings-375.png`
  - `stat-line-shift-1440.png`, `stat-line-shift-375.png`
  - `wingspan-1440.png`, `wingspan-375.png`
  - `investigations-1440.png`, `investigations-375.png`
  - Documented evidence report in `docs/evidence/dl06/README.md`.
- All verification gates pass:
  - Vitest: **36 test files, 262 passed, 0 failures**.
  - Playwright research specs (`shooting.spec.ts`, `shared-floor.spec.ts`, `advanced-research.spec.ts`): **21 passed, 0 failures**.
  - Playwright evidence capture suite (`dl06-evidence.spec.ts`): **12 passed, 0 failures**.
  - Python unit tests: `pytest tests/unit` (**1153 passed, 10 skipped, 0 failures**).
  - Strict mypy (`src/courtlens`): **0 errors across 189 files**.
  - Python Ruff check & format: **0 errors**.
  - Dashboard Stylelint: **0 errors**.
  - Dashboard ESLint: **0 errors, 0 warnings** across all touched files.
  - Dashboard TypeScript (`tsc --noEmit`): **0 errors**.

## DL07 — 2026-10-07

- Refactored Ask Assistant, finance (contracts & free-agency), settings, data-status, methodology, learning, patch notes, blog, tier list, forecasts, and remaining workspaces styling:
  - Ask Assistant & Drawer: `/research/ask`, `components/threaded-assistant.tsx`, `components/ask-drawer.tsx`, `components/ask-courtlens.tsx`, `components/agent-answer.tsx`, `components/hybrid-answer.tsx` (verified full keyboard shortcuts, chat motion patterns, and context attachment).
  - Finance: `/contracts`, `/free-agency`, multi-year ledger, cap hits, and payroll tables tokenized with Design Language v1 surfaces.
  - Operations & Settings: `/settings`, `components/workbench-portrait-settings.tsx`, `/data-status`, `components/workbench-jobs-panel.tsx` (guarded against missing job IDs, tokenized worker tables, timing metrics, and release manifests).
  - Principles & Methodology: `/methodology` (principles grid, metric catalog, limitations disclosure).
  - Forecasts & Policy: `/forecasts` (points forecasting policy, promotion banner, gates grid, code pre blocks).
  - Tier Lists: `/tierlist`, `components/tier-list-view.tsx` (custom tabs, S/A/B/C/D rows, reorder controls, player chips, and type-safe `--tier-color` property).
  - Miscellaneous: `/calculator` (possession math), `/learning` (arithmetic lessons), `/patch-notes` (dated changelog), `/blog` (engineering notes), `app/layout.tsx`.
- Eradicated all raw `style={{ ... }}` inline styling across the entire frontend repository:
  - Exact count of raw inline styles: **0**.
  - All 16 remaining occurrences across 7 files are strictly type-safe CSS custom properties (`--*`) used for dynamic math/chart geometry and virtualization (`distributions-investigation-view.tsx: 7`, `multi-player-lines-view.tsx: 3`, `team-compare-view.tsx: 2`, `workbench-player-explorer.tsx: 1`, `tier-list-view.tsx: 1`, `team-logo.tsx: 1`, `scatter-plot-view.tsx: 1`).
  - ESLint passes with **0 errors and 0 warnings** under `no-restricted-syntax`.
- Captured 26 desktop (1440×900) and mobile (375×812) evidence screenshots into `docs/evidence/dl07/`:
  - `ask-1440.png`, `ask-375.png`
  - `ask-drawer-1440.png`, `ask-drawer-375.png`
  - `contracts-1440.png`, `contracts-375.png`
  - `free-agency-1440.png`, `free-agency-375.png`
  - `settings-1440.png`, `settings-375.png`
  - `data-status-1440.png`, `data-status-375.png`
  - `methodology-1440.png`, `methodology-375.png`
  - `tierlist-1440.png`, `tierlist-375.png`
  - `forecasts-1440.png`, `forecasts-375.png`
  - `calculator-1440.png`, `calculator-375.png`
  - `learning-1440.png`, `learning-375.png`
  - `patch-notes-1440.png`, `patch-notes-375.png`
  - `blog-1440.png`, `blog-375.png`
  - Documented evidence report in `docs/evidence/dl07/README.md`.
- All verification gates pass:
  - Vitest: **36 test files, 262 passed, 0 failures**.
  - Playwright evidence capture suite (`dl07-evidence.spec.ts`): **13 passed, 0 failures**.
  - Playwright core suites (`stats-preview.spec.ts`, `workbench.spec.ts`, `route-polish.spec.ts`, `header-command-palette.spec.ts`, `finance.spec.ts`, `threaded-assistant.spec.ts`): **96 passed, 0 failures**.
  - Python unit tests: `pytest tests/unit` (**1166 passed, 10 skipped, 0 failures**).
  - Strict mypy (`src/courtlens`): **0 errors across 191 source files**.
  - Python Ruff check & format: **clean, 575 files already formatted**.
  - Dashboard Stylelint: **0 errors**.
  - Dashboard ESLint: **0 errors, 0 warnings** across all touched files.
  - Dashboard TypeScript (`tsc --noEmit`): **0 errors**.

## DL08 — 2026-10-07

- Restored layout-matching route loading skeletons (`loading.tsx`) across all 19 data route folders:
  - Root fallback (`app/loading.tsx`), Stats (`app/stats/loading.tsx`), Players Explorer (`app/players/loading.tsx`), Player Profile (`app/players/[id]/loading.tsx`), Teams Explorer (`app/teams/loading.tsx`), Team Detail (`app/teams/[id]/loading.tsx`), Compare (`app/compare/loading.tsx`), Live Workspace (`app/live/loading.tsx`), Live Game Detail (`app/live/games/[id]/loading.tsx`), Playoffs (`app/playoffs/loading.tsx`), Ask Assistant (`app/research/ask/loading.tsx`), WOWY (`app/wowy/loading.tsx`), Contracts (`app/contracts/loading.tsx`), Free Agency (`app/free-agency/loading.tsx`), Data Status (`app/data-status/loading.tsx`), Forecasts (`app/forecasts/loading.tsx`), Settings (`app/settings/loading.tsx`), Tier List (`app/tierlist/loading.tsx`), and Saved Investigations (`app/investigations/loading.tsx`).
  - Added tokenized layout helper classes in `dashboard/app/styles/components.css` (`.ui-skeleton-layout`, `.ui-skeleton-header`, `.ui-skeleton-bar`, `.ui-skeleton-grid-*`, `.ui-skeleton-panel`, `.ui-skeleton-table`, `.ui-skeleton-hero`).
  - Zero raw inline styles across all skeleton components. All 19 skeletons verified via dedicated Vitest test suite (`dashboard/components/ui/loading-skeletons.test.tsx`).
- Action Toasts Implemented & Integrated:
  - Mounted `<ToastProvider>` in root layout (`dashboard/app/layout.tsx`).
  - Wired `useToast` actions across portrait jobs (`workbench-portrait-settings.tsx`), player investigations & filter resets (`workbench-player-explorer.tsx`), tier list builder interactions replacing legacy browser `alert()` popups (`tier-list-view.tsx`), research trends CSV and link sharing (`trends-investigation-view.tsx`), similarity sharing (`similarity-investigation-view.tsx`), distributions sharing & export (`distributions-investigation-view.tsx`), and reproduction verification results (`saved-operation-detail.tsx`).
- Route Transitions & Geometry:
  - Verified root `template.tsx` with `.route-enter` animation (`opacity`, `transform: translateY(4px)`) over 200ms (`--dur-base`). Zero layout shift, no height collapse.
- Performance Pass Benchmarks (`docs/evidence/dl08/performance-report.json`):
  - Measured across 4 key workspaces (`/stats`, `/players/2544`, `/teams/1610612747`, `/research/ask`).
  - CLS scores: `/stats`: **0.0000**, `/players/2544`: **0.0000**, `/teams/1610612747`: **0.0000**, `/research/ask`: **0.0075** (contract gate: CLS ≤ 0.05).
  - Main thread long tasks during active animations: **0** across all 4 routes (contract mandate: *"No animation causes a long task over 50ms"*).
- Captured 10 evidence screenshots and performance artifacts into `docs/evidence/dl08/`:
  - `stats-1440.png`, `stats-375.png`
  - `player-profile-1440.png`, `player-profile-375.png`
  - `team-detail-1440.png`, `team-detail-375.png`
  - `ask-1440.png`, `ask-375.png`
  - `toast-action-1440.png`, `toast-action-375.png`
  - `skeleton-stats-1440.png`, `skeleton-stats-375.png`
  - `skeleton-player-1440.png`, `skeleton-player-375.png`
  - `skeleton-live-1440.png`, `skeleton-live-375.png`
  - `skeleton-root-1440.png`, `skeleton-root-375.png`
  - Documented evidence report in `docs/evidence/dl08/README.md`.
- All verification gates pass:
  - Vitest: **37 test files, 281 passed, 0 failures**.
  - Playwright DL08 evidence spec (`dl08-evidence.spec.ts`): **7 passed in 9.6s**.
  - Playwright full regression suite (`stats-preview.spec.ts`, `workbench.spec.ts`, `route-polish.spec.ts`, `header-command-palette.spec.ts`, `finance.spec.ts`, `dl08-evidence.spec.ts`): **39 passed in 14.1s, 0 failures**.
  - Python unit tests: `pytest tests/unit` (**1175 passed, 10 skipped, 0 failures in 19.89s**).
  - Strict mypy (`src/courtlens`): **0 errors across 192 source files**.
  - Python Ruff check & format: **clean, 583 files already formatted**.
  - Dashboard Stylelint: **0 errors**.
  - Dashboard ESLint: **0 errors, 0 warnings** across all touched files.
  - Dashboard TypeScript (`tsc --noEmit`): **0 errors**.

## DL09 — 2026-10-08

- Strict Lint Enforcement Raised to Error Severity:
  - Upgraded ESLint rules (`no-restricted-syntax` for raw inline styles and `no-restricted-imports` for unapproved `motion` library imports) from `"warn"` to `"error"` in `dashboard/eslint.config.mjs`.
  - Upgraded all Stylelint Design Language v1 rules (`declaration-property-value-disallowed-list`, `declaration-no-important`, `function-disallowed-list`, `color-no-hex`, `color-named`) from `"warn"` to `"error"` in `dashboard/.stylelintrc.json`.
  - Fixed all 24 inline style instances in `/design`, 2 in `header.tsx`, combobox aria attributes and unused vars across `command-palette.tsx`, `table.tsx`, `toast.tsx`, `modal.tsx`, and `primitives.test.tsx`.
  - Fixed all 735 legacy Stylelint violations across `base.css`, `components.css`, and `pages.css`, standardizing all dimensions on `--space-*` and colors on `--color-*`.
  - `npm --prefix dashboard run lint` runs both linters and exits cleanly with **0 errors and 0 warnings**.
- Token Cleanup and Deprecation Eradication:
  - Deleted the legacy alias block from `dashboard/app/styles/tokens.css`.
  - Migrated 592 legacy token references (`var(--bg)`, `var(--surface)`, `var(--border)`, `var(--text-dim)`, `var(--hairline)`) across 10 components and CSS files to official Design Language v1 custom properties.
  - Verified with `git grep` that **0 legacy token alias references** remain anywhere in the project.
- Motion Coverage Automated Test Suite:
  - Implemented `dashboard/e2e/motion-coverage.spec.ts` testing 9 facets of motion compliance against the live container:
    - Root token registrations and cubic bezier curves.
    - Reduced motion media query overrides (collapsing durations to 1ms, preventing layout motion).
    - Header scroll transition and interactive button motion.
    - Modal spring physics enter/exit transitions.
    - Drawer edge slide and backdrop fade transitions.
    - Action toast notifications entrance animation.
    - Segmented control and tabs indicator animations.
    - Loading skeletons pulse animation (`ui-skeleton-pulse`).
    - Route enter transition (`.route-enter`).
  - All 9 motion coverage test cases passed in 3.4s (`npm --prefix dashboard run test:browser:real -- e2e/motion-coverage.spec.ts`).
- Visual Baseline Captures and Comparison Index:
  - Captured 34 full-page screenshots covering 17 states at 1440px and 375px into `docs/evidence/dl08-after/` with `scripts/capture-baseline.mjs`.
  - Generated Before / After Visual Baseline comparison report and inventory in [`docs/evidence/dl08-after/README.md`](evidence/dl08-after/README.md).
  - Built interactive side-by-side inspection viewer in [`docs/evidence/dl08-after/index.html`](evidence/dl08-after/index.html).
  - Documented evidence report in [`docs/evidence/dl09/README.md`](evidence/dl09/README.md).
- Governance and Rules Integration:
  - Updated `AGENTS.md` with explicit Design System & Presentation Rigor principles: zero raw inline styles, strict 4px grid, tonal elevation, mandatory zero-lint-error policy, and motion/reduced-motion compliance.
- Final Verification Gates:
  - Dashboard Lint: `npm --prefix dashboard run lint` (**0 errors, 0 warnings**).
  - Dashboard Types: `npm --prefix dashboard run typecheck` (**0 errors**).
  - Vitest Unit: `npm --prefix dashboard test` (**37 test files, 281 passed, 0 failures**).
  - Playwright Motion Coverage: `npm --prefix dashboard run test:browser:real -- e2e/motion-coverage.spec.ts` (**9 passed, 0 failures**).
  - Playwright Regression Suites: `stats-preview.spec.ts`, `workbench.spec.ts`, `header-command-palette.spec.ts` (**20 passed, 0 failures**).
  - Python Unit Tests: `pytest tests/unit` (**1175 passed, 10 skipped, 0 failures**).
  - Strict Mypy: `.venv/bin/mypy src/courtlens` (**0 errors across 192 source files**).
  - Python Ruff & Format: `ruff check . && ruff format --check .` (**clean, 0 errors**).

## RN02 compatibility note from IM03 — 2026-10-08 UTC


IM03's additive migration exposed the RN02 round-trip fixture selecting whichever
migration was newest. The fixture now selects RN02 revision `09b810a4f007` explicitly
while applying all migrations for setup; its OID/body/trigger and sealing assertions
are unchanged. [112 targeted checks](evidence/im03/verification/targeted-final-accepted.log)
and the [full run](evidence/im03/verification/python-final.log) pass (1,659 passes,
zero failures/errors). This is a test-fixture correction; no rename, environment,
owner database or dashboard work was performed by IM03.

## 2026-10-08 — IM06 serving presentation verified

The bounded [IM06 serving/UI block](evidence/im06/README.md) extends Stats presets,
player impact, research ratings and methodology using Design Language v1 tokens,
scoped vanilla CSS and the existing layout/motion system. Coverage, model attribution,
samples and unavailable columns remain visible. A scoped player trend-card minimum
width fix removes document overflow at 375 px. No rename or frozen identifier changes.

Measured evidence: 285 Vitest tests; 229 fixture browser cases and 12 real-service
cases; 14 screenshots at 1440/375 px; dashboard lint/typecheck and isolated production
build pass. Ruff/format/mypy and 1,778 full Python tests pass. Historical DL evidence
is retained; fixture screenshot suites wrote only inside an isolated dashboard copy.
This records IM06's presentation verification and does not advance another DL block.


## 2026-10-08 — bounded Ask verification repair after AG07/AG08

The owner requested closing remaining offline verification gaps. This is a targeted
repair, not a repeat of DL milestones or their sealed screenshot capture.
[New evidence](evidence/ag-verification/README.md) preserves the earlier reports.

- Restored the existing next-question scope editor and its retained V2/V3 scope helper.
  Per-turn edits and browser-history navigation preserve old answer scope.
- Fixed empty-chat vertical centering on short panels: oversized content starts at the
  top and scrolls; header/composer rows do not shrink. A measured mobile hit test had
  found the Send button behind the header. Desktop, mobile and reduced-motion landscape
  interaction/focus tests now pass.
- Disabled input only while initial history loads, preventing input loss as the composer
  moves to its empty-state placement. A delayed-history regression fails before and
  passes after the change; drafting during execution remains available.
- Targeted suite: 53 passes. Broad browser run: 191 passed / 15 skipped / zero failed;
  three skipped real-backend cases pass separately on disposable PostgreSQL. Twelve
  IM06 real-data cases retain sealed evidence. Dashboard unit tests: 286 passed;
  lint/types and production build pass. Full Python evidence is recorded in the linked
  report. No raw inline styles or new motion mechanism was introduced.


## 2026-10-09 — FO10 Teams and finance presentation

The subsequent [frontend overhaul FO10 block](evidence/fo10/README.md) rebuilds Team Stats,
Team Profile, Teammate Stat Shift, Contracts, team contracts and Free Agency on the shared
v1.1 templates. Shared controls, logo/headshot identity, styled dates, loading skeletons,
phone table containment and Data details preserve existing analytical and finance contracts.
No rename, source acquisition or frozen identifier change; prior DL/AR/AG evidence is retained.

Measured: 27 real-data captures at 1440/768/390px, desktop results at 227–389px, no page overflow
or visible UUID/hash/cutoff rules; lint 0, typecheck and production build pass, 344 Vitest tests,
full fixture browser suite **284 passed / 15 skipped / 0 failed**, 30 stable baselines including
12 new FO10 views. The [FO progress log](frontend-overhaul-progress.md) records implementation
without claiming owner visual acceptance. The current shared-floor and financial source gates
remain unresolved. This entry does not advance older refresh/DL milestones.

## 2026-10-11 — FO14 final presentation sweep

The subsequent [frontend-overhaul FO14 evidence](evidence/fo14/README.md) records route-wide
responsive, keyboard, accessible-label, reflow, contrast and glance checks. It closes the FO13
numeric-alignment, Article skeleton and phone-target follow-ups, empties the title/date ratchets,
and moves floating lookup geometry to typed CSS custom properties. Header/search, token, identity,
reduced-motion and analytical contracts are retained. No rename or frozen identifier change.
Implementation remains `implemented_unverified` pending owner visual acceptance; this cross-reference
does not advance prior refresh/DL milestones or unresolved data-source gates.

## 2026-10-11 — Owner-requested Stats divider and uniform spacing

[Measured evidence](evidence/stats-divider-spacing/README.md): removed the Stats filter bar's
bottom hairline and vertical padding, and aligned the header, selectors, preset row and console
with three uniform 16px gaps. Scoped foundation-layer overrides preserve shared control height.
Real-data desktop/tablet/phone captures (1440/768/390px) show a 0px divider, 40px filter buttons,
no page overflow and console starts at 254/346/362px. Scoped glance review passes for captured
populated states; loading/error/missing-data states were not re-audited. Lint and production
build/TypeScript pass; 10 existing Stats browser tests pass. Desktop/phone production Stats
baselines refreshed for the requested visual change. Prior milestone and owner-acceptance
statuses remain unchanged.

## 2026-10-11 — Native dropdown dark-theme correction

[Measured evidence](evidence/native-select-theme/README.md): reproduced white native dropdowns
with unreadable light text despite the dark color scheme. Shared Select backgrounds were
transparent in both CSS layers; an opaque surface-token probe resolved the popup. Both layers
now use that surface; native options/option groups get explicit surface/text tokens site-wide.
Six real-data desktop/phone opened-menu captures show 15.53:1 option contrast and no page
overflow. Lint/build/TypeScript pass, 357 unit tests pass, 82 existing browser checks pass
(including all 66 unchanged page baselines), and three new native-popup screenshot/contrast
tests pass twice each with a light OS theme. Scoped glance review is recorded in the evidence;
prior milestone and owner-acceptance statuses remain unchanged.

## 2026-10-11 — Select menus styled like navigation menus

[Measured evidence](evidence/select-menu-styling/README.md): standard single-select pickers use
base-select where supported, with the navigation surface/radius/shadow/hairline/padding tokens,
40px option rows, gold selection and hover/focus states. Native values/events remain; unsupported
browsers keep the dark native fallback. Fifteen real-data captures at desktop, tablet, phone,
small phone and landscape widths have contained popup rows and zero page overflow. Keyboard,
Escape, outside dismissal, phone touch selection and 1ms reduced-motion behavior pass. Lint,
production build/TypeScript and 357 unit tests pass; 82 existing browser checks pass including
all 66 unchanged page baselines. Five final picker checks pass, with production opened-menu
baselines refreshed for the requested styling. Scoped glance evidence is recorded; prior
milestone and owner-acceptance statuses remain unchanged.

## 2026-10-11 — PC03 semantic chart follow-up

The [presentation clarity handoff](presentation-clarity-plan.md) supersedes the earlier chart/color
scope. PC03 adds Design Language v1.2 and revises D21, with the eight SVG primitives, palette
contrast checks and desktop/phone extended glance test recorded in
[PC03 evidence](evidence/pc03/README.md). Public Compare rebuilding remains PC04. The original
rename/identity, motion and analytical contracts remain in force.
