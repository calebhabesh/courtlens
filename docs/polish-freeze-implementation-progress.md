CourtLoad was renamed to CourtLens on 2026-10-07; identifiers below are historical.

# CourtLoad polish freeze progress

Parent: [implementation handoff](polish-freeze-implementation-plan.md). **Owner authorized PF00 on 2026-10-05; baseline recorded; PF01 query correctness, PF02 visual foundation, PF03 scoped branding, PF04 shared selection, PF05 tables, PF06 route polish, PF07a–d assistant contracts/history/retrieval/integration and PF08 threaded UI complete at their measured boundaries; PF09 accepted the bounded freeze on 2026-10-06.** Planning decisions and inspection do not establish runtime completion.

## Planning baseline — 2026-10-05

- Starting revision: daedc03c66e7142c5a23ef918193e86e1b86af1a.
- Owner confirmed the direction through a grilling interview: 1440p desktop, near-black theme, quick tasks, shared incremental entity selection, scoped team logos, reference-style table guides, qualified leader questions and reasoned NBA discussion. Hybrid answers may use verified free external sources; local history persists until deleted.
- Latest clarification: infer “last season”; every question receives an answer, necessary clarification or honest inability statement. This does not require fabricating missing position data or completing all existing source gates.
- Read root/dashboard AGENTS.md, workbench/replica handoffs and UI/analytics/search contracts. Applied grilling, UI/UX design guidance and writing-for-agents. Delegated read-only UI/assistant fact investigations; no implementation agents or model substitutions were used for product changes.
- Inspected code and the owner's screenshots. Checked current official Google model/search/URL-context pricing and NBA leader qualification documentation. No credentials, provider inference, dataset downloads, database mutation or billing changes were performed.
- This planning slice adds the handoff, two polish contracts and this progress log. Application tests, browser acceptance and runtime measurements were not rerun. Documentation checks are recorded below after execution.

Pre-existing tracked dirty paths observed before planning: TODO.md; dashboard/components/live-workspace.tsx; docs/databallr-replica-implementation-progress.md; docs/design/live-ui-v1.md; docs/design/replica-analytics-contract.md; docs/design/shared-live-v1.md; scripts/verify_b32_live_browser.cjs; src/courtload/domain/live.py; src/courtload/models.py; src/courtload/services/assistant/execution.py; src/courtload/services/assistant/operations.py; src/courtload/services/assistant/saved.py; src/courtload/services/live.py; src/courtload/services/stats_engine.py; src/courtload/services/workbench_analytics.py; tests/unit/test_live.py; tests/unit/test_stats_engine.py.

Additional pre-existing untracked B19/B32 contracts/evidence, assignment migration/service/models/tests and native reconstruction tools were present. Preserve them. PF00 must capture the full current status and checksums rather than treating this abbreviated planning record as an implementation baseline.

## Block status

| Block | Owner | Status | Measured evidence |
| --- | --- | --- | --- |
| PF00 Baseline/inventory | Sol | complete (baseline; checks non-green) | [Measured inventory and classified failures](evidence/pf00-baseline/README.md) |
| PF01 Query correctness | Sol | complete; PF01a and PF01b verified | [Server cohort/entity contract](evidence/pf01a-query-contract/README.md); [catalog/context/dashboard integration](evidence/pf01b-dashboard/README.md) |
| PF02 Shared visual foundation | Flash (Codex substitute recorded) | complete at shared-foundation boundary | [Production previews, contrast/focus/overflow and actual zoom](evidence/pf02-foundation/README.md) |
| PF03 Branding/scoped identity | Sol → Flash (Codex substitute recorded) | complete at scoped-branding boundary | [Local assets, temporal identity, real production/browser verification](evidence/pf03-branding/README.md) |
| PF04 Entity selection | Flash (Codex substitution) | complete at bounded criterion | Shared committed entity selection, route migration, measured rendered/browser evidence recorded below |
| PF05 Table structure | Flash (Codex substitution) | complete at bounded table criterion | [Groups/guides/pinned geometry and measured table interactions](evidence/pf05-tables/README.md) |
| PF06 Route-wide polish | Flash | complete at route-polish boundary | [52-route measured audit](evidence/pf06-routes/README.md) |
| PF07a Assistant routing/defaults | Sol | complete at frozen execution-contract boundary | [Router/defaults/knowledge/contracts and retained evidence](evidence/pf07a-assistant/README.md) |
| PF07b Durable history | Sol | complete at durable backend/transport boundary | [Previously measured lifecycle/restore evidence](evidence/pf07b-history/README.md) |
| PF07c Free retrieval | Sol | complete at bounded backend retrieval boundary | [Previously measured source/adapter evidence](evidence/pf07c-retrieval/README.md) |
| PF07d Assistant integration/language | Sol | complete at bounded backend language/integration gate | [Scoring repair, final model regression and fresh holdout](evidence/pf07d-scoring-repair/README.md); original B34c evidence remains separate |
| PF08 Thread UI | Flash (Codex substitution) | complete at bounded threaded UI boundary | [Prototype](evidence/pf08a-ui/README.md); [full threaded acceptance](evidence/pf08-threaded-acceptance/README.md) |
| PF09 Freeze acceptance | Sol (Codex) | accepted at bounded freeze boundary | [Measured gates, repairs, recovery, resources and limits](evidence/pf09-freeze-acceptance/README.md); replica source/model/finance/Live gates remain open |

## Completion record template

For each completed block append: revision and owned files; prerequisites read; behavior changed; commands/environment; pass/fail/skip/warning counts; real versus fixture inputs; screenshots/viewport/zoom; measured latency/resources; retained checksum/reproduction results; source/model/provider limits; next dependency. Update the status row only when its criterion actually passes.

Preserve the original replica progress and capability ledger. A freeze-verified block does not close B14/B19/B20/B25/B26/B32/B37 gates without their own evidence.

## Planning document checks

- Checked all four new Markdown documents: relative link targets exist, final newlines present and no trailing whitespace; 15 links inspected, zero errors.
- git diff --check passed with no output.
- Compared current git status with the captured pre-planning status after excluding these four new paths: pre-existing tracked/untracked status entries are unchanged. This is a status/diff-scope check, not a checksum inventory of application files.
- Read-only handoff reviews corrected shared-file dependency/ownership, catalog-bound context/availability, historical branding fallbacks, retry/cancellation semantics and external-source evidence retention/validation.
- Application/runtime checks remain unexecuted in this planning slice. PF00 establishes the actual implementation baseline.

## PF00 — measured baseline, 2026-10-05

Owner confirmation: “Let's begin the first slice/block of work.” Read the freeze/replica/workbench handoffs, root/dashboard instructions and both polish contracts. Owned files: freeze evidence/progress, freeze confirmation wording and pointers in root AGENTS.md/replica handoff. No feature implementation, provider inference or delegation. The available Codex session performed PF00; no Flash-owned implementation was attempted.

- Starting revision `daedc03c66e7142c5a23ef918193e86e1b86af1a`; full dirty-file/checksum baseline and retained artifact inventory are recorded. Pre-existing application/source/evidence edits are preserved; generated Next environment declarations restored.
- Inventoried 52 page routes, referenced component controls, runtime catalog/status and retained database evidence identities. Every handoff finding has a runtime-confirmed or explicit untested classification. All-route task acceptance remains pending.
- Ruff/format/mypy, dashboard lint/types, 164 unit tests, Compose validation and production build pass. PostgreSQL-configured Python baseline: 797 passed, 9 failed, 19 errors, zero skips. Fixtures missing admitted source metadata are distinguished from model-constructor, restore, admission, recovery, sealing and stats failures.
- Ordinary Playwright command stopped on occupied port 3100. Isolated copy on 3151/4151 with mock API/webpack: 77 passed, 5 failed, 1 skipped, nine dev Fast Refresh warnings. Harness substitutions/failures and failure artifacts retained; no production-fix claim.
- Real production Stats/Ask/Settings captured at 2560×1440, 1440×900 and 375×812, DPR 1; 1280×720 fallback captures also retained. Actual 200% browser zoom remains untested because headless keyboard zoom did not take effect.
- Reproduced sort-selector/display disagreement, wrong sample noun, page-size-dependent percentiles, tricode Logos mode, centered wide content and native gray names. Queried 591 eligible 2025–26 players across six pages with no duplicates, approximately 1.25 seconds total wall time. Catalog advertises narrower coverage than status/executable queries.
- No publication, source admission, provider call or Live demand. Database tests used a new retained disposable database. Historical result reproduction, dbt and fresh restore remain pending; unchanged checksums are preservation evidence only.

