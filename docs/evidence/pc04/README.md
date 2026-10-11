# PC04 — Compare integration and first-load defaults

G2 review: [before/after artifact](http://localhost:3500/pc04/review.html),
[local real-data build](http://localhost:3400/compare), [extended glance judgments](glance.md).
State: **implemented_unverified — owner review pending, full-page glance issues retained**.
The handoff says “Stop for approval” at PC04; PC05 has not started.

Compare now opens on two silhouette slots and an observed “Top 2 by minutes” suggestion.
Selection, scope, presets, counting mode and bounded custom picks persist in the URL. Selected
players have team-tinted headshot cards and GP badges, a centered three-column table, catalog
directions for amber/blue difference chips, and SVG/PNG export from the current preview. Ties,
unknowns and metrics without a direction stay neutral; TOV/fouls say “fewer.” There is no overall
verdict. Position leaders is disabled until PC05; recently viewed requires two local selections.
Per 75/100 is disabled when the release lacks actual possession exposure. Totals/per-game values
come from server-owned keys, never a front-end estimate or rescaling of a different unit.

Seven subject-driven entries now resolve the published scope’s observed season minutes leader:
Matchups, WOWY, Teammate Stat Shift, Shot Profile, Shot Aftermath, Similar Players and Recent Games.
WOWY uses that player’s observed team’s top duo; Stat Shift uses the first as focal and the second
as a condition. The named Example card, source, per-player appearance sample and labeled points
bar precede the pickers. Defaults pin release/season/phase/exclusive cutoff into the URL. Explicit
subjects are retained. Clearing or starting a manual selection cancels defaulting; a delayed
lookup cannot override typing, a selected view or a new scope. The new card reserves its final
loading layout and provides a one-line default-lookup error with Retry and Why.

Research Operation without an operation opens eight links and issues no conversation request.
The parameter-free Live landing falls back from an empty/unavailable cache to the last admitted
final game day, observed top points scorers and the next retained schedule date. Explicit dates
and game links stay exact. The fallback uses at most 30 retained game-box reads, excludes
non-appearances and missing points, and switches to finalized research with no Live demand.

## Real-data evidence and limits

[Capture script](capture.mjs), [measurements](measurements.json), [screens](screens/).
The production build uses the owner’s published database through a separate API on 8100.
All 12 entries began **without parameters** at 1440×900 and 390×844. The only stub in this capture
is the read of personal workspace state, made empty to keep private selections out of evidence.
NBA observations and operation responses are real. Two extra Compare captures follow the
suggestion. Across all 26 captures: no page errors and no horizontal page overflow. All ten
non-finance headline/default cards start within 400px on desktop. The recorded result top for
PBP pages refers to the box-score context, **not** proof of a populated PBP operation.

At capture time the rule chooses Amen Thompson (2,953.2 minutes, 79 GP) and Kevin Durant
(2,839.8 minutes, 78 GP), Houston, in the retained 2025–26 regular season through Apr 12, 2026.
Live has no configured observations and resolves Jun 13, 2026 admitted finals: Knicks 94,
Spurs 90; observed points leaders Brunson 45, Harper 25, Wembanyama 19; next retained date Oct 12.
These are claims about the published release, not a check against today’s external NBA feed.

Finance still opens on book/date selection. PC04 explicitly defers those defaults until PC06’s
admitted finance releases. Missing PBP/assignment/shot results remain unknown and await PC07/PC11;
the real box-score context is explicitly separate. Existing coverage codes, repeated unavailable
sections, legacy touch targets, Similar Players red/green z-scores and some chart encodings still
prevent a full-page 14-item glance pass. [Glance scores](glance.json) count partial, failing and
unmeasured items honestly; PC04 is not marked verified. The four later owner decisions remain open.

`requestfailed` records retained in the measurements include canceled Next prefetches and a
canceled Live lease cleanup during the fallback. Zero failed network requests is **not** claimed.
No admitted data was ingested, deleted or republished; frozen identifiers and analytical formulas
are unchanged. UI fixtures appear only in browser tests/state probes, never as runtime fallback data.

## Verification

- Vitest: **410 passed**, including 11 new metric-unit/default-rule cases.
- Affected Playwright: **72 passed** (Compare, defaults, Live, shared-floor, shooting, player pages,
  saved operations and research); PNG signature and SVG content/token resolution checked.
- Full visual baseline file: **90 passed**, including 24 new parameter-free checks and two selected
  Compare checks. Compare and fixture Methodology baselines changed; the latter now uses the
  complete direction-bearing UI metric catalog rather than the previous empty fixture.
- Dashboard lint: **0 errors / 0 warnings**; typecheck and fixture/real production builds clean.
- [State/geometry probe](interaction-measurements.json): 0px WOWY loading/ready height change
  at both widths; 16px card padding/gap, 40px Change targets, A/B token fills, focus transfer,
  keyboard preset selection, 0px central-column error and right-aligned tabular values.
- Backend Python files are unchanged; pytest was not rerun. PC03’s prior 1,854-pass Python
  evidence remains sealed and is not reported as a PC04 run. Whole-repository Ruff/format and
  strict backend mypy pass; the new Python review builder is a documentation utility.

Logs are in [verification/](verification/). Reproduce against the fixture production server:

```sh
PLAYWRIGHT_EXTERNAL_SERVER=true PLAYWRIGHT_BASE_URL=http://localhost:3300 \
  npm --prefix dashboard run test:browser -- presentation-defaults.spec.ts compare-overhaul.spec.ts \
  live.spec.ts shared-floor.spec.ts shooting.spec.ts players-fo09.spec.ts \
  saved-operations.spec.ts research-fo12.spec.ts --workers=4
PLAYWRIGHT_EXTERNAL_SERVER=true PLAYWRIGHT_BASE_URL=http://localhost:3300 \
  npm --prefix dashboard run test:browser -- visual-baselines.spec.ts --workers=4
node docs/evidence/pc04/interactions.mjs
PC04_BASE_URL=http://localhost:3400 node docs/evidence/pc04/capture.mjs
python docs/evidence/pc04/build-review.py
```

The owner’s servers on 3000/3100 and the PC03 gallery on 3200 are retained. Implementation and
verification used an isolated worktree; nothing was pushed.
