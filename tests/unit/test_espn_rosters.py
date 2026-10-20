"""ESPN team rosters: parsing, matching, sealing and the free-agency roster check."""

from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import patch

import httpx
import pytest

from courtlens.config import Settings
from courtlens.ingestion.espn_rosters import ESPN_TEAMS, parse_roster, roster_url
from courtlens.ingestion.free_agency import parse_tracker
from courtlens.services import espn_rosters, free_agency, source_acquisition

# Three real athletes from ESPN's Knicks roster, fetched 2026-10-19.
FIXTURE = Path(__file__).parents[1] / "fixtures/espn-rosters/nyk-2026-10-19.json"
TRACKER = Path(__file__).parents[1] / "fixtures/free-agency/tracker-2026.html"


def team_body(espn_id: str, names: list[str]) -> bytes:
    """The fixture's shape for any team; athlete ids derive from team and order."""
    doc = json.loads(FIXTURE.read_bytes())
    doc["team"]["id"], doc["team"]["abbreviation"] = espn_id, ESPN_TEAMS[espn_id][0]
    template = doc["athletes"][0]
    doc["athletes"] = [
        {**template, "id": f"{espn_id}{n:03d}", "fullName": name, "displayName": name}
        for n, name in enumerate(names)
    ]
    return json.dumps(doc).encode()


def test_roster_parses_team_season_and_athletes() -> None:
    roster = parse_roster(FIXTURE.read_bytes(), "18")
    assert (roster["tricode"], roster["team_id"], roster["season"]) == (
        "NYK",
        "1610612752",
        "2026-27",
    )
    assert {p["name"] for p in roster["players"]} == {
        "Jalen Brunson",
        "Karl-Anthony Towns",
        "Mikal Bridges",
    }
    # ESPN's abbreviation is checked against the id: a renumbered team fails loudly.
    with pytest.raises(ValueError, match="is not"):
        parse_roster(FIXTURE.read_bytes(), "19")
    doc = json.loads(FIXTURE.read_bytes())
    doc["athletes"].append(doc["athletes"][0])
    with pytest.raises(ValueError, match="duplicate"):
        parse_roster(json.dumps(doc).encode(), "18")


def test_roster_url_allowlist() -> None:
    url = roster_url("18")
    assert espn_rosters.validate_roster_url(espn_rosters.SOURCE, url, "current") == 5.0
    for bad in (url + "?x=1", roster_url("31"), url.replace("https", "http")):
        with pytest.raises(ValueError):
            espn_rosters.validate_roster_url(espn_rosters.SOURCE, bad, "current")


def test_matching_prefers_crosswalk_then_unique_name_and_never_guesses() -> None:
    index = [
        {"player_id": "1", "name": "Jalen Brunson", "team_id": "1610612752"},
        {"player_id": "2", "name": "Marcus Williams", "team_id": "1610612752"},
        {"player_id": "3", "name": "Marcus Williams", "team_id": None},
        {"player_id": "4", "name": "Chris Johnson", "team_id": None},
        {"player_id": "5", "name": "Chris Johnson", "team_id": None},
        {"player_id": "6", "name": "Nikola Jokić", "team_id": "1610612743"},
    ]
    teams = [
        {
            "team_id": "1610612752",
            "tricode": "NYK",
            "players": [
                {"espn_id": "10", "name": "Jalen Brunson"},
                {"espn_id": "11", "name": "Marcus Williams"},
                {"espn_id": "12", "name": "Chris Johnson"},
                {"espn_id": "13", "name": "Unknown Rookie"},
                {"espn_id": "14", "name": "Nikola Jokic"},
            ],
        },
        {
            "team_id": "1610612743",
            "tricode": "DEN",
            "players": [{"espn_id": "20", "name": "Jalen Brunson Jr."}],
        },
    ]
    matched = {
        p["espn_id"]: (p["player_id"], p["match"])
        for p in espn_rosters.match_players(teams, index, {"20": "99"})
    }
    assert matched["11"] == ("2", "name_team_unique")
    assert matched["12"] == (None, "ambiguous")
    assert matched["13"] == (None, "unmatched")
    # Accents and suffixes are spellings; the crosswalk outranks a name.
    assert matched["14"] == ("6", "name_unique")
    assert matched["20"] == ("99", "verified_crosswalk")
    assert matched["10"] == ("1", "name_unique")


def test_one_player_on_two_rosters_is_kept_by_neither() -> None:
    index = [{"player_id": "1", "name": "Jalen Brunson", "team_id": None}]
    teams = [
        {"team_id": t, "tricode": t, "players": [{"espn_id": e, "name": "Jalen Brunson"}]}
        for t, e in (("A", "1"), ("B", "2"))
    ]
    assert {p["match"] for p in espn_rosters.match_players(teams, index, {})} == {"duplicate"}


