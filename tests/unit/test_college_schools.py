import io
import json
from datetime import date
from pathlib import Path

import httpx
import pytest
from PIL import Image
from sqlalchemy.orm import Session

from courtlens.ingestion.bbref_players import NbaPlayer
from courtlens.ingestion.college_schools import (
    ESPN_TEAMS_URL,
    SR_SCHOOLS_URL,
    School,
    match_espn,
    match_school,
    parse_espn_teams,
    parse_sr_schools,
    player_college,
    validate_url,
)


def _school_row(slug: str, name: str, location: str) -> str:
    return (
        f'<tr><td data-stat="school_name"><a href="/cbb/schools/{slug}/men/">{name}</a></td>'
        f'<td data-stat="location">{location}</td></tr>'
    )


ROWS = [
    ("villanova", "Villanova Wildcats", "Villanova, Pennsylvania"),
    ("north-carolina", "North Carolina Tar Heels", "Chapel Hill, North Carolina"),
    ("north-carolina-state", "NC State Wolfpack", "Raleigh, North Carolina"),
    ("notre-dame", "Notre Dame Fighting Irish", "Notre Dame, Indiana"),
    ("northern-iowa", "Northern Iowa Panthers", "Cedar Falls, Iowa"),
    ("michigan", "Michigan Wolverines", "Ann Arbor, Michigan"),
    ("michigan-state", "Michigan State Spartans", "East Lansing, Michigan"),
    ("miami-fl", "Miami (FL) Hurricanes", "Coral Gables, Florida"),
    ("texas-am", "Texas A&amp;M Aggies", "College Station, Texas"),
    # Filler so the index has the size a real one does.
    *[(f"filler-{i}", f"Filler {i} Owls", "Somewhere, Ohio") for i in range(100)],
]
SCHOOLS_PAGE = (
    "<html><table>" + "".join(_school_row(*row) for row in ROWS) + "</table></html>"
).encode()
TEAMS = {
    "sports": [
        {
            "leagues": [
                {
                    "teams": [
                        {"team": {"id": "222", "displayName": "Villanova Wildcats"}},
                        {"team": {"id": "153", "displayName": "North Carolina Tar Heels"}},
                        {"team": {"id": "2390", "displayName": "Miami Hurricanes"}},
                        *[
                            {"team": {"id": str(9000 + i), "displayName": f"Other {i} Owls"}}
                            for i in range(100)
                        ],
                    ]
                }
            ]
        }
    ]
}


def _player_page(colleges: str) -> bytes:
    return (
        "<html><body><div id='meta'><div><h1><span>Fixture Guard</span></h1>"
        f"<p><strong> {colleges} </p>"
        "<p><strong> High School: </strong> Fixture in Austin, Texas</p></div></div></body></html>"
    ).encode()


VILLANOVA = "College: </strong> <a href='/friv/colleges.fcgi?college=villanova'>Villanova</a>"
TRANSFER = (
    "Colleges: </strong> <a href='/friv/colleges.fcgi?college=cflorida'>Central Florida</a>, "
    "<a href='/friv/colleges.fcgi?college=unc'>UNC</a>"
)


def test_the_last_listed_college_is_the_players() -> None:
    assert player_college(_player_page(VILLANOVA)) == ("villanova", "Villanova")
    assert player_college(_player_page(TRANSFER)) == ("unc", "UNC")
    assert player_college(b"<html><p><strong>College Tools</strong>: links</p></html>") is None


def test_colleges_join_schools_by_slug_name_or_alias_and_never_guess() -> None:
    schools = parse_sr_schools(SCHOOLS_PAGE)
    assert schools["villanova"] == School(
        "villanova", "Villanova Wildcats", "Villanova, Pennsylvania"
    )
    assert schools["texas-am"].name == "Texas A&M Aggies"
    assert match_school("villanova", "Villanova", schools) == "villanova"  # same slug
    assert match_school("niowa", "University of Northern Iowa", schools) == "northern-iowa"
    assert match_school("notredame", "Notre Dame", schools) == "notre-dame"  # name + mascot
    assert match_school("unc", "UNC", schools) == "north-carolina"  # alias
    assert match_school("texasam", "Texas A&M", schools) == "texas-am"
    # "Michigan" starts two schools' names; its own name as a slug settles it, a prefix never does.
    assert match_school("umich", "Michigan", schools) == "michigan"
    assert match_school("mich", "Mich", schools) is None
    assert match_school("walshoh", "Walsh University", schools) is None
    with pytest.raises(ValueError):
        parse_sr_schools(b"<html><table></table></html>")


def test_logos_join_on_the_full_school_name() -> None:
    schools = parse_sr_schools(SCHOOLS_PAGE)
    teams = parse_espn_teams(json.dumps(TEAMS).encode())
    villanova = match_espn(schools["villanova"], teams)
    assert villanova is not None and villanova.logo_url.endswith("/ncaa/500-dark/222.png")
    miami = match_espn(schools["miami-fl"], teams)  # ESPN names it without "(FL)"
    assert miami is not None and miami.espn_id == "2390"
    assert match_espn(schools["notre-dame"], teams) is None


