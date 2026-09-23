# Historical archive source spike

Status: **M1 accepted with quarantined player-game gaps**, 2026-09-20 local / 2026-09-21 UTC. This is a real-data validation report for the pinned candidate, not a database import or published snapshot. Implementation status is tracked in [implementation progress](../implementation-progress.md).

## Retrieval and attribution

Source: [NocturneBear/NBA-Data-2010-2024](https://github.com/NocturneBear/NBA-Data-2010-2024), revision `a5f108b5b1f08074d78b9e8e901926a9ce4c06c5`. The repository declares MIT licensing (Vitalii Korolyk, 2024). Its extraction endpoints, code and upstream permission chain are not documented in the source material reviewed. Attribution is to this archive; NBA-origin provenance and public redistribution rights are **not independently established**. No credential or paid access was used. The four raw files and machine report are kept in ignored `data/raw/nocturnebear-a5f108b5/`, outside Git.

The retrieval manifest records URLs, revision, UTC retrieval time, byte counts and SHA-256. Its local SHA-256 is `00c5b380164dca0a9aa92abbb829cf614d73d624bfe49fac656942da16e6fc7b`. Downloads use a 30-second socket timeout, five-minute file deadline, 30 MB safety limit per file, declared byte count, pinned SHA-256, temporary files and atomic install. The same command accepts local files for offline rebuilds. A failed/partial file cannot be installed.

| Pinned file | Bytes | SHA-256 |
| --- | ---: | --- |
| `regular_season_box_scores_2010_2024_part_1.csv` | 22,567,190 | `ca9636d08c577e3d752f69e32f90b173f4c3374c15f4dc8494b655049fdfc557` |
| `regular_season_box_scores_2010_2024_part_2.csv` | 22,717,782 | `5643af8a9f15ce3540dced759375ca79e77c71644e23270136f23b7a57fc182d` |
| `regular_season_box_scores_2010_2024_part_3.csv` | 22,493,295 | `65a01fee3df865a272e578cf4b365dce7dbc62eef2ce6f15f0844cf6694ef375` |
| `regular_season_totals_2010_2024.csv` | 9,130,719 | `b63367be8c58155f978c841bb966f5b19e334cec833a37ddae2915a29cd352d9` |

All three player parts were streamed; each part contains rows from many seasons, so no part was treated as a chronological partition. The selected seasons are **2021-22, 2022-23, 2023-24**. Source season labels, not calendar years, define membership. Player IDs and team IDs remain source-namespaced strings; eight-digit player-file game IDs were validated and zero-padded to the ten-character team-file IDs. All selected game IDs have regular-season prefix `002`.

## Schema, missingness and admission

The player files have identity, date, matchup, comment, minutes and counting-stat fields. Team totals provide one row per team game with points, matchup and date. Source team dates are timestamp-shaped at midnight, but **no verified tipoff time exists**; they are treated as date-only. Required player scoring/count fields and selected team fields had zero blank values. Optional player fields had blanks: `comment` 78,334; `position` 58,348; `jerseyNum` 95,248; `minutes` 16,914. Blank minutes coincide with reported nonappearances, rather than numeric zero. The 14 `0:00` rows without a status remain `unknown`, not DNP. Appearance classification from valid player rows is 78,136 appeared, 16,914 reported nonappearance, 14 unknown.

| Season | Raw player rows | Team rows | Paired games | Strict admitted games | Quarantined games |
| --- | ---: | ---: | ---: | ---: | ---: |
| 2021-22 | 31,321 | 2,460 | 1,230 | 1,171 | 59 |
| 2022-23 | 31,542 | 2,460 | 1,230 | 1,176 | 54 |
| 2023-24 | 32,385 | 2,460 | 1,230 | 1,164 | 66 |
| **Total** | **95,248** | **7,380** | **3,690** | **3,511** | **179** |

The selected player rows had no duplicate player/game keys, identical or conflicting. The selected team rows had no duplicate team/game keys. Every game has exactly two matching team sides; each of the 30 teams has 82 team rows per season. These totals match the NBA's published 82-game regular-season schedules for [2021-22](https://www.nba.com/news/nba-releases-schedule-2021-22-season), [2022-23](https://www.nba.com/news/nba-unveils-2022-23-regular-season-schedule), and [2023-24](https://www.nba.com/news/2023-24-nba-regular-season-schedule). The 2023 Cup championship is [excluded from regular-season statistics](https://www.nba.com/news/2023-in-season-tournament-debut-official-release); the observed 82 games per team and `002` IDs are consistent with its exclusion. This check compares counts and dates, not every source game ID against an independent schedule feed.

An independent NBA result spot-check also matches the archive's date, teams and score in each season: [BKN at MIL, 104–127 on 2021-10-19](https://www.nba.com/game/0022100001), [PHI at BOS, 117–126 on 2022-10-18](https://www.nba.com/game/0022200001), and [CLE at IND, 116–121 on 2023-11-03](https://www.nba.com/game/cle-vs-ind-0022300001/box-score). These three results do not replace full player/team reconciliation.

Exactly 184 player rows have malformed minute seconds of `:60` (for example `26:60` at `part_1.csv:6174`). The agreed parser rule permits `m:ss` with seconds 0–59; these rows are quarantined, not silently corrected. They touch 179 games. All 7,380 raw team scores equal the sum of raw player points for rows carrying minutes, including those malformed-minute rows. After excluding the 179 games, both team sides in every one of the 3,511 admitted games reconcile: **7,022 of 7,022** admitted team sides. The 184 malformed rows and 179 affected games are therefore a known player-minute quality loss, not evidence of absent team games. The strict admitted share is 95.1% of scheduled games; downstream player analytics must carry the exclusions and coverage counts.

Among rows reaching the remaining validation checks, none failed the made/attempted constraints, point formula, date/season check, game ID check, or team/opponent pairing. The 184 malformed-minute rows stop at minute parsing and are retained in the quarantine count. No selected source correction or conflicting duplicate was observed; [fixture tests](../../tests/unit/test_archive_spike.py) exercise conflicting rows and partial acquisition. Real DNP/comment rows do exist, such as Lou Williams at `part_1.csv:4686` on 2022-01-14. A true zero-minute row is Seth Curry at `part_1.csv:92375` on 2023-11-22, with no comment; it remains unknown. Missing optional count values are preserved as null by the parser and explicit zero as zero in fixtures; the selected archive had no blank required count cells.

## Joined-game checks

The machine report records 30 deterministic admitted joined games, ten from each season, with game IDs, dates, teams, scores and player-row counts. The first is MIL–BKN on 2021-10-19 (`0022100001`, 127–104); the last is BOS–BKN on 2023-11-10 (`0022300010`, 121–107). This sample is in addition to the full 3,690-game reconciliation. The report records 184 admitted overtime games; one is `0022100005`. A same-season two-team player example is A.J. Lawson in 2022-23: MIN on 2022-11-16 (`part_2.csv:112124`, game `0022200212`) and DAL on 2022-12-29 (`part_1.csv:98009`, game `0022200528`). That checks historical team membership by player/game rather than a current-team lookup.

The normalized row multiset hash is `47cfec8ff09818c246e6a997df5ff41b1a811accf1fb7e0561db714a095ec049`. Two complete parses of the same four files produced byte-identical `source-spike.json` reports (`cmp` passed); the report SHA-256 is `38ce848b1d5330ad07db6bb71f88146a630af151a770c396f8d41b94a41699b2`. The hash covers selected typed rows before game admission, with season, source IDs, date, team, player, minutes, appearance and player/team counts. It was refreshed during M2 when verified integer-valued team totals such as `TOV=16.0` were added to the normalized contract; admission counts and limitations did not change. Database import idempotency and correction/observation history are recorded in [implementation progress](../implementation-progress.md).

## Reproduce and limits

```sh
.venv/bin/python scripts/historical_source_spike.py acquire
.venv/bin/python scripts/historical_source_spike.py analyze
# Or acquire from a directory holding the exact four files:
.venv/bin/python scripts/historical_source_spike.py acquire --local-source /path/to/archive
```

The JSON report stays in ignored local storage; this document captures the key stable results. The archive is a retrospective revised-history source. Its observation time is the retrieval time, not the game date. It cannot establish what the schedule, roster, injuries or source values were known to be before any historical game. No live freshness or forward forecasting claim follows from this validation. The 179 excluded player games are a coverage limitation for profiles and evaluation. The product can proceed on the three seasons using explicit game/metric coverage, while M2 must retain raw rows and quarantine reasons rather than manufacture complete facts.
