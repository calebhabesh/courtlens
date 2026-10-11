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

## 2026-10-09 — owner-reported Stats divider correction

Follow-up toolbar request: Manage Views now follows the guide group in DOM/keyboard order,
matches the adjacent selector groups at 32px, and the visible label is `Group Guides:`.
Measured at 1440/2048/390px with working dialog/Escape and no page overflow; lint/types and 344
unit tests pass. [Screenshots and scoped glance evidence](evidence/stats-manage-views/README.md).

Bounded spacing repair, separate from FO milestone acceptance: the filter bar hairline had 0px
clearance above the preset row, visually touching Manage Views and Group guides. A scoped
`--space-4` top margin now gives exactly 16px at 1440/2048/390px. Both controls work; no sideways
page scroll. [Screenshots, measurements, scoped glance test and verification](evidence/stats-divider-fix/README.md).
Dashboard lint/typecheck pass; Vitest 344 pass. Existing production-fixture Stats browser checks
cover 10 passing cases across the initial run and an isolated rerun after a Chromium crash.
Source stylesheet separately loaded and measured on that fixture server; live 1440px screenshot
confirms the source change. No FO block status changes.

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

## FO09 findings that change later blocks

- `/tmp` is RAM-backed here; with swap full, stale isolated copies from earlier sessions (about 9 GB under `/tmp/courtlens-*` and `/tmp/courtload-*`) made Chromium fail to fork and every Playwright test time out. Keep isolated copies small (no evidence PNGs) and ask the owner before deleting old ones.
- Entity pickers belong in the filter bar or header, never only inside a result that can fail.
- Profile pages (FO10 teams) can reuse `ProfileLayout` + the server-side `resolveStatsQuery` hero query + `useCohortRanks`, as `/players/[id]` does.

## FO08 findings that change later blocks

- `/schedule` reads the legacy fantasy `fct_games` table (14 fixture games); real games need a data-source change or the owner dropping the page.
- Pages whose sections share a path pass `RouteTabs active=…`; `ContextBar showThrough={false}` hides the Through picker where the page's own date sets the cutoff.
- Server components passing JSX into a client prop rendered beside other children need an explicit `key` (React 19 dev warning).
- `DataDetails` rows are keyed by index, so repeated labels are allowed.
- Stop scratch servers by PID and working directory; `pkill -f` from the tool shell kills the shell itself.

## FO11 findings that change later blocks

- Stats percentiles are value-based and need catalog-direction presentation. Team Four Factors
  percentiles already count worse values by good direction in `compute_league_rankings`; display
  them directly. Applying the Stats orientation helper to team percentiles inverts them twice.
- `/matchups` now owns `components/matchups-view.tsx`. `components/shooting-view.tsx` remains for
  FO12's Research routes; its native-date and raw-title ratchet exceptions are still pending.
- Automatic analytical queries must retain an initially default response's resolved release and
  cutoff before a subsequent filter change. Native-history URL updates need to be distinguished
  from external URL navigation, and stale responses must be aborted/ignored.
- `components/ui/comparison-rows.tsx` provides signed magnitude bars, bold larger known numbers
  and optional API percentiles. Unknown has no bar; documented zero stays zero. Assignment-only
  APIs cannot supply two independent player stat sets or league percentiles.

## FO12 findings that change later blocks

- A page with a fixed scope (sealed report, frozen protocol, calculator) uses
  `FilterBar collapsible={false}` with a one-line scope label; phones keep it inline instead of an
  empty "Filters" sheet. A single-player page puts one 40px `PlayerLookup` in `filters`.
- Page CSS that sizes `.ui-filter-bar input` must exclude `.lookup-input`, or the lookup grows to 42px.
- A visually hidden (`sr-only`) label inside a horizontally scrolling table escapes the scroll
  clip unless the wrapper is positioned; `.research-table` is `position: relative`.
