{{ config(tags=['archive']) }}

with replay_dates as (
    select distinct dataset_id, season, game_date as replay_date
    from {{ ref('fct_archive_team_game') }}
),

players as (
    select distinct dataset_id, season, player_id, player_name
    from {{ ref('fct_archive_player_game') }}
    where appearance = 'appeared'
),

contexts as (
    select
        players.dataset_id,
        players.season,
        players.player_id,
        players.player_name,
        dates.replay_date,
        prior.team_id as inferred_team_id,
        prior.game_date as last_observed_date,
        target.game_id as target_game_id,
        target.game_date as target_game_date,
        target.opponent_id as target_opponent_id,
        target.game_date - dates.replay_date as lead_days
    from players
    inner join replay_dates as dates
        on dates.dataset_id = players.dataset_id and dates.season = players.season
    cross join lateral (
        select games.team_id, games.game_date
        from {{ ref('fct_archive_player_game') }} as games
        where games.dataset_id = players.dataset_id
          and games.season = players.season
          and games.player_id = players.player_id
          and games.appearance = 'appeared'
          and games.game_date < dates.replay_date
        order by games.game_date desc, games.game_id desc
        limit 1
    ) as prior
    cross join lateral (
        select games.game_id, games.game_date, games.opponent_id
        from {{ ref('fct_archive_team_game') }} as games
        where games.dataset_id = players.dataset_id
          and games.season = players.season
          and games.team_id = prior.team_id
          and games.game_date between dates.replay_date and dates.replay_date + 6
        order by games.game_date, games.game_id
        limit 1
    ) as target
    where dates.replay_date - prior.game_date <= 30
),

history as (
    select
        contexts.*,
        games.game_date as history_date,
        games.minutes_seconds,
        games.points,
        games.reference_points,
        games.field_goals_made,
        games.field_goals_attempted,
        games.three_pointers_made,
        games.three_pointers_attempted,
        games.free_throws_made,
        games.free_throws_attempted,
        row_number() over (
            partition by contexts.dataset_id, contexts.player_id, contexts.replay_date
            order by games.game_date desc, games.game_id desc
        ) as history_rank
    from contexts
    inner join {{ ref('fct_archive_player_game') }} as games
        on games.dataset_id = contexts.dataset_id
        and games.season = contexts.season
        and games.player_id = contexts.player_id
        and games.appearance = 'appeared'
        and games.game_date < contexts.replay_date
),

