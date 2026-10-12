# Stats feeds v1 (PC07)

Contract for season-level NBA Stats feeds acquired under [source policy v2](nba-direct-admission-v2.md)
for [PC07](../presentation-clarity-plan.md#pc07-data-tracking-play-types-matchups-combine-onoff).
Code: `src/courtlens/ingestion/stats_feeds.py`, `src/courtlens/services/stats_feed_ingestion.py`,
`src/courtlens/stats_feed_models.py`, migration `13b810a4f011`, dbt `stg_stats_feed_rows` and
`mart_stats_*`.

## Sources

| Source | Transport | Feeds | Interval |
| --- | --- | --- | --- |
| hoopR NBA Stats raw (CC BY 4.0) | `raw.githubusercontent.com/sportsdataverse/hoopR-nba-stats-raw/<40-hex commit>/…` | play types, tracking, defensive tracking, hustle, season matchups, lineups, combine (anthro + stats), draft history | 1 s |
| pbpstats API (secondary) | `api.pbpstats.com/get-totals/nba` (`Type=Player`, `Team`, `Lineup&TeamId=…`) | possessions/plus-minus cross-check, lineups | 5 s |

Mirror URLs are pinned to one commit per run; `main` or tags are rejected. Only `Totals` files are
admitted; per-game, per-75 and per-100 values are derived downstream. hoopR labels seasons by end
year: its `2026` directory is 2025-26, and its `2026.json` draft and combine files hold the **2025**
draft. Upstream scrapes stats.nba.com through its own proxies; CourtLens only reads the public
GitHub mirror over plain HTTPS.

## Admission rules

- **Scope agreement.** The URL, the requested season and the payload's declared `parameters`
  (season, season type, `PerMode`, play type/grouping, measure or defense category) must agree, or
  the candidate is rejected. The filename alone never sets a season.
- **Identity.** Rows key on NBA person and team IDs (the canonical `nba` namespace). Names are kept
  only as display text and never establish identity. A row without its required NBA ID rejects the
  file. Traded players keep one row per team. Duplicate keys reject the file.
- **Unknown is not zero.** Values are kept as the source reported them; JSON null stays null. A
  result set with zero rows is an observed empty feed (for example 2025-26 playoff matchups), never
  a zero outcome. Marts cast numbers strictly: non-numeric text becomes null.
- **Truncation.** NBA Stats lineups stop at 2,000 rows and pbpstats at 500. A result at its cap is
  flagged `truncated`; rows beyond it are unobserved, not absent.
- **Immutability.** One acquisition gives one `stats_feed_datasets` row with a membership hash and
  content hash. Row payloads are deduplicated into `stats_feed_versions`. PostgreSQL rejects update,
  delete, truncate, membership extension after the admitting transaction, and changes to bound
  acquisition/artifact provenance. Re-admitting an acquisition returns the same dataset.
- **Temporal.** `observed_at` is the acquisition completion time. Feeds are season totals with no
  per-game dates, so they are never joined into point-in-time features. `latest_datasets(known_at)`
  gives the latest observation per scope as known at an aware instant.
- **Isolation.** Admission never touches research releases, published snapshots or Stats results.

## Serving and capabilities

`stg_stats_feed_rows` selects the latest observation per (source, feed, season, season type,
variant). Marts: `mart_stats_player_play_types`, `mart_stats_player_tracking` (long form),
`mart_stats_player_defense`, `mart_stats_player_hustle`, `mart_stats_season_matchups`,
`mart_stats_lineups`, `mart_stats_draft_combine`, `mart_stats_draft_history`,
`mart_stats_pbpstats_player_totals`.

The workbench catalog declares each observed capability as `partial`, with its observed seasons,
phases, empty feeds and truncated feeds. Capabilities with no observation stay `not_yet_observed`.
pbpstats totals are labeled a secondary cross-check, not on/off splits. WOWY and on/off splits are
not ingested from pbpstats in v1; PC11 derives WOWY from sealed IM03 stints (owner decision D4) and
serves these marts read-only ([gated pages v1](gated-pages-v1.md)).

## Operations

```bash
.venv/bin/courtlens acquire-stats-feeds --revision <40-hex> --season 2025-26 \
  --draft-year 2025 [--draft-year …] --report run-report.json
.venv/bin/courtlens verify-stats-feeds          # re-parse retained bytes, recompute hashes
.venv/bin/courtlens stats-feed-coverage         # latest observation per scope
(cd warehouse && ../.venv/bin/dbt build --profiles-dir . --select tag:stats_feed)
```
