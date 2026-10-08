# Block DL08 Evidence Artifacts — Loading Skeletons (`loading.tsx`), Route Transitions, Action Toasts & Performance Pass

**Captured:** 2026-10-07  
**Scope:** Restoring route `loading.tsx` with layout-matching skeletons across data routes, action toast notifications (`ToastProvider` / `useToast`), route transitions (`template.tsx`), and comprehensive performance benchmarking (CLS ≤ 0.05, 0 animation long tasks > 50ms) across 4 key workspaces (`/stats`, `/players/2544`, `/teams/1610612747`, `/research/ask`).

---

## 1. Performance & Cumulative Layout Shift (CLS) Benchmarks

Measured via Playwright performance observer and browser navigation timings in [`dashboard/e2e/dl08-evidence.spec.ts`](../../dashboard/e2e/dl08-evidence.spec.ts) and recorded in [`performance-report.json`](performance-report.json):

| Route / Workspace | Elapsed (ms) | CLS Score | FCP (ms) | DOM Interactive (ms) | Load Complete (ms) | Animation Long Tasks > 50ms | Max Animation Duration (ms) | Status |
|---|---|---|---|---|---|---|---|---|
| `/stats` | 3,201 | **0.0000** | 192 | 200 | 227 | **0** | 0 ms | **PASS** (CLS ≤ 0.05 gate) |
| `/players/2544` | 3,095 | **0.0000** | 1,716 | 1,667 | 1,865 | **0** | 0 ms | **PASS** (CLS ≤ 0.05 gate) |
| `/teams/1610612747` | 3,032 | **0.0000** | 1,652 | 1,633 | 1,812 | **0** | 0 ms | **PASS** (CLS ≤ 0.05 gate) |
| `/research/ask` | 3,051 | **0.0075** | 1,556 | 1,545 | 1,809 | **0** | 0 ms | **PASS** (CLS ≤ 0.05 gate) |

### Key Performance Findings:
- **Zero Layout Shift:** Three of the four key pages registered an absolute zero layout shift (`CLS = 0.0000`), and `/research/ask` registered `CLS = 0.0075`, well within the contractual threshold (`CLS ≤ 0.05`) and strictly maintaining pre-migration stability.
- **Zero Animation Long Tasks:** Across all four routes, active animations (route enter fade/slide, button hover states, dropdown reveals) caused **zero long tasks > 50ms** on the main thread, satisfying the contract mandate (*"No animation causes a long task over 50ms"*).
- **Zero Height Collapse:** Route transitions verified via `template.tsx` (`.route-enter`) maintain full container dimensions (>1000px width, >400px height) throughout the transition.

---

## 2. Evidence Screenshots

Captured across desktop (1440×900) and mobile (375×812) viewports into `docs/evidence/dl08/`:

### A. Route Benchmarks
| Route | Desktop (1440×900) | Mobile (375×812) | Description |
|---|---|---|---|
| `/stats` | [`stats-1440.png`](stats-1440.png) | [`stats-375.png`](stats-375.png) | Stats workspace loaded with stable table geometry, filters, and pinned columns. |
| `/players/2544` | [`player-profile-1440.png`](player-profile-1440.png) | [`player-profile-375.png`](player-profile-375.png) | LeBron James profile with historical logs, split tabs, and metric badges. |
| `/teams/1610612747` | [`team-detail-1440.png`](team-detail-1440.png) | [`team-detail-375.png`](team-detail-375.png) | Los Angeles Lakers detail page with roster breakdown, ratings, and schedule. |
| `/research/ask` | [`ask-1440.png`](ask-1440.png) | [`ask-375.png`](ask-375.png) | Ask CourtLens assistant with active threads sidebar, context badge, and composer. |

### B. Action Toasts
| Interaction | Desktop (1440×900) | Mobile (375×812) | Description |
|---|---|---|---|
| Settings Portrait Job | [`toast-action-1440.png`](toast-action-1440.png) | [`toast-action-375.png`](toast-action-375.png) | Action toast triggered upon enqueueing portrait acquisition job with title, description, and close button. |

