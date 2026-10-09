# Stats toolbar refinement — 2026-10-09

Owner request: move Manage Views after the Group guides controls, match its size to the adjacent
selector groups, and use Title Case for the group label.

The button follows the guide controls in DOM and keyboard order. Its minimum height uses
`--control-md` (32px), matching the preset track and guide group. The redundant wrapper left
margin is removed so the row uses its shared 8px gap. The visible label is **Group Guides:**.

## Verification

Playwright against the working-tree dashboard on `localhost:3100` measured:

| Viewport | Presets height | Guide group height | Manage Views height | Order | Document width |
| --- | --- | --- | --- | --- | --- |
| 1440px | 32px | 32px | 32px | After guides | 1440px |
| 2048px | 32px | 32px | 32px | After guides | 2048px |
| 390px | 32px | 32px | 32px | After guides, wrapped below | 390px |

Manage Views opens its dialog and Escape closes it at all three widths. The Title Case label
is visibly rendered at 1440/390px. [Desktop](desktop.png) and [phone](phone.png) screenshots.

Dashboard lint: exit 0, no errors/warnings. Typecheck: exit 0. Vitest: 50 files, 344 tests pass.
`git diff --check` passes. No additional tests were added for this reversible presentation change.

Scoped glance check: controls align vertically on desktop; the button follows the group on phone;
no text clipping or sideways document scroll; the earlier 16px filter-divider clearance remains.
Existing header, data/identity, missing-data, icons, states and date treatments are outside this
repair. This is not full-page FO acceptance or advancement of a plan milestone.
