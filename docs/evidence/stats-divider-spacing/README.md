# Stats divider and spacing correction — 2026-10-11

Owner request: remove the divider between the Season / Phase / Through / Window selectors
and the Stats console, and make the spacing uniform.

Stats-only CSS removes the filter bar's bottom hairline and vertical padding, retaining its
40px control height. Header → selectors, selectors → preset row and preset row → console
each have a 16px gap. Shared-control overrides live in the foundation layer so they win the
documented cascade. Preset control groups retain their existing 8px internal gap.

Real-data screenshots and browser measurements at 1440×900, 768×900 and 390×844 are
in this directory. `geometry.json` records a 0px border, 0px bar padding, three 16px gaps,
40px visible filter buttons and no page overflow at all three widths. Console tops are
254px, 346px and 362px respectively.

Scoped glance review: header/subtitle, aligned filters, first-screen console, uniform gaps,
existing player/team imagery, icon treatment, phone containment and date presentation pass
in the captured populated states. Loading/error/missing-data states were not re-audited for
this CSS correction; existing mobile filter/search/detail and preview tests pass. No earlier
milestone or owner visual-acceptance status advances.

Validation:

- Dashboard ESLint and Stylelint: pass, zero errors/warnings.
- Production webpack build, including TypeScript: pass.
- Existing Stats readability/search and preview browser tests: 10 passed.
- Stats desktop/phone production screenshot baselines refreshed for this spacing correction.
