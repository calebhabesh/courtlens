# B26 expected-shot source readiness

Observed **2026-10-03, 11:56–11:58 UTC**. This is bounded feasibility research for the [frozen expected-shot design](../../evaluation/research/protocols/courtload-expected-shot-v1.json), not source admission or a fitted experiment. Only ordinary unauthenticated metadata/documentation requests and 32-KiB HTTP range samples were read. No complete season was downloaded; samples remained in memory. No database, registration, retained dataset, publication pointer or model changed. Hashes below document observations; unretained sample bytes are not sealed admission evidence.

**Recommendation:** expected shots has concrete accessible inputs, but the existing SportsDataverse shot parser is insufficient for B26. Investigate the identity-preserving `shufinskiy/nba_data` shot-chart archive as a standalone input, or derive shots directly from admitted PBP while retaining event IDs. Neither route clears season reconciliation, valid distance, reuse or final-exposure gates.

## SportsDataverse observations

The [shot release API](https://api.github.com/repos/sportsdataverse/sportsdataverse-data/releases/tags/nba_stats_shots) returned the following metadata at `2026-10-03T11:56:15.970370+00:00`. Response SHA-256: `99382ae6ac62a0ecc85e44b925eca79c92942e17ae289d39e899ff9acb3e4256`. These are publisher-declared **full asset** digests, independently unverified in this bounded check.

| Ending year | CSV bytes | Asset updated UTC | Publisher SHA-256 |
| --- | ---: | --- | --- |
| 2024 | 36,100,343 | 2026-09-30T23:34:48Z | `e4f5872f78a7d5a383e60ed9c72df1266c0895b7cba404fca93e87974455a5d3` |
| 2025 | 36,489,000 | 2026-10-01T00:30:35Z | `c2545328d55330ff091bfe8910fad42211261cb606ed9a7c9ebf17555f68f265` |
| 2026 | 36,398,720 | 2026-10-01T00:32:09Z | `ef813b6bdaf4e1f157588561515e85811d00e14e4fe5d7875cb6f51ae5ab5563` |

For each `https://github.com/sportsdataverse/sportsdataverse-data/releases/download/nba_stats_shots/shots_{year}.csv`, `Range: bytes=0-32767` returned **206**, with the exact requested range and matching full length. Each observation read 32,768 bytes, discarded the incomplete trailing CSV line, and yielded:

| Ending year | Observation UTC | Complete sampled rows | Prefix SHA-256 |
| --- | --- | ---: | --- |
| 2024 | 11:56:31.328855 | 207 | `5e909f0dafe73fdd25807004a4b3b5b1a430fdcc802ba70b437565f13163e14f` |
| 2025 | 11:56:31.551854 | 208 | `0160282c61b2d3d0de794db6981ee391d6de5905855c8b8df3300bfc1e08d2de` |
| 2026 | 11:56:31.837657 | 209 | `c8d5c240b91ffec4031631e2765e136bb04639e3548b9fbd6427019f2d3db291` |

Actual headers agree across these three samples:

```text
game_id,season,season_type_id,period,clock,team_id,team_tricode,person_id,player_name,action_type,sub_type,shot_result,shot_value,shot_distance,x_legacy,y_legacy,description,score_home,score_away
```

The [source schema](https://raw.githubusercontent.com/sportsdataverse/hoopR-nba-stats-data/main/docs/datasets/shots.md) defines NBA game/player/team IDs, ending-year seasons, ISO-duration clocks, 2/3 field-goal values, distance in feet, and legacy coordinates in tenths of feet. The basket is the origin; positive y extends toward half court, negative y behind the basket. Game-ID phase digit `2` means regular season. These definitions support `/10` coordinate conversion but do not independently validate every row's geometry or orientation.

The [first-party builder](https://github.com/sportsdataverse/hoopR-nba-stats-data/blob/471b113d880a89f8b102f245ad8c4c0642aa617a/python/nba_data_build/reshape/build.py) filters PBP to `is_field_goal == 1` then projects `_SHOT_COLUMNS`. That projection **drops action_number and action_id**. It also drops game dates; those need separately verified game joins. This explains the observed absence of an NBA event key without guessing undocumented source behavior.

## Existing parser gaps

[parse_shots_stream](../../src/courtload/domain/rich_sources.py) consumes the actual field names and applies the documented coordinate conversion. Running the 2026 prefix through it produced 209 normalized rows, zero rejected rows and 209 coordinate-present rows. This establishes basic parsing only.

The same raw prefix contained **28 of 209 rows with shot_distance=0**. Across sampled rows, maximum absolute difference between declared distance and coordinate radius was **23.475 feet**. This is a data-quality diagnostic, not an evaluation metric. A zero can be legitimate at the rim, but these rows cannot all be assumed valid. The parser defaults absent distance to zero, absent result to Missed and absent value to two; it does not enforce required finite values, strict known make flags, court bounds, distance consistency or event uniqueness. Its payload hash omits several source fields and is not a provider event ID. Its reconciliation helper checks optional positive player counts; it does not establish complete two-team FGA/FGM/3PA/3PM coverage, zero-count agreement, unexpected players or complete seasons.

The [PBP release](https://api.github.com/repos/sportsdataverse/sportsdataverse-data/releases/tags/nba_stats_pbp) has `nba_play_by_play_2026.csv.gz` (23,889,765 bytes), updated `2026-08-13T03:32:58Z`, declared digest `544296a199041c5c62096ae549a3372a82d74297ef3248d48b8e1bfb15488dcb`. Its 32-KiB compressed prefix answered 206 at `11:57:09.177385 UTC`, prefix hash `e8868b924031c8504f13186ce8a2491acba4261e2af4ecadaaafe2097f62197b`. Bounded decompression to 200,000 bytes showed `action_number`, `action_id`, `is_field_goal`, game/player/team IDs and the shot geometry. Its first game was preseason `0012500001`; it is not evidence of regular-season completeness. This older PBP release must not be silently treated as identical to October shots. A route using PBP must retain its exact event grain and reconcile its own rows to boxes, or prove an exact unambiguous mapping to the later shot release.

## Identity-preserving alternative

The archive's [manifest](https://raw.githubusercontent.com/shufinskiy/nba_data/main/list_data.txt) names `shotdetail_2023`, `shotdetail_2024`, `shotdetail_2025`; its [README](https://raw.githubusercontent.com/shufinskiy/nba_data/main/README.md) explicitly uses **starting years**. Thus these correspond to SportsDataverse ending years 2024/2025/2026. The [field description](https://raw.githubusercontent.com/shufinskiy/nba_data/main/description_fields.md) includes `GAME_EVENT_ID` as the within-game event sequence, and direct NBA player/team IDs.

Actual 32-KiB prefixes of `https://raw.githubusercontent.com/shufinskiy/nba_data/main/datasets/shotdetail_{start_year}.tar.xz` answered 206. Decompression was capped at 100,000 bytes; the first 512 bytes were the observed tar member header, and only complete CSV lines after it were inspected. This is not a production tar extractor or completeness test.

| Starting year | Full compressed bytes from Content-Range | Observation UTC | Prefix SHA-256 |
| --- | ---: | --- | --- |
| 2023 | 2,812,692 | 11:58:18.969678 | `79b75cf0277f6ffe07d07796af3c1cca071f5d4bccdb41a79f46b59940f625c8` |
| 2024 | 2,832,144 | 11:58:19.270214 | `c344f84fb4dcdc79c177578c07a5c0020553700dea8350ff475a4955e9f5bee7` |
| 2025 | 2,825,192 | 11:58:19.290095 | `9687d2007e48d52bf70d8d6adb44451bc3dc1dfd54411f10d53242ae29765b50` |

All sampled headers contain `GAME_ID,GAME_EVENT_ID,PLAYER_ID,TEAM_ID,PERIOD,MINUTES_REMAINING,SECONDS_REMAINING,EVENT_TYPE,ACTION_TYPE,SHOT_TYPE,SHOT_DISTANCE,LOC_X,LOC_Y,SHOT_ATTEMPTED_FLAG,SHOT_MADE_FLAG,GAME_DATE` plus names, shot-zone fields and home/visitor tricodes. First 2025 row had `GAME_ID=22500014`, `GAME_EVENT_ID=7`, `GAME_DATE=20260119`, `SHOT_TYPE=3PT Field Goal`, distance 26, coordinates 175/202. An explicit NBA namespace transform can restore `0022500014`; this is not a fuzzy identity match. A standalone source adapter can preserve `(NBA game ID, GAME_EVENT_ID)` without guessing an event from player name or clock. Full key uniqueness, phase, distance/orientation policy and chronology still require admission. Current `parse_shots_stream` does not accept this uppercase schema.

## Boxes, access and reuse

SportsDataverse documents [team](https://raw.githubusercontent.com/sportsdataverse/hoopR-nba-stats-data/main/docs/datasets/team_boxscores.md) and [player](https://raw.githubusercontent.com/sportsdataverse/hoopR-nba-stats-data/main/docs/datasets/player_boxscores.md) traditional boxes in the same NBA ID namespace, including FGA/FGM and 3PA/3PM. They are independently published, not implicitly joined to the shot sample. Reported whole-source game coverage mixes phases and does not prove complete regular seasons. At this check, 2026 team/player CSV metadata showed October 1 updates; exact retained box bytes must be pinned separately.

SportsDataverse's [DESCRIPTION](https://raw.githubusercontent.com/sportsdataverse/sportsdataverse-data/main/DESCRIPTION) declares data CC BY 4.0; its [LICENSE](https://raw.githubusercontent.com/sportsdataverse/sportsdataverse-data/main/LICENSE) is MIT for software. [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) requires attribution, a license link and changes disclosure. The alternative [repository license](https://github.com/shufinskiy/nba_data/blob/main/LICENSE) declares Apache 2.0. Retain applicable notices and distinguish code/data scope. These labels alone do not resolve upstream NBA reuse. [NBA terms](https://www.nba.com/termsofuse) distinguish personal noncommercial use from public/commercial reuse. No broader entitlement was established here.

Observed repository heads: SportsDataverse data `d15f7693a2d4d2cd9570e619c9d6df4fdea87c3c`; its build/docs repository `471b113d880a89f8b102f245ad8c4c0642aa617a`; alternative archive `e829d4678be1e075f99e5d41a1c5f97089be446b`. Future acquisition should use immutable revisions/content addresses rather than assuming `main` and mutable release URLs remain unchanged.

## Concrete next admission work

1. Select one event-preserving source and document intended local research use, applicable license evidence, attribution and unresolved public redistribution. Do not mark reuse admitted from a filename or HTTP status.
2. Retain a bounded complete-game source fixture with exact bytes/hash and timestamp; implement a strict adapter preserving source event IDs, all required outcomes and geometry, with explicit source/transform versions. Reject missing or inconsistent required values rather than supplying defaults.
3. Reconcile **all observed attempts** to complete final player/team boxes before coordinate exclusions. Prove exact FGA/FGM/3PA/3PM, identity, phase and game status; separately record location/distance exclusions. Quarantine entire games when event identity or totals are unresolved.
4. Expand only after the fixture passes. Inventory all expected regular-season games over three complete seasons, retain every exclusion and verify full source digests. Sample prefixes cannot establish this gate.
5. Complete the independent latest-season exposure audit and exact chronological row/game manifests. Prior points final inspection may prevent an unexposed historical final under v1. If so, retain v1 unchanged and preregister an honest future horizon or retrospective-only amendment before comparison; never pick an older final merely to evade exposure.

**Status: source_blocked.** Feasible source candidates are now verified at the schema/access level; complete admitted inputs and sealed experiment bindings remain absent. No fitting or analytical acceptance claim follows from this note.
