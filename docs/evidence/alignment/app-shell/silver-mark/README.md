# Lustrous silver magnifying glass — 2026-10-14

Owner request: give the magnifying glass a cool, lustrous silver gradient across the CourtLens
logo, icon and favicon, like a silver analogue of Databallr's golden logo.

The ring, handle and rounded handle end share one diagonal, six-stop gradient: pale highlights
alternate with cool blue-gray silver shades. Coordinates use `userSpaceOnUse`, so the finish is
continuous across the three shapes. React's `useId` gives every rendered mark its own paint
reference, including the simultaneous navbar and mobile-drawer logos.

The shared mark, both favicon SVG copies, Apple SVG, maskable SVG and four PNG icon variants are
updated. The favicon, Apple metadata and manifest icon URLs use `v=5`. Restoring the three silver
paint attributes to white and removing the gradient reproduces the before SVGs byte for byte.
All four PNGs exactly match rasterizations of their corresponding SVG artwork.

Visual evidence:

- [Silver preview and 16/32/64px favicon comparison](silver-preview.png).
- Header: [before desktop](header-before-1440.png), [silver desktop](header-1440.png),
  [before phone](header-before-390.png), [silver phone](header-390.png).
- Page context: [1440×900](stats-1440.png), [390×844](stats-390.png).
- [Measured browser and asset checks](verification.json), [rerunnable verifier](verify.cjs).

Before headers use the existing fixture build on port 3180. After captures use a production
webpack build in a disk-backed scratch workspace on port 3196 against the fixture API on 4180,
Chromium and reduced motion. The existing dev server on 3100 returned a Tailwind CSS error before
verification; its cache and other ongoing dashboard edits were left alone. The scratch build's
symlinked dependencies produce standalone tracing warnings; verification uses `next start`
with the full dependencies, and makes no deployment claim. Scratch resources were cleaned up.

Checks:

- Dashboard ESLint/Stylelint and TypeScript pass.
- Vitest: 76 files, 511 tests pass. The first scratch run lacked three repository fixture files;
  supplying the existing docs fixtures resolves the setup failures without test changes.
- Production webpack build passes. All six `header-command-palette.spec.ts` browser checks pass.
- Served favicon, Apple icon and all manifest PNGs match the working assets; app/public favicon
  copies match. Multiple simultaneous brand instances have unique gradient IDs; no page errors.
- SVG geometry, backgrounds, basketball colors, seams and dimensions match the before assets.
- Visual inspection passes at 16px and 32px, and on both responsive navbar captures.
- `git diff --check` passes.

Scoped glance test: header readability, silver identity and icon legibility pass at 1440 and
390px. Alignment passes: header 56px, brand 124.5px, token gap 4px; no horizontal page overflow.
The existing dropdown, search and mobile-drawer behavior passes its browser checks. Filters,
first-result placement, player/team imagery, missing-data copy, page loading states and dates are
outside this asset change and are not reassessed. Owner alignment remains pending.
