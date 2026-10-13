# Navbar spacing and favicon legibility — 2026-10-13

Owner follow-ups: bring the navbar wordmark closer to its logo; make the browser-tab favicon legible.

The navbar uses `--space-1` (4px) between its logo and text, down from 12px. Its width decreases
from 132.5px to 124.5px. At 1440, 768 and 390px, the measured gap is 4px, vertical offset is 0px,
header height stays 56px, and the page has no horizontal overflow. The rule is scoped to the header.

The favicon keeps the ball/lens identity but removes its dark frame and trims the viewBox from
32 to 27 units. Its artwork is 18.5% larger; its orange basketball diameter is 32.1% larger,
with slightly thicker seams. The app/public SVGs match. The rendered page requests
`/icon.svg?v=2` with `image/svg+xml` and `sizes="any"`; that endpoint returns the new asset (200).

Visual evidence:

- [Before navbar](header-before-1440.png), [after desktop](header-1440.png), [after phone](header-390.png).
- [Desktop context](stats-1440.png), [phone context](stats-390.png), [measured geometry](measurements.json).
- [Favicon comparison at 16, 32 and 64px](favicon-comparison.png), [browser verification](favicon-verification.json).

Checks:

- Dashboard ESLint/Stylelint and TypeScript pass; both rerun after the favicon/metadata changes.
- Vitest: 68 files, 454 tests pass for the navbar change.
- Existing affected Playwright checks: header branding, sticky geometry, dropdown keyboard
  navigation and mobile drawer behavior all pass. The initial run had two streamed-page setup
  timeouts; both passed in the focused rerun without test changes.
- Browser verification confirms the versioned favicon metadata and served SVG match, and both
  SVG source copies match. The 16px and 32px previews were visually inspected.

Scoped glance test (desktop 1440×900 and phone 390×844):

1. Header: pass for navbar logo/text readability and alignment; page-title layout not reassessed.
2. Filters: outside this change; not reassessed.
3. First screen: outside this change; not reassessed.
4. Alignment: pass, token-based 4px gap and 0px vertical offset.
5. Identity: pass for the preserved CourtLens basketball/lens; player/team imagery not reassessed.
6. Missing data: outside this change; not reassessed.
7. Icons: pass for brand assets; no interface-icon changes.
8. States: header dropdown/mobile behavior passes; page loading/empty/error not reassessed.
9. Phone: pass for navbar legibility, no horizontal page overflow and existing mobile controls.
10. Dates: outside this change; not reassessed.

This records the bounded app-shell follow-ups, not whole-page acceptance or owner alignment.
The UI/UX skill database returned no applicable spacing/CSS match; the owner's instruction and
existing repository spacing tokens govern the change.

## Follow-up: site-blue favicon background

Owner requested the site's blue background on the favicon. Both SVG copies now have a full
`#15325a` background matching the site's `--color-bg`, retaining the enlarged mark and tight crop.
The icon URL is `/icon.svg?v=3` so browsers request the updated asset.

- [Before/after at 16, 32 and 64px](favicon-blue-comparison.png), [browser verification](favicon-blue-verification.json).
- Visual inspection passes at 16px and 32px. The rendered 16px corner pixel is `[21, 50, 90, 255]`,
  exactly the opaque site blue. App/public sources match, metadata uses v3, and its endpoint
  returns the expected SVG with status 200.
- Dashboard lint/typecheck and all 454 Vitest tests pass after this follow-up.
- Scoped glance: brand identity, small-size legibility and the requested background match pass;
  page layout is outside this asset-only follow-up.

## Follow-up: smaller logo and softly rounded corners

Owner requested a slightly smaller logo and slightly rounded, squircle-like background corners.
Both favicon SVGs scale the artwork to 90% around the canvas center and give the site-blue
background a 5-unit corner radius. The icon URL is `/icon.svg?v=4`.

- [Before/after at 16, 32 and 64px](favicon-rounded-comparison.png), [browser verification](favicon-rounded-verification.json).
- Visual inspection at 16px/32px passes: the mark remains legible, with more blue around it and
  soft corners. At 16px the four corner pixels have alpha 24/255 (antialiasing coverage), while
  the midpoint of the top edge remains opaque site blue `[21, 50, 90, 255]`.
- Source SVGs match; the rendered page requests v4 and its endpoint returns the matching SVG (200).
- Dashboard lint/typecheck and Vitest 454/454 pass. The initial scratch verification used exact
  equality for the browser's float transform and expected zero corner alpha; corrected to account
  for browser float precision and antialiasing, without changing the asset.
- Scoped glance: identity, small-size legibility, spacing and rounded background pass; no page
  layout changes are included in this asset follow-up.
