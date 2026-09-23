select *
from {{ ref('mart_archive_opponent_context') }}
where eligible_games < 5
  and (
    context_json ->> 'points_allowed_per_game' is not null
    or context_json ->> 'rebounds_allowed_per_game' is not null
    or context_json ->> 'assists_allowed_per_game' is not null
  )
