{{ config(tags=['archive']) }}

select
    facts.dataset_id,
    facts.game_id,
    facts.player_id,
    versions.payload_json ->> 'player' as player_name,
    facts.team_id,
    facts.opponent_id,
    facts.game_date,
    facts.season,
    facts.appearance,
    facts.minutes_original,
    facts.minutes_seconds,
    facts.stats_json,
    (facts.stats_json ->> 'points')::integer as points,
    (facts.stats_json ->> 'reboundsTotal')::integer as rebounds,
    (facts.stats_json ->> 'assists')::integer as assists,
    (facts.stats_json ->> 'steals')::integer as steals,
    (facts.stats_json ->> 'blocks')::integer as blocks,
    (facts.stats_json ->> 'turnovers')::integer as turnovers,
    (facts.stats_json ->> 'fieldGoalsMade')::integer as field_goals_made,
    (facts.stats_json ->> 'fieldGoalsAttempted')::integer as field_goals_attempted,
    (facts.stats_json ->> 'threePointersMade')::integer as three_pointers_made,
    (facts.stats_json ->> 'threePointersAttempted')::integer as three_pointers_attempted,
    (facts.stats_json ->> 'freeThrowsMade')::integer as free_throws_made,
    (facts.stats_json ->> 'freeThrowsAttempted')::integer as free_throws_attempted,
    facts.source_version_id,
    facts.source_observation_id
from {{ source('operational', 'archive_player_games') }} as facts
inner join {{ source('operational', 'archive_versions') }} as versions
    on versions.id = facts.source_version_id
where facts.dataset_id = '{{ var("archive_dataset_id") }}'
