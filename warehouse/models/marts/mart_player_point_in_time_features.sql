select
    source_stat_id,
    game_key,
    player_key,
    scheduled_start_utc as calculated_as_of,
    count(*) over (
        partition by player_key
        order by scheduled_start_utc, game_key
        rows between 10 preceding and 1 preceding
    ) as prior_games_l10,
    avg(fantasy_points_default) over (
        partition by player_key
        order by scheduled_start_utc, game_key
        rows between 10 preceding and 1 preceding
    ) as fantasy_points_l10,
    avg(minutes) over (
        partition by player_key
        order by scheduled_start_utc, game_key
        rows between 10 preceding and 1 preceding
    ) as minutes_l10,
    avg(fantasy_points_default) over (
        partition by player_key
        order by scheduled_start_utc, game_key
        rows between 5 preceding and 1 preceding
    ) as fantasy_points_l5
from {{ ref('int_player_games_scored') }}
