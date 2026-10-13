# Stats control uniformity — 2026-10-13

Owner instructions 44–45 and the final layout revision are implemented. The previous flex/wrap
arrangement is retained: presets → **Table Divider** (Photos/Logos/Initials/None) → Add View/Manage.
The stacked presentation-control layout has been removed. Switzer remains the interface font.

Above-table controls share the existing 13px/18px type tokens, weight 500, secondary text color
and 40px outer height. Selected segments use accent text and weight 600. Desktop segmented
buttons are 32px inside 40px containers; phone preset/divider buttons have 40px touch targets.
Through and Window values use `--color-text-secondary` (`#a9afb9`). All adjustments are scoped
to Stats and use the existing spacing, surface and radius tokens.

Real FastAPI/PostgreSQL captures use the 2025–26 regular season through Apr 12, 2026:

- [2048px controls](controls-2048.png) and [full page](stats-2048.png).
- [1440px desktop](stats-1440.png).
- [390px phone](stats-390.png) and [375px phone](stats-375.png).
- [Computed styles and geometry](live-measurements.json).

Measured glance check for this bounded change: the visible label explains the divider modes,
control typography and surfaces are consistent, and actions follow the divider in both reading
and keyboard order. At 2048px and 1440px, presets/divider/actions share one row. At phone widths
they wrap into three rows without horizontal page overflow. Table top is 327.5px at 2048px,
379.5px at 1440px and 467.5px on both phone captures. This verifies the requested controls,
not completion of unrelated Stats data instructions.

Verification: dashboard lint and typecheck pass; Vitest **459/459** and production webpack build
pass. Table-interaction, preview, follow-up and readability/search specs pass **27/27**. The
keyboard-sort fixture starts explicitly with PTS descending before testing its ascending
transition, because default Overview sorting is DPM; its assertions and product sorting are
unchanged. Six visual/picker checks pass with refreshed Stats desktop/phone and affected picker
snapshots, including the concurrently committed season-picker fixes.

Ready for owner review. Only the owner can mark Stats aligned.
