# RD17 Expected Shots and Adjusted Shooting: merge evidence

The owner's decision of 2026-11-10 ([research design catalog, RD17](../../../research-design-catalog.md)): Expected Shots folds into Shot Quality's Model tab as "An earlier attempt", Adjusted Shooting's defensive view becomes a Defense tab on zTS, its offensive view is dropped as a duplicate of zTS, and the Shooting page and menu entry go, leaving Shot Aftermath standalone.

## Reference

None. No Databallr page covers either view; each change borrows a named, approved CourtLens Research precedent. databallr.com and draftballr.com were not fetched.

## Before (:3100, read 2026-11-10)

[`before-check.mjs`](before-check.mjs), [`before-check.json`](before-check.json), [`before-tables.mjs`](before-tables.mjs), [`before-tables.txt`](before-tables.txt), screenshots `rd17-before-*`.

| View | Height 1440 / 390 | What it showed |
| --- | --- | --- |
| Expected Shots (`/research/shooting`) | 1,645 / 1,800 px | The old left-aligned Shooting header and tabs; a run select (two runs: the sealed result and an empty preflight failure), a reliability chart, four tiles, 2 old tables, the model card behind a disclosure |
| Adjusted, offence | 5,340 / 6,011 px | Four tiles, twelve ranked bars, a 439-option player dropdown, a play-type table and a percentile-shaded player table; no photos or logos in tables |
| Adjusted, defence | 5,168 / 5,909 px | The same for 433 defenders |
| Shot Quality, Model tab | 3,622 / 4,478 px | The project code `courtlens-expected-shot-v2` in the calibration chart's source line |
| zTS | 10,932 / 12,448 px | Unchanged reference |

All five: 0 console errors, 0 page overflow, 0 broken images, no hashes in visible text. Adjusted has 3 native selects (season, phase, a player dropdown) and its two tables scroll sideways on a phone (273 to 373 px).

## Content check (2026-11-10, read only)

- **Expected Shots** reads only the sealed `courtload-expected-shot-retrospective-v2` run `de8dbe44…` (`GET /api/workbench/research/experiments`, `/runs`, `/runs/{id}`): selection metrics, ten fixed reliability bins, dates, model card, identifiers. No interval is served. `courtload-expected-shot-v1` never ran (source-blocked), so the "v1 negative result" of the decision is this retrospective v2 run. A second registered run, `d1dbc7ee…`, is the empty launcher-preflight failure.
- **Adjusted** shows only the live play-type feed (`GET /api/workbench/play-types`). `courtload-adjusted-shooting-v1` is registered but source-blocked ("requires admitted playtypes and foul trips") and has never run, so no sealed result moves with the defensive view.
- **Defensive feed:** 2015-16 to 2025-26, regular season and playoffs, always the same 7 play types (2025-26 regular season: 433 defenders, 317 at 250+ play-type possessions; playoffs qualify at 40+). No interval is served, so nothing may be green or red. Traded players list their teams in team-id order, not by date.
- **References** to the two routes or the Shooting entry: the menu and `TAB_SHORTCUTS`, `TABBED_PAGES.shooting`, `OWN_HEADER_TABS`, two FO07 redirects and two old aliases (`/zts`, `/shotquality`), the availability gate, a Learning link, the backend search entry `page_shooting`, Shot Aftermath's tabs; four Vitest files; six specs; six baselines.

## Round 1 (owner, 2026-11-10)

"Go with your recommendations and suggestions for optimal construction and layout of this page. Then fully build it comprehensively." The proposal (changes 1–6, Q1–Q8) is recorded with the instruction in the catalog.

**Built**

