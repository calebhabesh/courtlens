# UC04 batch 1 (Stats) evidence

Captured 2026-10-14 against fixture builds: `before` is commit `bc5f86b` (UC03) on port 3181,
`after` is the migrated working tree on port 3180, both on the fixture API (4180) in disk-backed
sandboxes. Chromium, dark theme, reduced motion, 1440×900 desktop and 390×844 phone (touch).
The owner's 3100 dashboard and 8000 API were not used.

- [`measure-stats.mjs`](measure-stats.mjs) opens 13 desktop and 11 phone Stats states (default,
  pinned preview, filters, team dialog, detail drawer, totals, scatter, lines, Manage Views,
  Hotkeys, compare tray, glossary, tracking) and records every control's box, padding, type,
  colours, border, shadow, state and icon geometry. Every state reports zero page errors and zero
  horizontal overflow, before and after.
- [`before.json`](before.json), [`after.json`](after.json): the two runs.
  [`diff-controls.mjs`](diff-controls.mjs) compares them control by control;
  [`control-diff.txt`](control-diff.txt) is its output.
- Desktop rows do not move: apart from the 1 px row-action shift, no control on any desktop
  state changes its vertical position. On phone the content below Counting Mode moves up 20 px
  because the mode group now fits one line.

## Review images (before above or left, after below or right)

| Image | Shows |
| --- | --- |
| [stats-console-1440.png](stats-console-1440.png) | Help row, scope row, presets, divider, view actions, table toolbar |
| [stats-footer-1440.png](stats-footer-1440.png) | Table footer controls and pagination |
| [stats-390.png](stats-390.png) | Phone first screen |
| [stats-details-1440.png](stats-details-1440.png) | Player detail drawer |
| [stats-preview-pinned-1440.png](stats-preview-pinned-1440.png) | Preview rail actions |
| [stats-glossary-1440.png](stats-glossary-1440.png) | Glossary category chips |
| [stats-manage-views-1440.png](stats-manage-views-1440.png) | Manage Views modal |
| [stats-compare-tray-1440.png](stats-compare-tray-1440.png) | Selected Players tray |
| [stats-scatter-1440.png](stats-scatter-1440.png) | Scatter export buttons and toggles |
