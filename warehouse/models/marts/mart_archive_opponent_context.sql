{{ config(tags=['archive']) }}

with replay_dates as (
    select distinct dataset_id, season, game_date as replay_date
    from {{ ref('fct_archive_team_game') }}
),

teams as (
    select distinct dataset_id, season, team_id
    from {{ ref('fct_archive_team_game') }}
),

ranked as (
    select
        teams.dataset_id,
        teams.season,
        teams.team_id,
        dates.replay_date,
        production.game_date as history_date,
        production.points,
        production.rebounds,
        production.assists,
        production.steals,
        production.blocks,
        production.turnovers,
        row_number() over (
            partition by teams.dataset_id, teams.season, teams.team_id, dates.replay_date
            order by production.game_date desc, production.game_id desc
        ) as history_rank
    from teams
    inner join replay_dates as dates
        on dates.dataset_id = teams.dataset_id and dates.season = teams.season
    inner join {{ ref('fct_archive_team_game') }} as production
        on production.dataset_id = teams.dataset_id
        and production.season = teams.season
        and production.opponent_id = teams.team_id
        and production.game_date < dates.replay_date
),

last_ten as (
    select * from ranked where history_rank <= 10
)

select
    dataset_id,
    season,
    team_id,
    replay_date,
    count(*) as eligible_games,
    max(history_date) as max_history_date,
    jsonb_build_object(
        'window', 10,
        'eligible_games', count(*),
        'points_n', count(points),
        'points_allowed_per_game', case when count(points) >= 5 then avg(points) end,
        'rebounds_n', count(rebounds),
        'rebounds_allowed_per_game', case when count(rebounds) >= 5 then avg(rebounds) end,
        'assists_n', count(assists),
        'assists_allowed_per_game', case when count(assists) >= 5 then avg(assists) end,
        'steals_n', count(steals),
        'steals_allowed_per_game', case when count(steals) >= 5 then avg(steals) end,
        'blocks_n', count(blocks),
        'blocks_allowed_per_game', case when count(blocks) >= 5 then avg(blocks) end,
        'turnovers_n', count(turnovers),
        'turnovers_per_game', case when count(turnovers) >= 5 then avg(turnovers) end
    ) as context_json
from last_ten
group by dataset_id, season, team_id, replay_date
