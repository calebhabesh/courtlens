# FO11 evidence: Compare

Captured on 2026-10-09 (America/Toronto) from an isolated production dashboard and the retained
local API at `localhost:8001`. Parent: [frontend overhaul handoff](../../frontend-overhaul-plan.md#fo11-compare-d21).
The four routes use the shared Compare template. Analytical formulas, source acquisition,
publication, calibrated intervals and frozen evidence identifiers remain unchanged.

## Starting state

FO10 is commit `b74b988`; the separate Stats repair remains `9abb1c7`. At the start of this block,
`scripts/test_python.py` contained an unrelated Docker cleanup change. The owner explicitly
authorized proceeding while preserving it. It is excluded from FO11. The two pre-FO10 stashes
were neither applied nor removed.

The handoff specifies Opus 5.5, which is unavailable in this session. Implementation and
verification used the active Codex runtime without delegated agents. Owner visual acceptance
remains unclaimed; the progress state records implementation and measured verification only.

## Changes and preserved behavior

- **Player Comparison** (`/compare`): shared header, context/filter bar, immediate valid entity
  changes and swap, headshot/team-color entity headers, and URL-persisted presets and
  Table / Visual Bars / Trend Lines modes. The default is Visual Bars. Each descriptive row
  has two magnitude bars, signed values, sample support and the larger known number in bold.
  Swapping or replacing the primary pair preserves additional players in the comparison URL.
  Player percentiles come from a Stats query against the full resolved cohort, filtered to the
  selected players only for presentation; catalog direction orients that API's value-based
  percentiles. Missing percentiles stay absent. Table, trend lines, saved custom views,
  investigation saving, assistant selection and context-stamped PNG/SVG exports remain
  available. The SVG export preview is a disclosure. Additional tray selections use the shared
  headshot/name chip. The legacy replay fallback retains independent target dates, rest,
  estimates and calibrated intervals, with formatted dates and unknown samples preserved.
- **Team Comparison** (`/team-compare`): shared basketball bar, always-reachable team pickers,
  swap and logo heroes. Overview / Four Factors / 3P Variation / Participation Cohorts /
  Similar Peers tabs persist in the URL. The descriptive rows preserve unknown versus zero;
  a missing margin input keeps the margin unknown. Head-to-head unknown outcomes are labeled
  Unknown, and average margin uses the number of scored games. Four Factors use the API's
  already direction-aware team percentiles directly. Formulas, ranks, weights and source
  warnings are in Data details. Fixed-attempt-volume scenario arithmetic and its caveats
  remain; missing pace keeps the rating impact unknown. Participation and peer tables remain.
- **WOWY** (`/wowy`, including the Stats On/off preset): shared scope bar, styled From date,
  gates and always-visible Operation/View choices on phones. Team, Together, Apart and
  exact-unit selectors stay outside the phone sheet. Valid changes query automatically after
  a short debounce; cancelled or superseded responses cannot overwrite a newer context.
  Initially default queries retain their resolved release and cutoff on subsequent changes.
  Entity headers lead selected-condition versus logical-complement bars. Raw rates, eligible
  differences, denominators, event totals, disjoint partitions, independent-game uncertainty,
  sequential release-pinned selected-player leaders, pinned comparisons and reopenable queries
  remain available. CSV stays a title action; hashes, resolved context, exclusions and the
  `courtload-shared-floor-evidence-v1` JSON export are in Data details. Required scope, sample,
  uncertainty and source-blocked wording remains behind Why?. No percentile is fabricated.
- **Player Matchups** (`/matchups`): a dedicated Compare view with the shared header/bar,
  styled dates, automatic valid queries, cancellation, resolved scope retention, offensive
  player and optional defender headshots, and a keyboard-focusable scrolling assignment
  matrix. Fractional possessions, zero attempts and unknown pooled rates remain intact.
  CSV/JSON exports preserve `courtload-shooting-evidence-v1`. The API supplies directional
  pair exposure rather than two independent player stat sets, so the matrix remains the
  result; reverse comparisons and percentiles are not invented. Assignment, video, input-bound
  and source-coverage limitations remain behind Why?. Other Shooting views remain for FO12.
- **States and ratchets:** shared Compare skeletons on all four routes; one-line empty/error
  states with choose/clear/retry controls. Native-date exceptions **6 → 5**, raw-title exceptions
  **21 → 18**. Comparison geometry uses typed CSS custom properties, shared spacing/type tokens
  and reduced-motion-compatible controls. Long phone identity names wrap inside their cards.

## Verification

| Check | Result |
| --- | --- |
| Dashboard ESLint and Stylelint | 0 errors, 0 warnings |
| Dashboard TypeScript | pass |
| Vitest | **51 files / 346 tests pass** |
| Production webpack build | pass |
| Full Playwright suite | **302 passed / 15 skipped / 0 failed**, all 317 cases in the final serial production run ([log](verification/browser-final.log)) |
| Screenshot baselines | **42 total**, including 12 new desktop/phone views; all 42 match in the final full run; the 30 prior PNGs are byte-identical |

Six new browser cases cover comparison modes/reload/swap, zero versus unknown values and
outcomes, an already oriented low-is-better team percentile, cancellation of a held WOWY
response, fractional Matchups exposure, automatic gates and resolved default scope retention
for both analytical operations. Existing affected specs retain legacy replay/keyboard checks,
shared-floor contradictions, gates, partitions, pinned evidence, raw estimates and assignment
source restrictions. Two new unit cases distinguish unknown from zero and preserve negative
values without introducing a winner or verdict.

The [first completed affected run](verification/browser-targeted.log) had three failures:
obsolete submit/streaming expectations and real phone identity overflow. The expectations were
updated and the overflow corrected; [51 affected cases then passed](verification/browser-targeted-final.log).
Scope retention was checked separately; that run exposed a source-warning access on an older
mock response without a warnings array, now tolerated. Visual review subsequently caught an
incorrect second inversion of team percentiles. Team analytics already counts worse values
using each metric's direction ([implementation](../../../src/courtlens/domain/team_analytics.py));
the display now preserves those percentiles. An in-progress full run was stopped for that fix
([partial log](verification/browser-interrupted.log)). The combined baseline/regression run
generated all 12 baselines but one assertion encountered two identical fixture percentiles;
it now checks both cells. Partial, interrupted and failing logs are diagnostic evidence,
not completion evidence. Synthetic mock rows do not admit analytical data.

The [first completed full suite](verification/browser-initial.log) passed 301 cases, skipped 15
and failed one rapid exact-unit chip-replacement case. The helper checked the chip count during
a transient lookup-resolution state and left a selected player behind
([browser snapshot](verification/unit-picker-race.md)). It now waits for each remaining chip
count before continuing. The corrected case passes [8 / 8 repeats](verification/unit-picker-repeat.log).
A fresh full run validates that correction together with every other case.
Final code review also caught primary-player swaps dropping additional URL selections. The
selector now carries those players forward, and the swap case asserts the preserved list.
The intermediate run stopped for that correction is [retained separately](verification/browser-selector-interrupted.log).

Checks use the owned isolated copy `/home/ethioking/.cache/courtlens-fo11`, mock API `:4102`,
production dashboard `:3102`, one browser worker and disk-backed `TMPDIR`. Docs are copied
because existing browser specs write evidence. Real captures use production `:3103` with
server requests and browser analytical queries directed to the retained API `:8001`.
FO11 changes no Python file; the unrelated Python edit is outside this validation scope.
The owned test/capture servers and isolated copy were removed after validation. The owner's API
at `:8001` and dashboard at `:3100` remain running. Earlier `/tmp` folders and the two stashes
were left untouched.

## Real-data captures and measurements

[Capture script](../../../scripts/capture_fo11_evidence.cjs), [measurements.json](measurements.json)
and **39 PNGs** cover 13 states at 1440×900, 768×900 and 390×844. The basketball release is
`5bbb6035-6794-4bb0-b894-7208f52ef7ad`, regular season 2025-26 through Apr 12, 2026.

| State (PNG filename prefix) | Main result top: desktop / tablet / phone |
| --- | --- |
| Player bars / table (`players-bars`, `players-table`) | 396 / 525.5 / 681 px |
| Player selection guidance (`players-empty`) | 344 / 396 / 481 px |
| Five team tabs (`teams-overview`, `teams-factors`, `teams-three_point`, `teams-roster`, `teams-peers`) | 384 / 488 / 629 px |
| WOWY selected team sets (`wowy`) | 396 / 769 / 702 px |
| WOWY exact unit (`wowy-unit`) | 396 / 825 / 673 px |
| WOWY selection guidance (`wowy-empty`) | 396 / 684 / 646 px |
| Matchups (`matchups`) | 396 / 468 / 549 px |
| Matchups selection guidance (`matchups-empty`) | 340 / 412 / 401 px |

All 39 states fit the viewport without sideways page scroll, report no runtime page errors,
and have no visible UUID, hash, ISO date or cutoff rule, native date input or notice box.
Desktop first results satisfy the 400px gate. Tablet/phone stacking is measured separately.
The shared scope/date controls and entity-field frames are 40px. Combobox text inputs are 38px
inside their 40px field frames. Desktop segmented buttons are 36px inside the established 40px
group; phone segments and touch actions are at least 40px. Invisible 1px validity inputs are
excluded from control measurements. The filter bar collapses to the shared Filters sheet below
768px, keeping modes reachable outside the sheet.

Representative screenshots:
[player desktop](players-bars-1440.png), [player phone](players-bars-390.png),
[team factors desktop](teams-factors-1440.png), [team factors phone](teams-factors-390.png),
[WOWY desktop](wowy-1440.png), [WOWY phone](wowy-390.png),
[Matchups desktop](matchups-1440.png), [Matchups phone](matchups-390.png).

## Glance test

| Item | Result |
| --- | --- |
| 1 Header | pass: nav-matching titles, one context subtitle and aligned title actions |
| 2 Filters | pass: shared bar, immediate valid changes, shared 38–40px field geometry, visible selected states; no Load button |
| 3 First screen | pass: desktop entity/result/guidance begins at 340–396px; no long introductory paragraph or notice box |
| 4 Alignment | pass: shared gutters, 4px spacing tokens, aligned entity columns and right-aligned tabular values |
| 5 Identity | pass: primary player headshots and team logos; tray headshots/names; dense matrices and participation tables keep their compact rows |
| 6 Missing data | pass: unknown stays unknown, one-line guidance with Why?, technical identity/context/evidence in Data details |
| 7 Icons | pass: shared Lucide wrapper; no new glyph icons |
| 8 States | pass: shared skeletons, selection guidance, retries and retained source-blocked explanations |
| 9 Phone | pass: no page overflow at 390 or tablet 768; Filters sheet, scrollable tables, wrapping names and shared 40px field/action frames |
| 10 Dates | pass: shared display formatter/date picker; exact analytical cutoff remains in Data details and exports |

## Remaining gates and next block

The retained WOWY scope reports `source_blocked`, reconstructing **0 / 82** expected finalized
games. Matchups reports `source_blocked`, with **0 / 1,230** finalized league games across its
required sources. Their empty raw rates and assignment rows are preserved. FO11 neither acquires
data nor clears source gates, supplies videos, or creates league-percentile claims for these
operations. There is no winner, verdict or composite comparison score.

The FO13 Article-template choice and `/schedule`'s older 14-game fantasy data dependency remain
open. FO12 is next. Owner visual acceptance is unclaimed.
