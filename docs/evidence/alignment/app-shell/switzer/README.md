# Switzer interface font — 2026-10-13

Owner selected Switzer instead of Public Sans. The root layout now binds Switzer to the existing
`--font-sans` token, retaining the type sizes/weights, numeric styles, JetBrains Mono and the
separate Red Hat Display wordmark artwork. Design Language v1 and the font manifest record the choice.

The original Fontshare Switzer 1.2 variable WOFF2 (100–900) is 43,220 bytes, pinned by SHA-256
`d1bf801ffb1a6096def70a7c532255722ad87d948b13a8a586e342f7091f8ee4`. Its file is unmodified.
The current FFL permits self-hosting and excludes redistribution through repositories; the binary
is ignored by git and acquired from the pinned source during npm install/dev/build. The original
license and source/hash manifest are retained. Acquisition checks cover missing, valid and
mismatching files; a mismatch fails without overwriting it.

Switzer's default digit advances are equal (576 font units). Browser digit-width spread is 0px
at weights 400/500/600. The bounded name/punctuation sample has no missing or fallback-dependent
glyphs, including Jokić, Dončić, Porziņģis, Valančiūnas and Şengün. Both loaded font hashes match
the manifest and all font/CSS requests are local. Switzer can load without Fontshare at runtime.

Verification:

- Dashboard ESLint/Stylelint and TypeScript pass, Vitest 454/454, isolated production build passes.
- 13 existing focused browser checks pass: header geometry/keyboard/mobile, table alignment and
  readability, filters at 200% reflow, search, and preserved SVG/PNG wordmark exports.
- 120 existing visual/picker checks pass (92 main, 24 PC12, 4 native pickers). Baselines refreshed
  for the owner-requested global font change, then checked again without updates (92 + 28 pass).
- Production fixture page checked at 1440×900, 768×900, 390×844, 375×812 and 844×390. No page
  overflow, header 56px, brand gap 4px, rows 42px; digits align at every tested weight.
- Blocking both WOFF2 files retains a readable heading and populated table with no phone overflow.
- The owner's live `/settings` also loads Switzer. Initial live Stats attempts coincided with
  concurrent backend updates, so table acceptance uses the repository's deterministic fixtures.

Evidence: [desktop](stats-1440.png), [phone](stats-390.png), [desktop header](header-1440.png),
[phone header](header-390.png), [blocked fonts](blocked-fonts-390.png),
[live Settings](settings-live-1440.png), [browser measurements](browser-verification.json),
[acquisition checks](acquisition-verification.json), [live font](live-verification.json).
The retained prior desktop/phone baselines are comparison references, not fresh matched-data captures.

Scoped glance test:

1. Header: pass, title and navbar remain legible and aligned.
2. Filters: pass, existing control labels fit and selected states remain visible.
3. First screen: pass, the desktop table starts within the first 400px.
4. Alignment: pass, measured header/row geometry and 0px digit-width spread.
5. Identity: preserved, including licensed wordmark artwork and fixture photo/initial fallbacks.
6. Missing data: preserved, unknown fixture values remain em dashes; no new technical copy.
7. Icons: preserved, wrapper icons and brand artwork unchanged.
8. States: pass for blocked font loading; numerical/data states retain existing behavior.
9. Phone: pass, no page overflow at 390/375 and existing phone controls pass.
10. Dates: preserved, existing formatters and picker behavior pass.

The bounded font trial is ready for owner review; this does not mark any catalog page aligned.
