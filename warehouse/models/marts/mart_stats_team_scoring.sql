{{ config(materialized='view', tags=['stats_feed']) }}

-- NBA Stats team Misc season totals, one row per team-season-phase: points off turnovers,
-- second-chance, fast-break and paint points, scored and allowed. A view, so the latest admitted
-- observation shows without a rebuild. Non-numeric source values become null (unknown, not 0).
-- Files before 2025-26 declare only the start year: the server proves the season by matching
-- each team's games and wins (gp, w) to its own record.
with rows as (
    select *
    from {{ ref('stg_stats_feed_rows') }}
    where feed = 'team_misc' and variant = 'misc'
)

select
    rows.dataset_id,
    rows.season,
    rows.season_type,
    rows.team_id,
    rows.observed_at,
    rows.upstream_revision,
    {#- Source key -> column. The feed parser snake-cases PTS_2ND_CHANCE as pts_2_nd_chance. #}
    {% set fields = {
        'gp': 'gp', 'w': 'w', 'l': 'l', 'min': 'min',
        'pts_off_tov': 'pts_off_tov', 'pts_2_nd_chance': 'pts_2nd_chance',
        'pts_fb': 'pts_fb', 'pts_paint': 'pts_paint',
        'opp_pts_off_tov': 'opp_pts_off_tov', 'opp_pts_2_nd_chance': 'opp_pts_2nd_chance',
        'opp_pts_fb': 'opp_pts_fb', 'opp_pts_paint': 'opp_pts_paint',
    } %}
    {% for key, column in fields.items() %}
    case
        when jsonb_typeof(rows.source_values -> '{{ key }}') = 'number'
            then (rows.source_values ->> '{{ key }}')::numeric
    end as {{ column }},
    {% endfor %}
    rows.season || ':' || rows.season_type || ':' || rows.team_id as row_key
from rows
