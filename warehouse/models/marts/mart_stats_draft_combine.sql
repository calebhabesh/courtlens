{{ config(tags=['stats_feed']) }}

-- Draft combine measurements. The combine-stats feed is preferred; the anthropometric
-- feed fills only values the stats feed left null. Neither is a listed roster measurement.
with stats as (
    select * from {{ ref('stg_stats_feed_rows') }} where feed = 'combine_stats'
),

anthro as (
    select * from {{ ref('stg_stats_feed_rows') }} where feed = 'combine_anthro'
),

joined as (
    select
        coalesce(stats.season, anthro.season) as draft_year,
        coalesce(stats.entity_key, anthro.entity_key) as entity_key,
        coalesce(stats.player_id, anthro.player_id) as player_id,
        stats.source_values as stats_values,
        anthro.source_values as anthro_values,
        stats.dataset_id as stats_dataset_id,
        anthro.dataset_id as anthro_dataset_id
    from stats
    full outer join anthro
        on anthro.season = stats.season
        and anthro.entity_key = stats.entity_key
)

select
    draft_year::integer as draft_year,
    player_id,
    entity_key,
    coalesce(stats_values, anthro_values) ->> 'player_name' as source_player_name,
    coalesce(stats_values, anthro_values) ->> 'position' as combine_position,
    coalesce(
        {{ json_number('stats_values', 'height_wo_shoes') }},
        {{ json_number('anthro_values', 'height_wo_shoes') }}
    ) as height_no_shoes_inches,
    coalesce(
        {{ json_number('stats_values', 'height_w_shoes') }},
        {{ json_number('anthro_values', 'height_w_shoes') }}
    ) as height_shoes_inches,
    coalesce(
        {{ json_number('stats_values', 'wingspan') }},
        {{ json_number('anthro_values', 'wingspan') }}
    ) as wingspan_inches,
    coalesce(
        {{ json_number('stats_values', 'standing_reach') }},
        {{ json_number('anthro_values', 'standing_reach') }}
    ) as standing_reach_inches,
    coalesce(
        {{ json_number('stats_values', 'weight') }},
        {{ json_number('anthro_values', 'weight') }}
    ) as weight_lbs,
    coalesce(
        {{ json_number('stats_values', 'body_fat_pct') }},
        {{ json_number('anthro_values', 'body_fat_pct') }}
    ) as body_fat_pct,
    coalesce(
        {{ json_number('stats_values', 'hand_length') }},
        {{ json_number('anthro_values', 'hand_length') }}
    ) as hand_length_inches,
    coalesce(
        {{ json_number('stats_values', 'hand_width') }},
        {{ json_number('anthro_values', 'hand_width') }}
    ) as hand_width_inches,
    {{ json_number('stats_values', 'standing_vertical_leap') }} as standing_vertical_inches,
    {{ json_number('stats_values', 'max_vertical_leap') }} as max_vertical_inches,
    {{ json_number('stats_values', 'lane_agility_time') }} as lane_agility_seconds,
    {{ json_number('stats_values', 'three_quarter_sprint') }} as three_quarter_sprint_seconds,
    stats_dataset_id,
    anthro_dataset_id,
    draft_year || ':' || entity_key as row_key
from joined
