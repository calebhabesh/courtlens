# DL02 Primitives and Motion Verification Evidence

**Block:** DL02 Primitives and motion  
**Date:** 2026-10-07  
**Status:** Verified  

---

## 1. Pinned Motion Dependency

- Installed and pinned: `"motion": "14.0.0"` in `dashboard/package.json`.
- Strict ESLint rule (`no-restricted-imports`) prevents direct imports of `motion` outside `components/ui/**`, `components/charts/**`, and `lib/motion.ts`.

---

## 2. Motion Module (`lib/motion.ts`)

Implements tokens, spring curves, reduced motion detection, and animation variants:
- **Durations:**
  - `instant`: 0.08s (80ms)
  - `fast`: 0.14s (140ms)
  - `base`: 0.20s (200ms)
  - `slow`: 0.32s (320ms)
  - `chart`: 0.45s (450ms)
- **Easings:** `easeOut: [0.16, 1, 0.3, 1]`, `easeInOut: [0.65, 0, 0.35, 1]`
- **Springs:** Standard physics `{ stiffness: 260, damping: 28, mass: 1 }` and instant spring `{ stiffness: 1000, damping: 50, mass: 0.1 }` under reduced motion.
- **Hook:** `useReducedMotion()` with SSR safety (`prefers-reduced-motion: reduce`).
- **Variants:** `fadeSlideVariants`, `popoverVariants`, `modalVariants`, `scrimVariants`, `getDrawerVariants`, `toastVariants`.

---

## 3. UI Primitives Implemented (`components/ui/`)

All 20+ primitives from the Design Language v1 specification were implemented with keyboard accessibility, ARIA compliance, and token styling:

| Primitive | Path | Features |
| --- | --- | --- |
| `Button` | `components/ui/button.tsx` | Variants: `primary`, `secondary`, `ghost`, `danger`; sizes: `sm`, `md`, `lg`; `loading` spinner; disabled handling |
| `IconButton` | `components/ui/button.tsx` | Square ratio, icon centering, `aria-label`, `title` |
| `Input` | `components/ui/input.tsx` | Sizing: `sm`, `md`, `lg`; error ring state; leading/trailing icons |
| `SearchField` | `components/ui/input.tsx` | `role="searchbox"`, shortcut badge (⌘K), clear trigger |
| `Select` | `components/ui/select.tsx` | Chevron indicator, `surface-2` background, focus outline |
| `Checkbox` | `components/ui/checkbox.tsx` | `role="checkbox"`, `aria-checked` supports checked, unchecked, indeterminate (`mixed`) |
| `Switch` | `components/ui/switch.tsx` | `role="switch"`, thumb sliding motion, Space/Enter toggle |
| `SegmentedControl` | `components/ui/segmented-control.tsx` | Pill control with sliding motion spring indicator, Arrow/Home/End keyboard nav |
| `Tabs` | `components/ui/tabs.tsx` | `Tabs`, `TabsList`, `TabTrigger`, `TabsContent`; sliding spring underline, crossfading content |
| `Badge` / `Chip` | `components/ui/badge.tsx` | Variants (`default`, `accent`, `positive`, `negative`, `info`), optional remove trigger |
| `Panel` / `Section` | `components/ui/panel.tsx` | Card surface container, header, actions, backwards-compatible with legacy `Section` |
| `PageHeader` | `components/ui/panel.tsx` | Standard workbench title, subtitle, breadcrumbs/actions row |
| `Table` | `components/ui/table.tsx` | `Table`, `TableHeader`, `TableBody`, `TableRow`, `TableCell` (`tabular-nums`), `SortHeader` (`aria-sort`, rotating chevron) |
| `Menu` / `Popover` | `components/ui/menu.tsx` | Popover dropdown with scale+opacity spring, Arrow/Escape keyboard navigation, outside click close |
| `Tooltip` | `components/ui/tooltip.tsx` | Delayed (300ms) hover/focus tooltip, `role="tooltip"` |
| `Drawer` | `components/ui/drawer.tsx` | Side / bottom sliding drawer over `--dur-slow`, backdrop blur scrim, focus trap, Escape key close |
| `Modal` | `components/ui/modal.tsx` | Centered dialog, scale+opacity spring, focus trap, Escape key close |
| `CommandPalette` | `components/ui/command-palette.tsx` | ⌘K launcher, real-time query filtering, ArrowUp/ArrowDown selection, Enter activation |
| `Toast` | `components/ui/toast.tsx` | `ToastProvider` & `useToast()` hook, spring slide-in notification stack with auto-dismiss |
| `Skeleton` | `components/ui/skeleton.tsx` | Layout-shaped skeleton loader, linear-gradient shimmer wave, custom-property inline styles |
| `EmptyState` | `components/ui/empty-state.tsx` | Empty state with icon, title, description, and call to action |
| `Accordion` | `components/ui/accordion.tsx` | Collapsible section using CSS grid-rows animation (`0fr` -> `1fr`) and rotating chevron |
| `Presence` | `components/ui/presence.tsx` | Re-export of `AnimatePresence` for unmount transitions |

