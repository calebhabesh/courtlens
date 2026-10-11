# Native select popup theme correction — 2026-10-11

Owner reported white, unreadable Season and Window dropdowns. Chromium reproduced the exact
symptom; `stats-season-before.png` captures the opened popup before the fix.

The shared Select used a transparent background in both the components and foundation layers,
while its wrapper was dark. Its options also had transparent backgrounds. The browser painted
the native popup white while retaining light text, despite the root's existing dark color scheme.
An isolated browser probe changing the select background to the surface token immediately
rendered readable dark options. The regression test failed for all three selectors before the fix.

Fix: opaque `--color-surface-2` on the shared Select in both layers; explicit surface/text colors
on native options and option groups site-wide, with secondary text for disabled options. Native
selection highlighting, keyboard behavior and high-contrast browser handling are retained.
No JavaScript, data, source, scope or layout changes.

Validation:

- Dashboard ESLint/Stylelint: zero errors/warnings.
- Production webpack build, including TypeScript: pass.
- Vitest: 54 files / 357 tests pass.
- Production browser checks: 82 existing tests pass, including all 66 unchanged page baselines.
- Three new native-popup screenshot/contrast checks pass with a light OS theme, then pass
  6/6 repeated runs. Season/Phase include retained unavailable context so their popups contain
  unselected options without adding fictional source coverage.
- Native popup screenshots are captured once at full viewport size. A clipped or stabilized
  screenshot can close Chromium's native popup and accidentally capture the closed control.
- Six real-data opened-menu captures at 1440px and 390px confirm dark surfaces and readable
  text; `colors.json` records opaque `rgb(24, 27, 33)` surfaces and `rgb(242, 243, 245)` option
  text, contrast 15.53:1, and no page overflow. Phone selectors remain inside the Filters sheet.

Scoped glance review passes for header, aligned filters, first-screen result, spacing, identity,
icons, phone containment and date presentation in the populated captures. Unavailable-context
wording and Escape preserving the selected value are exercised by the new tests. Loading/error
presentation is not re-audited beyond the existing browser suite. Prior milestone/owner visual
acceptance statuses remain unchanged.

Reference: [MDN legacy option styling](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/option#legacy_option_styling)
documents the browser/OS limits on native option colors.
