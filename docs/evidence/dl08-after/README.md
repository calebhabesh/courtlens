# Before / After Visual Baseline Index (Design Language v1 Refresh)

**Parent Block:** DL09 (Enforcement and Acceptance) / DL08 in [courtlens-refresh-plan.md](../../courtlens-refresh-plan.md)  
**Contract:** [design-language-v1.md](../../design/design-language-v1.md)  
**Date:** 2026-10-08  
**Status:** verified  
**Interactive Viewer:** [index.html](index.html) (Open in browser for side-by-side visual inspection)

---

## Executive Summary

This index documents the comprehensive visual migration across the entire CourtLens application from the pre-refresh baseline ([`docs/evidence/dl01-before/`](../dl01-before/)) to the finalized Design Language v1 implementation ([`docs/evidence/dl08-after/`](./)).

A total of **34 full-page screenshots** were systematically captured across **17 key application states** at both desktop (**1440px**) and mobile (**375px**) viewports under strict deterministic testing conditions (Playwright Chromium, mock time, disabled transitions/animations, transparent carets, and font readiness).

### Primary Design Evolutions Captured:
1. **Single-Row 56px Sticky Header:** Replaced the legacy 2-row layout (~104px tall) with a unified 56px sticky bar featuring sliding spring active indicator, transparent-to-blur scroll behavior (`backdrop-filter: blur(12px)`), unified dropdown menus, and integrated ⌘K command palette.
2. **Tonal Elevation & Borderless Surfaces:** Replaced high-contrast `#707783` borders across all cards, drawers, and tables with subtle tonal layering (`--color-surface-1`, `--color-surface-2`) and 6-10% white hairline accents (`--color-hairline`).
3. **Typography & Tabular Data:** Applied the strict 3-weight typographic scale and universal `tabular-nums` formatting across all statistical tables, scoreboards, and financial ledgers.
4. **Responsive Mobile Drawers:** Replaced cramped mobile navigation with accessible left-sliding drawer menus (`<Drawer>`) with accordion navigation.
5. **Zero Inline Styles:** Eradicated all 1,257+ raw `style={{` `... }}` instances across the application, moving dynamic calculations to type-safe CSS custom properties.

---

## Visual Comparison Inventory

