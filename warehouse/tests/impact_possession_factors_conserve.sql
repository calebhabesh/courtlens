-- Independent scoring conservation for IM03, including noncount technical FT records.
select f.dataset_id, f.game_id, f.offense_team_id
from {{ ref('mart_workbench_possession_factors') }} f
join {{ source('operational', 'workbench_schedules') }} s
    on s.dataset_id = f.dataset_id and s.game_id = f.game_id
where f.points is distinct from (s.annotations_json->'conservation'->f.offense_team_id->>'points')::numeric
   or f.offensive_rebounds > f.orb_opportunities
   or f.ts_attempts <> f.fga + 0.44 * f.fta
   or f.possessions <= 0
