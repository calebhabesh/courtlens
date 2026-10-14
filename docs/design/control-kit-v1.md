# Control kit v1

Size, variant and state contract for the shared controls built in UC02 of the
[UI consolidation handoff](../ui-consolidation-plan.md). Measured from the live site on
2026-10-14 (13 pages, desktop 1440 px and phone 390 px). The per-page tables and method are in
[the UC01 evidence](../evidence/ui-consolidation/uc01/README.md).

Owner decisions (2026-10-14):

- **Four sizes**, `xs` 28 / `sm` 32 / `md` 36 / `lg` 40. Every measured desktop control already
  sits on one of these heights, so no control changes height by adopting the scale. The plan's
  `sm`/`md`/`lg` becomes four sizes; today's `--control-sm/md/lg` tokens (28/32/40) gain a 36 px
  step.
- **Chevron:** keep the current mirrored offset (instruction 71). No extra optical offset and no
  heavier stroke.

## Sizes

| Size | Height | Phone (≤ 767 px) | Inline padding (text) | Text | Icon | Icon gap | Radius | Today's examples |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `xs` | 28 | 40 | 8 | `--text-xs` 12/16 | 14 | 8 | `--radius-sm` 6 | `ui-button-sm`, Stats footer, "Why?", Data Status actions |
| `sm` | 32 | 40 | 12 | `--text-sm` 13/18 | 16 | 8 | 6 | header Ask/More, Stats phase and preset tabs, favorites icon buttons |
| `md` | 36 | 40 | 12 | 13/18 | 16 | 8 | 6 | Stats toolbar, segmented controls, counting-mode pills, Table settings |
| `lg` | 40 | 40 | 12 | 13/18 | 16 | 8 | 6 | the console: selects, season, date, team, positions, help, legacy `.button` |

- **Height is fixed, not a minimum.** The kit sets `height`, centers content with flex, and uses
  no block padding. Today `ui-button-md` sets `min-height: 32px` plus 8 px block padding, so every
  md button with text renders 34 px (Profile, Play, Export, profile tabs) while its icon-only
  neighbour is 32. Text never wraps (`white-space: nowrap`); a long label truncates or the layout
  gives it room.
- **Icon-only** controls (`IconButton`) are square: width = height, no padding.
- **Chip and Segmented** use a 4 px icon gap and a 4 px (`--radius-xs`) inner radius on segments,
  as today; their outer group radius is 6.
- **Segmented size measures the outer group**, including 4 px inner padding on each side.
  Desktop group/item heights are xs 28/20, sm 32/24, md 36/28 and lg 40/32. Phone groups are
  48 px with 40 px items and 8 px inline item padding. UC01 measured individual legacy items;
  those measurements are not outer-group heights. C13 records the filter-bar item
  change, approved by the owner on 2026-10-14 and applied in UC04; no existing group changes in UC02.
- **Weight:** 500 by default. Console controls (`secondary` at `lg`/`md`) use 600 and
  `--color-text-control` while inactive, which is the Stats/Databallr contrast rule already in
  `stats-explorer.css`. In the kit this is the `console` tone, not a page override. Its rest
  background is `--color-table-lift`; hover mixes 7% white into that background and uses
  `--color-text`. `onBackground` is the ghost tone for text on the page background.
- **Phone:** at ≤ 767 px every size resolves to a 40 px minimum height and width, matching the FO14
  rule in `foundation.css`. Padding, text and icons keep their desktop values, except Segmented
  items, which drop to 8 px padding as today. The trigger stays the viewport width, not
  `pointer: coarse`, so phone baselines do not move and a touch laptop at desktop width keeps desktop
  sizes.

## Components

| Component | Sizes | Notes |
| --- | --- | --- |
| `Button` | xs–lg | Leading `icon`, trailing `iconAfter`; `ButtonLink` renders Next `Link` with `href`, and `ButtonSummary` renders native `<summary>`, sharing the same recipe. |
| `IconButton` | xs–lg | `label` is required and becomes the tooltip and `aria-label`. |
| `IconButtonLink` | xs–lg | Square icon-only Next `Link` (added in UC04 batch 4 for rail shortcuts); `label` as for `IconButton`. |
| `Select` | sm–lg | Native select with the built-in chevron (below). |
| `Segmented` | xs–lg | Generalises `SegmentedControl` and `StatsChoicePills`; the active indicator is `SlidingIndicator`. Radio semantics and roving focus, optional `deferChange` for an expensive owner update. Existing callers migrate in UC04. |
| `MenuTrigger` | xs–lg | Button plus trailing chevron that opens `Menu` or a popover; carries `aria-expanded`. Pass `Menu`/`Popover`'s `renderTrigger` props directly to it (one button, no nested trigger). Covers the date, season and team triggers. |
| `Chip` | xs–lg | `pressed` exposes a toggle (`aria-pressed`); `RemovableChip` provides a trailing remove button centered in its own square hit area. |

