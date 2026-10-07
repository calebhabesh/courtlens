# Red Hat Display wordmark revision — 2026-10-07

Owner requested [Fontshare Red Hat Display](https://www.fontshare.com/fonts/red-hat-display).
The shared CourtLens artwork now uses Red Hat Display Bold 1.021, shaped with native
HarfBuzz kerning and original glyph outlines. The header, Stats, profile/showcase and
SVG/PNG share cards use the same artwork. The yellow color, rendered heights, accessible
name and centered basketball-mark alignment are preserved.

[Asset provenance](../../../dashboard/public/brand/manifest.json) records the official
download, font hash and supplied SIL OFL notice. The [previous manifest](previous-brand-manifest.json)
and [previous artwork](previous-wordmark.ts.txt) retain the Sora version. No runtime font
download is required. Wordmark dimensions are 4970×721 units, rendered at 96.5×14px in
the header.

Five real-service Chromium checks pass with zero page errors: [record](browser.json),
[log](browser.log) and [reused verification probe](verify.cjs). At 2048/1440/375px, the header
wordmark stays centered with the mark and there is no document horizontal overflow.
Header/table/profile/showcase paths match; SVG and PNG downloads succeed. Checks used
the existing development server and real local FastAPI/PostgreSQL, blocking personal
workspace writes.

Inspected [desktop](stats-2048.png), [smaller desktop](stats-1440.png), [mobile](stats-375.png)
and [profile PNG](profile.png); [profile SVG](profile.svg) contains the shared outline.
[Lint](lint.log), [TypeScript](typecheck.log) and the [isolated production webpack build](build.log)
pass. This is a bounded wordmark change; analytical/source completion gates remain retained.
