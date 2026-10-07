# CourtLens workbench interface contract

Status: prescribed next-release behavior, 2026-10-01. Parent: [implementation handoff](../workbench-implementation-plan.md). These are requirements, not screenshots of completed work.

## Application layout

Make the application itself the homepage. Use a persistent navigation rail, compact context bar and working content region. The main screen should show data and controls immediately. Each card must answer an analytical or operational question; statistics must come from the selected release.

Desktop starting dimensions: 208–224 px rail, 56 px top bar, 16–20 px page padding, 12–16 px grid gaps, 12–16 px panel padding. Use the viewport width instead of the old narrow centered marketing shell. A lineage/assistant drawer can occupy approximately 360 px on sufficiently wide screens and become an accessible overlay otherwise.

```text
┌──────────────┬──────────────────────────────────────────────────────────┐
│ CourtLens    │ Season · Phase · Before date · Window   Source / Refresh│
│              ├──────────────────────────────────────────────────────────┤
│ Research     │ Player / team search                Ask CourtLens      │
│ Players      │ Coverage · Finalized games · Data age · Model policy   │
│ Teams        ├─────────────────────────┬────────────────────────────────┤
│ Compare      │ Player trends           │ Team research                  │
│ Forecasts    │ Functional charts       │ Record / production / coverage│
│              ├─────────────────────────┴────────────────────────────────┤
│ Data & jobs  │ Filtered, sortable player table                         │
│ Saved        │ Photo · Player · Team scope · GP · MIN · PTS · ...     │
│ Definitions │ Compare / inspect / save / export actions               │
│ Settings     ├──────────────────────────────────────────────────────────┤
│              │ Selected release · Latest attempt · Evidence drawer    │
└──────────────┴──────────────────────────────────────────────────────────┘
```

This is a layout guide. Populate overview trends using a documented query or a user-selected investigation; an empty saved list gets a useful empty state. Avoid invented sample charts, arbitrary highlight selection and large headings displacing tables.

## Routes and tasks

| Route | Primary content and interaction |
| --- | --- |
| `/` | Research overview: shared context, search, compact coverage/health, actual research tables, saved or reproducible example investigations, model status. |
| `/players` | Browse/search table; season, phase, observed team, window, sample and minute filters; sort and pagination; compare/save actions. |
| `/players/[id]` | Identity/photo; observed team evidence; points/minutes/attempts/efficiency summaries; trend charts; game log; forecast availability; source drawer. |
| `/teams` | Team research table: final-game record, production/allowance and coverage; explicit ordering definition. |
| `/teams/[id]` | Team production/allowance trends, outcomes/schedule, season-participation player cohort and evidence. |
| `/compare` | Two players, one analytical context, aligned definitions/windows/samples; descriptive differences and eligible forecasts without a forced winner. |
| `/forecasts` | Points experiment/policy selector; metrics and slices; historical replay and actual issuance list kept distinguishable; forecast/outcome details. |
| `/evaluation` | Keep existing experiment links working; register and select old composite/new points evidence, with their different targets. |
| `/data-status` | Data & pipelines: admitted sources/phase capabilities, local and upstream freshness, jobs, quarantine, builds, release pointer and sizes. |
| `/investigations` | Saved questions/queries, input versions, results, reproduce/open/export actions. |
| `/settings` | Local worker schedule/status, key-configured indicator and setup instructions, portrait cache coverage and source settings. |
| `/methodology` | Versioned metric definitions, phase semantics, target/interval interpretation, historical versus prospective limits. |

Preserve existing schedule/planner routes as deferred functionality; primary navigation follows this table. Replace fantasy-first homepage, footer, page titles and metadata with implemented local research language. UI status should show active providers rather than hardcoded BALLDONTLIE copy.

## Analytical context and search

Propagate `releaseId`, `season`, `phase`, `beforeDate`, `window` and filters through URLs and saved manifests. Resolve omitted defaults once; return and display them. Search results, details, comparisons, AI evidence and exports must stay bound to their chosen release during a refresh. Offer New data available as an explicit context switch.

Before date means game dates strictly earlier than the displayed date in `America/New_York`. Show last included date and sample size. Avoid a generic As of label that hides whether the chosen day is included. Separate acquisition time from outcome coverage.

Support keyboard player-name search, full table browsing and explicit filter controls. Desktop row actions remain visible on focus as well as hover. The optional Ask CourtLens panel sits beside ordinary search and produces result cards, not a compulsory conversation funnel. The query/result card opens the equivalent explorer view.

At season rollover, show the upcoming season as a valid empty outcome dataset and an explicitly labeled Last completed season context action. Do not silently substitute last-season numbers under the current-season heading. Players can still be discovered through the identity dimension when current-season game rows are absent.

## Dark visual language

Use semantic CSS variables; a future light theme can replace their values without changing components. Only the dark theme ships now.

Set dark native-control color scheme at the root and render it consistently on the server to avoid a light flash. Scope old marketing/legacy route styles during the incremental refactor so existing planner functionality remains usable.

