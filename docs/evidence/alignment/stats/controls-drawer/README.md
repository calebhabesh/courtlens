# Stats controls, header alignment, row hover and player drawer (53–59)

Re-measured 2026-10-14 on the live local dataset (dev server, 2025-26 regular season),
after the later palette instructions (61–66) settled the console colour.

| # | Check | 1440 | 390 |
|---|---|---|---|
| 53 | Console background (help row, Select Team, table frame) | rgb(31, 38, 50) on all three | same |
| 54 | Search field bottom vs header label bottom (GP, MIN, MPG, DPM) | 498 / 498 px | 788 / 788 px |
| 55 | Metric cell idle → hover → after leaving | rgb(17, 22, 30) → 6% white lift → rgb(17, 22, 30) | same |
| 56 | Drawer action buttons | 4 × 40 px, 8/16 px padding, 2×2 grid, no horizontal overflow | same |
| 57 | Per Game … Totals vs toolbar icon buttons | 36 / 36 px, 13 px text | 40 / 40 px |
| 58–59 | Drawer text contains Temporal notice / impact samples / Metric-specific support | none | none |

Row hover is plain CSS `:hover` (no JavaScript state), so it costs nothing on large tables and
cannot stick after the pointer leaves. Recommendation: keep it.

`measurements.json` is the earlier (2026-10-13) run at 2048/1440/390/375 before the palette change.
Screenshots: `stats-1440.png`, `stats-390.png`, `drawer-1440.png`, `drawer-390.png`.
