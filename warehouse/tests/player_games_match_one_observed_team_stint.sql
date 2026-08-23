select player_games.source_stat_id
from {{ ref('stg_player_games') }} as player_games
inner join {{ ref('stg_games') }} as games using (game_key)
left join {{ source('operational', 'bridge_player_observed_team_stints') }} as stints
    on player_games.player_key = stints.player_key
    and player_games.team_key = stints.team_key
    and games.reporting_game_date >= stints.valid_from
    and games.reporting_game_date <= coalesce(stints.valid_to, games.reporting_game_date)
group by player_games.source_stat_id
having count(stints.stint_id) <> 1
