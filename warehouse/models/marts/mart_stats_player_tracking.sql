{{ config(tags=['stats_feed']) }}

-- Tracking dashboards in long form: one numeric source value per row. Measures differ in
-- their columns, so values are not pivoted here. Non-numeric and null values are omitted;
-- an omitted value is unknown, never zero.
select
    rows.dataset_id,
    rows.season,
    rows.season_type,
    rows.player_id,
    rows.team_id,
    rows.variant as measure,
    entries.key as stat,
    entries.value::text::numeric as value,
    rows.season || ':' || rows.season_type || ':' || rows.variant || ':' || rows.entity_key
        || ':' || entries.key as row_key
from {{ ref('stg_stats_feed_rows') }} as rows
cross join lateral jsonb_each(rows.source_values) as entries
where rows.feed = 'tracking'
    and jsonb_typeof(entries.value) = 'number'
    and entries.key not in ('player_id', 'team_id')
