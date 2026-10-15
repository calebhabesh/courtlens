# Compare honors and menu context

Owner instructions 57 and 58, 2026-10-15. Season honors show recorded badges or a dash.
The "Pending" placeholder and award-cutoff footer are removed from the card and SVG export.
Screen readers distinguish an unavailable source from no honors recorded in the selected scope.
Award eligibility still uses the existing cutoff rules.

The counting menu's season and career headings use the darker `--color-surface-1` background
and semibold text. They remain plain labels within named groups. Clicking a heading keeps the
menu open, and arrow navigation skips headings and disabled choices.

Live evidence uses Giannis Antetokounmpo and Shai Gilgeous-Alexander in 2020-21 through
May 17, 2021, matching the owner's example. Giannis has an All-Star badge; Shai has a dash.
The February 1 cutoff has two dashes, with no empty-state paragraph. The reference data remains
distinct from an unknown source, which the browser fixture also exercises.

| Capture | Desktop | Phone |
| --- | --- | --- |
| Honors | [1440](honors-1440.png) | [390](honors-390.png) |
| Shaded menu headings | [1440](counting-menu-1440.png) | [390](counting-menu-390.png) |
| Both sides empty | [1440](empty-honors-1440.png) | [390](empty-honors-390.png) |
| SVG export | [1440](honors-export-1440.svg) | [390](honors-export-390.svg) |

[Measurements](measurements.json) show exact honor and numeric-column alignment: 595.5 and
844.5 px on desktop, 113 and 277 px on phone. Horizontal page overflow is zero. Heading fill is
`rgb(21, 23, 27)` against the menu's `rgb(36, 40, 46)`. Heading text contrast is 8.13:1.
The counting trigger keeps its 160 px width and coordinates after clicking a heading.
No browser page errors occurred.

Verification used a production webpack sandbox at 3180, the browser fixture on 4180, then a
read-only proxy to the owner's API for live captures. Owner ports were left running.

- Dashboard lint and typecheck pass with no errors or warnings.
- Vitest: 544 tests across 84 files pass.
- Compare browser checks: 14 pass, one skips because the fixture catalog has only one season.
- Presentation defaults and export checks: 11 pass.
- Compare desktop and phone visual baselines: four pass, with no baseline updates.
- Production build and the live [verification script](verify.cjs) pass.

The first browser run passed the honors checks but failed two coordinate assertions after a
new Playwright label click scrolled the page. Keyboard and label semantics are now checked
after the mode-change coordinate assertions, preserving that layout check. Direct pointer
clicks in the live script also preserve the trigger coordinates.
Logs: [initial run](browser-initial.log), [Compare rerun](compare-browser.log),
[visuals](visual.log), [build](build.log).

The scoped glance test passes at 1440×900 and 390×844:

| Item | Result |
| --- | --- |
| Header | Pass. Existing title, one subtitle line, and actions retained. |
| Filters | Pass. Selected context remains visible; menu headings differ from choices. |
| First screen | Pass. Desktop comparison begins at y=214. |
| Alignment | Pass. Honors match both value-column centers exactly. |
| Identity | Pass. Both season portraits and team logos remain visible. |
| Missing data | Pass. Empty honors use one dash per player with source-aware accessible text. |
| Icons | Pass. Existing shared icons retained. |
| States | Pass. Earned badges, one empty side, two empty sides, and unavailable source checked. |
| Phone | Pass. No horizontal overflow; counting trigger is 40 px tall. |
| Dates | Pass. Existing May 17, 2021 display remains. |

Instructions 57 and 58 are ready for owner review. Instruction 48 remains pending, and only
the owner marks the page aligned.
