# CourtLens design language v1.3

Owner-confirmed direction (2026-10-07): smooth and modern, no stiff or abrupt changes, no bright
outline borders. Use this contract for every dashboard change after DL01 lands. The block plan and
order are in [courtlens-refresh-plan.md](../courtlens-refresh-plan.md).

**v1.1 (2026-10-09, FO06):** adds the page system from the
[frontend overhaul](../frontend-overhaul-plan.md): page templates, page anatomy (header, filter bar,
missing-data and technical-detail patterns), identity and date rules, the Board patterns the owner
approved at gate 2 (Player Showcase, Roster Shapes, search), the glance test, and new lint and
screenshot enforcement. The header section now describes the shipped FO02/FO06 header. Tokens,
motion and icon rules are unchanged. The file keeps its `-v1` name so existing links still work.

**v1.2 (2026-10-11, PC03):** adds the semantic chart palettes and reusable SVG kit from
[presentation clarity](../presentation-clarity-plan.md). Revises D21: per-metric difference chips
use the leading subject's identity color, respecting the catalog's lower-is-better flags. Existing
analytical definitions, temporal cutoffs and hashes are unchanged. The file keeps its `-v1` name.

**v1.3 (2026-10-14, UC06):** adds the [Controls](#controls-ui-consolidation) section from the
[UI consolidation](../ui-consolidation-plan.md): one control kit with four fixed sizes, built in
Tailwind v4, specified in [control kit v1](control-kit-v1.md) and enforced by lint with no
exemptions. The legacy `Button`/`IconButton`, `SegmentedControl`, `ChipGroup` and `EntityChip`
primitives are gone. Tokens, motion, chart and page rules are unchanged.

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
| `--color-bg` | `#15325a` | Page background: a darker, muted take on the NBA-logo blue (`#01408b`, same hue). v1.3, owner 2026-10-13 |
| `--color-surface-0` | `#0e1013` | Inset black: tooltips, wells and fact grids inside containers (never the page) |
| `--color-surface-1` | `#15171b` | Header, panels, cards |
| `--color-surface-2` | `#1c1f24` | Raised elements: inputs, table header, hovered rows, menus |
| `--color-surface-3` | `#24282e` | Popovers, modals, drawers, selected rows |
| `--color-surface-hover` | `rgb(255 255 255 / 4%)` | Hover overlay on any surface |
| `--color-surface-press` | `rgb(255 255 255 / 7%)` | Pressed overlay |
| `--color-hairline` | `rgb(255 255 255 / 6%)` | Table row dividers, list separators |
| `--color-hairline-strong` | `rgb(255 255 255 / 10%)` | Input outline at rest (optional), grouped controls |
| `--color-text` | `#f2f3f5` | Primary text |
| `--color-text-secondary` | `#a9afb9` | Labels, secondary text |
| `--color-text-tertiary` | `#858b95` | Placeholders, disabled text. Never for essential text below 18px. |
| `--color-on-bg-secondary` / `--color-on-bg-tertiary` | `#c9d3e6` / `#b4c2dc` | Secondary/tertiary text placed directly on the blue page background (nav, field labels, page notes). `--color-text-secondary/-tertiary` are for container surfaces only. |
| `--color-accent` | `#ffd166` | Active nav, primary action, focus |
| `--color-accent-soft` | `rgb(255 209 102 / 12%)` | Selected chip/tab background |
| `--color-on-accent` | `#0e1013` | Text on the accent |
| `--color-brand` | `#ff7a2f` | Logo only |
| `--color-positive` / `--color-negative` / `--color-info` | `#60d394` / `#ff6b6b` / `#67aaf9` | Data semantics |
| `--focus-ring` | `0 0 0 2px var(--color-surface-0), 0 0 0 4px var(--color-accent)` | All focusable elements (`:focus-visible`) |

The page backdrop uses a static, repeating coaching-board motif (owner, 2026-10-14): thin X's
and O's in `#b4c2dc` at 4% stroke opacity, on a 384 px tile. Marks are approximately 18 px across
and spaced roughly 192 px apart. The SVG is applied only to the app shell's blue background;
table, card, menu and sticky-filter surfaces retain their own fills. It has no animation, overlay
element or interaction, and is disabled in forced-colors mode. `app/shell.css` owns the shell;
`public/patterns/coach-marks.svg` owns the motif geometry and stroke.

All text and surface pairs used for essential text must meet WCAG AA (4.5:1, or 3:1 at 18px+).
DL01 verified this with `scripts/verify-contrast.py`; v1.3 (blue background) re-measured ratios:

| Text Token | Surface | Contrast Ratio | WCAG AA Normal (4.5:1) | WCAG AA Large (3:1) |
| --- | --- | --- | --- | --- |
| `--color-on-accent (#0e1013)` | `--color-accent (#ffd166)` | 13.21:1 | Pass | Pass |
| `--color-text (#f2f3f5)` | `bg (#15325a)` | 11.56:1 | Pass | Pass |
| `--color-on-bg-secondary (#c9d3e6)` | `bg (#15325a)` | 8.52:1 | Pass | Pass |
| `--color-on-bg-tertiary (#b4c2dc)` | `bg (#15325a)` | 7.15:1 | Pass | Pass |
| `--color-accent (#ffd166)` | `bg (#15325a)` | 8.90:1 | Pass | Pass |
| `--color-text (#f2f3f5)` | `surface-0 (#0e1013)` | 17.16:1 | Pass | Pass |
| `--color-text (#f2f3f5)` | `surface-1 (#15171b)` | 16.16:1 | Pass | Pass |
| `--color-text (#f2f3f5)` | `surface-2 (#1c1f24)` | 14.88:1 | Pass | Pass |
| `--color-text (#f2f3f5)` | `surface-3 (#24282e)` | 13.34:1 | Pass | Pass |
| `--color-text-secondary (#a9afb9)` | `surface-0 (#0e1013)` | 8.64:1 | Pass | Pass |
| `--color-text-secondary (#a9afb9)` | `surface-1 (#15171b)` | 8.13:1 | Pass | Pass |
| `--color-text-secondary (#a9afb9)` | `surface-2 (#1c1f24)` | 7.49:1 | Pass | Pass |
| `--color-text-secondary (#a9afb9)` | `surface-3 (#24282e)` | 6.71:1 | Pass | Pass |
| `--color-text-tertiary (#858b95)` | `surface-0 (#0e1013)` | 5.56:1 | Pass | Pass |
| `--color-text-tertiary (#858b95)` | `surface-1 (#15171b)` | 5.23:1 | Pass | Pass |
| `--color-text-tertiary (#858b95)` | `surface-2 (#1c1f24)` | 4.82:1 | Pass | Pass |
| `--color-text-tertiary (#858b95)` | `surface-3 (#24282e)` | 4.32:1 | N/A (non-essential / >=18px) | Pass |
| `--color-accent (#ffd166)` | `surface-0 (#0e1013)` | 13.21:1 | Pass | Pass |
| `--color-accent (#ffd166)` | `surface-1 (#15171b)` | 12.45:1 | Pass | Pass |
| `--color-accent (#ffd166)` | `surface-2 (#1c1f24)` | 11.46:1 | Pass | Pass |
| `--color-accent (#ffd166)` | `surface-3 (#24282e)` | 10.27:1 | Pass | Pass |
| `--color-positive (#60d394)` | `surface-0 (#0e1013)` | 10.20:1 | Pass | Pass |
| `--color-positive (#60d394)` | `surface-1 (#15171b)` | 9.61:1 | Pass | Pass |
| `--color-positive (#60d394)` | `surface-2 (#1c1f24)` | 8.85:1 | Pass | Pass |
| `--color-positive (#60d394)` | `surface-3 (#24282e)` | 7.93:1 | Pass | Pass |
| `--color-negative (#ff6b6b)` | `surface-0 (#0e1013)` | 6.87:1 | Pass | Pass |
| `--color-negative (#ff6b6b)` | `surface-1 (#15171b)` | 6.47:1 | Pass | Pass |
| `--color-negative (#ff6b6b)` | `surface-2 (#1c1f24)` | 5.95:1 | Pass | Pass |
| `--color-negative (#ff6b6b)` | `surface-3 (#24282e)` | 5.34:1 | Pass | Pass |
| `--color-info (#67aaf9)` | `surface-0 (#0e1013)` | 7.89:1 | Pass | Pass |
| `--color-info (#67aaf9)` | `surface-1 (#15171b)` | 7.43:1 | Pass | Pass |
| `--color-info (#67aaf9)` | `surface-2 (#1c1f24)` | 6.84:1 | Pass | Pass |
| `--color-info (#67aaf9)` | `surface-3 (#24282e)` | 6.13:1 | Pass | Pass |


### Chart color semantics (v1.2, PC03)

| Tokens | Values | Meaning |
| --- | --- | --- |
| `--color-identity-a` / `--color-identity-b` | `#ffd166` / `#80bfff` | Subject A / B; no good/bad meaning |
| `--color-identity-a-soft` / `--color-identity-b-soft` | 12% of the corresponding identity color | Identity backgrounds |
| `--color-percentile-1` … `-5` | `#172d43`, `#20415e`, `#2b567c`, `#386b96`, `#3e729b` | Increasing already-oriented percentile, five bands of 20; 100 uses band 5 |
| `--color-category-1` … `-6` | `#ffd166`, `#80bfff`, `#c5a3ff`, `#79d4c6`, `#f6a5c0`, `#d0d788` | Labeled categories such as archetypes; no rank |
| `--color-status-guaranteed` | `#80bfff` | Guaranteed contract |
| `--color-status-reported` | `#d0d788` | Reported salary without an option marker; guarantee state unknown (PC08) |
| `--color-status-player-option` | `#c5a3ff` | Player option |
| `--color-status-team-option` | `#79d4c6` | Team option |
| `--color-status-two-way` | `#f6a5c0` | Two-way contract |
| `--color-status-projected` | `#ffd166` | Projected amount/status |
| `--color-status-unknown` / `--color-status-unknown-soft` | `#a9afb9` / 10% | Unknown: hatch/mute, label and em dash; never zero |

Colors encode one declared meaning per view. Legends and direct labels explain every encoding;
exact values remain readable without color. Category palettes above six groups repeat only with an
additional shape/dash identity. Team colors remain identity decoration (headshots, logos, team
chips and card borders), never analytical encodings. Positive/negative tokens remain available for
explicit signed change and gauge status, but percentile rank and Compare never use red/green.

`components/charts/contrast.test.ts` measures palette text on all four surfaces (AA 4.5:1), text on
each percentile band, and monotonic blue luminance from the actual token file. New chip/status
backgrounds use 12% tint over surface-1; composed colors are checked in the PC03 browser evidence.

### Chart kit and revised Compare rule (v1.2, PC03)

Geometry only: exact pinned `d3-shape` 3.2.0, `d3-hierarchy` 3.1.2, `d3-sankey` 0.12.3 and
`d3-scale` 4.0.2. React renders the SVG; no D3 DOM selection, transition system or chart library.

`components/charts/` exports:

- `DeltaChip`: magnitude of a per-metric difference in the leading subject's A/B color. The
  existing catalog `good_direction='low'` is the lower-is-better flag for TOV/PF, including per-game
  and per-36 variants; `comparisonFlags` exposes `lowerIsBetter` without duplicating metadata.
  `high` selects the larger value; `low` selects the smaller value. A tie, missing value or undeclared
  direction stays neutral. The visible chip says “fewer” for lower-is-better; accessible text names
  the subject. **No overall verdict, composite score or winner label.**
- `PairedBars` (PC12 B): A/B bars share a zero-based scale per metric; signed values keep their
  zero baseline. Names, exact values and endpoints remain visible; unknown has no geometry.
  Optional catalog-direction difference chips describe one metric only. Fixed domains support
  observed interval coverage against a declared nominal target.
- `ReliabilityPlot` (PC12 B): measured nonempty probability bins, predicted mean against observed
  rate. Circles/squares supplement A/B color; labeled diagonal and axes; no bin interpolation or
  invented uncertainty. Selection bins remain selection evidence, not final-test performance.
- `ValueBar`: signed value against a visible zero baseline, explicit scale endpoints and clipping
  disclosure. Unknown gets no bar; an observed zero remains an observed zero.
- `ThresholdBar`: known total against individually labeled thresholds; nearby markers retain
  separate labels below the bar. Missing amounts are excluded and disclosed.
- `Donut`: shares of known nonnegative values, direct labels, exact amounts and unknown count.
  More than six nonzero slices use labeled share bars; zero/unknown totals get no invented area.
- `Sankey`: cloned inputs, validated acyclic references and nonnegative flows; exact link table.
  Below 768px it renders stacked bars by stage. Missing edges stay in the table as Unknown and
  have no flow geometry.
- `TimelineGrid`: labeled status colors, hatched absent/unknown cells, sticky name column and
  keyboard-scrollable table region. A real zero is distinct from an unknown amount. PC08 adds an
  opt-in `absent="not-listed"`: a period with no cell renders a neutral "Not listed" cell (legend
  entry included) for sources that list nothing after a contract ends; a supplied cell with a null
  value stays hatched Unknown. The default remains hatched Unknown.
- `PercentileCell`: supplied **already-oriented** cohort percentile; no client rank calculation.
  The caller supplies cohort and qualification. Unqualified values say “Small sample” and are muted.
  PC12 A implements C10's qualification in the server ([table percentiles v1](table-percentiles-v1.md)):
  500 season minutes through the cutoff, league ranks independent of display filters. Compact
  tables keep a numeric muted percentile and a player-level Small sample badge; Stats' preview
  uses the same reference. The primitive never infers qualification.
- `ShapePack`: positive nonnegative area, labeled categories and solid/dashed/dotted fit outlines,
  full item list including zero/unknown values. An optional capacity leaves unused space. Negative
  signed impact is rejected: PC10 must declare its sizing transform. PC10's Wyman presentation
  credits @taylormetrics; this primitive is not an impact model or a roster fit computation.
- `RankedBars` (PC11): labeled rows on one shared signed scale with an explicit zero baseline and
  formatted end labels. Order is the caller's (a rank or a fixed category order). Unknown values
  keep their row with no bar; `muted` rows (small samples) use the unknown status color and say so
  in their accessible name. One measure per chart in the identity-A tone, like `ValueBar`. Below
  768px the label column narrows; rows never scroll sideways.

Every chart takes a title, source and sample label, plus optional note/state/action. States show
skeleton, one-line empty/error and a useful caller-provided action. Initial SVG and data changes
fade to final values using motion tokens; values never interpolate or redraw through zero.
Reduced motion collapses chart transitions to 1ms. Dynamic styles use typed `--chart-*` properties.
`/design` shows all eight components and their ready/loading/empty/error and data-change behavior
with **explicitly illustrative geometry inputs**, never synthetic NBA estimates. SVG/PNG exports
resolve token attributes before leaving the page's CSS cascade.

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

Controls: four kit sizes, `xs` 28 / `sm` 32 / `md` 36 / `lg` 40 px (`--control-sm`, `--control-md`,
`--kit-control-md`, `--control-lg`); every control is 40 px on phones. Header: `--header-height:
56px`. Hit targets are at least 32px on desktop and 40px below 640px. See [Controls](#controls-ui-consolidation).

### Typography

Switzer is the UI font (owner-selected trial, 2026-10-13); JetBrains Mono is the code font.
The original Switzer variable file is self-hosted and acquired with a pinned SHA-256 during
dashboard setup/dev/build. Its default lining digits have equal advance widths; retain
`tabular-nums` on numeric cells. The CourtLens wordmark remains its separate Red Hat Display artwork.

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

## Header

One 56px sticky row (`components/ui/header.tsx`, nav items from `lib/nav-model.ts`):

```
[CourtLens] [Stats] [Live] [Players] [Teams] [Compare] [Research]      [Search players, teams…  ⌘K]      [Ask] [⋯]
```

- **Menus:** dropdowns are surface-3 menu panels (menu pattern). The active section has accent text
  plus a 2px accent underline that slides between items (tab indicator pattern). Menus are grouped
  to the FO07 route targets.
- **Search pill (D8):** `--radius-pill`, surface-2, no outline at rest, `--color-hairline-strong` on
  hover, focus ring on focus, at most 380px wide. **Placement:** the row is a three-track grid
  `minmax(max-content, 1fr) · minmax(0, 380px) · minmax(max-content, 1fr)`. The pill is centred on
  the page whenever the nav leaves room (measured: exact at 1024 and from about 1740px up) and
  otherwise sits as close to the centre as the nav allows (1280–1440: just right of the nav). It
  never overlaps the nav or the actions. There is no second search icon on desktop.
- **Search modal:** the pill, ⌘K / Ctrl+K or `/` opens one modal about 640px wide, near the top,
  over a full-page dim. Results are grouped Players (headshot + team logo), Teams (logo), Pages and
  Recent, with arrow-key navigation, Enter to open and focus returned to the trigger. Below 768px
  the header shows a search icon and the modal is full screen.
- **Ask:** a ghost button with the accent icon; it opens the Ask side panel (drawer pattern).
- **`⋯` menu:** Settings, Data Status, Methodology, What's New and Planner. Schedule was hidden in FO13 (owner decision) and `/schedule` redirects to Live.
- **Below 1280px** the nav and `⋯` collapse into a hamburger that opens a left drawer with the
  menus as accordions. The drawer is readable (its scrim sits below its panel), traps focus and
  closes on Escape.
- **Overlays** (search modal, drawers, modals, the Filters sheet) render at `document.body` through
  `OverlayPortal`, so a blurred sticky header never becomes their containing block.
- The header has no bottom border; the scrolled state uses the sticky-header pattern.

## Components (`dashboard/components/ui/`)

DL02 built these primitives around `ui/icon.tsx`; the controls among them are now the kit in
`components/ui/kit` ([Controls](#controls-ui-consolidation)). Pages compose them; page CSS may set
layout only (grid/flex placement), never colors, spacing values or radii outside tokens.

Kit controls (`Button`, `IconButton`, `Select`, `Segmented`, `MenuTrigger`, `Chip`, …) · `Input` ·
`SearchField` · `Select` (the shared wrapper, drawn by the kit) · `Checkbox` · `Switch` · `Tabs`
(underline section navigation) · `Badge` ·
`Panel` (title, actions, body, compact variant) · `PageHeader` (icon, title, subtitle, actions) ·
`Section` · `Table` primitives (sticky header, hairline rows, hover, selection, density, sort
header, skeleton rows) · `Menu`/`Popover` · `Tooltip` · `Drawer` · `Modal` · `CommandPalette` ·
`Toast` · `Skeleton` · `EmptyState` · `Accordion` · `Presence` (enter/exit wrapper).

Added by the frontend overhaul (FO01–FO06), all shown on `/design`:

`PageShell` + `BoardLayout` / `ProfileLayout` / `CompareLayout` / `ResearchLayout` ·
`FilterBar` (scope, filters, modes, count, details) and `ContextBar` (the scope controls wired to
the URL) · `Field` · `DatePicker` + `lib/format-date.ts` · `GatedNote` ·
`DataDetails` / `DataDetailsButton` · `PlayerIdentity` / `TeamIdentity` ·
`StatTile` · `TemplateSkeleton` · `OverlayPortal` · `useAdvancedMode` (`lib/advanced-mode.ts`).
Page-level building blocks approved at gate 2: `TeamGrid` (also on `/design`) and `ShowcaseCard`
(covered by the Showcase screenshot baseline).

The `foundation` CSS layer comes after `pages`, so page CSS cannot restyle a primitive. A primitive's
defaults must already be right; change the primitive, not the page. Component and page CSS lives in
files next to the component or route that owns it, imported from `app/globals.css` in cascade order
inside its layer (UC05).

## Controls (UI consolidation)

Every button, icon button, select, segmented group, menu trigger and chip is a control-kit
component from `dashboard/components/ui/kit`, specified in [control kit v1](control-kit-v1.md): sizes,
variants (primary, secondary, ghost, danger), tones (`console` for the Stats workspace,
`onBackground` for the header), states, chevron optics and the mapping of every former class.

- **Sizes come from props only.** `xs` 28 / `sm` 32 / `md` 36 / `lg` 40 px; phones get 40 px targets.
  A kit component's `className` is for layout (margin, grid or flex placement), never size, colour or
  type.
- **Placement defaults.** Shared controls take their size and tone from where they sit through
  `ControlScope` (`components/ui/control-scope.tsx`): filter bars and `Field` provide `lg`, the Stats
  workspace the console tone, the phone Filters sheet `fill`. An explicit prop wins.
- **Menus and popovers** take one kit control through `renderTrigger`.
- **Not controls:** table cells, header and section navigation (`RouteTabs`, `Tabs`), list rows,
  cards (roster, tier, entity), wrapping Ask chips and inline citations keep their own components;
  the spec lists each and why.
- **Styling:** the kit is built with Tailwind v4 utilities under the `kit:` prefix in the
  `utilities` layer, after `foundation`, so page CSS cannot override a control's size or states.

## Pages (v1.1)

### Templates (D22)

Every page uses exactly one template through `<PageShell template=…>`: the five of D22 plus Article.

| Template | Body | Pages |
| --- | --- | --- |
| **Explorer** | Filter bar, then one dense table (sticky header, first column fixed on phones) with an optional preview rail | Stats, Rankings, Team Stats, Players directory |
| **Profile** | `ProfileLayout`: hero (large headshot or logo, team color, `StatTile` row), tabs, tab body | Player and team pages |
| **Compare** | `CompareLayout`: one entity header per side, then one row per stat with a bar per side and percentile chips. Per-metric difference chip in the leading subject’s A/B identity color, with catalog direction; no winner, verdict or composite score (D21, PC03) | Player, Team, Matchups, WOWY |
| **Board** | `BoardLayout`: one main surface (card, board, date strip) plus an optional 320px rail; one column below 1280px | Player Showcase, Roster Shapes, Tier List, Live |
| **Research** | `ResearchLayout`: a key-findings row leads, then charts and tables; method notes go to Data details | RAPM, Shooting, Trends, Distributions, Forecasts, Evaluation, Data Status and the rest of Research |
| **Article** (FO13, owner decision 2026-10-09) | `ArticleLayout`: a 200px table of contents ("On this page", sticky under the header) beside one readable column of at most 720px; each `ArticleSection` is an anchored `h2`. A section marked `wide` (a definitions table) uses the full body width | Settings, Methodology (+ Learning), What's New |

**Article rules.** Article pages have no filter bar: nothing on them is scoped by season, phase or
date. The header and, on merged pages, the route tabs come first; the contents and first section
start right below. The contents mark the section being read (`aria-current="location"`) and are
omitted when a page has one section. Below 1024px the contents become one horizontally scrolling
row of 40px pills above the column (pills, not tabs, because route tabs may sit directly above).
Settings lists configuration a person can change first (Display, Assistant, History and privacy,
Player portraits, Install), then read-only service state (Background worker, Sources and terms).
Labelled settings and facts use `.ui-article-facts` (label left, value right; stacked on phones).
Dates in original content are shown with `formatDate` at render; the source text is unchanged.

### Anatomy

Top to bottom, every page is: `PageHeader` → filter bar → main result. Nothing else comes before
the main result except at most one one-line `GatedNote`.

- **Page header (D7):** a Title Case title that matches the nav label exactly, at most one subtitle
  line (it truncates with an ellipsis rather than wrap), and the page's main actions right-aligned
  on the title row (they wrap under the title only below 768px). Disclaimers never go here.
- **Filter bar (D6):** one sticky bar directly under the header. Slots, left to right:
  - `scope`: Season · Phase · Through, plus Window only where results depend on it. The Live board
    is the one exception: its scope is the slate date (Live ignores season and phase; Finals adds
    Season · Phase and takes its cutoff from the date, with any explicit cutoff in Data details);
  - `filters`: page-specific filters (chips or segmented controls) after a hairline;
  - `modes`: controls that change **what the page shows** rather than which data is in scope
    (Showcase Focus, Roster Shapes Observed/Projected);
  - `count`: a coverage chip ("591 players");
  - `details`: the Data details button.
  Every control is 38–40px tall, changes apply immediately and sync to the URL, and there is never a
  "Load …" button or a release-ID input. **Below 768px** scope and filters collapse into a
  "Filters" button that opens a bottom sheet, while `modes` stay visible as a full-width row under
  it (gate 2 decision); long mode labels wrap to two lines instead of clipping.
- **Fixed scope (FO12):** a page with nothing to choose (a sealed report, a frozen protocol, a
  calculator) still shows the bar, with a one-line scope label in `scope`, so Data details and the
  count chip keep their position; it passes `collapsible={false}`, so phones keep the label inline
  instead of a "Filters" sheet with no control in it.
- **One player (FO12, after FO09):** a page about one player puts a single 40px `PlayerLookup` in
  `filters`; its placeholder names the current player ("Target: Bam Adebayo" on Trends, matching Similar Players; "Player: …" elsewhere) and the player's
  headshot appears with the result, not in a separate picker row above it.
- **Spacing after the bar:** the first element after the filter bar starts at least `--space-4`
  below the bar's hairline, so the hairline never reads as a border on the next row (gate 2
  finding on Stats; fixed by the Stats divider correction and re-measured in FO13).

### Missing data and technical detail (D4, D5, D14)

- **`GatedNote`:** missing or gated data in the main flow is one plain line, an optional single
  action ("Change team", "Retry", a jump to the nearest date with games) and a **Why?** disclosure.
  No multi-line notice boxes in the main flow. Unknown is stated as unknown (em dash, "13 blank"),
  never as zero.
- **Why?** holds limitations and contract-required caveat wording, which stays in the DOM while
  collapsed (D14). It never holds IDs, hashes or code-like rules.
- **Data details** (drawer) holds release, dataset and snapshot IDs, hashes, the exclusive cutoff
  rule (`game_date < …`), source routes, API source warnings and resolved context JSON. Pages add
  their own rows through `ContextBar detailRows`. Settings → **Advanced mode** may reveal raw fields
  inline for power users; read it only through `useAdvancedMode`.
- **States:** loading renders a skeleton of the final layout (`TemplateSkeleton`, or skeletons of
  the page's own surfaces); empty and error states are one line with a useful action.

### Identity (D10)

- A player shown as a primary subject has a headshot with a team-logo badge and team-color accent
  (`PlayerIdentity`); a missing photo shows initials on the team color.
- Every team abbreviation in a header or chip has a 16–20px logo; team headers use `TeamIdentity`.
- Headshots appear in search results, the compare tray, roster chips and depth-chart chips.
  **Dense tables get logos only, no headshots**, except where the existing group-guide rules place
  portraits.
- Team logos and headshots are content, not icons.

### Dates and numbers (D11, D20)

- One display format through `formatDate`: "Apr 12, 2026"; compact "Apr 12" in date strips.
- Scope is shown as "Through Apr 12, 2026". The exclusive rule behind it (`game_date <
  2026-04-13`) appears only in Data details. Cards and exports use one context line:
  "2025-26 Regular Season · Through Apr 12, 2026" (`scopeContextLine`).
- Dates are picked with `DatePicker`, which can disable dates with no data; native date inputs are
  not used (lint).
- Numbers are right-aligned with tabular digits. Percentiles follow the Stats orientation helper
  (`lib/percentile-display.ts`).

### Board patterns approved at gate 2

- **Showcase card (FO04):** the card and its playback controls (Previous · Play · Next and "n / N")
  are centred on the board column (measured ±2px) and fit one screen at 1440×900. Each stat shows
  value, rank and a percentile bar. Exports produce the same card as the screen.
- **Logo-grid picker (FO05):** `TeamGrid`: all 30 logos with tricode and name plus a name/tricode
  filter; inline when nothing is chosen, otherwise in a modal (6 × 5 at desktop, no scrolling). The
  choice lives in the URL.
- **Depth chart (FO05):** an Unassigned pool across the top (everyone starts there), then the five
  position lanes as equal columns; each lane shows count, minutes, share % and a share bar
  (`role="meter"`). Chips carry a headshot, name and minutes.
- **Moving items between lists:** drag and drop **plus** a per-item menu ("Move to PG · Point
  guard") that works by keyboard. A moved item remounts, so focus is restored to its menu button in
  the new list. Touch uses the menu.
- **Target gauges:** a bar against a fixed target (240 team minutes): amber (`--color-accent`)
  under, red (`--color-negative`) over, green (`--color-positive`) on target, with the gap and the
  count of blanks in words.

### Section tabs and the Live board (FO07, FO08)

- **Section tabs (`RouteTabs`):** a merged page is one title with link tabs under the header, each
  tab its own URL (the first at the page's path, the rest at sub-paths) so redirects, sharing and
  views that rewrite their own URL keep the tab. Tabs carry the scope (and the player where both
  tabs use one), are 40px tall and read as secondary when their source is unavailable. Pages whose
  sections share a path and differ by query (Live · Finals) pass the selected tab explicitly.
- **Live board (D19):** title "Live" with Live · Finals · Playoffs tabs; the Live menu lists the
  same three. Live and Finals keep the slate date between them.
- **Date strip:** 15 days centred on the slate (Today labelled), each with a weekday, a compact date
  and a game-count badge from the release's retained schedule (Live) or admitted finals (Finals).
  Zero-count days are dimmed but stay clickable so their empty state and jumps are reachable; an
  unknown count shows no badge. Chevrons move the window by a week.
- **Empty slate:** one `GatedNote` line ("No games on Oct 8.") with jumps to the nearest earlier and
  later dates that have games; the contract wording ("No games in the observed source slate", the
  admitted-finals coverage note) sits behind Why?. A slate that has not been observed is "Awaiting
  a cached slate.", never "0 games".
- **Game cards:** away team first, each row a logo (only through a verified canonical ID; unmapped
  source teams get initials, never a guessed logo), name and a right-aligned tabular score (em dash
  when missing). The status and an Eastern tipoff time sit on the meta row; an unknown tipoff is
  omitted visually and stated in the card's accessible name.

### Breakpoints (D25)

Desktop ≥1280px is the main target, then tablet 768px and phone 390px. Below 1280px: hamburger
nav, Board pages stack into one column. Below 768px: the filter bar collapses (modes stay),
page-header actions wrap under the title, tables scroll sideways with the first column fixed, touch
targets are at least 40px, and the page never scrolls sideways.

### Glance test

A page is `verified` only when its 1440×900 and 390×844 screenshots pass all ten items; record
pass/fail per item in the block evidence.

1. **Header:** Title Case title matching the nav label; at most one subtitle line; actions on the
   title row.
2. **Filters:** one filter bar in the shared position; no "Load" button; controls 38–40px with
   labels aligned; no overlapping icons or clipped text; selected states visible without hovering.
3. **First screen:** the main result starts within the first 400px at 1440×900, with no paragraph
   longer than one line and no notice box before it.
4. **Alignment:** 4px grid; shared left edges; centred things centred (±2px measured); numbers
   right-aligned with tabular digits.
5. **Identity:** primary-subject players have headshots; team abbreviations in headers and chips
   have logos; dense tables follow D10.
6. **Missing data:** at most one line in the main flow plus Why?; no UUIDs, hashes or code-like
   rules outside Data details unless Advanced mode is on.
7. **Icons:** wrapper Lucide only; no emoji or arrow characters; one size per context.
8. **States:** loading skeleton of the final layout; one-line empty and error states with an action.
9. **Phone:** no sideways page scroll; filter bar collapses to "Filters"; touch targets ≥40px.
10. **Dates:** one display format ("Apr 12, 2026"; compact "Apr 12" in date strips).


## Icons (D26, FO03)

- **Source:** Lucide only, always through `components/ui/icon.tsx` (`<Icon name=… />`). Add a
  missing glyph to the wrapper's map; never import `lucide-react` elsewhere.
- **No text-character icons:** no arrows (→ ← ⇄), check marks (✓ ✕), stars (★ ☆), triangles
  (▲ ▼ ◀ ▶), shapes or emoji used as icons. Links and buttons carry no decorative arrows
  ("Recent Games Log", not "Recent Games Log →"). Back links use the `left` chevron icon.
- **Sizes:** 14px inline or in dense controls (`sm` buttons, badges, table headers, menu rows),
  16px by default (`md` buttons, inputs), 20px in page headers, empty states and `lg` controls.
  The `IconSize` type allows only these three. Use one size per context.
- **Stroke and color:** one stroke width (2). Color follows the surrounding text
  (`currentColor`). Accent color only for active or selected states. No multicolor icons.
  `filled` is allowed only for the active state of an outline glyph, such as a favorited star.
- **Spacing and accessibility:** `--space-2` between icon and label, centred on the label. The
  icon is `aria-hidden`; an icon-only button needs an `aria-label`. When a glyph carried meaning
  (current season, advantage, favorite), add `sr-only` text.
- **Not icons:** team logos, headshots and the CourtLens mark are content. Characters that encode
  data or name a direction in prose (chart legend marker shapes, SVG axis labels such as "Older
  games (←)", "○ made") stay as text with an `eslint-disable` comment that states the reason.

## Enforcement

- **Control kit (UC03, closed in UC04):** ESLint `control-kit/no-control-class` rejects the legacy
  and bespoke control classes outside `components/ui`; `control-kit/kit-layout-only` keeps size,
  spacing, type and colour utilities off a kit component's `className`; `control-kit/kit-tokens`
  applies the value rules below to `kit:` utilities. Stylelint's `selector-disallowed-list` stops page
  CSS selecting kit classes or `[data-kit]`. No file is exempt, and tests keep it that way.
- **Stylelint** (new dev dependency) over `dashboard/**/*.css`: raw colors are banned outside
  `tokens.css`; raw px/rem for `padding`, `margin`, `gap`, `border-radius`, `font-size`,
  `line-height`, `z-index` and `transition-duration` are banned except `0`, `1px` and percentages;
  `transition: all` is banned; `!important` is banned outside `reduced-motion` and `forced-colors`.
- **ESLint, icons (D26):** `no-restricted-imports` bans `lucide-react` outside
  `components/ui/icon.tsx`. `no-restricted-syntax` bans characters in U+2190–21FF, U+25A0–25FF,
  U+2600–27BF, U+2B00–2BFF and emoji (U+1F000–1FAFF) in JSX text, string literals and template
  strings. Ranges, not a list, so new emoji are caught. Tests and e2e specs are exempt.
- **ESLint** (`no-restricted-syntax`): `style={{…}}` objects may contain only CSS custom-property
  assignments (`{"--col-width": …}`) and computed geometry for charts and virtualization. Imports
  of `motion` / `motion/react` are allowed only from `components/ui/**`, `components/charts/**`
  and the files listed in `lib/motion.ts`.
- **Motion coverage test** (Playwright): on each key page, every visible `button`, `a`, `[role=tab]`,
  `[role=menuitem]` and `input` has a non-zero `transition-duration` (or is inside a motion
  component), and every `[role=menu]`, `[role=dialog]` and `[role=tooltip]` has an enter animation.
- **ESLint, page patterns (v1.1):** `no-restricted-syntax` bans native `<input type="date">`
  (use `DatePicker`) and raw `<h1>` (page titles come from `PageHeader`; `components/ui/panel.tsx`
  is the only exception). Files not yet rebuilt are listed in `PENDING_NATIVE_DATE` and
  `PENDING_RAW_TITLE` in `dashboard/eslint.config.mjs`, each tagged with the FO block that removes
  them. These lists only shrink; adding a file is not allowed. After FO14 both lists are empty,
  including the shared header on the 404 page. The inline-style selector also checks objects
  nested in conditional expressions and type assertions; floating lookup geometry uses typed
  CSS custom properties. A named generic `div`, `span` or `p` needs an explicit accessible role;
  unavailable StatTiles use screen-reader text beside a decorative em dash.
- **Visual baselines:** `dashboard/e2e/visual-baselines.spec.ts` captures Player Showcase, the
  Roster Shapes picker and depth chart, the search modal and `/design` at 1440×900 and 390×844
  against the mock API, with a fixed empty workspace, fonts and visible images loaded, animations
  disabled and the caret hidden (`maxDiffPixelRatio` 0.01). Baselines live in
  `e2e/visual-baselines.spec.ts-snapshots/` and are generated from a production build
  (`next build` + `next start`), the same as the suite runs. Update a baseline only in a commit that
  names the reason; each later FO block adds its pages.
- **Glance test:** measured per block with a `scripts/capture_fo*_evidence.cjs` script and recorded
  in the block's evidence README (see Pages → Glance test). Lint passing is necessary, not
  sufficient.
- **`/design`:** a living style guide route, hidden from nav, showing every token, component and
  motion pattern. Agents use it to verify changes.
