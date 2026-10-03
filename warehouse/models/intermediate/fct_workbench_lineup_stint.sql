{{ config(tags=['workbench']) }}

with stints as (
    select * from {{ ref('stg_workbench_lineup_stints') }}
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

home_perspective as (
    select
        s.id as stint_id,
        s.dataset_id,
        s.game_id,
        sch.game_date,
        sch.season,
        sch.phase,
        s.stint_index,
        s.period,
        'home' as side,
        s.home_team_id as team_id,
        s.away_team_id as opponent_team_id,
        s.home_lineup_key as lineup_key,
        s.away_lineup_key as opponent_lineup_key,
        s.home_lineup_json as lineup_players,
        s.duration_seconds,
        s.duration_minutes,
        s.home_points as points_scored,
        s.away_points as points_allowed,
        s.home_points - s.away_points as point_differential,
        s.home_possessions as possessions_offensive,
        s.away_possessions as possessions_defensive,
        s.total_possessions
    from stints as s
    left join schedules as sch
        on sch.dataset_id = s.dataset_id
        and sch.game_id = s.game_id
),

away_perspective as (
    select
        s.id as stint_id,
        s.dataset_id,
        s.game_id,
        sch.game_date,
        sch.season,
        sch.phase,
        s.stint_index,
        s.period,
        'away' as side,
        s.away_team_id as team_id,
        s.home_team_id as opponent_team_id,
        s.away_lineup_key as lineup_key,
        s.home_lineup_key as opponent_lineup_key,
        s.away_lineup_json as lineup_players,
        s.duration_seconds,
        s.duration_minutes,
        s.away_points as points_scored,
        s.home_points as points_allowed,
        s.away_points - s.home_points as point_differential,
        s.away_possessions as possessions_offensive,
        s.home_possessions as possessions_defensive,
        s.total_possessions
    from stints as s
    left join schedules as sch
        on sch.dataset_id = s.dataset_id
        and sch.game_id = s.game_id
)

select * from home_perspective
union all
select * from away_perspective