Full commands, hardware, screenshots, raw logs, inventory, precise classifications and limits: [PF00 evidence](evidence/pf00-baseline/README.md). Next dependency: PF01; preserve original replica source/completion gates. PF00 completion means an established baseline, not green application acceptance.

## PF01a — server cohort and presentation query contract, 2026-10-05

Bounded backend prerequisite; **PF01 remains in progress**. Owner requested the next PF01 slice after PF00. Available Codex session, no delegation or presentation-agent substitution. Read root/dashboard and workbench/replica/freeze instructions and relevant analytical/UI contracts. Revision remains `daedc03c66e7142c5a23ef918193e86e1b86af1a` with pre-existing dirty work retained.

- Added opt-in `pf01a-v1` presentation schema to typed Stats queries: full eligible SQL cohort percentiles/per-metric valid counts, explicit display-entity filtering for dataset-wide Favorites, independent eligible/output counts and declared scope identity. Name/search/entity/paging presentation does not redefine the analytical population. New cursors bind the complete query and entity set. Existing analytical serialization and legacy total-points semantics remain unchanged.
- Independent raw-fact arithmetic exposed a retained per-36 rounding defect. The opt-in path now uses paired positive exposure and a single division; the legacy path retains its values for evidence reproduction. Unsupported modes/columns return explicit 422 responses within the bounded single-season player contract.
- Owned seams: new stats-presentation domain schema; additive Stats engine/API schema/route; optional shared TS contracts/client; PostgreSQL tests; read-only verifiers; evidence/progress. No global CSS, table rendering, catalog, comparison or assistant implementation in this sub-block.
- Targeted PostgreSQL/API/SQL tests: **21 passed**, no failures/skips/warnings. Ruff/format/strict mypy and dashboard lint/types pass; **164 dashboard unit tests pass**. Real data verifies nine window/sort combinations, independent points arithmetic, complete paging, full-cohort percentile reconciliation and off-page entity selection. Ten real PostgreSQL in-process HTTP queries: p95 **357.6 ms**.
- PF00's 25 legacy analytical rows/count/cursor reproduce exactly. All **185 retained investigation reproduction outcomes equal the checksum-verified PF00 engine**: 137 matching saved hashes, 48 pre-existing mismatches remain unresolved. Zero changes across 1,029 retained evidence files and 316 artifact files. Existing source/Live/assistant edits remain preserved outside owned seams.
- Enforced read-only application DB verification; synthetic temporary facts only in the disposable PF00 test DB. No migration/publication/acquisition/provider/Live action. No UI screenshots/zoom/build/browser acceptance claimed. PF00 full-suite failures remain visible; local HTTP timings are bounded evidence, not PF09 acceptance.

Full contract, commands, logs, hashes, timings and limits: [PF01a evidence](evidence/pf01a-query-contract/README.md). Next dependency **PF01b**: catalog/default/availability correctness, normalization-aware sorting, context serialization/navigation synchronization, count nouns and dashboard consumption. PF01 completion and PF03's shared-contract handoff await PF01b; original replica source gates remain open.

## PF01b — catalog, context and dashboard integration, 2026-10-05

Owner requested the named PF01b slice after PF01a. **PF01b and PF01 are complete at the query-correctness boundary.** Read prerequisite handoffs/contracts/evidence and installed Next.js guidance. Available Codex session, no delegation or Flash-owned visual restyling. Revision remains `daedc03c66e7142c5a23ef918193e86e1b86af1a`; pre-existing dirty work retained.

- Catalog now declares release-bound observed season/phase pairs, scoped exclusive cutoff defaults, supported Stats windows/normalizations/sorts and core availability. Real data exposes three seasons/four phases. Legacy query defaults and analytical serialization remain preserved.
- Stats/Players share the opt-in query workspace. Displayed metrics, labels, formats and sorts resolve together; server percentiles retain the full eligible population; Favorites supplies the whole entity set. Matching/eligible/page counts and continuous ranks are distinct. Percentile interpretation consumes server direction/sample metadata.
- Resolved defaults become explicit URLs; context options consume the catalog. Cutoff drafts synchronize through Back/Forward; season/phase changes select valid scoped cutoffs. Complete window context/aliases survive navigation and comparison GET submission. Unavailable selections remain visible. Count labels use their actual nouns.
- Saving is explicitly a legacy scope recalculation, excluding Favorites/percentiles and rejecting unsupported advanced-save controls. No new presentation artifact persistence or unrelated source-gate completion is claimed.
- Owned seams: additive catalog/query schemas/router and shared TS contracts; new catalog/query helpers and shared Stats workspace; Stats/Players/context/comparison/explorer and count-label callers; relevant tests/fixtures/verifiers; evidence/progress. No arithmetic, migration, publication, global CSS, branding, lookup or assistant change.
- **22 PostgreSQL/API/SQL tests and 176 dashboard unit tests pass**; Ruff/format/strict mypy and dashboard lint/types pass with zero diagnostics. Isolated production webpack build passes. Twelve real catalog-default queries all succeed, nearest-rank p95 **289.9 ms**; production real-service Chromium records **19 successful checks**, zero page errors. Four affected fixture Playwright workflows pass after hydration readiness correction.
- Browser reconciles actual table values/order/percentiles/counts/ranks with HTTP results, verifies modes/pages/search, default URLs, context Back/Forward/season/phase/navigation/comparison and an off-page Favorite. Only the workspace favorite is a read-only proxy fixture (Scottie Barnes at source row 61); source arithmetic/results are real. Screenshots at 2560×1440, 1440×900 and 375×812, DPR 1, ordinary zoom. Actual 200% zoom and visual freeze acceptance remain pending.
- Nine independent real arithmetic/paging scopes pass. All **185 retained reproduction outcomes remain equal to PF00**, including 48 existing hash mismatches. Zero changes across 1,029 retained evidence files/316 artifacts and unrelated pre-existing dirty paths. No database publication, persistent personal mutation, acquisition/provider call or Live demand.
- Isolated Turbopack symlink-root failure and initial fixture streaming/hydration failures are retained and classified. Final standalone production and scoped checks pass. PF00 full-suite failures remain open; no full-suite green claim.

Full contract, commands, logs, screenshots, timings, reproduction and preservation: [PF01b evidence](evidence/pf01b-dashboard/README.md). PF01 shared contracts are ready for PF03; next independent foundation is **PF02**, followed by the remaining branding/selection/table/route blocks under their dependencies. Preserve original replica coverage/source gates; PF09 remains pending.

## PF02 — shared visual foundation, 2026-10-05

Owner requested PF02 after PF01 completion. **PF02 is complete at its bounded foundation criterion.** Read root/dashboard instructions, the workbench/replica/freeze handoffs, UI contract and prerequisite evidence; applied focused UI/UX skill guidance and installed Next.js output documentation. Gemini 3.8 Flash is unavailable in this session: Codex performed the Flash-owned implementation as an explicit substitution, without delegation or concurrent shared-file writers. Revision remains `daedc03c66e7142c5a23ef918193e86e1b86af1a`; starting dirty-file hashes and unrelated changes are preserved.

- Added semantic near-black/charcoal tokens, common spacing and 40px/44px controls, 56/46/64px desktop application/navigation/context minimums, flat panels and explicit section gaps. Removed the global centered clamp and page overflow masking; fixed long Settings metadata wrapping. Preserved approved local fonts and the basketball mark; removed the shell subtitle.
- Added bounded shared Button/IconButton/Section/Toolbar and field/status/empty-state conventions, pinned Lucide with a decorative SVG wrapper, shell/search icons, button reset and native-select chevron/insets. Ask/player names have transparent backgrounds; PF05 still owns subsequent linked identities/table behavior. Keyboard menus support arrows/Home/End/Escape and focus return; narrow search wraps into its own row.
- Owned seams: global CSS, layout/navigation, Settings worker-section adoption, global lookup search icon only, new shared UI primitives, package/lock files, bounded Home/Teams fixture hydration waits, read-only preview verifiers and evidence/progress. No analytical schema/arithmetic, branding catalog, lookup engine, assistant behavior or persistence change.
- **176 dashboard unit tests and 21 fixture browser workflows pass**; Ruff/format/strict mypy and dashboard lint/types pass with zero diagnostics/warnings. Isolated production webpack build passes. Twelve real-service Stats/Ask/Settings previews and reset/disabled/keyboard/drawer/mobile checks pass with zero page exceptions. Minimum semantic text contrast **7.14:1**; interactive boundaries exceed 3:1; all measured selects meet height/inset targets; no page horizontal overflow.
- Screenshots at CSS 2560×1440, 1440×900 and 375×812, DPR 1, plus **actual 200% browser zoom**, DPR 1→2 and approximately halved CSS viewport. Exact dimensions are retained. Zoom uses headed Chromium/X11/Xvfb, OS keyboard events and actual window capture; Playwright's cropped zoom screenshot path is excluded from final evidence.
- Final real previews use a read-only passthrough with CORS for isolated ports, **without response substitutions**. Original CORS settings exclude those temporary ports and remain unchanged. Fixture analytical/assistant failure/empty/retry workflows remain separately identified. Initial duplicate streamed DOM test failures are retained; explicit hydration waits resolve them without weakening assertions. No provider inference, acquisition, publication, migration, persistent personal mutation or Live demand.
- **185 retained reproduction outcomes unchanged**, including 137 matching saved hashes and the same 48 existing mismatches. Zero changes across 1,801 outside-scope starting files, 1,124 prior evidence files and 316 artifacts. Package audit retains seven existing findings (six high/one critical); affected package versions are unchanged and Lucide has no audit finding. PF00 full-suite failures and original source gates remain open.
- Raw production output sizes are retained as bounded resource measurements; no new API/lookup latency or memory benchmark is claimed. Route-wide migration, branding, recurring table guides, assistant behavior and PF09 acceptance remain separate.

