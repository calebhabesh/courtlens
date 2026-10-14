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
- UC00 styling-system decision: **pending owner**.
