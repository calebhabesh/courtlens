# Stats header alignment and player-card surface — 2026-10-13

Owner instructions 51–52 bottom-align the second header row and give the pinned compare/player
cells the same `--table-data` background as the metric cells. Hover and preview use the matching
`--table-data-hover` tint. Header, guide bands, toolbar and footer retain their existing surfaces;
the centered search remains 312×32px on desktop and keeps phone touch sizing.

Real local captures: [desktop](stats-1440.png), [header/cards detail](header-cards-1440.png) and
[phone](stats-390.png). [Measurements](measurements.json) verify the search and all 26 metric
header controls have the same bottom edge (499px desktop, 745px phone), zero search center offset
and no page overflow. Compare/player cells exactly match metric cells at rest and on hover.

Scoped glance check passes: clear header alignment, one dark data surface through identities and
metrics, readable portraits/text, and retained desktop/phone structure. Dashboard lint/types,
Vitest **459/459** and production build pass. Table interaction, preview, follow-up and
readability/search browser specs pass **27/27**; refreshed Stats desktop/phone baselines pass
**2/2**. Ready for owner review; only the owner marks Stats aligned.
