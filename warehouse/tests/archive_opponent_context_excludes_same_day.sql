select *
from {{ ref('mart_archive_opponent_context') }}
where max_history_date >= replay_date
