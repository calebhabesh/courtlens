{{ config(tags=['archive']) }}

select
    *,
    case
        when points is null or rebounds is null or assists is null or steals is null
            or blocks is null or turnovers is null
            then null
        else
            points + 1.2 * rebounds + 1.5 * assists + 3.0 * steals
            + 3.0 * blocks - turnovers
    end as reference_points
from {{ ref('stg_archive_player_games') }}