### C. Route Loading Skeletons
| Skeleton View | Desktop (1440×900) | Mobile (375×812) | Description |
|---|---|---|---|
| Stats Loading | [`skeleton-stats-1440.png`](skeleton-stats-1440.png) | [`skeleton-stats-375.png`](skeleton-stats-375.png) | Layout-matching skeleton for `/stats`: header, filter bar, metric cards, and table grid. |
| Player Profile Loading | [`skeleton-player-1440.png`](skeleton-player-1440.png) | [`skeleton-player-375.png`](skeleton-player-375.png) | Layout-matching skeleton for `/players/[id]`: portrait hero, badge cluster, and tab cards. |
| Live Workspace Loading | [`skeleton-live-1440.png`](skeleton-live-1440.png) | [`skeleton-live-375.png`](skeleton-live-375.png) | Layout-matching skeleton for `/live`: score ticker grid, period indicators, and boxscore rows. |
| Root Fallback Loading | [`skeleton-root-1440.png`](skeleton-root-1440.png) | [`skeleton-root-375.png`](skeleton-root-375.png) | Global route fallback skeleton with top hero bar, navigation crumbs, and panel structure. |

---

## 3. Inventory of Restored Route Loading Skeletons

To eliminate blank flashes and prevent layout shift during navigation, 19 dedicated `loading.tsx` skeletons were implemented adhering to Design Language v1 tokens and layout helper classes (`.ui-skeleton-layout`, `.ui-skeleton-header`, `.ui-skeleton-bar`, `.ui-skeleton-panel`, `.ui-skeleton-table`, `.ui-skeleton-hero`):

1. [`dashboard/app/loading.tsx`](../../dashboard/app/loading.tsx) — Root fallback skeleton
2. [`dashboard/app/stats/loading.tsx`](../../dashboard/app/stats/loading.tsx) — Stats workspace skeleton
3. [`dashboard/app/players/loading.tsx`](../../dashboard/app/players/loading.tsx) — Player explorer skeleton
4. [`dashboard/app/players/[id]/loading.tsx`](../../dashboard/app/players/[id]/loading.tsx) — Player profile skeleton
5. [`dashboard/app/teams/loading.tsx`](../../dashboard/app/teams/loading.tsx) — Team explorer skeleton
6. [`dashboard/app/teams/[id]/loading.tsx`](../../dashboard/app/teams/[id]/loading.tsx) — Team detail skeleton
7. [`dashboard/app/compare/loading.tsx`](../../dashboard/app/compare/loading.tsx) — Head-to-head compare skeleton
8. [`dashboard/app/live/loading.tsx`](../../dashboard/app/live/loading.tsx) — Live workspace & scores ticker skeleton
9. [`dashboard/app/live/games/[id]/loading.tsx`](../../dashboard/app/live/games/[id]/loading.tsx) — Live game boxscore skeleton
10. [`dashboard/app/playoffs/loading.tsx`](../../dashboard/app/playoffs/loading.tsx) — Playoffs bracket skeleton
11. [`dashboard/app/research/ask/loading.tsx`](../../dashboard/app/research/ask/loading.tsx) — Ask assistant conversation skeleton
12. [`dashboard/app/wowy/loading.tsx`](../../dashboard/app/wowy/loading.tsx) — WOWY / On-Off analytics skeleton
13. [`dashboard/app/contracts/loading.tsx`](../../dashboard/app/contracts/loading.tsx) — Contracts book ledger skeleton
14. [`dashboard/app/free-agency/loading.tsx`](../../dashboard/app/free-agency/loading.tsx) — Free agency tracker skeleton
15. [`dashboard/app/data-status/loading.tsx`](../../dashboard/app/data-status/loading.tsx) — Data status & worker jobs skeleton
16. [`dashboard/app/forecasts/loading.tsx`](../../dashboard/app/forecasts/loading.tsx) — Points forecasts & policy skeleton
17. [`dashboard/app/settings/loading.tsx`](../../dashboard/app/settings/loading.tsx) — Settings & cache configuration skeleton
18. [`dashboard/app/tierlist/loading.tsx`](../../dashboard/app/tierlist/loading.tsx) — Tier list builder board skeleton
19. [`dashboard/app/investigations/loading.tsx`](../../dashboard/app/investigations/loading.tsx) — Saved investigations skeleton

