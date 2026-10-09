# CourtLens frontend overhaul: page structure, layout and visual hierarchy

Prepared 2026-10-09. **The owner confirmed every decision below through a grilling interview on
2026-10-09. Blocks FO00–FO14 are pending until the [progress log](frontend-overhaul-progress.md)
records measured evidence.** A plan is not runtime evidence.

## Why this exists

The refresh handoff ([courtlens-refresh-plan](courtlens-refresh-plan.md), DL01–DL08) is recorded as
`verified`: tokens, zero inline styles, lint clean, 1440/375 screenshots. The owner still finds
almost every page disorganized, hard to scan and visually careless. Examples from the owner's
screenshots on 2026-10-09:

- **Player Showcase:** the Focus options run together as plain text ("Overall ImpactScoring &
  Shooting…"). Previous/Play/Next is not centered. Five stacked full-width action buttons. No
  imagery on the card. A "TEMPORAL DISCIPLINE: game_date < …" footer inside the card.
- **Roster Shapes:** titled "Roster allocation diagrams". A raw form with a "Release ID (optional)"
  input and a "Load participation" button. The search icon overlaps the team input's text. A
  paragraph of caveats under the form.
- **Search:** opening ⌘K produces a narrow, full-height dimmed column, not a centered modal over a
  dimmed page.
- **Hamburger drawer:** the whole screen blurs and the drawer contents can't be read.
- **Live:** two date formats on one screen (`2026-10-08` and `10/08/2026`). A research
  release/season/phase/cutoff form with a "Load finalized research" button. A five-line "No
  Admitted Finals" box listing release UUIDs and boundary rules, plus a second notice repeating it.

**Lesson for every block below:** the earlier checks proved that rules were followed (tokens, lint,
no inline styles), not that a page was well designed. Every block here has **visual acceptance
criteria** (see "Glance test") and an owner-review or screenshot-baseline gate. Passing lint is
necessary, not sufficient.

The owner's standard is the current **Stats Explorer** (`/stats`, `components/stats-explorer.css`,
`components/stats-workspace.tsx`). Every page should reach that level of care.

## Scope and precedence

- This handoff **supersedes** the refresh handoff's DL track and the
  [polish/freeze handoff](polish-freeze-implementation-plan.md) for page layout, page structure,
  header/search/drawer behavior, copy density and icon usage. Where they conflict with a decision
  below, this document wins.
- It **keeps** every analytical, data and identity contract: temporal discipline, append-only hashed
  data, sealed evidence, no inferred claims, the entity-picker, team-branding and table/group-guide
  rules in [polish-ui-contract](design/polish-ui-contract.md), and source gates in
  [live-ui-v1](design/live-ui-v1.md) and the replica contracts.
- [Design Language v1](design/design-language-v1.md) stays in force. FO06 amends it to **v1.1**,
  adding page templates and the patterns approved in FO04/FO05.
- **Out of scope:** Ask's layout, side panel, threads and streaming
  ([assistant agent handoff](assistant-agent-plan.md)). Ask only picks up shared header, token and
  typography changes. Also out of scope: light mode, backend/analytics changes, and new data
  sources.
- **Model:** the owner chose Opus 5.5 for every block.

## Locked decisions

