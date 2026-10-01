{{ config(tags=['workbench']) }}

select
    dataset_id,
    game_id,
    team_id,
    count(*) as duplicate_count
from {{ ref('fct_workbench_team_game') }}
group by dataset_id, game_id, team_id
having count(*) > 1
