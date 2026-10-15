{{ config(tags=['player_reference']) }}

-- Source-listed career honours as of acquisition, not honours at a historical game cutoff.
select
    p.player_id,
    honours.honour,
    honours.entry_number,
    p.profile_id,
    p.parser_version,
    p.acquisition_id,
    p.content_sha256,
    p.source_url,
    p.observed_at,
    p.observed_at as known_at,
    p.player_id || ':' || honours.entry_number as row_key
from {{ ref('stg_bbref_player_profiles') }} as p
cross join lateral jsonb_array_elements_text(coalesce(p.profile -> 'honours', '[]'::jsonb))
    with ordinality as honours(honour, entry_number)
