{{ config(tags=['workbench']) }}

with team_aggregates as (
    select
        dataset_id,
        season,
        phase,
        team_id,
        coalesce(team_name, team_id) as team_name,
        count(*) as games_played,
        count(*) filter (where is_win = 1) as wins,
        count(*) filter (where is_win = 0) as losses,
        case
            when count(*) > 0
            then round(count(*) filter (where is_win = 1)::numeric / count(*)::numeric, 3)
            else null
        end as win_pct,
        sum(points) as points_for,
        sum(opponent_points) as points_against,
        round(avg(points)::numeric, 1) as points_for_per_game,
        round(avg(opponent_points)::numeric, 1) as points_against_per_game,
        round(avg(points - opponent_points)::numeric, 1) as point_differential_per_game,
        sum(rebounds) as rebounds_total,
        round(avg(rebounds)::numeric, 1) as rebounds_per_game,
        sum(assists) as assists_total,
        round(avg(assists)::numeric, 1) as assists_per_game,
        sum(steals) as steals_total,
        round(avg(steals)::numeric, 1) as steals_per_game,
        sum(blocks) as blocks_total,
        round(avg(blocks)::numeric, 1) as blocks_per_game,
        sum(turnovers) as turnovers_total,
        round(avg(turnovers)::numeric, 1) as turnovers_per_game,
        case
            when sum(field_goals_attempted) > 0
            then round((sum(field_goals_made)::numeric / sum(field_goals_attempted)::numeric), 4)
            else null
        end as field_goal_pct
    from {{ ref('fct_workbench_team_game') }}
    group by dataset_id, season, phase, team_id, coalesce(team_name, team_id)
)

select * from team_aggregates
