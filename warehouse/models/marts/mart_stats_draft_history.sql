{{ config(tags=['stats_feed']) }}

select
    rows.dataset_id,
    rows.season::integer as draft_year,
    rows.player_id,
    rows.source_values ->> 'player_name' as source_player_name,
    {{ json_number('rows.source_values', 'round_number') }}::integer as round_number,
    {{ json_number('rows.source_values', 'round_pick') }}::integer as round_pick,
    {{ json_number('rows.source_values', 'overall_pick') }}::integer as overall_pick,
    rows.source_values ->> 'draft_type' as draft_type,
    nullif(rows.source_values ->> 'team_id', '0') as drafting_team_id,
    rows.source_values ->> 'organization' as organization,
    rows.source_values ->> 'organization_type' as organization_type,
    rows.season || ':' || rows.entity_key as row_key
from {{ ref('stg_stats_feed_rows') }} as rows
where rows.feed = 'draft_history'
