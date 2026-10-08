# CourtLens design language v1

Owner-confirmed direction (2026-10-07): smooth and modern, no stiff or abrupt changes, no bright
outline borders. Use this contract for every dashboard change after DL01 lands. The block plan and
order are in [courtlens-refresh-plan.md](../courtlens-refresh-plan.md).

## Principles

1. **Separate by surface, not outline.** Separate areas with tonal steps (page → panel → raised
   element) and soft shadows. Lines are faint hairlines, used only where tables, lists or form groups
   need structure. A 1px `#707783` border (today's `--border`) is never used for containers.
2. **One spacing rhythm.** A 4px base grid. Use only tokens; no ad-hoc px or rem.
3. **Every state change moves.** Anything that appears, disappears, opens, sorts, loads or changes
   state animates with motion tokens. Nothing snaps, except when the OS "reduce motion" setting is on.
4. **Data never animates through wrong values.** No count-up or tweening of stat values. Data
   changes crossfade or slide; the numbers themselves never interpolate.
5. **Calm by default, lively in the small.** Large surfaces fade or slide subtly. Small interactive
   pieces (menus, chips, toggles, the Ask panel, tab indicators) may use springs.

## Tokens (`dashboard/app/styles/tokens.css`)

Names are normative. Values are starting points that DL01 may tune once, record in this file, and
then freeze. Old token names (`--surface`, `--border`, `--ink`, `--lime`, …) become aliases during
migration and are deleted in DL08.

### Color

| Token | Value | Use |
| --- | --- | --- |
| `--color-bg` | `#0c0d10` | Page background |
| `--color-surface-1` | `#121419` | Header, panels, cards |
| `--color-surface-2` | `#181b21` | Raised elements: inputs, table header, hovered rows, menus |
| `--color-surface-3` | `#1f232a` | Popovers, modals, drawers, selected rows |
| `--color-surface-hover` | `rgb(255 255 255 / 4%)` | Hover overlay on any surface |
| `--color-surface-press` | `rgb(255 255 255 / 7%)` | Pressed overlay |
| `--color-hairline` | `rgb(255 255 255 / 6%)` | Table row dividers, list separators |
| `--color-hairline-strong` | `rgb(255 255 255 / 10%)` | Input outline at rest (optional), grouped controls |
| `--color-text` | `#f2f3f5` | Primary text |
| `--color-text-secondary` | `#a9afb9` | Labels, secondary text |
| `--color-text-tertiary` | `#7d838d` | Placeholders, disabled text. Never for essential text below 18px. |
| `--color-accent` | `#ffd166` | Active nav, primary action, focus |
| `--color-accent-soft` | `rgb(255 209 102 / 12%)` | Selected chip/tab background |
| `--color-on-accent` | `#0c0d10` | Text on the accent |
| `--color-brand` | `#ff7a2f` | Logo only |
| `--color-positive` / `--color-negative` / `--color-info` | `#60d394` / `#ff6b6b` / `#67aaf9` | Data semantics |
| `--focus-ring` | `0 0 0 2px var(--color-bg), 0 0 0 4px var(--color-accent)` | All focusable elements (`:focus-visible`) |

All text and surface pairs used for essential text must meet WCAG AA (4.5:1, or 3:1 at 18px+).
DL01 verified this with `scripts/verify-contrast.py`; measured ratios:

| Text Token | Surface | Contrast Ratio | WCAG AA Normal (4.5:1) | WCAG AA Large (3:1) |
| --- | --- | --- | --- | --- |
| `--color-on-accent (#0c0d10)` | `--color-accent (#ffd166)` | 13.48:1 | Pass | Pass |
| `--color-text (#f2f3f5)` | `bg (#0c0d10)` | 17.50:1 | Pass | Pass |
| `--color-text (#f2f3f5)` | `surface-1 (#121419)` | 16.59:1 | Pass | Pass |
| `--color-text (#f2f3f5)` | `surface-2 (#181b21)` | 15.53:1 | Pass | Pass |
| `--color-text (#f2f3f5)` | `surface-3 (#1f232a)` | 14.20:1 | Pass | Pass |
| `--color-text-secondary (#a9afb9)` | `bg (#0c0d10)` | 8.81:1 | Pass | Pass |
| `--color-text-secondary (#a9afb9)` | `surface-1 (#121419)` | 8.35:1 | Pass | Pass |
| `--color-text-secondary (#a9afb9)` | `surface-2 (#181b21)` | 7.82:1 | Pass | Pass |
| `--color-text-secondary (#a9afb9)` | `surface-3 (#1f232a)` | 7.15:1 | Pass | Pass |
| `--color-text-tertiary (#7d838d)` | `bg (#0c0d10)` | 5.09:1 | Pass | Pass |
| `--color-text-tertiary (#7d838d)` | `surface-1 (#121419)` | 4.83:1 | Pass | Pass |
| `--color-text-tertiary (#7d838d)` | `surface-2 (#181b21)` | 4.52:1 | Pass | Pass |
| `--color-text-tertiary (#7d838d)` | `surface-3 (#1f232a)` | 4.13:1 | N/A (non-essential / >=18px) | Pass |
| `--color-accent (#ffd166)` | `bg (#0c0d10)` | 13.48:1 | Pass | Pass |
| `--color-accent (#ffd166)` | `surface-1 (#121419)` | 12.78:1 | Pass | Pass |
| `--color-accent (#ffd166)` | `surface-2 (#181b21)` | 11.96:1 | Pass | Pass |
| `--color-accent (#ffd166)` | `surface-3 (#1f232a)` | 10.93:1 | Pass | Pass |
| `--color-positive (#60d394)` | `bg (#0c0d10)` | 10.40:1 | Pass | Pass |
| `--color-positive (#60d394)` | `surface-1 (#121419)` | 9.86:1 | Pass | Pass |
| `--color-positive (#60d394)` | `surface-2 (#181b21)` | 9.23:1 | Pass | Pass |
| `--color-positive (#60d394)` | `surface-3 (#1f232a)` | 8.44:1 | Pass | Pass |
| `--color-negative (#ff6b6b)` | `bg (#0c0d10)` | 7.00:1 | Pass | Pass |
| `--color-negative (#ff6b6b)` | `surface-1 (#121419)` | 6.64:1 | Pass | Pass |
| `--color-negative (#ff6b6b)` | `surface-2 (#181b21)` | 6.22:1 | Pass | Pass |
| `--color-negative (#ff6b6b)` | `surface-3 (#1f232a)` | 5.68:1 | Pass | Pass |
| `--color-info (#67aaf9)` | `bg (#0c0d10)` | 8.05:1 | Pass | Pass |
| `--color-info (#67aaf9)` | `surface-1 (#121419)` | 7.63:1 | Pass | Pass |
| `--color-info (#67aaf9)` | `surface-2 (#181b21)` | 7.14:1 | Pass | Pass |
| `--color-info (#67aaf9)` | `surface-3 (#1f232a)` | 6.53:1 | Pass | Pass |


### Elevation

| Token | Value |
| --- | --- |
| `--shadow-1` | `0 1px 2px rgb(0 0 0 / 40%)` |
| `--shadow-2` | `0 4px 16px rgb(0 0 0 / 35%), inset 0 1px 0 rgb(255 255 255 / 3%)` |
| `--shadow-3` | `0 16px 48px rgb(0 0 0 / 55%), inset 0 1px 0 rgb(255 255 255 / 4%)` |

Panels use surface-1 with no shadow, or `--shadow-1`. Menus and popovers use surface-3 with
`--shadow-2`. Modals and drawers use surface-3 with `--shadow-3` over a scrim of
`rgb(0 0 0 / 55%)` plus `backdrop-filter: blur(4px)`.

### Spacing

`--space-0: 0` · `--space-0-5: 2px` · `--space-1: 4px` · `--space-2: 8px` · `--space-3: 12px` ·
`--space-4: 16px` · `--space-5: 20px` · `--space-6: 24px` · `--space-8: 32px` · `--space-10: 40px` ·
`--space-12: 48px` · `--space-16: 64px`

Standard placements:

| Placement | Value |
| --- | --- |
| Page gutter | `--space-6` (desktop), `--space-4` below 640px |
| Between page sections | `--space-8` |
| Panel padding | `--space-5` (default), `--space-4` (compact or mobile) |
| Stacked fields or items | `--space-3` |
| Inline control groups | `--space-2` |
| Icon to label | `--space-2` (`--space-1-5` = 6px is allowed only inside 28px controls) |
| Table cell | `--space-2` vertical, `--space-3` horizontal. Compact density: `--space-1` / `--space-2`. |

### Radius

`--radius-xs: 4px` (chips, badges, table selection) · `--radius-sm: 6px` (buttons, inputs) ·
`--radius-md: 10px` (cards, panels, menus) · `--radius-lg: 14px` (modals, drawers, the Ask panel)
· `--radius-pill: 999px` (search pill, segmented controls, avatars).

### Sizing

Controls: `--control-sm: 28px`, `--control-md: 32px`, `--control-lg: 40px`. Header: `--header-height:
56px`. Hit targets are at least 32px on desktop and 40px below 640px.

### Typography

Fonts stay as they are (Public Sans for UI text, JetBrains Mono for code; B36 decisions).

| Token | Size / line height | Weight | Use |
| --- | --- | --- | --- |
| `--text-xs` | 12 / 16 | 500 | Badges, table meta, percentile subscripts |
| `--text-sm` | 13 / 18 | 400–500 | Table body, controls, secondary text |
| `--text-md` | 14 / 20 | 400 | Body |
| `--text-lg` | 16 / 24 | 600 | Panel titles |
| `--text-xl` | 20 / 28 | 600 | Section titles |
| `--text-2xl` | 24 / 32 | 600 | Page titles on mobile |
| `--text-3xl` | 32 / 40 | 600 | Page titles on desktop |

Weights are limited to 400, 500 and 600. Tables and every numeric cell use
`font-variant-numeric: tabular-nums`. Letter-spacing is `-0.01em` from `--text-xl` up.

### Z-index

`--z-base: 0` · `--z-sticky: 10` (table headers) · `--z-sticky-corner: 20` (table cells frozen on
both axes, e.g. pinned identity header cells; added 2026-10-08) · `--z-header: 30` · `--z-dropdown: 40` ·
`--z-drawer: 50` · `--z-modal: 60` · `--z-toast: 70` · `--z-tooltip: 80`. Pinned body cells use
`--z-base` inside an isolated scroll region so frozen header rows always paint above them.

## Motion (`dashboard/app/styles/motion.css` + `dashboard/lib/motion.ts`)

| Token | Value | Use |
| --- | --- | --- |
| `--dur-instant` | 80ms | Press feedback |
| `--dur-fast` | 140ms | Hover, color, exits, tooltips |
| `--dur-base` | 200ms | Enters, popovers, tabs, crossfades |
| `--dur-slow` | 320ms | Drawers, modals, page transitions, layout moves |
| `--dur-chart` | 450ms | First chart draw only |
| `--ease-out` | `cubic-bezier(0.22, 1, 0.36, 1)` | Enters and most transitions |
| `--ease-in` | `cubic-bezier(0.4, 0, 1, 1)` | Exits |
| `--ease-in-out` | `cubic-bezier(0.65, 0, 0.35, 1)` | Moves between two resting states |
| spring (JS) | `{ type: "spring", stiffness: 520, damping: 38, mass: 0.9 }` | Small interactive pieces (`lib/motion.ts` exports it) |

Rules:

- Animate only `transform`, `opacity`, `filter: blur()` (overlays only), `background-color`, `color`,
  `box-shadow` and `clip-path`. Never animate width, height, top/left or padding. For height
  changes (accordions, expanding rows), use `grid-template-rows: 0fr → 1fr` or motion `layout`.
- Exits are faster than enters (`--dur-fast` vs. `--dur-base`).
- No UI-response animation runs longer than 320ms, except the first chart draw (450ms).
- Hover-intent: menus open after 80ms of hover and close after 150ms of leave. Clicks open them
  immediately.
- **Reduce motion:** replace the current global `animation: none !important; transition: none
  !important` with a token override: `--dur-*` become `1ms`, except opacity fades, which keep
  `--dur-fast`. All transform-based enters become opacity-only. Spring components read
  `useReducedMotion()` and switch to `{ duration: 0 }`. Skeleton shimmer becomes static.

### Pattern catalogue (every interactive surface maps to one)

| Pattern | Spec |
| --- | --- |
| Hover/press | Background overlay `--color-surface-hover` over `--dur-fast`. Press: `scale(0.98)` over `--dur-instant`. Links: color only. |
| Focus | `--focus-ring` appears over `--dur-fast`. Never removed without a replacement. |
| Enter (content, cards, rows on first load) | opacity 0 → 1 and `translateY(4px)` → 0 over `--dur-base`, `--ease-out`. Lists stagger 20ms per item for at most 8 items, then everything else together. |
| Exit | opacity → 0 over `--dur-fast`, `--ease-in`. |
| Menu, popover, select | `scale(0.97)` plus opacity from the trigger-anchored transform-origin, over `--dur-base`. Exit over `--dur-fast`. |
| Tooltip | opacity plus `translateY(2px)` over `--dur-fast`, 300ms open delay, immediate when moving between tooltips. |
| Drawer / Ask panel | Slides from its edge over `--dur-slow` with `--ease-out`. The scrim fades over `--dur-base`. Mobile bottom sheets use the spring. |
| Modal / command palette | Scrim fade plus panel `scale(0.98)`/opacity over `--dur-base`. Exit over `--dur-fast`. |
| Tabs, segmented controls, nav active item | A sliding indicator (motion `layoutId` or a measured CSS transform) with the spring. Content crossfades over `--dur-base`. |
| Page / route change | Root `template.tsx` enter: opacity plus `translateY(6px)` over `--dur-slow`. Use View Transitions (`experimental.viewTransition` in Next, React `<ViewTransition>`) only if DL02 confirms they're supported in the pinned Next/React versions. Otherwise only the template enter. The header never animates on navigation. |
| Table sort, filter or column change | Rows ≤ 100: motion `layout` reorder over `--dur-slow`. More rows: crossfade the body over `--dur-base`. Columns added or removed: crossfade. The sort arrow rotates over `--dur-fast`. |
| Loading | Skeletons in the final layout's shape (no layout shift), shimmer 1.2s linear. Skeletons crossfade into content over `--dur-base`. A spinner is used only inside buttons. |
| Charts | The first view draws in (line stroke-dash, bar `scaleY` from baseline) over `--dur-chart`. Data changes morph or crossfade over `--dur-base`, with no re-draw from zero. |
| Accordion / expanding row | Grid-rows technique over `--dur-slow`. The chevron rotates over `--dur-fast`. |
| Toast | Slides in from the bottom-right with the spring and auto-dismisses after 5s. Exit is opacity plus `translateY(8px)`. |
| Chat | User bubble enters. Streamed text appends with no per-token animation, though a new paragraph fades in. Step indicator: a pulsing dot (opacity only). Source chips and follow-ups stagger in after `final`. |
| Sticky header on scroll | Background goes from transparent to surface-1 with `backdrop-filter: blur(12px) saturate(140%)` and `--shadow-1` over `--dur-base`. The page never gets a border line. |

## Header (replaces the two-row header)

One 56px row, sticky:

```
[ball-lens CourtLens] [Stats] [Live▾] [Players▾] [Teams▾] [Compare▾] [Research▾]   [🔍 Search players, teams…  ⌘K]   [Ask] [⋯]
```

- **Menus:** keep the existing replica-nav destinations. Dropdowns are surface-3 menu panels with
  the menu pattern. The active section has an accent text color plus a 2px accent underline that
  slides between items (tab indicator pattern).
- **Search pill:** `--radius-pill`, surface-2, no outline at rest, `--color-hairline-strong` on
  hover, focus ring on focus. Clicking it or pressing ⌘K / Ctrl+K / `/` opens the **command
  palette**: a modal centred near the top, built on the existing `global-lookup` search, with
  grouped results (players, teams, pages, recent), arrow-key navigation and Enter to open.
- **Ask:** a ghost button with the accent icon. It opens the AR07 side panel (drawer pattern).
- **The `⋯` menu holds** Settings, Data status, Availability, Help, Patch notes and Methodology.
  The old top-row "Stats · Games" links are removed, since the menus cover them.
- **Below 900px:** logo, search icon (opens the palette full-screen), Ask, and a menu button that
  opens a left drawer with the menus as accordions.
- The header has no bottom border. The scrolled state uses the sticky-header pattern.

## Components (`dashboard/components/ui/`)

DL02 builds these primitives, extending `ui/controls.tsx` and `ui/icon.tsx`. Pages compose them;
page CSS may set layout only (grid/flex placement), never colors, spacing values or radii outside
tokens.

`Button` (primary/secondary/ghost/danger × sm/md/lg, loading state) · `IconButton` · `Input` ·
`SearchField` · `Select` · `Checkbox` · `Switch` · `SegmentedControl` · `Tabs` · `Chip`/`Badge` ·
`Panel` (title, actions, body, compact variant) · `PageHeader` (icon, title, subtitle, actions) ·
`Section` · `Table` primitives (sticky header, hairline rows, hover, selection, density, sort
header, skeleton rows) · `Menu`/`Popover` · `Tooltip` · `Drawer` · `Modal` · `CommandPalette` ·
`Toast` · `Skeleton` · `EmptyState` · `Accordion` · `Presence` (enter/exit wrapper).

## Enforcement

- **Stylelint** (new dev dependency) over `dashboard/**/*.css`: raw colors are banned outside
  `tokens.css`; raw px/rem for `padding`, `margin`, `gap`, `border-radius`, `font-size`,
  `line-height`, `z-index` and `transition-duration` are banned except `0`, `1px` and percentages;
  `transition: all` is banned; `!important` is banned outside `reduced-motion` and `forced-colors`.
- **ESLint** (`no-restricted-syntax`): `style={{…}}` objects may contain only CSS custom-property
  assignments (`{"--col-width": …}`) and computed geometry for charts and virtualization. Imports
  of `motion` / `motion/react` are allowed only from `components/ui/**`, `components/charts/**`
  and the files listed in `lib/motion.ts`.
- **Motion coverage test** (Playwright): on each key page, every visible `button`, `a`, `[role=tab]`,
  `[role=menuitem]` and `input` has a non-zero `transition-duration` (or is inside a motion
  component), and every `[role=menu]`, `[role=dialog]` and `[role=tooltip]` has an enter animation.
- **Visual baselines:** Playwright `toHaveScreenshot` for the key pages at 1440 and 375px
  (mocked API, fonts loaded, animations disabled for capture). Update baselines only in a commit
  that names the reason.
- **`/design`:** a living style guide route, hidden from nav, showing every token, component and
  motion pattern. Agents use it to verify changes.
