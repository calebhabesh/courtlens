# CourtLens full NBA history progress

Parent: [full history handoff](full-history-plan.md). Plans are not runtime evidence.

Allowed states: `planned`, `in_progress`, `implemented_unverified`, `verified`, `source_blocked`.

## Block status

| Block | Status | Measured evidence |
| --- | --- | --- |
| FH01 | implemented_unverified | Crawler, CLI and launcher built; 8 unit tests pass against a mock source. Not run against the source yet (owner runs it). |
| FH01b | verified | Owner's run finished 2026-10-21: 2,751 profiles (0 failed), 398/398 headshots; 1,357 Basketball-Reference headshots active; spot-checked photos served by the API. |
| FH01c | implemented_unverified | Wikidata → Commons career photos for players with no photo; 8 unit tests; trial on 17 players (7 photos, all the right player). Full run is the owner's (`scripts/acquire-wikidata-portraits.sh`). |
| FH02 | implemented_unverified | 373 league pages sealed: 43,435 player-team-season rows (1946-47 to 2025-26), 1,724 team-season rows; 5,106 players, 43 kept as `bbref:` IDs. Owner review pending. |
| FH03 | implemented_unverified | 6,520 game logs → 19,082 games, 404,586 player-game rows (387,831 appearances); 0 games where player points differ from the final score; 6 of 1,394 players unmatched. Owner review pending. |
| FH04 | implemented_unverified | Release a04405de (dataset 277ec9c5) published 2026-10-22: 81 seasons, 97 game scopes + 74 season-total scopes, dbt 93/93, 171 Stats cohorts warmed. Owner review pending. |
| FH05 | in_progress | Stats, player page, career table, Compare, Showcase (BPM default before DPM), search and season pickers reach 1946-47; game pages list 1983-84 on. Older team identities, season alignment and logos done 2026-10-22. Pre-1983-84 team pages and full photo coverage remain. |
| FH06 | planned | |

## FH01 — 2026-10-21

- Checked before building: robots.txt (`Disallow: */gamelog/`, `Crawl-delay: 3`), one sample game
  log (Michael Jordan 1984-85, HTTP 200, 403,731 bytes, tables `player_game_log_reg` and
  `player_game_log_post`), and the 1984-85 NBA and 1946-47 BAA totals pages (HTTP 200; 320/185 and
  161/61 regular-season/playoff player IDs read with the shared HTML parser). These four requests
  were made with curl and left no receipts.
- Added `ingestion/bbref_history.py`, `services/bbref_history.py`, `courtlens
  acquire-bbref-history` and `scripts/crawl-bbref-history.sh`. `tests/unit/test_bbref_history.py`:
  8 passed. Ruff, format and strict mypy are clean.
- Next: the owner runs `scripts/crawl-bbref-history.sh --detach`, then records receipt counts here.

## FH01b — 2026-10-21

- The owner asked for older players to get everything current players have, except what can't
  exist for their era. The inventory is in the plan (H6).
- Offline matching measurement against the retained index pages: 2,485 of 2,854 index players
  without roster seasons match with the existing rules; the new provisional rule proposes 228
  more, each kept only after the page's legal name confirms it.
- Added `match_by_seasons`, `legal_name` and `confirms_legal_name` (`ingestion/bbref_players.py`),
  `acquire-bbref-bios --history`, and a left join in the headshot targets. Added
  `scripts/crawl-bbref-old-players.sh`. In a scratch copy with a stub CLI, it waited for the
  history crawl's pid, ran both steps in order, and a group kill left no processes behind.
- `portrait_targets` was run read-only against the owner's Postgres: 0 targets before and after
  the change (no older-player profiles exist yet). 32 Basketball-Reference unit tests pass. Ruff,
  format and strict mypy are clean.

## FH01b results — 2026-10-22

