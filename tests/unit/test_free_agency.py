"""NBA.com free-agent tracker: parsing, sealing and serving without inferred terms."""

from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import patch

import httpx
import pytest
from fastapi import HTTPException

from courtlens.config import Settings
from courtlens.ingestion.free_agency import parse_tracker
from courtlens.services import free_agency


@pytest.fixture(autouse=True)
def _no_sealed_sources():
    """The repo's own sealed ESPN rosters and Wikipedia moves must not leak into these tests."""
    with (
        patch(
            "courtlens.services.espn_rosters.get_settings",
            return_value=Settings(espn_rosters_dir=None),
        ),
        patch(
            "courtlens.services.wikipedia_transactions.get_settings",
            return_value=Settings(wikipedia_transactions_dir=None),
        ),
    ):
        yield


# Six real rows retained from nba.com/players/free-agent-tracker/2026 on 2026-10-19.
FIXTURE = Path(__file__).parents[1] / "fixtures/free-agency/tracker-2026.html"


def test_tracker_rows_keep_source_status_and_unknown_terms() -> None:
    players = {p["name"]: p for p in parse_tracker(FIXTURE.read_bytes(), 2026)["players"]}
    assert len(players) == 6
    reaves = players["Austin Reaves"]
    assert reaves["status"] == "returned"
    assert reaves["old_team_id"] == reaves["new_team_id"] == "1610612747"
    lebron = players["LeBron James"]
    assert (lebron["status"], lebron["new_team_id"]) == ("signed", "1610612755")
    assert lebron["note"] == "Signs with PHI"
    # No NBA team before the move stays unknown, not a team.
    assert players["Trey Lyles"]["old_team_id"] is None
    batum = players["Nicolas Batum"]
    assert (batum["status"], batum["option"], batum["new_team_id"]) == ("unsigned", "team", None)
    cooper = players["Sharife Cooper"]
    assert (cooper["class"], cooper["two_way"]) == ("rfa", True)
    # A reported agreement NBA.com has not recorded stays unsigned, with its source note.
    walker = players["Lonnie Walker IV"]
    assert walker["status"] == "unsigned" and walker["note"].startswith("Agrees")
    assert all("terms" not in p and "salary" not in p for p in players.values())


def test_tracker_rejects_other_class_and_duplicates() -> None:
    with pytest.raises(ValueError, match="requested class"):
        parse_tracker(FIXTURE.read_bytes(), 2025)
    body = FIXTURE.read_bytes().decode()
    start = body.index("{")
    doc = json.loads(body[start : body.rindex("}") + 1])
    rows = doc["props"]["pageProps"]["players"]
    doc["props"]["pageProps"]["players"] = rows + rows[:1]
    page = f'<script id="__NEXT_DATA__">{json.dumps(doc)}</script>'.encode()
    with pytest.raises(ValueError, match="duplicate"):
        parse_tracker(page, 2026)


def test_tracker_url_is_one_class_page() -> None:
    url = "https://www.nba.com/players/free-agent-tracker/2026"
    assert free_agency.validate_tracker_url(free_agency.SOURCE, url, "2026") == 3.0
    for bad in (url + "?x=1", url.replace("2026", "2025"), url.replace("https", "http")):
        with pytest.raises(ValueError):
            free_agency.validate_tracker_url(free_agency.SOURCE, bad, "2026")


