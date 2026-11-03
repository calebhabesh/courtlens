# Player page redesign (alignment row 2, instructions 19–28)

Owner instructions of 2026-10-14, agreed from the
[player page mockup](https://claude.ai/artifact/C3UjfZMcdm3A9qQZJ65TRy) (v3). Captured from the local
dev stack on published data.

| Capture | Shows |
| --- | --- |
| [Kawhi Leonard, Overview 1440](kawhi-overview-1440.png) | Header with current team (Raptors) and glow; draft logo; "65 games with LA Clippers"; open summary with career figures; impact and Recent form side by side |
| [Kawhi Leonard, Overview 390](kawhi-overview-390.png) | Phone layout: photo beside the column, facts wrap, summary in two rows of three |
| [Kawhi Leonard, Tracking 1440](kawhi-tracking-1440.png) | Stat rows with percentile bars on the Stats colour scale, four groups across |
| [Kawhi Leonard, Combine 1440](kawhi-combine-1440.png) | Headline figures on the group grid; Measurements and Athletic testing rows |
| [Shai Gilgeous-Alexander, Overview 1440](sga-overview-1440.png) | Follow-ups 29–34: glow ends inside the header, table fits its 8 seasons, even console spacing, group dividers, "68 games" badge, no rule above the season line |
| [Dirk Nowitzki 2018-19, 1440](nowitzki-retired-1440.png) | No current listing: the header falls back to the season's team, no "games with" line |

## What changed

- **Team identity.** `GET /players/{id}/bio` gains `current_team` (the latest NBA player index
  listing; null for free agents and retired players). The header shows it; season values keep the
  team their games were played for, and the summary names that team when it differs.
- **Header.** 136px photo, hairline divider, one left-aligned column; name 32px with a 40px logo;
  facts as label over value with a quiet second line (Born carries the age, Draft carries the
  pre-draft school and the drafting team's 18px logo).
- **Open sections.** The season summary, Player impact, Recent form, Tracking and Combine sit on the
  page background with a heading and one hairline. Only the career table keeps its container.
- **Summary.** Career value under each tile (best season for DPM), hidden for one-season players.
- **Impact.** Signed values; Off/Def under 1Y RAPM. Recent form tints Last 10/5 against the season
  at the shown precision.
- **Tracking and Combine.** One row per stat; bar and number use the Stats percentile scale
  (`--pct`, gold → grey → blue). Unranked stats show the value only; small samples say so.

## Verification

- Dashboard lint (ESLint + Stylelint), typecheck, Vitest 508/508.
- Python ruff and format clean; strict mypy unchanged (2 pre-existing errors in
  `assistant/agent/providers/gemini.py`); full suite 2090 passed, including the extended
  PostgreSQL bio test for `current_team`.
- Browser (sandbox on ports 3180/4180): player-career, players-fo09, fo14-accessibility,
  table-interactions, pc11-gated-pages and all visual baselines pass (132). The two player profile
  baselines were regenerated; no other baseline changed. Full suite 456 passed; the remaining
  failures are intermittent and outside this page (planner sign-in "Email" strict-mode check and the
  roster export in advanced-research; both pass when rerun alone).

Follow-ups 29–34 (same day): browser set 132/132 after regenerating the two player profile
baselines; Vitest 508/508; lint and typecheck clean.

Follow-up 35: the header photo uses Compare's ring and logo badge (shared `PlayerAvatar`); Compare
specs and baselines unchanged, player baselines regenerated.

Not done, awaiting the owner: the Basketball-Reference bio crawl (honours, awards column,
birthplace, high school, shooting hand, debut). The "now TOR" chip on Stats rows was built as Stats
instruction 72.
