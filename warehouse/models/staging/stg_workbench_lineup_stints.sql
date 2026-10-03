{{ config(tags=['workbench']) }}

select
    stints.id,
    stints.dataset_id,
    stints.game_id,
    stints.stint_index,
    stints.period,
    stints.start_clock,
    stints.end_clock,
    stints.start_seconds_remaining,
    stints.end_seconds_remaining,
    stints.duration_seconds,
    coalesce(stints.duration_seconds / 60.0, 0.0) as duration_minutes,
    stints.home_team_id,
    stints.away_team_id,
    stints.home_lineup_json,
    stints.away_lineup_json,
    stints.home_lineup_key,
    stints.away_lineup_key,
    stints.start_home_score,
    stints.start_away_score,
    stints.end_home_score,
    stints.end_away_score,
    stints.home_points,
    stints.away_points,
    stints.home_points - stints.away_points as point_differential,
    stints.home_possessions,
    stints.away_possessions,
    stints.total_possessions,
    stints.stats_json,
    stints.player_stats_json,
    stints.policy_version,
    stints.status
from {{ source('operational', 'workbench_lineup_stints') }} as stints
{% if var('workbench_dataset_id', none) %}
where stints.dataset_id = '{{ var("workbench_dataset_id") }}'
{% endif %}