| # | Decision |
| --- | --- |
| D1 Order | Shared foundation first, then header/search/drawer, then icons, then **owner review**, then prototypes (Showcase, Roster Shapes), then **owner review**, then design language v1.1 and baselines, then route consolidation, then page groups. No page-by-page polishing before the foundation exists. |
| D2 Reference | Stats Explorer's spacing, filter layout, table treatment and density become the shared standard. Move its CSS out of `stats-explorer.css` into the shared layers so every page gets it by default. |
| D3 Route triage | Merge, hide and regroup routes as listed under FO07, with redirects so old URLs and saved links keep working. |
| D4 Missing data | Gate it at the source where possible: dates with no games can't be picked, and unavailable features are hidden or greyed out in the nav (extend `lib/route-availability.ts`). Otherwise show **one plain line** ("No games on Oct 8.") plus a **"Why?"** disclosure holding the detail. No multi-line explanation boxes in the main flow. Unknown is still stated as unknown, never as zero. |
| D5 Technical fields | Release UUIDs, dataset IDs, hashes, "exclusive cutoff" rules and source routes move into the existing lineage drawer, renamed **Data details**. No release-ID inputs on normal pages. A Settings → **Advanced mode** toggle reveals raw fields for power users. |
| D6 Filter bar | One sticky global filter bar: **Season · Phase · Through date** always, **Window** only where a page uses it. Changes apply immediately and sync to the URL. **No "Load …" buttons.** Page-specific filters sit to the right as chips or segmented controls. The release selector lives in Data details. A count/coverage chip sits on the right ("591 players"). |
| D7 Page header | A large **Title Case** title that matches the nav label exactly, at most one short subtitle line, and the page's main actions aligned right on the same row. Disclaimers move into "Why?" or Data details. |
| D8 Search | One search. The header pill or ⌘K opens a single **centered modal (~640px wide) over a full-page dim**. Results grouped: Players (headshots + team logo), Teams (logos), Pages, Recent. Remove the duplicate magnifier icon on the right of the header. |
| D9 Navigation | Desktop uses the top nav plus the `⋯` menu (Settings, Data status, Methodology, What's New, Schedule, Planner). The **hamburger appears only below the desktop breakpoint**. Fix the drawer blur bug. |
| D10 Imagery | Large headshot + team logo + team-color accent on player profiles, showcase cards, comparisons and entity headers. 16–20px logos next to team abbreviations in tables and rosters. Headshots in search results, the compare tray and roster/depth-chart chips. **Dense tables get logos only, no headshots**, except where existing group-guide rules already place portraits. Missing photo: initials on team color. |
| D11 Polish scope | One date display format; a styled date picker replacing native inputs; numbers right-aligned with tabular digits; loading skeletons instead of blank areas; desktop/tablet/phone layouts; keyboard and screen-reader support. **No light mode.** |
| D12 Prototypes and doc | Showcase, Roster Shapes and the new search/header are built first as working pages for owner review. Approved patterns become Design Language v1.1 page templates and screenshot baselines. |
| D13 Plan home | This document + [progress log](frontend-overhaul-progress.md), linked from AGENTS.md. The refresh handoff stays in force for the rename and motion work. |
| D14 Required wording | Where a contract or test requires specific on-page wording (for example "Missing participation is not a confirmed zero…"), keep the wording but **move it inside the "Why?" disclosure** so it is still rendered. Wording no contract requires can be shortened, with tests updated. FO00 inventories which contracts require which text before anything changes. |
| D15 Showcase | Title row: "Player Showcase", player search, one **Export** menu (PNG/SVG). **Focus** is a 4-option segmented control under the title. A larger centered card with headshot, team logo and team-color accent. Previous · Play · Next and an "n / N" counter **centered directly under the card**. Right rail: name + logo, a row of icon buttons (Favorite, Compare, Games, Profile, PvP) with tooltips, and a roster list with small headshots and logos. |
| D16 Showcase card | Each stat shows its value plus a league **percentile bar and rank** ("33.5 PPG · 1st"). The stats shown change with Focus. No radar chart. The temporal footer becomes one context line ("2025-26 Regular Season · Through Apr 12, 2026"), kept on screen and in exports. |
| D17 Roster Shapes | Team picker: a **30-logo grid** (plus search). Team header with logo, name and team color. Main view: a **depth chart** with five lanes (PG, SG, SF, PF, C) plus Unassigned. Players are headshot chips showing minutes; dragging moves a chip between lanes (keyboard alternative required). Each lane has a minutes-share bar. Every player starts **Unassigned** (no positional source exists), with one line saying positions are the user's assignments. The table goes below, collapsed by default. |
| D18 Roster modes | An "Observed / Projected" segmented control. In Projected mode, minutes are editable on chips, with a running total gauge against 240 minutes per game (red over, amber under). Export sits in the title row. |
| D19 Live | A scrollable date strip with a game-count badge per date; dates with no games dimmed. Tabs: **Live · Finals · Playoffs**. The research release/season/phase/cutoff form is removed (D6 replaces it). Empty state: "No games on Oct 8" plus jump buttons to the nearest dates that have games. |
| D20 Global labels | "Through Apr 12, 2026" replaces "Strictly prior to 2026-04-13". The meaning is identical (`game_date < 2026-04-13`) and the exclusive rule stays in Data details. |
| D21 Compare | Each entity header gets a large headshot or logo in its team color. One row per stat: a bar per side, the higher value in bold, percentile chips. **No winner label, verdict or overall score.** Bolding the larger number states a fact; it is not a recommendation. |
| D22 Templates | Five page templates. **Explorer:** Stats, Rankings, Team Stats, Players directory. **Profile:** player/team pages (hero, tabs, summary tiles). **Compare:** Player, Team, Matchups, WOWY. **Board:** Showcase, Roster Shapes, Tier List, Live. **Research:** header → filter bar → key-findings row → charts/tables, with method notes in Data details. Every page uses one of them. |
| D23 Ask | Leave Ask's layout alone; it only picks up shared header, token and typography changes. |
| D24 Rollout | Branch `frontend-overhaul`, editing real routes directly (no feature flag). One commit per block. Playwright screenshots at desktop and phone widths for each review. Stop for owner review after FO03 and after FO05. |
| D25 Breakpoints | Desktop ≥1280px is the main target, then tablet 768px and phone 390px. On narrow screens: tables scroll sideways with the first column fixed, the filter bar collapses into a "Filters" button that opens a bottom sheet, and Board pages stack into one column. |
| D26 Icons | **Lucide only, always through `components/ui/icon.tsx`.** Replace every text-character and emoji icon (→ ✓ ✕ ★ ☆ ← ◀ ▶ ↑ ↓ ⚠ 🏀 📊 📈 ⚡). Remove decorative arrows on buttons ("Recent Games Log →"). One stroke width; sizes 14/16/20; color follows the surrounding text; accent only for active or selected states; no multicolor icons. Lint bans direct `lucide-react` imports outside the wrapper and emoji/arrow characters used as icons in JSX. Team logos and headshots are content, not icons. |

## Facts checked during planning (2026-10-09)

- 53 `page.tsx` routes under `dashboard/app`.
- Assets on hand: 30 team logos in `public/team-logos` plus `lib/team-branding.json`, a
  `components/team-logo.tsx` component, and `components/player-portrait.tsx` serving cached NBA
  headshots through `/api/workbench/players/{id}/portrait` with an initials fallback. **No new
  asset sourcing is needed.** `public/icons` holds only app/favicon images.
- Icons: the Lucide wrapper `components/ui/icon.tsx` (~30 icons) is used in 26 files. Direct
  `lucide-react` imports also appear in `stats-workspace.tsx`, `stats-preview-rail.tsx` and
  `workbench-player-explorer.tsx`. About 100 text-character/emoji icons: → 38, ✓ 16, ✕ 14, ★/☆ 14,
  ← 7, 🏀 3, 📊 2, ◀ 2, and one each of ▶ ↑ ↓ ⚠ 📈 ⚡.
- 41 `style={{` remain despite DL07's "zero" claim: `app/design/page.tsx` 24, distributions view 7,
  multi-player lines 3, team compare 2, and one each in scatter plot, team logo, player explorer,
  tier list and skeleton. FO14 brings these to 0, or to allowlisted custom-property-only uses.
- CSS: `app/styles/components.css` is 5,100 lines and `pages.css` 4,603. Tokens 97, base 135,
  motion 120. `components/stats-explorer.css` is 214 and `components/impact.css` is separate.
- UI primitives already exist in `components/ui/`: accordion, badge, button, checkbox, controls,
  drawer, empty-state, icon, input, menu, modal, panel, presence, segmented-control, select,
  skeleton, sliding-indicator, switch, table, tabs, toast, tooltip, command-palette, header. **Extend
  these; do not create parallel lookalikes.**
- `components/ui/header.tsx` (1,085 lines) defines the nav menus inline. Research has 16 items in
  two sections. Help has 4. The mobile drawer and command palette live in the header tree.
- **Likely cause of the search-column and drawer-blur bugs (unverified hypothesis):** no overlay
  uses `createPortal` (`command-palette.tsx`, `drawer.tsx`, `modal.tsx` and `header.tsx` have
  none). The scrolled header sets `backdrop-filter: blur(12px)` (`components.css` ~line 112), which
  makes the header the containing block for `position: fixed` descendants. So the palette backdrop
  and the drawer are positioned and blurred relative to the header, not the viewport. FO02 must
  confirm this before fixing.
- The search-icon overlap on the Roster Shapes team field comes from `components/lookup-input.tsx`
  (`.lookup-search-icon`) used by `EntityField`, so it affects every entity field.
- `components/roster-allocation-view.tsx` (48 lines, dense one-liners) owns its own form
  (`EntityField` + `CatalogScopeFields` + release input + "Load participation").
- `components/context-bar.tsx` renders the global context with "Strictly prior to {beforeDate}".
  The same phrase appears in `workbench-player-profile.tsx` and `multi-player-lines-view.tsx`.
- `lib/route-availability.ts` already maps routes to catalog capabilities and marks unavailable
  routes `secondary`. The header already filters menus with it.
- Playwright specs live in `dashboard/e2e`. There are no `toHaveScreenshot` baselines yet.

## Glance test (visual acceptance for every page)

A page can only be marked `verified` when its desktop and phone screenshots pass all of these.
Record pass/fail per item in the block evidence.

1. **Header:** a Title Case title matching the nav label; at most one subtitle line; actions aligned
   right on the title row.
2. **Filters:** one filter bar in the shared position; no "Load" button; every control is 38–40px
   tall with its label aligned; no overlapping icons or clipped text; selected states visible
   without hovering.
3. **First screen:** the main result (table, card, chart or board) starts within the first 400px at
   1440×900. Before it there is no paragraph longer than one line and no notice box.
4. **Alignment:** controls and content snap to the 4px grid; groups share left edges; centered
   things (playback controls, card) are actually centered (±2px measured); numbers are
   right-aligned with tabular digits.
5. **Identity:** every player shown as a primary subject has a headshot; every team abbreviation in
   a header or chip has a logo; dense tables follow D10.
6. **Missing data:** at most one line in the main flow, plus "Why?". No UUIDs, hashes or code-like
   rules (`game_date < …`) outside Data details, unless Advanced mode is on.
7. **Icons:** wrapper Lucide only; no emoji or arrow characters; one size per context.
8. **States:** loading shows a skeleton of the final layout; empty and error states are one line
   with a useful action.
9. **Phone:** no sideways page scroll; the filter bar collapses to "Filters"; touch targets ≥40px.
10. **Dates:** one display format throughout ("Apr 12, 2026"; compact "Apr 12" in date strips).

## Blocks

Every block: start from a clean `git status` on `frontend-overhaul` (stop if another agent's work is
uncommitted), commit once at the end, and record evidence in the progress log. Every block runs
`npm --prefix dashboard run lint`, `typecheck`, `test` and the affected Playwright specs. Python
checks run only if Python files change. No other agent edits `dashboard/` during FO blocks.

### FO00 Inventory and baseline

1. **Route inventory:** for each of the 53 routes, record nav label, current title, template (D22),
   FO07 action (keep/merge/hide), main component file and data dependencies.
2. **Required-wording inventory (D14):** grep contracts (`docs/design/*.md`, replica/freeze/live
   contracts) and tests (`*.test.tsx`, `e2e/*`) for asserted on-page strings. Record each string,
   where it is required and where it is rendered now. This is the list FO blocks must keep (behind
   "Why?").
3. **Baseline screenshots:** every kept route at 1440×900 and 390×844, saved under
   `docs/evidence/fo00/before/`.
4. Record counts: glyph/emoji icons, direct Lucide imports, inline styles, "Load" buttons, native
   date inputs, notice boxes in the main flow, and date format variants.

### FO01 Shared foundation

Extend `components/ui/` and the CSS layers. Lift Stats Explorer's patterns into shared CSS.

- `PageShell` + the five template layouts (D22) with consistent gutters and max widths.
- `PageHeader` (title, subtitle, actions slot), enforcing D7.
- `FilterBar` (D6): wraps the context bar, holds page-specific filter slots, applies immediately,
  syncs to the URL, and collapses to a bottom sheet on narrow screens. Migrate
  `context-bar.tsx`/`CatalogScopeFields` behind it.
- `Field`: one label/input/select/date treatment. Icon inputs reserve padding so icons never
  overlap text (fixes `.lookup-search-icon`).
- `DatePicker` (styled, keyboard accessible, can disable dates) and a `formatDate` utility (D11,
  D20).
- `ChipGroup` and segmented control variants with clear selected and focus states, for filters
  and Focus.
- `GatedNote`: one line plus a "Why?" disclosure (D4/D14). `DataDetails`: rename and extend the
  lineage drawer (D5).
- `PlayerIdentity` / `TeamIdentity` / `EntityChip` (headshot/logo + name + team accent; D10).
- `StatTile` with value, label, percentile bar and rank (D16), reused on profiles and compare.
- `Skeleton` layouts for each template.
- Settings → Advanced mode toggle (persisted locally), read through one hook.

Evidence: `/design` style guide updated with each primitive, desktop and phone screenshots, and unit
tests for URL sync, date disabling, the Why? disclosure and Advanced mode.

### FO02 Header, search and drawer

1. Confirm the containing-block hypothesis with a minimal reproduction. Then render palette, drawer,
   modal and menus through a shared portal layer at `document.body` with z-index tokens. Re-test
   with the header scrolled and unscrolled.
2. Search (D8): the header pill and ⌘K open one centered modal over a full-page dim. Grouped results
   (Players with headshot + logo, Teams with logo, Pages, Recent), keyboard navigation, focus
   return. Remove the duplicate right-side search icon. Keep the lookup engine, normalization and
   cache rules from polish-ui-contract.
3. Navigation (D9): hamburger only below 1280px; desktop `⋯` menu holds Settings, Data status,
   Methodology, What's New, Schedule and Planner. The drawer is readable (no blur over its own
   content), traps focus and closes on Escape.
