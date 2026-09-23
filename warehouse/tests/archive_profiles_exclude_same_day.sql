select *
from {{ ref('mart_archive_player_profile') }}
where max_history_date >= replay_date
