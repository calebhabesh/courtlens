# Career table: Year column hides scrolling values

Owner instruction 50, 2026-10-14. The career table's Year column remained sticky with the correct
stacking order, but hovering a row made its background transparent. The career frame defined
`--table-surface` and `--table-data` without the `--table-row-hover` and `--table-data-hover`
values used by the shared Stats rules. Stats defines those colors inside its frame layout;
the career table uses a different layout.

The fix defines the two hover colors on the career frame, each mixing 6% white with its opaque
base surface. Sticky geometry and stacking order are unchanged.

The [before fixture capture](before.png) shows the bleed. New cases in
`dashboard/e2e/player-career.spec.ts` scroll to two offsets while the Year cell is hovered and
compare its screenshot bytes and bounding box. Both 1440/390 cases failed before the fix and
pass after it. All five career specs pass in both development and production sandboxes.

Live local data: [desktop table](career-1440.png), [phone table](career-390.png),
[desktop page](player-1440.png) and [phone page](player-390.png).
[Browser measurements](browser-verification.json) verify the hovered 2022–23 Year cell retains
an opaque background, identical pixels and position across scroll offsets, with no page overflow.
Scoped glance passes for season readability, row separation and metric clipping at the pinned edge.

Dashboard lint/typecheck, all 525 Vitest tests and production webpack build pass. Runtime checks
use an isolated disk-backed dashboard at 3180 with fixture API or a read-only local-data proxy at
4180. Symlinked dependencies produce the existing standalone-tracing warning, so browser checks
use `next start`; standalone packaging was outside this CSS fix. Task-owned servers and scratch
were removed after verification. Owner visual approval remains pending.