4. Regroup the nav to match the FO07 targets in the same change. Labels can change ahead of route
   merges, but hrefs still point to the existing routes until FO07.

### FO03 Icon system (D26)

Replace all glyph/emoji icons and direct Lucide imports. Add missing icons to the wrapper. Add the
ESLint rules (ban `lucide-react` outside `components/ui/icon.tsx`; ban emoji/arrow characters
used as icons in JSX text, with an allowlist for genuine prose such as arrows inside sentences).
Document sizes and colors in the design language.

**→ Owner review gate 1:** screenshots of the header, search, drawer, filter bar, and `/design`
primitives at both widths. Do not start FO04 without approval recorded in the progress log.

### FO04 Prototype: Player Showcase (D15, D16)

Rebuild `player-showcase-view.tsx` on the Board template. Percentiles come from the existing
catalog/percentile selectors with the same cohort rules as Stats (no new formula). Exports keep the
context line and produce the same card visible on screen. Measure that the card and playback
controls are centered (±2px).

### FO05 Prototype: Roster Shapes (D17, D18)

Rebuild `roster-allocation-view.tsx` on the Board template using the FilterBar (no form, no release
input, no Load button; loads when a team is selected). The logo-grid picker, depth chart with
drag-and-drop **and** a keyboard/menu alternative for moving chips, lane share bars, the
Observed/Projected control and the 240-minute gauge. Keep the export JSON schema
(`roster-minute-allocation-v1`) byte-compatible. Required caveats go behind "Why?".

