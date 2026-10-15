from datetime import UTC, date, datetime

import pytest
from sqlalchemy.orm import Session

from courtlens.ingestion.bbref_players import (
    IndexEntry,
    NbaPlayer,
    match_players,
    normalize_name,
    parse_index,
    parse_player_page,
)
from courtlens.reference_models import BbrefPlayerProfile
from courtlens.services.bbref_bio import player_reference, validate_bbref_url
from courtlens.workbench_models import WorkbenchAcquisition

INDEX = b"""<html><body><table id="players"><tbody>
<tr><th data-stat="player" data-append-csv="leonaka01">
<strong><a href="/players/l/leonaka01.html">Kawhi Leonard</a></strong></th>
<td data-stat="year_min">2012</td><td data-stat="year_max">2026</td>
<td data-stat="birth_date" csk="19910629">June 29, 1991</td></tr>
<tr><th data-stat="player" data-append-csv="lylestr01">
<a href="/players/l/lylestr01.html">Trey Lyles</a></th>
<td data-stat="year_min">2016</td><td data-stat="year_max">2026</td>
<td data-stat="birth_date" csk="">-</td></tr>
</tbody></table></body></html>"""

PAGE = b"""<html><body><div id="meta"><div><h1><span>Kawhi Leonard</span></h1>
<p><strong>Position:</strong> Small Forward &#9642; <strong>Shoots:</strong> Right</p>
<p><strong>Born: </strong><span id="necro-birth" data-birth="1991-06-29">June 29, 1991</span>
<span>in&nbsp;Los Angeles,&nbsp;<a href="/x">California</a></span>
<span class="f-i f-us">us</span></p>
<p><strong>High School:</strong> King in Riverside, <a href="/y">California</a></p>
<p><strong>NBA Debut: </strong><a href="/z">December 26, 2011</a></p>
</div></div>
<ul id="bling"><li><a>7x All Star</a></li><li><a>2x NBA Champ</a></li></ul>
<!-- <table id="per_game_stats"><tbody>
<tr><th data-stat="year_id">2015-16</th><td data-stat="awards">MVP-2,DPOY-1,AS,NBA1</td></tr>
<tr><th data-stat="year_id">2017-18</th><td data-stat="awards"></td></tr>
<tr><th data-stat="year_id">Career</th><td data-stat="awards"></td></tr>
</tbody></table> -->
</body></html>"""


def test_index_rows_carry_ids_seasons_and_birth_dates() -> None:
    entries = parse_index(INDEX)
    assert entries[0] == IndexEntry("leonaka01", "Kawhi Leonard", 2012, 2026, date(1991, 6, 29))
    assert entries[1].birth_date is None
    assert parse_index(b'<table id="players"><tbody></tbody></table>') == []
    with pytest.raises(ValueError):
        parse_index(b"<html><body>Page moved</body></html>")


def test_player_page_biography_honours_and_season_awards() -> None:
    profile = parse_player_page(PAGE, "leonaka01")
    assert profile["birthplace"] == "Los Angeles, California"  # The flag's hidden "us" is dropped.
    assert profile["high_school"] == "King in Riverside, California"
    assert (profile["shoots"], profile["debut_date"]) == ("Right", "2011-12-26")
    assert profile["honours"] == ["7x All Star", "2x NBA Champ"]
    # Tables inside HTML comments are read; empty and non-season rows are left out.
    assert profile["awards"] == {"2015-16": ["MVP-2", "DPOY-1", "AS", "NBA1"]}
    assert profile["all_star_seasons"] == ["2015-16"]


def test_missing_fields_stay_null() -> None:
    profile = parse_player_page(b'<div id="meta"><h1>Someone</h1></div>', "someo01")
    assert profile["birthplace"] is None and profile["high_school"] is None
    assert profile["honours"] == [] and profile["awards"] == {}


def test_matching_requires_name_and_birth_date_and_rejects_ambiguity() -> None:
    assert normalize_name("Nikola Jokić") == "nikola jokic"
    assert normalize_name("P.J. Washington Jr.") == "pj washington"
    entries = [
        IndexEntry("smithjo01", "John Smith", 2005, 2010, date(1983, 1, 1)),
        IndexEntry("smithjo02", "John Smith", 2015, 2020, date(1993, 1, 1)),
        IndexEntry("solosi01", "Solo Singular", 2019, 2026, None),
    ]
    players = [
        NbaPlayer("1", "John Smith", date(1993, 1, 1), 2014, 2019),
        NbaPlayer("2", "John Smith", None, 2004, 2009),  # Two candidates, no birth date: none.
        NbaPlayer("3", "Solo Singular", None, 2018, 2025),  # One candidate, seasons overlap.
        NbaPlayer("4", "Nobody Here", date(2000, 1, 1), 2020, 2025),
    ]
    assert match_players(entries, players) == {"1": "smithjo02", "3": "solosi01"}


def test_only_player_index_and_player_pages_are_admitted() -> None:
    assert (
        validate_bbref_url(
            "basketball_reference", "https://www.basketball-reference.com/players/l/", "all"
        )
        == 4.0
    )
    assert (
        validate_bbref_url(
            "basketball_reference",
            "https://www.basketball-reference.com/players/l/leonaka01.html",
            "all",
        )
        == 4.0
    )
    for url in (
        "https://www.basketball-reference.com/players/l/leonaka01/gamelog/2026",
        "https://www.basketball-reference.com/teams/LAC/2026.html",
        "http://www.basketball-reference.com/players/l/",
        "https://example.com/players/l/",
    ):
        with pytest.raises(ValueError):
            validate_bbref_url("basketball_reference", url, "all")


def test_the_newest_profile_serves(session: Session) -> None:
    receipt = WorkbenchAcquisition(
        source_name="basketball_reference",
        resource="bbref_player_pages",
        source_url="https://www.basketball-reference.com/players/l/leonaka01.html",
        status="success",
    )
    session.add(receipt)
    session.flush()
    for when, honours in (
        (datetime(2026, 1, 1, tzinfo=UTC), ["6x All Star"]),
        (datetime(2026, 10, 1, tzinfo=UTC), ["7x All Star"]),
    ):
        session.add(
            BbrefPlayerProfile(
                player_id="202695",
                bbref_id="leonaka01",
                match_basis="name+birth_date",
                acquisition_id=receipt.id,
                content_sha256=f"{when.month:064d}",
                parser_version="bbref-player-v1",
                observed_at=when,
                profile={"honours": honours, "awards": {}, "all_star_seasons": []},
            )
        )
    session.commit()
    reference = player_reference(session, "202695")
    assert reference is not None and reference["honours"] == ["7x All Star"]
    assert reference["url"].endswith("/players/l/leonaka01.html")
    assert player_reference(session, "missing") is None
