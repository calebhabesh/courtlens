{{ config(tags=['workbench']) }}

select
    poss.id,
    poss.dataset_id,
    poss.game_id,
    poss.possession_number,
    poss.period,
    poss.number_in_period,
    poss.offense_team_id,
    poss.defense_team_id,
    poss.start_order_index,
    poss.end_order_index,
    poss.start_seconds_remaining,
    poss.end_seconds_remaining,
    round((poss.start_seconds_remaining - poss.end_seconds_remaining)::numeric, 2) as duration_seconds,
    poss.points,
    poss.is_second_chance,
    poss.possession_start_type,
    poss.count_as_possession,
    poss.stats_json,
    poss.off_lineup_json,
    poss.def_lineup_json,
    poss.lineup_source,
    poss.policy_version,
    poss.status
from {{ source('operational', 'workbench_possessions') }} as poss
{% if var('workbench_dataset_id', none) %}
where poss.dataset_id = '{{ var("workbench_dataset_id") }}'
{% endif %}