- `scripts/crawl-bbref-old-players.sh` (owner's pane) finished 2026-10-21T22:49Z after the history
  crawl (6,893 game logs fetched, 0 failed, 0 missing): `bbref-old-profiles-20261021T191240Z.json`
  reports 5,416 index players, 4,797 matched, 271 provisional (each confirmed by legal name),
  174 unmatched, 5 unconfirmed, 2,751 profiles fetched, 0 failed. Headshots: 398 targets,
  398 acquired, 0 without a headshot, 0 failed.
- Postgres: 1,357 active `bbref_headshot` rows. Three players without game rows (1122, 77685,
  76091) return 200 image/webp from `/players/{id}/portrait?size=192` on :8000.

## FH01c — Wikidata career photos, 2026-10-22

- Owner (2026-10-22): "I want there to try to be a picture for all players." Gap measured over
  players with game rows or a Basketball-Reference profile: 2,918 of 5,399 had no active photo
  (748 with game rows from 2000-01, 2,170 before). Basketball-Reference has no headshot on any of
  the 2,621 retained pages among them; NBA.com's CDN returns its silhouette (12,430 bytes) for a
  sample of 24; ESPN's headshot CDN 404s for a sample of 16 linked by Wikidata (P3685).
- Wikidata links an image (P18) or Commons category (P373) by NBA.com ID (P3647) or
  Basketball-Reference ID (P2685) for 922 of the 2,918 (248 from 2000-01, 674 before).
- Owner's choice (2026-10-22): "Uniform first, else any". Added `services/wikidata_portraits.py`,
  `courtlens acquire-wikidata-portraits` and `scripts/acquire-wikidata-portraits.sh`. The face is
  learnt from the Wikidata image when one face is 1.5x the area of any other (or from the
  player's own season headshots), category files are face-matched and must be in uniform, and the
  Wikidata image is the out-of-uniform fallback. Photos are the portrait endpoint's last resort,
  after NBA.com and Basketball-Reference, and are credited on Methodology as career photos.
- Trial on the owner's Postgres (17 players with the most minutes): 7 photos (6 in uniform,
  Jacque Vaughn's coaching photo out of uniform), 10 `missing` (2 without a Wikidata link, 3
  group photos with no dominant face, the rest with no usable file). A contact sheet showed the
  right player in all 7.
- Next: the owner runs `scripts/acquire-wikidata-portraits.sh --detach` (about 920 linked
  players at a 1 s pause; roughly 1-1.5 hours), then the remaining count is recorded here.

## FH02–FH05 — 2026-10-22

Owner: "Make sure that we have hooked up all the data we have scraped to relevant pages (photos,
box score, stats)."

- Parser `ingestion/bbref_seasons.py` (`bbref-history-v1`) and `services/bbref_history_seal.py`;
  `courtlens seal-bbref-history` parses every retained page offline (about 17 s, 8 workers) and
  writes `data/raw/bbref_history_sealed/{gamelogs,seasons}-bbref-history-v1-<sha>.jsonl.gz` with
  manifests (reconciliation report inside). Season rows load once per file hash into
  `bbref_player_seasons` / `bbref_team_seasons` (migration `18b810a4f016`).
- Game logs: 6,520 pages, 0 parse errors. 19,082 games (1983-84 to 1999-00), 404,586 player-game
  rows: 387,831 appearances, 16,755 reported non-appearances (Did Not Play 12,822, Did Not Dress
  2,735, Not With Team 1,094, Suspended 104). 0 one-sided games, 0 result conflicts, 0 games
  whose player points differ from the final score. Against the season totals pages, 10,309
  player-team-seasons were checked: games played always agree; 395 field differences (points
  62, rebounds 120, assists 121, FGA 92, mostly 1983-84 to 1986-87, typically 1-5) are recorded
  in the manifest and left as the box scores have them.
- Game IDs keep the NBA's shape (`002`/`004` + start year + sequence in date order); they are
  CourtLens sequence IDs and each schedule row keeps the source's box-score key. Team game rows
  sum their players (`stats_basis: player_sum`).
- Identity: 1,388 of 1,394 game-log players and all but 43 of 5,106 season-total players map to
  NBA person IDs through `bbref_player_profiles`; the rest keep `bbref:<id>` identities.
- New eras: Washington Bullets (WSB), Kansas City Kings (KCK), San Diego Clippers (SDC), with
  Basketball-Reference logos (`team_branding_assets.py --acquire-eras`, 6 requests).
