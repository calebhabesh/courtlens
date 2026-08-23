with eligible as (
    select
        team_key,
        reporting_game_date,
        game_key,
        lag(reporting_game_date) over (
            partition by team_key order by reporting_game_date, game_key
        ) as prior_game_date
    from {{ ref('int_team_games') }}
    where not postponed
      and status_state not in ('postponed', 'canceled', 'suspended', 'abandoned')
),

expected as (
    select
        team_key,
        date_trunc('week', reporting_game_date)::date as week_start,
        count(*) as games_scheduled,
        count(*) filter (where reporting_game_date - prior_game_date = 1) as back_to_backs
    from eligible
    group by team_key, date_trunc('week', reporting_game_date)::date
),

actual as (
    select team_key, week_start, games_scheduled, back_to_backs
    from {{ ref('mart_team_week_schedule') }}
)

select
    coalesce(expected.team_key, actual.team_key) as team_key,
    coalesce(expected.week_start, actual.week_start) as week_start
from expected
full outer join actual using (team_key, week_start)
where expected.games_scheduled is distinct from actual.games_scheduled
   or expected.back_to_backs is distinct from actual.back_to_backs