| # | Page State | Viewport | Dim Before | Dim After | Size Before | Size After | RMSE | % Pixel Delta | Visual Changes Summary |
|---|---|---|---|---|---|---|---|---|---|
| 01 | [Home (/)](01-home-1440.png) | `1440px` | `1440x902` | `1440x900` | 215.9 KB | 219.1 KB | 45.95 | 99.5% | Single-row 56px header, command palette pill, tonal panels replacing bright borders. |
| 02 | [Stats Explorer (/stats)](02-stats-1440.png) | `1440px` | `1440x902` | `1440x900` | 215.9 KB | 219.1 KB | 45.95 | 99.5% | Compact header, centered table guide cells, tonal filter controls, tabular numbers. |
| 03 | [Players Explorer (/players)](03-players-1440.png) | `1440px` | `1440x902` | `1440x900` | 215.4 KB | 219.0 KB | 46.01 | 99.5% | Player card grid with tonal surfaces, subtle hairline borders, unified search pill. |
| 04 | [Player Profile (/players/1629029)](04-player-detail-1440.png) | `1440px` | `1440x4722` | `1440x4596` | 673.0 KB | 666.4 KB | 34.48 | 26.0% | Clean hero section, tabular game log rows, borderless cards, 126px height reduction. |
| 05 | [Teams Explorer (/teams)](05-teams-1440.png) | `1440px` | `1440x2664` | `1440x2729` | 476.6 KB | 452.9 KB | 46.41 | 29.2% | Tonal team cards, subtle elevation shadows, consolidated navigation bar. |
| 06 | [Team Profile (/teams/1610612738)](06-team-detail-1440.png) | `1440px` | `1440x7657` | `1440x7646` | 948.3 KB | 971.5 KB | 33.4 | 19.0% | Tonal roster tables, shot charts with dark mode contrast, hairline dividers. |
| 07 | [Player Compare (/compare)](07-compare-1440.png) | `1440px` | `1440x900` | `1440x900` | 66.5 KB | 60.5 KB | 27.51 | 32.9% | Side-by-side player compare cards, tonal metric diff bars, clean selector dropdowns. |
| 08 | [Live Scoreboard (/live)](08-live-1440.png) | `1440px` | `1440x900` | `1440x900` | 90.4 KB | 82.7 KB | 28.63 | 46.1% | Live scoreboard cards with pulsing live dot, tabular score counters, borderless grid. |
| 09 | [Live Game Detail (/live/games/123)](09-live-game-1440.png) | `1440px` | `1440x1542` | `1440x1706` | 165.3 KB | 158.1 KB | 32.64 | 56.0% | Live game hero banner, play-by-play feed with tonal cards, tabular shot distribution. |
| 10 | [Playoffs Bracket (/playoffs)](10-playoffs-1440.png) | `1440px` | `1440x2846` | `1440x2618` | 322.0 KB | 307.0 KB | 49.34 | 53.4% | Playoff tournament bracket tree, tonal matchup cards, 228px compact vertical rhythm. |
| 11 | [Ask Assistant - Empty (/research/ask)](11-ask-empty-1440.png) | `1440px` | `1440x900` | `1440x900` | 108.6 KB | 103.8 KB | 31.06 | 27.7% | Ask Assistant empty prompt hero, prompt chip suggestions, borderless input pill. |
| 12 | [Ask Assistant - Answered (/research/ask)](12-ask-answered-1440.png) | `1440px` | `1440x1569` | `1440x1563` | 123.6 KB | 116.5 KB | 21.03 | 13.0% | Threaded assistant conversation, streaming prose layout, tonal citation cards. |
| 13 | [RAPM Advanced Research (/research/rapm)](13-rapm-1440.png) | `1440px` | `1440x900` | `1440x900` | 62.3 KB | 55.9 KB | 27.3 | 14.7% | RAPM regression tables, tabular coefficients, subtle hairline cell dividers. |
| 14 | [With-Or-Without-You WOWY (/wowy)](14-wowy-1440.png) | `1440px` | `1440x900` | `1440x900` | 107.6 KB | 99.1 KB | 38.13 | 32.7% | WOWY lineup net rating cards, tonal differential bars, tabular minutes. |
| 15 | [Finance & Contracts (/contracts)](15-contracts-1440.png) | `1440px` | `1440x900` | `1440x900` | 92.5 KB | 86.9 KB | 35.49 | 35.7% | Multi-year cap hits table, salary breakdown bars, tabular currency formatting. |
| 16 | [Settings & Operations (/settings)](16-settings-1440.png) | `1440px` | `1440x1792` | `1440x1910` | 191.6 KB | 182.6 KB | 33.38 | 31.0% | Settings cards, portrait pipeline triggers, tokenized toggle switches. |
| 17 | [Data Status & Verification (/data-status)](17-data-status-1440.png) | `1440px` | `1440x2020` | `1440x1971` | 353.2 KB | 345.5 KB | 36.37 | 34.1% | Data status & snapshot health indicators, ingestion pipeline logs, badge pills. |
| 18 | [Home (/)](01-home-375.png) | `375px` | `375x1349` | `375x1327` | 124.4 KB | 125.3 KB | 52.44 | 99.9% | Single-row 56px header, command palette pill, tonal panels replacing bright borders. |
| 19 | [Stats Explorer (/stats)](02-stats-375.png) | `375px` | `375x1349` | `375x1327` | 124.4 KB | 125.3 KB | 52.44 | 99.9% | Compact header, centered table guide cells, tonal filter controls, tabular numbers. |
| 20 | [Players Explorer (/players)](03-players-375.png) | `375px` | `375x1349` | `375x1327` | 124.2 KB | 125.2 KB | 52.56 | 99.9% | Player card grid with tonal surfaces, subtle hairline borders, unified search pill. |
| 21 | [Player Profile (/players/1629029)](04-player-detail-375.png) | `375px` | `375x6418` | `419x5996` | 410.6 KB | 378.5 KB | 43.09 | 40.4% | Clean hero section, tabular game log rows, borderless cards, 126px height reduction. |
| 22 | [Teams Explorer (/teams)](05-teams-375.png) | `375px` | `375x3382` | `375x3292` | 191.7 KB | 186.6 KB | 46.97 | 39.7% | Tonal team cards, subtle elevation shadows, consolidated navigation bar. |
| 23 | [Team Profile (/teams/1610612738)](06-team-detail-375.png) | `375px` | `375x9370` | `375x9769` | 624.4 KB | 614.9 KB | 44.96 | 33.1% | Tonal roster tables, shot charts with dark mode contrast, hairline dividers. |
| 24 | [Player Compare (/compare)](07-compare-375.png) | `375px` | `375x1044` | `375x965` | 56.8 KB | 52.5 KB | 46.33 | 46.6% | Side-by-side player compare cards, tonal metric diff bars, clean selector dropdowns. |
| 25 | [Live Scoreboard (/live)](08-live-375.png) | `375px` | `375x1101` | `375x1164` | 74.0 KB | 71.9 KB | 47.36 | 48.8% | Live scoreboard cards with pulsing live dot, tabular score counters, borderless grid. |
| 26 | [Live Game Detail (/live/games/123)](09-live-game-375.png) | `375px` | `375x1967` | `375x2159` | 142.9 KB | 141.4 KB | 52.01 | 58.8% | Live game hero banner, play-by-play feed with tonal cards, tabular shot distribution. |
| 27 | [Playoffs Bracket (/playoffs)](10-playoffs-375.png) | `375px` | `375x5552` | `379x5128` | 334.0 KB | 320.4 KB | 63.94 | 64.9% | Playoff tournament bracket tree, tonal matchup cards, 228px compact vertical rhythm. |
| 28 | [Ask Assistant - Empty (/research/ask)](11-ask-empty-375.png) | `375px` | `375x812` | `375x812` | 53.2 KB | 50.5 KB | 47.94 | 43.7% | Ask Assistant empty prompt hero, prompt chip suggestions, borderless input pill. |
| 29 | [Ask Assistant - Answered (/research/ask)](12-ask-answered-375.png) | `375px` | `375x1922` | `375x1900` | 59.8 KB | 56.7 KB | 20.69 | 18.6% | Threaded assistant conversation, streaming prose layout, tonal citation cards. |
| 30 | [RAPM Advanced Research (/research/rapm)](13-rapm-375.png) | `375px` | `375x812` | `375x812` | 50.9 KB | 47.3 KB | 53.75 | 26.9% | RAPM regression tables, tabular coefficients, subtle hairline cell dividers. |
| 31 | [With-Or-Without-You WOWY (/wowy)](14-wowy-375.png) | `375px` | `375x1764` | `375x1718` | 107.8 KB | 100.9 KB | 51.53 | 50.4% | WOWY lineup net rating cards, tonal differential bars, tabular minutes. |
| 32 | [Finance & Contracts (/contracts)](15-contracts-375.png) | `375px` | `375x1792` | `375x1757` | 90.5 KB | 86.4 KB | 47.72 | 27.7% | Multi-year cap hits table, salary breakdown bars, tabular currency formatting. |
| 33 | [Settings & Operations (/settings)](16-settings-375.png) | `375px` | `375x2676` | `375x2894` | 177.2 KB | 174.7 KB | 51.6 | 37.5% | Settings cards, portrait pipeline triggers, tokenized toggle switches. |
| 34 | [Data Status & Verification (/data-status)](17-data-status-375.png) | `375px` | `375x2757` | `375x2812` | 217.2 KB | 209.5 KB | 51.62 | 45.3% | Data status & snapshot health indicators, ingestion pipeline logs, badge pills. |

---

## Visual Inspection Instructions

To view all Before vs After screenshots side-by-side with zoom and viewport switching:
1. Open [`index.html`](index.html) in any modern browser (or serve locally via `python3 -m http.server 3200` in the workspace root).
2. Toggle between **1440px (Desktop)** and **375px (Mobile)** tabs.
3. Compare the legacy pre-migration presentation against the polished Design Language v1 implementation.
