"""Historical team identities resolve by season without changing current-franchise lookups."""

from __future__ import annotations

from itertools import pairwise

from courtlens.domain.teams import (
    NBA_TEAMS,
    TEAM_ERAS,
    _team_seasons,
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
        by_code.setdefault(era.code + (era.franchise_id or ""), []).append(
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


def test_every_standings_team_season_resolves_to_its_name_and_alignment() -> None:
    seasons = _team_seasons()
    assert len(seasons) == 80
    assert sum(len(teams) for teams in seasons.values()) == 1724
    for season, teams in seasons.items():
        for code, row in teams.items():
            info = team_identity(code, season)
            assert info is not None, (code, season)
            # Basketball-Reference keeps "Los Angeles Clippers" after the 2015 rename.
            if not (code == "LAC" and season >= "2015-16"):
                assert info.name == row.name, (code, season)
            assert (info.conference, info.division) == (row.conference, row.division)


def test_alignment_follows_realignments() -> None:
    def alignment(team: str, season: str) -> tuple[str | None, str | None]:
        info = team_identity(team, season)
        assert info is not None
        return info.conference, info.division

    assert alignment("DAL", "1990-91") == ("Western", "Midwest")
    assert alignment("DAL", "2004-05") == ("Western", "Southwest")
    assert alignment("ATL", "2003-04") == ("Eastern", "Central")
    assert alignment("MIL", "1975-76") == ("Western", "Midwest")
    assert alignment("HOU", "1975-76") == ("Eastern", "Central")
    assert alignment("NOH", "2003-04") == ("Eastern", "Central")
    # Before 1970-71 the league had divisions only.
    assert alignment("BOS", "1960-61") == (None, "Eastern")
    assert alignment("MNL", "1949-50") == (None, "Central")
    # Without a season, current franchises keep today's alignment.
    assert team_identity("DAL") == get_team_info("DAL")


def test_older_identities_and_folded_teams() -> None:
    wilt = team_identity("PHW", "1961-62")
    assert wilt is not None and wilt.name == "Philadelphia Warriors"
    assert franchise_of("PHW") == "1610612744"
    assert franchise_of("BAL") == "1610612764"
    packers = team_identity("AND", "1949-50")
    assert packers is not None
    assert (packers.team_id, packers.name, packers.conference) == ("AND", "Anderson Packers", None)
    assert franchise_of("AND") is None
    assert resolve_team_label("BLB") == "Baltimore Bullets"
    assert team_identity("AND", "1950-51") is None
    clippers = team_identity("1610612746", "1990-91")
    assert clippers is not None and clippers.name == "Los Angeles Clippers"
    assert team_identity("LAC", "2015-16") == get_team_info("LAC")


def test_franchises_are_active_exactly_in_seasons_they_played() -> None:
    seasons = _team_seasons()
    for franchise, team in NBA_TEAMS.items():
        codes = {team.tricode} | {e.code for e in TEAM_ERAS if e.franchise_id == franchise}
        for season, teams in seasons.items():
            assert franchise_active(franchise, season) == bool(codes & set(teams)), (
                team.tricode,
                season,
            )


def test_playoff_seeds_use_the_seasons_conferences() -> None:
    from courtlens.domain.workbench_playoffs import reconstruct_regular_season_seeds

    records = [
        {"team_id": team, "gp": 82, "wins": wins, "losses": 82 - wins}
        for team, wins in (("NOH", 41), ("SEA", 37), ("1610612742", 52), ("XYZ", 60))
    ]
    seeds = reconstruct_regular_season_seeds(records, "2003-04")
    assert [t["tricode"] for t in seeds["Eastern"]] == ["NOH"]
    assert [t["tricode"] for t in seeds["Western"]] == ["DAL", "SEA"]
    # An unknown team is left out, never placed in a conference.
    assert all(t["team_id"] != "XYZ" for teams in seeds.values() for t in teams)
