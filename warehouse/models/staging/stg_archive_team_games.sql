{{ config(tags=['archive']) }}

select
    facts.dataset_id,
    facts.game_id,
    facts.team_id,
    facts.opponent_id,
    versions.payload_json ->> 'team' as team_abbreviation,
    versions.payload_json ->> 'opponent' as opponent_abbreviation,
    facts.game_date,
    facts.season,
    facts.side,
    facts.points,
    facts.stats_json,
    (facts.stats_json ->> 'reboundsTotal')::integer as rebounds,
    (facts.stats_json ->> 'assists')::integer as assists,
    (facts.stats_json ->> 'steals')::integer as steals,
    (facts.stats_json ->> 'blocks')::integer as blocks,
    (facts.stats_json ->> 'turnovers')::integer as turnovers,
    facts.source_version_id,
    facts.source_observation_id
from {{ source('operational', 'archive_team_games') }} as facts
inner join {{ source('operational', 'archive_versions') }} as versions
    on versions.id = facts.source_version_id
where facts.dataset_id = '{{ var("archive_dataset_id") }}'
