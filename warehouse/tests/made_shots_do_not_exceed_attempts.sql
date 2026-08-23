select source_stat_id
from {{ ref('stg_player_games') }}
where field_goals_made > field_goals_attempted
   or free_throws_made > free_throws_attempted
