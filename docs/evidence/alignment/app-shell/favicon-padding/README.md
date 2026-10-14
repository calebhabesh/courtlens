# Favicon lens padding — 2026-10-14

Owner request: add a little more padding around the round lens, which looks pressed against the
favicon edges in the supplied browser-tab screenshot.

The favicon artwork scales from 90% to 82% around the same center. At 16px, the calculated lens
clearance from the top and left canvas edges increases from 1.23px to 1.83px. The only SVG change
is the scale; silver finish, shape, background color and corner radius are retained. Both favicon
copies match, and metadata requests `/icon.svg?v=6`.

- [16/32/64px before and after](comparison.png), visually inspected at native sizes.
- Page context: [1440×900](stats-1440.png), [390×844](stats-390.png).
- [Verification](verification.json), [rerunnable browser verifier](verify.cjs).

Checked with Chromium against the running local dashboard on port 3100, reduced motion enabled.
The served SVG matches the working asset. Both old and new rendered background pixels are opaque
`[21, 50, 90, 255]`, matching the site's `#15325a`. No page errors or horizontal overflow.

Dashboard lint/typecheck and Vitest (76 files, 511 tests) pass. Four existing header browser checks
pass: sticky geometry, keyboard dropdowns, More options and mobile search/drawer. The broader
search-palette check fails waiting for a selected lookup option; a focused rerun times out waiting
for `/api/workspace` during page setup on the active dev server. No application or test logic was
changed to address these unrelated runtime checks. Favicon-specific browser verification passes.

Scoped glance: favicon identity, native-size legibility and more clearance pass. Desktop/phone
page overflow checks pass; page layout, filters, data identity, missing-data presentation, loading
states and dates are outside this SVG-only follow-up. Owner alignment remains pending.
