# CourtLens full NBA history: every season from 1946-47

Prepared 2026-10-21. **The owner confirmed the decisions below on 2026-10-21. Blocks FH01–FH06 are
pending until the [progress log](full-history-progress.md) records measured evidence.** A plan is
not runtime evidence.

Today CourtLens covers 2000-01 to 2025-26, with game rows from sportsdataverse/hoopR. This handoff
adds every earlier season, alongside the [Databallr alignment](databallr-alignment-plan.md). It
keeps every analytical, identity and data contract. Sources follow
[source policy v3](design/source-policy-v3.md): any free source, cost is the only exclusion.

Still in force: temporal discipline, append-only hashed acquisitions, and unknown is not zero. A
stat the source does not record for a season (blocks before 1973-74, minutes before 1951-52) is
null and shown as unknown, never as 0.

## Locked decisions (owner, 2026-10-21)

| # | Decision |
| --- | --- |
| H1 Depth | Season totals for every season from 1946-47 (BAA 1946-47 to 1948-49, then NBA). Complete game logs from 1983-84 to 1999-00. |
| H2 Pages | Old seasons appear where they fit: Stats, Showcase, Teams, career tables, Compare. Game- and play-by-play-based pages (Last X Games, WOWY, RAPM, Stat Line Shift) say when their data starts. Showcase sorts seasons before DARKO DPM coverage by an available stat (WS or BPM). |
| H3 Source | Basketball-Reference: league season pages and player game-log pages. |
| H4 robots.txt | Basketball-Reference's robots.txt disallows `*/gamelog/` for every crawler (checked 2026-10-21). Policy v3 records a disallow and does not refuse. The owner was shown the robots-allowed alternative (box-score pages, about 19,000 requests) and chose the game-log pages. |
| H5 Operation | The owner runs the long crawl in their own terminal pane, never from a Claude session. |
| H6 Breadth | Older players get everything current players have, except what cannot exist for their era (owner, 2026-10-21). See the inventory below. |

## Player information inventory (H6)

What a current player has, and how an older player gets it.

| Information | Current players | Older players |
| --- | --- | --- |
| NBA.com index bio: height, weight, position, draft, college, country | `mart_player_bio` | Already there: the index lists 5,242 players back to 1946-47. Birth date is missing for all 2,854 players without roster seasons. |
| Birth date | NBA.com bio | From the Basketball-Reference profile (FH01b). Serving falls back to it, labelled with its source (FH04). |
| Profile: honours, season awards, All-Star seasons, transactions, game highs, nicknames, birthplace, high school, debut, salary history | Basketball-Reference profile | FH01b. Salary history only where the page has it. |
| Headshot | NBA.com sharp photo first, Basketball-Reference career photo for silhouettes | Basketball-Reference career photo (FH01b). NBA.com "latest" photos need CourtLens identity rows first, which only 345 older players have, so they follow FH02. Season-matched photos cannot exist before 2015-16. |
| Season stats: totals, per game, advanced, per 100 possessions, team context | Warehouse | FH01 league pages, then FH02 |
| Game logs and per-game +/- | hoopR games, stints | FH01 game logs (1983-84 to 1999-00), then FH03. +/- from 1996-97. |
| Play-by-play metrics: RAPM, on/off, six factors, WOWY, stint box, shot charts | IM01–IM06, SB01 | 1996-97 to 1999-00 only, from the same public archive (FH06) |
| DARKO DPM, contracts and cap, combine measurements, tracking, hustle, play types, injuries | Various | Not applicable: these don't exist for those seasons. Showcase uses WS or BPM (H2). |
| Team logos by season, defunct franchises | NBA.com team assets | Basketball-Reference team-season logos from 1946-47 (Wikipedia for two folded teams); six folded teams have no free logo (FH05 team identities, 2026-10-22). |

## Source facts (checked 2026-10-21)

- League pages: `/leagues/NBA_<end year>.html` (team stats, standings), `_totals`, `_per_game`,
  `_advanced`, and `_per_poss` from 1973-74. The BAA seasons use `/leagues/BAA_<year>_…`. The
  totals page holds both `totals_stats` and `totals_stats_post` (playoffs), and each player cell
  carries the player ID in `data-append-csv`. 1984-85 lists 320 regular-season players.
- Player game logs: `/players/<x>/<id>/gamelog/<end year>`. One page has the regular season
  (`player_game_log_reg`) and playoffs (`player_game_log_post`). About 400 KB each.
- Box scores are complete only from 1983-84. Earlier ones are mostly points and FG/FT only.
  Minutes per game are nearly complete from 1976-77, game-level +/- from 1996-97.
