{{ config(tags=['stats_feed']) }}

-- Season matchup totals by offensive and defensive player (NBA Stats via hoopR).
select
    rows.dataset_id,
    rows.season,
    rows.season_type,
    rows.source_values ->> 'off_player_id' as off_player_id,
    rows.source_values ->> 'def_player_id' as def_player_id,
    {{ json_number('rows.source_values', 'gp') }} as games,
    {{ json_number('rows.source_values', 'matchup_time_sec') }} as matchup_seconds,
    {{ json_number('rows.source_values', 'partial_poss') }} as partial_possessions,
    {{ json_number('rows.source_values', 'player_pts') }} as player_points,
    {{ json_number('rows.source_values', 'team_pts') }} as team_points,
    {{ json_number('rows.source_values', 'matchup_ast') }} as assists,
    {{ json_number('rows.source_values', 'matchup_tov') }} as turnovers,
    {{ json_number('rows.source_values', 'matchup_blk') }} as blocks,
    {{ json_number('rows.source_values', 'matchup_fgm') }} as fgm,
    {{ json_number('rows.source_values', 'matchup_fga') }} as fga,
    {{ json_number('rows.source_values', 'matchup_fg3m') }} as fg3m,
    {{ json_number('rows.source_values', 'matchup_fg3a') }} as fg3a,
    {{ json_number('rows.source_values', 'matchup_ftm') }} as ftm,
    {{ json_number('rows.source_values', 'matchup_fta') }} as fta,
    {{ json_number('rows.source_values', 'help_blk') }} as help_blocks,
    {{ json_number('rows.source_values', 'sfl') }} as shooting_fouls,
    rows.season || ':' || rows.season_type || ':' || rows.entity_key as row_key
from {{ ref('stg_stats_feed_rows') }} as rows
where rows.feed = 'matchups'
