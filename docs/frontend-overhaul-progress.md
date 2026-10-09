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

## FO02 findings that change later blocks

- The containing-block mechanism is real (confirmed with a synthetic page), but in Chromium the
  header blur never applied: an explicit `-webkit-backdrop-filter` after the standard property
  made the CSS compiler keep only the prefixed form. In CSS, write only the standard property.
- The narrow search dim was a stray `replica-search-container` class (`max-width: 480px`) on the
  scrim. The drawer cutoff was `.replica-mobile-drawer { max-height: 70vh }` in `pages.css`.
- Collapsed accordion content was still in the Tab order; it is now `inert`.
- Under memory pressure, `next dev` makes Chromium crash in e2e. A production build of the
  isolated copy (`next build` + `next start -p 3101`) ran the full suite cleanly.

## FO03 findings that change later blocks

- FO00's fixed glyph list undercounted: by Unicode range there were 151 occurrences in 37 files
  (⇄, 🔒, ⚙, ☷ and others were missed). The lint rule now matches ranges.
- FO01 regression found and fixed: full-width filter bars lost their side gutter. Later blocks
  should measure the gutter, not only label/control alignment.
- `components/nav-rail.tsx` and `components/workbench-shell.tsx` were dead code and were removed.

## FO04 findings that change later blocks

- `foundation` beats `pages`, so page CSS cannot adjust primitives; primitive defaults must already
  match the plan (FO04 fixed header actions wrapping and segmented-control height that way).
- The shared `Menu` did not close after an item was chosen; fixed for every menu.
- SVG exports with images must inline them (`inlineSvgImages`) and fetch with `cache: "no-store"`.
- Ranks are not in the API; FO04 reads them from the server's best-first ordering (top 100).
  Profiles (FO09) and Compare (FO11) can reuse `useCohortRanks` and `lib/percentile-display.ts`.

## FO05 findings that change later blocks

- The team-detail API omits `context.published_at` when a release is named; compare exports only
  against a request with the same parameters as the page.
- API `warnings` can state code-like rules ("game_date < before_date"); they belong in Data details,
  not Why? (glance item 6). `ContextBar` now takes `detailRows` for page-specific rows.
- A chip that moves between lists remounts, so keyboard focus must be restored explicitly; reuse
  the pattern for Tier List (FO09).
- `components/team-grid.tsx` (30 logos + filter) is reusable for Teams (FO10) and team compare (FO11).

## FO08 findings that change later blocks

- `/schedule` reads the legacy fantasy `fct_games` table (14 fixture games); real games need a data-source change or the owner dropping the page.
- Pages whose sections share a path pass `RouteTabs active=…`; `ContextBar showThrough={false}` hides the Through picker where the page's own date sets the cutoff.
- Server components passing JSX into a client prop rendered beside other children need an explicit `key` (React 19 dev warning).
- `DataDetails` rows are keyed by index, so repeated labels are allowed.
- Stop scratch servers by PID and working directory; `pkill -f` from the tool shell kills the shell itself.

## Gate 2 decisions (owner delegated: "use your best recommendation/suggestion wrt. direction")

- **Roster Shapes layout:** keep the Unassigned pool across the top with five position columns below.
- **Page mode controls on phones:** controls that switch what the board shows (Roster Shapes
  Observed/Projected, Showcase Focus) stay visible above the board below 768px instead of moving
  into the Filters sheet with the scope controls. FO06 records this in the filter-bar pattern
  and applies it to both pages.
- **Roster Shapes persistence:** not now. Assignments stay in page state; saving them to the
  workspace is a later, separately scoped request (no FO block).
- **Showcase:** approved as built in FO04.

## Owner review notes at gate 2 (2026-10-09)

| # | Owner report | Measured cause | Where it is fixed |
| --- | --- | --- | --- |
| 1 | Thin line above Stats' preset tabs, Manage Views and Group guides | The shared filter bar's 6% bottom hairline sits at y=198 and Stats' preset row starts at y=199 (0px gap), so the hairline reads as a stray top border on the controls. Other pages leave a gap | **FO13** (`/stats` aligned with shared patterns): give the row after the filter bar the shared gap; check every page for the same 0px gap in FO14 |
| 2 | Search results list many "Test Player" rows ("No stats in selected scope") | `tests/integration/test_workbench_postgres.py` commits a `WorkbenchIdentity` (`test_player_<uid>`, "Test Player") on each run into the database named by `COURTLENS_TEST_POSTGRES_URL`, which is the dev database: 36 rows, 36 matches from `/api/workbench/lookup` | **Not in any FO block** (backend/test hygiene is out of scope here). Needs its own fix: point the test at a disposable database or clean up its rows, then remove the 36 rows from the dev database with owner approval |
| 3 | Header search pill is not horizontally centered | The pill is centered in the space between the nav and the right actions, so it sits 253px right of the page center at 1280, 1440 and 2000. True page centering collides with the nav (ends at x=632) below about 1,700px unless the pill shrinks | **FO06** (header pattern in Design Language v1.1): center on the page where it fits, otherwise place it in the free space, and record the rule; FO14 re-measures at 1280/1440/1920 |

