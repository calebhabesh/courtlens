{{ config(tags=['stats_feed']) }}

-- Defensive tracking: opponent shooting when this player is the closest defender.
select
    rows.dataset_id,
    rows.season,
    rows.season_type,
    rows.player_id,
    rows.team_id,
    rows.variant as category,
    rows.source_values ->> 'player_name' as source_player_name,
    {{ json_number('rows.source_values', 'gp') }} as games,
    {{ json_number('rows.source_values', 'freq') }} as frequency,
    -- Each category names its columns after its zone (overall d_fga, under 6 ft fga_lt_06,
    -- threes fg3_a, …); exactly one of each set is present in a row.
    coalesce(
        {{ json_number('rows.source_values', 'd_fgm') }},
        {{ json_number('rows.source_values', 'fgm_lt_06') }},
        {{ json_number('rows.source_values', 'fgm_lt_10') }},
        {{ json_number('rows.source_values', 'fgm_gt_15') }},
        {{ json_number('rows.source_values', 'fg2_m') }},
        {{ json_number('rows.source_values', 'fg3_m') }}
    ) as defended_fgm,
    coalesce(
        {{ json_number('rows.source_values', 'd_fga') }},
        {{ json_number('rows.source_values', 'fga_lt_06') }},
        {{ json_number('rows.source_values', 'fga_lt_10') }},
        {{ json_number('rows.source_values', 'fga_gt_15') }},
        {{ json_number('rows.source_values', 'fg2_a') }},
        {{ json_number('rows.source_values', 'fg3_a') }}
    ) as defended_fga,
    coalesce(
        {{ json_number('rows.source_values', 'd_fg_pct') }},
        {{ json_number('rows.source_values', 'lt_06_pct') }},
        {{ json_number('rows.source_values', 'lt_10_pct') }},
        {{ json_number('rows.source_values', 'gt_15_pct') }},
        {{ json_number('rows.source_values', 'fg2_pct') }},
        {{ json_number('rows.source_values', 'fg3_pct') }}
    ) as defended_fg_pct,
    coalesce(
        {{ json_number('rows.source_values', 'normal_fg_pct') }},
        {{ json_number('rows.source_values', 'ns_lt_06_pct') }},
        {{ json_number('rows.source_values', 'ns_lt_10_pct') }},
        {{ json_number('rows.source_values', 'ns_gt_15_pct') }},
        {{ json_number('rows.source_values', 'ns_fg2_pct') }},
        {{ json_number('rows.source_values', 'ns_fg3_pct') }}
    ) as expected_fg_pct,
    coalesce(
        {{ json_number('rows.source_values', 'pct_plusminus') }},
        {{ json_number('rows.source_values', 'plusminus') }}
    ) as fg_pct_difference,
    rows.season || ':' || rows.season_type || ':' || rows.variant || ':' || rows.entity_key
        as row_key
from {{ ref('stg_stats_feed_rows') }} as rows
where rows.feed = 'defensive_tracking'
