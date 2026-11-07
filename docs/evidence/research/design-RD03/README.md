# RD03 — zTS, round 1: Databallr's zTS explainer

Measured 2026-11-07 on branch `research` from `70ebb71`. Parents: [Research design catalog](../../../research-design-catalog.md)
RD03, [Research progress](../../../research-progress.md), R04 analysis in [r04](../r04/README.md). Page: `/research/zts`.
**Awaiting the owner.** Only the owner marks ✅.

Design, plus one descriptive data addition the owner approved (gap C, below). No registration, frozen result, interval or
existing served number changed; the shared Postgres was only read.

## Reference and instructions

Reference: the saved page `~/Downloads/LocalSend/zTS — Playtype-Adjusted Scoring Efficiency _ databallr.html` (newer than the
`~/Downloads/Webpages/` copy), rendered offline with its 12 script tags and every `crossorigin=""` stripped, a `<base>` at the
saved folder and every non-`file://` request blocked (databallr.com was never fetched), plus eight owner screenshots. The save
holds the About essay and the Top 200 table (hidden in the save; unhidden to render). Measured from its DOM: a **768 px** text
column (`max-w-3xl`) centred in a 1248 px container; nothing inside it is wider; the Top 200 table is a fit-width 529 px table in
the same column. The Player tab is not in the save, so this page's Player tab is its own design.

Owner (2026-11-07): *"Your recommendations look good. Go ahead and comprehensively create redesign the page"*, accepting the
seven recommendations under the gap list: (1) copy Databallr's layout (article hero, one essay column in its section order,
floating bottom tabs, panels one level deep); (2) its 768 px column; (3) CourtLens's own prose in Databallr's structure with
CourtLens's numbers; (4) gaps: A zTS add/100 in place of SV/100, B and E left out, C team difficulty from summed player rows,
D no position chips, F 2015-16 onward with Post disabled; (5) Finishing-Big / High-Burden keep their rule, role moves by rule;
(6) gold/blue by sign, green/red only on the registered test; (7) the Player tab as described.

## What changed

