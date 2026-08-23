select team_key, week_start
from {{ ref('mart_team_week_schedule') }}
group by team_key, week_start
having count(*) <> 1
