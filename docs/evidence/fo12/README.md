# FO12 evidence: Research

Captured on 2026-10-09 (America/Toronto) from an isolated production dashboard and the retained
local API at `localhost:8001`. Parent: [frontend overhaul handoff](../../frontend-overhaul-plan.md#fo12-research).
Every Research route now uses the shared Research template: page header, the shared filter bar,
a key-findings row, then charts and tables. Analytical formulas, operations, sealed reports,
source acquisition and frozen evidence identifiers are unchanged. Sealed evidence documents
were not edited.

## Starting state

FO11 is commit `7708a7c`. The unrelated `scripts/test_python.py` Docker cleanup change and the
two pre-FO10 stashes were preserved, not included and not touched. During the block the `/tmp`
quota filled (`EDQUOT`); with the owner's approval, earlier Claude sessions' temp folders under
`/tmp/claude-1000` were deleted. Older `/tmp/courtload-*` and `/tmp/courtlens-*` copies were left.

Implemented with Opus 5.5, as the handoff specifies. Owner visual acceptance is not claimed.

## Changes and preserved behavior

- **RAPM Research** (`/research/rapm`, Six-Factor tab): the season/phase/before-date form and its
  "Apply scope" button are replaced by the shared bar (applies immediately, in the URL). Findings:
  top 1Y RAPM, rated players, admitted games, 1Y fit date. Served ratings table with
  right-aligned tabular numbers; the impact disclosure sits behind Why? (the same component
  FO09 uses); serving version, manifest and per-fit hashes and exclusive fit cutoffs are in Data
  details. The B26 registered experiment stays on the page, also when impact serving is down.
- **Sealed experiments** (Expected Shots, Adjusted Shooting, Six-Factor, B26): shared
  `ResearchResultsView`. Findings: status, selection gate, relative Brier improvement, report
  date. Protocol, run, manifest, binding and dataset hashes, horizons and resource accounting
  are in Data details. Run choices are named "Run n · status" instead of UUIDs. The duplicate
  link rows inside the tabs are removed (FO07 finding). Export stays in the result panel. Every
  sealed caveat (exposure, promotion, vendor/tracking identities) is behind Why?.
- **Shot Aftermath and the Shot Profile tab** (shared `ShootingView`): no form, release-ID input
  or "Run shooting analysis" button. Valid queries run automatically after a short debounce
  (the FO11 Matchups pattern); superseded responses are ignored; Cancel stays available while
  a query runs; an initially default query keeps its resolved release and cutoff when a filter
  changes. The player is one 40px lookup in the bar. Names replace canonical IDs in headings,
  peer links and zone tables. Release input, hashes, provenance and resolved context are in
  Data details. Evidence JSON/CSV and court SVG exports and the `courtload-shooting-evidence-v1`
  schema are unchanged.
- **Workload Trends**: shared bar with the player lookup, window controls (styled date pickers
  replace four native date inputs) and Player Periods / League Shifts modes, all in the URL.
  Findings show the four headline changes; the player's headshot and the two compared windows
  follow. **Bug fixed (pre-existing):** shooting percentages arrive as fractions and were shown as
  `0.5466%`; they now read `54.7%`, and their changes are in percentage points (`-1 pp`).
- **Distributions & Splits**: four modes (Distribution, Venue & Rest, Opponent Context,
  Dispersion Ranking) kept in `?tab=`; the rank tab's metric choice now reaches the URL too.
  Each view has its own findings. Unknown minutes stay em dashes; a documented zero stays zero.
  The sample gate is one line ("Fewer than 5 appearances") with the rule behind Why?.
- **Defensive Matchups, Spatial EPV**: titles match the nav labels; findings name the status
  and the missing source; one gated line with Why?; next-step links keep the scope; feature and
  block identifiers are in Data details.
- **Points Forecasts**: title "Points Forecasts". Findings: active policy, promotion decision,
  holdout MAE, prospective scored. Four gate panels become one gate table; the protocol box is
  behind Why?; run ID, policy ID, calibration identity, the reproduce commands and the
  `game_date < replay_date` rule are in Data details. A hard-coded "4.613 vs 4.633" sentence was
  removed (the gate table shows the measured values). "Baseline Winner" is now "Served
  baseline". Ledger dates are formatted and tricodes carry logos.
- **Evaluation Archive**: title "Evaluation Archive" in both states. The unavailable state is no
  longer an `h1` "Evaluation unavailable" but one gated line with Explore players. Run, report,
  snapshot and dataset identities move to Data details.
- **Case Studies**: the selected case is a mode in the URL (`?case=`); findings come from the
  case's observed rows; subjects get a headshot or logo. The guarantee that stated
  `game_date < replay_date` inline now says "strictly before the game date" and the rule is in
  Data details with the artifact hash.
- **Saved Investigations** and **saved investigation detail**: one library with findings (saved,
  legacy, last saved), compact tables with scope in words ("2024-25 · Regular season · Through
  Apr 14, 2025") and each record's release and hashes behind its own Details drawer. FO00 counted
  33 UUIDs on this page; now none are visible. The detail page keeps the exports, reproduction
  without AI, retained results and "The question was not retained." line; manifest JSON,
  fingerprint and reproduction hashes are in Data details.
- **Research Operation** (`/research/operation`): shared header, scope in words, findings
  (status, operations, provider calls); resolved context JSON is in Data details.
- **Hypothetical Calculator** and **Combine & Wingspan**: shared headers; calculator findings are
  ORTG, PPP, s and q, with the formula in Data details; wingspan filters, the search and the
  units choice are in the URL.
- **Shared primitives:** `FilterBar collapsible={false}` for a fixed scope (a sealed report,
  protocol or calculator): the scope label stays inline on phones instead of a "Filters" sheet
  with no control. Key findings pair up on phones. Both are recorded in Design Language v1.1
  (Anatomy), with the single-player lookup pattern.
- **Ratchets:** native-date exceptions **5 → 2**, raw-title exceptions **18 → 6** (FO12's 11
  files plus `capability-notice.tsx`, listed for FO14 but used only by FO12 pages). ESLint now
  drops an emptied ratchet group (an empty `files` list is a config error).
- **League ranks timeout:** `getRankOperation` used a 15s client timeout, but a full-season
  league rank takes about 14.4s on the retained API, so League Shifts and Dispersion Ranking
  timed out under load. It now uses the 50s timeout of the other analytical operations.

## Verification

| Check | Result |
| --- | --- |
| Dashboard ESLint and Stylelint | 0 errors, 0 warnings |
| Dashboard TypeScript | pass |
| Vitest | **52 files / 349 tests pass** (new: `research-investigation.test.ts`, 3 tests) |
| Production webpack build | pass |
| Full Playwright suite | **319 passed / 15 skipped / 0 failed**, all 334 cases, serial production run ([log](verification/browser-final.log)) |
| Screenshot baselines | **54 total**: 12 new FO12 views (Expected Shots, Forecasts, Evaluation, Case Studies, Calculator, Spatial EPV at 1440 and 390); the 42 prior PNGs are byte-identical (SHA-256 checked) |

New browser cases (`e2e/research-fo12.spec.ts`, 5): Trends URL state, pp formatting, unknown
deltas and the hash only in Data details; Distributions tab persistence across reload, zero
versus unknown and the one-line sample gate; the research-operation deep link; per-record
Details in Saved Investigations; gated pages at both widths. Updated specs: shooting (automatic
queries, lookup, names instead of IDs, peer links keep the resolved release), advanced research
(formatted dates, units toggle, streaming-safe locator), forecasts and evaluation titles.

The [first targeted run](verification/browser-targeted-initial.log) had 2 failures, both real:
the RAPM tab dropped the B26 experiment when impact serving was down, and a table wrapper label
duplicated "Measurement records". A later run exposed a crash when the registry omitted
`classification`; optional run fields are now tolerated. The [diagnostic full run](verification/browser-diagnostic.log)
had 15 failures: 12 were the new baselines being written (expected on first capture), one was a
hidden streamed copy matched by a strict locator, and two were Trends/Distributions using a
"Player" label where the shared entity-selection spec expects "Target player" (the Similar
Players label). All were fixed. An earlier full run was stopped by me before it finished
(not kept). The final run above was repeated after a last CSS fix (below) and passed again.

Checks used an owned isolated copy (`~/.cache/courtlens-fo12`), mock API `:4102`, production
dashboard `:3102`, one browser worker and a disk-backed `TMPDIR`; docs were copied without PNGs
because some specs write evidence. Real captures used production `:3103` with server requests
on the retained API `:8001` and browser reads relayed to it (reads only). The copy and its
servers were removed afterwards. The owner's API on `:8001` and dashboard on `:3100` were left
running.

## Real-data captures and measurements

[Capture script](../../../scripts/capture_fo12_evidence.cjs), [measurements.json](measurements.json)
and **66 PNGs**: 22 states at 1440×900, 768×900 and 390×844. Release
`5bbb6035-6794-4bb0-b894-7208f52ef7ad`, 2025-26 regular season through Apr 12, 2026.

| States (PNG prefix) | Main result top at 1440 |
| --- | --- |
| RAPM, Six-Factor, Expected Shots, Adjusted Shooting (`rapm`, `six-factor`, `expected-shots`, `adjusted-shooting`) | 284px |
| Shot Aftermath with and without a player (`aftermath`, `aftermath-empty`) | 304px |
| Trends, Distributions (player views) (`trends`, `distributions-distribution`, `-splits`) | 281px |
| League Shifts, Opponent Context, Dispersion Ranking (`trends-shifts`, `distributions-opponent`, `-rank`) | 227–279px |
| Defensive Matchups, Spatial EPV, Evaluation (`defensive-matchups`, `spatial-epv`, `evaluation`) | 154px |
| Forecasts, Case Studies ×2, Investigations, saved detail, Calculator (`forecasts`, `case-studies`, `case-studies-team`, `investigations`, `saved-investigation`, `calculator`) | 227px |
| Combine & Wingspan (`wingspan`) | 279px |

All 66 states: no sideways page scroll, no runtime page errors, no native date input, no notice
box, no Load/Run/Apply button, and no visible UUID, 64-character hash or `game_date <` rule. All
visible numeric cells are right-aligned with tabular digits. Filter-bar controls are 38–40px;
segmented items are 36px inside the 40px group (the FO11 measure). Collapsible bars show
"Filters" at 390px; fixed-scope bars keep their label inline by design.

**One exception:** the saved-investigation detail shows 5 ISO dates. They are retained result
cells rendered by `ConversationResult`, which `/research/ask` shares; D23 keeps Ask's rendering
out of scope, so FO12 left it unchanged (FO13/FO14 follow-up).

Representative screenshots: [RAPM](rapm-1440.png), [Trends](trends-1440.png),
[Trends phone](trends-390.png), [Distributions](distributions-distribution-1440.png),
[Forecasts](forecasts-1440.png), [Forecasts phone](forecasts-390.png),
[Investigations](investigations-1440.png), [Calculator phone](calculator-390.png).

## Glance test

| Item | Result |
| --- | --- |
| 1 Header | pass: titles match nav labels (saved detail uses the record title); one truncating subtitle; actions on the title row |
| 2 Filters | pass: one shared bar, immediate URL-synced changes, no Load button, 38–40px controls; fixed-scope pages show a scope label so Data details keeps its place |
| 3 First screen | pass: desktop results start at 154–304px; no paragraph or notice box before them |
| 4 Alignment | pass: shared gutters and 4px tokens, right-aligned tabular numbers, ≥16px after the bar hairline |
| 5 Identity | pass: headshots for the subject player (Trends, Distributions, Case Studies, Wingspan comparison); logos beside tricodes in dense tables; no headshots in dense tables |
| 6 Missing data | pass: one line plus Why?; unknown is an em dash; IDs, hashes, rules and resolved context in Data details |
| 7 Icons | pass: wrapper Lucide only; the court legend's ○/× marks keep their existing reasoned exception |
| 8 States | pass: Research skeletons (body-only inside tabbed pages), one-line errors with Retry, Cancel while a shooting query runs |
| 9 Phone | pass: no page overflow at 390 or 768; Filters sheet or inline fixed scope; modes stay visible; findings pair up |
| 10 Dates | pass except the saved-detail retained cells noted above |

## Findings for later blocks

- The measurements API returns duplicate rows (84 identical Pascal Siakam combine rows among the
  100 returned); the page now keys rows by position so React does not collide. Backend dedupe is
  outside FO blocks.
- Retained shooting and the published evaluation remain source-blocked or unavailable in real
  data (`source_blocked`, 0 / 1,230 games; no matching evaluation artifact). FO12 shows those
  states; it does not clear source gates.
- `ConversationResult` (shared with Ask) prints ISO dates and raw column keys.
- The FO13 Article-template decision and `/schedule`'s legacy data dependency remain open.