- `import_workbench_data` folds the sealed game logs into every default-range dataset and pins
  the season-totals file by SHA-256 (`coverage_json.history.season_totals_sha256`), so the daily
  refresh keeps both. Published release `a04405de-095b-4ca5-9eba-5fb86260251e`.
- Stats engine: game rows weigh 1 and a season-total row weighs its games, so per-game, per-36
  and percentage values aggregate exactly; Postgres engine tests 48/48 unchanged. Totals rows
  count only for cutoffs after the season (30 June marker), whole-season windows only.
- New Stats columns from the source's advanced tables: BPM, OBPM, DBPM, WS, WS/48, PER, VORP
  (whole season, every era). Showcase sorts by BPM where DARKO has no rating.
- Checked against official records: Wilt Chamberlain 1961-62 50.4 pts / 25.7 reb / 48.5 min;
  career 1,045 games, 31,419 points. Kareem Abdul-Jabbar 1969-70 to 1988-89: 1,560 games,
  38,387 points (spans both eras). 1989-90 standings: Lakers 63-19, Pistons 59-23.
- Photos: 822 of 2,915 players with seasons before 2000-01 have an active photo; the rest wait on
  the owner's FH01c Wikidata run.
- Not done: team pages for seasons before 1983-84 (defunct franchises and their logos), the
  Playoffs bracket for 1983-84 to 1999-00 (sequence IDs carry no round), and FH06.

## FH01d — owner-reviewed photos for notable players, 2026-10-22

- After FH01c, 1,911 of 2,915 players with seasons before 2000-01 still had no photo. A
  50-player sample of other free sources found 0 NBA.com photos (47 silhouettes) and 2
  Sports-Reference college photos (120 × 180 black and white); the owner chose a reviewed pass
  for notable players instead.
- `courtlens gather-portrait-candidates` (`services/portrait_review.py`): players with 5,000+
  regular-season points and no photo (109), each with his Wikidata image and category, the free
  lead image of his English Wikipedia article and an exact-name Commons search. 41 players have
  at least one freely licensed face (124 distinct crops after removing duplicates); 68 have none.
  Faces seen in more than one file of the same player are flagged.
- The owner picks on a private review page; `courtlens apply-portrait-review` stores the picks as
  Wikidata-source career photos with the usual credit.
- Owner's verdicts (2026-10-22): 20 photos picked, 21 "none". All 20 stored and served by
  `/players/{id}/portrait` (200). Players with 5,000+ points still without a photo: 89.

## FH05 follow-up — picked players land in a season they played, 2026-10-22

Owner report: picking Michael Jordan beside Jayson Tatum on Compare showed Jordan in 2026-27 ("No Games"). Owner chose the recommended rule: a picked player stays in the season on screen if they played it, else lands in their peak season, else their latest. The season menu under the photo still changes it.

- `history_totals.peak_seasons` / `peak_of`: best regular season with 1,500+ minutes (40+ games before minutes were kept), ranked by BPM when every qualifying season has one, else WS/48, else WS, so one career is ranked by one measure. `/player-seasons` returns it as `peak`.
- `dashboard/lib/landing-season.ts`: one rule for Compare's duel (pick and open slots) and grid (add, replace). Last X Games uses the same helper without peaks: this season if played, else the latest game-log season. Player Twins keeps its own rule (its seasons are the play-by-play range only).
- Search captions add the career span after the scope's team codes: "BOS · 2017-18 – 2026-27", "1984-85 – 2002-03".
- Evidence: live API peaks Jordan 1987-88, Kareem 1971-72 (WS/48), Wilt 1963-64, LeBron 2008-09, Tatum 2022-23. A headless browser on :3100 picked Tatum then Jordan into an empty card: URL `seasonB=1987-88`, slot "Chicago Bulls · Age 25", 35.0 points per game, 82 GP. `tests/unit/test_peak_season.py` (4), `lib/landing-season.test.ts` (4) and two caption tests pass; the dashboard suite passes 644/644 (its 4 unhandled AbortErrors come from `header.test.tsx`, unchanged). Ruff, mypy, tsc and ESLint clean.
- **Revised the same day (owner: the automatic season can feel arbitrary):** the season menu marks the player's best season ("Best"; its chip keeps the tag, with a hover note naming the measure). After a pick moves a player to another season, the menu opens by itself, scrolled to that season, with a pinned line: "Showing the best season by Box Plus/Minus. Pick another:" (or "…the latest season…"). It opens once; clicking away keeps the season. `/player-seasons` also returns `peak_basis` (bpm, ws_per_48 or ws). `Menu` gained an optional controlled `open`/`onOpenChange`. Last X Games shows a one-line note when a pick moved the season. Evidence: headless browser on :3100, Scottie Barnes then Michael Jordan → `seasonB=1987-88`, menu open with that note and 1987-88 marked Best; closed after a click away; chip "1987-88 Best". Dashboard suite 650/650, lint clean; Python peak tests updated (4 pass).

