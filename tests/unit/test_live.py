"""On-demand Live reads: fetch when stale, share one fetch, keep finals as evidence."""

from datetime import date, timedelta

import httpx
import pytest
from fastapi.testclient import TestClient
from live_fakes import NOW, SLATE, FakeProvider, event
from sqlalchemy import func, select

from courtlens.api.app import create_app
from courtlens.api.routers.live import get_provider
from courtlens.database import get_db
from courtlens.domain.live import parse_plays, parse_scoreboard, parse_summary, score_running
from courtlens.live_models import LiveContent, LiveCurrent, LiveObservation
from courtlens.services.live import read, refresh_seconds, with_injury_counts
from courtlens.services.live_provider import ESPNLiveProvider, LiveProviderError
from courtlens.workbench_models import WorkbenchIdentityCrosswalk


def final_event(game_id="1"):
    return event(game_id, "post", completed=True, score="100")


def test_first_read_fetches_then_serves_cache_until_stale(session):
    provider = FakeProvider([event("1", "in", score="10")])
    first = read(session, provider, SLATE, now=NOW)
    assert first["status"] == "observed" and first["refresh_seconds"] == 20
    assert first["final"] is False and first["observation_id"] is None
    assert read(session, provider, SLATE, now=NOW + timedelta(seconds=19))["age_seconds"] == 19
    assert len(provider.calls) == 1
    read(session, provider, SLATE, now=NOW + timedelta(seconds=20))
    assert len(provider.calls) == 2
    # In-progress reads replace the current row; nothing is retained as evidence yet.
    assert session.scalar(select(func.count()).select_from(LiveObservation)) == 0
    assert session.scalar(select(func.count()).select_from(LiveCurrent)) == 1


def test_final_is_fetched_once_and_retained(session):
    provider = FakeProvider([final_event()])
    result = read(session, provider, SLATE, now=NOW)
    assert result["final"] is True and result["refresh_seconds"] is None
    assert result["observation_id"] and result["content_sha256"]
    read(session, provider, SLATE, now=NOW + timedelta(days=30))
    assert len(provider.calls) == 1
    observation = session.scalar(select(LiveObservation))
    content = session.get(LiveContent, observation.content_sha256)
    assert content.parser_version == "espn-live-v4"
    assert observation.resource == f"slate:{SLATE}"


def test_any_past_date_can_be_read(session):
    """No seven-day window: an old final date reads like today."""
    old = date(2024, 1, 15)
    provider = FakeProvider([{**final_event(), "date": "2024-01-16T00:30Z"}])
    provider.events[0]["competitions"][0]["date"] = "2024-01-16T00:30Z"
    assert read(session, provider, old, now=NOW)["data"]["games"][0]["status"] == "final"
    assert provider.calls == [(old, None)]


def test_empty_past_date_is_final_but_today_is_not(session):
    provider = FakeProvider()
    provider.events = []
    assert read(session, provider, SLATE - timedelta(days=5), now=NOW)["final"] is True
    assert read(session, provider, SLATE, now=NOW)["final"] is False


def test_upcoming_refresh_follows_tipoff(session):
    data = parse_scoreboard({"events": [event()]}, SLATE)
    assert refresh_seconds(f"slate:{SLATE}", data, NOW) == 600
    assert refresh_seconds(f"slate:{SLATE}", data, NOW + timedelta(hours=4, minutes=30)) == 60


@pytest.mark.parametrize("failures,wait", [(1, 30), (2, 60), (3, 120), (4, 300), (9, 300)])
def test_failure_backs_off_and_keeps_last_good(session, failures, wait):
    provider = FakeProvider([event("1", "in")])
    read(session, provider, SLATE, now=NOW)
    provider.error = LiveProviderError("http_503")
    t = NOW + timedelta(seconds=20)
    for _ in range(failures):
        result = read(session, provider, SLATE, now=t)
        current = session.get(LiveCurrent, f"slate:{SLATE}")
        t = current.attempted_at + timedelta(seconds=300)
    current.attempted_at = NOW + timedelta(seconds=20)
    session.commit()
    calls = len(provider.calls)
    result = read(session, provider, SLATE, now=NOW + timedelta(seconds=20 + wait - 1))
    assert len(provider.calls) == calls
    assert result["status"] == "source_error" and result["error"] == "http_503"
    assert result["data"]["games"][0]["source_id"] == "1"
    provider.error = None
    result = read(session, provider, SLATE, now=NOW + timedelta(seconds=20 + wait))
    assert result["status"] == "observed" and result["error"] is None