summaries as (
    select
        dataset_id,
        season,
        player_id,
        player_name,
        replay_date,
        inferred_team_id,
        last_observed_date,
        target_game_id,
        target_game_date,
        target_opponent_id,
        lead_days,
        max(history_date) as max_history_date,
        jsonb_build_object(
            'n', count(*) filter (where history_rank <= 5),
            'minutes_n', count(minutes_seconds) filter (where history_rank <= 5),
            'minutes_per_game', avg(minutes_seconds / 60.0) filter (
                where history_rank <= 5
            ),
            'points_n', count(points) filter (where history_rank <= 5),
            'points_per_game', avg(points) filter (where history_rank <= 5),
            'reference_points_n', count(reference_points) filter (where history_rank <= 5),
            'reference_points_per_game', avg(reference_points) filter (where history_rank <= 5),
            'reference_points_per_minute',
                sum(reference_points) filter (
                    where history_rank <= 5 and reference_points is not null
                      and minutes_seconds > 0
                ) / nullif(
                    sum(minutes_seconds / 60.0) filter (
                        where history_rank <= 5 and reference_points is not null
                          and minutes_seconds > 0
                    ), 0
                ),
            'fg_pct',
                sum(field_goals_made) filter (
                    where history_rank <= 5 and field_goals_made is not null
                      and field_goals_attempted is not null
                )::numeric / nullif(sum(field_goals_attempted) filter (
                    where history_rank <= 5 and field_goals_made is not null
                      and field_goals_attempted is not null
                ), 0),
            'fg3_pct',
                sum(three_pointers_made) filter (
                    where history_rank <= 5 and three_pointers_made is not null
                      and three_pointers_attempted is not null
                )::numeric / nullif(sum(three_pointers_attempted) filter (
                    where history_rank <= 5 and three_pointers_made is not null
                      and three_pointers_attempted is not null
                ), 0),
            'ft_pct',
                sum(free_throws_made) filter (
                    where history_rank <= 5 and free_throws_made is not null
                      and free_throws_attempted is not null
                )::numeric / nullif(sum(free_throws_attempted) filter (
                    where history_rank <= 5 and free_throws_made is not null
                      and free_throws_attempted is not null
                ), 0)
        ) as last_5_json,
        jsonb_build_object(
            'n', count(*) filter (where history_rank <= 10),
            'minutes_n', count(minutes_seconds) filter (where history_rank <= 10),
            'minutes_per_game', avg(minutes_seconds / 60.0) filter (
                where history_rank <= 10
            ),
            'points_n', count(points) filter (where history_rank <= 10),
            'points_per_game', avg(points) filter (where history_rank <= 10),
            'reference_points_n', count(reference_points) filter (where history_rank <= 10),
            'reference_points_per_game', avg(reference_points) filter (where history_rank <= 10),
            'reference_points_per_minute',
                sum(reference_points) filter (
                    where history_rank <= 10 and reference_points is not null
                      and minutes_seconds > 0
                ) / nullif(
                    sum(minutes_seconds / 60.0) filter (
                        where history_rank <= 10 and reference_points is not null
                          and minutes_seconds > 0
                    ), 0
                ),
            'fg_pct',
                sum(field_goals_made) filter (
                    where history_rank <= 10 and field_goals_made is not null
                      and field_goals_attempted is not null
                )::numeric / nullif(sum(field_goals_attempted) filter (
                    where history_rank <= 10 and field_goals_made is not null
                      and field_goals_attempted is not null
                ), 0),
            'fg3_pct',
                sum(three_pointers_made) filter (
                    where history_rank <= 10 and three_pointers_made is not null
                      and three_pointers_attempted is not null
                )::numeric / nullif(sum(three_pointers_attempted) filter (
                    where history_rank <= 10 and three_pointers_made is not null
                      and three_pointers_attempted is not null
                ), 0),
            'ft_pct',
                sum(free_throws_made) filter (
                    where history_rank <= 10 and free_throws_made is not null
                      and free_throws_attempted is not null
                )::numeric / nullif(sum(free_throws_attempted) filter (
                    where history_rank <= 10 and free_throws_made is not null
                      and free_throws_attempted is not null
                ), 0)
        ) as last_10_json,
        jsonb_build_object(
            'n', count(*),
            'minutes_n', count(minutes_seconds),
            'minutes_per_game', avg(minutes_seconds / 60.0),
            'points_n', count(points),
            'points_per_game', avg(points),
            'reference_points_n', count(reference_points),
            'reference_points_per_game', avg(reference_points),
            'reference_points_stddev', stddev_samp(reference_points),
            'reference_points_per_minute',
                sum(reference_points) filter (
                    where reference_points is not null and minutes_seconds > 0
                ) / nullif(sum(minutes_seconds / 60.0) filter (
                    where reference_points is not null and minutes_seconds > 0
                ), 0),
            'fg_pct', sum(field_goals_made) filter (
                where field_goals_made is not null and field_goals_attempted is not null
            )::numeric / nullif(sum(field_goals_attempted) filter (
                where field_goals_made is not null and field_goals_attempted is not null
            ), 0),
            'fg3_pct', sum(three_pointers_made) filter (
                where three_pointers_made is not null and three_pointers_attempted is not null
            )::numeric / nullif(sum(three_pointers_attempted) filter (
                where three_pointers_made is not null and three_pointers_attempted is not null
            ), 0),
            'ft_pct', sum(free_throws_made) filter (
                where free_throws_made is not null and free_throws_attempted is not null
            )::numeric / nullif(sum(free_throws_attempted) filter (
                where free_throws_made is not null and free_throws_attempted is not null
            ), 0)
        ) as season_json
    from history
    group by
        dataset_id, season, player_id, player_name, replay_date, inferred_team_id,
        last_observed_date, target_game_id, target_game_date, target_opponent_id, lead_days
)

select
    *,
    replay_date::timestamp at time zone '{{ var("replay_timezone", "America/New_York") }}'
        as cutoff_utc
from summaries
