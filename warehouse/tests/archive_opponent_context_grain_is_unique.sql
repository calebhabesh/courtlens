select dataset_id, team_id, replay_date
from {{ ref('mart_archive_opponent_context') }}
group by dataset_id, team_id, replay_date
having count(*) <> 1
