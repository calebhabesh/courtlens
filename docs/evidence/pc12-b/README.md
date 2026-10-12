# PC12 batch B: headline visuals

Implements **B only**, after committed A (`3b0422e`). Owner order remains A → B → C → D;
there is no owner gate between these batches. [Contract](../../design/headline-visuals-v1.md).

- Teams keeps the table and adds five net-rating leaders, labeled game counts and league KPI tiles.
  Team profiles show same-scope team/league rating bars; full names wrap and opponent shooting
  reads the existing Four Factors response when omitted from the detail response.
- Team Compare shows paired scoring, allowance and signed margin before its selectors, using
  amber/blue identities throughout. No overall verdict or matchup probability.
- RAPM shows qualified 1Y leaders with portraits, support and model limitations. Forecasts shows
  measured core/early-season interval coverage against the nominal 80%, with counts and widths.
  Shooting shows measured selection reliability bins, separate from final-test performance.
- Workload Trends has paired period bars and signed league-shift bars. Parameter-free entry uses
  the existing season-minutes rule: Example, pinned subject/scope and a Change control that opens
  and focuses the phone lookup. Explicit subjects and calendar windows retain their meaning.
- Player profiles put all three game trajectories before the long tables on both widths. Missing
  observations now create gaps and stay out of averages; observed zeros remain zeros.
- Contracts puts its cap graphic before KPI tiles. The salary flow names five known roster earners
  and groups the rest as Others by position, retaining totals and the full roster. Unknown salaries
  and source-listed players on another index roster remain outside the flow.

## Real production first loads

[Measurements](measurements.json), [glance judgments](glance.json), [capture](capture.mjs).
The production build is committed HEAD plus batch B, excluding the owner's pending Stats edits.
It reads the real API at 8000 through a [read-only local adapter](api-adapter.mjs) at 4182; the UI
runs on 3412. Owner ports 3000/3100 and API settings stay intact. No acquisition or fit ran.

All nine routes enter **without URL parameters**, at 1440×900 and 390×844. The capture records
zero page/console errors, failed responses, sideways page overflow, visible ISO dates or hashes.
All sampled non-table phone controls are at least 40px. Full-page captures sit beside each viewport
capture with `-full` in the name; they include charts and retained detail below the fold.

- [Teams desktop](screenshots/teams-desktop.png), [phone](screenshots/teams-phone.png): 30 real
  teams; OKC +11.3, SAS +8.3, DET +7.8 net rating. Headline starts at 279/311px (desktop/phone).
- [Team profile desktop](screenshots/team-profile-desktop.png),
  [phone](screenshots/team-profile-phone.png): OKC 117.0 offense / 105.7 allowance versus 113.5
  league; opponent FG% 43.7%, matching the existing team summary. Headline starts at 247/275px.
- [Team Compare desktop](screenshots/team-compare-desktop.png),
  [phone](screenshots/team-compare-phone.png): Boston +7.7 scoring margin versus Dallas −5.5;
  both signed bars share a zero baseline. Headline starts at 231/279px.
- [RAPM desktop](screenshots/rapm-desktop.png), [phone](screenshots/rapm-phone.png): Kawhi Leonard
  +9.61 1Y RAPM, 65 games / 2,085 minutes. Model sample and unserved uncertainty are explicit.
  Headline starts at 284/280px; phone names stack above bars rather than truncate.
- [Forecasts desktop](screenshots/forecasts-desktop.png), [phone](screenshots/forecasts-phone.png):
  prior_blend core coverage 80.6%, early-season 79.7%; 41,806 and 7,064 forecasts, respectively.
  Coverage is not a promotion verdict. Headline starts at 227/259px.
- [Shooting desktop](screenshots/shooting-desktop.png), [phone](screenshots/shooting-phone.png):
  106,080 selection shots per model, measured nonempty bins, no connecting interpolation or
  invented intervals. The failed selection outcome remains. Headline starts at 284/280px.
