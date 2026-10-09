# FO10 evidence: Teams and finance

Captured 2026-10-09 on `frontend-overhaul` from the local dashboard (`localhost:3100`) and API
(`localhost:8000`). Parent: [frontend overhaul handoff](../../frontend-overhaul-plan.md#fo10-teams).
The six route families use the shared Explorer, Profile and Compare templates. No analytical
formula, source acquisition, database publication or frozen hash identifier changed.

## Starting state

FO08 and FO09 remain commits `10b4683` and `70e71ff`. The other session's Stats divider/Manage Views
repair, refresh progress entry and two evidence folders were validated and committed separately
as `9abb1c7` before FO10 started. Unrelated development-port helpers, `.gitignore` and owner TODO
edits were preserved in `Pre-FO10 unrelated dev-port helpers and owner TODO edits`; the generated
`.courtlens-dev-ports` file was preserved in `Pre-FO10 generated dev-port discovery file`. FO10
started with a clean checkout. Neither stash was applied to this block.

The handoff specifies Opus 5.5. That model is not exposed in this session; implementation and
verification used the active Codex runtime, without delegated agents. Owner visual acceptance is
not claimed by the progress state.

## Changes

- **Team Stats & Cohorts** (`/teams`, Explorer): nav-matching header, shared context/filter bar,
  Table / Cards / Efficiency Plot modes, immediate search/group/metric changes and URL-persisted
  sort and display preferences. Profile and Compare links preserve the resolved basketball
  context. League averages and release evidence live in Data details; standings limitations are
  one line with Why?. Dense rows use 20px logos. Unknown ratings sort last in both directions;
  a missing input keeps net margin unknown. The plot respects search, offers keyboard-accessible
  points, labels missing pace explicitly and uses descriptive quadrant labels.
- **Team Profile** (`/teams/[id]`, Profile): logo and team-color hero with eight summary tiles;
  Overview / Four Factors / Schedule tabs retained in `?tab=`. Participation, factor ranks,
  hypothetical diagnostics, peers and the schedule still use their existing API results. Missing
  production, percentile and schedule outcomes remain unknown; a documented zero stays zero.
  The season participation/current-roster distinction and method wording remain behind Why?.
  All Teams and factor retry links preserve context. Phone tables scroll inside their wrappers;
  the primary team name wraps instead of being clipped.
- **Teammate Stat Shift** (`/stat-line-shift`, Compare): team grid, shared basketball filters,
  styled inclusive From date and three always-reachable entity pickers. Valid changes auto-query
  after a short debounce; cancelled responses cannot overwrite a new context. Primary subjects
  have a headshot and team logo. Production shifts, disjoint partitions, raw estimates,
  denominators, event totals, independent-game intervals, source coverage and pinned comparisons
  remain intact. CSV stays a title action; hashes, excluded stints, raw context and evidence JSON
  are in Data details. The `courtload-shared-floor-evidence-v1` identifier remains frozen.
- **Contracts & Payroll / Free Agency Tracker** (`/contracts`, `/contracts/[team]`, `/free-agency`):
  shared headers and a dedicated financial filter bar. Book, financial season, known-at UTC and
  inclusive effective date remain separate from basketball context. No newest book or financial
  date is chosen implicitly. A pinned complete URL queries automatically; later valid changes
  apply immediately, superseding the old submit-only interaction under FO10/D6. The original
  exact timestamp, including its offset, is preserved until edited. Reported amount coverage
  leads; contract/status rows, sources, unknown terms, AAV definition, allocation and timeline
  remain available. Scenario amounts stay separate from reported totals. UUIDs, hashes, explicit
  timestamp entry, threshold, scenario and import controls moved to Data details. Team-specific
  finance gets a logo hero; contract details get the player headshot and preserve native-dialog
  keyboard focus. Embedded Player Stats auto-query their independent basketball context, show a
  skeleton while loading and offer retry on error.
- **Ratchets and states:** native-date exceptions 8 → 6; raw-title exceptions 24 → 21. All six
  route families have shared loading anatomy, including the team-contract route. One-line
  empty/error states retain disclosures and useful recovery controls.

## Verification

Captured logs retain the test output with normalized line endings and trailing whitespace.

| Check | Result |
| --- | --- |
| Dashboard ESLint and Stylelint | 0 errors, 0 warnings |
| Dashboard TypeScript | pass |
| Vitest | 50 files / 344 tests pass |
| Production webpack build | pass |
| Full Playwright suite | **284 passed / 15 skipped / 0 failed**, all 299 cases, serial isolated production run ([log](verification/browser-final.log)) |
| Screenshot baselines | 30 total, including 12 new FO10 desktop/phone views; all 30 match in both completed full runs; the 18 earlier baselines are byte-identical |

The retained finance tests exercise independent clocks, unknown money, derived AAV, option
scenario separation, explicit book selection, stale-response rejection, source links, dialog
focus restoration, import job failure and independent embedded Stats context. Shared-floor tests
still exercise request contradictions, gates, partitions, source coverage, reopenable evidence
and raw estimates. New Teams tests cover URL/reload preservation, keyboard tabs and plot points,
null sorting, zero versus unknown outcomes, scoped links and phone overflow. The bounded mock
factor/schedule/peer rows are synthetic test evidence, not analytical admission.

The [initial full browser run](verification/browser-initial.log) completed 282 passes, 15 skips
and two failures. The older Workbench case still expected the obsolete Team Explorer title,
old title classes and inline standings notice; it now asserts the nav title, disclosure and
profile heading. The existing assistant initialization test's exact `/threads` glob missed
the actual `/threads?limit=20` request, so its disabled-composer assertion raced a fast response.
A request-count assertion first reproduced zero intercepted requests
([red evidence](verification/history-gate-red.log)); path matching now covers the query string
and requires a held request before asserting disabled state. Both corrected cases pass eight
repeats each ([16/16 evidence](verification/failure-repeat.log)). No assistant product behavior,
provider, corpus or sealed AR/AG evidence changed. A subsequent rerun was interrupted when its session processes stopped at case 220
([partial log](verification/browser-interrupted.log)); it is not completion evidence. A fresh
final full run completed **284 passes, 15 skips and zero failures**.

Browser checks used an isolated production copy under `/home/ethioking/.cache/courtlens-fo10`,
with mock API `:4102` and dashboard `:3102`, one browser worker and disk-backed `TMPDIR`. Docs were
copied rather than symlinked because existing browser specs write evidence. The owner's live
servers were left running. No earlier session's `/tmp/courtlens-*` or `/tmp/courtload-*` directory
was deleted. Python checks were not required: no Python file changed.

## Real-data measurements

`scripts/capture_fo10_evidence.cjs` captures nine states at 1440×900, 768×900 and 390×844. The
27 PNGs and [measurements.json](measurements.json) record visible text, control geometry, page
width, first result position and runtime errors. Screenshots use the published basketball release
`5bbb6035-6794-4bb0-b894-7208f52ef7ad`, regular season 2025-26 through Apr 12, 2026. Finance captures
explicitly pin retained correction book `256f66b1-129d-4904-be30-7b946f6e92fc`, its creation instant
as known-at and Feb 12, 2025 as effective date. Selecting that book is a capture choice, not a
product default.

| State | Main result top: desktop / tablet / phone |
| --- | --- |
| Team Stats table | 389 / 597 / 461 px |
| Team Overview, Four Factors, Schedule (hero) | 227 / 279 / 259 px |
| Teammate Stat Shift | 368 / 541.5 / 634 px |
| Contracts / Free Agency | 279 / 383 / 259 px |
| Team Contracts (numeric summary) | 281.5 / 383 / 363 px |
| Unpinned Contracts (selection guidance) | 279 / 383 / 259 px |

All 27 states have document width equal to viewport width, no runtime page error, no visible
UUID, hash, ISO date or cutoff rule, no Load button, no native date input and no notice box.
Scope controls and profile tabs measure 40px. Desktop segmented buttons are 36px inside the
approved 40px group; phone targets are 40px. Phone filter controls collapse into the shared
Filters sheet. Desktop first results meet the 400px gate; tablet/phone stacking is recorded
without extending that desktop-only gate.

## Glance test

| Item | Result |
| --- | --- |
| 1 Header | pass: nav titles; team identity as profile title; one context subtitle; aligned actions |
| 2 Filters | pass: shared bar, immediate valid changes, 40px controls, no Load button; financial context stays independent |
| 3 First screen | pass: actual desktop table/hero/summary/result begins at 227–389px |
| 4 Alignment | pass: shared gutters and 4px spacing tokens; numerical columns right-aligned with tabular digits |
| 5 Identity | pass: profile/team-finance logo heroes; shift and contract primary player headshots; dense tables use logos |
| 6 Missing data | pass: one-line guidance with Why?; unknown values preserved; technical evidence in Data details |
| 7 Icons | pass: shared wrapper Lucide only; no new decorative glyphs |
| 8 States | pass: skeletons; useful clear/retry/choose actions; retained source-blocked and incomplete-coverage wording |
| 9 Phone | pass: no page overflow at 390 or tablet 768; scrollable tables and Filters sheet; 40px targets |
| 10 Dates | pass: shared display formatter and date picker; exact analytical clocks retained in Data details |

## Remaining source and owner decisions

The current shared-floor query reconstructs 0 of 82 expected finalized games and reports
`source_blocked`; its rates remain missing. The current finance book is a bounded historical
Toronto extension announcement. Seasonal salary/cap amounts, complete roster coverage,
current free-agent status and modeled value/ROI remain unavailable. FO10 does not admit data
to clear these gates.

The FO13 Article-template owner decision and `/schedule`'s older 14-game fantasy data dependency
remain open. The two unrelated pre-FO10 stashes remain retained. Stop after FO10; FO11 is next.
