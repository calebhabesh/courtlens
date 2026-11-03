# Coaching-board backdrop: initial preview

Owner instruction 8, 2026-10-14. Four small X/O marks repeat on a 384 px tile, roughly 192 px
apart. The stroke uses `#b4c2dc` at 4% opacity and 1.5 px width. The SVG is 339 bytes, with no
scripts, filters, fonts or external references. The shell uses a native repeating background;
Stats exposes it through a transparent workspace. Tables/cards keep their fills. Forced-colors
mode removes the decorative image.

View [Stats at 1440](stats-1440.png), [2400](stats-2400.png) or [390](stats-390.png), alongside
the matching plain backgrounds: [1440](before-1440.png), [2400](before-2400.png),
[390](before-390.png). Other sampled pages: [player desktop](player-1440.png),
[player phone](player-390.png), [Settings desktop](settings-1440.png) and
[Settings phone](settings-390.png).

[Browser measurements](browser-verification.json) confirm visible background changes, identical
visible table pixels and geometry, no page overflow and forced-colors suppression at all three
widths. Production fixture checks confirm the applied background and exact served/source SVG
parity at desktop/phone widths. [Contrast measurements](contrast.json) composite a full stroke
over the blue backdrop: all sampled text tokens exceed 4.5:1, with a minimum of 6.59:1.

Validation: dashboard lint/typecheck, 525 Vitest tests and production webpack build pass. The
11 existing header and moved-team/date browser checks pass; the final combined run had one
phone control-height precision flake (47.99993896484375 instead of 48) which passed in isolation.
The header spec's legacy screenshot-writing case was excluded; the previews above replace it.
Production browser checks used `next start` in a disk-backed scratch copy. Dependency symlinks
produce the existing standalone-tracing warning; standalone packaging was outside this change.
Task servers and the scratch workspace were removed after checking.

Scoped glance: the marks remain faint, headings and labels stay legible, and table presentation
is unchanged. The owner finds this initial 384 px / 4% preview too sparse and faint and requested
the adjustable parameters. Density/opacity refinement and visual approval remain pending.
