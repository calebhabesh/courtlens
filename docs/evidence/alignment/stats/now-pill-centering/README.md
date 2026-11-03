# Stats current-team pill alignment

Owner instruction 82, 2026-10-14: center the "now" badge with the neighboring text and dot.

The subtitle groups its team/position text beside the pill in a flex row with centered alignment
and a 4 px gap. The pill cannot shrink. Existing name spacing fits both lines.

Live PostgreSQL data on an isolated development dashboard provided the
[desktop](stats-1440.png) and [phone](stats-390.png) screenshots. The cropped
[desktop card](player-card-1440.png) and [phone card](player-card-390.png) show Kawhi Leonard.
[Browser measurements](browser-verification.json) record a 0 px difference between the vertical
centers of the text span and pill at both widths. Each 18 px pill fits inside its subtitle,
and document widths equal viewport widths. Measurements from the production build with fixture
data also pass at both widths.

Verification:

- Dashboard ESLint/Stylelint and TypeScript pass.
- Vitest: 525 tests across 82 files pass.
- Production webpack build passes. The scratch copy symlinks dependencies, so standalone tracing
  warns about external dependency paths; production browser checks use `next start`. Standalone
  packaging is outside this styling check.
- Existing `stats-team-move` and `stats-team-move-dates` Playwright specs: 6/6 pass, including
  single-team, multi-team and phone cards, dated tooltips and linked player-page controls.
- Scoped glance: aligned subtitle, legible pill, intact outline, sufficient name spacing and
  no page overflow at 1440/390. Owner visual approval remains pending.

The sandbox servers and disk-backed scratch workspace were removed after verification.
