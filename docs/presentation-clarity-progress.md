# CourtLens presentation clarity progress

Parent: [presentation clarity handoff](presentation-clarity-plan.md). Design contract:
[design-language-v1](design/design-language-v1.md) (v1.2 after PC03). Plans are not runtime
evidence.

Allowed states: `planned`, `in_progress`, `implemented_unverified`, `verified`,
`verification_blocked`. A UI block is `verified` only with measured checks **and** a passing
extended glance test (see the handoff) on desktop and phone screenshots taken **with no URL
parameters**. Blocks before each owner gate also need recorded owner approval.

## Planning baseline: 2026-10-11

- The owner confirmed C1–C24 and the source plan through a grilling interview.
- Source reachability was checked from the development machine on 2026-10-11 (see the handoff's
  source plan).

| Block | State |
| --- | --- |
| PC00 Roster Shapes crash fix | implemented_unverified |
| PC01 Source policy v2 | verified |
| PC02 Page audit (G1) | implemented_unverified (G1 cleared; audit has three unmeasured items) |
| PC03 Design Language v1.2, D21, chart kit | verified |
| PC04 Compare and first-load defaults (G2) | implemented_unverified (G2 cleared; retained glance issues) |
| PC05 Data: rosters, positions, injuries | verification_blocked (roster snapshot admitted; injury/transaction source evidence pending) |
| PC06 Data: finance | verified (BRef-only scope per D2/D3; 464/622 salaries, 158 explicit unknowns) |
| PC07 Data: tracking, play types, matchups, combine, on/off | verified (2025-26 feeds, 2000–26 drafts; pbpstats WOWY not ingested; capabilities partial) |
| PC08 Contracts and Free Agency views (G3) | planned |
| PC09 Value metric and archetypes | planned |
| PC10 Roster Shapes (G4) | planned |
| PC11 Populate or remove gated pages | planned |
| PC12 Remaining audit batches | in_progress (A/B implemented/tested; C/D pending; glance limits recorded) |
| PC13 Hosting, schedules, Ask demo mode | planned |

## 2026-10-11 — PC00 Roster Shapes crash fix

- Cause: `get_team_detail()` keeps players whose rows for the team are all reported
  non-appearances (`games_played=0`, `total_minutes=null`), while `lib/types.ts` declared
  `total_minutes: number`. The cohort type also named `points`/`points_per_game`, which the API never
  sent (it sends `pts_per_game`/`reb_per_game`/`ast_per_game`).
- Decision: keep those players (they are real roster members, e.g. Damian Lillard POR, Terry Rozier
  MIA) and render unknown minutes as `—`, never 0. Types corrected; the team page's always-empty
  "Stint Points" column now shows PPG/RPG/APG; Team Compare reads `pts_per_game`.
- Real data (local API, 2025-26): 11 regular-season teams carry a null-minutes player (ATL, NOP, DEN,
  GSW, HOU, MIA, IND, POR, UTA, MEM, CHA); playoffs have none. All 11 load in Chromium at 1440×900
  with 0 page errors and the player shown as "— min · 0 GP".
- Checks: dashboard lint 0/0, typecheck clean, Vitest 358 passed (new observed-unknown case),
  Playwright `roster-shapes.spec.ts` 5/5 (new non-appearance case) run against the owner's dev server
  with `PLAYWRIGHT_EXTERNAL_SERVER=true`.
- Not yet run: the production-build visual baselines (port 3100 was held by the owner's
  `next dev`). The team detail baseline will change because of the column fix.

## 2026-10-11 — PC01 Source policy v2

- [Source policy v2](design/nba-direct-admission-v2.md) admits the handoff's source plan for the
  non-commercial demo, with per-host minimum intervals (BRef 3 s, Spotrac 5 s, pbpstats 5 s,
  GitHub mirrors 1 s), robots.txt obedience, scheduled fetches only, retained raw bytes and
  derived-views-only serving. Direct `stats.nba.com`, Databallr data, paid APIs and RealGM stay out.
- v1 is unchanged: IM08 receipts bind its SHA-256 (`verify_receipt` checks `policy_sha256`), so
  IM08 and `scripts/verify_im08_sources.py` stay a frozen diagnostic.
- Registry `src/courtlens/domain/source_policy.py`; a unit test checks that every registered host
  appears in the doc table. The workbench catalog now declares `player_index`, `injuries`,
  `play_types`, `tracking`, `defensive_tracking`, `hustle` and `combine` as `not_yet_observed`,
  with "Source admitted (…); not yet ingested in this release." Measured entries always take
  precedence (`setdefault`).
- Left for measured coverage: `shots` (657,432 research shot members exist), `on_off`, `matchups`,
  contracts and free agency (finance releases exist). PC02 audits them; PC05–PC07 declare them.
  Data-gap `source_blocked` results (for example zero reconciled stints) are data status, not
  policy, and stay until PC07/PC11 populate them.
- AGENTS.md already carried the Databallr sentence; it now links v2.
- Checks: Ruff and format clean, strict mypy clean, full Python suite 1,854 passed / 1 skipped
  (disposable PostgreSQL, including the catalog integration assertion). Dashboard lint 0/0,
  typecheck clean, Vitest 359 passed (new route-availability case). Real-database catalog:
  0 `source_blocked` capabilities.

