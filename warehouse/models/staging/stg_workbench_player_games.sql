{{ config(tags=['workbench']) }}

select
    facts.id,
    facts.dataset_id,
    facts.game_id,
    facts.player_id,
    coalesce(identities.display_name, facts.player_id) as player_name,
    facts.team_id,
    facts.opponent_id,
    facts.game_date,
    facts.date_precision,
    facts.tipoff_utc,
    facts.season,
    facts.phase,
    facts.appearance,
    facts.minutes_original,
    facts.minutes_seconds,
    coalesce(facts.minutes_seconds::numeric / 60.0, 0.0) as minutes,
    facts.points,
    facts.stats_json,
    (facts.stats_json ->> 'points')::integer as points_stats,
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
from {{ source('operational', 'workbench_player_games') }} as facts
left join {{ source('operational', 'workbench_identities') }} as identities
    on identities.external_id = facts.player_id
    and identities.kind = 'player'
{% if var('workbench_dataset_id', none) %}
where facts.dataset_id = '{{ var("workbench_dataset_id") }}'
{% endif %}
