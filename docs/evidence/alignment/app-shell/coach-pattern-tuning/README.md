# Denser, irregular coaching-board backdrop

Owner instructions 9–10, 2026-10-14: make the marks closer and more visible, then replace the
row-like arrangement with random placement. The final SVG has 50 X's and 50 O's scattered across
a 1152 px tile at 7% stroke opacity. Original mark dimensions and 1.5 px strokes are retained;
X angles vary slightly. A fixed seed preserves placement between page loads.

The larger tile hides the small repeating arrangement. Its 100 positions increase the number of
marks per unit area, with at least 72 px between centers even across seams. Positions are sampled
directly, without a placement grid. Native SVG sizing prevents CSS from shrinking the marks.

Run `npm --prefix dashboard run pattern:generate` to rebuild the asset. The settings in
`dashboard/scripts/generate-coach-pattern.mjs` control mark count, tile size, minimum spacing,
opacity, mark size, stroke width, color and seed. Re-running produces the same bytes.

Screenshots use live local data: [1440](stats-1440.png), [2400](stats-2400.png),
[390](stats-390.png) and the [player header](player-1440.png). Scoped glance passes for irregular
placement, visibility, text readability, retained table appearance and no page overflow.

[Asset verification](asset-verification.json) measures 100 distinct x coordinates, 99 distinct
y coordinates and a minimum center separation of 72.28 px. Full-stroke contrast remains at least
6.18:1 for sampled on-background text. [Browser verification](browser-verification.json) confirms
native sizing, pattern visibility, unchanged opaque table interior pixels and geometry, no page
overflow and forced-colors suppression. Pixel comparison excludes transparent rounded corners,
where the page backdrop is intentionally visible. [Production checks](production-verification.json)
confirm native sizing and exact served/source SVG parity at desktop/phone widths.

Dashboard lint/typecheck, 525 Vitest tests, the production webpack build and all five existing
header interaction checks pass. The header spec's legacy screenshot-writing case was excluded
in favor of the captures above. Production checks use `next start` in a disk-backed scratch
copy; dependency symlinks produce the existing standalone-tracing warning. Standalone packaging
was outside this visual adjustment. Task servers and scratch were removed after verification.
Owner visual approval remains pending.
