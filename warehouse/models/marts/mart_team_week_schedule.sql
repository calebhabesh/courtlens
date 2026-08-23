with eligible_games as (
    select *
    from {{ ref('int_team_games') }}
    where not postponed
      and status_state not in ('postponed', 'canceled', 'suspended', 'abandoned')
),

slates as (
    select reporting_game_date, count(distinct game_key) as league_games
    from eligible_games
    group by reporting_game_date
),

sequenced as (
    select
        games.*,
        lag(reporting_game_date) over (
            partition by team_key order by reporting_game_date, game_key
        ) as prior_game_date
    from eligible_games as games
)

select
    team_key,
    date_trunc('week', reporting_game_date)::date as week_start,
    (date_trunc('week', reporting_game_date)::date + 6) as week_end,
    count(*) as games_scheduled,
    jsonb_agg(reporting_game_date order by reporting_game_date) as game_dates_json,
    count(*) filter (where slates.league_games <= 5) as light_slate_games,
    count(*) filter (where reporting_game_date - prior_game_date = 1) as back_to_backs,
    max(scheduled_start_utc) as latest_scheduled_tipoff
from sequenced
inner join slates using (reporting_game_date)
group by team_key, date_trunc('week', reporting_game_date)::date
