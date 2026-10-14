# UI consolidation progress

Measured evidence for the [UI consolidation handoff](ui-consolidation-plan.md). Plans and
prose are not runtime verification; each entry records what was run and measured.

## Starting point (2026-10-14)

- Branch `ui-consolidation` from `main` after the Stats/Players alignment checkpoint merged.
- Inventory: ~70 imports of the `components/ui` controls (`Button` 19, `IconButton` 4, `Select` 22,
  `SegmentedControl` 19, `Menu` 8); about 240 raw `<button>`/`<a>` uses of legacy `.button` classes in
  83 files; 53 bespoke control classes in CSS; `components.css` 5,024 lines and `pages.css`
  4,859 lines of 12,698 total; 115 rules targeting `.button`, `.ui-button`, `.ui-select` or
  `.icon-button`.
- UC00 styling-system decision (owner, 2026-10-14): **Tailwind v4**. The owner will keep building
  the project and wants faster development, so the kit is built in Tailwind and controls migrate
  once. Existing `tokens.css` values move into `@theme`; page CSS migrates as each page is touched.

## UC01 — Control spec (2026-10-14)

- Wrote [control kit v1](design/control-kit-v1.md) from measurements of the live local site
  (FastAPI/PostgreSQL through the dev servers, release `23be18f9-…`).
- Measured with `measure-controls.mjs` (Playwright Chromium, dark scheme): 13 pages from the
  Stats 71 survey at 1440x900 and at 390x844 (touch, DPR 2). Excluding 1,300 Stats table-cell
  buttons, 624 desktop and 455 phone controls were measured (box, padding, text, radius,
  colours, gap, ARIA state, icon offsets). Per-page tables, method and data:
  [UC01 evidence](evidence/ui-consolidation/uc01/README.md).
- Findings: every desktop control already uses one of four heights (28/32/36/40) apart from table
  and row targets, the header nav line box and one inline text action. `ui-button-md` renders text
  buttons at 34 px (min-height plus block padding) next to 32 px icon buttons. Phone controls are
  all 40 px except Similar Players' wrapped actions (60 px).
- Owner decisions: **four sizes**, `xs` 28 / `sm` 32 / `md` 36 / `lg` 40 (phone 40 for all), and
  **keep the instruction 71 chevron offset**.
- Mapping: all 110 control-shaped class names in the dashboard CSS. Each maps to `Button`,
  `IconButton`, `Select`, `Segmented`, `MenuTrigger` or `Chip`, or is listed as not fitting the kit
  with its reason (table targets, header nav, list rows, inline text, static badges, inputs). Twenty
  classes have no TS/TSX reference and are recorded as dead CSS for UC05. Legacy `.button-dark` has
  no CSS rule.
- Deliberate changes C1–C12 are listed in the spec. None is applied in UC01; each goes to the owner
  with before/after screenshots in its UC04 batch.
- Verification: docs only, no dashboard code changed, so dashboard lint, typecheck, Vitest and
  Playwright were not run for this block. `tests/unit/test_frozen_identifiers.py` passed (6/6) and
  every relative link in the new docs resolves.

## UC02 — Tailwind control kit (2026-10-14)

- Finished the inherited, uncommitted kit on `ui-consolidation`: `Button`, `ButtonLink`,
  `ButtonSummary`, `IconButton`, native `Select`, `Segmented`, `MenuTrigger`, `Chip` and
  `RemovableChip`, exported from `components/ui/kit`. Existing components and page callers
  stay in place for UC04; the only page addition is the required section at `/design#control-kit`.
- Tailwind and its PostCSS plugin are pinned to **4.3.3**. No preflight. `tokens.css` remains
  the value source; an inline reference theme maps those values without emitting duplicates.
  Utilities are restricted to kit sources and use the **`kit:` prefix**: limiting source scanning
  alone would still generate global classes such as `text-sm` that match unmigrated pages.
  The utilities layer follows foundation so kit geometry/states win over page styles.