An **attached group** (the season stepper: previous, picker, next) is a wrapper that removes the
inner radii and gaps between kit controls of one size. The controls themselves are unchanged.

## Variants

| Variant | Rest | Hover | Use |
| --- | --- | --- | --- |
| `primary` | `--color-accent` fill, `--color-on-accent` text | accent mixed 88% with white | one main action per area |
| `secondary` | `--color-surface-2`, `--color-text` | `--color-surface-3` | console and default actions; `console` tone as above |
| `ghost` | transparent, `--color-text-secondary` | `--color-surface-hover`, `--color-text` | toolbars, table rows, header (on the page background the text is `--color-on-bg-secondary`) |
| `danger` | `--color-surface-2`, `--color-negative` text | negative mixed 15% into surface-2 | destructive actions |

**Selected** (`aria-pressed`, `aria-checked`, `aria-selected` or `aria-current` true) applies to every
variant except `primary`: `--color-accent-soft` fill, `--color-accent` text, a 1 px inset accent ring,
weight 600. This is the Stats style the owner approved during alignment; the legacy solid-accent
`.control-pill.active` moves to it (change C10).

Menu/popover triggers use `data-selected="true"` for a held choice. Expanded describes whether
the panel is open; it does not select the trigger. Triggers do not use `aria-pressed`. Selected
controls keep their accent look while hovered; hover styling skips disabled and selected controls.

UC02 implements these recipes in Tailwind v4 with a `kit:` utility prefix, no preflight, and
source discovery restricted to `components/ui/kit`. `tokens.css` owns every existing value;
`@theme inline reference` maps the tokens without emitting duplicate variables. Sizes and icon
spacing come from props; `className` is for layout only (enforced by the UC03 ratchet).

## States

- **Hover:** variant table above; transition `--dur-fast` `--ease-out` on background and color.
- **Pressed:** `scale(0.98)` over `--dur-instant`.
- **Focus:** `:focus-visible` only, `box-shadow: var(--focus-ring)`, no `outline`. Segmented items
  use an inset 2 px accent ring so the ring stays inside the group. Mouse focus never shows a ring.
- **Disabled:** opacity 0.45, `cursor: not-allowed`, no pointer events. A disabled Segmented option
  leaves the rest of the group usable.
- **Loading:** `aria-busy`, disabled, and the spinner takes the leading icon's slot at the same size.
- **Reduced motion:** durations come from motion tokens, which collapse to 1 ms. The press scale
  and the sliding indicator then land instantly.

## Trailing chevron and icon optics

Kept as instruction 71 left it:

- The Lucide chevron leaves 5 of its 24 units empty on each side. Leading text or a leading icon
  leaves about 2. A trailing chevron in `Button`, `MenuTrigger` and `Chip` therefore moves
  outward by 3/24 of the icon size (`margin-inline-end: calc(size * -3 / 24)`), which mirrors the
  visible left gap.
- `Select` starts with text (about 1 unit), so its chevron moves 4/24 and the end padding shrinks
  by the same amount: `padding-inline-end: calc(--space-8 - size * 4 / 24)`. At `lg` that is 29.33 px,
  with the chevron box 9.33 px from the edge.
- Chevron sizes: 14 in `MenuTrigger`, nav and `Chip`; `Select` keeps 16 (14 at `sm`). Text to the
  chevron box is 4 px. Measured: no select or chevron trigger is off mirror by 1 px or more.

## Mapping

The starting-point count of 53 bespoke classes came from a narrower search. This mapping covers all
110 control-shaped class names in the dashboard CSS. Twenty of them have no TS/TSX reference and
are listed last as dead CSS for UC05.

### Legacy `.button` classes

