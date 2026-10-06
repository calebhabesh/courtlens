# B32a actual changing-game acceptance — 2026-10-04

**Verified bounded slice; full B32 acceptance remains open.** Current Codex session,
no delegated agents or model overrides. Followed the replica/workbench handoffs and
Live contracts; preserved pre-existing work and retained analytical evidence.

Ordinary opt-in ESPN access observed two actual **2026–27 preseason** games on the
Eastern 2026-10-04 slate: Utah at Denver (`401914127`) and Golden State at LA Clippers
(`401918010`). Source summary season metadata reports year 2027/type 1; this is not
regular-season research coverage. Retained bytes, parser identities, acquisition times,
HTTP dates and source-labelled values establish the observations. Provider update times
remain unknown; acquisition/HTTP times do not establish a freshness SLA.

## Corrected active-box failure

Real active summaries initially failed with `box statistic columns mismatch`: ESPN
reports explicit `didNotPlay: true` rows with an empty statistics array. Two deterministic
regressions failed before the correction. Only explicit reported-nonappearance rows
with empty/omitted arrays now produce null values for the supplied columns. Partial
arrays and missing appearance evidence still fail; no absence or injury inference occurs.
Original source sections remain unchanged.

New acquisitions use `espn-live-v2` in both retained parser metadata and the content-hash
recipe. Existing v1 content/observations are retained unchanged. A separate regression
checks that identical source bytes under the new parser produce separate versioned
content while the v1 record survives. No migration or analytical membership changes.

## Actual source and browser evidence

[Accepted service record](b32-changing-verified/verification.json),
[source receipts](b32-changing-verified/poller.json),
[retained observation bindings](b32-changing-verified/observations.json), and
[browser acceptance](b32-changing-verified/browser/verification.json).

- Four visible Chromium 153 tabs: two select Utah–Denver, one selects Golden State–LA,
  and one opens the slate. **Four shared cycles, 12 upstream requests, 1,541,447 bytes**
  over **210.627 seconds**. Each cycle performs one scoreboard and two distinct boxes;
  duplicate game demand does not multiply upstream requests. Scoreboard starts are at
  least 60 seconds apart; transport is sequential. All owned leases released; idle
  acquisition is zero. No persistent worker or opt-in setting remains enabled.
- Browser-rendered Utah–Denver changes from Denver **26 → 28 → 29**, with second-quarter
  clocks **10:58 → 10:17 → 9:55**; Utah remains 36 over that displayed subset.
  LA changes **23 → 26**, with a first-quarter-end to second-quarter transition and
  clocks **11:54 → 10:55**; Golden State remains 24 over that subset. The later retained
  poll records Denver 32/Utah 39 and LA 26/Golden State 24, separately from the displayed
  browser observations. UI scores/clocks match their exact cache observations.
- Both populated summaries retain **41/42 player rows**, including explicit reported
  nonappearances with null statistics. Game IDs and most entity crosswalks remain
  explicitly unmapped. No names or team codes are used to invent NBA game mappings.
- **100 diagnostic cached proxy reads: p95 7.720 ms**, below the 100 ms budget.
  These benchmark reads are separate from the visible tabs' ordinary 60-second cadence
  and cause no extra provider requests. Zero page errors or failed Live responses.
  Desktop/375px screenshots have no body overflow; long boxes scroll within their regions.
- Polling/measurement harness process CPU is **0.3825 seconds**, **0.1816% of one core**
  over the window. Sampled incremental process RSS is **17,812 KiB**, below 128 MiB.
  RSS samples follow worker ticks; this is not a continuous transient-peak bound or
  whole-browser/API/PostgreSQL process accounting. Recorded host has 16 logical cores.
- Logical retained raw-plus-normalized payload grows **2,046,321 bytes**; physical
  `live_contents` including indexes/TOAST grows **475,136 bytes**. The other measured
  Live relations have no size increment in this accepted window. Physical allocation
  and compression differ from logical payload. This short two-box sample does not
  establish maximum three-box load, long-run growth or a retention policy.
- Publication pointers and finance-book identities are exactly unchanged. The 26
  historical artifact checksums pass; **33/33** retained conversations reproduce with
  zero provider calls. Existing Live content remains retained and new content hashes
  reconcile with the parser/raw/normalized recipe.

The first readiness probe omitted a required date and performed zero acquisitions.
The first active window retained changing clocks but unchanged scores across a quarter
break, and failed the unchanged score-change assertion. Its 12 acquisitions remain
retained; [failed-run status](b32-active-accepted/run-status.json) explicitly excludes
it from acceptance. The repeat passed the same score/clock requirements. There was no
weakened assertion or fabricated source transition. Four preliminary read-only source
requests inspected the scoreboard, two summaries and the rejecting source row form;
they are diagnostic checks, separate from shared-poller counts.

## Final-code verification and remaining gates

The Live notice now explains provisional scores and independent final admission without
the obsolete dated "changing freshness not observed" claim. The generic API capability
remains `not_yet_observed` for aggregate Live acceptance, since independent final and
correction gates are still open. No schema or polling cadence changes.

Fresh final-code Next.js 16.3.5 production packaging and retained-cache browser evidence
are recorded separately in [current build verification](b32-current-final/verification.json).
This short final-code check does not perform source polling; changing-source acceptance
above used the retained B36b production build whose numerical/lifecycle source is
unchanged by the notice correction. Isolated build attempts first rejected a dependency
symlink outside Turbopack's root, then failed cross-device hard-link copying; a full
independent dependency copy produced the accepted build. The owner's dev build is intact.
The initial cache-only browser probes started before FastAPI was ready and received
502 responses; a readiness check for both the direct API and proxy corrected the harness.
Those probes are retained separately. Navigation-cancelled speculative RSC requests
are excluded from genuine request failures; the accepted capture has zero page errors.

- Backend: **625 passed / 125 opt-in skips**, no reported warnings. Focused actual
  PostgreSQL Live/history checks: **41 passed / zero skips**, including 13 disposable-
  schema relational tests. Ruff check/format and strict mypy pass.
- Dashboard: **164 tests / 26 files**, strict TypeScript, zero-warning ESLint and fresh
  production build pass. Seven focused fixture browser checks cover the existing
  lifecycle/unknown/error/history behaviors, separately from actual-source acceptance.
- Harness syntax, owned diff whitespace, documentation links and all 38 status-table
  block identities verified. No new warehouse, full browser-suite or fresh-restore claim.

**Still open:** independent final-score admission and verified game/team crosswalks;
real final reconciliation and subsequent correction observations; player-stat final
admission; populated maximum three-box resource/storage acceptance and retention;
source rights/reliability and broader current/regular-season coverage. No full B32 or
full replica completion claim follows from this bounded preseason observation.

Reproduce the active observation only when changing games are available:

```bash
.venv/bin/python scripts/verify_b32_active.py NEW_EVIDENCE_DIRECTORY \
  --frontend-root PATH_TO_PACKAGED_STANDALONE \
  --games ESPN_GAME_ID ESPN_GAME_ID
```

The harness refuses existing output directories and existing demand, uses actual time
and the ordinary source/poller, retains acquisitions, and releases only owned leases.