**→ Owner review gate 2:** Showcase, Roster Shapes and search at both widths. Iterate until approved.

### FO06 Design Language v1.1 and baselines

Amend `docs/design/design-language-v1.md` → v1.1. Add the five templates, header/filter/gated
patterns, identity rules, the icon rules and the glance test. Add Playwright `toHaveScreenshot`
baselines for the approved pages and `/design`, plus lint/stylelint rules for patterns that can be
detected mechanically (for example, no raw native `type="date"` outside `DatePicker`).

### FO07 Route consolidation (D3)

| Action | Routes |
| --- | --- |
| Merge → tab | `/six-factor-rapm` → `/research/rapm` (Six-Factor tab) |
| Merge → **Similar Players** | `/research/similarity` (Box score tab) + `/shot-profile-twin` (Shot profile tab) |
| Merge → **Shooting** | `/research/expected-shots`, `/research/adjusted-shooting`, `/shot-aftermath` as tabs |
| Merge → **What's New** | `/blog` + `/patch-notes` |
| Fold into **Methodology** | `/learning` |
| Hide from nav | `/design` (internal) |
| Move to `⋯` menu | `/schedule`, `/planner`, `/data-status` (owner may later drop any of these) |
| Regroup Research | *Impact* (RAPM, WOWY, Defensive Matchups, EPV), *Shooting*, *Trends & Distributions*, *Forecasts & Evaluation* (Forecasts, Evaluation, Case Studies, Saved Investigations) |
| Move | `/tierlist` and `/rankings` stay separate, both under Players |