## 2026-10-11 — PC02 Page audit (gate G1)

- Production build (`next build --webpack`, standalone) in a detached worktree at `978d804`, served
  on port 3200 against the real API (port 8100, owner database). The owner's dev servers were not touched.
- Every static route plus five reachable dynamic routes were opened **with no URL parameters** at
  1440×900 and 390×844 ([capture script](evidence/pc02/capture.mjs),
  [measurements](evidence/pc02/measurements.json), [screens](evidence/pc02/screens/)). Every screen
  was then reviewed by eye and scored ([glance table](evidence/pc02/glance.md),
  [glance JSON](evidence/pc02/glance.json)).
- 52 routes: 23 real content, 9 open on a prompt, 6 on a gate notice, 4 broken or unreachable, 2 show
  fixture data, 2 empty personal tools, 6 text pages. 0 page errors, 0 console errors, 0 failed
  requests and 0 sideways overflow across all captures.
- Correctness findings: Wingspan reads 336 `draft_combine` rows for 4 players (about 85 copies each,
  test-fixture data in the real database). Planner renders a fixture league with invented players.
  `/playoffs` is titled "Live". The team page title truncates, and its opponent FG% (—) disagrees
  with the Teams table. Team Comparison clips a team name on phone. Defensive Matchups copy still
  says "Not admitted". `/evaluation` is unavailable for the published snapshot.
  `/research/operation` opens on an error. `/live/games/[id]` and `/contracts/[team]` have no
  first-load link.
- Not measured: glance items 4 (alignment), 7 (icons) and 8 (loading/error states). Each later block
  runs its own glance test.
- Review artifact for the owner (private link): https://claude.ai/artifact/RVH8yQWC8D89wUvpqUtQeq.
  Decisions requested: PC12 batch order (A tables, B headline visuals, C demo hygiene, D personal
  tools), Rankings/Tier Lists example board vs menu, `/players` merge vs real directory, and an early
  wingspan fixture purge. **Stopped for G1 approval.**

## 2026-10-11 — G1 cleared; PC03 started

- Owner instruction: “Let's begin the next block”, quoting PC02's completed audit and PC03 scope.
  This clears the review gate for PC03. The audit's three unmeasured glance items remain explicitly
  unmeasured; approval is not substituted for measurements.
- PC12 order, personal-tool examples/menu placement, Players merge/directory and early fixture
  cleanup remain owner decisions. PC03 does not depend on them. No fixture rows were deleted;
  retained acquisitions/releases and memberships remain immutable.
- Implementation and production verification use an isolated worktree and separate ports; the
  owner's dev servers on 3000 and 3100 are not stopped or rebuilt.

## 2026-10-11 — PC03 Design Language v1.2, D21 and chart kit verified

- [Evidence and extended glance test](evidence/pc03/README.md), [measurements](evidence/pc03/measurements.json)
  and desktop/phone screenshots. Production build in the isolated PC03 worktree, dashboard 3200 /
  deterministic fixture API 4100; owner dev ports 3000/3100 retained. Internal `/design` opened with
  no URL parameters at 1440×900 and 390×844, plus 375px and 844×390 landscape checks. Eight labeled
  geometry examples, zero page errors or sideways overflow; first result y=380 desktop / 476 phone.
- v1.2 tokens: amber/blue A/B identity; monotonic single-blue percentile ramp; six labeled categories;
  guaranteed/player-option/team-option/two-way/projected/unknown status palette. Unknowns are
  muted/hatched and labeled. Actual token contrast tests plus composed browser colors: minimum
  essential chart text contrast 4.630:1. Team colors remain identity decoration.
- D21 revised in the overhaul handoff and design contract. Existing catalog `good_direction='low'`
  already flags TOV/PF and per-game/per-36 variants. `comparisonFlags` consumes that metadata;
  DeltaChip uses the leading subject's identity color, with neutral ties/missing/undeclared
  directions and explicit “fewer” wording. No formulas, catalog versions or frozen hashes changed.
- Exact pinned geometry modules: d3-shape 3.2.0, d3-hierarchy 3.1.2, d3-sankey 0.12.3, d3-scale 4.0.2.
  SVG kit: DeltaChip, ValueBar, ThresholdBar, Donut, Sankey, TimelineGrid, PercentileCell, ShapePack.
  Shared provenance, states and typed custom properties. Reduced-motion chart fades/transitions
  ≤1ms; loading reserves the child's layout with ≤1px height change. Phone flow becomes stage bars;
  timeline names stay fixed in a keyboard-scrollable region. Signed area sizes are rejected.
- Raw hex palettes removed from multi-player lines, scatter and player comparison. Export token
  attributes resolve before SVG/PNG serialization. Production verification caught SVG title arrays
  rendering empty under prerendering; single interpolated strings fix hydration error #418. The
  regression was run red then green; final tests assert no page errors and nonempty server SVG titles.
- Checks: dashboard lint 0/0, typecheck and production build clean; Vitest 399 passed (40 new);
  Playwright 14 passed, affected visual baselines 8 passed. The two `/design` baselines are refreshed
  for the new leading v1.2 gallery. Full Python suite: 1,854 passed, 1 skipped, 19 deselected, one
  existing third-party Python 3.14 deprecation warning; Ruff/format and strict mypy clean.