All 19 skeletons are tested in [`dashboard/components/ui/loading-skeletons.test.tsx`](../../dashboard/components/ui/loading-skeletons.test.tsx) for accessibility (`aria-busy="true"`), skeleton presence, and **zero un-tokenized style attributes**.

---

## 4. Action Toast Notifications Inventory

Mounted `<ToastProvider>` in root [`dashboard/app/layout.tsx`](../../dashboard/app/layout.tsx) and wired action feedback across the application using `useToast`:

- **Portrait Jobs:** [`dashboard/components/workbench-portrait-settings.tsx`](../../dashboard/components/workbench-portrait-settings.tsx) — Toast on job enqueue ("Portrait Job Enqueued") and on failure.
- **Player Explorer:** [`dashboard/components/workbench-player-explorer.tsx`](../../dashboard/components/workbench-player-explorer.tsx) — Toast on investigation save ("Investigation Saved") and on filter reset ("Filters Reset").
- **Tier List Builder:** [`dashboard/components/tier-list-view.tsx`](../../dashboard/components/tier-list-view.tsx) — Replaced all native browser `alert()` popups with styled toasts for tier reset, list creation, tier deletion, and player assignments.
- **Research Trends:** [`dashboard/components/trends-investigation-view.tsx`](../../dashboard/components/trends-investigation-view.tsx) — Toast on shareable link copy and on CSV export download.
- **Player Similarity:** [`dashboard/components/similarity-investigation-view.tsx`](../../dashboard/components/similarity-investigation-view.tsx) — Toast on shareable link copy.
- **Distributions:** [`dashboard/components/distributions-investigation-view.tsx`](../../dashboard/components/distributions-investigation-view.tsx) — Toast on shareable link copy and on CSV export download.
- **Saved Operations:** [`dashboard/components/saved-operation-detail.tsx`](../../dashboard/components/saved-operation-detail.tsx) — Toast on reproduction verification outcome (pass/mismatch/error).
- **Design System Showcase:** [`dashboard/app/design/page.tsx`](../../dashboard/app/design/page.tsx) — Interactive toast triggers for chips, menus, and buttons.

---

## 5. Verification Test Results

- **Playwright DL08 Evidence Spec:** [`dashboard/e2e/dl08-evidence.spec.ts`](../../dashboard/e2e/dl08-evidence.spec.ts) $\to$ **7 passed in 9.6s, 10 screenshots captured**.
- **Playwright Full Regression Suite:**
  - `stats-preview.spec.ts`, `workbench.spec.ts`, `route-polish.spec.ts`, `header-command-palette.spec.ts`, `finance.spec.ts`, `dl08-evidence.spec.ts` $\to$ **39 passed in 14.1s (0 failures)**.
- **Vitest Unit Suite:** **37 test files, 281 passed, 0 failures** (including all 19 loading skeleton tests).
- **Python Unit Suite:** `.venv/bin/pytest tests/unit` $\to$ **1175 passed, 10 skipped, 0 failures in 19.89s**.
- **Python Static Analysis:** Strict Mypy (`src/courtlens`) $\to$ **0 issues across 192 source files**; Ruff check & format $\to$ **clean, 583 files formatted**.
- **Dashboard Static Analysis:** TypeScript (`tsc --noEmit`) $\to$ **0 errors**; Stylelint $\to$ **0 errors**; ESLint $\to$ **0 errors, 0 warnings across touched files**.