| Page | Change | Borrowed from |
| --- | --- | --- |
| Shot Quality → Model | "An earlier attempt" after persistence: one line computed from the sealed run (a simpler location-and-type model beat a make rate by zone by 0.08% on Brier score against the 1% it needed, so it was never calibrated and never tested); a small "Show the earlier attempt's numbers" toggle in the same section opening a compact uncoloured `StatsGrid` of the five selection scores (zone rate against location model), the gate result in words, and the reliability chart with 12 px axes and a centred key | RD16 earlier-experiment section and ledger toggle, RD10 compact grids, RD13 axes and keys, RD16 pass/fail in words |
| Shot Quality → Model → Caveats & Methodology | "The earlier attempt" block: what it was, the gate, the disclosed prior exposure, its dates, the empty preflight run in one sentence (Q2), every identifier, the model card behind a toggle, and the sealed report download | RD07 identifiers only in collapsed About |
| Shot Quality → Model | The calibration chart's source reads "Frozen Shot Quality v2 results", not the project code | RD07, RD10 |
| zTS → Defense | A fourth dock tab. Season select and a Regular season / Playoffs switch (Q3); one computed pattern line naming the lowest and highest qualified defender, called a pattern, not a result; the league's points per possession by play type as `LeaderBars` with possessions and share; every defender on `StatsGrid` with season photos, logos beside every team code (both teams for a traded player, Q8), `GridSearch`, sortable, no rank, no colour, thin samples dimmed and listed last; a crosshair on each row selects that defender in place without scrolling; the defender's 64 px `PlayerAvatar` card, four tiles and play-type grid, chosen by search with a Clear button and an empty state (`dPlayer=none`); a collapsed About with the method, the served limitations, who is dimmed, the source and the unrun registered experiment. Column groups switch on a phone | RD03 page and player card, RD12 `LeaderBars`, RD11 sorted-not-ranked, RD13 select in place and phone column switch, RD16 pattern line, RD00 clearable picker |
| Shot Aftermath | Its own centred hero with no tab bar; URL kept; page title "Shot Aftermath" | RD18 hero |
| Menu | Research → Shooting: Shot Quality, zTS, Shot Aftermath, Defensive Shot Quality; the Shooting entry and the Shot Aftermath tab shortcut are gone | Handoff target menu |
| Redirects | `/research/shooting`, `/research/expected-shots` → `/research/shot-quality?tab=model&earlier=open` (opens the toggle and brings the section into view); `/research/shooting/adjusted`, `/research/adjusted-shooting` → `/research/zts?tab=defense` (the old `season`, `phase` and `playerId` are read as fallbacks); `/zts` → `/research/zts`, `/shotquality` → `/research/shot-quality` (Q4) | FO07 |
| Elsewhere | The Learning link "Shooting decomposition" → Shot Quality (Q5); the backend search entry `page_shooting` replaced by Shot Quality, zTS and Shot Aftermath entries (Q6); the Adjusted availability gate removed | — |

**Removed.** `app/research/shooting/page.tsx`, `adjusted/page.tsx`, `layout.tsx`, `components/play-type-shooting-view.tsx` (Q7), `TABBED_PAGES.shooting`. `ResearchResultsView` stays for RAPM's embedded experiment. Nothing was renamed; every sealed result stays reachable.

**Not changed.** No analysis, frozen result, interval or API response. The relative Brier change is computed from the two served Brier scores, the gate is read from the served model card, and the pattern line and sort order are computed from served values.

**Found by the checks and screenshots, then fixed before reporting.**
- Shot Quality's Caveats & Methodology widened the page to 808 px on a phone when opened (its method blocks sized to their widest table). This was already on the approved page, but no test had opened it at phone width. Fixed with one shrinkable track, as Shot Aftermath does; the tables now scroll in their own frames.
- The Defense grid scrolled 84 px sideways at 1440 and 94 px on a phone; names were cut mid-word; two group headers overlapped. Now one "Points allowed" group, a narrower lead column, names wrapping whole and phone columns sized to fit.
- A traded defender showed a dash in the logo slot; the slot is now empty, and each code carries its logo below the name.
- The new chart's axis text drew at 17 px; it now draws at 12 px in the secondary on-background colour. The shared chart is unchanged on the approved test calibration.
- The defender search had no visible way to clear it; a Clear button now leads to the empty state.

**Shared changes.** `lib/route-consolidation.ts`, `lib/nav-model.ts`, `lib/route-availability.ts`, `lib/learning-topics.ts`, `components/methodology-frame.tsx` (comment), `components/shot-aftermath-research.tsx` and `.css`, `components/shot-quality-research.tsx` and `.css`, `components/zts-research.tsx`; new `components/expected-shot-earlier.tsx` and `.css`, `components/zts-defense.tsx` and `.css` (imported after Shot Quality's and zTS's in `app/globals.css`); `lib/expected-shot-earlier.ts`, `lib/zts-defense.ts` and their tests; `src/courtlens/domain/entity_lookup.py` and its test. The mock API now serves the research registry from a real-API fixture (`e2e/fixtures/rd17-expected-shot.json`); `e2e/fixtures/research-negative-result.json` is replaced by it. `tests/unit/test_frozen_identifiers.py` explains the two pre-rename strings inside that fixture's sealed bytes (the model card title and a systemd unit name).

