# Plain blue backdrop restored

Owner instruction 11, 2026-10-14: remove the pattern because it makes player-page information
harder to see. The shell uses solid `--color-bg` again. The pattern asset, generator and npm
command are removed. The experiment is recoverable from Git history (initial `65e3308`,
denser scatter `b358265`); historical screenshots remain unchanged.

Live screenshots: [player desktop](player-1440.png), [player phone](player-390.png),
[Stats desktop](stats-1440.png) and [Stats phone](stats-390.png).

[Browser verification](browser-verification.json) covers Stats and player pages against live
local data and production fixtures at 1440/390. All use `background-image: none` and the original
`rgb(21, 50, 90)` fill, with zero pattern requests and no page overflow. Source search finds no
remaining pattern asset or generator references in dashboard code.

Dashboard lint/typecheck, 525 Vitest tests and all five existing production header interaction
checks pass. The header spec's legacy screenshot-writing case was excluded in favor of these
captures. Production checks use the scratch copy's completed webpack build through `next start`;
standalone packaging was outside this presentation removal. Task servers and scratch were
removed after checking.

Scoped glance: player information is readable on the restored, uninterrupted blue background;
Stats remains legible at desktop and phone widths. Owner visual approval remains pending.
