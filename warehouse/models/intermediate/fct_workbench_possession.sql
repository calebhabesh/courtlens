{{ config(tags=['workbench']) }}

with possessions as (
    select * from {{ ref('stg_workbench_possessions') }}
),

schedules as (
    select
        dataset_id,
        game_id,
        game_date,
        season,
        phase
    from {{ ref('stg_workbench_schedules') }}
)

select
    p.id as possession_id,
    p.dataset_id,
    p.game_id,
    sch.game_date,
    sch.season,
    sch.phase,
    p.possession_number,
    p.period,
    p.number_in_period,
    p.offense_team_id,
    p.defense_team_id,
    p.start_seconds_remaining,
    p.end_seconds_remaining,
    p.duration_seconds,
    p.points,
    p.stats_json,
    p.is_second_chance,
    p.possession_start_type,
    p.count_as_possession,
    p.off_lineup_json,
    p.def_lineup_json,
    p.policy_version,
    p.status
from possessions as p
left join schedules as sch
    on sch.dataset_id = p.dataset_id
    and sch.game_id = p.game_id
