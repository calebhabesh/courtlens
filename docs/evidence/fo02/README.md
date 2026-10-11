# FO02 header, search and drawer: evidence

Measured 2026-10-09 on branch `frontend-overhaul`. Parent: [frontend overhaul handoff](../../frontend-overhaul-plan.md).
Reproduction: `node scripts/repro_fo02_overlays.cjs [baseUrl] [outFile]`. Screens:
`node scripts/capture_fo02_evidence.cjs [baseUrl]`. Both ran against the dashboard at
`localhost:3100` with real data.

## Step 1: the containing-block hypothesis

The plan's hypothesis: the scrolled header's `backdrop-filter` makes the header the containing block
for `position: fixed` descendants, so the palette backdrop and the drawer are sized to the header.

| Check | Result |
| --- | --- |
| Synthetic page (`repro-before.json`, `synthetic`) | **Mechanism confirmed.** A `position: fixed; inset: 0` child of a sticky 56px header measures 800×600 without a filter and **800×56** once the header has `backdrop-filter` |
| Real header before the fix, Chromium | **Not the cause in Chromium.** The scrolled header's computed `backdrop-filter` was `none`. The source had `backdrop-filter` followed by `-webkit-backdrop-filter`; the CSS compiler kept only the prefixed declaration, which Chromium ignores. In Safari (prefixed form supported) the mechanism was live |
| Narrow search dim (before) | **Different cause.** The palette scrim carried the class `replica-search-container` (`max-width: 480px; margin: 0 auto`), so the dim was a 480px column at x=480 on a 1440px screen (`repro-before.json`, `palette-1440`) |
| Drawer cut off (before) | **Different cause.** `pages.css` set `.replica-mobile-drawer { max-height: 70vh }`: the panel was 630px of 900 and 591px of 844 |

Before-fix screenshots are in `before-fix/`.

## What changed

| Plan item | Implementation |
| --- | --- |
| Shared overlay layer | `components/ui/overlay-portal.tsx` renders at `document.body`. `Drawer`, `Modal`, `CommandPalette` and `GlobalCommandPalette` use it; `HotkeysModal` now uses `Modal`. Stacking uses only z-index tokens. The header blur is fixed too (standard property only, the compiler adds the prefix), so the portal is what keeps overlays correct |
| Search (D8) | One centred 640px modal over a full-page dim (full screen below 768px with a Close button). Groups: Players (headshot; team logos in the caption line), Teams (logo), Pages, and Recent on empty input (bounded to 6, `lib/recent-searches.ts`, scope-dependent team association dropped). The `→` row arrows and `↑↓ ↵` glyphs became wrapper icons. Lookup engine, normalization, debounce and cache are unchanged |
| Duplicate search icon | The icon button shows only below 768px, where it replaces the pill |
| Navigation (D9) | Desktop ≥1280px: nav + pill + Ask + `⋯`. Below 1280px the nav and `⋯` move into the drawer and the hamburger appears. `⋯` holds Settings, Data status, Methodology, What's New, Schedule, Planner, then Availability and Keyboard Shortcuts. Header grid is `auto 1fr auto`, so the pill can only use leftover width |
| Regroup (FO07 targets) | `lib/nav-model.ts` drives the menus, the drawer and availability. Research: Impact (RAPM, Six-Factor, WOWY, Defensive Matchups, EPV), Shooting, Trends & Distributions, Forecasts & Evaluation, Tools (Wingspan, Calculator). Tier Lists moved to Players; WOWY left the top bar for Research › Impact. Hrefs still point to the existing routes until FO07 |
| Drawer | Full height, readable, focus moves in, Tab is trapped, Escape closes. Collapsed accordion content is now `inert` and its padding collapses (before, Tab reached hidden links and a sliver of the first link showed) |

## Step 1 re-test after the fix (`after-fix/repro.json`)

Each overlay was opened on a fresh page at 1440, 1280, 1024 and 390px, unscrolled and scrolled 600px
(scrolled cases have the header blur active: computed `backdrop-filter: blur(12px) saturate(1.4)`).

