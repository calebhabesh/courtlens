-- Invariant: Stint duration must be non-negative
select
    id,
    game_id,
    stint_index,
    duration_seconds
from {{ ref('stg_workbench_lineup_stints') }}
where duration_seconds < 0
