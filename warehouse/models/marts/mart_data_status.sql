with latest_success as (
    select *
    from {{ source('operational', 'ingestion_runs') }}
    where status = 'succeeded'
    order by finished_at desc
    limit 1
)

select
    run_id as data_snapshot_id,
    source_name,
    case when source_name = 'fixture' then 'fixture' else 'operational' end as classification,
    started_at,
    finished_at,
    received_count,
    inserted_count,
    updated_count,
    unchanged_count,
    (select count(*) from {{ ref('stg_games') }}) as game_count,
    (select count(*) from {{ ref('stg_player_games') }}) as player_game_count,
    (select max(last_observed_at) from {{ ref('stg_games') }}) as latest_game_observation
from latest_success
