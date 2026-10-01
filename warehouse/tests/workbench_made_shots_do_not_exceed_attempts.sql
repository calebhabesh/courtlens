{{ config(tags=['workbench']) }}

select
    dataset_id,
    game_id,
    player_id,
    field_goals_made,
    field_goals_attempted,
    three_pointers_made,
    three_pointers_attempted,
    free_throws_made,
    free_throws_attempted
from {{ ref('fct_workbench_player_game') }}
where (field_goals_made is not null and field_goals_attempted is not null and field_goals_made > field_goals_attempted)
   or (three_pointers_made is not null and three_pointers_attempted is not null and three_pointers_made > three_pointers_attempted)
   or (free_throws_made is not null and free_throws_attempted is not null and free_throws_made > free_throws_attempted)
