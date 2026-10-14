# Centered Stats table search — 2026-10-13

Owner instruction 47 centers the compact search field above the player cards, following the
supplied Databallr reference. Scoped automatic inline margins center it inside the header spanning
the compare and player-name columns. Desktop size remains 288×32px; phone touch sizing remains.

Real local captures: [1440 desktop](stats-1440.png), [desktop detail](search-detail-1440.png) and
[390 phone](stats-390.png). [Measurements](measurements.json) show identical search/card centers:
188px on desktop and 126px on phone, with zero horizontal offset and no page overflow.
The bounded glance check passes: equal desktop side spacing, readable text/icon, and preserved
row/card alignment and phone layout.

Dashboard lint/types, Vitest **459/459**, production build and the existing readability/search
browser checks pass. Updated desktop and retained phone screenshot baselines pass. Ready for
owner review; only the owner marks Stats aligned.
