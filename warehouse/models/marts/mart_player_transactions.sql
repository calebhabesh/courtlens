{{ config(tags=['player_reference']) }}

-- Event date describes what happened; observed_at describes when this installation knew it.
-- Team codes come only from explicit data-attr-from/to markings, never other players' links.
select
    p.player_id,
    (events.value ->> 'date')::date as date,
    events.value ->> 'type' as type,
    events.value ->> 'from_team_code' as from_team,
    events.value ->> 'to_team_code' as to_team,
    events.value ->> 'description' as description,
    events.entry_number,
    p.profile_id,
    p.parser_version,
    p.acquisition_id,
    p.content_sha256,
    p.source_url,
    p.observed_at,
    p.observed_at as known_at,
    p.player_id || ':' || events.entry_number as row_key
from {{ ref('stg_bbref_player_profiles') }} as p
cross join lateral jsonb_array_elements(coalesce(p.profile -> 'transactions', '[]'::jsonb))
    with ordinality as events(value, entry_number)
