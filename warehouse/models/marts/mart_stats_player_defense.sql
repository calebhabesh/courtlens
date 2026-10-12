{{ config(tags=['stats_feed']) }}

-- Defensive tracking: opponent shooting when this player is the closest defender.
select
    rows.dataset_id,
    rows.season,
    rows.season_type,
    rows.player_id,
    rows.team_id,
    rows.variant as category,
    rows.source_values ->> 'player_name' as source_player_name,
    {{ json_number('rows.source_values', 'gp') }} as games,
    {{ json_number('rows.source_values', 'freq') }} as frequency,
    {{ json_number('rows.source_values', 'd_fgm') }} as defended_fgm,
    {{ json_number('rows.source_values', 'd_fga') }} as defended_fga,
    {{ json_number('rows.source_values', 'd_fg_pct') }} as defended_fg_pct,
    {{ json_number('rows.source_values', 'normal_fg_pct') }} as expected_fg_pct,
    {{ json_number('rows.source_values', 'pct_plusminus') }} as fg_pct_difference,
    rows.season || ':' || rows.season_type || ':' || rows.variant || ':' || rows.entity_key
        as row_key
from {{ ref('stg_stats_feed_rows') }} as rows
where rows.feed = 'defensive_tracking'
