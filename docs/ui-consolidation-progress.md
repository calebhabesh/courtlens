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