- Sizes are fixed 28/32/36/40 px, with 40 px phone targets. Recipes own padding, gaps, variants,
  tones, selected/disabled/focus/press/loading states and mirrored chevron offsets. Console
  tone uses the table-lift surface. Selected triggers use `data-selected`, independently of
  `aria-expanded`. Reduced-motion kit transitions use the 1 ms instant token; the legacy fade
  token remains unchanged. Resetting the native select's inherited minimum height was necessary
  for desktop sm/md sizes to measure 32/36 px.
- `Segmented` has 4 px inner padding, radio semantics, one enabled tab stop, wrapping arrow/Home/
  End focus, disabled options/groups and the compositor `SlidingIndicator`. Optional
  `deferChange` paints the selection before its owner update and cancels pending work on unmount
  or external value change. Its size measures the outer group; phone items retain 40 px targets
  within a 48 px group. Legacy `SegmentedControl`/`StatsChoicePills` callers are not migrated yet.
- `Menu`/`Popover` accept mutually exclusive `trigger` or `renderTrigger` props. The latter
  forwards native click/ARIA props and a callback ref to one `MenuTrigger`, preserving menu
  dismissal and focus restoration without nesting buttons. React's ref rule falsely treats
  forwarding this callback through a render prop as a render-time ref read; two local exceptions
  explain the safe forwarding operation. Other lint contracts remain enabled.
- `/design` shows all four button/icon sizes × four variants × seven states, plus link,
  disclosure, tone, native select, trigger, segmented and chip examples. Hover/press/focus are
  live targets; selected/disabled/loading are rendered together. New desktop/phone captures,
  a repeatable capture script and 387 measured control/group nodes per viewport are in
  [UC02 evidence](evidence/ui-consolidation/uc02/README.md). Both viewports report zero page
  errors and zero horizontal overflow. Captures were visually inspected.
- Updated the spec's implementation API, console tone, selected-trigger rule and outer-group
  sizing. **C13 remains pending owner approval for UC04**: filter-bar segmented items 36 → 32
  inside a 40 px group, phone items still 40 inside 48. The
  [desktop](evidence/ui-consolidation/uc02/c13-1440.png) and
  [phone](evidence/ui-consolidation/uc02/c13-390.png) comparisons are review evidence only;
  no existing page or baseline adopts C13.
- Final verification: dashboard ESLint/Stylelint **PASS, zero errors/warnings**; typecheck
  **PASS**; Vitest **75 files / 480 tests PASS** (17 new kit tests); complete Playwright suite
  **459 PASS / 27 opt-in real-service skips / zero failures**, including four new kit tests,
  92 visual-baseline tests and 22 other PC12 screenshot-spec tests. Existing baselines and
  tolerances are unchanged. Frozen-identifier tests **6 PASS**; diff whitespace and relative
  doc links **PASS**. The chart showcase test now waits for the existing streamed-page helper;
  the new press-state assertion waits for its 1 ms transition to settle.
- Browser/build work ran on isolated 3180/4180 ports in a disk-backed sandbox under
  `~/.cache/courtlens-tmp`; dependencies and historical evidence were copied. Final browser log
  is retained in the UC02 evidence. Scratch servers/browser contexts stopped and the sandbox
  was removed. The owner's 3100 dashboard and 8000 API were left running. **UC03 has not started.**

## C13 approval (2026-10-14)

- The owner approved C13 (filter-bar segmented items 36 → 32 inside an unchanged 40 px group with
  4 px inner padding; phone items stay 40 inside 48), on the agent's recommendation from the
  [desktop](evidence/ui-consolidation/uc02/c13-1440.png) and
  [phone](evidence/ui-consolidation/uc02/c13-390.png) comparisons. Outer group height is unchanged,
  so no row layout moves. Each UC04 batch applies C13 to its filter-bar `SegmentedControl` callers
  and regenerates only the affected baselines, listing them in its entry.


