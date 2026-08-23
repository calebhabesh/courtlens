select game_key
from {{ ref('stg_games') }}
where home_team_key = away_team_key
