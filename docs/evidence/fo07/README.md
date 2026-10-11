# FO07 evidence: route consolidation (D3)

Captured 2026-10-09 on branch `frontend-overhaul`. Parent:
[frontend overhaul handoff](../../frontend-overhaul-plan.md#fo07-route-consolidation-d3).

## What changed

One table, `dashboard/lib/route-consolidation.ts`, defines the merged pages, their tabs and every
redirect. `next.config.ts`, the nav model, route availability and the tests all read from it.

A merged page is one title with **path tabs**. The first tab is at the page's own path and every
other tab is a sub-path, for example `/research/shooting/aftermath`. Path tabs were chosen over
`?tab=` because the embedded views rewrite their own URL from `usePathname()`. With path tabs, the
selected tab survives those rewrites, and server pages need no tab state. Each page's `layout.tsx`
renders `TabbedPage` (`PageShell` → `PageHeader` → `RouteTabs`), so the header and tabs stay in
place while the tab body changes.

| Merged page | Tabs | Replaces |
| --- | --- | --- |
| RAPM Research | RAPM `/research/rapm` · Six-Factor `/research/rapm/six-factor` | `/six-factor-rapm` |
| Similar Players | Box Score `/similar-players` · Shot Profile `/similar-players/shot-profile` | `/research/similarity`, `/shot-profile-twin` |
| Shooting | Expected Shots `/research/shooting` · Adjusted Shooting `/research/shooting/adjusted` · Shot Aftermath `/research/shooting/aftermath` | `/research/expected-shots`, `/research/adjusted-shooting`, `/shot-aftermath` |
| What's New | Patch Notes `/whats-new` · Blog `/whats-new/blog` | `/patch-notes`, `/blog` |
| Methodology | Definitions `/methodology` · Learning `/methodology/learning` | `/learning` |

- **Redirects:** all 9 removed URLs return 307 to their tab and keep the query string. The older
  aliases `/zts` and `/shotquality` now point straight at the new tabs, so no request takes two hops.
- **`RouteTabs` (`components/ui/route-tabs.tsx`):** tabs are links with `aria-current="page"` and a
  sliding indicator. Switching tabs keeps the shared context (season, phase, through date, window,
  release). Similar Players and Shooting also keep the player. Tabs are 40px tall, and a tab whose
  source is unavailable in the scope reads as secondary, with the reason as a tooltip (D4).
- **Navigation:** each merged page appears once in the menus, under its page title. Research groups:
  Impact (RAPM Research, WOWY, Defensive Matchups, Spatial EPV), Shooting (Shooting), Trends &
  Distributions, Forecasts & Evaluation, and Tools. The menu item stays current on every tab. The
  `⋯` menu's What's New entry points to `/whats-new`. Schedule, Planner and Data status were
  already in the `⋯` menu (FO02), and Tier Lists and Rankings were already under Players.
- **Search:** the backend page entries (`entity_lookup.py`) point to the new URLs. Entries were added
  for RAPM Research, Shooting and What's New, so old names ("six factor", "patch notes", "shot
  aftermath", "statistical peers") find the merged page.
- **Headings:** each page has exactly one `h1`, from the shared header. Embedded views drop their own
  titles: `ShootingView embedded`, and `SimilarityInvestigationView` and `ResearchResultsView`
  (h2). Article headings move down one level. Tab bodies also pick up the `.workbench-content`
  content safeguards (code wrapping, min-width) through `.ui-tabbed-page-body`.
- **`/design`:** stays out of navigation and search, and is now `noindex` through `app/design/layout.tsx`.
- **Lint ratchet:** `PENDING_RAW_TITLE` drops from 41 to 35 files. `PENDING_NATIVE_DATE` is
  unchanged at 11.

## Checks

| Check | Result |
| --- | --- |
| `npm --prefix dashboard run lint` | 0 errors, 0 warnings |
| `npm --prefix dashboard run typecheck` | pass (after `next typegen` replaced stale route types from an earlier build) |
| `npm --prefix dashboard test` | 50 files, 344 tests pass (new `lib/route-consolidation.test.ts`; nav and replica-nav tests updated) |
| `ruff check`, `ruff format --check`, `mypy src/courtlens` | clean |
| `pytest tests/unit/test_entity_lookup.py` | 16 pass (new merged-page lookup test) |
| Redirects on the real dev server (:3100) | 10/10 old URLs → 307 to the tab, query kept. All 11 tab URLs and `/design` → 200 |
| Playwright, all 269 tests, serial, production build of an isolated copy | first run 252 pass / 15 skip / 2 fail. After the fixes below: **254 pass, 15 skipped, 0 fail** on a fresh build |

The first full run had two failures:

- `route-polish.spec.ts` looked for the removed "Expected Shots" drawer link. It now expects
  "Shooting".
- `showcase.spec.ts:56` measured a 40px button at 39.99994px, in 1 of 3 runs. FO07 did not touch
  Showcase. The test now allows 0.01px for a settling scale transform, and passed 8 of 8 runs.

New `e2e/route-consolidation.spec.ts` covers:

- every removed URL returns 307 with its query;
- an old link opens the merged page with the right title, tab list and selected tab;
- switching tabs keeps the scope and player, with one `h1`;
- the Research menu lists each merged page once;
- tabs at 390px are 40px tall with no sideways scroll.

`shooting`, `advanced-research` and `saved-operations` specs now open the new URLs.

## Screenshots and measurements

`*-1440.png` and `*-390.png` cover all 11 tab URLs on the real-data dev server. `measurements.json`
holds per-page values, reproduced by the capture script used for this block.

On every page at both widths:

- the `h1` matches the nav label;
- the selected tab matches the URL;
- every tab is 40px tall;
- the header and tabs share a left edge (24px desktop, 12px phone);
- the tabs end at y=195 on desktop and y=191 on phone;
- there is no sideways page scroll.

`/similar-players` scrolled sideways at 390 before FO07 (FO00 recorded it). The cause was a
461px-wide evidence hash, and it is fixed by the code-wrapping rule above.

## Glance test

FO07 only changes structure. The tab bodies are rebuilt by FO09 (Similar Players), FO12 (RAPM,
Shooting) and FO13 (Methodology, What's New). So only the items FO07 owns are scored here:

| Item | Result |
| --- | --- |
| 1 Header | **pass**: Title Case title matching the nav label, one subtitle line, on every merged page |
| 4 Alignment | **pass** for header and tabs: shared left edge, 4px grid, tabs 40px |
| 7 Icons | **pass**: no glyphs added |
| 9 Phone | **pass**: no sideways scroll on any of the 11 tab URLs at 390, touch targets 40px |
| 2, 3, 5, 6, 8, 10 | **not scored**: they depend on the tab bodies (old forms, native date inputs, a hash in Similar Players, notice boxes), which belong to FO09/FO12/FO13 |

## Findings for later blocks

- **FO09:** the Similar Players "Open in Stats" button has unreadable text (dark on dark). FO00's
  baseline shows the same, so FO07 did not cause it. The evidence hash in that view belongs in Data
  details.
- **FO12:** inside Shooting, the shot tools' own link row ("Shot-profile twins · Source assignment
  matchups · Shot aftermath") partly duplicates the tabs. `ResearchResultsView` keeps its
  cross-experiment link row. Fold both into the tabs or Data details when Research is rebuilt.
- **FO13:** Methodology and What's New use the Research template for now. The Article template is
  still the owner's choice.
- **All blocks:** content in `content/2026-10-04-retained-operations.md` still links to `/learning`.
  It was left unedited because published content may be hash-tracked, and the redirect covers it.
- **Any block that renames or moves a route:** add it to `lib/route-consolidation.ts`, not to
  `next.config.ts` directly. The unit test checks that every redirect lands on an existing page in
  one hop.