def test_refresh_seals_retained_page_and_serves_team_codes(session, tmp_path, monkeypatch) -> None:
    monkeypatch.setattr("courtlens.services.source_acquisition.time.sleep", lambda _: None)

    def respond(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/robots.txt":
            return httpx.Response(200, text="User-agent: *\nDisallow: /api/*\n")
        return httpx.Response(200, content=FIXTURE.read_bytes())

    with httpx.Client(transport=httpx.MockTransport(respond)) as client:
        path, result = free_agency.refresh(session, tmp_path / "raw", client, 2026, tmp_path)
    assert result == {"year": 2026, "players": 6, "unsigned": 3, "signed": 2, "returned": 1}
    with patch(
        "courtlens.services.free_agency.get_settings",
        return_value=Settings(free_agency_manifest=path),
    ):
        view = free_agency.free_agency_view(session)
        # No roster index admitted in this database: the check stays unknown, never `agrees`.
        assert {p["roster_check"] for p in view["players"]} == {None}
        assert view["roster_index"] is None
        assert view["status"] == "available" and view["manifest_sha256"] == path.stem
        lebron = next(p for p in view["players"] if p["name"] == "LeBron James")
        assert (lebron["old_team_tricode"], lebron["new_team_tricode"]) == ("LAL", "PHI")
        path.write_text("{}")
        with pytest.raises(HTTPException, match="503"):
            free_agency.free_agency_view(session)


def test_unconfigured_tracker_is_not_configured(session) -> None:
    with patch(
        "courtlens.services.free_agency.get_settings",
        return_value=Settings(free_agency_manifest=None),
    ):
        assert free_agency.free_agency_view(session)["status"] == "not_configured"


def test_roster_check_flags_stale_tracker_rows_both_ways() -> None:
    players = {p["name"]: p for p in parse_tracker(FIXTURE.read_bytes(), 2026)["players"]}
    lebron, reaves = players["LeBron James"], players["Austin Reaves"]
    walker = players["Lonnie Walker IV"]

    def check(player, teams):
        rosters = free_agency.Rosters(
            teams=teams, complete=False, unresolved=frozenset(), info=None
        )
        return free_agency.roster_check(player, rosters)

    # Signed with PHI, still on PHI's roster.
    assert check(lebron, {lebron["player_id"]: "1610612755"}) == "agrees"
    # Signed, then waived (D'Angelo Russell's case): on no NBA roster now.
    assert check(lebron, {lebron["player_id"]: None}) == "not_on_roster"
    assert check(reaves, {reaves["player_id"]: "1610612752"}) == "other_team"
    # Unsigned on the tracker, on a roster in the index (Walker on DEN).
    assert check(walker, {walker["player_id"]: "1610612743"}) == "on_roster"
    assert check(walker, {walker["player_id"]: None}) == "agrees"
    # A player the index does not list is unknown, not agreement.
    assert check(walker, {}) is None


def test_operator_import_retains_saved_page(session, tmp_path) -> None:
    from datetime import UTC, datetime

    saved = datetime(2026, 10, 19, 16, 0, tzinfo=UTC)
    path, result = free_agency.import_page(
        session, tmp_path / "raw", FIXTURE, 2026, saved, tmp_path
    )
    assert result["players"] == 6
    entry = json.loads(path.read_bytes())["entry"]
    assert entry["capture"] == "operator_import"
    assert entry["observed_at"] == saved.isoformat()
    with pytest.raises(ValueError, match="timezone"):
        free_agency.import_page(
            session, tmp_path / "raw", FIXTURE, 2026, saved.replace(tzinfo=None), tmp_path
        )


NYK, UTA, TOR = "1610612752", "1610612762", "1610612761"


def _rosters(teams: dict[str, str | None], checked: str = "2026-10-20T04:00:00+00:00"):
    return free_agency.Rosters(
        teams=teams, complete=True, unresolved=frozenset(), info={"observed_at": checked}
    )


def _player(status: str = "unsigned", new: str | None = None, old: str | None = None) -> dict:
    return {
        "player_id": "1",
        "name": "Tony Bradley",
        "status": status,
        "new_team_id": new,
        "old_team_id": old,
    }


def test_latest_move_orders_undated_cuts_and_same_day_retirements() -> None:
    def ev(kind, team=None, day=None):
        return {"kind": kind, "team_id": team, "date": day}

    # Signed by NYK, cut in camp (undated), signed by Utah: the Utah deal is the latest.
    moves = [ev("signed", NYK, "2026-09-30"), ev("signed", UTA, "2026-10-17"), ev("cut", NYK)]
    assert free_agency.latest_move(moves)["team_id"] == UTA
    # Signed by NYK and cut in camp with nothing after: the cut is the latest.
    assert (
        free_agency.latest_move([ev("signed", NYK, "2026-09-16"), ev("cut", NYK)])["kind"] == "cut"
    )
    # A one-day contract to retire: the retirement wins the tie.
    same_day = [ev("retired", None, "2026-07-07"), ev("signed", TOR, "2026-07-07")]
    assert free_agency.latest_move(same_day)["kind"] == "retired"
    assert free_agency.latest_move([ev("unsigned")]) is None


def test_current_status_applies_wikipedia_then_the_roster() -> None:
    signed_utah = {"kind": "signed", "team_id": UTA, "date": "2026-10-17"}
    # NBA.com says unsigned; Wikipedia's dated signing and the roster agree on Utah.
    now = free_agency.current_status(_player(), signed_utah, _rosters({"1": UTA}))
    assert (now["status"], now["team_id"], now["source"]) == ("signed", UTA, "wikipedia")
    # An older Wikipedia signing the roster no longer shows: the roster decides (cut, unlisted).
    old = {"kind": "signed", "team_id": NYK, "date": "2026-09-16"}
    now = free_agency.current_status(_player(), old, _rosters({}))
    assert (now["status"], now["team_id"], now["source"]) == ("unsigned", None, "roster")
    # A move from the roster's own day or the day before outranks a roster that may trail it.
    claimed = {"kind": "two_way", "team_id": UTA, "date": "2026-10-19"}
    now = free_agency.current_status(_player(), claimed, _rosters({}))
    assert (now["team_id"], now["source"]) == (UTA, "wikipedia")
    # Re-signing with the former team reads as Returned; abroad stays abroad off any roster.
    now = free_agency.current_status(_player(old=UTA), signed_utah, _rosters({"1": UTA}))
    assert now["status"] == "returned"
    abroad = {"kind": "abroad", "team_id": None, "date": "2026-08-19"}
    assert free_agency.current_status(_player(), abroad, _rosters({}))["status"] == "abroad"
    # No move and no roster source: NBA.com's status stands.
    unknown = free_agency.Rosters(teams={}, complete=False, unresolved=frozenset(), info=None)
    now = free_agency.current_status(_player("signed", NYK), None, unknown)
    assert (now["status"], now["team_id"], now["source"]) == ("signed", NYK, "nba")


def test_current_placements_match_the_tracker_and_place_everyone_else(monkeypatch) -> None:
    """The Stats "now" chip and the tracker read one placement, so they cannot disagree."""
    cut = {"key": "Tony Bradley", "name": "Tony Bradley", "kind": "cut", "team_id": NYK}
    abroad = {
        "key": "Sam Abroad",
        "name": "Sam Abroad",
        "kind": "abroad",
        "team_id": None,
        "date": "2026-07-16",
        "club": "Paris",
        "country": "France",
    }
    moves = free_agency.Moves(
        events={
            "tony bradley": [{**cut, "date": None}],
            "sam abroad": [abroad],
        },
        ambiguous=frozenset(),
        info={},
        by_key={"tony bradley": [{**cut, "date": None}], "sam abroad": [abroad]},
    )
    # The roster still lists a stale team for nobody; Bradley and Abroad are on no roster.
    rosters = _rosters({"1": None, "2": None, "3": TOR})
    tracker = {"entry": {"players": [_player("signed", NYK)]}}
    monkeypatch.setattr(free_agency, "roster_index", lambda session: rosters)
    monkeypatch.setattr(free_agency, "moves_index", lambda: moves)
    monkeypatch.setattr(free_agency, "load_free_agency_store", lambda: tracker)
    monkeypatch.setattr(
        free_agency, "_latest_index", lambda session: (free_agency._IndexPeople({}, {}), None)
    )
    found = free_agency.current_placements(
        None,  # type: ignore[arg-type]
        {"1": "Tony Bradley", "2": "Sam Abroad", "3": "Rostered Guy", "4": "Nobody Known"},
    )
    # Tracker player: NBA.com's signing, then the camp cut, then the roster: a free agent.
    assert found["1"]["state"] == "free_agent" and found["1"]["team_id"] is None
    assert found["1"]["move"]["team_tricode"] == "NYK"
    # Off every roster with an older move abroad: abroad, with the club for the title.
    assert found["2"]["state"] == "abroad" and found["2"]["move"]["club"] == "Paris"
    assert (found["3"]["state"], found["3"]["team_tricode"]) == ("team", "TOR")
    # The roster is complete, so an unlisted player is on no roster; unknown sources say nothing.
    assert found["4"]["state"] == "free_agent"
    unknown = free_agency.Rosters(teams={}, complete=False, unresolved=frozenset(), info=None)
    monkeypatch.setattr(free_agency, "roster_index", lambda session: unknown)
    assert "4" not in free_agency.current_placements(None, {"4": "Nobody Known"})  # type: ignore[arg-type]


def _moves(*events: dict) -> free_agency.Moves:
    by_key: dict[str, list[dict]] = {}
    for event in events:
        by_key.setdefault(free_agency.normalize_name(event["key"]), []).append(event)
    return free_agency.Moves(events=by_key, ambiguous=frozenset(), info={}, by_key=by_key)


def _ev(name: str, kind: str = "abroad", team: str | None = None) -> dict:
    return {"key": name, "name": name, "kind": kind, "team_id": team, "date": "2026-07-20"}


def test_same_name_players_get_a_move_only_when_its_team_says_whose() -> None:
    # Two active Nate Williams: the waiver names Toronto, which only one of them played for.
    waived = _moves(_ev("Nate Williams", "waived", TOR))
    population = {"10": "Nate Williams", "11": "Nate Williams"}
    teams = {"10": {TOR}, "11": {NYK}}
    found = free_agency.match_moves(waived, {"10": "Nate Williams"}, population, teams)
    assert "10" in found.events
    assert free_agency.match_moves(waived, {"11": "Nate Williams"}, population, teams).events == {}
    # A move abroad names no NBA team: whose it is stays unknown, and the name is reported.
    abroad = free_agency.match_moves(
        _moves(_ev("Nate Williams")), {"10": "Nate Williams"}, population, teams
    )
    assert abroad.events == {} and abroad.ambiguous == ["Nate Williams"]
    # A retired namesake outside the population (father and son) does not block the match.
    son = free_agency.match_moves(
        _moves(_ev("Gary Payton II")), {"12": "Gary Payton II"}, {"12": "Gary Payton II"}, {}
    )
    assert "12" in son.events


def test_nicknames_match_only_one_person_with_one_wikipedia_entry() -> None:
    def match(wiki: list[str], name: str, population: dict[str, str]):
        moves = _moves(*(_ev(w) for w in wiki))
        return free_agency.match_moves(moves, {"1": name}, {"1": name, **population}, {}).events

    assert "1" in match(["Herb Jones"], "Herbert Jones", {})
    assert "1" in match(["Moe Wagner"], "Moritz Wagner", {})
    assert "1" in match(["Nic Claxton"], "Nicolas Claxton", {})
    # Two Wikipedia entries could be him, or another active Jones could be the Herb: no guess.
    assert match(["Nic Claxton", "Nico Claxton"], "Nicolas Claxton", {}) == {}
    assert match(["Herb Jones"], "Herbert Jones", {"2": "Herbie Jones"}) == {}
    # A Wikipedia name that is exactly another player's is theirs, never a nickname of this one.
    assert match(["Cam Johnson"], "Cameron Johnson", {"2": "Cam Johnson"}) == {}
    # Unrelated first names and two-letter prefixes never match.
    assert match(["Jalen Green"], "Josh Green", {}) == {}
    assert match(["Al Horford"], "Alexander Horford", {}) == {}
