# FO06 Design Language v1.1 and baselines: evidence

Measured 2026-10-09 on branch `frontend-overhaul`. Parent: [frontend overhaul handoff](../../frontend-overhaul-plan.md).
Measurements and screens: `node scripts/capture_fo06_evidence.cjs` (`measurements.json`, `screens/`)
against `localhost:3100` with real data.

## What changed

| Item | Result |
| --- | --- |
| Design Language v1.1 | [`docs/design/design-language-v1.md`](../../design/design-language-v1.md) (file name kept so links still work). New **Pages (v1.1)** section: the five templates, page anatomy (PageHeader → filter bar with `scope`/`filters`/`modes`/`count`/`details` slots → main result), missing data and technical detail (GatedNote, Why?, Data details, Advanced mode, states), identity, dates and numbers, the Board patterns approved at gate 2, breakpoints and the glance test. The Header section is rewritten to describe the shipped FO02 header plus the FO06 placement rule. Components list extended with the FO01–FO05 primitives. Enforcement adds the lint ratchets and screenshot baselines |
| Gate 2: page modes on phones | `FilterBar` has a new `modes` slot (passed through `ContextBar`). Showcase Focus and Roster Shapes Observed/Projected moved there. Desktop: inline after a hairline, unchanged look. Below 768px: a full-width row under the Filters button instead of inside the sheet; long labels wrap rather than clip |
| Gate 2: search pill placement | Header grid is now `minmax(max-content, 1fr) · minmax(0, 380px) · minmax(max-content, 1fr)`: page-centred wherever the nav leaves room, otherwise as close as possible, never overlapping |
| Lint (mechanically detectable v1.1 rules) | ESLint `no-restricted-syntax` errors on native `<input type="date">` and on raw `<h1>` outside `PageHeader`. Files not yet rebuilt are listed in `PENDING_NATIVE_DATE` (11 files) and `PENDING_RAW_TITLE` (41 files) in `dashboard/eslint.config.mjs`, each tagged with the FO block (FO08–FO14) that removes them. A probe file outside the lists produced both errors |
| Screenshot baselines | `dashboard/e2e/visual-baselines.spec.ts`: Player Showcase, Roster Shapes picker, Roster Shapes depth chart, search modal and `/design` at 1440×900 and 390×844 (10 baselines in `e2e/visual-baselines.spec.ts-snapshots/`), mock API, fixed empty workspace, fonts and in-viewport images loaded, animations off, `maxDiffPixelRatio` 0.01 |
| `/design` | Example filter bar shows the `modes` slot; new "Logo-grid picker" panel with `TeamGrid` (30 tiles) |

## Measurements (`measurements.json`)

**Search pill** (380px wide), centre minus page centre:

| Width | 1024 | 1280 | 1440 | 1740 | 1920 | 2000 |
| --- | --- | --- | --- | --- | --- | --- |
| Offset | 0 | +198 | +118 | 0 | 0 | 0 |
| Gap after nav | (nav collapsed) | 16 | 16 | 49 | 139 | 179 |

Before FO06 the pill sat +253px right of centre at every desktop width. At 1280–1440 exact centring
would need a pill under 150px wide (the nav ends at x=632), so it sits one gap after the nav.

**Mode rows on phones:**

| Page | Width | Visible outside sheet | Item heights | Overflow | Sideways page scroll |
| --- | --- | --- | --- | --- | --- |
| Showcase (4 options) | 390 / 360 | yes / yes | 40 ×4 / 40 ×4 | 0 / 0 | no / no |
| Roster Shapes (2 options) | 390 / 360 | yes / yes | 40 ×2 / 40 ×2 | 0 / 0 | no / no |

An earlier measurement found the phone mode buttons at 36px (a more specific filter-bar rule won);
the rule was raised and re-measured at 40px. `/design`: 30 team tiles, 1 modes slot.

## Glance test (pages changed by this block)

| Item | Header (all pages) | Showcase 390 | Roster Shapes 390 |
| --- | --- | --- | --- |
| 2 Filters | n/a | Pass (Focus visible, 40px, no clipping) | Pass (Observed/Projected visible, 40px) |
| 4 Alignment | Pass (pill centred where it fits; measured above) | Pass | Pass |
| 9 Phone | Pass (unchanged search icon) | Pass (no sideways scroll) | Pass |

Desktop layouts of Showcase and Roster Shapes are unchanged apart from the slot name; their other
glance items stand as recorded in FO04/FO05 and are now held by the screenshot baselines.

## Checks

| Check | Result |
| --- | --- |
| `npm --prefix dashboard run lint` | 0 errors, 0 warnings (with the two new rules) |
| `npm --prefix dashboard run typecheck` | pass |
| `npm --prefix dashboard test` | 49 files, 337 tests pass |
| Baselines, production build of an isolated copy | generated, then 10/10 on two further runs with no diff |
| Playwright, all 264 tests, serial, production build of an isolated copy | **249 pass, 15 skipped, 0 fail** (10 new baselines; the Roster Shapes phone test now also checks the visible 40px mode switch) |

## Open owner choice

- **Article template:** Methodology, What's New and Settings fit none of the five D22 templates.
  v1.1 records an Article template (readable ~720px column with a table of contents) as a
  proposal. FO13 needs the owner's yes or an alternative before rebuilding those pages.
