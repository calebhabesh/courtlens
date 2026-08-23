with ranked as (
    select
        scored.*,
        row_number() over (
            partition by player_key order by scheduled_start_utc desc, game_key desc
        ) as recent_rank
    from {{ ref('int_player_games_scored') }} as scored
),

last_ten as (
    select * from ranked where recent_rank <= 10
)

select
    player_key,
    current_timestamp as calculated_as_of,
    10 as window_games,
    count(*) as games_played,
    round(avg(minutes)::numeric, 2) as avg_minutes,
    round(avg(fantasy_points_default)::numeric, 2) as fantasy_points_per_game,
    round((sum(fantasy_points_default) / nullif(sum(minutes), 0))::numeric, 3)
        as fantasy_points_per_minute,
    round((count(*)::numeric / 10), 3) as data_completeness,
    max(scheduled_start_utc) as latest_game_tipoff
from last_ten
group by player_key