Commands, environment, logs, screenshots, resource measurements, retained identities and limits: [PF02 evidence](evidence/pf02-foundation/README.md). Next dependency **PF03**: bounded local team branding and context-bound identity, using PF01's frozen contracts and PF02's foundation. Stop at this verified boundary; preserve replica coverage/source gates.


## PF03 — team branding and scoped identity, 2026-10-05

Owner requested PF03 after PF02. **PF03 is complete at its bounded identity criterion.** Read root/dashboard instructions, workbench/replica/freeze handoffs, UI/search/analytical contracts and prerequisite evidence; applied focused UI/UX guidance and installed Next.js static/standalone documentation. Available Codex session performed backend and presentation sequentially; Gemini 3.8 Flash is unavailable, so its presentation work was explicitly substituted. No delegation or concurrent shared-file writers. Revision remains `daedc03c66e7142c5a23ef918193e86e1b86af1a`; pre-existing dirty work retained.

- Retained 30 official NBA SVG logos locally, **194,444 bytes total**, with canonical IDs/exact tricodes, source URLs, SHA-256 hashes, acquisition/last-modified dates and ownership/reuse notes. Explicit setup validates bounded SVG content; offline verification checks every asset. Runtime analytical reads/builds never download branding. Current-franchise artwork is decorative; unknown historical codes remain literal.
- Lookup adds selected-season/phase/exclusive-cutoff associations from observed appearances, including all represented teams; unscoped lookup explicitly says Last observed. Empty selected scope never borrows a future team. Typed associations, destination context and client version/scope cache keys agree. Warm lookup resolves release metadata without scanning player coverage; new association queries are bounded to at most 20 returned players and cached per entity/scope.
- Shared TeamLogo/TeamLogoStack render actual logos in player/team lookup, Stats rows, team table/cards/profile and comparison cards. Combined trades show every represented team; team filters and last-five windows show their actual participation. Missing/failed assets preserve names/abbreviations/dimensions. Scope changes and cache hits invalidate obsolete displayed associations; PF04 still owns complete shared picker/lookup-engine acceptance.
- Comparison API had no represented-team field despite its UI contract. Added API-only, window-bound enrichment without changing analytical/saved serializers; PostgreSQL tests prove last-five versus full-season teams and no mutation of legacy payloads. Owned lookup/schema/router/TS cache-client seams, identity renderers/CSS, team/comparison reuse, bounded tests/verifiers/assets/evidence and progress. No Stats arithmetic, migration, publication, assistant or personal persistence change.
- **28 PostgreSQL/API/SQL tests, 14 isolated SQLite lookup regressions and 177 dashboard unit tests pass**; Ruff/format/strict mypy and dashboard lint/types pass with zero diagnostics/warnings. Isolated production webpack build passes. **21 fixture browser workflows pass** after explicit hydration/navigation waits; initial streaming/redirect races and browser harness assumptions are retained and classified without weakening assertions.
- **17 production real-service checks** pass with zero page exceptions and 112 branding requests served locally. Independent raw-fact SQL reconciles 12 real player/season/phase/cutoff scopes plus unscoped/invalid-release paths. Historical-code and failed-image browser fixtures are explicitly distinguished from real admitted facts. Screenshots at 2560×1440, 1440×900 and 375×812, DPR 1; two **actual 200% browser zoom** checks pass, DPR 1→2 and CSS width 2559→1279, with actual OS-window captures.
- Real-service warm lookup p95 **2.19 / 3.53 / 7.03 ms** for 1/2/4 concurrent clients, 20 requests each; a 20-row response is **17,402 bytes**. In-process warm HTTP p95 **1.52 ms**, with zero player-fact queries across 20 warm requests. Exact-key first request is 9.66 ms, not process-cold acceptance. Settled-input latency and whole-installation memory remain unmeasured; bounded cache/asset sizes are recorded.
- **185 retained reproduction outcomes unchanged**, including 137 matching saved hashes and the same 48 existing mismatches. Zero changes across 1,833 outside-scope starting files, 1,160 prior evidence files and 316 artifacts. No provider inference, paid source, basketball-fact acquisition, retained DB mutation, publication, persistent workspace mutation, hosting or Live demand. PF00 full-suite failures and original replica source gates remain open.

Commands, logs, screenshots, source/reuse notes, scope/cache measurements, retained identities and limits: [PF03 evidence](evidence/pf03-branding/README.md). Next dependency **PF04 shared entity selection**. Stop at the verified PF03 boundary; recurring guides/table interactions, route-wide polish, assistant and PF09 remain separate.

## PF04 — shared entity selection, 2026-10-05

Owner requested continuation into PF04 after PF03. **PF04 is complete at its bounded shared-selection criterion.** Read the freeze handoff/contracts, prerequisite evidence and root/dashboard instructions; applied focused UI/UX guidance. Gemini 3.8 Flash is unavailable in this session, so Codex performed the presentation work as an explicit substitution. Pre-existing dirty work remains preserved.

- Added a shared, scope-aware `LookupInput` with cancellation, stale-response protection, bounded versioned cache, debounce, retry/error/no-match/no-current-season states, IME-safe keyboard behavior and accessible option IDs. Added canonical `EntityPicker`/`EntityField` controls with named removable chips, deduplication, exclusions, max-selection enforcement and planner-local candidate restrictions.
- Migrated comparison, team comparison, WOWY/shared-floor, shooting, trends, distributions, similarity, roster allocation, learning, recent games, showcase, ranking boards, tier lists, planner and Ask entity controls. Context, scope, Back/Forward and comparison navigation remain URL-bound; committed selections render canonical names and identity stacks. Personal ranking/tier controls pass their isolated browser checks.
- Canonical lookup matching and catalog version are explicit (`pf04-v1`); cache keys are structured to prevent delimiter collisions and expire after 30 seconds. Fixture lookup responses and focused browser/unit coverage exercise ambiguity, stale scope responses, IME, touch, retry, cache, context preservation and candidate validity.
- **28 PostgreSQL/API/SQL tests, 15 lookup regressions and 179 dashboard unit tests pass**; Ruff/format/strict mypy and dashboard lint/types pass with zero diagnostics. Isolated production webpack builds pass. The retained affected fixture run records **48 passing workflows**; the existing forecast strict-mode duplicate-badge failure remains classified, and the final planner-only rerun was harness-limited after its temporary server exited, so no planner-pass claim is made.
- Real-service Chromium records **15 successful PF04 checks** with zero page errors; navigation checks record four successes. Actual 200% browser zoom records two successful checks at DPR 2. Settled input latency is 20 warm samples, p95 **126.7 ms**; lookup HTTP warm p95 is **2.61 / 3.92 / 8.86 ms** for 1/2/4 concurrent clients and a 20-row response is **17,402 bytes**.
- **185 retained reproduction outcomes remain unchanged**, including 137 matching saved hashes and the same 48 existing mismatches. No provider inference, acquisition, publication, migration, retained personal mutation or Live demand occurred. Original replica source gates and PF00 full-suite failures remain open.

Commands, logs, route inventory, screenshots, browser checks, latency measurements, retained identities and limits: [PF04 evidence](evidence/pf04-selection/README.md). Next dependency **PF05**: recurring table interactions and route-wide polish. Preserve the original replica coverage/source gates.

## PF05 — table structure and interactions, 2026-10-05

Owner requested PF05 after recorded PF04 completion. **PF05 is complete at its bounded table criterion.** Read root/dashboard instructions, workbench/replica/freeze handoffs, UI contract and prerequisite evidence; applied focused UI/UX guidance and installed Next.js client documentation. Gemini 3.8 Flash is unavailable, so Codex performed its presentation ownership as an explicit substitution. No delegation or concurrent shared-file writer; pre-existing dirty work preserved.

