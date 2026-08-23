with ordered as (
    select
        features.*,
        row_number() over (
            partition by player_key order by calculated_as_of, game_key
        ) as player_game_number
    from {{ ref('mart_player_point_in_time_features') }} as features
)

select source_stat_id
from ordered
where player_game_number = 1
  and (prior_games_l10 <> 0 or fantasy_points_l10 is not null or minutes_l10 is not null)
