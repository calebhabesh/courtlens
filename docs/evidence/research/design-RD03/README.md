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
