# PC12 batch A: table presentation

Owner defaults: A → B → C → D; example boards; keep Player Directory; retain the 340 unused
measurement rows. This batch implements **A only**. Contract:
[table percentiles v1](../../design/table-percentiles-v1.md).

- Stats has five-band blue cells, numeric percentile labels, Small sample badges, a visible
  reference/source legend and matching preview percentiles. Its group headers and interactions stay.
- Players is a focused directory: name order, name/team filters in the shared filter bar, six
  participation/production/shooting columns, scoped profile links, sorting and paging. Saved Stats
  presets do not turn its first load into a different view.
- Teams has grouped headers and shaded values in all four metric presets, league ranks that
  survive search/grouping, and game counts beside each team. Missing values stay unknown.
- Saved Rankings adds GP/MPG/PPG league reference columns, separate from subjective personal order.
  Empty first load remains batch D; this batch does not create boards in the owner's workspace.

Server ranks use 500 season minutes through the exclusive cutoff. Recent-window values still use
season qualification. Display filters, paging, favorites, sample filters and team selection do not
reduce the league reference. Already-oriented ranks use catalog direction; ties use midrank, nulls
are excluded and a singleton reference has no rank. Retained PF01a percentiles and arithmetic stay.

## Production evidence and fresh glance test

[Measurements](measurements.json), [item-by-item judgments](glance.json), [capture](capture.mjs).
The production UI is an export of HEAD plus only this batch's changes: the owner's pending guide
centering and other edits are excluded. Server requests use the real local API on 8000. The
[local adapter](api-adapter.mjs) forwards real API responses for browser reads/query POSTs and adds
CORS for the isolated 3411 origin; the owner's 3000/3100 servers and API settings stay intact.

All routes enter with **no URL parameters**, at 1440×900 and 390×844. Eight captures: no page errors,
failed HTTP responses, sideways page overflow, visible ISO dates or hashes. Phone targets outside
tables meet 40px. Essential percentile text inherits the value color; the existing palette contrast
tests cover the blue bands. Exact values remain visible without relying on color.

- Stats: **10/14**, [desktop](screenshots/stats-desktop.png), [phone](screenshots/stats-phone.png).
  Desktop table begins at 391px; 50 rows, 636 shaded cells, one Small sample badge. Dense desktop
  controls and the phone's long toolbar remain limitations: its numeric cells begin below the fold.
- Player Directory: **12/14**, [desktop](screenshots/players-desktop.png),
  [phone](screenshots/players-phone.png). 50 rows, 186 shaded cells and 19 Small sample badges.
  Full-page 4px alignment and exhaustive real-service loading/error injection remain unmeasured.
- Teams: **11/14**, [desktop](screenshots/teams-desktop.png), [phone](screenshots/teams-phone.png).
  30 teams and 300 shaded cells. The table starts below 400px; the All Teams result panel begins
  within 400px. The headline visual is batch B.
- Rankings: **4/9 applicable**, [desktop](screenshots/rankings-desktop.png),
  [phone](screenshots/rankings-phone.png). Its fresh workspace is still empty. The saved-board
  browser test proves its statistical-reference columns and muted samples; it is not first-load
  completion evidence. Example boards are batch D.

Real reference: 378 qualified players in 2025-26 regular season. Luka Dončić's 33.5 PPG and
Gilgeous-Alexander's 31.1 PPG both evaluate to 99 in the clamped qualified reference. A two-row
real query took 0.593s on the local machine; the opt-in reference currently adds an uncached league
aggregation. No ingestion or model fit ran.

[Read-only check](read-only-check.json): 161 publication pointers with the PC11 digest unchanged;
1,031 identities; 205 feed datasets / 200,690 versions; **340 measurement rows retained**.

## Verification

- [Python](verification/python.log): 2,031 passed, one existing browser-prerequisite skip,
  19 published-data deselections and the existing Google GenAI/Python 3.14 deprecation warning.
  [Final focused run](verification/python-targeted.log): 30 passed, including the half-up rounding
  refinement, PostgreSQL qualification boundary, recent windows, future exclusion and invariance
  under search, team/sample filters and paging. The initial run hit `/tmp` quota and was interrupted;
  the successful run used temporary files on the main disk.
- [Ruff](verification/ruff.log), [format](verification/format.log) and [mypy](verification/mypy.log):
  clean. [Dashboard lint](verification/dashboard-lint.log) 0 errors / 0 warnings;
  [types](verification/dashboard-types.log) clean; [Vitest](verification/dashboard-unit.log) 431 passed.
- [Affected Playwright](verification/playwright-targeted.log): 35 passed, including directory phone
  filtering/sticky identity, all Team presets, Stats interactions/preview and saved Rankings.
  Geometry assertions retain the 52px rule with a 0.05px tolerance for DOMRect floating point.
- [Baseline check](verification/baseline-check.log): seven pass. Four Stats/Teams captures and one
  Stats window-picker capture are refreshed for the new cells/legend; two directory baselines added.
  The popup capture fixes document scroll while retaining the open native picker.
- [Broad browser run](verification/playwright-full.log): 405 passed, 15 prerequisite skips, eight
  failures before the final fixes. Seven were batch changes (five snapshots, directory workflow and
  preserved 14px Stats type), now covered by the passing runs above. The eighth is the existing
  `chart-kit.spec.ts:74` Compare export failure recorded at PC08–PC11. No full-suite green claim.
- Production builds: [fixture](verification/build.log), [real API](verification/build-real.log).
  Broad evidence-capture specs ran in the export, so they could not overwrite sealed repo evidence.

## Reproduction

```bash
TMPDIR=/path/on/main/disk .venv/bin/python scripts/test_python.py -q
npm --prefix dashboard run lint
npm --prefix dashboard run typecheck
npm --prefix dashboard test
# Build the isolated dashboard against the real API:
COURTLENS_API_INTERNAL_URL=http://localhost:8000 NEXT_PUBLIC_COURTLENS_API_URL=http://localhost:4180 npm run build -- --webpack
node docs/evidence/pc12-a/api-adapter.mjs
# From the isolated dashboard directory:
COURTLENS_API_INTERNAL_URL=http://localhost:8000 PORT=3411 HOSTNAME=127.0.0.1 node e2e/start-dashboard.mjs
BASE=http://localhost:3411 node docs/evidence/pc12-a/capture.mjs
```

Next: **B headline visuals**, including Contracts' deferred Others grouping; then C demo hygiene
and D personal-tool examples. The retained glance limitations are not marked verified.
