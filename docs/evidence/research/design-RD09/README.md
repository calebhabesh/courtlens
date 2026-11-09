# RD09 Research landing: design evidence

## Menu section headers (owner, 2026-11-09)

"also can you make the drop down section headers more prominent." The Research menu's section headers and the phone drawer's are now bold white
capitals (12 px, weight 700, `--color-text`) instead of `--color-text-tertiary` grey. Gold was avoided because it marks the current page.
Shots from the sandbox build: `menu-headers-1440.png`, `menu-headers-390.png`.

Lint and typecheck clean, Vitest 835, full Playwright 608 passed, 17 skipped, 0 failed. The change is CSS in the site header and touches no data, so the
Draft Classes real-data check was not repeated. :3100 serves the new rule (checked in its CSS chunk).

## Cut, and blue headers (owner, 2026-11-09)

"Yes, cut it. Also, make the menu headers a different colors or a different shade of grey." The page and the menu's Overview group are removed, and
`/research` redirects (307) to Six-Factor RAPM. The Research links on Learning and Patch Notes are removed. Learning's Out-of-Time Testing and
Prospective Scoring topics already cover how models are tested, so nothing moved. Section headers are now `--color-category-2` blue capitals; the
shots above show this final state.

Lint and typecheck clean, Vitest 835, full Playwright 607 passed, 17 skipped, 0 failed (three landing tests removed, two menu tests added). The
real-data check was not run because no data display changed. :3100 serves the new rule (checked in its CSS chunk).