| Class | Uses | Kit target |
| --- | --- | --- |
| `.button` | ~101 | `Button lg secondary` (C2) |
| `.button-small` | 84 | `Button lg` in page bodies (measured 40 px, C3); `Button xs` in pagination and toolbars (measured 28 px) |
| `.button-primary` | 35 | `variant="primary"` |
| `.button-secondary` | 16 | `variant="secondary"` |
| `.button-quiet` | 5 | `variant="ghost"` |
| `.button-active` | 2 | selected state (`aria-pressed`) |
| `.button-dark` | 4 | no CSS rule exists; drop the class |
| `.control-button-group` | 3 | attached group or plain flex wrapper |

### Bespoke classes → kit

| Kit target | Classes |
| --- | --- |
| `Button` | `stats-help-button` (lg, C5), `stats-footer-button` (xs ghost `dense`), `player-back-button` (xs primary), `views-modal-btn-action` (xs), `finance-detail-button` (xs ghost), `courtlens-ask-btn` (sm ghost, C6), `ui-why-summary` (xs ghost as summary) |
| `IconButton` | `stats-tool-button`, `stats-expand-button` (md ghost); `stats-icon-action`, `stats-details-button`, `player-career-expand` (xs ghost, C9); `ranking-reorder-btn` (xs ghost); `tier-reorder-btn` (xs secondary, it sits on the coloured tier label); `ranking-meta-btn`, `tier-quick-fav-btn` (`Button` xs ghost with an icon, since they carry a label); `ranking-delete-btn`, `tier-remove-btn`, `tier-delete-btn` (xs danger); `modal-close-btn`, `filter-clear-btn`, `lookup-clear-btn` (xs ghost); `courtlens-mobile-toggle`, `courtlens-mobile-search-btn`, `icon-button`, `ui-icon-button` (sm ghost); `context-stepper-button` (lg, attached group) |
| `Select` | `ui-select`, `stats-team-select` |
| `Segmented` | `ui-segmented-item`, `stats-preset-tab` (lg console `dense`), `ui-tab-trigger` (sm, C1), `tier-tab`, `dist-tab`, `player-tab`, `StatsChoicePills` |
| `MenuTrigger` | `ui-menu-trigger`, `ui-popover-trigger` (lg, attached group), `ui-date-trigger` (lg, leading icon), `season-scope-trigger`, `stats-team-button` (lg, C4), `availability-trigger`, `ui-filter-bar-toggle` |
| `Chip` | `control-pill` (sm/md/lg by measured height), `stats-position-chip` (lg), `entity-chip`/`ui-entity-chip` (lg removable), `ranking-chip-btn`, `filter-action-pill`, `season-scope-quick-button`, `glossary-chip` (sm) |

### Does not fit the kit, and why

| Classes | Why | Owner |
| --- | --- | --- |
| `stats-cell-button`, `table-sort-button`, `ui-table-sort-button`, `playoff-table-col-action`, `th-action` | Table cell and header targets take the row's geometry (22–36 px), not a control size. | Table primitive |
| `stats-compare-toggle` | Round 22 px row checkbox. | `Checkbox` |
| `courtlens-nav-dropdown-btn`, `courtlens-nav-item`, `courtlens-dropdown-item`, `courtlens-search-pill` | Header navigation uses an underline active state and a 27.5 px line box; the search pill is a field. | App shell (`header.tsx`) |
| `ui-menu-item`, `ui-command-item`, `lookup-item`, `showcase-roster-item`, `ask-history-item`, `scatter-legend-item`, `ui-swatch-item` | Rows in lists, menus and legends, laid out left-aligned at full width. | `Menu`, `CommandPalette`, list owners |
| `ui-accordion-trigger`, `ui-route-tab` | Full-width disclosure header; route tabs are links with `aria-current`. Both keep their components and reuse the kit's focus and selected tokens. | `Accordion`, `RouteTabs` |
| `feed-link-button` | Inline text action inside a caption (19.5 px line box); a control size would break the sentence. | Prose link style |
| `team-card-button` | A whole card is the link. | Card |
| `roster-chip`, `tier-player-chip` | Draggable roster and tier cards holding a portrait, a link and an inline input or select; not a control (moved here in UC04 batch 4). | Roster Shapes, Tier List |
| `ask-chip`, `agent-source-chip` | Ask follow-up questions, actions and inline citations: model-written labels of any length that wrap onto several lines (a 390 px follow-up measured 46 px), and the citation flows inline inside answer prose. A fixed-height, no-wrap kit control would overflow (moved here in UC04 batch 5). | Ask page and panel |
| `ui-count-chip`, `ui-badge-pill`, `views-modal-metric-chip`, `stats-drawer-team-pill` | Static labels, not controls. | `Badge` |
| `lookup-input`, `ui-input` | Text fields (30/40 px). Field sizes follow the same height scale but are outside UC02. | `Input` |