- Added metadata-driven contiguous groups and recurring decorative Photos/Logos/Initials/None guides. Overview groups Profile/Counting/Defense/Efficiency; custom selected-column order and spans remain aligned, including normalization deduplication. Primary portraits/team identity remain available in every guide mode; guides have no focus stops or analytical/export meaning.
- Fixed pinned identity geometry and 88px metric widths with labelled internal scrolling. Primary portraits are 36px; table values/percentiles use 14/11px text. Measured first-row heights are 53px desktop and 57px narrow, allowing identity wrapping; no unmeasured 44–48px claim. Narrow name search is a usable 319px full row. Names are scoped profile links; separate detail buttons open a focus-contained drawer with focus return.
- Stats, Teams and playoff series tables share native keyboard sort buttons and aria-sort. One focused-table shortcut handler prevents double C and ignores editable/modified/IME events; A/D scroll, W/E adjust density and T expands height. Presentation-only guide/view/density changes preserve cursors; analytical changes reset them. Filter drafts synchronize after navigation. Server percentiles, dataset-wide Favorites and continuous ranks remain authoritative.
- Comparison selections resolve named off-page identity with bounded scoped lookup. Tray layout preserves access to table/paging controls; removal/clear and complete context links work. Three-plus selections explicitly compare the first two, matching the existing route. Selection/favorite failures now show actionable inline messages while preserving state.
- Owned seams: explorer/preset metadata and tests, shared table UI/CSS, Teams/playoff series tables, detail drawer/tray, decorative logo option, Hotkeys/Lucide additions, focused browser tests/verifiers and evidence/progress. No backend arithmetic/schema, package, migration, publication, source or assistant change.
- **28 PostgreSQL/API/SQL tests and 181 dashboard unit tests pass**; dashboard lint/types and Ruff/format/strict mypy pass with zero diagnostics/warnings. Isolated real/fixture production webpack builds pass. **13 affected fixture workflows pass**, including custom order, failure recovery, playoff sort and larger-tray copy. The existing forecast duplicate-badge failure remains classified and excluded from the final affected run.
- **66 production real-service contract checks**, **three final layout checks** and **three actual 200% browser zoom checks** pass. Production reconciles all displayed supported metric cells across nine presets × three counting modes, all four guide modes across presets, sort/order/ranks, paging/search/Favorites, off-page selections, shortcuts, drawer focus and pinned scrolling. Zero page errors/console warnings in the contract run. Screenshots at CSS 2560×1440, 1440×900 and 375×812, DPR 1; actual zoom uses OS keyboard/window captures at DPR 2 and CSS 1280×676, document width 1272.
- Analytical API responses are real FastAPI/PostgreSQL; personal interactions use an explicitly disposable in-memory proxy, with Scottie Barnes as the off-page Favorite. Custom/failure/playoff/larger-tray cases are rendered fixtures. No retained personal mutation, acquisition, provider inference, hosting or Live demand.
- Nine independent real arithmetic/paging scopes pass; **185 retained reproduction outcomes unchanged**, including the same 48 pre-existing mismatches. Zero changes outside owned starting files; **1,266 prior evidence files preserved** and **316 artifact hashes** equal PF04. Ten retained read-only in-process HTTP requests have p95 376.1ms; no new lookup/installation memory or PF09 performance acceptance claim.
- A broader backend run records 34 passes/two archive-fixture failures from the disposable DB's missing published release; the correct targeted run passes 28 with zero skips. Initial navigation/proxy/scroll/preference/alert harness failures are retained and corrected without weakening behavior assertions. Original source gates and PF00 full-suite failures remain open.

Commands, logs, surface inventory, screenshots, exact measurements, preservation and limits: [PF05 evidence](evidence/pf05-tables/README.md). Next dependency **PF06 route-wide workflow and copy polish**. Stop at this verified table boundary; PF07–PF09 and unresolved replica gates remain separate.


## PF06 — route-wide workflow and copy polish, 2026-10-05

Owner requested PF06 after recorded PF05 completion. **PF06 is complete at its bounded route-polish criterion.** Read root/dashboard instructions, workbench/replica/freeze handoffs, UI contract and prerequisite evidence; applied UI/UX guidance and installed Next.js documentation. Gemini 3.8 Flash was unavailable; Codex substituted for presentation ownership sequentially, without delegation. Pre-existing dirty work was preserved.

- Desktop/mobile navigation now shares one destination model and bounded release-capability catalog. Working partial tools remain primary; source-dependent unavailable/unverified destinations stay accessible through Availability, with reasons/alternatives. Sealed research reports, including completed negative results, remain accessible independently. Historical Finals uses its actual `live_mode=history` parameter. No per-destination statistical probes or model calls.
- Catalog-bound season/phase controls, humane enums, exclusive cutoff copy and Advanced source details serve WOWY/shooting/roster. Trends/distributions/similarity season options and scoped pickers use the catalog; team routes replace fixed 2023–24 defaults. Playoff controls show their actual postseason phase. Roster navigation/profile links/exports retain resolved context. Splits/Opponent requests now preserve release, phase and cutoff using existing API fields; a rendered regression checks postseason payloads.
- Settings leads with portraits/configuration/install, places diagnostics under details, distinguishes configured key from provider health and queue idleness from liveness, and shows Unknown when portrait status is unavailable. Removed task-facing milestone prose; retained analytical/source/model/hypothetical limits. Shared full-width research spacing, Lucide chart/export/slideshow actions and responsive grids/tables fix measured narrow overflow in case studies, showcase, team comparison/profiles and playoff series.
- All **52 canonical pages** and transitive controls are inventoried/reviewed. Shared committed entity selection remains from PF04. Ask has production previews and a specific PF08 checklist; its route/components/client/backend remain unchanged. Owned frontend/control/copy/context/helper/test/verifier files are recorded; no backend schema/arithmetic, package, migration, publication, acquisition, provider inference or retained personal mutation.
- **28 PostgreSQL/API/SQL tests, 184 units and 54 affected fixture workflows pass**; Ruff/format/strict mypy and dashboard lint/types pass with zero diagnostics/warnings. Isolated real/fixture production webpack builds pass. Fixtures cover availability failures/partial sources, unsupported/navigation scope, source/model/negative/integrity states, numerical unknowns, projections, finance, saved reopening/mismatch/exports and installation.
- Real-service evidence records **52 page/state audits** at 1440×900/375×812, **20 preview/navigation checks**, **8 chart/roster/research tasks**, **4 context checks**, **6 supplemental layout measurements** and **5 actual 200% browser zoom checks**. Zero final document overflow/page exceptions. Screenshots at CSS 2560×1440, 1440×900 and 375×812, DPR 1; actual zoom uses OS keys/window captures at DPR 2, CSS 1280×676. Research gutters measure 24px desktop/16px narrow.
- **185 retained outcomes unchanged**, including the same 48 pre-existing mismatches; **316 artifact hashes unchanged** and zero outside-owned starting-file changes. Ten retained read-only HTTP requests have p95 **366.6ms**; no new whole-installation memory/lookup or PF09 resource acceptance is claimed. Real analytical responses are not substituted; workspace interaction uses a disposable proxy. Final historical Live traversal creates no demand.
- Initial stale Team ID/learning-fixture expectations, wrapped-field accessible labels, unsupported preview CORS origin, mobile grids/tables, an undefined spacing token, obsolete historical query alias and a wrong saved-detail namespace are classified in evidence. Final owned workflows pass; original PF00 full-suite/forecast fixture failures, audit findings and replica source/model/finance/Live gates remain open.

Commands, raw logs, complete route/control inventory, Ask checklist, screenshots, exact dimensions, retained outcomes and preservation: [PF06 evidence](evidence/pf06-routes/README.md). Next dependency **PF07a**: hybrid assistant router/defaults/knowledge/answer contracts, then PF07b–d and PF08. Stop at the verified PF06 boundary; PF09 and unresolved source gates remain separate.


## PF07a — hybrid assistant routing, defaults, knowledge and contracts, 2026-10-05

Owner requested PF07a after PF06. **PF07a is complete at its execution-contract boundary;
PF07b–d, PF08 and PF09 remain pending.** Read root/dashboard instructions, workbench/replica/
freeze handoffs, analytical/search/assistant contracts and prerequisite PF01/PF06 evidence.
Available Codex session, sequential ownership, no delegation or runtime-model substitution.
Revision remains `daedc03c66e7142c5a23ef918193e86e1b86af1a`; pre-existing dirty work preserved.

- Added `/assistant/v2/turn` and frozen Pydantic/generated TS/JSON contracts for requests,
  readable typed answers, exact local evidence, source-backed fact tuples, safe navigation,
  accounting and future durable thread/turn/history payloads. V1 routes/readers/manifests
  remain compatible. The existing request-byte bound now covers v2.
