{{ config(tags=['archive']) }}

select * from {{ ref('stg_archive_team_games') }}
