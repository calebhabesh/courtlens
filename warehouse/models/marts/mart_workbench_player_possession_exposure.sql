{{ config(tags=['workbench']) }}

with stint_players as (
    select * from {{ ref('stg_workbench_stint_players') }}
),

schedules as (
    select
        dataset_id,
        game_id,
        game_date,
        season,
        phase
    from {{ ref('stg_workbench_schedules') }}
),

joined as (
    select
        sp.*,
        sch.game_date,
        sch.season,
        sch.phase
    from stint_players as sp
    left join schedules as sch
        on sch.dataset_id = sp.dataset_id
        and sch.game_id = sp.game_id
)

select
    dataset_id,
    season,
    phase,
    team_id,
    player_id,
    max(player_name) as player_name,
    count(distinct game_id) as games_count,
    count(distinct stint_id) as stints_count,
    round(sum(duration_seconds)::numeric, 2) as total_seconds,
    round((sum(duration_seconds) / 60.0)::numeric, 2) as total_minutes,
    round(sum(possessions)::numeric, 2) as possessions_offensive,
    round(sum(opponent_possessions)::numeric, 2) as possessions_defensive,
    sum(points) as points_individual,
    sum(team_points) as team_points_on,
    sum(points_allowed) as points_allowed_on,
    sum(point_differential) as point_differential,
    case
        when sum(possessions) > 0
        then round(((sum(team_points) * 100.0) / sum(possessions))::numeric, 2)
        else null
    end as offensive_rating_on,
    case
        when sum(opponent_possessions) > 0
        then round(((sum(points_allowed) * 100.0) / sum(opponent_possessions))::numeric, 2)
        else null
    end as defensive_rating_on,
    case
        when sum(possessions) > 0 and sum(opponent_possessions) > 0
        then round((
            ((sum(team_points) * 100.0) / sum(possessions))
            - ((sum(points_allowed) * 100.0) / sum(opponent_possessions))
        )::numeric, 2)
        else null
    end as net_rating_on,
    sum(fgm) as fgm,
    sum(fga) as fga,
    sum(fg3m) as fg3m,
    sum(fg3a) as fg3a,
    sum(ftm) as ftm,
    sum(fta) as fta,
    sum(oreb) as oreb,
    sum(dreb) as dreb,
    sum(oreb + dreb) as reb,
    sum(ast) as ast,
    sum(stl) as stl,
    sum(blk) as blk,
    sum(tov) as tov,
    sum(pf) as pf
from joined
group by
    dataset_id,
    season,
    phase,
    team_id,
    player_id
