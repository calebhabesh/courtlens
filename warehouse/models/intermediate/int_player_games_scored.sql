select
    player_games.*,
    games.scheduled_start_utc,
    games.reporting_game_date,
    games.season,
    games.status_state,
    round((
        player_games.points * 1.0
        + player_games.rebounds * 1.2
        + player_games.assists * 1.5
        + player_games.steals * 3.0
        + player_games.blocks * 3.0
        - player_games.turnovers * 1.0
        + player_games.three_pointers_made * 0.5
    )::numeric, 2) as fantasy_points_default
from {{ ref('stg_player_games') }} as player_games
inner join {{ ref('stg_games') }} as games using (game_key)
where games.status_state = 'final'