def test_unavailable_before_any_success(session):
    provider = FakeProvider()
    provider.error = LiveProviderError("http_403", denied=True)
    result = read(session, provider, SLATE, now=NOW)
    assert result["status"] == "source_error" and result["data"] is None


def test_storage_cap_serves_final_without_new_evidence(session, monkeypatch):
    import courtlens.services.live as live

    monkeypatch.setattr(live, "MAX_CONTENT_BYTES", 1)
    result = read(session, FakeProvider([final_event()]), SLATE, now=NOW)
    assert result["final"] is True and result["observation_id"] is None
    assert result["data"]["games"][0]["status"] == "final"
    assert session.scalar(select(func.count()).select_from(LiveObservation)) == 0


def test_teams_bind_through_the_espn_table_and_crosswalk_ambiguity(session):
    session.add_all(
        [
            WorkbenchIdentityCrosswalk(
                source_namespace="espn",
                source_id="14",
                target_namespace="nba",
                target_id=t,
                kind="team",
                confidence="verified",
            )
            for t in ["MIA", "TOR"]
        ]
    )
    session.commit()
    teams = read(session, FakeProvider(), SLATE, now=NOW)["data"]["games"][0]["teams"]
    toronto, miami = teams
    assert toronto["tricode"] == "TOR" and toronto["canonical_id"] == "1610612761"
    assert toronto["identity_status"] == "verified"
    assert miami["canonical_id"] is None and miami["identity_status"] == "ambiguous"


def test_players_bind_by_verified_crosswalk_only_when_unique(session):
    session.add(
        WorkbenchIdentityCrosswalk(
            source_namespace="espn",
            source_id="11",
            target_namespace="nba",
            target_id="1628389",
            kind="player",
            confidence="verified",
        )
    )
    session.commit()
    payload = {
        "header": event("1", "in"),
        "boxscore": {
            "players": [
                {
                    "team": {"id": "28"},
                    "statistics": [
                        {
                            "keys": ["points"],
                            "athletes": [
                                {"athlete": {"id": "11", "displayName": "A"}, "stats": ["2"]},
                                {"athlete": {"id": "12", "displayName": "Nobody"}, "stats": ["0"]},
                            ],
                        }
                    ],
                }
            ]
        },
    }
    from courtlens.services.live_identity import bind_identities

    players = bind_identities(session, parse_summary(payload, SLATE, "1"))["players"]
    assert (players[0]["canonical_id"], players[0]["identity_status"]) == ("1628389", "verified")
    assert (players[1]["canonical_id"], players[1]["identity_status"]) == (None, "unmapped")


def test_injury_counts_only_on_upcoming_games():
    data = parse_scoreboard({"events": [event("1"), final_event("2")]}, SLATE)
    data["games"][1]["teams"][0]["source_id"] = "28"
    injuries = {"data": {"teams": {"28": [{"status": "Out"}, {"status": "Day-To-Day"}]}}}
    games = with_injury_counts({"data": data}, injuries)["data"]["games"]
    assert games[0]["teams"][0]["out"] == 1 and games[0]["teams"][1]["out"] == 0
    assert "out" not in games[1]["teams"][0]


def test_api_reads_on_demand_and_has_no_mutations(session):
    app = create_app()
    provider = FakeProvider([event("1", "in")])
    app.dependency_overrides[get_db] = lambda: session
    app.dependency_overrides[get_provider] = lambda: provider
    with TestClient(app) as client:
        response = client.get("/api/live", params={"slate_date": SLATE.isoformat()})
        assert response.status_code == 200 and response.headers["cache-control"] == "no-store"
        assert response.json()["data"]["games"][0]["status"] == "in_progress"
        game = client.get("/api/live/games/1", params={"slate_date": SLATE.isoformat()})
        assert game.status_code == 200 and game.json()["resource"] == "game:1"
        assert (
            client.get("/api/live/games/x1", params={"slate_date": SLATE.isoformat()}).status_code
            == 422
        )
        assert client.post("/api/live/subscriptions", json={}).status_code in {404, 405}
    assert (SLATE, "1") in provider.calls


