select dataset_id, game_id
from {{ ref('fct_archive_team_game') }}
group by dataset_id, game_id
having count(*) <> 2 or count(distinct team_id) <> 2 or count(distinct side) <> 2