**Specs.** New `rd17-zts-defense.spec.ts` (real-API fixture `e2e/fixtures/rd17-zts-defense.json`, 4 tests). Rewritten: `advanced-research` (the earlier attempt, its redirect, identifiers, download, integrity failure and retry), `route-consolidation` (redirects with in-page tabs, the RD17 landings, the menu, phone tabs on Methodology), `shot-aftermath` (no tab bar), `pc11-gated-pages` (the Adjusted URL lands on zTS Defense with its player), `route-polish` (the drawer lists Shot Quality), `r05-shot-quality` (counts only the test calibration chart's points). Removed: the Expected Shots and Adjusted baselines (`expected-shots-*`, `pc11-adjusted-shooting-*`) and the PC12 Shooting headline (`pc12-b-shooting-*`).

| Check | Result |
| --- | --- |
| Lint (ESLint, Stylelint), typecheck | clean |
| Vitest | 885 passed (new: `zts-defense` 4, `expected-shot-earlier` 3; updated `nav-model`, `nav-trail`, `replica-nav`, `route-consolidation`) |
| Python | Ruff and mypy clean on `src` and `tests`; `test_entity_lookup` 20 passed; full suite 2,693 passed, 9 failed: the 8 known `test_agent_providers[anthropic]` SDK failures and `test_frozen_identifiers`, which flags only its two known files. Repo-wide Ruff also reports the committed RD18/R17 evidence scripts (`design-RD18/content-check.py`, `r17-shot-aftermath/extract.py`), not this block's files |
| Touched specs ×3 (sandbox, mock API) | `rd17-zts-defense`, `shot-aftermath`, `route-consolidation`, `r05-shot-quality`, `r04-zts`, `advanced-research`, `pc11-gated-pages`, `pc12-headlines`, `route-polish`: 49/49 three times |
| Full Playwright (sandbox, mock API, 2 workers, 8 GiB cap) | 628 passed, 17 skipped, 1 failed: `route-polish` still expected a "Shooting" drawer link; updated to Shot Quality, then 49/49 ×3 above. No baseline changed |
| Real data ([`real-check.mjs`](real-check.mjs), [`real-data-check.json`](real-data-check.json), proxy [`../design-RD10/readonly-proxy.mjs`](../design-RD10/readonly-proxy.mjs), GET only) | 30,937 values, 0 mismatches. The earlier attempt at both widths (line, gate, dates, every grid value, result, chart points, axis size, every identifier, the other run); zTS Defense in four scopes (2025-26 regular season, 2024-25 playoffs, a traded defender, a thin sample) at both widths: count, pattern line, every league bar, every defender's every value in each phone column group, row order, logos per code, the card's tiles and play-type rows in each group; Shot Aftermath standalone; five redirects; the menu's Shooting group. Expected values come from :8000 and are formatted independently of the page's libs |
| Layout and rules | 0 console errors, 0 page overflow (also with Shot Quality's Caveats open), no grid of ours scrolling sideways, 0 broken images, no hashes or project codes in visible text, no green or red; at both widths in every scene |
| :3100 | The served CSS chunk carries the new rules. Its redirects and menu read the route config at start, so they wait for a restart of :3100 (owner) |

**Glance test** (`rd17-r1-zts-defense-2025-26-rs-full-1440.png`, `rd17-r1-sq-earlier-section-1440.png`, viewed). zTS Defense: in five seconds, what it measures (the heading and one line), the season's pattern by name, the league's play types as bars, then every defender. Shot Quality: the earlier attempt in one sentence (0.08% against the 1% it needed, never tested), with its numbers one click away.

**Page size.** Shot Quality Model 4,650 / 5,605 px with the earlier attempt open (was 3,622 / 4,478); zTS Defense 2,887 / 3,549 px; Shot Aftermath 5,216 / 6,654 px.

Screenshots viewed: `rd17-r1-sq-earlier-section-1440`, `rd17-r1-zts-defense-2025-26-rs-full-1440` and `-390`, `rd17-r1-zts-defense-2025-26-rs-traded-card-390`, `rd17-r1-zts-defense-2025-26-rs-top-390`, `rd17-r1-aftermath-top-1440`, `rd17-r1-menu-1440`. Element screenshots of the earlier-attempt section show the sticky site header over the section; the page viewport shows it in place.

## Approved (owner, 2026-11-10)

"Sounds good. I approve them." (with RD18). Row ✅. Full Playwright for this state: 628 passed, 17 skipped, 1 failed (`route-polish`, updated; touched specs 49/49 ×3).
