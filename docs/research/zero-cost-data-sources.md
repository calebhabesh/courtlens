# CourtLoad: zero-cost data-source research

Checked **2026-09-20**. This is planning evidence, not a completed provider-validation report. The owner requires no new spending and accepts a historical replay baseline. Public hosting is optional.

## Recommendation

Use a **pinned downloadable historical archive as the first acquisition candidate**, with a mandatory completeness and provenance report before committing the product to it. Prefer the NocturneBear archive below for the initial spike because actual unauthenticated sample reads worked here and its schema fits the baseline. Target three consecutive completed regular seasons, provisionally **2021-22, 2022-23, 2023-24**; those exact seasons remain unverified. Keep acquisition separate from ingestion so a user-supplied archive can satisfy the same contract.

Do not make NBA endpoint availability, a paid subscription, trial conversion, or continuous refresh a baseline dependency. No final source-selection ADR or application changes were made during this research.

## Candidates

| Candidate | Evidence | Baseline decision |
| --- | --- | --- |
| BALLDONTLIE Free | Teams, players, and games are available; Game Player Stats require ALL-STAR, currently USD 9.99/month. Free is 5 requests/minute. | Cannot independently supply the required player-game records at zero cost. Keep the existing adapter if useful, but remove the paid-provider assumption from the critical path. |
| NocturneBear historical CSV archive | Repository advertises 2010–2024 coverage and an MIT license. Three regular-season player files and one team-totals file exist. Actual sample retrieval succeeded. | Preferred technical acquisition candidate; full coverage and extraction provenance need validation. |
| `nba_api` / NBA Stats | Community Python client documents player game logs, team game logs, and detailed box scores. A direct NBA request timed out here. | Optional acquisition/refresh adapter after independent validation, not a reliability promise. |
| Eoin A. Moore Kaggle dataset | Author-owned dataset page was found, but its dynamic page returned no readable content in this research environment. | Reserve candidate only. License, fields, version, download requirements, and completeness were not verified. |

