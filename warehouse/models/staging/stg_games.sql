select
    game_key,
    source_game_id,
    season,
    game_type,
    scheduled_start_utc,
    (scheduled_start_utc at time zone '{{ var("reporting_timezone") }}')::date as reporting_game_date,
    status,
    status_state,
    home_team_key,
    away_team_key,
    home_score,
    away_score,
    neutral_site,
    postponed,
    source_object_id,
    last_observed_at
from {{ source('operational', 'fct_games') }}
