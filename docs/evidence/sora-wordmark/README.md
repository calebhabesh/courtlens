# Sora wordmark revision — 2026-10-07

Owner requested [Fontshare Sora](https://www.fontshare.com/fonts/sora) instead of Alpino.
The shared CourtLens artwork now uses **Sora Bold 2.0**, retaining the previous 700 weight,
amber color, rendered heights, accessible name and mark alignment. Native glyphs/kerning
are shaped into the existing reusable SVG artwork; no runtime font download is required.
Header, Stats, profile/showcase SVGs and PNG export headers share the same outline constants.

[Asset provenance](../../../dashboard/public/brand/manifest.json),
[official metadata](fontshare-metadata.json), [previous manifest](previous-brand-manifest.json)
and [previous artwork](previous-wordmark.ts.txt) are retained. Sora's supplied SIL OFL 1.1
notice is stored with the assets. Analytical/prose fonts and data remain unchanged.

Five rendered real-service checks pass, zero page errors: [record](browser.json),
[log](browser.log), [probe](verify.cjs). Verified on the existing localhost:3100 dev server
at 2048/1440/375px, with personal-workspace writes blocked. Header centers remain aligned;
no document horizontal overflow. Profile SVG contains the shared Sora outlines; PNG export
succeeds; showcase header/watermark both match. Wordmark artwork measures 5377×771 units,
rendering at approximately 97.64×14px in the header.

Inspected [desktop](stats-2048.png), [smaller desktop](stats-1440.png), [mobile](stats-375.png),
[profile SVG](profile.svg) and [profile PNG](profile.png).
[Lint](lint.log), [TypeScript](typecheck.log) and [isolated production build](build.log) pass
with no warnings/errors. No new tests/backend changes were introduced; existing focused
browser verification was reused. The running dev server reflects the change without restart.
