from datetime import UTC, date, datetime
from pathlib import Path

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from courtlens.ingestion.bbref_players import (
    IndexEntry,
    NbaPlayer,
    confirms_legal_name,
    legal_name,
    match_by_seasons,
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
<p><span class="desc">(name previously spelled Kawhy)</span></p>
<p>
(The Klaw, Board Man)
</p>
<p><strong>Position:</strong> Small Forward &#9642; <strong>Shoots:</strong> Right</p>
<p><strong>Born: </strong><span id="necro-birth" data-birth="1991-06-29">June 29, 1991</span>
<span>in&nbsp;Los Angeles,&nbsp;<a href="/x">California</a></span>
<span class="f-i f-us">us</span></p>
<p><strong>High School:</strong> King in Riverside, <a href="/y">California</a></p>
<p><strong>NBA Debut: </strong><a href="/z">December 26, 2011</a></p>
</div></div>
<div class="faq"><h3>What are Kawhi Leonard's nicknames?</h3>
<p>The Klaw, Board Man are nicknames for Kawhi Leonard.</p></div>
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
    # Only the labelled nickname answer counts; a parenthesised bio note is not a nickname.
    assert profile["nicknames"] == ["The Klaw", "Board Man"]
    single = parse_player_page(
        b'<div id="meta"><h1>Sam</h1><p><span class="desc">(born Samuel)</span></p></div>'
        b"<h3>What is Sam's nickname?</h3><p>Slim is a nickname for Sam.</p>",
        "sam01",
    )
    assert single["nicknames"] == ["Slim"]
    # Names ending in "s" take a bare apostrophe in the question.
    plural = parse_player_page(
        b'<div id="meta"><h1>Lou Williams</h1></div>'
        b"<h3>What are Lou Williams' nicknames?</h3>"
        b"<p>Sweet Lou, Lou-Will are nicknames for Lou Williams.</p>",
        "willilo02",
    )
    assert plural["nicknames"] == ["Sweet Lou", "Lou-Will"]
    # Tables inside HTML comments are read; empty and non-season rows are left out.
    assert profile["awards"] == {"2015-16": ["MVP-2", "DPOY-1", "AS", "NBA1"]}
    assert profile["all_star_seasons"] == ["2015-16"]


def test_missing_fields_stay_null() -> None:
    profile = parse_player_page(b'<div id="meta"><h1>Someone</h1></div>', "someo01")
    assert profile["birthplace"] is None and profile["high_school"] is None
    assert profile["honours"] == [] and profile["awards"] == {}
    assert profile["nicknames"] == []


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


def test_v2_salary_history_contract_options_and_dated_events() -> None:
    raw = Path("tests/fixtures/bbref/player-v2.html").read_bytes()
    profile = parse_player_page(raw, "sample01")
    assert profile["parser"] == "bbref-player-v3"
    assert profile["salary_history"] == [
        {
            "season": "2024-25",
            "team": "LA Clippers",
            "team_code": "LAC",
            "league": "NBA",
            "salary": "1000000",
        },
        {
            "season": "2025-26",
            "team": "LA Clippers",
            "team_code": "LAC",
            "league": "NBA",
            "salary": None,
        },
    ]
    assert profile["career_earnings"] == "1000000"
    assert [(r["season"], r["salary"], r["option"]) for r in profile["current_contract"]] == [
        ("2026-27", "2000000", None),
        ("2027-28", "2100000", "player"),
        ("2028-29", "2200000", "team"),
    ]
    assert profile["current_contract"][0]["team_code"] == "TOR"
    assert [(r["date"], r["type"]) for r in profile["contract_events"]] == [
        ("2025-09-22", "signed"),
        ("2026-09-22", "extended"),
        ("2026-09-14", "traded"),
        (None, "other"),
    ]
    assert profile["contract_events"][2]["from_team_code"] == "LAC"
    assert [
        (r["date"], r["type"], r["from_team_code"], r["to_team_code"])
        for r in profile["transactions"]
    ] == [
        ("2026-09-14", "traded", "LAC", "TOR"),
        ("2026-09-22", "extended", None, "TOR"),
        ("2026-09-23", "recalled", None, None),
    ]


def test_v2_highs_keep_phases_seasons_zero_missing_values_and_boxscore_dates() -> None:
    profile = parse_player_page(
        Path("tests/fixtures/bbref/player-v2.html").read_bytes(), "sample01"
    )
    highs = profile["game_highs"]
    assert [(r["phase"], r["scope"], r["season"]) for r in highs] == [
        ("regular_season", "season", "2025-26"),
        ("regular_season", "career", None),
        ("playoffs", "career", None),
    ]
    assert highs[0]["values"]["pts"] == {
        "value": "42",
        "url": "https://www.basketball-reference.com/boxscores/202601020TOR.html",
        "date": "2026-01-02",
    }
    assert highs[0]["values"]["ast"]["value"] == "0"
    assert highs[0]["values"]["blk"]["value"] is None
    assert highs[1]["values"]["time_on_court"]["value"] == "48:30"
    assert highs[2]["values"]["pts"]["date"] is None
    assert highs[2]["values"]["ast"]["url"] is None
    missing = parse_player_page(b'<div id="meta"><h1>Someone</h1></div>', "someo01")
    assert (
        missing["salary_history"]
        == missing["current_contract"]
        == missing["transactions"]
        == missing["game_highs"]
        == []
    )
    assert missing["career_earnings"] is None


def test_v2_rejects_ambiguous_options_and_non_exact_salary() -> None:
    raw = Path("tests/fixtures/bbref/player-v2.html").read_bytes()
    with pytest.raises(ValueError, match="conflicting contract option"):
        parse_player_page(
            raw.replace(b'class="salary-pl"', b'class="salary-pl salary-tm"'), "sample01"
        )
    with pytest.raises(ValueError, match="unsupported exact monetary"):
        parse_player_page(raw.replace(b"$2,000,000", b"$2M"), "sample01")


def _retained_page(session: Session, root: Path, raw: bytes) -> BbrefPlayerProfile:
    import hashlib

    from courtlens.workbench_models import WorkbenchArtifact

    digest = hashlib.sha256(raw).hexdigest()
    (root / digest).write_bytes(raw)
    artifact = WorkbenchArtifact(
        sha256=digest,
        resource="bbref_player_pages",
        bytes=len(raw),
        storage_path=digest,
        mime_type="text/html",
        source_attribution="Basketball-Reference.com",
    )
    session.add(artifact)
    session.flush()
    receipt = WorkbenchAcquisition(
        source_name="basketball_reference",
        resource="bbref_player_pages",
        source_url="https://www.basketball-reference.com/players/s/sample01.html",
        status="success",
        content_sha256=digest,
        artifact_id=artifact.id,
    )
    session.add(receipt)
    session.flush()
    old = BbrefPlayerProfile(
        player_id="123",
        bbref_id="sample01",
        match_basis="name+birth_date",
        acquisition_id=receipt.id,
        content_sha256=digest,
        parser_version="bbref-player-v1",
        observed_at=datetime(2026, 10, 1, tzinfo=UTC),
        profile={"honours": ["Old profile"]},
    )
    session.add(old)
    session.commit()
    return old


def test_offline_reparse_preserves_lineage_and_is_idempotent(
    session: Session, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    import httpx
    from sqlalchemy import select

    from courtlens.services.bbref_bio import reparse

    def no_network(*args: object, **kwargs: object) -> None:
        raise AssertionError("offline reparsing must not use HTTP")

    monkeypatch.setattr(httpx.Client, "send", no_network)
    old = _retained_page(
        session, tmp_path, Path("tests/fixtures/bbref/player-v2.html").read_bytes()
    )
    assert reparse(session, tmp_path) == {
        "parser": "bbref-player-v3",
        "profiles": 1,
        "skipped": 0,
        "failed": [],
    }
    assert reparse(session, tmp_path) == {
        "parser": "bbref-player-v3",
        "profiles": 0,
        "skipped": 1,
        "failed": [],
    }
    rows = list(session.scalars(select(BbrefPlayerProfile)))
    assert len(rows) == 2
    new = next(r for r in rows if r.parser_version == "bbref-player-v3")
    assert (
        new.acquisition_id,
        new.content_sha256,
        new.observed_at.replace(tzinfo=UTC),
        new.match_basis,
    ) == (
        old.acquisition_id,
        old.content_sha256,
        old.observed_at.replace(tzinfo=UTC),
        old.match_basis,
    )
    assert session.get(BbrefPlayerProfile, old.id).profile == {"honours": ["Old profile"]}
    assert player_reference(session, "123")["honours"] == ["2x All Star", "NBA Champ"]


def test_offline_reparse_rejects_corruption_and_can_resume(
    session: Session, tmp_path: Path
) -> None:
    from courtlens.services.bbref_bio import reparse

    raw = b'<div id="meta"><h1>Sample Player</h1></div>'
    old = _retained_page(session, tmp_path, raw)
    (tmp_path / old.content_sha256).write_bytes(b"corrupt")
    result = reparse(session, tmp_path)
    assert result["profiles"] == 0 and len(result["failed"]) == 1
    assert "integrity" in result["failed"][0]["reason"]
    (tmp_path / old.content_sha256).write_bytes(raw)
    assert reparse(session, tmp_path)["profiles"] == 1


def test_parser_upgrade_does_not_make_a_recent_acquisition_stale(
    session: Session, tmp_path: Path
) -> None:
    from datetime import timedelta

    from courtlens.services.bbref_bio import has_current_profile

    old = _retained_page(session, tmp_path, PAGE)
    # Freshness describes the acquisition, independently of which parser read it.
    assert old.parser_version == "bbref-player-v1"
    assert has_current_profile(session, "123", timedelta(days=300))


def test_reparse_cli_reads_retained_pages_and_writes_summary(
    session: Session, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    import json
    from contextlib import nullcontext

    from typer.testing import CliRunner

    from courtlens import cli

    _retained_page(session, tmp_path, Path("tests/fixtures/bbref/player-v2.html").read_bytes())
    monkeypatch.setattr(cli, "SessionLocal", lambda: nullcontext(session))
    report = tmp_path / "report.json"
    result = CliRunner().invoke(
        cli.app,
        ["reparse-bbref", "--root", str(tmp_path), "--player-id", "123", "--report", str(report)],
    )
    assert result.exit_code == 0, result.output
    assert json.loads(report.read_text())["profiles"] == 1


def test_reported_two_way_and_below_minimum_labels_preserve_unknown_amounts() -> None:
    raw = Path("tests/fixtures/bbref/player-v2.html").read_bytes()
    profile = parse_player_page(
        raw.replace(b"$2,000,000", b"(TW)")
        .replace(b"$2,100,000", b"&lt; $Minimum")
        .replace(b"$1,000,000", b"$1,000,000 (TW)"),
        "sample01",
    )
    assert profile["current_contract"][0]["salary"] is None
    assert profile["current_contract"][0]["salary_note"] == "(TW)"
    assert profile["current_contract"][1]["salary"] is None
    assert profile["current_contract"][1]["salary_note"] == "< $Minimum"
    assert profile["salary_history"][0]["salary"] == "1000000"
    assert profile["salary_history"][0]["salary_note"] == "$1,000,000 (TW)"


def _old_page(display: str, legal: str, nicknames: str = "") -> bytes:
    faq = (
        f"<div class='faq'><h3>What are {display}'s nicknames?</h3>"
        f"<p>{nicknames} are nicknames for {display}.</p></div>"
        if nicknames
        else ""
    )
    return (
        f"<html><body><div id='meta'><div><h1><span>{display}</span></h1>"
        f"<p><strong><strong>{legal}</strong></strong></p>"
        f"<p><strong>Position:</strong> Guard</p></div></div>{faq}</body></html>"
    ).encode()


def _entry(bbref_id: str, name: str, first: int, last: int) -> IndexEntry:
    return IndexEntry(bbref_id, name, first, last, None)


def test_season_matches_need_one_surname_with_the_exact_career_span() -> None:
    entries = [
        _entry("attleal01", "Al Attles", 1961, 1971),
        _entry("davisdw01", "Dwight Davis", 1973, 1977),
        _entry("davisjo01", "Johnny Davis", 1977, 1990),
        _entry("smithjo01", "Joe Smith", 1960, 1962),
        _entry("smithja01", "Jack Smith", 1960, 1962),
        _entry("takenxx01", "Ed Taken", 1950, 1951),
    ]
    players = [
        NbaPlayer("1", "Alvin Attles", None, 1960, 1970),
        NbaPlayer("2", "Edward Davis", None, 1972, 1976),
        NbaPlayer("3", "John Smith", None, 1959, 1961),  # two Smiths share the span
        NbaPlayer("4", "Al Attles", None, 1960, 1969),  # span differs
        NbaPlayer("5", "Edgar Taken", None, 1949, 1950),  # page already matched elsewhere
    ]
    assert match_by_seasons(entries, players, {"takenxx01"}) == {
        "1": "attleal01",
        "2": "davisdw01",
    }


def test_a_provisional_match_needs_the_legal_name_on_the_page() -> None:
    attles = _old_page("Al Attles", "Alvin A. Attles Jr.")
    assert legal_name(attles) == "Alvin A. Attles Jr."
    assert confirms_legal_name("Alvin Attles", attles, parse_player_page(attles, "attleal01"))
    tiny = _old_page("Tiny Archibald", "Nathaniel Archibald", "Tiny")
    assert confirms_legal_name("Nate Archibald", tiny, parse_player_page(tiny, "archina01"))
    bud = _old_page("Bud Acton", "Charles Ray Acton", "Bud")
    assert confirms_legal_name("Charles Acton", bud, parse_player_page(bud, "actonbu01"))
    other = _old_page("Ralph Johnson", "Ralph Edward Johnson")
    assert not confirms_legal_name("David Johnson", other, parse_player_page(other, "johnsra01"))
    renamed = _old_page("Dwight Davis", "Dwight Edward Davis")
    assert confirms_legal_name("Edward Davis", renamed, parse_player_page(renamed, "davisdw01"))
    wrong_surname = _old_page("Al Attles", "Alvin Attlesworth")
    assert not confirms_legal_name("Alvin Attles", wrong_surname, {"name": "Al Attles"})
    assert legal_name(PAGE) is None


def test_history_crawl_confirms_provisional_matches_and_rereads_unconfirmed_pages(
    session: Session, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    import httpx

    from courtlens.services import bbref_bio

    index = b"""<html><body><table id="players"><tbody>
<tr><th data-stat="player" data-append-csv="attleal01"><a>Al Attles</a></th>
<td data-stat="year_min">1961</td><td data-stat="year_max">1971</td>
<td data-stat="birth_date" csk="">-</td></tr>
<tr><th data-stat="player" data-append-csv="aaronxx01"><a>Ed Aaronson</a></th>
<td data-stat="year_min">1950</td><td data-stat="year_max">1951</td>
<td data-stat="birth_date" csk="">-</td></tr>
</tbody></table></body></html>"""
    pages = {
        "/players/a/": index,
        "/players/a/attleal01.html": _old_page("Al Attles", "Alvin A. Attles Jr."),
        "/players/a/aaronxx01.html": _old_page("Ed Aaronson", "Edward Aaronson"),
    }
    requested: list[str] = []

    def respond(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/robots.txt":
            return httpx.Response(404)
        requested.append(request.url.path)
        return httpx.Response(200, content=pages[request.url.path])

    players = [
        (NbaPlayer("76", "Alvin Attles", None, 1960, 1970), False),
        (NbaPlayer("77", "Gerald Aaronson", None, 1949, 1950), False),
    ]
    monkeypatch.setattr(bbref_bio, "candidate_players", lambda _s, history: players)
    monkeypatch.setattr("courtlens.services.source_acquisition.time.sleep", lambda _: None)

    def run() -> dict[str, object]:
        with httpx.Client(transport=httpx.MockTransport(respond)) as client:
            return bbref_bio.crawl(
                session,
                bbref_bio.BbrefFetcher(session, tmp_path, client),
                tmp_path,
                history=True,
                letters="a",
            )

    summary = run()
    assert summary["provisional"] == 2 and summary["profiles"] == 1
    assert summary["unconfirmed"] == [{"player_id": "77", "bbref_id": "aaronxx01"}]
    profile = session.scalars(select(BbrefPlayerProfile)).one()
    assert (profile.player_id, profile.match_basis) == ("76", "surname+exact_seasons+legal_name")

    requested.clear()
    summary = run()
    assert requested == ["/players/a/"] and summary["skipped"] == 1
    assert len(summary["unconfirmed"]) == 1  # type: ignore[arg-type]