## FO06 findings that change later blocks

- Each FO08–FO14 block removes its files from `PENDING_NATIVE_DATE` / `PENDING_RAW_TITLE` in
  `dashboard/eslint.config.mjs` and adds its rebuilt pages to `e2e/visual-baselines.spec.ts`.
- Page mode controls go in the FilterBar `modes` slot, not `filters` (Live tabs, Compare views).
- Baselines must be generated from a production build of the isolated copy; `next dev` renders
  differ.
- Open owner choice for FO13: the proposed Article template (Design Language v1.1, Templates).

## FO07 findings that change later blocks

- Routes move through `lib/route-consolidation.ts` only; a unit test checks every redirect lands on an existing page in one hop.
- Tab bodies render inside `.ui-tabbed-page-body`, not `.workbench-content`; FO09/FO12/FO13 rebuild them without their own page header.
- FO09: Similar Players' "Open in Stats" button text is unreadable (pre-existing) and its evidence hash belongs in Data details.
- FO12: the shot-tools and research-experiment link rows inside the Shooting and RAPM tabs duplicate the tabs; fold them in.

## Owner gates

| Gate | After | Status | Notes |
| --- | --- | --- | --- |
| 1 | FO03 | **approved 2026-10-09** (owner: "Go ahead with the next block. I approve.") | Header, search, drawer, filter bar, primitives. Review list: [FO03 evidence](evidence/fo03/README.md#owner-review-gate-1) |
| 2 | FO05 | **approved 2026-10-09** (owner: "For Review gate 2, use your best recommendation/suggestion wrt. direction.") | Showcase, Roster Shapes, search. Decisions and review notes above; review list: [FO05 evidence](evidence/fo05/README.md#owner-review-gate-2) |

## Block status

| Block | Status | Measured evidence |
| --- | --- | --- |
| FO00 | verified | 2026-10-09. [Inventory](evidence/fo00/inventory.md): 53-route table (nav label, title, template, FO07 action, component, data); 388 required strings (44 caveat, 24 contract) in `evidence/fo00/required-wording.json`; 108 before screenshots (all 53 routes + 1 extra Live date × 1440/390, all HTTP 200) + 3 overlay captures in `evidence/fo00/before/`, recaptured through `localhost:3100` after the first run hit the API CORS allowlist. Counts: 100 glyph icons/33 files, 3 direct Lucide files, 41 `style={{` (all custom-property-only), 4 Load buttons, 18 native date inputs, 69 notice boxes, 0 pages with "Apr 12, 2026" dates. Checks: dashboard lint 0, typecheck 0, Vitest 39 files/286 tests pass; ruff clean. Glance test N/A (no UI change). |
| FO01 | implemented_unverified | 2026-10-09. [Evidence](evidence/fo01/README.md): PageShell + 5 templates, PageHeader, FilterBar (ContextBar migrated; bottom sheet <768px), Field, DatePicker + `formatDate`, ChipGroup, segmented variants, GatedNote, Data details (lineage drawer inside it), PlayerIdentity/TeamIdentity/EntityChip + team accents, StatTile, template skeletons, Advanced mode. Lint 0, typecheck pass, Vitest 43 files/314 tests; Playwright 231 pass/15 skip/1 pre-existing race (motion reduced-motion, reproduces on FO00). Glance items 2/6/7/8/9/10 pass on measured pages (`glance.json`). Drawer-blur root cause confirmed and fixed (scrim z-index above panel). Awaits owner gate 1. |
| FO02 | implemented_unverified | 2026-10-09. [Evidence](evidence/fo02/README.md): hypothesis tested first (synthetic reproduction confirms the mechanism; the observed bugs had other causes, all fixed). Shared `OverlayPortal` for Drawer/Modal/palettes/hotkeys; one 640px search modal with Players/Teams/Pages/Recent; hamburger only below 1280px; `⋯` holds the D9 links; nav regrouped to FO07 targets from `lib/nav-model.ts`. Re-test: 12/12 overlay cases pass, scrolled and unscrolled, at 1440/1280/1024/390. Lint 0, typecheck pass, Vitest 45 files/325 tests, Playwright 232 pass/15 skip/0 fail. Awaits owner gate 1. |
| FO03 | implemented_unverified | 2026-10-09. [Evidence](evidence/fo03/README.md): 3 direct Lucide files and 151 glyph/emoji occurrences in 37 files moved to the wrapper; sizes limited to 14/16/20 by type; ESLint bans `lucide-react` outside the wrapper and glyph/emoji ranges in JSX text, string literals and template strings (3 reasoned exceptions). Rendered: 0 glyphs on all 54 routes (FO00: 382), 0 Lucide SVGs outside the wrapper. Design language documents icon sizes and colors. Also fixed the FO01 filter-bar gutter regression. Lint 0, typecheck pass, Vitest 46 files/327 tests, Playwright 232 pass/15 skip/0 fail. Awaits owner gate 1. |
| FO04 | implemented_unverified | 2026-10-09. [Evidence](evidence/fo04/README.md): Showcase rebuilt on the Board template: title row with search and one Export menu, Focus in the filter bar, SVG card with headshot, logo, team accent, value/rank/percentile per stat and one context line, centered playback (0px offset at both widths), rail with icon actions and roster. Percentiles from the Stats query and cohort; ranks from the server ordering; `?playerId=` deep link fixed; exports self-contained. Glance test passes at 1440 and 390. Lint 0, typecheck pass, Vitest 48 files/333 tests, Playwright 235 pass/15 skip/0 fail. Reviewed at gate 2 after FO05. |
| FO05 | implemented_unverified | 2026-10-09. [Evidence](evidence/fo05/README.md): Roster Shapes rebuilt on the Board template with no form, release input or Load button: shared filter bar + Observed/Projected, 30-logo team grid (inline, then a Change team modal) with the team in the URL, team header with logo and color, Unassigned pool above five position columns with share bars, drag and drop plus a keyboard menu (focus follows the chip), projected minutes on chips with a 240 gauge (amber/red/green), caveats behind Why?, IDs, rules and source warnings in Data details, collapsed table. Export `roster-minute-allocation-v1` byte-identical to the old formula (unit test and real data). Glance test passes at 1440 and 390. Lint 0, typecheck pass, Vitest 49 files/337 tests, Playwright 239 pass/15 skip/0 fail. Awaits owner gate 2. |
| FO06 | implemented_unverified | 2026-10-09. [Evidence](evidence/fo06/README.md): Design Language v1.1 (templates, page anatomy with filter-bar slots, missing-data/Data details rules, identity, dates, gate-2 Board patterns, breakpoints, glance test, rewritten header section, enforcement). Gate-2 follow-ups: FilterBar `modes` slot keeps Showcase Focus and Roster Observed/Projected visible on phones (40px, no clipping at 390/360); search pill page-centred where it fits (0px offset at 1024 and ≥1740, was +253px). ESLint ratchets for native date inputs and raw `<h1>` with per-block pending lists. 10 screenshot baselines (Showcase, Roster picker and chart, search, `/design` × 1440/390), stable on repeat runs. Lint 0, typecheck pass, Vitest 49 files/337 tests, Playwright 249 pass/15 skip/0 fail. Article template left as an owner choice for FO13. |
| FO07 | implemented_unverified | 2026-10-09. [Evidence](evidence/fo07/README.md): merged pages are path tabs from one table (`lib/route-consolidation.ts`, also feeding `next.config.ts` redirects): RAPM Research (+Six-Factor), Similar Players (Box Score, Shot Profile), Shooting (Expected, Adjusted, Aftermath), What's New (Patch Notes, Blog), Methodology (Definitions, Learning). 9 removed URLs → 307 to their tab with the query kept; old aliases repointed so nothing takes two hops. `RouteTabs` primitive (links, `aria-current`, context and player carried, 40px, secondary when gated), one `h1` per page, nav lists each merged page once, backend search entries updated, `/design` noindex, raw-title ratchet 41 → 35. 11 tab URLs × 1440/390: titles match nav, tabs 40px, shared left edge, no sideways scroll (fixed a pre-existing 390px overflow on Similar Players). Glance items 1/4/7/9 pass; 2/3/5/6/8/10 belong to the tab bodies (FO09/FO12/FO13). Lint 0, typecheck pass, Vitest 50 files/344 tests, ruff/mypy clean, lookup pytest 16 pass, Playwright 254 pass/15 skip/0 fail. |
| FO08 | implemented_unverified | 2026-10-09. [Evidence](evidence/fo08/README.md): one Live board titled "Live" with Live · Finals · Playoffs tabs (`/live`, `/live/[date]`, `/live/games/[id]`, `/playoffs`); research form and Load button removed (Finals on the shared bar, release/cutoff/provenance in Data details); 15-day date strip with counts from a new read-only `GET /api/workbench/schedule/dates` (retained schedule + admitted finals, unknown never zero); one-line states with Why? and nearest-date jumps; game cards with verified-ID logos and Eastern tipoffs. Playoffs, series detail and `/schedule` rebuilt on the shared header/bar; decided series no longer show SCHEDULED (`finished` status bug). All B32 behaviour tests kept. Ratchets: native date 11 → 8, raw title 35 → 31. Glance test passes on all 6 pages at 1440 and 390 (first result ≤400px, 0 UUIDs/rules/ISO dates visible, no sideways scroll). Lint 0, typecheck pass, Vitest 50 files/344 tests, ruff/mypy clean, pytest unit 1,324 pass, Playwright 259 pass/15 skip/0 fail, 14 baselines stable. |
| FO09 | planned | |
| FO10 | planned | |
| FO11 | planned | |
| FO12 | planned | |
| FO13 | planned | |
| FO14 | planned | |
