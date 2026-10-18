"""Historical team identities resolve by season without changing current-franchise lookups."""

from __future__ import annotations

from itertools import pairwise

from courtlens.domain.teams import (
    TEAM_ERAS,
    franchise_active,
    franchise_of,
    get_team_info,
    resolve_team_label,
    season_team_id,
    team_era,
    team_identity,
)

THUNDER = "1610612760"
CHARLOTTE = "1610612766"
PELICANS = "1610612740"


def test_era_codes_resolve_to_their_names_and_franchise() -> None:
    sonics = team_identity("SEA", "2005-06")
    assert sonics is not None
    assert (sonics.team_id, sonics.tricode, sonics.name) == ("SEA", "SEA", "Seattle SuperSonics")
    assert sonics.division == "Northwest"
    assert team_identity("SEA", "2001-02").division == "Pacific"  # type: ignore[union-attr]
    assert franchise_of("SEA") == THUNDER
    assert franchise_of("CHH") == CHARLOTTE
    assert franchise_of("NOK") == PELICANS
    assert franchise_of(THUNDER) == THUNDER
    assert resolve_team_label("NJN") == "New Jersey Nets"


def test_franchise_ids_map_to_the_id_a_season_stores() -> None:
    assert season_team_id(THUNDER, "2000-01") == "SEA"
    assert season_team_id(THUNDER, "2008-09") == THUNDER
    assert season_team_id(PELICANS, "2002-03") == "NOH"
    assert season_team_id(PELICANS, "2005-06") == "NOK"
    assert season_team_id(PELICANS, "2013-14") == PELICANS
    assert season_team_id(CHARLOTTE, "2001-02") == "CHH"
    # Bobcats games stay under the franchise id; only the name changes.
    assert season_team_id(CHARLOTTE, "2005-06") == CHARLOTTE
    bobcats = team_identity(CHARLOTTE, "2005-06")
    assert bobcats is not None
    assert (bobcats.team_id, bobcats.name) == (CHARLOTTE, "Charlotte Bobcats")
    assert team_identity(CHARLOTTE, "2014-15") == get_team_info(CHARLOTTE)


def test_outside_an_era_nothing_is_invented() -> None:
    assert team_era("SEA", "2015-16") is None
    assert team_identity("SEA", "2015-16") is None
    assert team_era(THUNDER) is None
    assert get_team_info("SEA") is None


def test_eras_of_one_code_do_not_overlap() -> None:
    by_code: dict[str, list[tuple[int, int]]] = {}
    for era in TEAM_ERAS:
        by_code.setdefault(era.code + era.franchise_id, []).append(
            (int(era.first_season[:4]), int(era.last_season[:4]))
        )
    for spans in by_code.values():
        ordered = sorted(spans)
        assert all(a[1] < b[0] for a, b in pairwise(ordered))


def test_franchises_without_a_team_that_season_are_inactive() -> None:
    assert not franchise_active(PELICANS, "2001-02")
    assert franchise_active(PELICANS, "2002-03")
    assert not franchise_active(CHARLOTTE, "2003-04")
    assert franchise_active(CHARLOTTE, "2001-02")
    assert franchise_active(CHARLOTTE, "2004-05")
    assert franchise_active(THUNDER, "2000-01")