- Glance items for analytical filters and primary subjects are explicitly N/A on the internal style
  guide; all applicable new-gallery items pass. This is not a new pass claim for the PC02 audit.
  Public Compare integration and first-load defaults remain PC04; minutes-qualified table cohorts
  remain PC12; Wyman presentation/impact sizing remain PC10. No fixture deletion or data ingestion.

## 2026-10-11 — PC04 implemented; G2 review pending

- [G2 before/after review](http://localhost:3500/pc04/review.html),
  [evidence and reproduction](evidence/pc04/README.md),
  [full-page glance judgments](evidence/pc04/glance.md),
  [real-data measurements](evidence/pc04/measurements.json). Local production build on 3400,
  separate API on 8100; fixture verification on 3300/4101. Owner ports 3000/3100 and gallery
  3200 retained. Isolated worktree from `35d7027`; no push.
- Compare C5–C7: silhouette landing, observed minutes suggestion, team-tinted identities and GP,
  five presets, three-column metric rows and catalog-directed A/B difference chips. Totals and
  per-game values use matching server keys; per-75/100 stays disabled without actual exposure.
  Custom picks persist in the URL (validated, deduplicated, max 25). Share image and SVG use the
  current preview; ties/unknown/undeclared directions remain neutral, lower metrics say “fewer.”
  Position leaders depends on PC05; local recently-viewed needs two players. No winner/composite.
- Seven subject entries select observed season minutes leaders, pin resolved scope and show a
  named Example with Change, headshot, real box-score tiles/bar, source and per-player samples.
  WOWY uses the leader's observed team's top duo; Stat Shift uses a focal/condition pair. Explicit
  subjects stay exact. Delayed requests cannot override manual typing/view selection; clearing
  stays manual. Measured loading/ready default-card height change: 0px at 1440 and 390.
- Parameter-free Research Operation is an eight-link menu with no conversation request. Live
  resolves the latest admitted finals from an empty/unavailable landing, shows observed points
  leaders and next retained scheduled date, and preserves explicit dated/game routes. Game-box
  reads are bounded at 30; non-appearance/missing points are excluded, never inferred.
- Real production captures: 12 entries at 1440×900 / 390×844 with no parameters on entry, plus
  two selected Compare captures via the suggestion. 0 page errors and page overflow. All ten
  non-finance default/headline cards start within 400px on desktop; this measures example context,
  not populated PBP output. Canceled Next prefetch/lease requests are retained in the JSON;
  a zero-failed-request claim is not made.
- Checks: lint 0/0; typecheck and real/fixture production builds clean; Vitest 410 passed;
  affected Playwright 72 passed; complete visual-baseline file 90 passed (24 new parameter-free
  checks). SVG content/token resolution, PNG signature, Back/Forward, manual/default races and
  retained operation scopes checked. Geometry probes: 16px padding/gap, 40px Change, A/B fills,
  keyboard/focus behavior, 0px comparison-center error and tabular right-aligned numbers.
  Backend Python unchanged; pytest not rerun. Whole-repository Ruff/format and strict mypy pass,
  including formatting the new documentation review builder; PC03 pytest evidence stays sealed.
- Finance defaults remain explicitly deferred to PC06. Real PBP/shot/assignment coverage remains
  absent in the selected scope, as measured; the box-score context is labeled separate. Existing
  technical coverage copy, repeated unavailable detail, legacy color/touch-target work and some
  unmeasured page states keep the conservative 14-item glance scores partial. PC04 remains
  `implemented_unverified`; no full-page verification is inferred from the new default cards.
  Later source/presentation blocks and G2 approval are still required. No data ingestion,
  deletion, publication pointer change, formula change or frozen-identifier rename.
- **Stopped at G2, before PC05.** The four earlier follow-up decisions remain open and unchanged.

## 2026-10-11 — G2 cleared; PC05 started

- Owner instruction: “Begin the next block”, quoting PC04's commit and G2 review handoff.
  As at G1, this authorizes the next block. Retained glance failures and unmeasured items
  remain unresolved; approval does not promote PC04 to `verified`.
- Scope: PC05 only. Current player metadata, rosters, transactions and dated injury observations
  remain independent inputs, never substitutes for historical participation or injury predictions.

## 2026-10-11 — PC05 roster inputs admitted; remaining source evidence blocked

- [Evidence and reproduction](evidence/pc05/README.md),
  [admitted metadata](evidence/pc05/admission.json),
  [API measurements](evidence/pc05/api-measurements.json),
  [source checks](evidence/pc05/source-checks.json). Implementation used the current
  `presentation-clarity` checkout; the owner's dashboard processes on 3000/3100 were retained.
  A separate read-only API runs on 8101. No dashboard implementation changed.
- NBA CDN and ESPN robots.txt returned 403. The official injury host allowed its path,
  but the requested 2026-10-11 17:00 report returned 403. Each host was stopped, with no
  bypass/retry. The admitted hoopR fallback worked: immutable revision
  `7f2c0afa616977bc4a747fa982c1429c2ce3e78a`, explicitly declaring `2026-27`.
- Real admission: 5,240 index rows, no rejected rows, 622 explicitly active players across all
  30 teams. All active NBA team IDs/abbreviations reconcile. There are 59 missing listed
  positions in the historical identity entries; they remain null. Null roster status is unknown;
  a historical team field does not create a current roster association. Career rates are excluded.
- Additive migration `11b810a4f009`: independent datasets, deduplicated normalized versions and
  composite-FK memberships, sealed against update/delete/truncate and post-admission inserts.
  Bound raw acquisition/artifact provenance is also protected. A→B→A retains three observations
  of two content versions; the same acquisition is idempotent. No old memberships were extended.
- `acquire-player-context` uses exact source URL allowlists, pinned mirror revisions, host locks,
  byte/time bounds, an identifying user agent, robots checks/crawl delays and stop-on-403/429.
  `import-player-context` accepts an acquisition or local retained document at the actual import
  time; it never backdates an observation or publishes statistics. The live check caught and fixed
  double decompression of HTTP transport bytes; the failed receipt is retained and a gzip/crawl-delay
  regression passes.
- Official PDF adapter uses Poppler layout extraction, report timestamp/game/team columns,
  wrapped reasons and explicit not-submitted status. Layout drift rejects the candidate.
  ESPN remains secondary with its own identifiers. Only verified crosswalks are frozen into an
  admission; later mapping edits cannot relabel it. Absent entries remain unknown, never healthy.
  These adapters are tested with explicitly fictional fixtures, **not** claimed as real ingestion.
- Official transaction JSON imports preserve announced/effective dates separately, explicit
  unknown effective-date reasons, NBA IDs and official per-row evidence. Roster differences are
  not transactions. No real transaction file was admitted; the primary feed remains unresolved.
- New typed GET API under `/api/workbench/player-context`: dated catalog, paged dataset rows and
  pinned projected rosters. The real `2026-27 · projected` view joins the existing server metric
  engine's `2025-26` regular-season references from an explicit statistics release: 486 players
  have references, 136 remain unknown; Toronto has 21 roster entries and 15 references. Current
  association and prior-season participation remain distinct. No current-season appearances
  are observed in that bound statistical release; this is not a universal availability claim.
- API measurements: roster-all 261.6 ms / 290,659 bytes; Toronto 246.4 ms / 10,912 bytes;
  index page 4.3 ms / 100 normalized rows. These are single local measurements, not a p95 SLA.
  All 161 retained publication pointers match before/after ingestion; API reads also preserve
  ingestion counts. The historical catalog is not relabeled as containing these independent inputs.
- Checks: 33 focused checks passed (including PostgreSQL sealing, cross-wiring, frozen crosswalk,
  unchanged earlier Stats result and frozen migration upgrade/downgrade); Ruff/format and strict
  mypy clean. Full suite: 1,884 passed, one existing browser-prerequisite skip,
  19 published-data deselections and one existing Google GenAI/Python 3.14 deprecation warning.
  Dashboard checks/glance captures are not rerun for this backend-only block.
- PC05 is `verification_blocked` until real official PDF/secondary injury ingestion and actual
  transaction observations are evidenced. The blocked direct sources are not replaced with
  fixtures, inferred statuses or invented transaction dates. PC06 has not started.

## 2026-10-11 — PC06 finance inputs admitted; identity and Spotrac coverage blocked

- Owner instruction: “Begin the next block”, quoting PC05 commit `186dc5c` on
  `presentation-clarity`. Scope is PC06 only; PC05's injury/transaction evidence remains blocked.
  The handoff permits PC05–PC07 data work to overlap after PC01. No G3 review is inferred.
- [Evidence and reproduction](evidence/pc06/README.md),
  [finance refresh contract](design/finance-refresh-v1.md),
  [source checks](evidence/pc06/source-checks.json),
  [source measurements](evidence/pc06/source-measurements.json),
  [admission](evidence/pc06/admission.json),
  [read-only and pointer verification](evidence/pc06/read-only-check.json).
- Real acquisition: all 30 Basketball-Reference team pages returned HTTP 200, with permitted
  robots paths, the identifying user agent and minimum three-second spacing. Captured
  4,731,016 raw bytes; 618 team/player entries represent 608 distinct provider IDs and 4,692
  parsed reports. Raw bytes stay in the ignored server store, never a public download.
- Spotrac robots returned 403. Its cap page was not requested; the host then stayed stopped
  for the run, including the FA candidate. Receipts distinguish the denial from the stopped
  candidate. No retry/bypass/browser transport was used. Cap/FA adapters have fictional fixture
  verification only; no real Spotrac cap components or current FA observations were admitted.
- Admission pins the explicit PC05 index and an independent book with 22 observations
  (21 amounts, one option) for three canonically mapped players. Four verified BRef mappings
  exist; only three appear in these captures. The other 4,670 source reports are unresolved;
  names never establish cross-provider identity. Frozen mapping notes are retained in the book.
- All 622 active players in the pinned index, across 30 teams, have coverage entries: three
  reported current-season salaries and 619 explicit unknown reasons. Source-listed team must
  match current roster association; historical participation never supplies it. Zero/null,
  independent amount kinds, option exercise state and guarantees preserve their meanings.
- The five official 2026–27 threshold values were verified against the NBA release and entered
  by hand as exact cents strings. Their actual import time is retained; no publication date
  becomes an earlier known-at boundary. They supply chart markers, not exact legal cap/tax room.
- Migration `12b810a4f010` adds three isolated immutable finance-context tables. Completed
  acquisition memberships, roster/threshold seasons and source scope are validated; SQL rejects
  update/delete/truncate and membership extension. Bound source/artifact/robots provenance is
  protected. New acquisitions append new refreshes/books; the same explicit input set reuses
  its admission. Original finance-query-v1 and its correction/import contracts remain intact.
- The shared policy-v2 fetcher preserves PC05's existing adapters and adds finance URL allowlists.
  Extra robots sealing exposed a PL/pgSQL artifact-field reference on acquisition records;
  the corrected table-specific branch passes fresh PostgreSQL and frozen migration checks.
  An intermediate full run was interrupted after that finding and is retained as failed evidence.
- New typed GET endpoints provide finance refreshes, pinned detail, thresholds and aware known-at
  filtering. Reads never acquire or publish. Source contract effective dates remain unknown;
  finance-query-v1 excludes that undated money from known subtotals and retains pending legal
  threshold status. Independent current-roster/report views do not relabel old research releases.
- Latest single local API measurements: detail 5.0 ms / 182,434 bytes; catalog 3.5 ms;
  thresholds 2.6 ms; book detail 3.5 ms. These are single requests, not p95 claims. All 161
  publication pointers and source/finance ingestion counts match before/after reads; real SQL
  mutation attempts reject. The owner's 3000/3100/8101 processes were preserved.
- Focused checks: 67 passed, including disposable PostgreSQL sealing/truncate/cross-scope
  rejection, source drift, decimal/unknown/zero semantics, provider precedence, frozen mappings,
  temporal API reads, unchanged earlier Stats output and frozen migration upgrade/downgrade.
  Ruff/format and strict mypy pass. [Final full suite](evidence/pc06/verification/python.log):
  1,932 passed, one existing browser-prerequisite skip, 19 published-data deselections and one
  existing Google GenAI/Python 3.14 deprecation warning. Dashboard checks/glance captures are not
  rerun for this backend-only block. The temporary PC06 API on 8102 was stopped after verification.
- PC06 remains `verification_blocked`: broad canonical salary mapping and real Spotrac cap/FA
  ingestion are pending. Missing values and market status are not invented to fill the gap.
  PC07 and PC08 have not started; finance first-load defaults are not promoted and G3 is not cleared.

## 2026-10-11 — PC07 season-level stats feeds verified

- Owner instruction: “Can you begin the next block”, noting data-source issues and quoting PC06
  commit `858b5ab`. Scope is PC07 only. PC05/PC06 stay `verification_blocked`; PC08 has not started.
- [Evidence and reproduction](evidence/pc07/README.md), [stats feeds contract](design/stats-feeds-v1.md),
  [run report](evidence/pc07/run-report.json), [coverage](evidence/pc07/coverage.json),
  [catalog capabilities](evidence/pc07/catalog-capabilities.json).
- Sources were checked before any code: the hoopR NBA Stats raw mirror is live and CC BY 4.0;
  pbpstats `get-totals` answers without robots.txt. Probing found three issues, all now encoded as
  rules: NBA Stats lineups stop at 2,000 rows and pbpstats at 500 (flagged `truncated`); some feeds
  are observed empty (2025-26 playoff matchups; four defensive play types), stored as empty, never
  zero; and hoopR's file labels run one year ahead for draft/combine, so scope comes from each
  payload's declared parameters.
- Real run (pinned commit `7f2c0afa…`): 205 fetches, all HTTP 200, 73,132,186 retained bytes. The
  first pass admitted 194 and rejected 11. Ten were early combine files with one `PLAYER_ID -1`
  placeholder each; that row is now kept with unknown identity, never name-matched. One was the
  2025-26 regular-season matchup file, which declares `"2025"`; it is accepted only because all
  147,303 rows carry `SEASON_ID 22025`. Every earlier dataset re-verified unchanged before the
  11 were re-admitted from retained bytes. Re-admission also exposed and fixed a bind-parameter
  overflow in the version lookup (rolled back, nothing written).
- Final: 205 immutable datasets, 200,690 row versions; 205/205 verify. Migration `13b810a4f011`
  adds three isolated tables; SQL rejects update/delete/truncate, membership extension and
  provenance edits on the real database. 161 publication pointers unchanged.
- dbt `tag:stats_feed`: 44/44 pass. Nine marts (play types, long-form tracking, defense, hustle,
  season matchups, lineups, draft combine, draft history, pbpstats totals). Spot checks match
  known facts (SGA isolation leader; 2025 draft order; Maluach widest 2025 wingspan), and pbpstats
  and NBA tracking minutes agree exactly for the top five players.
- The workbench catalog declares the eight observed capabilities `partial`, with seasons, phases,
  empty and truncated feeds. Placeholders remain for capabilities without observations.
- Checks: 37 focused unit/PostgreSQL checks; [full suite](evidence/pc07/verification/python.log)
  1,969 passed, one existing browser-prerequisite skip, 19 published-data deselections and the
  existing Google GenAI/Python 3.14 deprecation warning. Ruff/format and strict mypy clean.
- Not done: pbpstats WOWY (proposed: derive in PC11 from lineups, or record the gap); seasons other
  than 2025-26. Views wait for PC08/PC11. Dashboard checks are not rerun for this backend-only block.

## 2026-10-12 — Owner decisions D1–D5; PC06 unblocked

- Owner instruction: “Yes, implement the recommended decisions.” Decisions D1–D5 are recorded in
  the [plan](presentation-clarity-plan.md#owner-decisions-after-pc07-2026-10-12): BRef name-and-team
  identity rule; Spotrac stays stopped and HoopsHype unused; Free Agency removed; WOWY derived from
  lineups in PC11; further seasons only when PC09 needs them.
- [Evidence](evidence/pc06b/README.md). `map-bref-identities` mapped 590 of 608 BRef players with no
  ties or conflicts, reproducing the three manually verified mappings; 18 stay unresolved. 115
  active index players were registered from the pinned index. Mappings apply only to acquisitions
  made after them, so BRef was re-fetched (30/30 HTTP 200).
- Refresh `95b5fe42…`: 464 of 622 active players have a reported salary (was 3); 126 blank in source
  and 32 unlisted/unresolved keep explicit reasons. Verified. Its stored state stays
  `verification_blocked` (admitted before the state rule dropped the free-agent requirement).
- HoopsHype's robots.txt disallows Anthropic agents; after one probe no further requests were made.
- A first admission attempt rolled back but left staged files; they were kept and a fresh
  acquisition admitted, as the importer contract requires.
- Checks: 13 new identity tests and all PC06 finance tests pass (60); full suite, Ruff and mypy in
  the evidence. 161 publication pointers unchanged.
- Next: PC08 (Contracts views, Free Agency removal) to gate G3.


## 2026-10-12 — PC08 Contracts views and Free Agency removal (gate G3: stop for approval)

- Owner instruction: “Let's begin the next block” (PC08 after the D1–D5 unblock). Scope is PC08 only.
  PC09 has not started. **G3 approval is pending; PC08 is not verified until the owner approves.**
- [Evidence, glance test and reproduction](evidence/pc08/README.md); contracts updated:
  [finance refresh v1 (PC08 views)](design/finance-refresh-v1.md#pc08-contracts-views),
  [finance UI v1 note](design/finance-ui-v1.md), [Design Language v1.2](design/design-language-v1.md).
- `/contracts` now opens on real data with no parameters: it pins the latest 2026-27 refresh in the
  URL, then shows a 30-team payroll board against cap/tax/apron lines, KPI tiles and a team table.
  `/contracts/[team]` adds cap utilization, payroll flow, position and earner donuts, a 2026-27 →
  2031-32 contract timeline and a roster table with 2025-26 references and sealed RAPM.
- Free Agency removed per D3 (route, navigation, search); `/free-agency` redirects to `/contracts`.
  The B30 book explorer is unchanged in behavior and moved to `/contracts/books` (linked from
  Data details), keeping its import/correction workflow.
- New status `reported` (`#d0d788`): a BRef salary without an option marker is not claimed as
  guaranteed. `TimelineGrid` gains opt-in "Not listed" cells for seasons after a contract ends.
- Unknown salaries are excluded from all totals and charts and never shown as $0; totals are labeled
  lower bounds; threshold lines are markers, not compliance. 10 source-listed players on other
  index rosters (e.g. Lillard/MIL) are shown separately.
- Read-only on the real database: 161 publication pointers (same hash) and finance/identity row
  counts unchanged. Glance test 11/13 (`/contracts`) and 11/14 (`/contracts/[team]`), up from 3/12.
- Checks: Python 1,988 passed (7 new), Ruff/format/mypy clean; dashboard lint 0/0, typecheck,
  Vitest 415 passed; Contracts and finance Playwright specs pass. The full browser suite was memory
  constrained; after single-worker reruns, three failures remain, and all three also fail on HEAD
  `2c6c2c3`. The full browser run overwrote 101 sealed DL evidence screenshots; all were restored.
- Next: owner review at G3. After approval, PC09 (value metric and archetypes).

## 2026-10-11 — PC09 value metric and derived archetypes (names pending owner review)

- Owner instruction: “Let's begin the next block” after the PC08 G3 report, read as G3 approval
  with the report's recommended defaults: league board stays the `/contracts` first load, the
  `/contracts/books` operator tool stays, "Others" grouping is deferred to PC12, and the
  "Known salary minus cap" tile stays. Scope is PC09 only; PC10 has not started.
- [Evidence and reproduction](evidence/pc09/README.md); contract
  [value and archetypes v1](design/value-archetypes-v1.md); names
  [archetype-names-v1.json](design/archetype-names-v1.json).
- Value (C16) = sealed IM04 Box-Prior RAPM, selected by a fixed rule (latest completed regular
  season, longest window with a BPR: 2Y 2024-25 + 2025-26); no refit. Out-of-time folds on 1Y
  RAPM targets: for 2025-26, BPR 1Y Pearson 0.442 vs RAPM 1Y 0.397 and RAPM 2Y 0.481; the box
  prior alone has the lowest RMSE (2.888 vs zero 3.217). Diagnostic only.
- Archetypes (C17): GMM over nine regular-season rates (2023-24 to 2025-26, 1,112 player-seasons
  with ≥500 minutes). BIC chose K = 6 from {6, 7, 8}, matching the six categorical tokens. Proposed
  names: Lead creator, Spacing wing, Two-way connector, Stretch big, Interior hub, Rim runner.
  No source fetched (D5).
- Two independent runs reproduce the value `239bab91…`, evaluation `966d8181…` and archetype
  `91a5a7d3…` hashes. Serving manifest `765d55f1…` is served at
  `/api/workbench/value-archetypes` and declared as catalog capability `value_archetypes_pc09`.
  Unknown players return null with reasons. Methodology section added.
- 2026-27 coverage: of 622 active index players, 501 have a value, 504 an archetype, and 118
  neither (mostly rookies). PC10 must show these as unknown.
- Read-only on the real database; 161 publication pointers unchanged. Checks: 9 new tests;
  full Python suite 1,997 passed (one existing skip); Ruff/format/mypy clean; dashboard lint 0/0, typecheck,
  Vitest 415 passed.
- Next: owner review of the archetype names (rename = names file + new serving manifest, same
  fit). Then PC10 Roster Shapes to gate G4.

## 2026-10-11 — PC10 Roster Shapes (gate G4: stop for approval)

- Owner instruction: “Begin PC10, I agree with the proposed names”. Archetype names are
  `confirmed` unchanged; new serving manifest `5caeb935…` (names status only; fit `91a5a7d3…`
  unchanged). Scope is PC10 only. **G4 approval is pending; PC11 has not started.**
- [Evidence, glance test and checks](evidence/pc10/README.md); contract
  [Roster Shapes v1](design/roster-shapes-v1.md).
- `/roster-shapes` opens on real data with no parameters: pins the 2026-27 player index in the
  URL, then KPI tiles, a shared legend, Fullest / Best fit / A–Z and 30 team shape cards.
  `/roster-shapes/[team]` has tiles, a large diagram beside the legend and a roster table; the
  FO05 depth chart is its Depth chart tab, and old `?team=` links redirect there.
- Size = value over replacement, (BPR + 2.0) × share of a full season's 2025-26 minutes. Color =
  primary derived archetype. Outline = continuity (returning / new arrival / no 2025-26 sample);
  "Best fit" sorts by the returning share of value. White space = gap to the fullest roster.
  139 unknown players are listed, never drawn as zero. @taylormetrics credited.
- **Not built:** the Regular season vs Playoff-adjusted toggle. The only sealed playoff BPR is
  2025-26 alone (230 players, 5 meeting the 20-game rule). Owner decision at G4.
- Read-only: 161 publication pointers and 1,031 identities unchanged. Real result: OKC, SAS, HOU,
  BOS, DET fullest; glance test 9/13 on both pages.
- Checks: Python 2,007 passed (9 new), Ruff/format/mypy clean; dashboard lint 0/0, typecheck,
  Vitest 422 passed; roster, contracts and all 88 visual-baseline Playwright tests pass. In a broad single-worker
  run, the remaining failures predate PC10 or come from the owner's uncommitted Stats changes
  (details in the evidence).
- Next: owner review at G4. After approval, PC11 (populate or remove gated pages).

## 2026-10-12 — PC11 Populate or remove gated pages

- Owner instruction: "I approve, you can begin the next block" on the G4 report, read as G4
  approval with its defaults: **D6** the Regular season vs Playoff-adjusted toggle is dropped (only
  2025-26 playoff BPR exists; 5 players meet the 20-game rule) and **D7** PC10's fit and white-space
  definitions stay. Both recorded in the [plan](presentation-clarity-plan.md#owner-decisions-at-g4-2026-10-12).
  Scope is PC11 only; PC12 has not started.
- [Evidence, glance test and reproduction](evidence/pc11/README.md); contract
  [gated pages v1](design/gated-pages-v1.md); Design Language v1.2 gains `RankedBars`.
- Populated with no URL parameters, from data already held (no fetches): Defensive Matchups
  (NBA tracking defended shots vs expected, hustle, season matchups), Player Matchups (was
  `source_blocked`), play-type-adjusted shooting (points per 100 vs the league rate for the same
  play-type mix), Six-Factor RAPM (sealed IM04 factors, `sortMetric` on `/impact`), Combine &
  Wingspan (official combine 2000–2026, replacing a seed row repeated 100 times), a Stats Tracking
  tab and a player profile Tracking tab (8 groups, minutes-qualified percentiles). Feeds stay
  season totals on their own pages, never joined into date-windowed Stats.
- WOWY (D4) is derived from the sealed, event-accepted IM03 stints through the IM04 hash-checked
  binding: every pair of each team's top ten players, four splits that sum exactly to the team
  total (0 conservation failures over 6,201 pairs). Artifact `89ebf089…` reproduces in two runs and
  is re-hashed on every read. The old `/wowy` operation form (source-blocked in every scope) is
  retired; Teammate Stat Shift keeps the operation.
- Removed: Spatial EPV (redirects to RAPM Research) and, on the hosted build only, Planner
  (`NEXT_PUBLIC_COURTLENS_HOSTED_DEMO=1`). The gate notice, the old Matchups view and the seeded
  Combine explorer are deleted; legacy measurement GETs no longer write seed rows.
- Two real defects found and fixed during verification: a profile without a combine record could
  match a null-identity combine row (null === null), and duplicate region labels on Defensive
  Matchups.
- Read-only: 161 publication pointers, 1,031 identities, 205 feed datasets / 200,690 versions and
  340 legacy measurement rows unchanged. Glance test 11–12 of 13–14 applicable on every page
  (PC02: all failed first load).
- Checks: Python 2,018 passed (11 new), Ruff/format/mypy clean; dashboard lint 0/0, typecheck,
  Vitest 430 passed; Playwright on a clean export of the commit 403 passed / 4 failed before
  refreshing baselines that the new Stats tabs shift (3 popup + 2 Stats, regenerated from the clean
  build); `chart-kit.spec.ts:74` remains the PC08/PC10 failure. New PC11 spec (9) and 14 baselines.
- Not done: WOWY shows the team logo but not the two players' headshots; loading states are
  generic skeletons; PC13 must ship `data/derived/wowy-v1` with the other derived artifacts.
- Next: PC12 remaining audit batches (no owner gate between PC11 and PC12 in the plan).

## 2026-10-12 — PC12 batch A: table presentation

- Owner accepted defaults and authorized PC12: A → B → C → D; fixed-rule example boards; keep
  Players as a directory; retain the 340 unused measurement rows. Recorded in the plan. Scope of
  this commit is A only; no owner gate applies before the remaining batches.
- [Evidence and fresh glance test](evidence/pc12-a/README.md),
  [contract](design/table-percentiles-v1.md). Stats and its preview use the same server-calculated,
  minutes-qualified league reference; Players becomes a focused directory; all four Team table
  presets have shaded cells/group headers/game counts; saved Rankings has GP/MPG/PPG reference
  columns distinct from subjective order. Small samples keep muted numeric ranks and a badge.
- C10 rule is fixed at 500 season minutes through the cutoff. Recent windows use season
  qualification. League ranks survive search, favorites, team/sample filters, predicates and paging;
  nulls, ties, singleton cohorts, sealed impact qualification and future exclusion are tested.
  Existing metric values, retained PF01a percentiles and frozen hashes are not redefined.
- Isolated production first loads, real API, desktop/phone: no errors or sideways page scroll. Glance
  scores: Stats 10/14, Directory 12/14, Teams 11/14, fresh empty Rankings 4/9 applicable. These are
  measured limits, not all-page verification: dense Stats controls/phone fold, Team headline and
  exhaustive alignment/states remain; Rankings' empty first load is D.
- Read-only: 161 publication pointers with PC11 digest unchanged; 1,031 identities; 205 feed
  datasets / 200,690 versions; all 340 measurement rows retained. No acquisition or fit ran.
- Checks: full Python 2,031 pass (existing skip/deprecation warning), final focused PostgreSQL/unit
  30 pass; Ruff/format/mypy clean; dashboard lint 0/0, types clean, Vitest 431 pass; affected
  Playwright 35 pass and seven baselines pass. Broad browser run 405 pass / 15 skip / 8 failures
  before fixes: seven batch changes now pass; existing Compare export failure remains as PC08–PC11.
- Baselines refreshed for shading/legend and directory layout. 52px DOMRect checks allow 0.05px
  floating-point variation. Popup captures fix document scroll while retaining the native picker.
- Existing owner edits are excluded from the commit and production verification. Next: B headline
  visuals, including Contracts Others; C demo hygiene; D personal-tool example boards.

## 2026-10-12 — PC12 batch B: headline visuals

- Owner instruction: “Batch B is next” after A `3b0422e`. Scope is B only; C/D are pending and no
  owner gate applies between batches. Existing owner Stats/guide edits are preserved and excluded.
- [Evidence, first-load screenshots and fresh glance test](evidence/pc12-b/README.md);
  [headline contract](design/headline-visuals-v1.md). Teams, team profiles, Team Compare, RAPM,
  Forecasts, shooting research and Trends gain labeled main visuals with support/source. Player
  profiles show three trajectories on phone as well as desktop. Contracts cap graphic leads the
  KPI tiles; flows name five known earners and group Others by position without changing totals.
- Correctness: missing trajectory observations no longer become zeros or depress averages;
  signed comparisons preserve zero; empty reliability bins have no points. Team opponent shooting
  uses the already fetched same-scope Four Factors read when omitted from detail. Trends now uses
  the shared season-minutes example rule, pins its URL and provides a phone Change/focus control.
- Real production entry without parameters at 1440/390: 18 captures plus full-page versions,
  zero page/console errors, failed requests, sideways overflow, visible ISO dates or hashes.
  Headline sections begin at 154–284px desktop / 234–311px phone. Glance: 12/14 each;
  exhaustive alignment and per-page service-state injection remain partial, not marked verified.
- Read-only: 161 publication pointers (same before/after SHA-256), 1,031 identities, 205 feed
  datasets / 200,690 versions/members; all 340 legacy measurement rows retained. No fetch or fit.
- Checks: Python 2,032 pass (existing skip/deprecation warning); Ruff/format/mypy clean; dashboard
  lint 0/0, types clean, Vitest 436 pass (five new cases). Final affected Playwright 43 pass;
  18 new first-load baselines and 16 refreshed existing baselines pass. A separate affected run
  reproduces the existing Compare Export failure at `chart-kit.spec.ts:74`; no all-browser-green claim.
- Next: C demo hygiene (Evaluation availability, public investigations/saved-plot labels and
  Playoffs title), then D personal-tool example boards. Batch A's dense Stats/phone-fold limitation
  and page-wide alignment/loading-state limits remain recorded.
