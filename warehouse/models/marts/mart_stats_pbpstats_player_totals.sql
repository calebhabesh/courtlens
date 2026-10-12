{{ config(tags=['stats_feed']) }}

-- pbpstats player totals: a secondary cross-check for possessions and plus-minus.
-- pbpstats returns at most 500 rows; when dataset_truncated is true, lower-minute
-- players are unobserved, not absent.
select
    rows.dataset_id,
    rows.season,
    rows.season_type,
    rows.player_id,
    rows.team_id,
    {{ json_number('rows.source_values', 'games_played') }} as games,
    {{ json_number('rows.source_values', 'minutes') }} as minutes,
    {{ json_number('rows.source_values', 'off_poss') }} as offensive_possessions,
    {{ json_number('rows.source_values', 'def_poss') }} as defensive_possessions,
    {{ json_number('rows.source_values', 'plus_minus') }} as plus_minus,
    rows.dataset_truncated,
    rows.season || ':' || rows.season_type || ':' || rows.entity_key as row_key
from {{ ref('stg_stats_feed_rows') }} as rows
where rows.feed = 'pbpstats_player'
