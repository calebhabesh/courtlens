# Player headline-stat dark glass cards

Owner instruction 49, 2026-10-14. PTS, REB, AST, TS%, DPM and MPG each have a dark translucent
surface: surface-3 at 88% through surface-1 at 92%, a 12 px backdrop blur, a subtle hairline and
inset highlight, and token-based radius, padding and shadow. The surrounding summary is open.

Live 2025–26 data in an isolated production dashboard: [desktop page](player-1440.png),
[phone page](player-390.png), [desktop cards](stats-1440.png) and [phone cards](stats-390.png).
The desktop has six columns; phone has three columns and two rows. Scoped glance passes for
contrast, grouping, number legibility and padding. Career comparisons wrap within phone cards.

[Browser measurements](browser-verification.json) verify six cards, content fitting without
horizontal clipping, no page overflow, the applied gradient and blur, and Kawhi Leonard's
27.9 PTS in the selected 2025–26 season. [Contrast](contrast.json) composites each gradient
endpoint over the blue page; the smallest text measures at least 6.62:1, values 13.16:1 and
accent details 10.14:1. Without backdrop-filter support, the tinted gradient remains readable.

Dashboard lint/typecheck, 525 Vitest tests and the production webpack build pass. Four existing
player-page browser checks pass: Stats return navigation, summary/header, career table/Game Log
and profile tabs/phone overflow. No new tests were added for this CSS-only change. Production
checks used a disk-backed scratch dashboard at 3180, with an API proxy at 4180 admitting GET,
HEAD and the read-only POST workbench query; fixture checks switched 4180 to the mock API.
Symlinked dependencies produce the existing standalone-tracing warning, so browser checks used
`next start`; standalone packaging was outside this styling change. Task servers and scratch
were removed after verification. Owner visual approval remains pending.