- Reused the canonical operation registry, supervised read-only executor, equivalent-query
  serializer and bounded planner. Local claims bind the actual row/entity/metric/unit/
  sample/context/result; equal values in other rows cannot substitute. Mixed knowledge/local
  or knowledge/inability answers retain their origins and resolved scope under one deadline.
- Packaged ten versioned Markdown knowledge sections with source identity/hash/update date/
  route links; guidance observes current release/season/phase coverage without executing Stats
  or calling a model. Explanations/opinions do not manufacture an analytical release. Opinion
  guidance states criteria without inventing player-specific factual superiority.
- Added injectable New York civil-date defaults, a source-referenced verified completion
  calendar including delayed Finals, relative/explicit season precedence, phase/window/cutoff
  changes and retained-release inheritance. The exact PG example resolves 2025–26 on the
  frozen date and explains the missing dated cohort/retrieval path. Official APG qualification
  policy uses decimal arithmetic and the season-end exception; research minimums and partial
  cohorts never establish an official leader.
- Frozen 12 held-out routing cases and a separate 45-case versioned routing corpus. These are
  deterministic router regressions, not a real-provider language/factual-answer gate. Distinct
  provider/quota/busy/timeout/malformed/backend/no-observation/scope failures terminate with
  readable, sanitized responses and useful actions. Reserved external facts require exact
  adapter-owned entity/value/position/period/locator bindings; no external adapter is enabled.
- Verification: **202 backend checks pass, zero skips/warnings**, including **15 real disposable
  PostgreSQL integration checks** for v2 plus preserved v1 relational/save tests; **184 dashboard
  tests**, dashboard lint/typecheck, isolated production webpack build, generated-contract drift
  check, full Ruff check/format, strict mypy and diff checks pass. **10 actual Uvicorn/retained-DB
  HTTP tasks** pass with zero provider calls; the slowest final request measured **745.1ms**.
- **185 retained reproduction outcomes unchanged**, including the same 48 pre-existing hash
  mismatches. All **33 retained v1 saved conversations reproduce**. **316 artifact hashes** and
  outside-owned starting files remain unchanged. No publication, acquisition, migration,
  persistent personal mutation, inference, retrieval or Live demand. No new UI/browser/history
  acceptance is claimed; existing classified freeze failures and source gates remain separate.

Full contracts, fixtures, commands, raw checks, measurements, preservation and limits:
[PF07a evidence](evidence/pf07a-assistant/README.md). Next dependency **PF07b**: durable local
history and concurrency/replay/cancellation/recovery. PF08 can prototype from the frozen v2
fixtures; complete assistant/UI acceptance still requires PF07b–d and PF08.


## PF07b — durable local assistant history, 2026-10-05

Owner requested PF07b after PF07a. **PF07b is complete at its durable backend and same-origin
transport boundary; PF07c–d, rendered threaded UI in PF08 and PF09 remain pending.** Read
root/dashboard instructions, workbench/replica/freeze handoffs and assistant/analytical/search
contracts. Codex implemented sequentially without delegation; pre-existing dirty work preserved.

- Added three local history/input-reference tables and additive migration `07b810a4f005`.
  Questions commit before work starts; durable pending/running/completed/failed/cancelled states
  keep partial work separate from verified answers. V2 schemas remain frozen and unchanged.
- PostgreSQL lifecycle locks coordinate idempotent acceptance, publication, cancellation and
  deletion across workers. Exact original-request replay survives reload/restart; collisions
  and simultaneous turns return 409. Intentional retries use new request IDs linked to terminal
  unsuccessful turn IDs. Stop/deletion fence late publication. Expired 50-second leases recover
  on polling/acceptance into readable failures without automatic inference/retry.
- Paginated headers/chronological turns support New chat/reopen/delete/Clear history. Each turn
  retains its own scope, exact cells/results, sources/excerpts and digests. Latest selections and
  prior plan come from bounded server records. Initial drawer guidance preserves its page scope.
  History deletion preserves separately saved append-only analytical findings.
- V2 mutations now require existing workspace credentials. A fixed-target Next proxy enforces
  same-origin writes and bounded bodies, keeps credentials server-side and rejects redirects/
  unknown targets. Typed history helpers and local-history/provider notice are ready for PF08;
  existing v1 chat controls are unchanged.
- Backup archives fence history writes across dump/manifest creation; restored inventories
  include validated transcript, working context, retry/lease/sequence and relational inputs.
  Actual PostgreSQL dump/restore, migration upgrade/downgrade/full fresh chain, backup locking
  and tamper rejection pass. The installation received the additive migration only; its retained
  history tables remain empty. Runtime/browser transcript mutations use a disposable database.
- **220 backend checks pass**, zero failures/skips/warnings, including **18 durable-history
  PostgreSQL checks**. **188 dashboard tests**, full Ruff/format/strict mypy, dashboard lint/types,
  frozen-contract drift, isolated production webpack build and diff checks pass.
- **14 actual Uvicorn/restart HTTP checks and four production Chromium proxy checks pass**;
  zero browser page exceptions/provider calls. Small deterministic HTTP requests max **16.122ms**;
  this is not large-history, inference or PF09 resource acceptance. Browser checks exercise
  transport/reload from Settings, not PF08's pending rendered conversation controls.
- **185 retained outcomes unchanged**, including the same 48 existing mismatches; all **33 saved
  v1 conversations reproduce**. **316 artifact hashes unchanged** and no unexpected changes
  against the PF07a baseline. No acquisition, analytical-data mutation, publication, inference,
  external retrieval, paid dependency, hosting, Live demand or retained personal mutation.

Commands, raw logs, contracts/lifecycle semantics, provenance/restore evidence, classified
harness issues and preservation: [PF07b evidence](evidence/pf07b-history/README.md).
Next dependency **PF07c — bounded retrieval**. External retrieval remains pending; preserve
original replica source/model/finance/Live gates and the PF08/PF09 boundaries.

## PF07c — bounded retrieval, 2026-10-06

Owner requested PF07c after PF07b. **PF07c is complete at the bounded backend retrieval
boundary; PF07d integration/language, PF08 threaded UI and PF09 acceptance remain pending.**
Read preserved workbench/replica/freeze handoffs, assistant/search contracts and prerequisite
history evidence. Codex implemented sequentially without delegation; starting dirty work retained.

- Added a versioned source registry with three **actually fetched/parsed free primary NBA pages**:
  2023-24 and 2026-27 published regular-season opening dates, and the NBA Video Rulebook assist
  explanation. Source access/reuse, publication/unknown update dates, periods and TTLs are in the
  [source contract](design/pf07c-free-sources.md). Oversized NBA.com probes and missing endpoints
  remain disabled. No general search engine, paid grounding, provider tool or billing change.
- Exact HTTPS source identities, every redirect and all resolved public addresses are validated;
  connections pin the validated numeric IP while TLS checks the original hostname. Mixed private
  DNS answers/multicast, source-changing redirects, active/hidden markup and fetched instructions
  fail or are excluded. No ambient proxy/cookie/secret or arbitrary URL/tool access.
- Every mixed turn shares four source requests, two redirects per fetch, 256 KiB accepted body
  per response, 128 KiB total extracted text and the existing 45-second deadline. Source reads
  return within eight seconds/remaining time; four outstanding worker slots bound DNS/network
  work. No nested retry loop, evidence trimming or provider/analytical budget expansion.
- Adapter-owned exact facts bind entity/metric/value/unit/period/qualifier/locator to source text.
  V2 uses its already frozen fields; no schema, migration or dashboard control changed. Small
  deep-copied support records have a 32-entry cache; hits retain their original retrieval identity
  and cost zero requests. Expiry requires fresh verification; stale/conflicting/failed reads keep
  honest source states. No source-reported fact becomes admitted local analysis or a saved finding.
- Durable history/replay retains excerpts, structured support and source digests after cache expiry
  and process restart. Actual PostgreSQL source-envelope dump/restore and cancellation during
  retrieval pass. Runtime transcript mutations use only the disposable verifier database.
- **279 backend checks pass**, zero failures/skips/warnings, including **56 retrieval unit and
  three retrieval PostgreSQL checks**. **188 dashboard tests**, full Ruff/format/strict mypy,
  dashboard lint/types, generated-contract drift and diff checks pass. **13 real HTTP/restart
  checks** and **3/3 real source acquisitions** pass, with zero provider/analytical calls.
- Largest observed source body **133,532 bytes**, extracted text **14,795 bytes**; slowest source
  **462.633ms**, slowest recorded HTTP call **184.721ms**. These narrow deterministic tasks do
  not establish language/general factual-answer accuracy, live-data freshness or PF09 resources.
