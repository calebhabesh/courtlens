-- Cap shares require that season's retained NBA threshold and an exact reported salary.
select player_id, season, record_kind, salary, share_of_cap
from {{ ref('mart_player_salaries') }}
where (share_of_cap is not null and (
    cap_cents is null or salary is null or league != 'NBA'
    or abs(share_of_cap - salary * 100 / cap_cents) > 0.000000000001
))
    or (cap_cents is null and cap_share_known_at is not null)
