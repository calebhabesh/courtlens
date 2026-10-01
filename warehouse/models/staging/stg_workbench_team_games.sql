{{ config(tags=['workbench']) }}

select
    facts.id,
    facts.dataset_id,
    facts.game_id,
    facts.team_id,
    coalesce(identities.display_name, facts.team_id) as team_name,
    facts.opponent_id,
    facts.game_date,
    facts.date_precision,
    facts.tipoff_utc,
    facts.season,
    facts.phase,
    facts.side,
    facts.points,
    facts.opponent_points,
    facts.is_final,
    facts.stats_json,
    (facts.stats_json ->> 'rebounds_total')::integer as rebounds,
    (facts.stats_json ->> 'rebounds_offensive')::integer as rebounds_offensive,
    (facts.stats_json ->> 'rebounds_defensive')::integer as rebounds_defensive,
    (facts.stats_json ->> 'assists')::integer as assists,
    (facts.stats_json ->> 'steals')::integer as steals,
    (facts.stats_json ->> 'blocks')::integer as blocks,
    (facts.stats_json ->> 'turnovers')::integer as turnovers,
    (facts.stats_json ->> 'fouls_personal')::integer as fouls_personal,
    (facts.stats_json ->> 'field_goals_made')::integer as field_goals_made,
    (facts.stats_json ->> 'field_goals_attempted')::integer as field_goals_attempted,
    (facts.stats_json ->> 'three_pointers_made')::integer as three_pointers_made,
    (facts.stats_json ->> 'three_pointers_attempted')::integer as three_pointers_attempted,
    (facts.stats_json ->> 'free_throws_made')::integer as free_throws_made,
    (facts.stats_json ->> 'free_throws_attempted')::integer as free_throws_attempted,
    facts.source_version_id,
    facts.source_observation_id
from {{ source('operational', 'workbench_team_games') }} as facts
left join {{ source('operational', 'workbench_identities') }} as identities
    on identities.external_id = facts.team_id
    and identities.kind = 'team'
{% if var('workbench_dataset_id', none) %}
where facts.dataset_id = '{{ var("workbench_dataset_id") }}'
{% endif %}