| Before | After |
| --- | --- |
| Plain build page: left page header, top segmented tabs, three test tiles, nine dark boxed panels at full width | Databallr's article in `.rs-column` at 768 px: hero (RESEARCH METRIC pill, registration date, the large title with "zTS" in a chip, one subtitle line) through `PageHeader`; the intro essay; sections in Databallr's order with no heading icons (Databallr has none); figures on light panels with wells one level deep; About / Top 200 / Player in a floating pill dock (kit `Segmented`) |
| League TS table and a bar chart | Databallr's diverging bars from the league average (gold above, blue below), the average pill, four family chips with their pooled TS (from the served points and scoring possessions); the totals table moved to Caveats |
| Calculation as a bullet list | Two formula wells (Expected TS; Playtype Difficulty emphasised) and the `zTS = rTS + Playtype Difficulty` quote; the usage correlation in prose (plain Pearson over the season's served players, 0.50 in 2025-26) |
| Pair: two selects, a table, a paired-bar chart | Databallr's pair mix panel (hardest play types first, category colours for the two players, "not listed" for an absent type), the Expected TS / Playtype Difficulty panel, and the side-by-side card (64 px team-coloured season photos, a Change select under each, Usage / rTS / Role / zTS) sharing the pair in the URL (`a`, `b`) |
| Minutes tabs, six tiles, a single-tone histogram | Season and minutes selects with the player count; four tiles (hard +2, easy −2, middle ±1, mean) as wells; the histogram split blue (easier) / gold (harder) with the median; a bar (or the range select) opens that range's players on `StatsGrid`; the scoring-usage min / max filter |
| "Easiest and hardest roles" | The Finishing-Big Effect and High-Burden Scorers, each a compact `StatsGrid` (same rule) with CourtLens's prose; the X/Y explorer (rTS, Role, zTS, Usage, zTS add/100 on either axis; gold Role ≥ +1, blue ≤ −1; x = y dashed when both axes are TS points) |
| — | Turning Efficiency Into Scoring Value (TS add and zTS add formulas; zTS add/100 named as CourtLens's in place of SV/100) |
| The registered test as two tables, always open | What the Test Measures (oTS RAPM, linked to Six-Factor RAPM, and next season's rTS) and What the Test Found: two panels with r for rTS and zTS, 95% whiskers and zTS − rTS in green (tracking, interval above zero) and red (predicting, interval below); the by-season tables moved to Caveats |
| — | Playtype Difficulty Moves: six players by rule (new GET `/api/zts/role-moves`), a kit `Segmented` and a compact `StatsGrid` |
| — | What About Team Scheme?: the players-vs-teams density (σ 2.28 against 0.39, 2015-16 to 2025-26) and the team table (PT diff, TS, sortable) whose rows open the team's players and their Roles (new GET `/api/zts/teams`) |
| — | The Point (the observed = performance + difficulty well and the FG% → zTS progression) |
| Full leaderboard on the old table | Glossary toggle, player count, search, `StatsGrid` with 40 px photos (Scoring usage, rTS, Role, zTS, zTS add/100), Show more |
| — | Conclusion with a Top 200 link |
| Coverage, unknowns and method, always open | Collapsed **Caveats & Methodology** (no top rule): definitions, coverage and unknowns with the coverage table, every rule on the page, the registered test by season, league totals, credits and hashes |
| Top 200 on the old table, four controls in a row | Databallr's bar (season select, Glossary; Reg / Post with Post disabled, search) over a `StatsGrid` with the rank beside the player, Yr, MIN, USG, rTS, Role, zTS and zTS add/100 (header sort between zTS add and zTS) |
| Player tab: tiles, a long table and history | Clearable picker with season (`player=none` leaves an empty state with "Open the default player"), the 64 px team-coloured photo card, four tiles, the mix against the league in the pair-chart style, the Expected TS / difficulty panel, the season history on compact `StatsGrid` |

Colours: every player value with a sign (rTS, Role, zTS, zTS add, difficulty) uses the identity tones, gold above zero and blue
below, none when it rounds to zero; no per-player interval is served. Only the registered test's zTS − rTS is green or red, and
both intervals exclude zero. Text uses `--color-on-bg-secondary` / `-tertiary`. `ResearchSection` took an optional icon so a page
can match Databallr's plain headings; other pages are unchanged.

## Data addition (gap C, owner-approved): team playtype difficulty

- `domain/zts_teams.py` sums every listed Synergy offensive row a team's players logged for it, then Expected TS and difficulty
  exactly as R04 defines them for a player, against the frozen league references. `evaluation/zts_teams.py` reads the same mart
  rows as the frozen run and refuses to run unless each season's row digest equals the frozen `play_types_sha256` (all 11
  matched). Output: `evaluation/research/derived/courtlens-zts-teams-v1.json` (teams `7e50daef…`, built from results `ecc5ae9f…`).
- The scoring-possession-weighted league team difficulty is 0 in every season. 2025-26 runs from −0.78 (TOR) to +0.78 (BOS);
  Databallr's saved page shows −0.67 to +0.73 with the same top three (BOS, PHX, CHA). Rows under the source's 10-possession floor
  are absent, so team totals run slightly low; a traded player's Role in a team list is his season value over all teams.
  Descriptive, not part of the registered test.
- Role moves: players with a served zTS and 1,000+ minutes in each of the (up to) five seasons ending in the chosen season, the six
  largest Role changes first to last. 2025-26: 33 qualify (2023-24's dropped-row seasons make the rule strict); Aaron Wiggins
  +1.64 leads.
- Services `team_board` and `role_moves`, routes `GET /api/zts/teams` and `GET /api/zts/role-moves` (GET only: no Caddy change).
  Six new tests in `tests/unit/test_zts_teams.py` (sums and league zero, σ, the digest refusal, the file against the frozen run and
  its own hash, the board, the moves rule).

## Verification

| Check | Result |
| --- | --- |
| Lint (ESLint + Stylelint) | 0 errors, 0 warnings |
| Typecheck | clean |
| Vitest (in the repo) | 817 passed (117 files); 5 new helper tests (sign tones, density, Pearson, families, extremes) |
| Ruff, format, strict mypy | clean (1,067 files; 380 source files) |
| Python tests (`make test-python`) | 2,678 passed, 3 skipped, **9 failed**: the 8 `test_agent_providers.py[anthropic]` SDK failures and `test_frozen_identifiers.py::test_no_unexplained_legacy_brand_references`. A clean HEAD worktree fails the same 9 (diff of names: identical); none names an RD03 file |
| Page Playwright (`r04-zts.spec.ts`, rewritten; no other spec visits the route) ×3 | 21/21 on the final build: league bars, test values and tones, leaderboard order and Show more, the pair's fields and an absent type, the distribution, extremes, explorer, role moves, teams and a team's players, Top 200 order and search with Post disabled, the Player default, its clear-to-empty and back, the dock at 390 (controls ≥ 40 px, no overflow), the menu item |
| Full Playwright (sandbox `~/.cache/courtlens-tmp`, mock API 4180, build 3180, `MemoryMax=8G`) | **596 passed, 17 skipped, 0 failed** on the final build (and on the first). No visual baseline covers this page, so none changed |
| Real data ([`real-data-check.json`](real-data-check.json), [`real-check.mjs`](real-check.mjs), [`readonly-proxy.mjs`](readonly-proxy.mjs)) | Owner's :8000 through the read-only proxy on 4180 (GET 200, POST 405), production build on 3180. Five scenes at 1440 and 390: About 2025-26 and 2018-19 (league bars, families, average, the rule's pair and its fields, Expected TS, difficulty, mix shares, distribution tiles, median and every bin, both extremes tables, explorer point count, both test panels and tones, role moves, every team and the first team's players, spread σ, the leaderboard's first 50 then all, coverage, the test by season, league totals), Top 200 (all 200 rows, six fields, ranks), Player default and Jokić 2018-19 (tiles, Expected TS, league TS, difficulty, coverage, every mix share and league share, history). **6,088 compared, 0 mismatches**, 0 console errors, 0 overflow, 0 broken images (photos forced eager and awaited), 0 phone controls under 40 px. Column 768 px centred at 1440 (336 px each side) |
| Glance test | At a glance the page reads as an article about zTS: the large title says what it is, the gold/blue play-type bars under the intro show the idea, and the dock offers the leaderboard and a player. The verdict is one section away and says plainly that it splits |
| Screenshots (viewed) | Before: [`before-about-1440.png`](before-about-1440.png), [`-390`](before-about-390.png). After, fresh loads: [`zts-about-latest-1440.png`](zts-about-latest-1440.png), [`-390`](zts-about-latest-390.png), [`zts-about-2018-19-1440.png`](zts-about-2018-19-1440.png), [`-390`](zts-about-2018-19-390.png), [`zts-top-all-1440.png`](zts-top-all-1440.png), [`-390`](zts-top-all-390.png), [`zts-player-default-1440.png`](zts-player-default-1440.png), [`-390`](zts-player-default-390.png), [`zts-player-jokic-2018-19-1440.png`](zts-player-jokic-2018-19-1440.png), [`-390`](zts-player-jokic-2018-19-390.png) |

Fixed during verification: a duplicated default-pair rule (now only in Caveats), the scoring-usage inputs stretching on a phone,
the Top 200 name running into Yr once the rank moved beside it, and a narrow phone lead column there. :3100 served stale CSS once;
refreshed by toggling the import. The owner's :8000 and :3100 were not restarted; 3180 and 4180 were stopped and the sandbox and
HEAD worktree deleted.

Not changed, as asked: the old `/zts` alias still redirects to `/research/shooting/adjusted` (`lib/route-consolidation.ts:95`),
not to this page.

## Round 2 (owner, 2026-11-07)

Instruction, from a screenshot of the hero title: (2) *"Add a little bit of spacing after "zTS" container, it seems too close to
the colon."* CSS only: `.zt-hero-chip` takes `margin-inline-end: var(--space-2)` (8 px).

| Check | Result |
| --- | --- |
| Lint, typecheck, Vitest | 0 / 0; clean; 817 passed |
| Page Playwright (`r04-zts`) ×3 | 21/21 |
| Full Playwright (sandbox, final build) | First run 595 passed, 17 skipped, 1 failed: `last-games.spec.ts` "the trend chart follows the window…", an untouched page; alone it passed 10/10, and the full rerun was **596 passed, 17 skipped, 0 failed** |
| Real data | 6,088 values in the same five scenes at 1440 and 390: 0 mismatches, 0 console errors, 0 overflow, 0 broken images, 0 phone controls under 40 px; scene shots refreshed |
| Screenshots (viewed) | [`hero-r2-1440.png`](hero-r2-1440.png), [`hero-r2-390.png`](hero-r2-390.png) |

:3100 served stale CSS; refreshed by toggling the import (computed margin 8 px afterwards). :8000 and :3100 not restarted;
3180/4180 stopped, sandbox deleted.

## Round 3 (owner, 2026-11-07)

Instruction, from a screenshot of Compare Players Side by Side: (3) *"Do these drop downs contain all players? Remember we
shouldn't use drop down menus to scroll through player lists, it should be a search bar/drop down combo if need be."*

Answer: no. Each select listed only the season's players with a served zTS (313 in 2025-26), the only players the card can show.

| Change | Detail |
| --- | --- |
| Change, then search | Under each photo a kit `Button` "Change" (search icon, pressed while open) opens a search field under the card: the site's `LookupInput` with the season's served players as its candidates (filtered as you type, 8 suggestions with photos, the two shown players excluded), focused on open, with a close button. Choosing a player swaps that side and writes `a` / `b` to the URL |
| No player dropdowns | The page's remaining selects are season, minutes, X/Y axes and Top 200 season (12 options at most); the Player tab already used the search picker |

| Check | Result |
| --- | --- |
| Lint, typecheck, Vitest | 0 / 0; clean; 817 passed |
| Page Playwright (`r04-zts`) ×3 | 24/24; new test: no select with 30+ options, Change → focused search → "Gilgeous" → the option swaps side A, URL `a=`, the card's zTS equals the fixture, the search closes |
| Full Playwright (sandbox, final build) | First run 596 passed, 17 skipped, 1 failed: `route-polish.spec.ts` "catalog scope options…", an untouched page (a URL-state race; alone 10/10). Full rerun **597 passed, 17 skipped, 0 failed** |
| Real data | 6,088 values in the five scenes at 1440 and 390: 0 mismatches, 0 console errors, 0 overflow, 0 broken images, 0 phone controls under 40 px. On real data the search for "ja" offers served players and picking Ajay Mitchell draws 21.5 / +0.4 / +1.8 / +2.2, equal to the API; 0 errors, 0 overflow at both widths |
| Screenshots (viewed) | [`compare-search-r3-1440.png`](compare-search-r3-1440.png), [`compare-search-r3-390.png`](compare-search-r3-390.png), [`compare-picked-r3-1440.png`](compare-picked-r3-1440.png) |

:3100 CSS refreshed by toggling the import. :8000 and :3100 not restarted; 3180/4180 stopped, sandbox deleted.

## Round 4 (owner, 2026-11-07)

Instructions, from a screenshot of the compare card with its search open under the card: (4) *"It should enter as search boxes
under the player photos."* (5) *"The player photos should have the team color/logo behind them. Like we have on other pages.
It's important."*

| Change | Detail |
| --- | --- |
| Search under the photo | "Change" is replaced in place by the search field, under that player's photo and name (the card widens to 600 px to fit it). Results drop straight beneath the field, 300 px wide, aligned to that side; Escape or leaving the field empty closes it. The separate close button is gone (it stuck out of the card on a phone) |
| Team colour and logo | The compare photos and the Player tab photo are the site's `PlayerAvatar` at 64 px: the team-colour fill and 2 px ring with the team logo badge, the season's photo (as on WOWY, Playoffs and Contracts). Before, a page-made circle carried only a faint fill |

Found while checking: on phones a shared rule (`shared-overrides.css`, `.lookup-dropdown { top: 112px }`, `components` layer,
imported after `lookup-input.css`) pins every *floating* (portalled) search list at 112 px, so it covered the field here. This
page now renders its list inline, placed by page-layer CSS. Other pages that use `portalDropdown` on phones are likely affected;
not changed here (shared CSS, the owner's call).

| Check | Result |
| --- | --- |
| Lint, typecheck, Vitest | 0 / 0; clean; 817 passed |
| Page Playwright (`r04-zts`) ×3 | 24/24; the search test now also checks the field opens under side B's photo focused, Escape closes it back to Change, and both photos carry the team badge |
| Full Playwright (sandbox, final build) | **597 passed, 17 skipped, 0 failed** |
| Real data | 6,088 values in the five scenes at 1440 and 390: 0 mismatches, 0 console errors, 0 overflow, 0 broken images, 0 phone controls under 40 px. On real data both photos are 64 px with the team fill, ring and logo; the field opens under the photo and its list starts 5 px below it at three scroll positions on a phone; a pick swaps the side; 0 overflow, 0 errors |
| Screenshots (viewed) | [`compare-r4-1440.png`](compare-r4-1440.png), [`compare-r4-390.png`](compare-r4-390.png), [`compare-search-r4-1440.png`](compare-search-r4-1440.png), [`compare-search-r4-390.png`](compare-search-r4-390.png); the Player tab in the refreshed scene shots |

:3100 CSS refreshed by toggling the import. :8000 and :3100 not restarted; 3180/4180 stopped, sandbox deleted.

## Round 5 (owner, 2026-11-07)

Instruction (6), replying to the round-4 question about the shared phone rule: *"Use your best judgement. Also is this compare
players only for 25-26?"*

| Change | Detail |
| --- | --- |
| A season per side | It was tied to the page season (2025-26 unless the distribution section's season select, further down, was changed). Each side now has its own season select (2015-16 to 2025-26) under the name, kept in the URL (`as`, `bs`; absent = the page season). That side's search lists that season's served players (placeholder "Search 2016-17", season under each name), and the photo, team ring and logo follow that season. If the shown player has no served zTS in the new season, the side says "No served zTS in {season}" with dashes, and Change searches that season. Changing the page season resets both sides |
| Worked example kept apart | "The Calculation in Practice" now always shows the page season's default pair: its mix chart and Expected TS panel use one season's league references, so they can't take a cross-season pair. Before, it followed the compare picks |
| Prose | "Pick any two players, each from any season since 2015-16 … rTS, Role and zTS are each measured against their own season's league, so different seasons compare directly." The season doesn't break across lines |
| Shared phone rule (judgement) | `shared-overrides.css` now reads `.lookup-dropdown:not(.lookup-floating-dropdown) { top: 112px; }`: floating (portalled) lists use their own measured position again, so on a phone they open under their field; inline lists are unchanged. Measured on the Player Dashboard's "Add a player" at 390 px: list top 5 px below the field, where it was pinned 112 px from the top of the screen. The zTS page keeps its inline list |

| Check | Result |
| --- | --- |
| Lint, typecheck, Vitest | 0 / 0; clean; 817 passed |
| Page Playwright (`r04-zts`) ×3 | 27/27; new test: side B to 2016-17 (URL `bs`), search "Westbrook", its four fields equal the real 2016-17 board (added to the fixture from the API), side A stays 2025-26, the worked example keeps the default pair |
| Full Playwright (sandbox, final build) | **598 passed, 17 skipped, 0 failed**, including every spec that opens a floating search |
| Real data | 6,112 values in six scenes (new: `compare-cross-season`, side B Russell Westbrook 2016-17) at 1440 and 390: 0 mismatches, 0 console errors, 0 overflow, 0 broken images, 0 phone controls under 40 px |
| Screenshots (viewed) | [`compare-seasons-r5-desktop.png`](compare-seasons-r5-desktop.png), [`compare-seasons-r5-phone.png`](compare-seasons-r5-phone.png), [`compare-seasons-search-r5-phone.png`](compare-seasons-search-r5-phone.png) |

:8000 and :3100 not touched; 3180/4180 stopped, sandbox deleted.
