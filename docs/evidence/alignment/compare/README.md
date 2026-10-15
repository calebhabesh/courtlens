# PvP duel card — 2026-10-15

Alignment row 3, instructions 1–6. `/compare` is one centred 560px card in Databallr's shape:
square headshots on the team's brand colour with a games badge, name and one bio line
(age · listed position · listed height), a swap button, the five presets, a counting-mode select,
then mirrored rows. Each value carries its league percentile (the Stats page's gold → gray → blue
number, 500+ minute cohort). A filled identity pill marks the leading side for metrics with a
declared direction; fewer turnovers and fouls lead, and metrics without a direction get no pill.
Overall reads in Counting / Efficiency / Profile groups. Unknown values show "—" with no pill.

- Opening `/compare` with no players redirects to the season's top two scorers (points per game,
  500+ minutes), falling back to the two minutes leaders: Luka Dončić vs Shai Gilgeous-Alexander
  on 2025-26 live data. Silhouettes and the two-field picker remain only when no pair resolves
  (and on the legacy fixture snapshot).
- Pressing a portrait opens player search under it ([search](compare-search-1440.png),
  [after picking Wembanyama](compare-picked-1440.png)).
- Edit Metrics opens a drawer grouped by catalog category; per-game twins of counted metrics and
  aliases are left out because the counting mode picks the rate ([drawer](compare-edit-metrics-1440.png)).
- Share Image renders the card itself with headshots inlined ([PNG](share-image.png)). Export SVG
  uses the same card. Narrow exports put the footer notice on its own line.

Live captures (real local API through a read-only proxy): [1440](compare-1440.png) and
[390](compare-390.png). Both have zero horizontal overflow; at 390 the five presets fit
(350px in 356px).

Checks: dashboard lint and typecheck; Vitest 531/531 (4 new helper tests); production webpack
build. In the sandbox (3180, with the mock on 4180), 208 compare-related browser tests pass,
including the previously failing Compare export test. The full Playwright run had 468 passed,
27 skipped and 3 failed. None of the failures are from this change: two `control-kit` geometry
checks on `/design` predate it (the kit's `text` variant, `92b91c0`), and one is the roster
projection spec. The four compare baselines were regenerated, and the other 88 visual baselines,
including the approved Stats and player pages, are unchanged.

## First review (instructions 7–17)

Season headshots (7): 6,129 team-season photos; the card and share image request the compared
season. [Durant (BKN then PHX) vs LeBron, 2022-23](review1-traded-1440.png) shows both logos with
the latest team in front, the change-player icon, bold leading values, the accolades block and a
pending note for awards announced after the Apr 9 cutoff. [2016-17 through Jun 20](review1-2016-17-1440.png)
shows that season's honours (MVP vote, All-NBA team) and Durant's first title. [Phone](review1-traded-390.png),
[trend tray](review1-trend-tray-1440.png), [searchable Edit Metrics](review1-edit-metrics-search-1440.png)
and [share image](review1-share-image.png). Edit Metrics, Share Image and More sit in the console.
The fade is measured mid-animation after a swap.

Checks: dashboard lint/typecheck; Vitest 537/537; Python 2,114 passed (ruff and format clean;
mypy's two `gemini.py` errors predate this work); 198 affected browser tests plus a new tray test
pass; the four compare baselines were regenerated and the others match.
