{{ config(tags=['workbench', 'impact']) }}

-- Factor numerators and denominators remain additive; zero denominators are unknown rates.
select
    dataset_id,
    game_id,
    game_date,
    season,
    phase,
    offense_team_id,
    defense_team_id,
    policy_version,
    status as quality,
    sum(case when count_as_possession then 1 else 0 end) as possessions,
    sum(points) as points,
    sum((stats_json->>'fga')::numeric) as fga,
    sum((stats_json->>'fta')::numeric) as fta,
    sum((stats_json->>'ts_attempts')::numeric) as ts_attempts,
    sum((stats_json->>'turnovers')::numeric) as turnovers,
    sum((stats_json->>'orb_opportunities')::numeric) as orb_opportunities,
    sum((stats_json->>'orb')::numeric) as offensive_rebounds
from {{ ref('fct_workbench_possession') }}
where policy_version = 'possession-policy-v2'
group by dataset_id, game_id, game_date, season, phase,
    offense_team_id, defense_team_id, policy_version, status