def test_refresh_seals_all_30_rosters_despite_robots_edge_denial(
    session, tmp_path, monkeypatch
) -> None:
    monkeypatch.setattr("courtlens.services.source_acquisition.time.sleep", lambda _: None)
    requests: list[str] = []

    def respond(request: httpx.Request) -> httpx.Response:
        requests.append(request.url.path)
        if request.url.path == "/robots.txt":
            return httpx.Response(403, text="Access Denied")
        espn_id = request.url.path.split("/")[-2]
        return httpx.Response(200, content=team_body(espn_id, [f"Player {espn_id}"]))

    with httpx.Client(transport=httpx.MockTransport(respond)) as client:
        path, result = espn_rosters.refresh(session, tmp_path / "raw", client, tmp_path / "out")
    # robots.txt is read once per run and recorded; it never refuses the fetch.
    assert requests.count("/robots.txt") == 1 and len(requests) == 31
    assert (result["teams"], result["players"], result["matched"]) == (30, 30, 0)
    entry = json.loads(path.read_bytes())["entry"]
    assert entry["season"] == "2026-27" and entry["capture"] == "scheduled_fetch"
    assert {t["tricode"] for t in entry["teams"]} == {t for _, t in ESPN_TEAMS.values()}


def test_unchanged_rosters_store_nothing_but_the_check_time(session, tmp_path, monkeypatch) -> None:
    """VPS budget: a 6-hourly timer grows storage only when a roster moves."""
    monkeypatch.setattr("courtlens.services.source_acquisition.time.sleep", lambda _: None)
    runs = {"n": 0, "nyk": ["Jalen Brunson", "Bruce Brown"]}

    def respond(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/robots.txt":
            return httpx.Response(403, text="Access Denied")
        espn_id = request.url.path.split("/")[-2]
        names = runs["nyk"] if espn_id == "18" else [f"Player {espn_id}"]
        doc = json.loads(team_body(espn_id, names))
        doc["timestamp"] = f"run {runs['n']}"  # ESPN's bytes differ every fetch
        return httpx.Response(200, content=json.dumps(doc).encode())

    raw, out = tmp_path / "raw", tmp_path / "out"
    stored = lambda: sorted(p for p in raw.rglob("*") if p.is_file())  # noqa: E731
    with httpx.Client(transport=httpx.MockTransport(respond)) as client:
        first, result = espn_rosters.refresh(session, raw, client, out)
        assert result["changed"] is True
        files = stored()
        runs["n"] = 1
        again, result = espn_rosters.refresh(session, raw, client, out)
        assert (again, result["changed"]) == (first, False)
        assert stored() == files  # no new raw bytes, no new bundle
        assert len(list(out.glob("*.json"))) == 1
        beat = json.loads((out / source_acquisition.HEARTBEAT).read_text())
        body = json.loads(first.read_bytes())
        assert beat["manifest_sha256"] == first.stem
        assert espn_rosters.last_checked(first, body) == beat["checked_at"]
        assert beat["checked_at"] > body["entry"]["observed_at"]
        runs["n"], runs["nyk"] = 2, ["Jalen Brunson"]  # Bruce Brown waived
        moved, result = espn_rosters.refresh(session, raw, client, out)
    assert result["changed"] is True and moved != first
    assert len(stored()) == len(files) + 30
    assert len(list(out.glob("*.json"))) == 2


def test_prune_drops_old_bundles_and_their_raw_but_never_the_newest(tmp_path) -> None:
    from datetime import UTC, datetime

    raw, out = tmp_path / "raw", tmp_path / "out"

    def bundle(day: int, sha: str) -> Path:
        (raw / sha[:2]).mkdir(parents=True, exist_ok=True)
        (raw / sha[:2] / sha).write_bytes(b"{}")
        entry = {"observed_at": f"2026-10-{day:02d}T00:00:00+00:00", "teams": [{"raw_sha256": sha}]}
        return espn_rosters.seal(entry, out)

    old = bundle(1, "aa" * 32)
    recent = bundle(15, "bb" * 32)
    now = datetime(2026, 10, 20, tzinfo=UTC)
    assert espn_rosters.prune(out, raw, 7, now) == {"bundles": 2 - 1, "raw": 1}
    assert not old.exists() and not (raw / "aa" / ("aa" * 32)).exists()
    # Older than the window but the newest: still served, so kept with its raw.
    assert espn_rosters.prune(out, raw, 1, now) == {"bundles": 0, "raw": 0}
    assert recent.exists() and (raw / "bb" / ("bb" * 32)).exists()


@pytest.mark.parametrize("code", [403, 429])
def test_a_refused_roster_ends_the_run_and_seals_nothing(
    session, tmp_path, monkeypatch, code
) -> None:
    monkeypatch.setattr("courtlens.services.source_acquisition.time.sleep", lambda _: None)
    requests: list[str] = []

    def respond(request: httpx.Request) -> httpx.Response:
        requests.append(request.url.path)
        if request.url.path == "/robots.txt":
            return httpx.Response(404)
        espn_id = request.url.path.split("/")[-2]
        if espn_id == "3":
            return httpx.Response(code, text="refused")
        return httpx.Response(200, content=team_body(espn_id, ["Someone"]))

    with (
        httpx.Client(transport=httpx.MockTransport(respond)) as client,
        pytest.raises(ValueError, match="no bundle sealed"),
    ):
        espn_rosters.refresh(session, tmp_path / "raw", client, tmp_path / "out")
    assert len(requests) == 4  # robots + ATL + BOS + NOP; nothing after the refusal
    assert not (tmp_path / "out").exists()


def test_newest_intact_bundle_is_served(tmp_path) -> None:
    older = espn_rosters.seal({"observed_at": "2026-10-19T00:00:00+00:00", "players": []}, tmp_path)
    newer = espn_rosters.seal({"observed_at": "2026-10-19T06:00:00+00:00", "players": []}, tmp_path)
    settings = Settings(espn_rosters_dir=tmp_path)
    with patch("courtlens.services.espn_rosters.get_settings", return_value=settings):
        assert espn_rosters.load_latest()[0] == newer  # type: ignore[index]
        newer.write_text("{}")  # damaged: skipped, never served
        (tmp_path / "touch.tmp").write_text("")  # a directory change drops the cache
        assert espn_rosters.load_latest()[0] == older  # type: ignore[index]


def test_complete_rosters_read_absence_as_off_a_roster_unless_unresolved() -> None:
    players = {p["name"]: p for p in parse_tracker(TRACKER.read_bytes(), 2026)["players"]}
    lebron, walker = players["LeBron James"], players["Lonnie Walker IV"]
    rosters = free_agency.Rosters(
        teams={lebron["player_id"]: "1610612755"}, complete=True, unresolved=frozenset(), info=None
    )
    assert free_agency.roster_check(lebron, rosters) == "agrees"
    # Unsigned and on no ESPN roster: NBA.com and ESPN agree (Bruce Brown, waived by NYK).
    assert free_agency.roster_check(walker, rosters) == "agrees"
    reaves = players["Austin Reaves"]
    assert free_agency.roster_check(reaves, rosters) == "not_on_roster"
    # An unmatched ESPN athlete with the same name might be him: unknown, never a flag.
    unsure = free_agency.Rosters(
        teams={}, complete=True, unresolved=frozenset({"austin reaves"}), info=None
    )
    assert free_agency.roster_check(reaves, unsure) is None


def test_old_receipts_of_unchanged_runs_are_pruned_but_sealed_ones_stay(session) -> None:
    from datetime import UTC, datetime, timedelta

    from courtlens.workbench_models import WorkbenchAcquisition, WorkbenchArtifact

    now = datetime(2026, 10, 20, tzinfo=UTC)
    artifact = WorkbenchArtifact(
        sha256="cc" * 32,
        resource=espn_rosters.RESOURCE,
        bytes=2,
        storage_path="cc/x",
        mime_type="application/json",
        source_attribution=espn_rosters.SOURCE,
    )
    session.add(artifact)
    session.flush()

    def receipt(days_ago: int, artifact_id: str | None, source: str = espn_rosters.SOURCE):
        row = WorkbenchAcquisition(
            source_name=source,
            resource=espn_rosters.RESOURCE,
            source_url=roster_url("18"),
            status="success",
            artifact_id=artifact_id,
            started_at=now - timedelta(days=days_ago),
            finished_at=now - timedelta(days=days_ago),
            metadata_json={},
        )
        session.add(row)
        return row

    stale, recent = receipt(40, None), receipt(5, None)
    sealed, other = receipt(40, artifact.id), receipt(40, None, "espn_injuries")
    session.commit()
    assert source_acquisition.prune_receipts(session, espn_rosters.SOURCE, 30, now) == 1
    remaining = {r.id for r in session.query(WorkbenchAcquisition).all()}
    assert stale.id not in remaining
    assert {recent.id, sealed.id, other.id} <= remaining