- [Trends desktop](screenshots/trends-desktop.png), [phone](screenshots/trends-phone.png): the
  season-minutes rule selects Amen Thompson and pins his id and scope. Recent/prior samples are
  10/10 games; points 19.9/21.7. Headline starts at 279/311px; the Example row puts its first bar at
  447/615px. The chart remains above the fold, with the source and sample preceding it.
- [Player profile desktop](screenshots/player-profile-desktop.png),
  [phone](screenshots/player-profile-phone.png): Luka Dončić's three actual trajectories are
  visible in the DOM at both widths, before the detail tables. Headline starts at 227/259px.
- [Contracts desktop](screenshots/contracts-desktop.png), [phone](screenshots/contracts-phone.png):
  DEN known salary $221.1M; 14/21 roster salaries known. Cap graphic starts at 154/234px, its bar at
  252/396px. Flow uses five named earners plus Others (4 guards, 5 forwards).

Fresh glance scores are **12/14 per page**. Alignment and page-specific loading/error/empty
injection remain partial, so these pages are **implemented/tested**, not exhaustively verified.
The kit's loading/error/empty geometry and reduced-motion checks pass at desktop, 390 and 375px;
that is not substituted for every page's service states. Some legacy phone subtitles remain clipped;
full labels are in the content. Batch A's dense Stats controls/phone fold remain a recorded limit.

[Read-only before](read-only-before.json) and [after](read-only-after.json) match: 161 publication
pointers (same SHA-256), 1,031 identities, 205 feed datasets / 200,690 versions and members,
and all **340 legacy measurement rows retained**. No source or publication data was changed.

## Verification

- [Python](verification/python.log): 2,032 passed, one existing browser prerequisite skip,
  19 published-data deselections, existing third-party deprecation warning.
  [Ruff](verification/ruff.log), [format](verification/format.log), [mypy](verification/mypy.log): clean.
- [Dashboard lint](verification/dashboard-lint.log): 0 errors / 0 warnings;
  [types](verification/dashboard-types.log) clean; [Vitest](verification/dashboard-unit.log):
  436 passed. New cases cover signed/zero/unknown geometry, measured bins, payroll conservation
  and missing-observation trajectory gaps/means.
- [Affected browser run](verification/playwright-targeted.log): 40 pass / 1 existing failure:
  `chart-kit.spec.ts:74` cannot find the Compare Export button (same PC08–PC12 A failure).
  [Final affected checks](verification/playwright-final.log): 43 pass with that known test excluded,
  including new first-load checks, both phone/desktop Change focus and Team Compare interactions.
- [Existing baseline update](verification/baselines-update.log) and
  [baseline check](verification/baseline-check.log): 16 affected captures pass after refresh for
  headline placement, identity colors, trajectories and Contracts order. Eighteen new PC12 B
  first-load baselines also pass in the final affected checks. No full-browser-green claim.
- [Fixture production build](verification/build.log), [real API build](verification/build-real.log).
  Builds and browser evidence run in a disposable export, so sealed evidence is not overwritten.

## Reproduction

```bash
TMPDIR=/path/on/main/disk .venv/bin/python scripts/test_python.py -q
npm --prefix dashboard run lint
npm --prefix dashboard run typecheck
npm --prefix dashboard test
# In a separate dashboard export, with the fixture API on 4100 and UI on 3421:
PLAYWRIGHT_EXTERNAL_SERVER=true PLAYWRIGHT_BASE_URL=http://localhost:3421 npx playwright test e2e/pc12-headlines.spec.ts
# Build a separate dashboard against the real API:
COURTLENS_API_INTERNAL_URL=http://localhost:8000 NEXT_PUBLIC_COURTLENS_API_URL=http://localhost:4182 npm run build -- --webpack
node docs/evidence/pc12-b/api-adapter.mjs
# In that dashboard directory:
COURTLENS_API_INTERNAL_URL=http://localhost:8000 PORT=3412 HOSTNAME=127.0.0.1 node e2e/start-dashboard.mjs
BASE=http://localhost:3412 node docs/evidence/pc12-b/capture.mjs
```

Next: **C demo hygiene** (Evaluation availability, public investigations/saved-plot labels and
Playoffs title), then **D personal-tool example boards**. No owner data is deleted or edited.