def test_only_the_indexes_and_dark_logos_are_fetched() -> None:
    assert validate_url(SR_SCHOOLS_URL) and validate_url(ESPN_TEAMS_URL)
    assert validate_url("https://a.espncdn.com/i/teamlogos/ncaa/500-dark/222.png")
    for url in (
        "https://a.espncdn.com/i/teamlogos/ncaa/500/222.png",
        "https://a.espncdn.com/i/teamlogos/ncaa/500-dark/222.png?x=1",
        "https://www.sports-reference.com/cbb/schools/villanova/men/",
        "https://cdn.ssref.net/req/1/tlogo/cbb/villanova.png",
    ):
        assert not validate_url(url), url


def _png() -> bytes:
    out = io.BytesIO()
    Image.new("RGBA", (500, 500), (0, 32, 91, 255)).save(out, format="PNG")
    return out.getvalue()


def test_refresh_writes_colleges_and_serves_their_logos(
    session: Session, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    from courtlens.services import bbref_bio, college_schools

    # A retained player page through the real profile crawl.
    index = b"""<html><body><table id="players"><tbody>
<tr><th data-stat="player" data-append-csv="brunsja01"><a>Jalen Brunson</a></th>
<td data-stat="year_min">2019</td><td data-stat="year_max">2027</td>
<td data-stat="birth_date" csk="19960831">August 31, 1996</td></tr>
</tbody></table></body></html>"""
    pages = {"/players/b/": index, "/players/b/brunsja01.html": _player_page(VILLANOVA)}
    responses = {
        "/cbb/schools/": SCHOOLS_PAGE,
        "/apis/site/v2/sports/basketball/mens-college-basketball/teams": json.dumps(TEAMS).encode(),
        "/i/teamlogos/ncaa/500-dark/222.png": _png(),
    }
    requested: list[str] = []

    def respond(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/robots.txt":
            return httpx.Response(404)
        requested.append(request.url.path)
        body = pages.get(request.url.path) or responses.get(request.url.path)
        return httpx.Response(200, content=body) if body else httpx.Response(404)

    players = [(NbaPlayer("1628973", "Jalen Brunson", date(1996, 8, 31), 2018, 2026), True)]
    monkeypatch.setattr(bbref_bio, "candidate_players", lambda _s, history: players)
    monkeypatch.setattr("courtlens.services.source_acquisition.time.sleep", lambda _: None)
    pages_root, out_dir = tmp_path / "bbref", tmp_path / "colleges"
    with httpx.Client(transport=httpx.MockTransport(respond)) as client:
        bbref_bio.crawl(
            session, bbref_bio.BbrefFetcher(session, pages_root, client), pages_root, letters="b"
        )
        summary = college_schools.refresh(
            session,
            college_schools.CollegeFetcher(session, tmp_path / "raw", client),
            pages_root=pages_root,
            out_dir=out_dir,
        )
        assert summary["written"] and summary["placed"] == 1 and summary["logos_fetched"] == 1
        # A second run keeps the logo it has and asks only for the two indexes.
        requested.clear()
        again = college_schools.refresh(
            session,
            college_schools.CollegeFetcher(session, tmp_path / "raw", client),
            pages_root=pages_root,
            out_dir=out_dir,
        )
    assert again["logos_fetched"] == 0 and requested == [
        "/cbb/schools/",
        "/apis/site/v2/sports/basketball/mens-college-basketball/teams",
    ]
    with Image.open(out_dir / "logos" / "222.png") as logo:
        assert logo.size == (96, 96)

    monkeypatch.setattr(
        college_schools,
        "get_settings",
        lambda: type("S", (), {"college_schools_dir": out_dir})(),
    )
    assert college_schools.player_school("1628973") == {
        "name": "Villanova",
        "school": "Villanova Wildcats",
        "location": "Villanova, Pennsylvania",
        "logo_url": "/api/workbench/college-logos/222",
        "source_url": "https://www.sports-reference.com/cbb/schools/villanova/men/",
        "attribution": "Sports-Reference.com college basketball schools",
    }
    assert college_schools.player_school("0") is None
    assert college_schools.logo_path("222") == out_dir / "logos" / "222.png"
    assert college_schools.logo_path("../colleges") is None


def test_a_run_that_cannot_read_an_index_writes_nothing(
    session: Session, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    from courtlens.services import college_schools

    monkeypatch.setattr("courtlens.services.source_acquisition.time.sleep", lambda _: None)

    def refuse(request: httpx.Request) -> httpx.Response:
        return httpx.Response(404 if request.url.path == "/robots.txt" else 429)

    with httpx.Client(transport=httpx.MockTransport(refuse)) as client:
        summary = college_schools.refresh(
            session,
            college_schools.CollegeFetcher(session, tmp_path / "raw", client),
            pages_root=tmp_path / "bbref",
            out_dir=tmp_path / "colleges",
        )
    assert summary["written"] is False and not (tmp_path / "colleges").exists()


def test_dashes_separate_words() -> None:
    from courtlens.ingestion.college_schools import normalize

    assert normalize("Maryland\u2013Eastern Shore Hawks") == "maryland eastern shore hawks"
