# Alpino wordmark revision — 2026-10-07

Owner requested replacing Tabular with [Fontshare Alpino](https://www.fontshare.com/fonts/alpino).
Shared CourtLens artwork now uses **Alpino Bold 1.0**, matching the previous 700 weight.
Original official OTF glyphs are shaped with HarfBuzz default kerning and retained as SVG
wordmark artwork; no font binary is modified or redistributed. Color, rendered heights,
accessible CourtLens identity, basketball mark and placement are preserved. Header, Stats,
profile/showcase cards and PNG export headers consume the shared outline constants.

[Current asset provenance/license](../../../dashboard/public/brand/manifest.json),
[official metadata](fontshare-metadata.json), [prior manifest](previous-brand-manifest.json),
[prior artwork](previous-wordmark.ts.txt). Original runtime data/prose fonts are unchanged.

Verification used the owner's existing **localhost:3100** development server and real API,
with personal-workspace mutations blocked. **Five checks, zero page errors**:
[record](browser.json), [log](browser.log), [probe](verify.cjs). Includes 2048/1440/375px
viewports, zero horizontal document overflow, centered header mark/wordmark, identical
header/table/profile/showcase outline paths, and downloaded SVG/PNG exports.

Inspected [desktop screenshot](stats-2048.png), [smaller desktop](stats-1440.png),
[mobile](stats-375.png), [profile SVG](profile.svg) and [profile PNG](profile.png).
Header wordmark is approximately **88.1×14px**, using shaped artwork **4405×700** units.

[ESLint](lint.log), [TypeScript](typecheck.log) and [isolated production build](build.log)
pass with zero warnings/errors. Existing export-test description now names the shared artwork
rather than the superseded font. No new tests or backend changes were needed for this artwork
replacement; earlier full-suite evidence remains separate. The running dev site picked up the
change without a restart. No temporary server was started for this verification.
