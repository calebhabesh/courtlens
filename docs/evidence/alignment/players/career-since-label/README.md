# Career-since label

Known gap from the 2026-10-15 approval, fixed the same day at the owner's request. In the career
table's gold total row, "Career since 2025-26" (shown when a player's CourtLens data starts after
their debut) was one unbroken line that overflowed the pinned Year column and ran into the GP
value. The label now wraps inside the column and keeps the season unbroken ("2025-26" never
splits at its hyphen).

Fixture player 23 measurements: at 1440 the text ends at 126 px and the cell at 156 px (two
lines). At 390 the text ends at 74 px and the cell at 116 px (three lines). The GP value starts
after the cell edge at both widths.

| Desktop | Phone |
| --- | --- |
| [1440](career-since-1440.png) | [390](career-since-390.png) |

Lint, typecheck and all 527 Vitest tests pass, along with 101 Playwright checks: all 92 visual
baselines plus player-career and player-reference. The `player-profile-*` baselines were
refreshed to include the fix.
