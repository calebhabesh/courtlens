{{ config(tags=['stats_feed']) }}

-- Five-man lineup season ratings. NBA Stats caps this feed at 2,000 rows; when
-- dataset_truncated is true, lineups beyond the cap are unobserved, not absent.
select
    rows.dataset_id,
    rows.season,
    rows.season_type,
    rows.team_id,
    rows.source_values ->> 'group_id' as lineup_id,
    {{ json_number('rows.source_values', 'gp') }} as games,
    {{ json_number('rows.source_values', 'min') }} as minutes,
    {{ json_number('rows.source_values', 'poss') }} as possessions,
    {{ json_number('rows.source_values', 'off_rating') }} as offensive_rating,
    {{ json_number('rows.source_values', 'def_rating') }} as defensive_rating,
    {{ json_number('rows.source_values', 'net_rating') }} as net_rating,
    {{ json_number('rows.source_values', 'pace') }} as pace,
    {{ json_number('rows.source_values', 'ts_pct') }} as ts_pct,
    {{ json_number('rows.source_values', 'efg_pct') }} as efg_pct,
    rows.dataset_truncated,
    rows.season || ':' || rows.season_type || ':' || rows.entity_key as row_key
from {{ ref('stg_stats_feed_rows') }} as rows
where rows.feed = 'lineups'
    and rows.variant = 'advanced'
