{{ config(tags=['player_reference']) }}

-- Current retrospective reference only. This is independent of sealed basketball datasets.
-- Reparse creation time breaks ties within the same original acquisition time.
select distinct on (player_id)
    player_id,
    id as profile_id,
    bbref_id,
    parser_version,
    acquisition_id,
    content_sha256,
    observed_at,
    created_at as parsed_at,
    profile::jsonb as profile,
    'https://www.basketball-reference.com/players/' || left(bbref_id, 1)
        || '/' || bbref_id || '.html' as source_url
from {{ source('operational', 'bbref_player_profiles') }}
order by player_id, observed_at desc, created_at desc, parser_version desc, id desc
