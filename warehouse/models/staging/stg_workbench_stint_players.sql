{{ config(tags=['workbench']) }}

select
    sp.id,
    sp.dataset_id,
    sp.stint_id,
    sp.game_id,
    sp.team_id,
    sp.opponent_team_id,
    sp.player_id,
    coalesce(identities.display_name, sp.player_id) as player_name,
    sp.side,
    sp.period,
    sp.duration_seconds,
    coalesce(sp.duration_seconds / 60.0, 0.0) as duration_minutes,
    sp.possessions,
    sp.opponent_possessions,
    sp.points,
    sp.team_points,
    sp.points_allowed,
    sp.team_points - sp.points_allowed as point_differential,
    sp.stats_json,
    (sp.stats_json ->> 'fgm')::integer as fgm,
    (sp.stats_json ->> 'fga')::integer as fga,
    (sp.stats_json ->> 'fg3m')::integer as fg3m,
    (sp.stats_json ->> 'fg3a')::integer as fg3a,
    (sp.stats_json ->> 'ftm')::integer as ftm,
    (sp.stats_json ->> 'fta')::integer as fta,
    (sp.stats_json ->> 'oreb')::integer as oreb,
    (sp.stats_json ->> 'dreb')::integer as dreb,
    (sp.stats_json ->> 'ast')::integer as ast,
    (sp.stats_json ->> 'stl')::integer as stl,
    (sp.stats_json ->> 'blk')::integer as blk,
    (sp.stats_json ->> 'tov')::integer as tov,
    (sp.stats_json ->> 'pf')::integer as pf
from {{ source('operational', 'workbench_stint_players') }} as sp
left join {{ source('operational', 'workbench_identities') }} as identities
    on identities.external_id = sp.player_id
    and identities.kind = 'player'
{% if var('workbench_dataset_id', none) %}
where sp.dataset_id = '{{ var("workbench_dataset_id") }}'
{% endif %}
