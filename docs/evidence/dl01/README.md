# DL01 Evidence — Foundation and Baselines

**Date:** 2026-10-07  
**Status:** verified  
**Parent plan:** [courtlens-refresh-plan.md](../../courtlens-refresh-plan.md)  
**Contract:** [design-language-v1.md](../../design/design-language-v1.md)

## Summary of Accomplishments

1. **Before and After Visual Baseline Captures:**
   - Captured 34 before screenshots into [`docs/evidence/dl01-before/`](../dl01-before/) covering the 16 key pages (17 states including empty and answered Ask) at viewports 1440px and 375px.
   - Rebuilt the live production dashboard container on the CourtLens stack and captured 34 after screenshots into [`docs/evidence/dl01-after/`](../dl01-after/).
   - 7 files are byte-for-byte identical (including live and ask views).
   - Remaining 27 files are >= 99.65% visually identical (< 0.35% RMSE), with variance entirely explained by anti-aliased subpixel rendering on table pinned column shadows and minor real-time formatting. There is zero visual layout shift or regression.

2. **CSS Split into `@layer` Architecture:**
   - Split `globals.css` into modular stylesheets in `dashboard/app/styles/` imported in explicit `@layer` order:
     - `tokens.css`: Design Language v1 color, elevation, spacing (4px rhythm), radius, sizing, typography, z-index, and motion tokens, plus legacy aliases (`--bg`, `--surface`, `--accent`, etc.).
     - `base.css`: HTML/body defaults, font smoothing, form element resets, focus-visible outlines, skip link, and forced-colors accessibility.
     - `motion.css`: `@keyframes` animations (`lookupSpin`, `fadeInDropdown`, `slideIn`, `slideInRight`, `slideUpTray`, `ask-pulse`) and the rewritten reduced-motion handling.
     - `components.css`: Common buttons, shell layout, global lookup, menus, drawer, modal, panels, fields, and assistant chat components.
     - `pages.css`: Route-specific workspaces (stats explorer, player detail, team detail, compare, live, playoffs, WOWY, finance, and advanced research).
   - `dashboard/app/globals.css` imports the layers:
     ```css
     @layer tokens, base, motion, components, pages;
     @import "./styles/tokens.css";
     @import "./styles/base.css";
     @import "./styles/motion.css";
     @import "./styles/components.css";
     @import "./styles/pages.css";
     ```

3. **Rewritten Reduced-Motion Handling:**
   - Replaced aggressive `animation: none !important; transition: none !important` with token-based overrides:
     - `--dur-instant: 1ms`, `--dur-base: 1ms`, `--dur-slow: 1ms`, `--dur-chart: 1ms`
     - Opacity transitions retain `--dur-fast` (140ms) per contract.
     - Transform-based enters become opacity-only (`transform: none !important`).

4. **Measured WCAG Contrast Verification:**
   - Measured with `scripts/verify-contrast.py` against WCAG 2.1 relative luminance standards:
   - All text and surface token pairs used for essential text pass WCAG AA (>= 4.5:1), with primary text exceeding 14:1 (WCAG AAA).
   - Tertiary text on surface-3 measures 4.13:1, exceeding the 3:1 threshold for non-essential or large text.
   - Results recorded into [`docs/design/design-language-v1.md`](../../design/design-language-v1.md).

5. **Stylelint and ESLint Migration Backlog:**
   - Installed `stylelint` 17.16.0 as dev dependency and added `dashboard/.stylelintrc.json`.
   - Added `no-restricted-syntax` (for inline styles) and `no-restricted-imports` (for `motion`) to `dashboard/eslint.config.mjs` at `warn` level.
   - Both linters configured to report migration debt without failing builds until DL08.

### Migration Backlog Warning Counts

#### Stylelint: 864 warnings across 4 files

| File | Warnings |
| --- | --- |
| `app/styles/components.css` | 404 |
| `app/styles/pages.css` | 295 |
| `components/stats-explorer.css` | 155 |
| `app/styles/base.css` | 10 |
| `app/styles/tokens.css` | 0 |
| `app/styles/motion.css` | 0 |
| `app/globals.css` | 0 |

Breakdown by rule:
- `declaration-property-value-disallowed-list` (raw px/rem outside 0/1px/%, raw z-index, `transition: all`): 773
- `declaration-no-important` (`!important` outside motion/forced-colors): 40
- `function-disallowed-list` (raw `rgb()` / `hsl()` colors): 26
- `color-no-hex` (raw hex colors outside `tokens.css`): 18
- `color-named` (raw named colors): 7

#### ESLint: 3,388 warnings across 42 files

- `no-restricted-syntax`: 3,388 inline `style={{ ... }}` property warnings requiring migration to tokens or custom properties in DL04–DL06.
- `no-restricted-imports`: 0 warnings (no unauthorized `motion` imports exist prior to DL02).

## Test Suite Verification

- **Lint:** `npm --prefix dashboard run lint` passes (0 errors, 4252 migration warnings reported).
- **TypeScript:** `npm --prefix dashboard run typecheck` passes (0 errors).
- **Vitest:** `npm --prefix dashboard test` passes (34 files, 228 tests passing).
- **Playwright fixture suite:** passes (`e2e/route-polish.spec.ts` 6 passed, `e2e/live.spec.ts` 7 passed).
- **Python test suite:** `pytest tests/unit` passes (1099 passed, 2 skipped, 0 failures).
