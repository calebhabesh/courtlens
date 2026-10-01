# Fresh-data, preseason, portraits and AI source findings

Checked 2026-10-01 for the [workbench plan](../workbench-implementation-plan.md). This is a bounded source investigation and code audit, not an end-to-end ingestion benchmark. Sampled downloads were checked for fields/coverage; full CourtLoad normalization, reconciliation and in-season reliability remain implementation gates.

## Preferred recent data

SportsDataverse's NBA Stats player-box assets downloaded without credentials. Files use season **ending** years and contain NBA identities and traditional statistics. Inspected release metadata recorded October 1 updates. Release assets can be replaced; acquire and hash each observed version locally. [Player release](https://github.com/sportsdataverse/sportsdataverse-data/releases/tag/nba_stats_player_boxscores)

| Downloaded CSV | Season | Total rows | Distinct players | Distinct regular-season games |
| --- | --- | ---: | ---: | ---: |
| `player_boxscores_2025.csv` | 2024–25 | 35,114 | 577 | 1,230 |
| `player_boxscores_2026.csv` | 2025–26 | 34,786 | 591 | 1,230 |

These are direct inspection counts, not proof of complete valid player coverage. Both contain other phases. A 1,000-row player sample included `m:ss` minutes, 145 blank-minute rows and nonappearance comments. Team minutes such as `240:00` sum player time. Preserve originals, unknowns and comments. [Sampled players](https://github.com/sportsdataverse/sportsdataverse-data/releases/download/nba_stats_player_boxscores/player_boxscores_2026.csv), [sampled teams](https://github.com/sportsdataverse/sportsdataverse-data/releases/download/nba_stats_team_boxscores/team_boxscores_2026.csv)

Acquisition patterns:

```text
https://github.com/sportsdataverse/sportsdataverse-data/releases/download/nba_stats_player_boxscores/player_boxscores_<ending-year>.csv
https://github.com/sportsdataverse/sportsdataverse-data/releases/download/nba_stats_team_boxscores/team_boxscores_<ending-year>.csv
https://github.com/sportsdataverse/sportsdataverse-data/releases/download/nba_stats_schedules/nba_schedule_<ending-year>.csv.gz
```

The producer schedules 07:00 UTC daily builds during October 18–July 12. Raw capture is separate; a build timestamp alone does not establish fresh game coverage. Check actual asset/outcome changes. [Producer workflow](https://github.com/sportsdataverse/hoopR-nba-stats-data/blob/main/.github/workflows/daily_nba_stats.yml)

The misleadingly named `nba_stats_player_game_logs` recent assets contained team rows without player identity. The verified input is `player_boxscores`. Validate actual schema/grain rather than relying on filenames.

## Current schedule, roster and preseason capability

Processed NBA Stats schedules stopped at ending-year 2026. A raw 2027 NBA schedule downloaded successfully, declaring 2026–27 and containing 1,274 scheduled entries: 67 preseason, 1,206 regular-season and one Cup-final placeholder. Rows supplied NBA IDs, UTC tipoff, status and annotations. Zero scores were placeholders. This is the observed listed schedule, not a complete eventual slate. [Raw schedule](https://raw.githubusercontent.com/sportsdataverse/hoopR-nba-stats-raw/main/nba_stats/json/scheduleleaguev2/2027.json), [schedule schema](https://github.com/sportsdataverse/hoopR-nba-stats-data/blob/main/docs/datasets/schedule_master.md)

The league lists October 20, 2026 as regular-season opening day. [NBA announcement](https://www.nba.com/news/2026-27-nba-regular-season-schedule)

Inspected roster assets stopped at 2026 and were last dated August 13; a guessed raw 2027 path returned 404. Sampled roster `season_type` values appeared to be team IDs, so that field cannot establish phase. Current membership remains unverified; other sources may exist. [Roster release](https://github.com/sportsdataverse/sportsdataverse-data/releases/tag/nba_stats_rosters), [roster description](https://github.com/sportsdataverse/hoopR-nba-stats-data/blob/main/docs/datasets/rosters.md)

Inspected recent player files contained no preseason outcomes. A schedule does not establish statistical coverage. Validate an optional preseason adapter independently.

SportsDataverse also supplies ESPN player/team boxes and schedules. A sampled player row included core counts, appearance flags and a portrait URL. A 2027 schedule had 1,206 scheduled regular-season entries. ESPN IDs require an audited NBA crosswalk. Preseason outcome coverage was not established. [ESPN players](https://github.com/sportsdataverse/sportsdataverse-data/releases/tag/espn_nba_player_boxscores), [ESPN schedules](https://github.com/sportsdataverse/sportsdataverse-data/releases/tag/espn_nba_schedules), [workflow](https://github.com/sportsdataverse/hoopR-nba-data/blob/main/.github/workflows/daily_nba.yml)

SportsDataverse labels data CC BY 4.0 and software MIT. Preserve attribution and upstream provenance; labeling does not independently resolve every upstream right. Keep bulk acquisitions outside Git. [Repository notices](https://github.com/sportsdataverse/sportsdataverse-data)

## Other sources

Three ordinary bounded NBA CDN requests returned HTTP 403 here; a direct Stats request timed out. No bypass or repeated probing was attempted. These are local request failures, not universal availability findings. Maintainers describe NBA endpoints as unofficial integration contracts. [nba_api notes](https://github.com/swar/nba_api#endpoints)

BoxScore Lab supplies recent team outcomes and player **season totals**, not the required player-game logs. It remains a reconciliation candidate. [Downloads](https://www.boxscorelab.com/downloads/)

The inspected `basketball-data-index` tracked files did not include advertised bulk game datasets. BALLDONTLIE's free tier excludes player-game statistics. Neither currently replaces the verified player source. [Repository](https://github.com/nickth3man/basketball-data-index), [entitlements](https://docs.balldontlie.io/#account-tiers)

## Preseason evidence

Original analysis using NBA.com/Stats data beginning in 2007–08 reported preseason/regular-season correlations of 0.30 for team win percentage and 0.85 for three-point attempt rate. It did not establish incremental held-out player forecast improvement beyond previous-season history. [Original analysis](https://www.theringer.com/2019/10/18/nba/nba-preseason-2019-20-regular-season)

An older analysis reported 206 team-seasons: preseason win-percentage correlation 0.35 versus 0.55 for previous-season win percentage. Its date-span description is inconsistent, and the study is exploratory. [82games](https://www.82games.com/preseason0809.htm)

Opta's five-year descriptive comparison associated preseason net-rating groups with playoff participation, without a controlled incremental forecasting test. [Opta](https://theanalyst.com/articles/nba-preseason-meaning-2025-26)

This investigation did not establish a rigorous generalizable player-level preseason weight. Initial exclusion from default forecasts is CourtLoad's modeling policy pending ablation, not proof of zero signal. Playoffs and Summer League answer different questions; no universal phase ordering is used.

## Portraits

An official Scottie Barnes page links an NBA-ID-compatible portrait (`1630567`). This demonstrates one source pattern, not universal coverage or permanence. A latest photo does not establish historical membership. Cache identity/source/acquisition/hash and rights/attribution metadata. Successful retrieval is distinct from reuse conditions. [Player page](https://www.nba.com/player/1630567/scottie-barnes), [NBA terms](https://www.nba.com/termsofuse)

Wikidata exposes NBA IDs, and Wikimedia has individually licensed player images. They can support verified mappings and attributed alternatives; uniform coverage is unknown. [NBA ID property](https://www.wikidata.org/wiki/Property:P3647), [reuse guidance](https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia)

## Gemini API

Google lists $10/month developer credits for eligible AI Pro members linked to a Developer profile. API project/key setup remains separate. Prepaid accounts can require an initial purchase before eligible Cloud credits apply; the documented minimum is $5. Selected models also have independent free-tier access with varying quotas. No allowance is a core dependency. [Developer plans](https://developers.google.com/program/plans-and-pricing), [eligibility](https://support.google.com/googleone/answer/14534406?hl=en), [billing](https://ai.google.dev/gemini-api/docs/billing), [limits](https://ai.google.dev/gemini-api/docs/rate-limits)

Use official `google-genai` and verify/pin its supported version when implementing. Current documentation recommends Interactions, which stores requests by default; `store=False` opts into stateless behavior. Re-send instructions/tools as required. Function calling supports application-executed tools; structured outputs constrain shape but cannot prove truth. [SDK](https://ai.google.dev/gemini-api/docs/libraries), [Interactions](https://ai.google.dev/gemini-api/docs/interactions-overview), [function calling](https://ai.google.dev/gemini-api/docs/function-calling), [structured output](https://ai.google.dev/gemini-api/docs/structured-output)

Unpaid-service terms can include product improvement and human review; paid-service treatment differs. Disabling interaction storage does not override those terms. The optional cloud feature sends the question and bounded evidence to the provider. [API terms](https://ai.google.dev/gemini-api/terms)

## P1 admission report

Record exact assets/bytes/hashes, local/upstream times, seasons/phases, schema/grains, duplicates, missingness/appearance states, player/team reconciliation, coverage/exclusions, current schedule/association capability, and repeated-import results. Distinguish real observations from injected fixtures. Freeze experiment membership after admission. Track schedule, outcomes, association, preseason, portraits and AI capabilities independently.