| Check | Result |
| --- | --- |
| Search dim covers the viewport | 8/8 cases |
| Search modal width | 640px at 1440/1280/1024; full screen at 390 |
| Overlay inside the header element | 0/12 |
| Drawer panel full viewport height | 4/4 (1024, 390, both scroll states) |
| Drawer takes focus; Tab ×40 stays inside; panel is the top element; Escape closes | 4/4 |
| Hamburger visible | no at 1440/1280; yes at 1024/390 |
| Search pill overlaps nav or right actions | 0 |
| Search icon button visible | only at 390 |

## Screens (`screens/`)

`header-{1440,1280,1024,390}` and `-scrolled`, `menu-research-1440`, `menu-more-1440`,
`search-player-1440`, `search-team-1440`, `search-empty-recent-1440`, `drawer-{1024,390}`,
`search-player-{1024,390}`.

## Checks

| Check | Result |
| --- | --- |
| `npm --prefix dashboard run lint` (ESLint + Stylelint) | 0 errors, 0 warnings |
| `npm --prefix dashboard run typecheck` | pass |
| `npm --prefix dashboard test` (Vitest) | 45 files, 325 tests pass (11 new) |
| Playwright, all 247 tests, serial, against the mock API | **232 pass, 15 skipped, 0 fail** on a production build of an isolated copy. Two earlier runs against `next dev` had 13 failures and then more on rerun: page crashes ("Page crashed", "Navigation failed because page crashed") on `/stats` and Ask with swap full. The same workbench spec passed 8/8 against `next dev` earlier, before memory ran out. One `stats-readability-search` failure during a recompile passed 3/3 on rerun |
| Last change after the suite | The phone-only search Close control became a text "Cancel" button (label and behaviour unchanged). Lint, typecheck and Vitest re-ran green; screens recaptured |

### Glance test (header-owned items)

| Item | Result |
| --- | --- |
| 1 Header (app header) | Pass: one row, no overlap at 1440/1280/1024/390 (`after-fix/repro.json`, `chrome`) |
| 7 Icons | Pass for header and search: wrapper icons only; `→`, `↑↓`, `↵` and the hotkeys `✕` glyphs removed |
| 8 States | Search: "Searching…", no-match and unavailable states are one line each |
| 9 Phone | Pass: drawer and search are full height or full screen; header controls are 40px below 1280px; drawer links are 40px |

## Test changes (D14: none of these strings is contract wording)

- `header.test.tsx`: the `⋯` menu asserts Methodology, What's New, Schedule and Planner instead
  of "Definitions & Glossary" (renamed by D9). The drawer is looked up in `document` and asserted
  outside the header. New tests: palette outside the header, Recent above Pages, drawer groups
  equal the desktop menu groups, collapsed sections are `inert`.
- `e2e/header-command-palette.spec.ts`: "Definitions & Glossary" → "Methodology".
- `e2e/stats-readability-search.spec.ts`: the search modal is located by `.ui-command-palette`
  instead of `.replica-search-container` (the class that caused the 480px dim). Assertions unchanged.
- New: `lib/nav-model.test.ts` (every href exists under `app/`, no duplicates, FO07 groups, D9
  links, active section) and `lib/recent-searches.test.ts` (bounded, de-duplicated, drops team
  association, ignores malformed storage).

## Known limits

- Blog and Interactive Learning are no longer in the nav. Both pages still exist: Methodology links
  to Learning ("Worked lessons") and Learning links to Blog. FO07 folds them into Methodology and
  What's New.
- Header dropdown menus stay anchored inside the header (`position: absolute`), so the
  containing-block issue does not apply to them; only fixed overlays use the portal.
- The Stats drawer and compare tray are page-level fixed elements, not in the header; FO13 checks
  them with Stats.
- At 1024px the filter bar wraps to two rows; FO14 owns the tablet pass.
