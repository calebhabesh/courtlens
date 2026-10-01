{{ config(tags=['workbench']) }}

select
    stg.*,
    case
        when points is null or rebounds is null or assists is null or steals is null
            or blocks is null or turnovers is null
            then null
        else
            points + 1.2 * rebounds + 1.5 * assists + 3.0 * steals
            + 3.0 * blocks - turnovers
    end as legacy_fantasy_score
from {{ ref('stg_workbench_player_games') }} as stg