## UC03 — Lint ratchet (2026-10-14)

- `dashboard/eslint/control-kit.mjs` adds a local `control-kit` ESLint plugin with three rules:
  - `no-control-class`: the 8 legacy `.button*` classes and 55 bespoke control classes from the
    control kit v1 mapping are errors in any `className`/`*ClassName` value (literals, template
    text, `cx` arguments and object keys) outside `components/ui`. Ratchet
    `PENDING_CONTROL_CLASS` starts at **82 files / 428 hits**; classes listed as not fitting the kit
    (table cells, nav, menu rows, badges, inputs) are not banned.
  - `kit-layout-only`: a kit component's `className` may not carry `kit:` size, padding, gap,
    type, colour, radius, ring, shadow, opacity or scale utilities.
  - `kit-tokens`: the Stylelint value contracts applied to `kit:` utilities: no hex/rgb/hsl,
    no raw px (except 0/1) or rem in padding, margin, gap, radius, text or leading, no numeric
    z-index, no `transition-all`, no numeric durations, no `!important`. Stylelint stays for the
    remaining vanilla CSS, so together they replace its contracts for Tailwind (UC00).
- The kit itself had three hits: the Select chevron optics used raw `14px`/`16px`. They now use new
  `--kit-chevron-sm`/`--kit-chevron` tokens with the same values, so geometry is unchanged.
- `.stylelintrc.json` adds `selector-disallowed-list` for `.ui-button`, `.ui-icon-button`,
  `.ui-select`, `.ui-segmented*`, `.ui-*-trigger`, `.ui-chip`, `.ui-entity-chip`,
  `.ui-filter-bar-toggle`, `.ui-why-summary` (with suffixes) and `[data-kit]`. The ratchet override
  starts at **6 files / 145 selectors**: components.css 43, foundation.css 61, stats-explorer.css 26,
  pages.css 13, presentation-clarity.css 1, table-presentation.css 1. Wrapper classes stay allowed.
- `eslint/control-kit.test.ts` (30 tests) covers each rule's valid/invalid cases and both
  ratchets: neither list may grow past its start, and every listed file must still violate, so a
  migrated file has to leave the list.
- Verification: dashboard ESLint/Stylelint **PASS, zero errors/warnings**; typecheck **PASS**;
  Vitest **76 files / 510 tests PASS**; full Playwright in a disk-backed sandbox on 3180/4180
  **458 PASS / 27 opt-in skips / 1 failure**: `roster-shapes.spec.ts:108` hit a strict-mode
  duplicate `.roster-team` while a streamed copy was still loading (no UC03 code on that page).
  Rerun of that spec with `--repeat-each=3`: **21/21 PASS**. Visual baselines unchanged.
  Frozen identifiers **6 PASS**; `git diff --check` **PASS**.

## UC04 batch 1 — Stats (2026-10-14)

**Owner approved 2026-10-14:** C1–C5, C9, C10 and D1–D9 as listed; C7 and C8 dropped from the
spec. `stats-phone.png` regenerated after approval. Evidence: [UC04 Stats evidence](evidence/ui-consolidation/uc04-stats/README.md).

- **Files (13 leave the ratchet, 82 → 69):** `workbench-player-explorer`, `stats-page-controls`,
  `stats-preview-rail`, `stats-detail-drawer`, `stats-feed-ui`, `stats-workspace`,
  `stats-glossary-view`, `tracking-stats-view`, `manage-views-modal`, `hotkeys-modal`,
  `compare-tray`, `scatter-plot-view`, `multi-player-lines-view`. `StatsChoicePills` stays for the
  career table (batch 3). `ContextBar` and `SeasonScopePicker` serve 17 pages and move with
  batch 2.
