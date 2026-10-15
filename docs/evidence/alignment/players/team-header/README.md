# Team-coloured player header

Owner instruction 68, 2026-10-15: do what ESPN and the PvP card do. Put the photo on a team-shaded
background with the team logo behind it, and show the actual team logo, fairly large, next to the
team the player plays for.

- The round photo and its soft colour halo are replaced by the PvP card's tile: a 168 px square
  (104 px on phones) with rounded corners, a radial gradient of the header team's brand colour,
  and that team's logo at 42% opacity behind the head. A player without a photo shows initials
  on the same tile. Without a known team the tile falls back to a plain surface.
- The identity line now leads with a 36 px team logo, then the team name, position and jersey.
  "Last with …" and "Observed with …" keep their wording. On phones the team takes its own line
  and position · jersey follow without a leading dot.
- The header team is unchanged: the current listing, else the last indexed team, else the
  observed season team.

Live captures through a read-only proxy to the local API: [Luka Dončić 1440](luka-1440.png),
[Victor Wembanyama 1440](wemby-1440.png), [Wembanyama 390](wemby-390.png),
[Kawhi Leonard 1440](kawhi-1440.png). Measured at 1440 and 390 for all three players: tile
168×168 / 104×104, logo 36×36, zero horizontal overflow.

Checks: dashboard lint and typecheck; Vitest; production webpack build in a sandbox on 3180.
Visual baselines: 89 of 92 matched unchanged; the player profile (desktop, phone) and the phone
search modal (instruction 15's removed edge bar) were regenerated after review. Player, search,
lookup and palette specs: 35 passed, 1 failed (the roster-shapes projection spec, a known failure
unrelated to this page).

## Watermark contrast (instruction 69)

Owner, 2026-10-15: make the background logo contrast well for every NBA team on both the player
page and PvP; the Raptors logo was hard to see on Kawhi Leonard's tile.

Each team's logo was rendered on its own tile in several treatments
([first options](watermark-options-1.png), [final two](watermark-options-2.png)). Contrast was
measured per team as the 90th-percentile contrast ratio of logo pixels against the tile:

| Treatment | Weakest teams | Median |
| --- | --- | --- |
| Plain logo at 42% (before) | UTA 1.03, TOR 1.20, PHI 1.27, HOU 1.59 | 2.45 |
| Light edge only | PHI 1.60, TOR 1.76, UTA 1.76 | 4.22 |
| Brightness 1.8, saturation 0.75, 1.5 px light edge, 50% (chosen) | DEN 2.20, TOR 2.29, UTA 2.31, PHI 2.39 | 4.68 |

A white silhouette was rejected because round logos (Hawks, Mavericks, Pistons) become plain
discs. Brightness multiplies, so black marks (Spurs, Nets) stay black, and the Raptors read as a
lighter pink like ESPN's art. The PvP card, the player page tile and the share image use the
same treatment (the share image through an equivalent SVG filter).
[Live tiles: Leonard, Embiid, Markkanen, Wembanyama](watermark-tiles.png);
[PvP card](watermark-compare.png).

Checks: dashboard lint, typecheck and Vitest 540/540; production webpack build in a sandbox on
3181/4181 (3180/4180 were in use by another session's sandbox). All 92 visual baselines pass
unchanged; compare, player profile, player reference and FO09 specs: 14 passed, 1 skipped.

## Larger watermark (instruction 70)

Owner, 2026-10-15: on both pages, enlarge the background logo slightly so it is more visible,
since heads can block it; the team name and logo beside the name supplement it anyway.

Eight real headshots were set over their team tiles at 92% (before), 115%, 130% and 145% of the
tile ([options](watermark-scale-options.png)). At 115% the Nuggets ring, OKC's mark, the Raptors
claw and the Lakers wordmark show around the head; at 130% and above the cropping makes logos
hard to recognise. The logo is now 115% wide, centred horizontally and a little above the middle
(left −7.5%, top −11.5%); the share image uses the same geometry.
[PvP card: Jokić vs Gilgeous-Alexander](watermark-115-compare.png),
[player page: Leonard](watermark-115-kawhi.png). At 1440 the 168 px tile holds a 193 px logo;
no page overflow at 1440 or 390.

Checks: dashboard lint, typecheck and Vitest 540/540; production webpack build in a sandbox on
3181/4181. Two PvP phone baselines (FO11 player comparison, PC04 compare) changed only in the
watermark and were regenerated; all 92 visual baselines then pass, as do compare and player
profile specs.
