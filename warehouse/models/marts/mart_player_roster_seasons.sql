{{ config(tags=['stats_feed']) }}

-- Team-reported roster listings per season (NBA Stats team rosters as mirrored when fetched).
-- A player traded mid-season may appear on only one team's file; absence is unknown, not zero.
-- Heights "6-11" become inches; "R" (rookie) is zero prior seasons of experience.
with rosters as (
    select * from {{ ref('stg_stats_feed_rows') }} where feed = 'team_roster'
)

select
    season,
    team_id,
    player_id,
    source_values ->> 'player' as source_player_name,
    nullif(trim(source_values ->> 'num'), '') as jersey,
    nullif(trim(source_values ->> 'position'), '') as listed_position,
    case
        when (source_values ->> 'height') ~ '^[0-9]+-[0-9]+$'
            then split_part(source_values ->> 'height', '-', 1)::integer * 12
                + split_part(source_values ->> 'height', '-', 2)::integer
    end as listed_height_inches,
    {{ json_number('source_values', 'weight') }} as listed_weight_lbs,
    case
        when (source_values ->> 'birth_date') ~ '^[A-Z]{3} [0-9]{2}, [0-9]{4}$'
            then to_date(source_values ->> 'birth_date', 'MON DD, YYYY')
    end as birth_date,
    case
        when upper(trim(source_values ->> 'exp')) = 'R' then 0
        when (source_values ->> 'exp') ~ '^\s*[0-9]+\s*$' then trim(source_values ->> 'exp')::integer
    end as prior_seasons,
    nullif(trim(source_values ->> 'school'), '') as school,
    nullif(trim(source_values ->> 'how_acquired'), '') as how_acquired,
    dataset_id,
    season || ':' || team_id || ':' || player_id as row_key
from rosters
