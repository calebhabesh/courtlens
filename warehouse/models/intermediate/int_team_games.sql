with games as (
    select * from {{ ref('stg_games') }}
),

home_rows as (
    select
        game_key,
        scheduled_start_utc,
        reporting_game_date,
        season,
        game_type,
        status_state,
        postponed,
        home_team_key as team_key,
        away_team_key as opponent_team_key,
        true as is_home,
        home_score as points,
        away_score as opponent_points,
        case
            when status_state <> 'final' then null
            when home_score > away_score then 'W'
            when home_score < away_score then 'L'
            else 'T'
        end as result
    from games
),

away_rows as (
    select
        game_key,
        scheduled_start_utc,
        reporting_game_date,
        season,
        game_type,
        status_state,
        postponed,
        away_team_key as team_key,
        home_team_key as opponent_team_key,
        false as is_home,
        away_score as points,
        home_score as opponent_points,
        case
            when status_state <> 'final' then null
            when away_score > home_score then 'W'
            when away_score < home_score then 'L'
            else 'T'
        end as result
    from games
)

select * from home_rows
union all
select * from away_rows
