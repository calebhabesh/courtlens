select dataset_id, player_id, replay_date
from {{ ref('mart_archive_player_profile') }}
group by dataset_id, player_id, replay_date
having count(*) <> 1