Every removed URL redirects (`next.config.ts` redirects or route stubs) to the matching tab,
keeping its query string. Update `lib/route-availability.ts`, `lib/replica-nav.test.ts`, search
page entries and saved-view compatibility routes. Old evidence links keep working.

### FO08 Live (D19)

Date strip with counts and dimmed empty dates (counts from existing retained data; no new
acquisition). Live · Finals · Playoffs tabs, FilterBar instead of the research form, the
one-line empty state with nearest-date jumps, game cards with logos. Keep every live-ui-v1
acceptance behavior (provisional vs admitted separation, em dash for missing values, pause,
stale/offline states). Includes `/live/[date]`, `/live/games/[id]`, `/playoffs`,
`/playoffs/[seriesId]`, `/schedule`.

### FO09 Players

`/players` directory (Explorer), `/players/[id]` profile (Profile: hero with headshot, logo, team
color and StatTiles; tabs), `/last-games`, `/rankings`, `/tierlist` (Board), Similar Players.

### FO10 Teams

`/teams` (Explorer), `/teams/[id]` (Profile with logo hero), `/stat-line-shift`, `/contracts`,
`/contracts/[team]`, `/free-agency`. Finance contracts in `finance-ui-v1` still apply.

### FO11 Compare (D21)

`/compare`, `/team-compare`, `/matchups`, `/wowy` on the Compare template. The compare tray uses
headshots. No winner, verdict or composite score.

