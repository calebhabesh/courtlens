{{ config(tags=['workbench']) }}

select
    stg.*,
    case
        when points > opponent_points then 1
        when points < opponent_points then 0
        else null
    end as is_win
from {{ ref('stg_workbench_team_games') }} as stg
