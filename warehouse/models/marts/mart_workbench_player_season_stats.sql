{{ config(tags=['workbench']) }}

with player_team_aggregates as (
    select
        dataset_id,
        season,
        phase,
        player_id,
        coalesce(player_name, player_id) as player_name,
        team_id,
        count(*) filter (where appearance = 'appeared') as games_played,
        round(coalesce(sum(minutes_seconds), 0)::numeric / 60.0, 1) as total_minutes,
        round(avg(minutes)::numeric, 1) as minutes_per_game,
        sum(points) as points_total,
        round(avg(points)::numeric, 1) as points_per_game,
        sum(rebounds) as rebounds_total,
        round(avg(rebounds)::numeric, 1) as rebounds_per_game,
        sum(rebounds_offensive) as rebounds_offensive_total,
        sum(rebounds_defensive) as rebounds_defensive_total,
        sum(assists) as assists_total,
        round(avg(assists)::numeric, 1) as assists_per_game,
        sum(steals) as steals_total,
        round(avg(steals)::numeric, 1) as steals_per_game,
        sum(blocks) as blocks_total,
        round(avg(blocks)::numeric, 1) as blocks_per_game,
        sum(turnovers) as turnovers_total,
        round(avg(turnovers)::numeric, 1) as turnovers_per_game,
        sum(fouls_personal) as fouls_total,
        sum(field_goals_made) as field_goals_made,
        sum(field_goals_attempted) as field_goals_attempted,
        case
            when sum(field_goals_attempted) > 0
            then round((sum(field_goals_made)::numeric / sum(field_goals_attempted)::numeric), 4)
            else null
        end as field_goal_pct,
        sum(three_pointers_made) as three_pointers_made,
        sum(three_pointers_attempted) as three_pointers_attempted,
        case
            when sum(three_pointers_attempted) > 0
            then round((sum(three_pointers_made)::numeric / sum(three_pointers_attempted)::numeric), 4)
            else null
        end as three_point_pct,
        sum(free_throws_made) as free_throws_made,
        sum(free_throws_attempted) as free_throws_attempted,
        case
            when sum(free_throws_attempted) > 0
            then round((sum(free_throws_made)::numeric / sum(free_throws_attempted)::numeric), 4)
            else null
        end as free_throw_pct,
        case
            when sum(coalesce(minutes_seconds, 0)) > 0
            then round((sum(points)::numeric / (sum(minutes_seconds)::numeric / 60.0)) * 36.0, 1)
            else null
        end as pts_per_36,
        case
            when sum(coalesce(minutes_seconds, 0)) > 0
            then round((sum(rebounds)::numeric / (sum(minutes_seconds)::numeric / 60.0)) * 36.0, 1)
            else null
        end as reb_per_36,
        case
            when sum(coalesce(minutes_seconds, 0)) > 0
            then round((sum(assists)::numeric / (sum(minutes_seconds)::numeric / 60.0)) * 36.0, 1)
            else null
        end as ast_per_36,
        case
            when sum(coalesce(minutes_seconds, 0)) > 0
            then round((sum(steals)::numeric / (sum(minutes_seconds)::numeric / 60.0)) * 36.0, 1)
            else null
        end as stl_per_36,
        case
            when sum(coalesce(minutes_seconds, 0)) > 0
            then round((sum(blocks)::numeric / (sum(minutes_seconds)::numeric / 60.0)) * 36.0, 1)
            else null
        end as blk_per_36,
        round(avg(legacy_fantasy_score)::numeric, 1) as legacy_fantasy_score_per_game
    from {{ ref('fct_workbench_player_game') }}
    group by dataset_id, season, phase, player_id, coalesce(player_name, player_id), team_id
)

select * from player_team_aggregates
