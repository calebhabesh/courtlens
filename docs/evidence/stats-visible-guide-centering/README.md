# Visible Stats guide centering and stronger initials — 2026-10-11

The owner's annotated screenshot clarified the target: guides must sit on the divider
midway between the visible values of neighboring metric sections. The earlier change
only corrected header spans and did not satisfy this request.

Before this correction, guide centers were 22.49px, 27.49px and 15.99px left of the visible
dividers at 2048px. Initials text was 6px above its circle center because the Stats child
selector replaced the initials' grid layout with `display: block`.

Guides and their background bands now move to the visible divider. A single table-size
observer measures each boundary using the previous group's right-aligned value edge and
the next group's widest displayed leading value. This retains one straight guide column
across rows with different value lengths. Font loads, new rows, presets and resizing update
typed CSS geometry variables. Numeric alignment and structural column widths remain.

Each guide has a grid wrapper, including a constrained track so multiple represented-team
logos remain centered. Initials keep their grid layout and a 1-unit line height. The owner's
follow-up asks for more prominent initials: they now use semibold (600) and the primary
text color, retaining the circle and text sizes.

`geometry.json` records 16 real-data cases: Photos, Logos, Initials and None at 2048, 1440,
768 and 390px. All guide-to-divider offsets are 0px, guide centers stay on a straight line
across 50 rows (including a two-team logo stack), and initials text centers differ by at most
0.008px. Header/body column counts match and there is no page overflow. Narrow captures
also show internally scrolled guides. Desktop, tablet and phone Photos/Initials screenshots
are in this directory.

Scoped glance review of populated screenshots: title/subtitle and filter placement pass;
first-screen result placement passes; numeric alignment, actual guide centering and glyph
centering pass; player/team identity and Lucide treatment pass; phone containment/filter
collapse and dates pass. Loading/error/missing-data states were not re-audited for this
bounded correction. Existing Stats browser checks cover navigation and interaction.

The readability browser check now asserts the visible metric gap, and the recurring-modes
check measures text-node bounds inside initials circles. Header-only geometry is no longer
used as evidence of the requested centering.

Validation: zero-warning dashboard ESLint/Stylelint and TypeScript pass; production webpack
build passes; 415 unit tests pass; all 18 production Stats browser checks pass (readability,
search, preview, table interactions, unchanged desktop/phone screenshot baselines).
Resizing the same mounted table through 1440, 2560, 768 and 2048px retains 0px offsets
without navigation. The final initials render as weight 600 with the primary text token.
Prior milestone and owner-review statuses are unchanged.
