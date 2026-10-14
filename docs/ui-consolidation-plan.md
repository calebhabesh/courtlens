# UI consolidation handoff

Started 2026-10-14 on branch `ui-consolidation`, after the Stats and Players alignment
checkpoint merged into `main`. It runs **between** alignment pages: when it closes, page-by-page
alignment resumes on `databallr-alignment` on top of the kit.

## Why

Stats alignment took 71 owner instructions, and many were control polish: uneven padding,
chevron spacing, console colours, button heights, hover rules that lost to a cascade layer.
These keep recurring because one visual control is built several ways:

- the `components/ui` kit (`Button`, `IconButton`, `Select`, `SegmentedControl`, `Menu`) has
  about 70 imports;
- about 240 raw `<button>`/`<a>` elements in 83 files use the legacy `.button` classes
  (`button-primary`, `button-small`, `button-active`, …);
- 53 bespoke control classes (`.stats-tool-button`, `.control-pill`, `.season-scope-trigger`,
  `.stats-team-button`, `.playoffs-pill`, `.ranking-chip`, …) restyle buttons per page;
- `components.css` (5,024 lines) and `pages.css` (4,859 lines) hold most of the 12,700 lines of
  CSS, with 115 rules across layers that target `.button`, `.ui-button` or `.ui-select`.

Each new page then re-solves sizing, icon spacing and states. The goal is one kit with fixed
sizes, so alignment pages mostly arrange existing pieces.

## Scope and precedence

- **Supersedes** the alignment handoff only for how shared controls are implemented and where
  CSS lives. It adds no new pages and does not change layout or presentation.
- **Keeps** every analytical, temporal, identity, data and source contract, Design Language v1's
  lint-enforced mechanics, and every owner instruction already recorded in the
  [alignment catalog](databallr-alignment-catalog.md).
- **Visual parity is the bar.** Existing Playwright visual baselines must pass unchanged. A
  deliberate change (for example unifying two near-identical heights) is listed in the block's
  progress entry with before/after screenshots, and the owner approves it before the baseline
  is regenerated.
- Do not start new alignment instructions on this branch. An owner instruction that arrives
  during consolidation is recorded in the catalog and done after UC06.

## UC00 — Styling system (owner decision, blocks UC02)

Choose before UC02 starts, so controls migrate once:

- **Vanilla CSS:** extend `components/ui`, one CSS file per component, keep the current
  Stylelint/ESLint contracts.
- **Tailwind v4:** move the existing `tokens.css` values into `@theme`, build the kit with
  utilities, and replace the Stylelint contracts with equivalent lint rules. Page CSS
  migrates as each page is touched. Update the stack line in `AGENTS.md`.

Record the decision and the date here and in the progress log.

**Decided 2026-10-14: Tailwind v4.** The owner will keep building the project and wants to move
faster. UC02 builds the kit in Tailwind, and UC03 replaces the Stylelint contracts with
equivalent rules. `AGENTS.md` names Tailwind for new dashboard styling.

## Blocks

Execute in order. Each block ends with dashboard lint, typecheck, Vitest, the full Playwright
suite (in a disk-backed sandbox when port 3100 is busy) and a progress-log entry with measured
evidence.

### UC01 — Control spec

Write `docs/design/control-kit-v1.md` from measurements of the current site:

- Sizes `sm` / `md` / `lg` (height, horizontal padding, text size, icon size, icon gap) and their
  phone (coarse-pointer) sizes. Today's de facto sizes are 36 px toolbar, 40 px console and
  32 px compact search on desktop, and 40 px on phone.
- Variants: primary, secondary (console), ghost, danger; active/pressed; disabled; loading.
- States: hover, pressed, `:focus-visible` only (no mouse focus ring), reduced motion.
- Trailing chevron and icon optics: keep the current site-wide chevron offset (instruction 71);
  the owner's pending choice of an extra optical offset or a heavier chevron goes here.
- Map each of the 53 bespoke classes and the legacy `.button*` classes to a kit component and
  size. List anything that does not fit, and why.

Evidence: a measured table per page (13 pages from the control-padding check) and the mapping.

### UC02 — Kit

Build or extend in `components/ui/`, each with its own CSS file:

- `Button`, `IconButton` (tooltip label required), `Select` (built-in chevron offset),
  `Segmented` (generalises `SegmentedControl` and `StatsChoicePills`, with the compositor
  `SlidingIndicator`), `MenuTrigger` (button + chevron that opens `Menu`/popover), `Chip`
  (toggle and removable).
- Sizes and icon spacing come only from props; no `className` that changes size.
- Vitest per component; a section on `/design` that shows every size × variant × state.

### UC03 — Lint ratchet

- ESLint: raw `<button>`/`<a>` with a `button`, `control-pill` or bespoke control class outside
  `components/ui` is an error, with a ratchet list of files not yet migrated (same pattern as
  `PENDING_NATIVE_DATE`). Files are removed from the list as they migrate; nothing is added.
- Stylelint: page and feature CSS may not select kit classes (`.ui-button`, `.ui-select`,
  `.ui-chip`, …) or set `height`/`padding` on them. Layout (margin, grid placement) stays
  allowed through wrapper classes.

### UC04 — Migration

Migrate in batches. Each batch empties its files from the ratchet and deletes the CSS it no
longer needs:

1. Stats (largest bespoke set: tool, team, help, footer, compare and position controls).
2. App shell and header.
3. Players and the player drawer.
4. Compare, Teams, WOWY and the remaining catalogued pages.
5. CourtLens-only pages (`/forecasts`, `/evaluation`, `/investigations`, `/data-status`,
   `/settings`, `/planner`, `/design`).

### UC05 — CSS split

Split `components.css` and `pages.css` into files colocated with their component or route.
Preserve the `tokens, base, motion, components, pages, foundation` layer order. Remove rules
nothing references (measure bytes before and after). Visual baselines must pass unchanged.

### UC06 — Close

Ratchet lists are empty, `components.css`/`pages.css` are gone or reduced to shared layout, and
Design Language gains a controls section that points to `control-kit-v1.md`. Update
`AGENTS.md`, merge to `main` through a PR with CI green, and resume alignment on
`databallr-alignment` (rebased or merged onto the new `main`).

## Out of scope

Visual redesign, new controls nobody asked for, alignment instructions, and the deferred Stats
data follow-ups (catalog 43f/43g).