- **185 retained outcomes unchanged**, including the same 48 existing mismatches; all **33 saved
  v1 conversations reproduce**. **316 artifact hashes unchanged**, with no unexpected changes
  outside owned files. No warehouse acquisition/admission, analytical mutation, publication,
  inference, paid dependency, hosting, Live demand or retained personal mutation.

Measured records, commands, ownership/preservation, source boundaries, classifications and limits:
[PF07c evidence](evidence/pf07c-retrieval/README.md). Current roster/injury, dated PG and official
whole-league leader requests still explain their actual source gap. No rendered threaded UI,
new production build/browser acceptance or full freeze completion is claimed. Preserve all
original replica source/model/finance/Live gates. Next: **PF07d — integration/language evaluation**;
threaded UI remains **PF08**.

## PF07d — deterministic integration; language gate pending, 2026-10-06

Owner requested PF07d after PF07c. **Deterministic backend integration is verified;
PF07d is partial until eligible-project real-model language evaluation passes.** PF08
threaded UI and PF09 remain pending. Codex worked sequentially without delegation,
reading the preserved handoffs/contracts and retaining the starting dirty tree.

- Froze a new **49-case hybrid corpus with 12 held-out cases** before evaluation.
  **49/49 cases** pass through disposable PostgreSQL-backed durable HTTP, with exact replay,
  persisted question/answer and fixture-plan/manual canonical operation/context/result equality.
  Existing B33/B34/PF07a corpora, v1 saved evidence and v2 wire contracts are unchanged.
- **48/48 applicable retained-input cases pass**: **11/11 applicable held-out**, **16/16 critical
  inability/clarification**, **4/4 answer-required external facts**, all readable and evidence-bound.
  **32 answers, 15 honest inability responses, one clarification**. The synthetic empty-scope
  case passes on its own database; actual retained playoff coverage makes it inapplicable there.
  It is explicitly excluded, never counted as a retained success or relabelled to lower the gate.
- Repaired “Explain assists per game” knowledge retrieval by adding its missing keyword.
  The knowledge registry advances to v2 with its actual verification date. Added acceptance
  scoring that rejects URL-only/wrong-period support and readable inability
  for an answer-required fact. No router prompt, source parser, formula, schema, migration,
  dashboard control or analytical data changed.
- **333 backend checks pass**, zero failures/skips/warnings; **188 dashboard tests**,
  full Ruff/format/strict mypy, dashboard lint/types, generated-contract drift and diff checks pass.
  **3/3 new actual source reads and 13 Uvicorn/restart checks** pass. Maximum measured source
  latency **169.685ms**, HTTP latency **343.227ms**; narrow deterministic measurements only.
- **185 retained outcomes unchanged**, including the same **48 existing mismatches**;
  **33/33 saved v1 conversations reproduce**, and **316 artifact hashes remain unchanged**.
  All history mutations use disposable databases; retained inputs are read-only. No publication,
  warehouse admission/acquisition, training, Live demand, paid dependency, billing or hosting.
- Added a bounded opt-in real-model runner: dated free-project evidence and authorized call
  budget required, maximum 24 calls, unchanged configured model, per-call version/input/usage/
  latency/failure records, stop on provider failure with no retries, and no evidence overwrite.
  **Zero actual inference calls; language accuracy remains unmeasured.** Configured credentials,
  prior v1 acceptance and owner-declared tier alone do not establish this v2 gate.

Full measurements, commands, initial failure classifications and limits:
[PF07d evidence](evidence/pf07d-evaluation/README.md). Next required work remains **PF07d
real-model language evaluation**, subject to verified free-project eligibility and an explicit
budget. PF08 owns rendered threaded UI; it is not accepted by this backend evidence. Preserve
current roster/injury/dated-position/official-leader gaps and original replica gates.

## PF08a — opt-in threaded UI prototype verified, 2026-10-06

Owner requested the next block after PF07d deterministic integration. **PF08a's bounded
prototype is verified; PF08 acceptance remains pending on PF07d's real-model gate.** The
handoff explicitly permits prototyping against frozen v2 fixtures. Free-project eligibility
and an authorized inference budget remain unestablished; the owner's request to explain
“inference budget” did not authorize calls. **Zero inference calls.** Codex substituted for
unavailable Flash presentation ownership, sequentially without delegation, preserving dirty work.

- Added `/research/ask?experience=threads`, linked from existing Ask, and the shared opt-in
  drawer. Default v1/manual Ask and retained Research saving remain available.
- Durable history/New chat/delete/Clear history, reload/reopen, editable next-question scope,
  concise typed answers, judgment/external distinctions, dated source support, supporting
  results, equivalent actions, escaped content and secondary evidence details.
- Server-owned follow-ups and immutable old scope; bounded paginated history. Accepted-turn
  polling, durable Stop with late-work fencing, exact-ID transport replay and linked intentional
  retry. Fixed asynchronous draft loss; next-question drafts survive answer completion.
- **26 production browser fixture checks pass** (13 threaded, 13 retained v1), **188 dashboard
  tests** and **333 backend/PostgreSQL checks** pass, zero failures/skips/warnings. Dashboard
  lint/types, production build, Ruff/format/strict mypy and generated-contract drift pass.
- Actual production UI with a fresh disposable PostgreSQL database verifies a no-provider
  knowledge answer, reload, source disclosure, shared drawer/focus return and exact envelope
  restoration after backend restart. Screenshots at 2560×1440, 1440×900, 375×812 and actual
  200% Chromium zoom are inspected; no page errors or horizontal document overflow.
- **185 retained outcomes unchanged** (same 48 prior mismatches), **33/33 saved v1 conversations
  reproduce**, **316 artifact hashes unchanged**. No retained personal history mutations,
  analytical/schema/provider changes, publication, inference, paid dependency or hosting.

Measured records, failure classifications, ownership, commands, screenshots and limits:
[PF08a evidence](evidence/pf08a-ui/README.md). This is an opt-in prototype, not a default UI
cutover or completed PF08. Finish PF07d eligibility/budget/real-model evaluation before claiming
PF08 acceptance; later PF08 work still needs production analytical/save workflows, scope chips
and navigation/cross-surface synchronization, broad failures and complete accessibility/resource
measurements. Preserve original replica gates and PF09.

## PF07d — quota policy clarified; first real-model run, 2026-10-06

The owner clarified that the installation must remain free using an eligible Gemini key
and the provider's established quotas, without an additional CourtLoad inference allowance
or repeated evaluation call-count approval. Other users may explicitly use their own paid
accounts. Paid Gemini keys already use the current adapter; arbitrary vendor keys require
additional adapters, which remain separate work. Core/manual operation has no paid dependency
and the owner receives no billing activation, paid grounding or automatic paid fallback.

- Revised the active assistant/freeze contracts, README and environment example. The evaluator
  no longer requires `authorized_calls` or a mandatory 24-call cap. It runs the finite corpus
  until completion or the first provider failure. Optional `--max-calls` is a smoke-test stop;
  per-turn correctness/payload/concurrency/deadline bounds remain.
- Owner screenshot and explicit confirmation establish the configured NBA-Analytics project's
  Free tier; the displayed key suffix matches configuration. Evidence stores a screenshot digest
  and boolean match, no key or full screenshot/account listing. **Eligibility and authorization
  prerequisites are resolved.** Model remains `gemini-3.5-flash-lite`.
- First real-provider evaluation: **10 actual model calls**, **48 applicable cases completed**,
  **45 canonically correct**, **48 readable/evidence-safe**, **16/16 critical cases correct**,
  **4/4 required external facts correct**, **10/11 applicable original held-out cases correct**.
  **7/10 actually model-evaluated cases correct (70%)**, so the 90% language gate is **unmet**.
  The overall 45/48 rate is not language accuracy. No provider failures, retries or paid fallback.
- All three mismatches are an unrequested minutes selector on scoring-table requests, including
  one originally held-out case. Preserve the first run unchanged; these cases become observed
  regressions for later repairs, not fresh independent holdout evidence. No prompt, corpus,
  schema, analytical formulas or dashboard controls changed in this block.
- **341 backend/PostgreSQL checks** pass (333 retained checks + 8 quota-policy checks), zero
  failures/skips/warnings; **188 dashboard tests**, Ruff/format/strict mypy and generated-contract
  drift checks pass. **185 retained outcomes unchanged** (same 48 existing mismatches),
  **33/33 saved v1 conversations reproduce**, **316 retained artifact hashes unchanged**. All runtime analytical input
  reads use read-only transactions; retained transcript/data publication is unchanged.

