select
    player_key,
    source_player_id,
    trim(full_name) as full_name,
    listed_position,
    current_team_key,
    active,
    first_seen_at,
    last_seen_at,
    source_object_id
from {{ source('operational', 'dim_players') }}