| Token | Initial value | Role |
| --- | --- | --- |
| `--bg` | `#0b0d10` | Page background |
| `--surface` | `#11151b` | Panels and table surface |
| `--surface-raised` | `#181e26` | Hover, selected controls, drawers |
| `--border` | `#2a3340` | Panel separation |
| `--text` | `#edf1f7` | Primary text |
| `--text-muted` | `#a3afbf` | Secondary text and labels |
| `--accent` | `#ff7a2f` | CourtLens mark, active controls and primary action |
| `--on-accent` | `#0b0d10` | Text on orange |
| `--positive` | `#60d394` | Success with text/icon |
| `--warning` | `#ffd166` | Partial/stale with text/icon |
| `--negative` | `#ff6b6b` | Failure with text/icon |
| `--series-secondary` | `#67aaf9` | Secondary plotted series |

Use orange sparingly to indicate identity and active interaction. Distinguish series with line styles and labels. Target 13–14 px table text, 14–16 px body text, 20–28 px page titles, tabular numeric figures, right-aligned quantities, and 36–40 px desktop rows. Dense display must still support readable labels and sufficiently large controls.

Retain the existing type direction if useful. Bundle appropriately licensed fonts locally with fallbacks, or use system fonts; local operation must not require a runtime font service. Preserve source/license notices for vendored fonts. Prefer existing SVG chart components for bounded series; add a chart dependency only for a concrete missing interaction.

## Tables and plots

Tables use proper headers, explicit units, `aria-sort`, stable keys, pagination and loading placeholders matching the final shape. Null values display an em dash or unavailable label with a reason, never zero. Show per-metric sample validity in details. Sample/minute filters must explain their denominator.

Use small multiples for minutes, attempts and points. Actual observations are solid; forecasts use a distinct marker/style. Calibrated ranges are labeled empirical prediction intervals with nominal level, observed coverage and calibration identity. Variation in a descriptive sample is not a forecast interval. Avoid smoothing that invents observations.

Every analytical chart has a visible or immediately accessible data table and a brief textual interpretation. Keyboard users can inspect values without hovering. Limit initial series/window sizes; aggregate or paginate before introducing heavier rendering.

## Portraits and favicon

Build one reusable `PlayerPortrait` component: approximately 28–32 px in search/table rows and 72–96 px in details. Specify width/height to avoid layout shift, crop consistently, lazy-load table images, and use a neutral basketball/silhouette or initials fallback. A portrait next to a player's text name can be decorative; standalone meaningful imagery needs alternative text.

PostgreSQL stores identity, source URL, acquired time, content hash, MIME/dimensions, rights/attribution and status. Image bytes live in ignored local cache storage and are served through an allowlisted content-hash route. Statistical snapshots do not depend on portrait downloads. Cache only verified image responses; apply time/size limits and validate MIME/file content. Never request arbitrary user-supplied URLs.

NBA-ID headshots are an optional source with unverified universal coverage. Support explicit source-provided images and individually licensed alternatives when appropriate. A latest portrait does not establish historical team membership. Record successful/failed/missing counts; a missing photo never removes a player from results.

The favicon is a small code-native vector: near-black square, orange basketball outline/seams, recognizable at 16 and 32 px. Use Next's file-based metadata conventions after reading the installed docs. Supply SVG plus browser-compatible raster/ICO sizes and an apple-touch asset if needed. Reuse the mark in the rail; no AI image-generation dependency is needed for this simple icon.

## Required states and accessibility

Provide explicit states for no bootstrap, no phase data yet, unsupported source capability, API unreachable, partial coverage, stale inputs, failed refresh with last good release, unknown team context, insufficient history, missing calibration, no promoted challenger, missing portrait and disabled/failed AI. Useful descriptive research remains visible when forecasting is unavailable.

On 1440–1536 px screens show the rail and dense grid. Around 1024 px reduce columns; on narrow screens collapse navigation, stack panels and keep the most useful table columns. Wide tables may scroll inside their own labeled region; the page itself must not overflow at 375 px. Avoid sticky bars covering focused controls. At 200% zoom the main path remains usable.

Measure text contrast at least 4.5:1 and interactive boundaries/focus indicators at least 3:1. Panel borders can be subtle, but control borders and selected states need their own sufficient contrast. Do not use color as the only status signal. Respect reduced motion and use visible focus, proper dialog focus management, labels, live status for completed queries and discoverable errors.

## Browser acceptance

Keep mock tests for deterministic edge states; add a real backend/database workflow for the flagship path. Verify browse/filter/sort, selected context propagation, a player with no target, comparison, saved export/reproduction, refresh failure retaining data, missing headshots, AI disabled and unsupported AI requests. Cover desktop and 375 px viewports with keyboard interaction and no body overflow.

Store screenshots and demo only after data/API reconciliation. Check favicon responses and layout manually or with a simple browser assertion; a dedicated low-value image test suite is unnecessary.
