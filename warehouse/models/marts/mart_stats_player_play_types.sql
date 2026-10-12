{{ config(tags=['stats_feed']) }}

-- Synergy play types per player-team (NBA Stats via hoopR). Season totals only.
select
    rows.dataset_id,
    rows.season,
    rows.season_type,
    rows.player_id,
    rows.team_id,
    split_part(rows.variant, '_', 1) as play_type,
    split_part(rows.variant, '_', 2) as side,
    rows.source_values ->> 'player_name' as source_player_name,
    {{ json_number('rows.source_values', 'gp') }} as games,
    {{ json_number('rows.source_values', 'poss') }} as possessions,
    {{ json_number('rows.source_values', 'poss_pct') }} as frequency,
    {{ json_number('rows.source_values', 'pts') }} as points,
    {{ json_number('rows.source_values', 'ppp') }} as points_per_possession,
    {{ json_number('rows.source_values', 'fgm') }} as fgm,
    {{ json_number('rows.source_values', 'fga') }} as fga,
    {{ json_number('rows.source_values', 'efg_pct') }} as efg_pct,
    {{ json_number('rows.source_values', 'tov_poss_pct') }} as turnover_frequency,
    {{ json_number('rows.source_values', 'sf_poss_pct') }} as shooting_foul_frequency,
    {{ json_number('rows.source_values', 'score_poss_pct') }} as score_frequency,
    {{ json_number('rows.source_values', 'percentile') }} as source_percentile,
    rows.season || ':' || rows.season_type || ':' || rows.variant || ':' || rows.entity_key
        as row_key
from {{ ref('stg_stats_feed_rows') }} as rows
where rows.feed = 'play_types'