def test_running_score_comes_from_scoring_plays():
    plays = [
        {
            "id": "1",
            "team": {"id": "28"},
            "scoringPlay": True,
            "scoreValue": 2,
            "homeScore": 2,
            "awayScore": 0,
        },
        {
            "id": "2",
            "team": {"id": "14"},
            "scoringPlay": True,
            "scoreValue": 1,
            "homeScore": 5,
            "awayScore": 1,
        },
        {
            "id": "3",
            "team": {"id": "14"},
            "scoringPlay": True,
            "scoreValue": 3,
            "homeScore": 5,
            "awayScore": 4,
        },
    ]
    rows = parse_plays(plays, {"28": "home", "14": "away"})
    assert score_running(rows, {"home": 2, "away": 4}) == "scoring_plays"
    assert [(r["away_score"], r["home_score"]) for r in rows] == [(0, 2), (1, 2), (4, 2)]
    rows = parse_plays(plays, {"28": "home", "14": "away"})
    # A sum that misses the final keeps the source's own per-play score.
    assert score_running(rows, {"home": 9, "away": 4}) == "source"
    assert rows[1]["home_score"] == 5


def test_shot_spots_only_on_field_goal_attempts():
    plays = [
        {
            "id": "1",
            "team": {"id": "28"},
            "shootingPlay": True,
            "type": {"text": "Jump Shot"},
            "text": "A makes 9-foot jumper",
            "coordinate": {"x": 34, "y": 1},
            "pointsAttempted": 2,
        },
        {
            "id": "2",
            "team": {"id": "28"},
            "shootingPlay": True,
            "type": {"text": "Free Throw - 1 of 2"},
            "text": "A makes free throw 1 of 2",
            "coordinate": {"x": -214748340, "y": -214748365},
        },
        {
            "id": "3",
            "team": {"id": "28"},
            "shootingPlay": False,
            "type": {"text": "Defensive Rebound"},
            "text": "A defensive rebound",
            "coordinate": {"x": 24, "y": 8},
        },
    ]
    rows = parse_plays(plays, {"28": "home", "14": "away"})
    assert (rows[0]["shot"], rows[0]["x"], rows[0]["y"]) == ("field_goal", 34, 1)
    assert (rows[1]["shot"], rows[1]["x"]) == ("free_throw", None)
    assert (rows[2]["shot"], rows[2]["x"]) == (None, None)
    with pytest.raises(ValueError, match="play team"):
        parse_plays([{"team": {"id": "99"}}], {"28": "home"})


def test_scheduled_scoreboard_keeps_the_free_line_and_record():
    e = event()
    e["competitions"][0]["odds"] = [
        {
            "provider": {"name": "DraftKings"},
            "details": "TOR -3.5",
            "overUnder": 220.5,
            "spread": -3.5,
        }
    ]
    e["competitions"][0]["competitors"][0]["records"] = [{"type": "total", "summary": "2-1"}]
    game = parse_scoreboard({"events": [e]}, SLATE)["games"][0]
    assert game["odds"]["provider"] == "DraftKings" and game["odds"]["over_under"] == 220.5
    assert game["teams"][0]["record"] == "2-1"
    e["status"]["type"].update(state="in", name="STATUS_IN_PROGRESS")
    assert parse_scoreboard({"events": [e]}, SLATE)["games"][0]["odds"] is None


@pytest.mark.parametrize(
    "name,expected",
    [("STATUS_POSTPONED", "postponed"), ("STATUS_CANCELED", "cancelled"), ("OTHER", "unknown")],
)
def test_source_status_missingness(name, expected):
    result = parse_scoreboard({"events": [event(name=name)]}, SLATE)
    g = result["games"][0]
    assert g["status"] == expected and g["teams"][0]["score"] is None


def test_invalid_dates_clocks_duplicate_ids_and_empty_boxes():
    with pytest.raises(ValueError):
        parse_scoreboard({"events": [event()]}, date(2026, 10, 2))
    e = event(state="in")
    e["status"]["displayClock"] = "oops"
    with pytest.raises(ValueError):
        parse_scoreboard({"events": [e]}, SLATE)
    with pytest.raises(ValueError):
        parse_scoreboard({"events": [event(), event()]}, SLATE)
    assert parse_scoreboard({"events": []}, SLATE)["source_state"] == "empty_slate"
    with pytest.raises(ValueError):
        parse_summary({"header": event()}, SLATE, "2")


