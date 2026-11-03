# Uniform dark glass headline-stat cards

Owner instruction 51, 2026-10-14: strengthen the dark glass effect, with the clarification that
it should cover the entire container rather than look like a highlight.

Each card has one uniform surface-0 tint at 58% opacity, a 10% rim, the shared soft raised shadow
and a 20 px / 150% backdrop filter. There is no background image, gradient or directional sheen.
Only the backdrop is filtered; content stays sharp. The fill remains when filters are unsupported.
Sizing, layout, values, ranks and career comparisons retain their existing behavior.

Live 2025–26 Kawhi Leonard data: [desktop cards](stats-1440.png), [phone cards](stats-390.png),
[desktop page](player-1440.png) and [phone page](player-390.png).
[Browser measurements](browser-verification.json) verify the uniform fill, absent background
image, actual backdrop filter, unfiltered content, six fitting cards and no page overflow at
both widths. [Contrast](contrast.json) composites the tint over the blue with 150% saturation
and without filters; sampled small text is at least 7.49:1. Scoped glance passes for uniform
smoked-blue glass, readable information, retained spacing and restrained edges.

Dashboard lint/typecheck, all 525 Vitest tests, production webpack build and six existing player
browser checks pass. These include the desktop/phone pinned-Year regressions, return-to-Stats,
summary, career/Game Log and profile-tab behavior. No new tests were added for this styling change.

Runtime checks used a production sandbox at 3180 with fixture API or a read-only local-data
proxy at 4180. The proxy admits GET/HEAD and the read-only POST workbench query. Symlinked
dependencies produce the existing standalone-tracing warning; browser checks used `next start`,
and standalone packaging was outside this adjustment. Task-owned servers and scratch were
removed after verification. Owner visual approval remains pending.
