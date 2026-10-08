# DL03 Verification: Header and Command Palette

**Block:** DL03 Header and command palette  
**Date:** 2026-10-07  
**Owner:** Sol / Flash  
**Status:** Verified

---

## 1. Scope & Execution Summary

Block DL03 replaced the legacy two-row replica header with the unified Design Language v1 single-row header:
- **Geometry:** 56px fixed height (`--header-height: 56px`), sticky with transparent rest state and blur transition on scroll (`backdrop-filter: blur(12px) saturate(140%)`, `--shadow-1`, zero bottom border line, 0 layout shift).
- **Navigation:**
  - Left group: CourtLens ball-lens SVG branding + wordmark.
  - Primary links: Stats and WOWY (direct link when not secondary).
  - Dropdowns: Live▾, Players▾, Teams▾, Compare▾, Research▾ with physics spring active sliding indicator (`layoutId="header-active-indicator"`) and hover-intent (80ms open / 150ms close).
  - Center: Pill searchfield (`[🔍 Search players, teams… ⌘K]`) with `--radius-pill` and keyboard shortcuts (`⌘K`, `Ctrl+K`, `/`).
  - Right group: Ask button (navigates or triggers Ask panel), More options (`⋯`) menu, and responsive mobile controls.
- **More options (`⋯`) dropdown:** Contains Settings, Data status, Availability section with gated items and badges, Methodology, Interactive Learning, Patch Notes, Blog & Updates, and Keyboard shortcuts (`?`).
- **Command Palette (`GlobalCommandPalette`):**
  - Connects directly to workbench global-lookup API (`queryLookup`) with real-time debounce and caching (`lookupCache`).
  - Groups results into pages, players (with compact team association badges and player portraits), and teams.
  - ArrowUp/Down keyboard traversal, Enter selection, and Escape dismissal.
  - Focus trap and automatic focus restoration to the trigger element on close.
- **Mobile Responsive Layout (<= 900px):**
  - Collapses desktop navigation and search pill into compact header with brand, search icon button, Ask, and hamburger menu button.
  - Clicking hamburger opens left navigation drawer (`side="left"`, `.replica-mobile-drawer`) with smooth edge slide over `--dur-slow`.
  - Navigation sections organized into expandable accordions (`<AccordionItem>`).

---

## 2. Screenshot Evidence

| File | Resolution | Description |
| --- | --- | --- |
| `header-1440.png` | 1440 × 900 | Desktop 1440px viewport showing single 56px sticky row with brand, active indicator on Stats, search pill, Ask, and More menu. |
| `command-palette-1440.png` | 1440 × 900 | Desktop command palette modal dialog triggered via ⌘K / `/` with search input, quick action suggestions, and footer keyboard tips. |
| `header-375.png` | 375 × 812 | Mobile 375px viewport with logo, search icon, Ask button, and hamburger drawer toggle. |
| `drawer-375.png` | 375 × 812 | Mobile left drawer open with brand header, close button, direct links, and navigation accordions. |

---

## 3. Test Suites & Verification

### Vitest Unit Tests
- New unit test suite: `dashboard/components/ui/header.test.tsx` (5 passed)
- Full suite: 36 test files, 262 passed (0 failures).

### Playwright E2E Tests
- New E2E spec: `dashboard/e2e/header-command-palette.spec.ts` (6 passed in 4.5s)
  - 56px sticky row without bottom border line & zero layout shift on scroll
  - Dropdown keyboard navigation, ArrowDown to enter, Escape returns focus
  - Command palette shortcut, global lookup search, arrow traversal, focus restore
  - More options menu (Settings, Data status, Availability, Help)
  - Mobile viewport collapse, mobile search, and drawer accordions
  - Screenshot capture
- Updated existing specs:
  - `dashboard/e2e/stats-readability-search.spec.ts` (100% green)
  - `dashboard/e2e/route-polish.spec.ts` (100% green)
  - `dashboard/e2e/workbench.spec.ts` (100% green)
- Full Playwright suite execution: 175 passed, 3 skipped, 0 failures.

### Static Analysis
- Strict mypy (`src/courtlens`): 0 errors across 189 files.
- Ruff format and lint: clean, 0 errors.
- ESLint: 0 errors.
- Stylelint: 0 errors.