[Policy, eligibility, raw evaluation and verification](evidence/pf07d-quota-policy/README.md).
**PF07d remains partial on measured planning accuracy, not eligibility or budget approval.**
Next bounded backend work: repair scoring-only query planning and verify it under preserved
regression/holdout evidence rules. PF08 remains an opt-in prototype; PF09 and original replica
source/model/finance/Live gates remain pending.

## PF07d — scoring-only repair and bounded language gate accepted, 2026-10-06

Owner requested the next block after the quota-policy run. **PF07d meets its bounded backend
integration/language criterion.** Codex implemented sequentially without delegation; dirty work
and earlier evidence retained. PF08 full UI acceptance and PF09 remain pending.

- Captured-plan replay reproduces all three scoring-table mismatches. The provider plans already
  contained minutes: canonicalization did not insert it. Extend named-metric prompt guidance to
  tables/lists/mixed analytical clauses, and make generic query defaults conditional on no named
  metric. PPG-only scoring selects PPG alone; explicit totals, dual metrics and sample filters
  retain their meaning. No scorer/formula/canonicalization/schema/corpus expectation change.
- Freeze **12 fresh supported analytical cases before prompt tuning**. Retain their original
  timestamp/checksum. The first candidate fixes the three tables but adds minutes to one
  scoring-only distribution, scoring **9/10** real-planned cases. Preserve that run and clarify
  single-metric distribution selection before touching the fresh model holdout.
- Final original-corpus regression: **48/48 applicable cases correct**, **10/10 actually
  model-planned correct**, **48/48 readable/evidence-safe**, **16/16 critical cases**, **4/4
  required external facts**. Original held-out flags remain historical; this is regression
  evidence. Synthetic empty scope still passes its disposable fixture, excluded from retained
  inputs and never counted as a retained/model success.
- Fresh final-prompt model holdout: **12/12 correct**, readable and evidence-safe, each with one
  actual model call. Covers scoring paraphrases/counts, eligibility filters, dual metrics,
  totals/minutes rankings, variability, similarity and reversed comparison. No tuning after
  this run. These are now observed cases, not independent holdouts for future changes.
- **32 actual calls in this block**: ten initial-candidate, ten final regression, twelve fresh
  holdout. Configured/observed model unchanged at `gemini-3.5-flash-lite`. Zero provider errors,
  retries, model changes or paid fallback; confirmed Free-project quotas apply. Raw records
  retain actual input/prompt/corpus identities, versions, usage and latency. Maximum observed
  provider latency **3,527.857ms**; this is not PF09 service/resource acceptance.
- **356 backend/PostgreSQL checks pass**, zero failures/skips/warnings; **188 dashboard tests**,
  Ruff/format/strict mypy, generated-contract drift and diff checks pass. All **65 durable corpus
  checks** pass, including twelve fresh fixtures and three negative captured-plan regressions
  proving extra columns still fail. **95 planner/conversation checks** pass after final prompt edit.
- **185 retained outcomes unchanged**, same 48 pre-existing mismatches; **33/33 saved v1
  conversations reproduce**; **316 artifact hashes unchanged**. Read-only retained transactions
  and isolated disposable relational schemas only. No retained transcript mutation, migration,
  analytical acquisition/admission/publication, training, dashboard change, billing or hosting.

[Evidence, raw runs, holdout freeze, checks, preservation and limits](evidence/pf07d-scoring-repair/README.md).
Next dependency: **PF08 full threaded assistant UI acceptance**, using the existing opt-in PF08a
prototype and now-verified PF07b–d contracts. No broader arbitrary-question reliability, browser
acceptance or final freeze completion is established. Preserve original source/model/finance/Live
gates and current roster/injury/dated-position/official-leader gaps. Stop at this block boundary.

## PF08 — full threaded UI acceptance, 2026-10-06

Owner requested PF08 after PF07d's verified scoring repair. **PF08 accepted at its bounded UI
boundary.** Codex substituted for unavailable Flash sequentially without agents; existing dirty
work, shared controls and frozen v2/backend contracts were reused. The ui-ux-pro-max skill supplied
focused interaction/accessibility guidance.

- Default Ask page/header drawer now share durable threads; manual research remains explicit at
  `?experience=manual`. Server resolves standalone defaults. URL/Back/Forward selections update
  only the next question; existing scope edits/follow-ups preserve earlier immutable answers.
- Same-page/tab history notifications reread authoritative server records and preserve drafts.
  Retry, stop, pagination, history/deletion, sources/clarification/discussion and safe links retain
  their frozen semantics. No transcript is copied into browser storage.
- Eligible local answers link to an exact pinned manual operation for explicit evidence saving.
  Repair premature temporary-turn clearing; retain it until client navigation or existing expiry.
  Actual V2/manual result hashes agree. Save/reopen/reproduce/export passes after UI Clear history.
- **56 production rendered browser cases**, **188 dashboard unit tests**, **357 focused backend/
  real-PostgreSQL checks** pass, zero failures/skips/warnings. Lint/types/build, Ruff/format/strict
  mypy, generated-contract drift and diff checks pass. This is not the full PF09 repository suite.
- Actual provider/backend/browser workflow answers scoring with PPG only and changes season within
  one thread. Point-guard/last-season resolves **2025–26** and gives the specific verified inability,
  retaining dated-position/whole-league leader gaps. Final workflow has two model-planned turns;
  **15 total actual inference requests** across preserved UI probes, all HTTP 200. Repeated UI
  regressions are not a new independent language holdout. Free-project/model/bounds unchanged.
- Actual backend restart preserves rendered history and exact original envelope. Real 200% Chromium
  zoom: DPR 1→2, **1279×676** CSS viewport, **1272** document width, zero page errors. Inspected
  2560×1440, 1440×900, 375×812 and drawer screenshots. Representative contrast **8.13–16.15:1**,
  visible 2px keyboard focus and 40px action heights pass.
- Real **105-turn** history loads as **100+5**, 236,294+12,111 bytes; browser retains all turns and
  expands thread list **20→27**. Cost samples are not operational ceilings. Fresh migrated copy
  uses disposable DB only; full fresh backup/restore remains PF09.
- **185 retained outcomes unchanged**, same 48 pre-existing mismatches; **33/33 saved v1
  conversations reproduce**; **316 artifact hashes unchanged**. No backend formula/schema/prompt,
  source registry, dependencies, publication/admission/training, retained personal state or hosting
  changes. Disposable services stopped after verification.

[Evidence, measured gates, screenshots, harness failures, reproduction and limits](evidence/pf08-threaded-acceptance/README.md).
Next independent block: **PF09 freeze acceptance**. Original replica source/model/finance/Live
and current roster/injury/dated-position/official-leader gates remain intact. Stop at this boundary.

## PF09 — freeze acceptance, 2026-10-06

Owner requested PF09 after PF08. **The bounded polish/freeze phase is accepted.** Codex
executed sequentially without delegation, preserving prior dirty work and source gates.
Used diagnosing-bugs for recovery/verification defects and ui-ux-pro-max for a bounded
legacy Planner repair; no analytical formula/schema, provider prompt/model, source registry
or migration changed.

- Docker recovery honors the selected connection/database and Compose location, with credentials
  outside command arguments. Four regression checks and a clone-only marker prove the fix.
  Actual fresh archive recovery preserves two threads/five turns, input bindings, 34/34 saved
  conversations and seven personal workspaces. Six non-default workspace hashes match; default
  was subsequently changed only by disposable table probes. Backup **111.77s**, restore **54.69s**,
  archive **518,738,898 bytes**. Empty DB migrates through head.
- Repaired Planner's missing summary/form/table spacing and 375px overflow; shared page gutters,
  readable labels and named keyboard-scrolling table. New rendered regression catches overflow,
  including the hidden native-validation input accidentally expanded by a broad style rule.
  Updated stale browser/lookup assertions and a security test that matched `999` in random UUIDs;
  deterministic UUID now proves only rendered blocks are checked for injected prose.
- **All 1,071 unique backend cases pass across complete-suite coverage and targeted repairs**,
  zero unresolved failures/warnings/critical DB skips. Last complete run: **1,069 passed, two
  verification failures** (tmpfs quota during restore; random-UUID assertion). Final **61-check**
  recovery/security rerun passes using dedicated disk scratch; raw failures retained. This is
  comprehensive verified coverage, not a single all-green full-suite claim.
- **188 dashboard unit tests**, **132 production fixture browser cases** plus **one separately
  executed real-workspace case** pass. The fixture-only workspace skip is explicitly reported.
  Ruff/format/strict mypy, dashboard lint/types, generated contracts, production build and Compose
  pass; **235 dbt checks/models**, zero warnings/errors/skips, **233.28s**.