Not controls (names matched by the search only): `player-season-summary`, `finance-summary`,
`conversation-summary`, `ui-filter-bar-summary`, `dist-summary`, `ui-accordion-item`,
`case-study-guarantee-item`, `team-compare-h2h-score-item`.

**Dead CSS for UC05** (no reference in any `.ts`/`.tsx`): `replica-dropdown-item`, `replica-action`,
`replica-mobile-toggle`, `replica-nav-dropdown-btn`, `playoffs-pill`, `playoffs-pill-button`,
`playoffs-control-item`, `playoffs-capability-item`, `stats-favorite-button`,
`stats-manage-views-btn`, `drawer-close-btn`, `team-compare-swap-btn`, `team-compare-h2h-score-item`,
`system-pill`, `player-action`, `mobile-menu-btn`, `lines-legend-item`, `investigations-action`,
`dist-summary`, `compare-tray-btn`.

## Deliberate changes (owner approval per UC04 batch)

Adopting the spec moves these controls. Each needs before/after screenshots and owner approval
before its baseline is regenerated. Heights are unchanged except C1, C9, C12 and C13.

| # | Change | Where |
| --- | --- | --- |
| C1 | md-with-text 34 → 32 (`sm`) | Recent Games Profile and Export, Showcase Play and Export, profile tabs |
| C2 | Legacy `.button`: padding 16 → 12, text 14 → 13 | Players, Compare, Teams, Team Compare, Similar Players |
| C3 | `.button-small` at 40 px: text 12 → 13 | Compare, Teams, Recent Games, Similar Players actions |
| C4 | Padding 16 → 12 | Stats Select Team, Draft Class trigger |
| C5 | Icon 14 → 16 at `lg` | Stats help buttons, Data details, season stepper, Add View |
| C6 | Header Ask: text 12 → 13, padding 8 → 12 | every page header |
| C7 | ~~Stats footer buttons: padding 4 → 8~~ Dropped 2026-10-14: wraps the footer at 1440; `dense` keeps 4 | Stats footer |
| C8 | ~~Stats preset tabs: padding 8 → 12~~ Dropped 2026-10-14: wraps the view row at 1440; `dense` keeps 8 | Stats, player profile |
| C9 | Row icon actions 26/24 → 28 | Stats details button, profile career expand |
| C10 | Solid-accent `.control-pill.active` → accent outline selected | pages using `pages.css` pills |
| C11 | `MenuTrigger` text-to-chevron gap 8 → 4 | Export, More jobs, Table settings |
| C12 | Phone: wrapped 60 px `button-secondary` → one line at 40 | Similar Players PvP Compare |
| C13 | Filter-bar segmented items 36 → 32 inside a 40 px group with 4 px inner padding; phone items remain 40 inside a 48 px group | Filter-bar `SegmentedControl` callers; proposed in UC02, **approved 2026-10-14**; applied with each filter-bar caller's UC04 batch |

Approved with UC04 batch 1 (Stats, 2026-10-14), beyond the C list: D1 `MenuTrigger` chevron on
Draft Class; D2 no 40 px minimum width on position chips; D3 table tool buttons as `IconButton md
secondary` (no hairline border, text-coloured icons); D4 Counting Mode as one `Segmented md`;
D5 footer selected states use the kit's selected look; D6 phone segmented groups 48 px with 40 px
items on Stats too; D7 Manage Views tabs as `xs` chips; D8 `xs` buttons at weight 500; D9 neutral
hover on compare-tray remove. Details in the progress log.

**`dense`** (`Button`, `ButtonLink`, `ButtonSummary`, `Segmented`): one 4 px step less inline
padding (xs 4, others 8), and abutting `Segmented` items. Use it only where the standard padding
would wrap a measured row (Stats presets and footer).

**`compare-tray-chip`** is a static container (portrait, name, `IconButton` remove), renamed
`compare-tray-item`; it is not a `Chip`.

Open for the owner (no change by default): `Select` uses a 16 px chevron while `MenuTrigger` uses
14, and both sit in the Stats console row.
