# Stats group-guide centering — 2026-10-11

Owner correction: this header-only change did not satisfy the requested visible divider
alignment or center the initials text. Its header measurements remain historical evidence,
not completion of that request. The correction is recorded in
[visible-guide centering evidence](../stats-visible-guide-centering/README.md).

Owner request: center the recurring table guides between Profile, Counting, Defense and
the other metric groups.

The first header tier included each 40px guide column in the following group's `colSpan`.
The real-data table measured a 20px offset between each portrait center and the boundary
of the adjacent group headers. Each guide now has its own decorative header cell; group
headers span only their metrics. Both header tiers and the body retain matching columns.

`geometry.json` records 16 real-data cases: 2048, 1440, 768 and 390px, each with Photos,
Logos, Initials and None. All rendered guides have a 0px offset between adjacent header
groups, all gutters remain 40px, header/body column counts match and there is no page
overflow. Screenshots include desktop, tablet and phone, plus horizontally scrolled
tablet/phone views. The existing readability browser check now also measures group
boundaries, so centering within a body cell alone cannot mask the original error.

Scoped glance review of the captured populated states:

- Header, filters, first-screen result placement and 4px alignment: pass.
- Centering, player/team identity, icon treatment and date presentation: pass.
- Phone page containment and filter collapse: pass; metrics remain internally scrollable.
- Missing/error/loading states were not re-audited for this header-only correction.

Validation:

- Dashboard ESLint/Stylelint and TypeScript: pass, zero lint warnings/errors.
- Production webpack build: pass.
- Vitest: 415 passed across 59 files.
- Stats readability/search, preview and table interactions: 16 browser checks passed
  against an isolated production dashboard and the fixture API.
- Existing Stats desktop/phone screenshot baselines: 2 passed using system Chromium;
  baselines retained unchanged. An older cached headless browser produced font-rendering
  differences; the configured system browser passes both checks.

No earlier milestone or owner visual-acceptance status advances.