### FO12 Research

All Research routes on the Research template: RAPM (+Six-Factor), Shooting, Trends, Distributions,
Defensive Matchups, EPV, Forecasts, Evaluation, Case Studies, Investigations
(`/investigations`, `/investigations/saved/[id]`), `/research/operation`, `/calculator`,
`/wingspan`. A key-findings row leads each page. Method notes and sealed-evidence prose go into
Data details or Why? and are never deleted. Sealed evidence documents themselves are not edited.

### FO13 Settings, help and remaining pages

`/settings` (actionable configuration first, Advanced mode toggle), `/data-status`, `/methodology`
(+ Learning), What's New, `/planner`, `/stats` (align with the now-shared patterns; must not
regress), and Ask's shared header/token pickup only.

### FO14 Responsive, accessibility and final sweep

All routes at 1440, 768 and 390. Keyboard-only pass, screen-reader labels, 200% zoom, contrast.
Remaining inline styles to 0 (or custom-property-only allowlist). Re-run the glance test on every
route and capture "after" screenshots beside the FO00 "before" set. Refresh the screenshot baselines.

## Order and coordination

FO00 → FO01 → FO02 → FO03 → **gate 1** → FO04 → FO05 → **gate 2** → FO06 → FO07 → FO08 … FO13 →
FO14. FO08–FO13 may run in any order after FO07, but one at a time, because they share CSS layers.
Python-only work from other handoffs may run in parallel.
