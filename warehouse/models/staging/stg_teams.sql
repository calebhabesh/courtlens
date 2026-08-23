select
    team_key,
    source_team_id,
    upper(abbreviation) as abbreviation,
    city,
    name,
    full_name,
    conference,
    division,
    valid_from,
    valid_to,
    source_object_id
from {{ source('operational', 'dim_teams') }}