- **Kit changes:** `dense` on `Button`/`ButtonLink`/`ButtonSummary` (one 4 px padding step less)
  and on `Segmented` (also abutting items), so the preset row and footer keep their widths;
  `IconButton filled`; a UC02 bug fixed where `Segmented`'s console tone lost its text colour to
  the default tone's (two colour utilities resolved by stylesheet order).
- **CSS removed:** 59 dead rules or selectors across `stats-explorer.css` (64,138 → 56,794 bytes),
  `stats-glossary.css`, `components.css` and `pages.css`. Layout that lived on control classes
  moved to wrappers (`stats-expand-action`, `stats-row-pin`, `filter-clear-slot`,
  `filter-action-slot`, `stats-footer-group.is-single`), because kit utilities outrank page CSS.
- **Semantics:** presets (`tablist`/`tab`) and Table Divider/Counting Mode (`group`/`button`) are
  now `radiogroup`/`radio` with arrow-key selection. Four e2e specs updated; the FO14 phone
  preset-clipping check now targets the radios instead of a class that no longer exists.
- **Spec changes applied:** C1 (drawer research links 34 → 32), C2 (legacy buttons: padding
  16 → 12; the drawer's Close is now surface-2 on a surface-2 footer), C3 (Hotkeys "Got it" text
  12 → 13), C4 (Select Team, Draft Class padding 16 → 12), C5 (help row, Add View, Manage icons
  14 → 16), C9 (row and preview-rail icon actions → 28 × 28), C10 (glossary chips solid accent →
  accent outline; also padding 16 → 12, text 14 → 13).
- **Not applied:** C7 (footer padding 4 → 8) and C8 (preset padding 8 → 12). Each wraps its row at
  1440 px (measured: footer expand control drops a line; Add View/Manage drop a line and the table
  moves down 48 px). `dense` keeps today's widths.
- **New changes for review:**
  - D1 Draft Class gains the `MenuTrigger` chevron (+8 px).
  - D2 The "C" position chip is 33 px wide, not 40 (the kit has no minimum width).
  - D3 Table tool buttons lose their 1 px hairline border and accent icons (white icons on the
    same fill); Filters with active filters shows the full selected look.
  - D4 Counting Mode: five separate 36 px pills → one 36 px segmented group with 28 px items;
    inactive text secondary 500 instead of control 600.
  - D5 Footer: the current density, open Filters and expanded state show accent fill + ring
    instead of accent text; scroll buttons' kbd-to-icon gap 4 → 8; density buttons size to
    content. Disabled First Page now dims.
  - D6 Phone: preset and divider groups 40 → 48 with 40 px items (the C13 phone rule); Counting
    Mode fits one line, so the table starts 20 px higher.
  - D7 Manage Views: text tabs → filled `xs` chips; close 30 × 22 → 28 × 28. On phone, Create View
    and Hotkeys "Got it" fit one 40 px line instead of wrapping to 46.
  - D8 Stats `xs` buttons: weight 600 → 500.
  - D9 Compare tray remove: hover turns neutral instead of red.
- **Verification:** ESLint/Stylelint **PASS, zero errors/warnings**; typecheck **PASS**; Vitest
  **76 files / 510 tests PASS**; full Playwright against the 3180 fixture build **457 PASS /
  27 opt-in skips / 2 failures**: `stats-phone.png` (4% of pixels, pending approval) and
  `fo13-pages.spec.ts:112` (strict-mode duplicate while a streamed copy loads; planner code
  unchanged). `fo13-pages.spec.ts` with `--repeat-each=5`: 34/35 pass, the one failure the same
  duplicate on a different planner test, so the flake predates this batch. The desktop Stats baseline passes within its 1% tolerance.
- **After approval:** `stats-phone-linux.png` regenerated (only that baseline). Re-verified in the
  sandbox: lint, typecheck, Vitest 510 PASS; full Playwright **458 PASS / 27 skips / 1 failure**,
  the known Roster Shapes streamed-duplicate flake (`advanced-research.spec.ts:62`), which passes
  15/15 with `--repeat-each=3`.
