# FO03 icon system: evidence

Measured 2026-10-09 on branch `frontend-overhaul`. Parent: [frontend overhaul handoff](../../frontend-overhaul-plan.md).
Rendered counts: `node scripts/measure_fo03_icons.cjs` (`icons.json`). Screens:
`node scripts/capture_fo03_evidence.cjs` (`screens/`). Both ran against `localhost:3100` with real data.

## What changed

| Plan item | Implementation |
| --- | --- |
| Wrapper only | `components/ui/icon.tsx` gained 30 icons (swap, lock, plus, table, chart, trend, cards, save, scale, refresh, camera, zap, reset, pin/unpin, person, chart-column/line, scatter, expand/collapse, help, …). `IconSize` is `14 \| 16 \| 20`; `filled` marks an active outline glyph (favorited star) |
| Direct Lucide imports (3 files) | `stats-workspace.tsx`, `stats-preview-rail.tsx` and `workbench-player-explorer.tsx` use the wrapper. Their 15/28/38px icons became 14/20/20 |
| Off-scale sizes | 10/12 → 14, 18 → 20 (`lg` buttons, inputs, selects, search input), 24 → 20 (PageHeader, EmptyState) |
| Glyph and emoji icons | 151 source occurrences in 37 files (FO00 counted 100 with a fixed list). All icon uses replaced: back links use the `left` chevron; decorative `→` on links and buttons removed; ✓/✕/★/☆/▲/▼/⇄/🔒/⬇/⚠/💾/⚙/📊/📈/☷/🂡/🔄/📸/⚡/🏀/○ became wrapper icons; typed `+` prefixes on six create buttons became the `plus` icon. Where a glyph carried meaning, `sr-only` text names it ("Current season", "advantage", "Default view", "Favorite") |
| Icon-only buttons | Four buttons that became icon-only had no accessible name; each now has an `aria-label` |
| Lint (D26) | `no-restricted-imports` bans `lucide-react` outside `ui/icon.tsx` (including the rest of `components/ui`). `no-restricted-syntax` bans U+2190–21FF, U+25A0–25FF, U+2600–27BF, U+2B00–2BFF and emoji (U+1F000–1FAFF) in JSX text, string literals and template strings. Tests and e2e specs are exempt. A probe file confirmed it flags a Lucide import, `→`, `✓`, `➜` in a template string and a new emoji (🦄), and allows `⌘` and `×` |
| Allowlist | Exceptions use `eslint-disable` comments that state the reason: the multi-player chart legend marker symbols (data encoding), SVG axis direction labels ("Older games (←)", "Offensive Rating … →"), and the shot-chart legend prose ("○ made; × missed") |
| Design language | `design-language-v1.md` has a new "Icons (D26, FO03)" section (source, sizes, stroke, color, spacing, accessibility, exceptions) and the lint rule under Enforcement. A note marks the header section as superseded by FO02 until FO06 |
| Dead code | `components/nav-rail.tsx` (emoji nav) and `components/workbench-shell.tsx` (its only importer) were removed; nothing imports either |

## Rendered result (`icons.json`, all 54 FO00 routes at 1440px)

| Measure | Before (FO00) | After |
| --- | --- | --- |
| Glyph/emoji characters in visible text | 382 | **0** on all 54 routes |
| Routes with any | 16 | **0** |
| Lucide SVGs outside the wrapper (`svg.lucide:not(.ui-icon)`) | (3 files) | **0** |

The detector was checked by injecting "Profile → ✓ 🏀 ⇄" into a live page; it found all four. The
kept exceptions are not on any route's default view (they appear on chart tabs).

## Checks

| Check | Result |
| --- | --- |
| `npm --prefix dashboard run lint` | 0 errors, 0 warnings |
| `npm --prefix dashboard run typecheck` | pass |
| `npm --prefix dashboard test` | 46 files, 327 tests pass (2 new: wrapper decorative/size/filled) |
| Playwright, all 247 tests, serial, production build of an isolated copy against the mock API | **232 pass, 15 skipped, 0 fail** |
| e2e assertions changed | `table-interactions`: "Compare first 2 →" → "Compare first 2"; `workbench`: "View Full Profile →" → "View Full Profile" (D26 removes decorative arrows; neither is contract wording) |
| After the suite | The six typed `+` prefixes became the `plus` icon (labels unchanged, none asserted by e2e). Lint, typecheck and Vitest re-ran green; screens and counts re-measured |

### Glance test

| Item | Result |
| --- | --- |
| 7 Icons | **Pass on all 54 routes:** wrapper Lucide only, no emoji or arrow characters in rendered text, sizes limited to 14/16/20 by type |

## Found and fixed: filter bar gutter (FO01 regression)

FO03 screenshots showed the filter bar's "Season" label touching the left screen edge on pages
that render the bar full width (Teams, Recent Games, Showcase, Team Compare, Playoffs, player,
team and series pages). FO01 replaced the old `context-bar` element (which had the gutter) with
`FilterBar`. FO01's glance check measured label/control alignment but not the gutter. Fixed in
`foundation.css` (`.route-enter > .ui-filter-bar`); measured after: controls start at 24px
(desktop) and 16px (390px) on all 9 full-width pages, matching page content. Stats (inside its
own padded workspace) and `/design` are unchanged.

## Owner review gate 1

Review these at both widths, then record approval or changes in the progress log.

| Area | Screens |
| --- | --- |
| Header | `../fo02/screens/header-{1440,1280,1024,390}[-scrolled].png` |
| Menus | `../fo02/screens/menu-research-1440.png`, `menu-more-1440.png` |
| Search | `../fo02/screens/search-{player,team,empty-recent}-1440.png`, `search-player-{1024,390}.png` |
| Drawer | `../fo02/screens/drawer-{1024,390}.png` |
| Filter bar | `screens/filter-bar-teams-{1440,390}.png`, `screens/stats-{1440,390}.png`, `../fo01/` captures |
| `/design` primitives | `screens/design-{1440,390}.png`, `../fo01/` captures |
| Icons in place | `screens/{player-profile,team-profile,playoff-series,compare,last-games,data-status,investigations,rankings}-{1440,390}.png`, `stats-detail-1440.png`, `manage-views-1440.png` |