## FH05 follow-up — older team identities, season alignment and logos, 2026-10-22

Owner asked for every team's logo across all seasons and for any season metadata still set up only for 2000-01 on.

- Season alignment: `parse_standings` (`ingestion/bbref_seasons.py`) reads each retained league season page's standings; `scripts/team_season_alignment.py` (offline) writes `src/courtlens/domain/team_seasons.json`: 80 seasons, 1,724 team-seasons (equal to the sealed team-season rows), each with name, conference (none before 1970-71) and division, plus the page URL and SHA-256. `team_identity(team, season)` now returns that season's conference and division. Before this, current franchises carried today's alignment in every season, wrong before 2004-05 (1990-91 Spurs "Southwest", Blazers "Northwest", Hawks "Southeast").
- Identities: 35 new `TEAM_ERAS` (19 earlier names of current franchises, 15 folded teams with `franchise_id` None, and "Los Angeles Clippers" 1984-85 to 2014-15). `FRANCHISE_GAPS` gains every franchise's first season, derived from the standings. A test resolves all 1,724 team-seasons to the standings' name and alignment (LAC after 2015 excepted: the source keeps "Los Angeles"), and checks each franchise is active exactly in the seasons it played.
- Playoff seeding takes the season's conferences and leaves a team with no known conference out (it used to default to "Eastern"); series names use the season's identity.
- Logos (`scripts/team_branding_assets.py`, era artwork now keyed by code): 42 of 48 era identities have a logo (40 Basketball-Reference, Anderson Packers and Indianapolis Olympians from Wikimedia Commons). Detroit Falcons, Pittsburgh Ironmen, Washington Capitols, Indianapolis Jets, Sheboygan Red Skins and Waterloo Hawks have none on either source and show their code. Season logos now span 1946-47 to 2025-26: 943 team-season logos fetched for 1946-47 to 1999-00 (0 missing), merged with the 2000-01 on spans into 181 spans. Era accents without a hand-picked color use the logo's main color (`brand_color`).
- Dashboard: `teamArtwork` / `teamNameAt` handle folded teams; career-table rows, the season-summary line and the header's last team draw the team as it was that season. Season pickers label 1946-47 to 1948-49 "· BAA".
- Header "Last with": the NBA.com index's team disagreed with the player's final season for 1,191 of 2,491 players whose careers ended before 2000-01 (Wilt Chamberlain: Warriors, not the 1972-73 Lakers). `player_bio.final_season_team` uses the final season's team: one team, else the playoff team, else the team of the last game in the published release, else the index team when he played for it that season, else no claim. A 600-player sample of pre-2000 careers: 571 resolved without the index.
- Evidence: Python unit 1,695 passed (1 unrelated date-dependent failure, `test_season_discovery`, which passes under `make test-python`); `make test-python` 2,283 passed; dashboard Vitest 650/650; tsc, ESLint, Stylelint, Ruff, mypy clean. Playwright in a sandbox (3180/4180): 497 passed, 5 failed, none from this change (planner sign-in finds two Email fields; a move tooltip expects older wording; the PC12 directory is removed in the working tree). Live API: 1990-91 teams show the Midwest for the Spurs, Jazz and Rockets; Wilt's page shows "Last with Los Angeles Lakers" and 1960s–70s Warriors, 76ers and Lakers logos.
- Not changed: the header's "Free agent" status for long-retired players comes from the free-agency tracker, a separate source.
- **Second revision (owner: active players should land in the current season, and the menu opened abruptly):** an active player (played in the release's newest season or the one before) lands in their latest season; only retired players land in their best season. A current-season landing opens nothing; a best season, or an active player's latest season that isn't this one, still opens the menu with its note. The menu now opens 420 ms after the new card mounts (immediately under reduced motion), already scrolled to the season (layout effect, no jump), growing down from its chip. Evidence: browser on :3100, Anthony Davis vs Michael Jordan 1987-88, replace Jordan with De'Aaron Fox → no `seasonB` (2026-27, San Antonio Spurs), menu closed; replace with Jordan → `seasonB=1987-88`, menu opened with its note. Landing and picker tests updated (13 pass); dashboard suite and lint clean.
- **Third revision (owner approved, 2026-10-22):** the landing order is now (1) the other player's season when the new player played it, so two players compare in the same year; (2) the page season; (3) an active player's latest season; (4) a retired player's best season; (5) their latest. "Active" comes from the free-agency tracker's placement (on an NBA roster today); without roster evidence, played in the newest season or the one before. `/player-seasons` returns `active`. In the grid, "the other player's season" is the season the other columns share, if they share one.
- Long-retired players are no longer "Free agent": `free_agency.current_placements` now places a player on no roster with no move as a free agent only if they have games this season or last (`played_lately`); otherwise nothing is placed, and the header reads "Last with …" from their final season. Wilt: no status, last team LAL; Chris Paul (played 2025-26, on no roster) stays a free agent.
- Evidence: browser on :3100: Jordan 1987-88, pick Magic → `seasonB=1987-88`, no menu; Anthony Davis vs Jordan, replace with Kareem → `seasonB=1971-72` (Bucks), menu open with the best-season note; replace with De'Aaron Fox → 2026-27 (Spurs), no menu. Tests: landing 10, picker 5, free agency (new long-retired case) and related suites 49 pass; dashboard suite, lint, tsc, Ruff and mypy clean.

## FH05 follow-up — team pages before 1983-84, 2026-10-22

- `scripts/team_season_records.py` (offline) writes `src/courtlens/domain/team_season_records.json` from the retained league pages: 80 seasons, 1,724 team-seasons, wins and losses (standings) plus margin, SOS, SRS, ORtg, DRtg, pace, arena and attendance (advanced team table). Its 1,223 records from 1983-84 to 2025-26 equal CourtLens's own game logs exactly. The 1954-55 Baltimore Bullets (folded mid-season) have no standings record: null.
- `services/history_teams.py` serves seasons served as totals to `/teams/six-factors`, `/teams/{id}`, `/teams/{id}/four-factors`, `/schedule` and `/peers`: the six-factor method on season totals from 1973-74 (both boxes complete); before that, the source's rating estimates with every possession factor unknown. Last ten, streak, close games, trend, SOS and home/away are null (schema fields made optional), never 0.
- Dashboard: Teams list and Team Compare offer every season (BAA labels); East/West read the Eastern/Western Divisions before 1970-71; window and venue controls hide for totals seasons with a note; the team page seeds within the division, hides the trend, and its game log says logs start in 1983-84; Team Compare hides the series and explains in Game History; folded teams join the team picker; Stats/team tables sort by points before DARKO's first season (2000-01). Search finds 48 earlier team names (Syracuse Nationals, Chicago Stags, Seattle SuperSonics), each opening its last season. Methodology documents all of it.
- Evidence: browser on :3100: 1965-66 Teams (Celtics 54-26, estimated ratings, factors unknown), 1979-80 (full six factors), Celtics 1965-66 page (2nd in the Eastern Division, players by points, depth chart, similar teams), Chicago Stags 1946-47, Team Compare Celtics vs Lakers 1965-66; 1990-91 series unchanged (1-1). New tests: `test_history_teams.py` (5), team records parser, dashboard standings/folded-team tests.
- Search entries merge eras that share a name and franchise (the Sonics' 2004-05 realignment split): one "Seattle SuperSonics, 1967-68 to 2007-08"; an era named like its current franchise (the 1988-2002 Charlotte Hornets) is left to the franchise's own entry. `test_entity_lookup.py` now counts the 30 franchises separately from earlier names (20 pass).
