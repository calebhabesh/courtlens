{{ config(tags=['stats_feed']) }}

-- One biography row per NBA person: the latest admitted all-time player index (country,
-- college, draft, current listing) plus the birth date the team rosters list. Values the
-- sources do not list stay null.
with latest_index as (
    select *
    from {{ ref('stg_stats_feed_rows') }}
    where feed = 'player_index'
        and season = (
            select max(season) from {{ ref('stg_stats_feed_rows') }} where feed = 'player_index'
        )
),

birth_dates as (
    -- The most often listed date; ties go to the latest season's listing.
    select distinct on (player_id) player_id, birth_date
    from (
        select player_id, birth_date, count(*) as listings, max(season) as last_season
        from {{ ref('mart_player_roster_seasons') }}
        where birth_date is not null
        group by player_id, birth_date
    ) as counted
    order by player_id, listings desc, last_season desc
)

select
    idx.player_id,
    trim(
        coalesce(idx.source_values ->> 'player_first_name', '') || ' '
        || coalesce(idx.source_values ->> 'player_last_name', '')
    ) as source_player_name,
    nullif(trim(idx.source_values ->> 'jersey_number'), '') as jersey,
    nullif(trim(idx.source_values ->> 'position'), '') as listed_position,
    case
        when (idx.source_values ->> 'height') ~ '^[0-9]+-[0-9]+$'
            then split_part(idx.source_values ->> 'height', '-', 1)::integer * 12
                + split_part(idx.source_values ->> 'height', '-', 2)::integer
    end as listed_height_inches,
    {{ json_number('idx.source_values', 'weight') }} as listed_weight_lbs,
    nullif(trim(idx.source_values ->> 'college'), '') as college,
    nullif(trim(idx.source_values ->> 'country'), '') as country,
    case when (idx.source_values ->> 'draft_year') ~ '^[0-9]{4}$'
        then (idx.source_values ->> 'draft_year')::integer end as draft_year,
    {{ json_number('idx.source_values', 'draft_round') }}::integer as draft_round,
    {{ json_number('idx.source_values', 'draft_number') }}::integer as draft_number,
    case when (idx.source_values ->> 'from_year') ~ '^[0-9]{4}$'
        then (idx.source_values ->> 'from_year')::integer end as from_year,
    case when (idx.source_values ->> 'to_year') ~ '^[0-9]{4}$'
        then (idx.source_values ->> 'to_year')::integer end as to_year,
    -- The team a player is on today. Only active-roster players have one: the index keeps a
    -- retired player's last team, which is not a current listing.
    case when (idx.source_values ->> 'roster_status') ~ '^1(\.0+)?$'
        then nullif(idx.source_values ->> 'team_id', '0') end as listed_team_id,
    birth_dates.birth_date,
    idx.season as index_season,
    idx.dataset_id
from latest_index as idx
left join birth_dates on birth_dates.player_id = idx.player_id
