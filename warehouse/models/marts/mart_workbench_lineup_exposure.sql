{{ config(tags=['workbench']) }}

with stints as (
    select * from {{ ref('fct_workbench_lineup_stint') }}
)

select
    dataset_id,
    season,
    phase,
    team_id,
    lineup_key,
    count(distinct game_id) as games_count,
    count(distinct stint_id) as stints_count,
    round(sum(duration_seconds)::numeric, 2) as total_seconds,
    round((sum(duration_seconds) / 60.0)::numeric, 2) as total_minutes,
    round(sum(possessions_offensive)::numeric, 2) as possessions_offensive,
    round(sum(possessions_defensive)::numeric, 2) as possessions_defensive,
    sum(points_scored) as points_scored,
    sum(points_allowed) as points_allowed,
    sum(point_differential) as point_differential,
    case
        when sum(possessions_offensive) > 0
        then round(((sum(points_scored) * 100.0) / sum(possessions_offensive))::numeric, 2)
        else null
    end as offensive_rating,
    case
        when sum(possessions_defensive) > 0
        then round(((sum(points_allowed) * 100.0) / sum(possessions_defensive))::numeric, 2)
        else null
    end as defensive_rating,
    case
        when sum(possessions_offensive) > 0 and sum(possessions_defensive) > 0
        then round((
            ((sum(points_scored) * 100.0) / sum(possessions_offensive))
            - ((sum(points_allowed) * 100.0) / sum(possessions_defensive))
        )::numeric, 2)
        else null
    end as net_rating
from stints
group by
    dataset_id,
    season,
    phase,
    team_id,
    lineup_key
