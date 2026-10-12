{{ config(tags=['stats_feed']) }}

select
    rows.dataset_id,
    rows.season,
    rows.season_type,
    rows.player_id,
    rows.team_id,
    rows.source_values ->> 'player_name' as source_player_name,
    {{ json_number('rows.source_values', 'g') }} as games,
    {{ json_number('rows.source_values', 'min') }} as minutes,
    {{ json_number('rows.source_values', 'contested_shots') }} as contested_shots,
    {{ json_number('rows.source_values', 'contested_shots_2pt') }} as contested_twos,
    {{ json_number('rows.source_values', 'contested_shots_3pt') }} as contested_threes,
    {{ json_number('rows.source_values', 'deflections') }} as deflections,
    {{ json_number('rows.source_values', 'charges_drawn') }} as charges_drawn,
    {{ json_number('rows.source_values', 'screen_assists') }} as screen_assists,
    {{ json_number('rows.source_values', 'screen_ast_pts') }} as screen_assist_points,
    {{ json_number('rows.source_values', 'loose_balls_recovered') }} as loose_balls_recovered,
    {{ json_number('rows.source_values', 'box_outs') }} as box_outs,
    {{ json_number('rows.source_values', 'off_boxouts') }} as offensive_box_outs,
    {{ json_number('rows.source_values', 'def_boxouts') }} as defensive_box_outs,
    rows.season || ':' || rows.season_type || ':' || rows.entity_key as row_key
from {{ ref('stg_stats_feed_rows') }} as rows
where rows.feed = 'hustle'
