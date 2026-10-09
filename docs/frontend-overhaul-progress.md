# CourtLens frontend overhaul progress

Parent: [frontend overhaul handoff](frontend-overhaul-plan.md). Design contract:
[design-language-v1](design/design-language-v1.md) (v1.1 after FO06). Plans are not runtime
evidence.

Allowed states: `planned`, `in_progress`, `implemented_unverified`, `verified`,
`verification_blocked`. A UI block is `verified` only with measured checks **and** a passing glance
test (see the handoff) on desktop and phone screenshots. Blocks before each owner gate also need
recorded owner approval.

## Planning baseline: 2026-10-09

- The owner confirmed D1–D26 through a grilling interview.
- The owner chose Opus 5.5 to implement every block.

## FO00 findings that change later blocks

- Header search pill overlaps the "Research" nav item at 1440px (FO02).
- Browser tooling must use `localhost:3100`; `127.0.0.1` fails the API CORS allowlist and breaks client fetches.
- `/investigations` shows raw timestamps, release UUIDs and hashes in its main list (33 UUIDs); FO12.
- D22's five templates don't cover `/methodology`, What's New or `/settings`; FO06 needs an
  Article template or an owner choice.
- Emoji outside the plan's list (🔄, 📸) render on `/data-status`; FO03 lint should match emoji
  ranges.
- The planning claim that inline styles "crept back" was wrong: all 41 are custom-property-only.

## FO01 findings that change later blocks

- Drawer blur root cause (confirmed): the drawer's own scrim was stacked above its panel. Fixed in
  FO01. FO02 still has to confirm and fix the header containing-block issue (narrow search dim,
  drawer cut off at ~600px).
- The `pages` CSS layer beats `components` regardless of specificity, so page-level element rules
  break primitives. Primitive structure lives in the new `foundation` layer (after `pages`).
- Never symlink `docs` into an e2e copy: evidence specs write into `../docs/evidence`.

## Owner gates

| Gate | After | Status | Notes |
| --- | --- | --- | --- |
| 1 | FO03 | pending | Header, search, drawer, filter bar, primitives |
| 2 | FO05 | pending | Showcase, Roster Shapes, search |

## Block status

| Block | Status | Measured evidence |
| --- | --- | --- |
| FO00 | verified | 2026-10-09. [Inventory](evidence/fo00/inventory.md): 53-route table (nav label, title, template, FO07 action, component, data); 388 required strings (44 caveat, 24 contract) in `evidence/fo00/required-wording.json`; 108 before screenshots (all 53 routes + 1 extra Live date × 1440/390, all HTTP 200) + 3 overlay captures in `evidence/fo00/before/`, recaptured through `localhost:3100` after the first run hit the API CORS allowlist. Counts: 100 glyph icons/33 files, 3 direct Lucide files, 41 `style={{` (all custom-property-only), 4 Load buttons, 18 native date inputs, 69 notice boxes, 0 pages with "Apr 12, 2026" dates. Checks: dashboard lint 0, typecheck 0, Vitest 39 files/286 tests pass; ruff clean. Glance test N/A (no UI change). |
| FO01 | implemented_unverified | 2026-10-09. [Evidence](evidence/fo01/README.md): PageShell + 5 templates, PageHeader, FilterBar (ContextBar migrated; bottom sheet <768px), Field, DatePicker + `formatDate`, ChipGroup, segmented variants, GatedNote, Data details (lineage drawer inside it), PlayerIdentity/TeamIdentity/EntityChip + team accents, StatTile, template skeletons, Advanced mode. Lint 0, typecheck pass, Vitest 43 files/314 tests; Playwright 231 pass/15 skip/1 pre-existing race (motion reduced-motion, reproduces on FO00). Glance items 2/6/7/8/9/10 pass on measured pages (`glance.json`). Drawer-blur root cause confirmed and fixed (scrim z-index above panel). Awaits owner gate 1. |
| FO02 | planned | |
| FO03 | planned | |
| FO04 | planned | |
| FO05 | planned | |
| FO06 | planned | |
| FO07 | planned | |
| FO08 | planned | |
| FO09 | planned | |
| FO10 | planned | |
| FO11 | planned | |
| FO12 | planned | |
| FO13 | planned | |
| FO14 | planned | |