@pytest.mark.parametrize("stats", [[], None])
def test_source_reported_nonappearance_without_stat_values(stats):
    """Real active ESPN boxes omit values for explicitly reported nonappearances."""
    row = {"athlete": {"id": "4396963"}, "didNotPlay": True}
    if stats is not None:
        row["stats"] = stats
    payload = {
        "header": event("1", "in"),
        "boxscore": {
            "players": [
                {
                    "team": {"id": "28"},
                    "statistics": [
                        {
                            "keys": ["minutes", "points"],
                            "athletes": [row],
                        }
                    ],
                }
            ],
        },
    }
    player = parse_summary(payload, SLATE, "1")["players"][0]
    assert player["reported_nonappearance"] is True
    assert player["statistics"] == {"minutes": None, "points": None}
    assert player["provisional"] is True
    # Source rows stay unchanged and absence is never inferred as nonappearance.
    assert row.get("stats", []) == []
    row.pop("didNotPlay")
    with pytest.raises(ValueError, match="box statistic columns mismatch"):
        parse_summary(payload, SLATE, "1")
    row["didNotPlay"] = True
    row["stats"] = ["0"]
    with pytest.raises(ValueError, match="box statistic columns mismatch"):
        parse_summary(payload, SLATE, "1")


@pytest.mark.parametrize(
    "status,headers,body,reason",
    [
        (403, {}, b"", "http_403"),
        (429, {"Retry-After": "240"}, b"", "http_429"),
        (200, {}, b"x" * (512 * 1024 + 1), "payload_too_large"),
        (200, {}, b"invalid", "JSONDecodeError"),
        (200, {"Content-Encoding": "gzip"}, b"", "unsupported_content_encoding"),
    ],
)
def test_transport_limits(status, headers, body, reason):
    class Stream(httpx.AsyncByteStream):
        async def __aiter__(self):
            yield body

    transport = httpx.MockTransport(
        lambda r: httpx.Response(status, headers=headers, stream=Stream())
    )
    provider = ESPNLiveProvider(transport)
    with pytest.raises(LiveProviderError, match=reason):
        provider.fetch(SLATE)


def test_player_provisional_zero_nonappearance_and_absence():
    payload = {
        "header": event("1", "in"),
        "boxscore": {
            "players": [
                {
                    "team": {"id": "28"},
                    "statistics": [
                        {
                            "keys": ["points"],
                            "athletes": [
                                {
                                    "athlete": {"id": "11", "displayName": "Appeared zero"},
                                    "didNotPlay": False,
                                    "stats": ["0"],
                                },
                                {
                                    "athlete": {"id": "12", "displayName": "Source DNP"},
                                    "didNotPlay": True,
                                    "stats": ["0"],
                                },
                            ],
                        }
                    ],
                }
            ]
        },
    }
    normalized = parse_summary(payload, SLATE, "1")
    assert normalized["players"][0]["statistics"]["points"] == "0"
    assert normalized["players"][0]["reported_nonappearance"] is False
    assert normalized["players"][1]["statistics"]["points"] is None
    assert len(normalized["players"]) == 2
    payload["header"] = event("1")
    assert parse_summary(payload, SLATE, "1")["players"] is None


def test_a_new_parser_refetches_a_cached_final(session, monkeypatch):
    provider = FakeProvider([final_event()])
    read(session, provider, SLATE, now=NOW)
    current = session.get(LiveCurrent, f"slate:{SLATE}")
    current.normalized_json = {**current.normalized_json, "parser_version": "espn-live-v0"}
    session.commit()
    read(session, provider, SLATE, now=NOW + timedelta(days=1))
    assert len(provider.calls) == 2


def test_scoreboard_calendar_lists_eastern_game_dates():
    payload = {
        "events": [],
        "leagues": [
            {"calendarType": "day", "calendar": ["2026-10-03T07:00Z", "2026-10-05T07:00Z"]}
        ],
    }
    assert parse_scoreboard(payload, SLATE)["calendar"] == ["2026-10-03", "2026-10-05"]