Sources: [BALLDONTLIE account tiers](https://docs.balldontlie.io/#account-tiers), [archive repository](https://github.com/NocturneBear/NBA-Data-2010-2024), [`nba_api` project](https://github.com/swar/nba_api), [Kaggle dataset](https://www.kaggle.com/datasets/eoinamoore/historical-nba-data-and-player-box-scores).

## Archive: what was actually checked

Pinned revision: `a5f108b5b1f08074d78b9e8e901926a9ce4c06c5`.

GitHub metadata reports these files, totaling 76,908,986 bytes (about 73.3 MiB):

- `regular_season_box_scores_2010_2024_part_1.csv`: 22,567,190 bytes.
- `regular_season_box_scores_2010_2024_part_2.csv`: 22,717,782 bytes.
- `regular_season_box_scores_2010_2024_part_3.csv`: 22,493,295 bytes.
- `regular_season_totals_2010_2024.csv`: 9,130,719 bytes.

The metadata, headers, and a few initial rows were read; files were not downloaded in full or added to this repository. Sample reads returned HTTP 200. Player headers include identity, team, game date, matchup, minutes, made/attempted shots, rebounds, assists, steals, blocks, turnovers, and points. Team headers include game identity, date, matchup, and points. Player minutes appear as `m:ss` (for example `4:21`). Player `gameId` values omit leading zeroes, while team `GAME_ID` values preserve them. Normalize NBA game IDs to ten-character strings before joining. Do not assume file parts correspond to seasons: inspected rows span different years.

Evidence: [pinned repository tree](https://github.com/NocturneBear/NBA-Data-2010-2024/tree/a5f108b5b1f08074d78b9e8e901926a9ce4c06c5), [player-file sample source](https://raw.githubusercontent.com/NocturneBear/NBA-Data-2010-2024/a5f108b5b1f08074d78b9e8e901926a9ce4c06c5/regular_season_box_scores_2010_2024_part_3.csv), [team-file sample source](https://raw.githubusercontent.com/NocturneBear/NBA-Data-2010-2024/a5f108b5b1f08074d78b9e8e901926a9ce4c06c5/regular_season_totals_2010_2024.csv).

The author's [README](https://github.com/NocturneBear/NBA-Data-2010-2024/blob/a5f108b5b1f08074d78b9e8e901926a9ce4c06c5/README.md) describes the schema and intended updates but does not document extraction endpoints, extraction code, or an upstream permission chain. Attribute the source as this archive, rather than claiming independently verified NBA provenance. Its [MIT license](https://github.com/NocturneBear/NBA-Data-2010-2024/blob/a5f108b5b1f08074d78b9e8e901926a9ce4c06c5/LICENSE) names Vitalii Korolyk, 2024. Repository licensing does not establish all underlying data rights. Preserve attribution; distinguish local analysis from publishing a downloadable data mirror.

## NBA endpoint option

[`PlayerGameLogs`](https://github.com/swar/nba_api/blob/master/docs/nba_api/stats/endpoints/playergamelogs.md) documents player/team IDs, game dates, matchups, minutes, counting statistics, and shot attempts. [`LeagueGameLog`](https://github.com/swar/nba_api/blob/master/docs/nba_api/stats/endpoints/leaguegamelog.md) supports season and season-type filtering and team totals. Pairing team rows by game would yield opponents and final scores. [`BoxScoreTraditionalV3`](https://github.com/swar/nba_api/blob/master/docs/nba_api/stats/endpoints/boxscoretraditionalv3.md) documents detailed player and team rows, including comments; its generated example is not proof of correct full-game range parameters. Validate totals before using any per-period endpoint configuration.

One unauthenticated `urllib` request to `https://stats.nba.com/stats/leaguegamelog` used `Season=2023-24`, `SeasonType=Regular Season`, `LeagueID=00`, `PlayerOrTeam=T`, `Counter=0`, `Direction=ASC`, `Sorter=DATE`, empty date filters, and a 15-second timeout. It raised `TimeoutError: The read operation timed out`. This establishes failure of that request from this environment, not universal unavailability or the cause of failure. No proxy, access-control bypass, or repeated probing was attempted.

The project notes that NBA does not announce endpoint changes and separately identifies the MIT client license and NBA terms. Issue reports document [general timeouts](https://github.com/swar/nba_api/issues/652) and [cloud-specific failures](https://github.com/swar/nba_api/issues/498); these are reports, not a service availability measurement. See [`nba_api` license and endpoint notes](https://github.com/swar/nba_api#license--terms-of-use). NBA's separate [terms](https://www.nba.com/termsofuse) require review for the intended use; this research does not establish redistribution permission.

## Required source spike and acceptance evidence

These are proposed engineering checks, not claims that the candidate has passed them:

1. Fetch pinned files without credentials or payment, record URL, revision, retrieval time, byte count, SHA-256, declared license, and provenance limitations. Keep raw data outside Git. Preserve provider-specific external IDs under an explicit namespace; do not reuse BALLDONTLIE IDs for NBA IDs.
2. Parse all three player files and team totals. Produce a season coverage table before choosing the final three seasons. Verify unique game/player keys, two teams per game, nonmissing counting statistics, valid dates, and the home/away interpretation of matchup strings. Resolve duplicates explicitly rather than silently dropping conflicting rows.
3. Establish expected game coverage from independently checked season schedules/results. Distinguish regular season, Cup final, playoffs, and play-in. Verify per-team completeness and join coverage; a plausible total row count alone is insufficient.
4. Compare player scoring totals with team scores; verify made/attempted constraints, minute conversion, traded-player team membership at each game, and missing-versus-zero semantics. Inspect DNP/comment rows and partial records. Quarantine invalid records with a report.
5. Use team totals to reconstruct the historical played schedule. It is **not** an archive of schedule information as known before each game: postponements and schedule revisions are unobserved. Use explicit date-only cutoffs where tipoff times are unavailable, excluding every same-day outcome from pregame features. Label historical schedule context and reconstructed forecasts accurately.
6. Package a reproducible local import plus a coverage/provenance report. Public repository artifacts should include attribution, manifests, synthetic test fixtures, and evaluation results; decide data redistribution separately based on the source's documented rights.
7. If the candidate fails, record the exact failure and evaluate a user-supplied archive or the reserved Kaggle candidate against this same contract. Do not claim baseline completion using fabricated real-data results. Revisit scope with the owner only if no zero-cost source can satisfy the essential contract.

Freeze the accepted dataset for reproducible evaluation. Treat ongoing refresh and more recent seasons as later enhancements. With a historical baseline, hosting can serve local normalized data without reaching any provider during public requests.
