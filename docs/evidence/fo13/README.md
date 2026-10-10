# FO13 evidence: Settings, help and remaining pages

Final captures on 2026-10-10 (America/Toronto) from an isolated production dashboard and the retained
local API at `localhost:8001`. Parent: [frontend overhaul handoff](../../frontend-overhaul-plan.md#fo13-settings-help-and-remaining-pages).
Analytical formulas, operations, source acquisition, publication and frozen evidence identifiers
are unchanged. FO13 changes no Python files.

## Starting state

FO12 is commit `1bd0b5a`. The unrelated `scripts/test_python.py` Docker cleanup change and the two
pre-FO10 stashes were preserved, not included and not touched. Implementation began with Opus 5.5;
the owner requested completion in the active Codex runtime on 2026-10-10. Owner visual acceptance
is not claimed; the status remains `implemented_unverified` pending the visual acceptance process.

## Owner decisions taken at the start of the block

Both open items were the owner's call and were asked before any code changed (recorded in the
[progress log](../../frontend-overhaul-progress.md#fo13-owner-decisions-2026-10-09)):

- **Article template: approved.** A sixth template for reading and configuration pages.
- **Schedule: hide for now.** `/schedule` read 14 legacy fixture games; it now redirects to Live.

## Changes and preserved behavior

- **Article template** (`components/ui/article-layout.tsx`, `foundation` layer): `ArticleLayout`
  puts a 200px "On this page" contents list (sticky under the header, the section being read
  marked `aria-current="location"`) beside one column of at most 720px; `ArticleSection` is an
  anchored `h2` region, optionally `wide` for a definitions table. Below 1024px the contents are
  one scrolling row of 40px pills, not tabs, because route tabs can sit directly above. Article
  pages have no filter bar (nothing on them is scoped by season, phase or date). Added to
  `PageShell`, `TemplateSkeleton`, `/design` and Design Language v1.1 (Templates).
- **Settings**: Article template, configuration first: Display (Advanced mode switch), Assistant,
  History and privacy, Player portraits (Acquire is the section action), Install, then read-only
  Background worker and Sources and terms. The link row, notice boxes and stat cards are gone;
  facts are label/value rows. The job toast no longer prints a job ID. Portrait "coverage" is no
  longer shown as a percentage: real data reports 1,475 cached portraits for 816 players in the
  dataset, so the old formula displayed 180.8%; the page now shows the two counts. All required
  wording is kept ("An idle job queue does not establish worker liveness.", "Configuration alone
  does not establish provider availability or answer accuracy", "Manual research needs no
  provider key", "History stays in this local installation", region names and buttons).
  Chat's "History and privacy settings" link now opens `/settings#history`.
- **Data Status** (`/data-status`, titled to match the renamed `⋯` label "Data Status"): Research
  template. Header actions Refresh workbench and a More jobs menu (Acquire portraits, Run
  bootstrap); a fixed-scope bar with the publication line, a seasons chip and Data details
  (snapshot, dataset, semantic signature, coverage, namespace, publication rule); findings
  Service, Admitted Seasons, Latest Final, Daily Refresh; a background jobs table with formatted
  UTC times, durations, status badges and each job's ID, owner, heartbeat, timings and outputs
  behind its own Details; source rules as a plain list. FO00 counted 24 UUIDs on this page; now
  none are visible. **Invented fallbacks removed:** when the API was down the page showed "public",
  "sportsdataverse", "4 Seasons", "2023-24 to 2026-27" and "09:00 UTC" as if measured; it now
  states the status is unavailable and every value is unknown.
- **Methodology** (Definitions and Learning tabs) and **What's New** (Patch Notes and Blog tabs):
  Article template inside the FO07 tabbed page. Definitions: Principles, Impact metrics (all
  paragraphs kept), the Canonical Metric Catalog as a wide table grouped by category (metric and
  key, unit, formula, validity and denominator, limitations; version and count kept per
  `saved-operations-ui-v1`), Historical and prospective, Related pages. The principle that showed
  the code rule `game_date < before_date` now says "strictly before the replay date". Learning:
  four sections; the workshop shows the scope in words instead of the release UUID, with
  a styled select. Original content is split into sections at its headings, with a contents
  list; ISO dates in the text are shown as "Oct 4, 2026" at render (source unchanged except one
  link that now points straight at `/methodology/learning`).
- **Planner** (`/planner`): Board template titled "Planner" (its `⋯` label). After sign-in the
  shared bar holds League and a styled Week picker; both apply immediately and live in the URL
  (`?league=`, `?week=`); the Recalculate button is gone. Findings tiles, the weekly plan as the
  main surface and the add/drop what-if in the rail (styled Effective date picker). Snapshot ID,
  roster and rules versions, time zone and the "scheduled never means available" meaning are in
  Data details. The unused `Metric` component was removed.
- **Stats** (`/stats`): the shared `PageHeader` replaces the hand-built header; the title is
  "Stats", the nav label (D7). The desktop gutter is 24px like the header and every other page
  (was 16px); the dense 8px phone gutter is kept. The load error is a one-line note with Retry.
  The table, presets, Manage Views and Group Guides are unchanged.
- **Schedule hidden**: removed from the `⋯` menu and the drawer, `/schedule` → `/live` (307,
  query kept) from `HIDDEN_REDIRECTS` in `lib/route-consolidation.ts`; the page,
  `schedule-grid`, `schedule-week-bar` and `getSchedule` were removed. A unit test checks the
  hidden page has no file, its destination exists and nav does not list it.
- **Ask pickup only (D23)**: the manual research page uses `PageHeader` (the threaded page keeps a
  visually hidden one), its Before date control is the styled `DatePicker`, and the shared
  result renderer (`ConversationResult`) shows ISO date cells and scope dates as "Apr 14, 2025"
  with the exact value kept in the cell title. That closes the FO12 exception on
  `/investigations/saved/[id]`. Ask's layout, panel, threads and streaming are untouched.
- **Ratchets:** native-date exceptions **2 → 0** (the list is empty); raw-title exceptions
  **6 → 1** (`app/not-found.tsx`, FO14).
- **Hydration bug found and fixed:** the first Data Status build passed a `Button` as the `Menu`
  trigger; `Menu` already renders a button, so the HTML nested two buttons and React reported
  error #418 on every load. The trigger is now button-styled content, as on Recent Games.
- **Planner bug found and fixed before commit:** sign-in depended on the URL, so in fixture mode
  every week change signed in again. The league is now read from the URL when the workspace
  loads; a browser test asserts one sign-in across a week change.

## Verification

| Check | Result |
| --- | --- |
| Dashboard ESLint and Stylelint | **0 errors, 0 warnings** ([log](verification/dashboard-lint.log)) |
| Dashboard TypeScript | pass ([log](verification/dashboard-typecheck.log)) |
| Vitest | **54 files / 357 tests pass** ([log](verification/dashboard-unit.log)); 8 new Article/date tests |
| Production webpack build | pass ([log](verification/build.log)) |
| Final full Playwright suite | **333 passed / 15 skipped / 0 failed**, all 348 cases, one worker, 5.4 minutes ([log](verification/browser-final-full.log)) |
| Targeted FO13 browser cases | **7 passed / 0 failed** ([log](verification/browser-targeted-final.log)); also included in the final full suite |
| Screenshot baselines | **62 total**: 8 new FO13 baselines (Settings, Data Status, Methodology, What's New × desktop/phone), matched in the final full run; all **54 prior PNGs byte-identical** ([SHA-256 comparison](verification/baseline-integrity.json)) |
| Real API captures | **33 states / 0 page errors / 0 image-wait errors** ([log](verification/captures-final.log)) |
| API-unavailable Data Status | four unknown values, one note with Retry/Why?, no invented season or refresh values, no page errors ([record](verification/data-status-api-unavailable.json)) |
| Strict mypy | pass, 208 source files ([log](verification/mypy.log)) |
| Ruff / format | pass, 653 files already formatted ([lint](verification/ruff.log), [format](verification/ruff-format.log)) |

The inherited first full run passed **330 / 15 skipped** ([log](verification/browser-first-full.log));
the inherited final build passed **331 / 15 skipped** ([log](verification/browser-inherited-final-full.log)).
Both completed before the owner requested continuation. The final run above includes the subsequent
Planner recovery/navigation fixes and phone target correction.

**Two further Planner regressions were reproduced and fixed during completion.** A successful token
request followed by a failed league request hid the sign-in error and removed its retry form. League
selection was read only at sign-in, so URL/back navigation left the previous league selected. Both
new browser cases fail against the inherited build ([before log](verification/planner-regression-before.log))
and pass after the fix: sign-in remains actionable until leagues load, league selection is derived
from the URL, plan/roster/watchlist requests settle together, obsolete responses are ignored, and
results from the previous league/week are hidden while the selected scope loads. The existing
single-sign-in week-change case still passes.

Phone controls in Article pages and Data Status were enlarged to a minimum 40px. Only the new
Settings/Data Status phone baselines needed regeneration after that correction ([update log](verification/baselines-update.log));
no prior baseline was changed. The capture waiter also incorrectly counted lazy logos clipped by
Stats' horizontal table region as visible. It now intersects the viewport and every clipping
ancestor, and measures the anchored catalog section rather than an offscreen article start.
The diagnostic [measurements](verification/measurements-before-clipping-fix.json) and
[log](verification/captures-before-clipping-fix.log) retain that capture-only failure.

Verification used the owned isolated copy `~/.cache/courtlens-fo13`, mock API `:4102`, production
fixture dashboard `:3102`, real-API dashboard `:3103`, and a temporary API-unavailable dashboard
`:3113`. The [tested-tree manifest](verification/tested-tree.json) compares all 509 dashboard files:
application and test content match the source tree. The only environment differences are the mock
API listen port (`4100` → `4102`) and generated Next type imports (`.next/dev/types` → `.next/types`).
The isolated copy shares installed dependencies; the default Turbopack build rejected that symlink
([diagnostic](verification/build-turbopack-symlink.log)), so verification used the same production
webpack path as FO10–FO12. No dependency or project build configuration changed for this workaround.
Python tests were not rerun for this frontend-only block; no backend completion claim is made.
Owned verification servers were stopped after the checks. The isolated copy is retained for replay;
the owner's API at `:8001` and development dashboard at `:3100` were left running.

## Real-data captures and measurements

[Capture script](../../../scripts/capture_fo13_evidence.cjs), [measurements.json](measurements.json)
and **33 PNGs**: 11 states at 1440×900, 768×900 and 390×844.

| State | Template | Main top at 1440 / 768 / 390 (px) |
| --- | --- | --- |
| Settings | Article | 154 / 210 / 206 |
| Data Status | Research | 227 / 227 / 259 |
| Methodology | Article | 211 / 267 / 263 |
| Methodology metric catalog (scrolled anchor) | Article, wide section | 208 / 208 / 208 |
| Methodology Learning | Article | 211 / 267 / 263 |
| What's New, Patch Notes | Article | 211 / 267 / 263 |
| What's New, Blog | Article | 211 / 267 / 263 |
| Planner | Board | 227 / 227 / 223 |
| Stats | Explorer workspace | 219 / 271 / 215 |
| Ask, manual experience (shared pickup only) | Preserved assistant form | 154 / 154 / 174 |
| Schedule redirect → Live | Preserved Live board | 374 / 374 / 400 |

`mainTop` measures the leading findings, article column, explorer workspace or assistant form;
it is not a claim that every table's first data row starts there. The catalog row is an intentional
scrolled capture. Reading sections measure **720px at desktop/tablet and 366px at phone**; the
catalog uses its wider table area. Every capture has one subtitle line, no sideways page overflow,
no native date input, no notice box, and **0 visible UUIDs, hashes, cutoff code rules or ISO dates**.
Every filter-bar control is **40px**, with **16px after the bar hairline**, including Stats.

Settings, Data Status, Methodology and original articles have no phone controls below 40px.
The retained Stats numeric cells are centered: the checker flags **120 sampled cells** (40 at each
width) against the right-alignment contract. Retained small phone controls and loading geometry
are itemized below; this evidence does not label them passing.

Planner captures use the retained API's **labelled fictional fixture league**, not an operational
NBA roster. No roster/scenario, job acquisition or publication action was triggered. Ask captures
exercise its manual interface without sending a provider question. No source or model gate is
cleared by these captures.

Representative screenshots: [Settings](settings-1440.png), [Settings phone](settings-390.png),
[Data Status](data-status-1440.png), [Data Status phone](data-status-390.png),
[Metric catalog](methodology-catalog-1440.png), [Learning](learning-1440.png),
[What's New phone](whats-new-390.png), [Planner](planner-1440.png),
[Stats](stats-1440.png), [Ask manual](ask-manual-1440.png).

## Glance test

| Item | Result |
| --- | --- |
| 1 Header | pass for the FO13 scope: shared titles match Settings / Data Status / Methodology / What's New / Planner / Stats; one subtitle line, actions on the desktop title row; Ask retains its D23 title/layout |
| 2 Filters | pass: one shared bar where scoped, immediate URL changes, 40px controls, no Recalculate/Load button; Article pages intentionally have no scope bar; Ask's existing form is outside D23 layout scope |
| 3 First screen | pass: leading desktop surfaces start at 154–374px, without a notice box or introductory paragraph before them; article prose is the content |
| 4 Alignment | **partial**: shared gutters, 4px spacing and 16px after the bar; Stats retains centered numeric cells, which fail the right-alignment criterion (FO14 follow-up) |
| 5 Identity | pass for preserved subjects: Learning and Stats retain portraits/logos; fictional Planner entities retain initials instead of guessed NBA identities |
| 6 Missing data | pass: operational identifiers in Data details, unknown values preserved; API-down Data Status measured separately with Retry/Why? |
| 7 Icons | pass: wrapper Lucide only; no new glyph icons; lint clean |
| 8 States | **partial**: Article/Research loading skeletons and one-line notes implemented; Article's phone TOC skeleton still stacks placeholder rows instead of matching the final pill strip, and remaining error-action/geometry checks belong to FO14 |
| 9 Phone | **partial**: no page overflow at 390 or 768; collapsible filter bars show Filters, fixed scope stays inline; new Article/Data Status controls meet 40px, but retained smaller controls remain below the target (FO14 follow-up) |
| 10 Dates | pass: no visible ISO dates in the 33 captures; Calendar dates use `formatDate`, operational timestamps include UTC; date cells retain exact values in their title |

These measured exceptions keep this block `implemented_unverified`; passing automated checks is
not owner visual acceptance.

## Findings for later blocks

- **FO14 right alignment:** Stats' `.stats-metric-cell` / second header tier still intentionally
  use `text-align: center` in the retained explorer. The capture flags 40 sampled cells at each
  width. This was not altered by FO13's header/gutter change.
- **FO14 phone targets:** retained Stats preset/guide/table controls include 28px targets;
  Planner's Compare scenario is 34px; Ask's Open assistant is 28px; redirected Live includes
  Pause updates at 34px and Why? at 28px. Settings and Data Status have no measured short targets
  after the correction. Audit the final layout and baselines when correcting these.
- **FO14 loading:** the new Article skeleton's contents placeholders need the same horizontal
  strip at the phone/tablet breakpoint as the final Article layout. Complete loading/error,
  keyboard, 200% zoom and contrast checks in the scheduled final sweep; this block did not run
  that route-wide acceptance pass.
- **FO14 lint:** the native-date exception list is empty; the only raw-title exception is
  `app/not-found.tsx`. Ask's legacy manual release form/copy and raw retained column keys remain
  outside D23's shared header/token/date pickup.
- **Schedule source gate remains:** hiding/redirecting `/schedule` does not repoint its legacy
  source to `workbench_schedules`; that remains a separate backend task.
- **Portrait counts are separate universes:** active cached portraits can exceed players in a
  particular published dataset; do not restore the old percentage without a release-bound
  coverage numerator. Read-only worker/configuration status still does not prove liveness or
  provider answer accuracy.
