{{ config(tags=['player_reference']) }}

-- History and current reports are separate grains; do not sum them together as earnings.
-- Reported base salaries, not cap hits or realized cash. Options do not imply exercise.
with thresholds as (
    select distinct on (season)
        season,
        id as threshold_id,
        observed_at as cap_observed_at,
        (payload_json::jsonb ->> 'cap_cents')::numeric as cap_cents
    from {{ source('operational', 'finance_thresholds') }}
    order by season, observed_at desc, id desc
),

reports as (
    select
        p.*,
        kinds.record_kind,
        salaries.value,
        salaries.entry_number
    from {{ ref('stg_bbref_player_profiles') }} as p
    cross join (values ('salary_history'), ('current_contract')) as kinds(record_kind)
    cross join lateral jsonb_array_elements(
        coalesce(p.profile -> kinds.record_kind, '[]'::jsonb)
    ) with ordinality as salaries(value, entry_number)
)

select
    r.player_id,
    r.value ->> 'season' as season,
    r.value ->> 'team' as team,
    r.value ->> 'team_code' as team_code,
    case when r.record_kind = 'current_contract' then 'NBA' else r.value ->> 'league' end as league,
    r.record_kind,
    (r.value ->> 'salary')::numeric as salary,
    r.value ->> 'salary_note' as salary_note,
    r.value ->> 'option' as option,
    (r.value ->> 'salary')::numeric * 100 / nullif(t.cap_cents, 0) as share_of_cap,
    t.cap_cents,
    t.threshold_id,
    t.cap_observed_at,
    case when r.value ->> 'salary' is not null and t.cap_cents is not null
        then greatest(r.observed_at, t.cap_observed_at) end as cap_share_known_at,
    r.observed_at as known_at,
    r.profile_id,
    r.parser_version,
    r.acquisition_id,
    r.content_sha256,
    r.source_url,
    r.observed_at,
    r.player_id || ':' || r.record_kind || ':' || r.entry_number as row_key
from reports as r
left join thresholds as t on t.season = r.value ->> 'season'
-- ABA reports are retained but must never borrow an NBA cap threshold.
    and case when r.record_kind = 'current_contract' then 'NBA' else r.value ->> 'league' end = 'NBA'
