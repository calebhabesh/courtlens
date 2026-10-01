{{ config(tags=['workbench']) }}

select
    facts.id,
    facts.dataset_id,
    facts.game_id,
    facts.season,
    facts.phase,
    facts.game_date,
    facts.date_precision,
    facts.tipoff_utc,
    facts.home_team_id,
    facts.away_team_id,
    facts.game_status,
    facts.annotations_json,
    facts.source_version_id,
    facts.source_observation_id
from {{ source('operational', 'workbench_schedules') }} as facts
{% if var('workbench_dataset_id', none) %}
where facts.dataset_id = '{{ var("workbench_dataset_id") }}'
{% endif %}
