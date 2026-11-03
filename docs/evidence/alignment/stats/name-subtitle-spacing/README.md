# Stats name/subtitle spacing

Owner instruction 83 (2026-10-14): increase the space between player names and the second line.
The owner's follow-up, "A smidgen less", reduces the added margin from 4 px to 2 px
(`--space-0-5`).

[Desktop](stats-1440.png), [phone](stats-390.png), [desktop card](leonard-1440.png) and
[phone card](leonard-390.png) use live local data. [Browser measurements](browser-verification.json)
cover both widths and both densities, using ten live players and two production-fixture players.
All measured gaps are 2 px. Standard row heights remain 52/46 px (desktop/phone); compact rows
remain 44 px. Move-pill centers match their neighboring text, with intact outlines and no page
overflow. Existing phone subtitle ellipsis remains in use.

Dashboard lint/typecheck, all 525 Vitest tests and six existing moved-team/date browser checks
pass. The production webpack build passes; browser checks use `next start` in a disk-backed
scratch copy. Symlinked dependencies produce the existing standalone-tracing warning in that
copy; standalone packaging was not checked.

Scoped glance: readable name/subtitle separation, centered pill, retained row density. Owner
visual approval remains pending. Task servers and scratch workspace were removed after checking.
