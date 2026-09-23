select dataset_id, game_id, player_id
from {{ ref('fct_archive_player_game') }}
group by dataset_id, game_id, player_id
having count(*) <> 1
