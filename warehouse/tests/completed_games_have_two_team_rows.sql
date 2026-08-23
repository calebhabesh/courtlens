select games.game_key
from {{ ref('stg_games') }} as games
left join {{ ref('int_team_games') }} as team_games using (game_key)
where games.status_state = 'final'
group by games.game_key
having count(team_games.team_key) <> 2
