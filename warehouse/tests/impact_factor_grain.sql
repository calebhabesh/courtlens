select dataset_id, game_id
from {{ ref('mart_workbench_possession_factors') }}
group by dataset_id, game_id
having count(*) <> 2 or count(distinct offense_team_id) <> 2
