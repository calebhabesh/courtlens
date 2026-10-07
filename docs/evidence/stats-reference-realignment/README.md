# Stats reference realignment — 2026-10-07

Owner confirmed the full Stats layout, hover/pin rail, existing verified metrics, compact
rows, consolidated controls, and responsive detail behavior after the grilling interview.
This bounded B07/PF05 follow-up revises Stats presentation only. Earlier freeze acceptance
is retained; this record does not certify outstanding replica source/model gates.

Implemented by the current Codex agent sequentially. The grilling skill's fact-finding
sub-agent inspected code read-only; presentation work was not delegated to an unavailable
Flash implementation agent. Pre-existing work is recorded in [baseline](baseline.json)
and preserved, including the dirty Ask CSS. Stats styles are isolated in a new scoped file.

## Observed result

- Slate surfaces, amber segmented selections, horizontal separators, shaded metric groups;
  outlined tabs, pills, identity dividers and wrapper frames removed from Stats.
- Stable 28px selection / 26px rank / 248px combined identity columns (220px narrow),
  34px recurring guide gutters, evenly sized numeric columns capped around 140px, internal horizontal scrolling.
  Measured identity rounding is 0.03125px; no sticky offset drift. Primary portraits are
  28px, recurring portraits 24px. Default rows are **40px**, compact rows target 34px.
- Name search in identity header; secondary team/sample/sort/page-size filters collapse.
  Counting/view/actions sit above the table; records, density, expansion and paging in footer.
- **250px persistent rail** on wide desktops; empty guidance before preview. Row hover/focus
  reuses loaded values and preserves keyboard focus, last preview remains on pointer leave,
  pin/unpin holds/resumes previews, and collapse returns width to the table. Expanded height
  retains the rail. Explicit focus-contained details remain available on desktop and touch.
- Every rail metric uses the same formatter and normalization as its row. Nulls stay unknown;
  percentiles remain the server-owned eligible cohort. No position or DPM fields invented.

## Verification

| Check | Measured result |
| --- | --- |
| ESLint / TypeScript | Pass, zero warnings/errors: [lint](lint.log), [types](typecheck.log) |
| Dashboard Vitest | **205 tests / 31 files pass**: [unit](unit.log) |
| Full production fixture browser suite | **153 pass / 3 opt-in skips**, zero failures: [browser](browser.log). Skips are two real assistant-panel cases and real personal workspace persistence, not Stats preview tests. |
| New rendered browser regressions | Four passing cases cover hover/focus/no-fetch/exact row values and null percentiles; pin/collapse/expand; pinned geometry/header alignment across desktop widths and bounded sparse-preset widths; mobile detail focus/search/filter access. |
| Final table/preview rerun after sparse-preset width cap | **10 pass**, zero skips/failures/warnings: [final browser](browser-final.log). Full-suite result above precedes this bounded correction. |
| Production build | Pass, zero build warnings: [build](build.log). Uses the installed Next.js 16.3.5. |
| Ruff / format / strict mypy | Pass: [Ruff](ruff.log), [format](ruff-format.log) (469 files), [mypy](mypy.log) (164 sources). No backend implementation changed. |
| Real FastAPI/PostgreSQL browser | **17 checks / four CSS viewports**, zero page errors: [record](real-browser.json), [log](real-browser.log). Includes nine supported metric presets, other counting modes, all four guides, row/rail equivalence, pinning and mobile details. |
| Independent displayed-value check | Real first player, PPG and percentile reconcile with a separate POST /api/workbench/query using the same analytical scope and explicit presentation contract. **50 displayed / 591 eligible**, Luka Dončić PPG **33.5**, percentile **99**. |
| Actual Chromium 200% zoom | DPR **1 → 2**, CSS viewport **1279×676**, document width **1272**, row-focus preview and internal keyboard scrolling work; zero page errors: [zoom](zoom.json). Private Xvfb display avoids changing the user's desktop. |

Initial, hover and pinned production views were inspected at **2048×1100**:
[initial](reference-initial.png), [hover](reference-hover.png), [pinned](reference-pinned.png).
Additional production captures: [2560×1440](wide-initial.png), [1440×900](desktop-initial.png),
[375×812](mobile-initial.png), [mobile details](mobile-detail.png), [200% zoom](zoom-200.png).
Desktop table fills its allocated width; at 1440 it scrolls a 1452px table inside a 1157px
region. At 375 it scrolls a 1424px table inside a 355px region. Zero document horizontal
overflow at all four measured widths. Footer fits wide/1440 desktop; smaller heights may
require ordinary vertical page scrolling. Mobile always uses normal vertical scrolling.

## Harness and limits

Dashboard was copied to an isolated /tmp checkout with existing dependencies to preserve the
owner's running frontend/build. Fixture API port 4111, fixture production frontend port 3212.
Final real build uses API port 8000 and `PORT=3213 HOSTNAME=127.0.0.1 node
.next/standalone/server.js` after copying public and static assets. Real probes are read-only;
personal-workspace mutations are blocked in their browser. No downloads, provider calls,
publication, training, migrations or retained evidence mutations were performed.

[Real probe](real-probe.cjs) and [zoom probe](zoom-probe.cjs) reproduce measurements with those
ports available. The initial targeted browser run had two harness assertion failures: null
percentiles omitted from the expected list, and an exact-width assertion rejecting 0.03125px
rounding. Final regressions explicitly cover unknown percentiles and tolerate subpixel width
rounding. An early direct API probe omitted the explicit presentation contract; it was corrected
before the recorded real-data reconciliation. An initial next-start harness emitted the existing
standalone-output warning; final real production uses the proper standalone entry and emits none.

Backend pytest/database release acceptance was not repeated for this presentation-only block.
The three opt-in browser skips remain distinct from measured real Stats verification. Full
reference metric parity and position-relative percentiles retain their independent source gates.
Temporary verification servers were stopped after acceptance. The owner's existing running frontend was not replaced or restarted by this verification.
