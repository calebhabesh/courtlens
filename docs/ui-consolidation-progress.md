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
