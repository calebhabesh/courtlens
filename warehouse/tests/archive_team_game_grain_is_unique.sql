select dataset_id, game_id, team_id
from {{ ref('fct_archive_team_game') }}
group by dataset_id, game_id, team_id
having count(*) <> 1
