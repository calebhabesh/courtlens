# Career Highs as a stats-style table

Owner instruction 67, 2026-10-15. Career Highs now uses the Contract table's treatment. Those
styles are now a shared `player-ref-grid` class set: a table-lift frame, 28 px group labels over
40 px column labels, table-well value cells, a pinned and centered lead column, equal fixed
columns, and column-group rules only in the body.

- Phase is the leftmost group label. Its rows read "Regular Season" and "Playoffs".
- Columns are grouped like the career table: **Scoring** (PTS, FGM, 3PM, FTM), **Counting** (REB,
  AST, STL, BLK) and **Other** (MIN, GmSc).
- Values keep their source-game links and tooltips but read as figures (text color), not blue
  links.

Measured at 1440: each group label centers between its middle columns. Scoring is at 462 px
(FGM 404, 3PM 520), Counting at 929 (AST 870, STL 987) and Other at 1278 (MIN 1220, GmSc 1337).
The Contract table re-renders identically after the class rename. There were no page errors,
and the page width equals the viewport at 1440 and 390.

| View | Desktop | Phone |
| --- | --- | --- |
| Career Highs | [1440](career-highs-1440.png) | [390](career-highs-390.png) |
| Contract after the shared-class rename | [1440](contract-unchanged-1440.png) | |

Dashboard lint, typecheck and all 527 Vitest tests pass; the career highs test now checks the
grouped order. The player-reference, player-career and fo14-accessibility Playwright checks also
pass. Owner alignment is still pending.
