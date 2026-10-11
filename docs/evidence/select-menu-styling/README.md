# Select menus aligned with navigation menus — 2026-10-11

Owner requested that form dropdowns match the main navigation menus. Standard single selects
now use `appearance: base-select` where supported, preserving native selection, labels, form
values and events. No component JavaScript or data/query implementation changed.

The picker shares navigation tokens: surface-3, radius-md (10px), shadow-2, 6% hairline,
4px panel padding and a 4px anchor gap. Rows have 40px minimum height, 8px/12px padding,
radius-sm and the fixed 13px type scale. Hover/focus use the surface-hover token; selection
uses gold text and accent-soft fill. The existing Lucide chevron rotates on opening.
Browser top-layer placement keeps the popup above the Filters drawer, with viewport-aware
position fallbacks and a scrollable maximum height. Multiple/list selects retain their native
rendering. Browsers without base-select support keep the earlier dark, readable native popup.

Fifteen real-data opened-menu captures cover Season, Phase and Window at 1440×900, 768×900,
390×844, 375×812 and 844×390. `geometry.json` records 40px rows, contained popup rows and
zero sideways page overflow for every capture. Desktop and phone screenshots were visually
inspected; the phone picker remains readable above the Filters sheet.

Validation:

- Dashboard ESLint/Stylelint: zero errors/warnings.
- Production webpack build and TypeScript: pass.
- Vitest: 54 files / 357 tests pass.
- Existing production browser checks: 82 pass, including all 66 unchanged page baselines.
- Updated opened-picker contrast/screenshot checks plus keyboard/Escape/outside dismissal
  and phone touch selection: 5 pass on the final production build; production popup baselines
  refreshed for the requested visual change, then checked again without updating.
- Reduced-motion browser probe initially caught a 140ms transform enter; the final picker
  and chevron collapse to 1ms under the preference, verified by the phone test.

Scoped glance review: title/subtitle, filter alignment, first-screen console, spacing, identity,
icons, phone containment, option legibility and date presentation pass in populated captures.
Unavailable-context handling is preserved by the browser tests. Loading/error visuals were
not re-audited beyond the existing suite. Prior milestone and owner-acceptance statuses remain
unchanged; prior evidence directories are retained.

[Chrome's customizable select documentation](https://developer.chrome.com/blog/a-customizable-select)
describes native JavaScript compatibility and browser support; unsupported browsers use the fallback.
