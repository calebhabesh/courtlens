# PC03 — Design Language v1.2 and chart kit

Verified 2026-10-11 in an isolated worktree on a production build, dashboard 3200 / deterministic
API fixture 4100. Owner dev servers 3000 and 3100 were not stopped or rebuilt. No analytical data,
publication pointers, formulas or frozen identifiers changed.

The owner cleared G1 with “Let's begin the next block.” PC02's unmeasured audit items and four
follow-up decisions remain open; this approval is recorded in the presentation progress log.

## Review

Open the internal `/design` route for all eight primitives, ready/loading/empty/error controls,
data changes and qualification toggling. Inputs are clearly labeled **illustrative geometry**;
these are component examples, not NBA results or estimates.

| View | Before PC03 | First load after PC03 | Full kit |
| --- | --- | --- | --- |
| Desktop, 1440×900 | [PC02](../pc02/screens/design__desktop.jpg) | [Screenshot](screens/first-load-1440.png) | [Kit](screens/kit-1440.png) |
| Phone, 390×844 | [PC02](../pc02/screens/design__phone.jpg) | [Screenshot](screens/first-load-390.png) | [Kit](screens/kit-390.png) |

Each component panel is also captured at both widths in `screens/component-{1..7}-{width}.png`.
Panel 2 contains ValueBar and PercentileCell. Loading, empty and error first screens are saved in
`screens/state-*.png`. Every component panel and state screenshot was reviewed by eye.

## Measured extended glance test

Scope: the new chart gallery on `/design`, with **no URL parameters**. This internal guide has no
season filter or analytical primary subject; those items are explicitly not applicable. This does
not claim that the 52 public routes pass the audit or that PC04 has shipped.

| # | Item | Desktop | Phone | Evidence |
| --- | --- | --- | --- | --- |
| 1 | Header | Pass | Pass | Title Case; short subtitle; actions on title row / wrapped beneath at phone width |
| 2 | Filter bar | N/A | N/A | Internal component guide; state controls are not analytical scope filters |
| 3 | First screen | Pass | Pass | First result y=380 at 1440×900, y=476 at 390×844; result visible on first screen |
| 4 | Alignment | Pass | Pass | Panel content x=40; 16px panel padding, 24px group gaps; numeric cells right-aligned with tabular digits; [measurements](measurements.json) |
| 5 | Subject identity | N/A | N/A | No NBA player/team subject in the new gallery; generic labels explicitly identify examples |
| 6 | Missing data | Pass | Pass | Em dash, Unknown / Small sample; hatch and muted rank; no IDs or hash fields in gallery |
| 7 | Icons | Pass | Pass | Gallery has no icon glyphs; shared page controls use the existing Lucide wrapper |
| 8 | States | Pass | Pass | Loading reserves the actual child layout (inert, hidden) under a skeleton; content height changes ≤1px in browser assertions; empty/error line and working recovery action |
| 9 | Responsive | Pass | Pass | No sideways page scroll at 1440, 390, 375 and 844 landscape; all new phone controls 40px; stage bars replace Sankey, names stay fixed while the timeline scrolls |
| 10 | Dates | Pass | Pass | Gallery uses season labels; no inconsistent display dates introduced |
| 11 | Parameter-free populated first load | Pass (guide) | Pass (guide) | All eight primitives display labeled examples immediately; no subject prompt or gate; actual analytical first-load defaults are PC04 |
| 12 | Labeled result visual | Pass | Pass | Difference chips, signed bar, rank cells, thresholds, known-share donut, flow, timeline, pack |
| 13 | Color meanings | Pass | Pass | Direct labels / legends; AA palette tests; composed chip, status and rank text minimum **4.630:1** |
| 14 | Source and sample | Pass | Pass | All eight frames retain both labels through every state; source explicitly says illustrative style-guide inputs |

CSS animation/transition durations are ≤1ms in reduced motion across all chart graphics, data
groups, difference chips and percentile cells. Values never count up or redraw from zero.

## Verification

- Dashboard lint: **0 errors / 0 warnings**. Typecheck clean. Production build passed.
- Vitest: **399 passed**, including **40 new tests** covering all eight primitives, missing/zero
  distinctions, signed geometry, lower-is-better behavior, graph validation, palette contrast and
  standalone export token resolution.
- Playwright: **14 passed**, including first loads at 1440, 390 and 375, reduced motion, matching
  loading geometry, phone stage bars/sticky names, prerendered SVG titles, SVG/PNG download and
  existing Compare regressions. Affected visual baselines: **8 passed**; the two `/design` images
  are refreshed because the v1.2 gallery now leads the page.
- Full Python suite, disposable PostgreSQL: **1,854 passed / 1 skipped / 19 deselected**. The skip
  requires an isolated Next browser server. One existing third-party `google.genai` Python 3.14
  deprecation warning was emitted. Ruff/format clean; strict mypy clean (209 source files).
- [Production measurements](measurements.json): HTTP 200, zero page errors, zero sideways overflow
  at every measured width. Capture script exits nonzero on failed contrast/layout/error checks.

Logs are in [verification](verification/). Production captures deliberately exercise a deterministic
fixture API; this UI-only block makes no new claim about database coverage.

## Regression fixed during verification

The production screenshot run caught hydration error #418. The regression test was added and run
red before the fix ([before](verification/hydration-before.log)); SVG titles used multiple JSX
children and were empty in prerendered HTML. Each title now receives one interpolated string,
consistent with [React's title contract](https://react.dev/reference/react-dom/components/title).
The test ran green ([after](verification/hydration-after.log)); the final browser suite also checks
error-free hydration and nonempty SVG titles with JavaScript disabled. No debug instrumentation
remains.

The token migration also requires a clone-time export step: `resolveSvgTokens` resolves SVG
presentation attributes before serializing, so SVG/PNG downloads retain their on-screen A/B colors.

## Boundaries

- The catalog already supplies `good_direction='low'` for turnovers and fouls and their per-game/
  per-36 variants. PC03 consumes that flag through `comparisonFlags`; it does not add redundant
  metadata or change the catalog version/formulas.
- D21 is revised in the handoff and design contract. The public Compare rebuild, placeholder slots,
  tabs, suggested matchups and per-metric chip integration are **PC04**.
- C10 cohort qualification is a caller-owned input to PercentileCell; the minutes-qualified tables
  remain **PC12**. ShapePack rejects negative sizes; PC10 must declare the impact-to-area transform
  and credit the Wyman presentation to @taylormetrics.
- No wingspan fixture rows were purged, no sources ingested and no routes removed in PC03.