- robots.txt: `Crawl-delay: 3`. Pace stays at 4 s a page (the source's published limit is 20 a
  minute).
- Python's `urllib.robotparser` ignores `*` wildcards, so receipts record `robots_disallowed:
  false` for game-log pages even though the `*/gamelog/` rule covers them. FH01 receipts carry
  this known false negative; this plan is the record of the disallow.

## Blocks

### FH01 — Raw crawl (built 2026-10-21)

`courtlens acquire-bbref-history` (`services/bbref_history.py`, `ingestion/bbref_history.py`)
reuses `ScheduledFetcher` and `retain`. It retains raw pages only and parses nothing into serving
tables.

- Phase `league`: 373 pages for 1946-47 to 2025-26, about 25 minutes.
- Phase `gamelogs`: reads each retained 1983-84 to 1999-00 totals page for that season's players
  (regular season and playoffs), then fetches each game log. About 7,500 pages, roughly 8–9 hours.
- Resumable: a URL with a successful or 404 receipt is never fetched again. A 403/429 ends the
  run; rerun later. Every page commits as it lands.
- Run from the owner's pane: `scripts/crawl-bbref-history.sh --detach` (nohup), or without
  `--detach` inside tmux. Log: `data/logs/bbref-history.log` (one JSON line per page). The run
  summary goes to `data/logs/bbref-history-<UTC time>.json`.
- Disk: about 0.3 GB of league pages and about 3 GB of game logs in `data/raw/bbref`. Check free
  space first: the disk had 25 GB free on 2026-10-21.

Done when the progress log records page counts by phase and season, 404s, and refusals, from the
receipts.

### FH01b — Older players' profiles and headshots (built 2026-10-21)

`courtlens acquire-bbref-bios --history` extends the existing profile crawl to every player in the
NBA.com index, after the rostered players. `acquire-bbref-portraits` now also targets profiled
players without CourtLens game rows. `scripts/crawl-bbref-old-players.sh --detach` waits for a
running history crawl, then runs both. Log: `data/logs/bbref-old-players.log`.

Matching, measured offline on 2026-10-21 against the 26 retained index pages:

- Of 2,854 index players without roster seasons, 2,485 match with the existing rules (name and
  birth date, or a unique name with overlapping seasons). 116 of the rest are 2025-26 signees with
  no games yet.
- NBA.com lists many early players by legal name ("Alvin Attles", "Nate Archibald") where
  Basketball-Reference uses the playing name. A new provisional rule proposes a match when only
  one index player has the same surname and exactly the same first and last season (228
  candidates). The profile is kept only if the fetched page confirms it: the NBA.com surname is in
  the page's legal name, and the first name matches a given name, the playing name or a nickname
  (or shares its first three letters). Its `match_basis` is
  `surname+exact_seasons+legal_name`. An unconfirmed page is kept raw, counted in the summary and
  re-read, not refetched, on the next run.
- Cost: about 2,600 profile pages (about 1.7 GB, about 3 hours) and up to the same number of
  headshots (about 11 KB each).

### FH02 — Parse and seal season totals

A versioned parser turns the retained league pages into an append-only dataset with content
hashes: per-player and per-team season rows, regular season and playoffs separate, traded players'
team rows plus `TOT`. Every absent stat stays null. Match players to CourtLens IDs (NBA person
IDs) by Basketball-Reference ID through the existing identity map
(`services/bref_identity.py`), then by name and seasons. An unmatched pre-2000 player keeps the
Basketball-Reference ID as a namespaced identity; never guess.

### FH03 — Parse and seal 1983-84 to 1999-00 game logs

Game rows per player-game with date, team, opponent, home or away, started, and the box score.
Reconcile each player-season with that season's totals; a mismatch is recorded, not repaired
silently. DNP and inactive rows are absent games, not zeros.

### FH04 — Warehouse and serving

New staging and marts for the historical seasons beside the current ones, with a per-season
coverage map (which stats exist from which year) that the API serves.

Also serve the Basketball-Reference birth date (and the age it gives) where NBA.com has none,
labelled with its source.

### FH06 — Play-by-play metrics for 1996-97 to 1999-00

Extend IM01–IM06 and SB01 to the four seasons before 2000-01. First check which archive families
(`nbastatsv3`, `shotdetail`, `pbpstats`) exist for those seasons. Same repair rules, coverage
reporting and owner review.

### FH05 — Pages

Apply H2: season selectors reach back to 1946-47 where the page is season-based. Game-based pages
say when their data starts. Showcase uses WS or BPM where DPM is absent. Owner review per page,
following the alignment workflow.
