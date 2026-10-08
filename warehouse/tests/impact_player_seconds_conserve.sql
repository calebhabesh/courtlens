select s.dataset_id, s.game_id, s.stint_index
from {{ source('operational', 'workbench_lineup_stints') }} s
join {{ source('operational', 'workbench_stint_players') }} p on p.stint_id = s.id
where s.policy_version = 'possession-policy-v2'
group by s.dataset_id, s.game_id, s.stint_index, s.duration_seconds
having count(*) <> 10 or abs(sum(p.duration_seconds) - 10 * s.duration_seconds) > 0.000001
