# FO01 shared foundation: evidence

Measured 2026-10-09 on branch `frontend-overhaul`. Parent: [frontend overhaul handoff](../../frontend-overhaul-plan.md).
Screenshots come from `node scripts/capture_fo01_evidence.cjs` and glance measurements from
`node scripts/measure_fo01_glance.cjs`, both run against the dashboard at `localhost:3100` with real data.

## What was built

All primitives live in `dashboard/components/ui/`, are exported from `components/ui/index.ts`, and
are shown in `/design` section 0. Their CSS is in `app/styles/foundation.css`, a new
`foundation` cascade layer ordered after `pages`.

| Plan item | Implementation |
| --- | --- |
| PageShell + five templates (D22) | `page-shell.tsx`: `PageShell`, `BoardLayout`, `ProfileLayout`, `CompareLayout`, `ResearchLayout` |
| PageHeader (D7) | `panel.tsx` `PageHeader` rewritten: title + actions on one row, one clipped subtitle line, no eyebrow |
| FilterBar (D6) | `filter-bar.tsx`: sticky; scope + page filters + count chip + Data details; below 768px a "Filters" button opens a bottom sheet. `context-bar.tsx` now renders it (Season · Phase · Through · optional Window), applies immediately and syncs the URL through `lib/scope-url.ts`. "Strictly prior to …" is gone from the bar; the exclusive rule is in Data details (D20) |
| Field | `field.tsx` (inline/stacked). `catalog-scope-fields.tsx` migrated to Field + Select + DatePicker |
| DatePicker + formatDate (D11/D20) | `date-picker.tsx` (keyboard grid, min/max, `isDateDisabled`); `lib/format-date.ts` ("Apr 12, 2026", "Apr 12", through/before conversion) |
| ChipGroup + segmented variants | `chip-group.tsx` (single = radio group, multi = toggles); `SegmentedControl` gains roving focus, `stretch`, the Stats accent-soft selected state |
| GatedNote + Data details (D4/D5/D14) | `gated-note.tsx` (one line + `<details>` "Why?", text stays in the DOM); `data-details.tsx` (`DataDetails`, `DataDetailsButton`); `lineage-drawer.tsx` now renders inside Data details |
| Identity (D10) | `identity.tsx`: `PlayerIdentity`, `TeamIdentity`, `EntityChip`; `lib/team-colors.ts` gives every catalog team an accent lightened to ≥3:1 on `--color-bg` |
| StatTile (D16) | `stat-tile.tsx`: value, unit, rank ("1st", "1st of 591"), percentile meter, em dash for unknown |
| Skeletons | `template-skeleton.tsx` for all five templates; phone variant mirrors the collapsed filter bar |
| Advanced mode (D5) | `lib/advanced-mode.ts` (`useAdvancedMode`, storage key `courtlens-advanced-mode-v1`); Settings → Advanced mode switch |

## Checks

| Check | Result |
| --- | --- |
| `npm --prefix dashboard run lint` (ESLint + Stylelint) | 0 errors, 0 warnings |
| `npm --prefix dashboard run typecheck` | pass |
| `npm --prefix dashboard test` (Vitest) | 43 files, 314 tests pass (28 new: URL sync, date conversion, DatePicker keyboard/disabled/min-max/Escape, Why? disclosure, Advanced mode incl. cross-tab, ChipGroup, PageHeader, StatTile, team accents) |
| Playwright, all 247 tests, run serially against mock API | 231 pass, 15 skipped, 1 fail: `motion-coverage` reduced-motion check. It races Stats' existing URL-normalizing navigation (`Execution context was destroyed`); the same trace reproduces on FO00 code and `--dur-base` reads `1ms` once settled. Not an FO01 regression |
| e2e assertion changed (D14, no contract requires the text) | `route-polish.spec.ts`: "Before date" input value → `Through date` picker `data-value` (one day earlier, same exclusive cutoff) |

## Glance test (applicable items)

FO01 changes shared primitives, not whole pages, so page-level items (header text, first screen,
identity coverage) are judged in the blocks that rebuild each page. Measured in `glance.json`:

| Item | Result |
| --- | --- |
| 2 Filters | Pass. Scope controls and the Data details button are 40px on `/stats`, `/teams`, `/design` (desktop and phone); 0 label/control misalignments >2px; 0 lookup-icon overlaps and 0 select-chevron overlaps on all five measured pages; no Load button in the filter bar |
| 6 Missing data | Pass for the bar: "Strictly prior" and the raw release ID no longer appear in it (`strictlyPrior: false` everywhere); the rule and IDs are in Data details |
| 7 Icons | Pass for new code: only the wrapper (`calendar`, `database` added) |
| 8 States | Template skeletons for all five templates |
| 9 Phone | Pass: no sideways scroll on the measured pages (this also fixes FO00's `/design` overflow); filter bar collapses to "Filters"; touch targets 40px |
| 10 Dates | Pass in the new primitives: one format (`Apr 12, 2026`, compact `Apr 12`) |

## Defects found and fixed while building

1. **Drawer blur, confirmed root cause.** Inside `.ui-drawer-root` the scrim used `--z-modal`
   (60) and the panel `--z-drawer` (50), so the scrim's `backdrop-filter: blur(4px)` was painted
   over the drawer panel. Every Drawer (hamburger, Data details, Filters sheet) rendered its own
   contents blurred, scrolled or not. Fixed in `foundation.css` (panel above its own scrim).
   FO02 still owns the header containing-block issue (search column, drawer cut off at ~600px).
2. **Layer order defeats component padding.** Page-level element rules in the `pages` layer
   (for example `.research-links input, .research-links select { padding }`) beat any
   `components` rule regardless of specificity. That caused the Roster Shapes icon overlap and,
   once fields were migrated, clipped select chevrons. Lookup fields now keep the icon and clear
   button in the flow, and select padding is pinned in the `foundation` layer.
3. **Nowrap subtitles widen flex parents.** A one-line clipped subtitle needs `min-width: 0` on
   flex ancestors; `.ui-page` sets it, and `/design` now does too.

## Known limits (owned by later blocks)

- `CatalogScopeFields` still sits inside legacy forms with "Load …" buttons and release-ID inputs
  on Roster Shapes, WOWY/Teammate Stat Shift and the shooting tools; FO05, FO07 and FO11 replace
  those forms with the FilterBar.
- The Advanced mode hook is not read by any page yet; pages adopt it as their raw fields move
  into Data details (FO04 onward).
- Stats still uses its own header markup; FO13 aligns it with `PageHeader` without regressing it.
- The header, search and hamburger issues visible in every screenshot are FO02.

## Test-environment notes

- Next 16 refuses a second `next dev` in the same directory, and Turbopack rejects a symlinked
  `node_modules`. The e2e suite ran from a scratch copy with its own `node_modules` on port 3101
  against `e2e/mock-api.mjs`.
- The `dl0x-evidence` and `im06/im07` specs write screenshots into `../docs/evidence/…`. The copy
  received real copies of only the three fixtures specs read
  (`b21-api-smoke.json`, `b23-api-smoke.json`, `b29-finance-query.json`). An earlier run with a
  symlinked `docs` overwrote 105 committed evidence PNGs; all were restored from git (no diff
  remains).
- Under memory pressure (swap full), Chromium crashed on `/stats` for both FO00 and FO01 code.
  Parallel runs were invalid; the results above are from serial runs after freeing memory.
