{{ config(tags=['stats_feed']) }}

-- Latest admitted observation per feed scope (PC07). Older observations stay retained
-- in the append-only tables; marts never mix rows from two observations of one scope.
with ranked as (
    select
        datasets.*,
        row_number() over (
            partition by
                datasets.source_name,
                datasets.feed,
                datasets.season,
                datasets.season_type,
                datasets.variant
            order by datasets.observation_order desc
        ) as recency
    from {{ source('operational', 'stats_feed_datasets') }} as datasets
)

select
    ranked.id as dataset_id,
    ranked.source_name,
    ranked.feed,
    ranked.capability,
    ranked.season,
    ranked.season_type,
    ranked.variant,
    ranked.upstream_revision,
    ranked.observed_at,
    coalesce((ranked.coverage_json::jsonb ->> 'truncated')::boolean, false) as dataset_truncated,
    members.entity_key,
    versions.payload_json::jsonb ->> 'player_id' as player_id,
    versions.payload_json::jsonb ->> 'team_id' as team_id,
    versions.payload_json::jsonb -> 'values' as source_values
from ranked
inner join {{ source('operational', 'stats_feed_members') }} as members
    on members.dataset_id = ranked.id
inner join {{ source('operational', 'stats_feed_versions') }} as versions
    on versions.id = members.version_id
where ranked.recency = 1