- **52 production route resolutions**, zero page errors/desktop/mobile overflow; real values and
  percentiles reconcile across nine presets/three modes, full-dataset Favorites, paging/ranks,
  guides, context, keyboard/tray/detail focus and pinned scrolling. Entity/task and traded-player
  identity checks pass; actual screenshots at 2560×1440, 1440×900, 375×812. Eight routes pass actual
  **200% zoom**, DPR **1→2**, **1279×676 CSS**; viewport geometry is measured.
- Real provider scoring and season follow-up use **two actual model calls**, verified PPG-only
  evidence and unchanged earlier scope. Point-guard/last-season resolves **2025–26**, honestly
  reports dated-position/whole-cohort leader gaps. Backend restart, exact manual saving,
  Clear history versus saved findings/export and **105-turn 100+5 pagination** pass. These are
  UI regressions; sealed PF07d language/holdout evidence remains separate, not a new holdout.
- **240 warm HTTP requests**, all 200, at 1/2/4 clients. Lookup p95 **13.20/23.72/17.74ms** HTTP,
  cached service **0.02ms**, 20 rows/~17KiB; first fresh-process lookup **146.65ms HTTP/51.368ms
  service**, separately reported. Input-event render p95 **147.7ms** including debounce; query
  p95 **591.81/587.74/761.01ms**, bounded history headers **8.71/23.89/16.17ms**. Raw process HWM
  separates API **361,400KiB**, Next **274,152KiB**, test runner/recovery **8,600,904KiB**.
- **185 retained outcomes unchanged**, same **48 pre-existing mismatches**, **33/33 saved v1
  conversations reproduce**, **316 artifact hashes unchanged**. Mutations target disposable DBs;
  bespoke recovery restores to isolated roots. No acquisition/admission/publication/training,
  paid provider/grounding/fallback, billing, schedule or hosting changes. Test services stopped.

[Measured gates, raw failures/repairs, screenshots, recovery, resources and limits](evidence/pf09-freeze-acceptance/README.md).
**Stop at the freeze boundary.** Preserve original B00–B37 source/model/finance/Live and OS
installation gates; current roster/injury/dated-position/official-leader coverage is not invented.
Subsequent work belongs to those independent contracts, not an inferred PF10.

## PF05 / B07 follow-up — owner-confirmed Stats reference realignment, 2026-10-07

The owner explicitly confirmed all recommendations after the grilling interview: full Stats
surface fidelity to the supplied Databallr screenshots, persistent hover/focus rail with pinning,
existing verified metrics, 38–40px default rows, consolidated controls and responsive details.
This revises the Stats-only near-black/taller-row decisions in the
[UI contract](design/polish-ui-contract.md#owner-confirmed-stats-reference-revision--2026-10-07).
It does not reopen PF09 or certify other replica capabilities.

Codex implemented sequentially; grilling's read-only fact-finding agent established the actual
border/width/click-only modal causes. No Flash implementation agent was available. Owned seams:
StatsWorkspace, WorkbenchPlayerExplorer, new scoped stats-explorer.css and StatsPreviewRail,
shared column-value formatting, rendered Stats browser regressions and these evidence records.
Pre-existing dirty application/assistant work was retained; globals.css was not edited here.

Measured result: slate/amber segmented controls, restrained separators and shaded groups;
40px standard rows; combined scoped identity with 28px portraits/24px guides; stable pinned
geometry and 76–140px numeric-column bounds. Name search moves into identity header, secondary
filters collapse, footer contains counts/density/expansion/paging. The 250px rail previews loaded
row values without fetch/focus theft, retains the last preview, pins/unpins and collapses; narrow
screens retain explicit focus-contained details. All percentiles remain the actual eligible
cohort, and reference-only impact/position data is not invented.

- ESLint/types, **205 Vitest tests**, production build, Ruff/format/strict mypy pass.
- Full production fixture browser suite: **153 passed / 3 opt-in skipped**. Final bounded
  table/preview rerun after adding sparse-preset width limits: **10 passed**, zero skips/failures.
- Real FastAPI/PostgreSQL browser: **17 checks**, nine metric presets, counting modes, four guides,
  exact row/rail values and pin/mobile behavior; four viewports, zero page errors/body overflow.
  Independent API reconciliation: Luka Dončić **33.5 PPG / percentile 99**, **50 / 591 players**.
- Inspected production screenshots at **2048×1100**, **2560×1440**, **1440×900** and **375×812**.
  Actual Chromium **200% zoom**, DPR **1→2**, **1279×676 CSS / 1272 document width**; preview and
  internal keyboard scrolling work. Verification used isolated frontend builds and read-only
  real Stats queries; no primary services were replaced or personal state mutated.

[Evidence, production screenshots, raw checks, executable probes and limits](evidence/stats-reference-realignment/README.md).
Backend pytest/full release acceptance and the three opt-in browser cases were not repeated.
Earlier freeze acceptance and independent replica source/model/finance/Live gates remain intact.

## PF01/PF02/PF04/PF05 — owner-directed readability/search/branding follow-up, 2026-10-07

Completed the bounded second pass after the owner's first-pass review and later portrait/font
steering. Standard records are 52px with 14px metrics; centered metric cells and 40px guide
columns align repeated portraits. Primary portraits are 40px, guides 34px, preview 44px.
Availability sits beside Help; the shell mark is frameless and centered. Fontshare Tabular Bold
wordmark artwork is reused in shell, Stats, profile/showcase SVGs and PNG exports.

Table name lookup offers bounded player-only suggestions, filters in place, preserves scope,
and stays outside the clipped scroll region. Global captions omit verbose/duplicate alias and
availability prose; canonical/alias matching and historical team semantics remain. X inset is 4px.
A bounded official NBA cache upgrade retains existing images and adds 1040×760 source records:
591/591 selected-cohort portraits cached, zero acquisition failures. No analytical-source refresh,
publication, migration or model run.

Measured acceptance: 159 production fixture browser passes / 3 opt-in skips; 205 dashboard
unit passes; 967 Python unit passes / 2 existing PostgreSQL opt-in skips; zero-warning lint/types,
Ruff/format/strict mypy and both production builds pass. Eighteen real Stats checks across four
widths, four real search checks, actual 200% zoom and SVG/PNG export checks pass.
[Evidence, screenshots, acquisition jobs, harness limits and baseline](evidence/stats-readability-search/README.md).
This does not certify independent replica source/model gates or full database release acceptance.

## PF02 — owner-selected Alpino wordmark revision, 2026-10-07

Replaced the prior Tabular wordmark artwork with Fontshare Alpino Bold 1.0 across header,
Stats toolbar and profile/showcase SVG/PNG exports. Preserved amber color, rendered heights,
mark alignment and accessible name; retained native kerning and source/license provenance.
Five real-service browser checks pass across three widths and exports, zero page errors;
lint/types and isolated production build pass. [Evidence](evidence/alpino-wordmark/README.md).
This is a bounded wordmark revision, with no change to analytics, portraits or source gates.

## PF02 — owner-selected Sora wordmark revision, 2026-10-07

Replaced Alpino with Fontshare Sora Bold 2.0 in shared shell/table/card/export artwork.
Preserved yellow styling, height/alignment and accessible name; recorded original source hash,
SIL OFL license and native kerning. Five real browser checks pass across three widths and
SVG/PNG exports, zero page errors; lint/types/isolated production build pass.
[Evidence](evidence/sora-wordmark/README.md). Bounded artwork change; analytical gates retained.

## PF06 — seamless route transitions, 2026-10-07

Owner-requested follow-up: removed the route-keyed global `loading.tsx` screen and text
fallbacks from 15 route-level Suspense boundaries. A persistent, silent Suspense boundary
inside the main layout preserves prerendering support for search-parameter consumers while
keeping the current view visible during pending navigation.

Measured checks on the current working tree: zero-warning dashboard lint and TypeScript,
205 unit tests, isolated production webpack build, and 50 production fixture browser tests
across workbench, route polish, shooting, shared floor, finance, Live and advanced research
all pass. Additional Chromium checks at 1440px and 375px delayed the Stats route response
by 800ms: the prior Calculator view remained visible and a main-content mutation observer
recorded zero navigation loading-text flashes before Stats appeared. Production fixture
services ran on isolated ports; the existing local development session was preserved.

## PF02 — owner-selected Red Hat Display wordmark revision, 2026-10-07

Replaced Sora with Fontshare Red Hat Display Bold 1.021 across shared header, Stats,
profile/showcase and SVG/PNG share-card artwork. Retained yellow color, rendered height,
accessible name and centered mark alignment; recorded source/license hashes and native
kerning. Five real-service Chromium checks at three widths and exports pass with zero page
errors. Lint, TypeScript and isolated production webpack build pass.
[Evidence and inspected screenshots](evidence/red-hat-display-wordmark/README.md).
