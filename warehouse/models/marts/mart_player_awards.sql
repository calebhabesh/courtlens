{{ config(tags=['player_reference']) }}

-- Season awards are retrospective, known after the season ends. The exact announcement
-- date is unknown; observed_at is the actual local known-at boundary, never the season date.
select
    p.player_id,
    seasons.key as season,
    codes.code as award_code,
    regexp_replace(codes.code, '-[0-9]+$', '') as award,
    substring(codes.code from '-([0-9]+)$')::integer as vote_place,
    'retrospective_season_award'::text as temporal_basis,
    p.observed_at as known_at,
    p.profile_id,
    p.parser_version,
    p.acquisition_id,
    p.content_sha256,
    p.source_url,
    p.observed_at,
    p.player_id || ':' || seasons.key || ':' || codes.code as row_key
from {{ ref('stg_bbref_player_profiles') }} as p
cross join lateral jsonb_each(coalesce(p.profile -> 'awards', '{}'::jsonb)) as seasons
cross join lateral jsonb_array_elements_text(seasons.value) as codes(code)
