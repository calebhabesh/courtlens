-- Invariant: Each lineup stint must have exactly 5 distinct players per side
select
    id,
    game_id,
    stint_index,
    home_lineup_json,
    away_lineup_json
from {{ ref('stg_workbench_lineup_stints') }}
where json_array_length(home_lineup_json::json) != 5
   or json_array_length(away_lineup_json::json) != 5
