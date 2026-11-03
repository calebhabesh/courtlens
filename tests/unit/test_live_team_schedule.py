"""ESPN team schedules (team page calendar): parse, cache freshness and the API."""

import copy

import pytest
from fastapi.testclient import TestClient
from live_fakes import NOW, FakeProvider, event

from courtlens.api.app import create_app
from courtlens.api.routers.live import get_provider
from courtlens.database import get_db
from courtlens.domain.live import parse_team_schedule
from courtlens.services.live import is_final, refresh_seconds


def schedule_event(game_id, when, state="pre", score=None, note=None):
    e = event(
        game_id, state, completed=state == "post", name="STATUS_FINAL" if state == "post" else None
    )
    e["date"] = e["competitions"][0]["date"] = when
    for competitor, points in zip(
        e["competitions"][0]["competitors"], score or (None, None), strict=True
    ):
        # Team schedules give scores as objects, and none before tip-off.
        competitor.pop("score")
        if points is not None:
            competitor["score"] = {"value": float(points), "displayValue": str(points)}
            competitor["winner"] = points == max(score)
    if note:
        e["competitions"][0]["notes"] = [{"type": "event", "headline": note}]
    return e


def test_schedule_parses_played_and_upcoming_games_in_eastern_dates():
    events = [
        schedule_event("2", "2026-11-07T01:00Z", note="NBA Cup - Group Play"),
        schedule_event("1", "2026-10-21T23:30Z", "post", (135, 92)),
        {"id": "3", "date": "TBD", "competitions": [{}]},
    ]
    data = parse_team_schedule({"events": events}, "28", 2027, 2)
    first, second = data["games"]
    assert data["season"] == "2026-27" and data["dropped_events"] == 1
    assert first["source_id"] == "1" and first["status"] == "final"
    assert [t["score"] for t in first["teams"]] == [135, 92]
    assert first["teams"][0]["winner"] is True and first["note"] is None
    # 01:00 UTC on Nov 7 is the evening of Nov 6 in New York.
    assert second["slate_date"] == "2026-11-06" and second["status"] == "scheduled"
    assert [t["score"] for t in second["teams"]] == [None, None]
    assert second["note"] == "NBA Cup - Group Play"


def test_schedule_rejects_a_game_without_the_team():
    with pytest.raises(ValueError, match="without the team"):
        parse_team_schedule({"events": [schedule_event("1", "2026-10-21T23:30Z")]}, "5", 2027, 2)


def test_schedule_freshness_follows_the_season():
    upcoming = {"games": [{"status": "scheduled"}]}
    played = {"games": [{"status": "final"}]}
    live = {"games": [{"status": "in_progress"}, {"status": "scheduled"}]}
    today = NOW.date()
    assert refresh_seconds("schedule:28:2027:2", upcoming, NOW) == 600
    assert refresh_seconds("schedule:28:2027:2", live, NOW) == 60
    # The current season stays open even when every listed game is played (more can be added).
    assert not is_final("schedule:28:2027:2", played, today)
    assert is_final("schedule:28:2026:3", played, today)
    assert refresh_seconds("schedule:28:2026:3", played, NOW) is None
    assert not is_final("schedule:28:2026:2", upcoming, today)


def test_schedule_api_maps_franchises_and_binds_identities(session):
    provider = FakeProvider([schedule_event("1", "2026-10-21T23:30Z", "post", (135, 92))])
    app = create_app()
    app.dependency_overrides[get_db] = lambda: session
    app.dependency_overrides[get_provider] = lambda: provider
    with TestClient(app) as client:
        body = client.get(
            "/api/live/teams/1610612761/schedule", params={"season": "2025-26"}
        ).json()
        assert body["resource"] == "schedule:28:2026:2" and body["status"] == "observed"
        game = body["data"]["games"][0]
        assert (
            game["teams"][0]["tricode"] == "TOR"
            and game["teams"][0]["canonical_id"] == "1610612761"
        )
        # A tricode and the playoffs map to the same team's other phase.
        assert (
            client.get(
                "/api/live/teams/TOR/schedule", params={"season": "2025-26", "phase": "playoffs"}
            ).json()["resource"]
            == "schedule:28:2026:3"
        )
        # Era codes reach their franchise: the SuperSonics are the Thunder's ESPN team (25).
        provider.events = [copy.deepcopy(provider.events[0])]
        provider.events[0]["competitions"][0]["competitors"][0]["team"]["id"] = "25"
        assert (
            client.get("/api/live/teams/SEA/schedule", params={"season": "2005-06"}).json()[
                "resource"
            ]
            == "schedule:25:2006:2"
        )
        assert client.get("/api/live/teams/XYZ/schedule").status_code == 404
        assert (
            client.get("/api/live/teams/TOR/schedule", params={"season": "1970-71"}).status_code
            == 422
        )
        assert (
            client.get("/api/live/teams/TOR/schedule", params={"phase": "preseason"}).status_code
            == 422
        )