---

## 4. Route Enter Transition (`template.tsx`)

Implemented `dashboard/app/template.tsx`:
```tsx
export default function Template({ children }: { children: ReactNode }) {
  return <div className="route-enter">{children}</div>;
}
```
With motion and layout styling in `dashboard/app/styles/motion.css`:
- Normal: Opacity `0 -> 1` and `translateY(6px -> 0)` over `--dur-slow` (320ms) using `--ease-out`.
- Flex layout: `display: flex; flex-direction: column; flex: 1; min-width: 0; min-height: 0; width: 100%` ensures zero layout shift or child height collapse in full-height workspaces (`/research/ask`, stats tables).
- Reduced motion: Opacity-only crossfade over `--dur-slow`, `transform: none !important`.

---

## 5. View Transitions Spike and Decision

- **Investigation:** Tested View Transitions compatibility with pinned Next.js 16.3.5 (App Router) and React 19.2.8.
- **Findings:**
  - `React.ViewTransition` is `undefined`.
  - Next.js 16.3 App Router does not support `experimental.viewTransition` in `NextConfig`.
  - Attempting to hijack route transitions with manual `document.startViewTransition()` on Next.js Link navigations triggers race conditions with React Server Components streaming and DOM reconciliation.
- **Decision:** Do not use custom View Transitions monkey patches. Rely on the root `template.tsx` enter transition (`.route-enter` over `--dur-slow`). The header remains completely static during navigation per contract.

---

## 6. Bundle Size & Chunk Isolation

Production build was measured to verify that `motion` is completely absent from all routes that do not use it:

- Motion chunk: `static/chunks/208my1sgfbej0.js` (163.2 KB).
- **Chunk Isolation:** The Next.js client manifest confirms that **only `/design`** references the `motion` chunk.
- All other routes have **0 bytes of `motion`**.

### First-Load JS Comparison

| Route | Before DL02 (KB) | After DL02 (KB) | Delta (KB) | Contains `motion`? |
| --- | --- | --- | --- | --- |
| Shared Root JS | 538.6 | 538.6 | 0 | No |
| `/` | 710.2 | 710.2 | 0 | No |
| `/stats` | 859.0 | 859.0 | 0 | No |
| `/players` | 861.3 | 861.3 | 0 | No |
| `/teams` | 740.2 | 740.2 | 0 | No |
| `/compare` | 773.6 | 773.6 | 0 | No |
| `/live` | 723.1 | 723.1 | 0 | No |
| `/playoffs` | 731.8 | 731.8 | 0 | No |
| `/research/ask` | 710.2 | 710.2 | 0 | No |
| `/wowy` | 726.9 | 726.9 | 0 | No |
| `/contracts` | 738.3 | 738.3 | 0 | No |
| `/settings` | 716.4 | 716.4 | 0 | No |
| `/data-status` | 713.8 | 713.8 | 0 | No |
| `/design` (new style guide) | N/A | 873.5 | +873.5 | **Yes (isolated)** |

---

## 7. Style Guide Route (`/design`) & Screenshots

The living style guide at `/design` showcases every token, color swatch, typography level, motion curve, and interactive primitive in both default and reduced motion states.

Screenshots captured using Playwright Chromium:
- Desktop: [`docs/evidence/dl02/design-1440.png`](design-1440.png) (386 KB)
- Mobile: [`docs/evidence/dl02/design-375.png`](design-375.png) (366 KB)

---

## 8. Verification Suites

- **Vitest Primitive Suite:** [`components/ui/primitives.test.tsx`](file:///home/ethioking/dev/nba-analytics/dashboard/components/ui/primitives.test.tsx) (29 tests) verifying all interactive states, ARIA roles, keyboard navigation (Arrow, Enter, Space, Escape, Home, End), and reduced-motion fallback.
  - Overall Vitest: **35 test files, 257 tests passed** (0 failures).
- **Playwright Browser Suite:** **169 passed, 3 skipped, 0 failed**.
- **Python Strict MyPy:** `mypy src/courtlens` passed with 0 errors across 187 files.
- **Python Ruff / Format:** Clean (0 errors, 545 files formatted).
- **Python Unit Suite:** `pytest tests/unit` passed (**1119 passed, 10 skipped, 0 failures**).
- **Dashboard Lint:** CSS lint: 0 errors; ESLint: 0 errors; TypeScript: 0 errors.