- `loading.tsx` inside an FO07 tabbed layout must skeleton only the tab body.
- `ConversationResult` (shared with Ask) printed ISO dates on `/investigations/saved/[id]`
  (closed by the FO13 date pickup).
- The measurements API returns duplicate rows; league rank operations take about 15s on a full
  season (client timeout raised to 50s).

## FO13 findings for FO14

- [FO13 evidence](evidence/fo13/README.md#glance-test) records three partial glance items instead
  of claiming visual acceptance: retained centered Stats numeric cells (120 sampled across the
  three widths), Article phone contents-skeleton geometry, and retained phone targets below 40px.
- Small targets measured in the retained UI: Stats preset/guide/table controls (including 28px),
  Planner Compare scenario (34px), Ask Open assistant (28px), Live Pause updates (34px) and Why?
  (28px). Article and Data Status targets were corrected to 40px in FO13. FO14 owns the route-wide
  responsive, keyboard, zoom and contrast pass and corresponding baseline changes.
- Stats' title text starts after its leading icon; measure the header container for the 24px
  shared desktop gutter. The explorer's dense phone gutter remains 8px.
- Screenshot capture waits must intersect clipping ancestors, not just the viewport: lazy logos
  in horizontally clipped Stats columns otherwise produce false image-loading timeouts.
- Planner league/week selection comes from the URL; requests for plan/roster/watchlist settle
  together, old scope results are hidden, and stale responses are discarded. A failed league
  read after authentication leaves the sign-in form available to retry.

## Gate 2 decisions (owner delegated: "use your best recommendation/suggestion wrt. direction")

- **Roster Shapes layout:** keep the Unassigned pool across the top with five position columns below.
- **Page mode controls on phones:** controls that switch what the board shows (Roster Shapes
  Observed/Projected, Showcase Focus) stay visible above the board below 768px instead of moving
  into the Filters sheet with the scope controls. FO06 records this in the filter-bar pattern
  and applies it to both pages.
- **Roster Shapes persistence:** not now. Assignments stay in page state; saving them to the
  workspace is a later, separately scoped request (no FO block).
- **Showcase:** approved as built in FO04.

## FO13 owner decisions (2026-10-09)

- **Article template:** approved. A sixth template, one readable column of about 720px with a table
  of contents, for Methodology (+ Learning), What's New and Settings. FO13 adds it to Design
  Language v1.1.
- **Schedule:** hide for now. `/schedule` leaves the `⋯` menu and search and redirects to Live
  (which has the real date strip). Repointing it to `workbench_schedules` is a separate backend
  task outside the FO blocks.

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
- The FO13 Article-template owner choice was approved on 2026-10-09 (decisions above).

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
| FO09 | implemented_unverified | 2026-10-09. [Evidence](evidence/fo09/README.md): player profile on the Profile template (name header with icon actions, Explore and Export menus; shared bar; hero with headshot, team accent and six StatTiles with Stats-cohort percentile and rank; Overview · Game Log · Measurements tabs kept in `?tab=`); impact card values first with methodology behind Why?; Recent Games, Ranking Boards, Tier Lists and Player Directory titled by their nav labels with shared headers, separated 40px controls and one-line notes; Similar Players on the shared FilterBar with the target picker always reachable, hash in Data details and headshots for target and peers. Shared fallbacks fixed (broken headshot → initials, unknown team code no wrap). Raw-title ratchet 31 → 24. Glance test passes on all 7 views at 1440 and 390. Lint 0, typecheck pass, Vitest 50 files/344 tests, Playwright 266 pass/15 skip/1 sub-pixel flake (fixed, 16/16 on repeat), 18 baselines stable. |
| FO10 | implemented_unverified | 2026-10-09. [Evidence](evidence/fo10/README.md): Team Stats & Cohorts on Explorer with shared immediate filters and URL-persisted views/sort; Team Profile with logo hero, eight summary tiles and Overview / Four Factors / Schedule tabs; Teammate Stat Shift on Compare with always-reachable entity pickers and automatic valid queries; Contracts & Payroll, team contracts and Free Agency Tracker on shared templates with explicitly selected immutable book and independent financial dates, summary first, source details and a headshot contract dialog. Unknown ratings sort last; zero/unknown outcomes, raw shared-floor estimates, financial money/scenario and provenance contracts preserved. Technical fields in Data details, one-line Why? notes, shared skeletons and styled dates. Ratchets: native date 8 → 6, raw title 24 → 21. Glance passes on 27 real-data states at 1440/768/390 (desktop results 227–389px, no page overflow, no visible UUID/hash/rules/ISO dates). Lint 0, typecheck/build pass, Vitest 50 files/344 tests, final Playwright 284 pass/15 skip/0 fail; 30 baselines stable (12 new, 18 prior bytes unchanged). Initial full run had two obsolete/racing test expectations; corrected cases pass 16/16 repeats before the green full run. Other session Stats work closed as 9abb1c7; unrelated dev-port/TODO work retained in two stashes. Implemented in active Codex runtime because the handoff-selected Opus 5.5 is unavailable; owner visual acceptance not claimed. |
| FO11 | implemented_unverified | 2026-10-09. [Evidence](evidence/fo11/README.md): Player Comparison, Team Comparison, WOWY and Player Matchups on Compare with shared headers, immediate valid filters, URL-persisted modes/tabs, entity headshots/logos, descriptive magnitude bars and Data details. Player percentiles use the full Stats cohort; team percentiles retain the API's existing direction; assignment-only results retain their matrix. Unknown/zero, signed values, legacy targets/intervals, raw shared-floor estimates, support/partitions, scenarios, exports and source gates preserved. Swaps retain additional URL players; initially default analytical queries retain resolved scope; stale responses are ignored. Ratchets: native date 6 → 5, raw title 21 → 18. Glance passes on 39 real-data states at 1440/768/390 (desktop results 340–396px, no page overflow or visible UUID/hash/rules/ISO dates). Lint 0, typecheck/build pass, Vitest 51 files/346 tests; final Playwright 302 pass/15 skip/0 fail; 42 baselines match (12 new, 30 prior bytes unchanged). A chip-replacement test synchronization race was corrected and passes 8/8 repeats before the green full run. Unrelated Python edit and two stashes retained. Active Codex runtime used because Opus 5.5 is unavailable; owner visual acceptance unclaimed. |
| FO12 | implemented_unverified | 2026-10-09. [Evidence](evidence/fo12/README.md): all Research routes on the Research template (header, shared bar, key findings, then results): RAPM (+Six-Factor/B26), sealed Expected/Adjusted Shooting, Shot Aftermath and Shot Profile (automatic queries, no Run button or release input), Workload Trends, Distributions & Splits (four URL modes), Defensive Matchups, Spatial EPV, Points Forecasts, Evaluation Archive, Case Studies, Saved Investigations + detail, Research Operation, Calculator, Combine & Wingspan. IDs, hashes, cutoff rules and resolved context in Data details; caveats behind Why?; titles match nav labels. Fixed a pre-existing Trends bug (fractions shown as `0.5466%`, now `54.7%` / pp changes) and a 15s rank timeout that failed on real data. `FilterBar collapsible={false}` for fixed scopes and 2-up findings on phones (Design Language v1.1 Anatomy). Ratchets: native date 5 → 2, raw title 18 → 6. Glance passes on 66 real-data states at 1440/768/390 (desktop results 154–304px, bar gap 16px, no page overflow, no visible UUID/hash/rule) except 5 ISO dates in the Ask-shared result renderer on the saved detail (D23, noted). Lint 0, typecheck/build pass, Vitest 52 files/349 tests, final Playwright 319 pass/15 skip/0 fail (repeated after the last CSS fix); 54 baselines (12 new, 42 prior bytes unchanged). Unrelated Python edit and two stashes retained. Owner visual acceptance not claimed. |
| FO13 | implemented_unverified | 2026-10-10. [Evidence](evidence/fo13/README.md): owner-approved Article template (720px reading column, sticky contents / phone pills) added to Design Language v1.1 and /design; Settings configuration first, independent portrait counts; Data Status findings/jobs with IDs and hashes in Data details and measured unknowns on API failure; Methodology/Learning and What's New on Article; Planner immediate URL league/week, recovery after league-load failure, scope-matched results and no repeated sign-in; Stats shared header/title and 24px desktop gutter; Schedule hidden with query-preserving 307 to Live; Ask shared header/date pickup. Native-date ratchet 2 → 0, raw title 6 → 1. Final 33 captures at 1440/768/390: no page/image errors, page overflow or visible UUID/hash/cutoff rule/ISO date; bar controls 40px, post-bar gap 16px. Glance has three explicit FO14 follow-ups (Stats numeric alignment, Article phone skeleton, retained small touch targets), so visual acceptance is unclaimed. Lint/typecheck/build pass; Vitest 54 files/357 tests; Ruff/mypy/format pass; final Playwright 333 pass/15 skip/0 fail, all 348 cases; 62 baselines match (8 new, 54 prior byte-identical). Began in Opus 5.5 and completed in active Codex runtime at owner request. Unrelated Python edit and two stashes preserved. |
| FO14 | implemented_unverified | 2026-10-11. [Evidence](evidence/fo14/README.md): final responsive/accessibility sweep over all 52 page files plus retained aliases, 404 and manual Ask: 72 route states / 288 captures at 1440/768/390 and 200% desktop reflow. Stats/table numeric alignment, full phone targets including table links, uncompressed segmented labels, Article contents skeletons, Similar Players skeleton/Retry/gutter, distribution legend, keyboard skip/focus/scroll regions, supported accessible labels, 404 shared header, reduced-motion hydration and typed floating lookup geometry. Both page-pattern ratchets empty; 49 authored style attributes custom-property-only; no raw/unresolved properties. Lint/types/build and Ruff/format/mypy pass; Vitest 54 files/357 tests; final Playwright 355 pass/15 skip/0 fail, all 370 cases; 66 baselines match (4 new, 32 refreshed, 30 prior byte-identical). All 288 captures have zero measured page/image errors, overflow, short phone/reflow targets, clipped labels, numeric misalignment, skip/focus failures or exposed technical text; axe has zero violations and 86 explicit incomplete checks. All ten glance items recorded per state; retained manual Ask and internal /design have explicit partial items. Owner visual acceptance remains pending. Unrelated Python/TODO edits and both stashes preserved; sealed evidence restored and retained. No FO15+ is planned. |

## 2026-10-11 — branch closeout verification repairs

The owner requested merging the completed implementation branch into `main`. Closeout commits
preserve the owner's TODO edits and disposable PostgreSQL volume cleanup, and normalize trailing
whitespace in one source file and two FO12 diagnostic logs. Both pre-FO10 stashes are retained.

Fresh dashboard lint/types, 357 unit tests, production build and production-fixture browser checks
pass (355 passed, 15 optional skips; all 66 screenshot baselines match). The isolated fixture copy
matches 512 source/baseline files, excluding its listen port and generated Next type import.

The first full Python run had 1,850 passes and one failure: the rename guard rejected FO09's
historical scratch-directory reference. A narrowly scoped exception preserves the original record;
all six frozen-identifier/rename tests pass. Fresh uncached mypy passes all 208 source files.
GitHub's unconstrained installation selected newer SQLAlchemy/Pydantic releases and reported
71 type errors; installing those versions locally reproduces the same 71 errors. CI and both
Python Docker images now use the existing dependency lock as constraints.
The lock's stale WebSocket pin is corrected to the installed 16.1.1 version, satisfying the
locked Gemini SDK's declared `<17` requirement.
The complete fresh Python rerun passes: 1,851 tests, one optional isolated-panel browser skip,
19 published-data checks deselected and one third-party SDK deprecation warning on Python 3.14.

The default browser harness used a development server despite the production baseline contract.
A development replay matches 65 baselines but differs by 4% on the phone roster chart; production
matches all 66. The default harness now builds production webpack output and starts the standalone
server with its public/static assets, using the same fixture endpoints as before.

The first production CI browser run passes 354 cases and all baselines, but its Team Stats desktop
reload assertion matches both the displayed cards and a hidden React streaming copy. The assertion
now requires exactly one visible card grid and keeps the same Boston/filtered-Toronto checks.
An injected hidden-copy probe fails at both widths before the fix and passes 40 repeated cases
after it; injected visible duplicates still fail. CI also uses the same one-thread BLAS/OpenMP
limits as the successful local full Python run.

The full CI Python run has 1,849 passes and two dump/restore failures because the runner's default
PostgreSQL 16.15 client refuses the PostgreSQL 17.11 test server. CI now explicitly selects the
PostgreSQL 17 client directory, installing it from the official PostgreSQL repository if absent.
Stock Ubuntu 24.04 cannot resolve that client package; a clean Ubuntu container reproduces
the missing package and installs both 17 client tools successfully after repository setup.
A disposable database probe
reproduces the version mismatch with a 16 client and succeeds with a 17 client; both affected
history/provenance and external-excerpt restore tests pass in a focused rerun.

The CI demo warehouse build also attempted archive models without their required dataset ID.
The demo build now excludes archive-tagged models; archive publication retains its dedicated
candidate build with explicit dataset variables. A disposable PostgreSQL 17 migration, demo seed
and corrected build pass all 221 models/tests with zero errors, warnings or skips.

The container smoke job also lacked a published workbench fixture and expected an older metric
catalog and team-response schema. CI now seeds its disposable database with the existing synthetic
test cohort, and smoke checks the active v2 catalog and current team fields. An isolated migrated
PostgreSQL/API loop reproduces the unseeded 503 and stale-catalog failure, then passes the corrected
populated-analytics smoke check. Final merge checks are attached to
[PR #17](https://github.com/calebhabesh/courtlens/pull/17). This entry does not advance analytical,
source, evaluation or per-page visual-acceptance statuses.

## 2026-10-11 — Owner-requested Stats divider and uniform spacing

[Measured evidence](evidence/stats-divider-spacing/README.md): removed the Stats filter bar's
bottom hairline and vertical padding, and aligned the header, selectors, preset row and console
with three uniform 16px gaps. Scoped foundation-layer overrides preserve shared control height.
Real-data desktop/tablet/phone captures (1440/768/390px) show a 0px divider, 40px filter buttons,
no page overflow and console starts at 254/346/362px. Scoped glance review passes for captured
populated states; loading/error/missing-data states were not re-audited. Lint and production
build/TypeScript pass; 10 existing Stats browser tests pass. Desktop/phone production Stats
baselines refreshed for the requested visual change. Prior milestone and owner-acceptance
statuses remain unchanged.

## 2026-10-11 — Native dropdown dark-theme correction

[Measured evidence](evidence/native-select-theme/README.md): reproduced white native dropdowns
with unreadable light text despite the dark color scheme. Shared Select backgrounds were
transparent in both CSS layers; an opaque surface-token probe resolved the popup. Both layers
now use that surface; native options/option groups get explicit surface/text tokens site-wide.
Six real-data desktop/phone opened-menu captures show 15.53:1 option contrast and no page
overflow. Lint/build/TypeScript pass, 357 unit tests pass, 82 existing browser checks pass
(including all 66 unchanged page baselines), and three new native-popup screenshot/contrast
tests pass twice each with a light OS theme. Scoped glance review is recorded in the evidence;
prior milestone and owner-acceptance statuses remain unchanged.
