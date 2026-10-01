{{ config(tags=['workbench']) }}

select
    dataset_id,
    game_id,
    player_id,
    count(*) as duplicate_count
from {{ ref('fct_workbench_player_game') }}
group by dataset_id, game_id, player_id
having count(*) > 1
