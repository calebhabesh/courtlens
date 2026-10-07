"""Count actual fake-provider calls through shared worker/cache boundaries."""

from datetime import UTC, date, datetime, timedelta
from uuid import uuid4

import httpx
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from live_fakes import NOW, SLATE, FakeProvider, event
from sqlalchemy import func, select

from courtlens.api.app import create_app
from courtlens.config import get_settings
from courtlens.database import get_db
from courtlens.domain.live import LiveSubscription, parse_scoreboard, parse_summary
from courtlens.live_models import LiveContent, LiveFeed, LiveLease, LiveObservation
from courtlens.services.live import cached, poll_once, release, subscribe
from courtlens.services.live_provider import ESPNLiveProvider, LiveFetch, LiveProviderError
from courtlens.workbench_models import WorkbenchIdentityCrosswalk


def demand(session, game_id=None, now=NOW, slate=SLATE):
    return subscribe(session, LiveSubscription(slate_date=slate, game_id=game_id), now=now)


def test_multi_client_idle_expiry_and_dedup(test_engine, session):
    provider = FakeProvider()
    assert poll_once(test_engine, provider, now=NOW) == 0
    for _ in range(12):
        demand(session)
    assert poll_once(test_engine, provider, now=NOW) == 1
    assert poll_once(test_engine, provider, now=NOW + timedelta(seconds=59)) == 0
    assert poll_once(test_engine, provider, now=NOW + timedelta(seconds=60)) == 1
    assert session.scalar(select(func.count()).select_from(LiveContent)) == 1
    assert session.scalar(select(func.count()).select_from(LiveObservation)) == 2
    for lease in session.scalars(select(LiveLease)):
        release(session, lease.id)
    assert poll_once(test_engine, provider, now=NOW + timedelta(seconds=120)) == 0
    demand(session, now=NOW + timedelta(seconds=120))
    assert poll_once(test_engine, provider, now=NOW + timedelta(seconds=271)) == 0
    assert len(provider.calls) == 2


def test_new_parser_keeps_retained_v1_content(test_engine, session):
    import hashlib
    import json

    provider = FakeProvider()
    result = provider.fetch(SLATE)
    from courtlens.services.live import bind_identities

    normalized = bind_identities(session, result.normalized)
    old_hash = hashlib.sha256(
        result.raw + b"espn-live-v1" + json.dumps(normalized, sort_keys=True).encode()
    ).hexdigest()
    session.add(
        LiveContent(
            sha256=old_hash,
            raw_bytes=result.raw,
            normalized_json=normalized,
            parser_version="espn-live-v1",
        )
    )
    session.commit()
    demand(session)
    assert poll_once(test_engine, provider, now=NOW) == 1
    observation = session.scalar(select(LiveObservation))
    current = session.get(LiveContent, observation.content_sha256)
    assert current.parser_version == "espn-live-v2"
    assert current.sha256 != old_hash
    assert session.scalar(select(func.count()).select_from(LiveContent)) == 2
    retained = session.get(LiveContent, old_hash)
    assert retained.parser_version == "espn-live-v1" and retained.raw_bytes == result.raw


def test_transitions_final_correction_fair_boxes(test_engine, session):
    provider = FakeProvider([event(str(i)) for i in range(1, 6)])
    leases = [demand(session, str(i)) for i in range(1, 6)]
    assert poll_once(test_engine, provider, now=NOW) == 1
    provider.events = [event(str(i), "in", score="0") for i in range(1, 6)]
    assert poll_once(test_engine, provider, now=NOW + timedelta(seconds=60)) == 4
    assert poll_once(test_engine, provider, now=NOW + timedelta(seconds=120)) == 4
    assert {g for _, g in provider.calls if g} == {str(i) for i in range(1, 6)}
    for lease in leases:
        subscribe(
            session,
            LiveSubscription(slate_date=SLATE, game_id="1"),
            lease["id"],
            now=NOW + timedelta(seconds=120),
        )
    provider.events = [event("1", "post", completed=True, score="100")]
    assert poll_once(test_engine, provider, now=NOW + timedelta(seconds=180)) == 2
    assert poll_once(test_engine, provider, now=NOW + timedelta(seconds=240)) == 1
    for lease in leases:
        subscribe(
            session,
            LiveSubscription(slate_date=SLATE, game_id="1"),
            lease["id"],
            now=NOW + timedelta(seconds=240),
        )
    provider.events = [event("1", "post", completed=True, score="101")]
    assert poll_once(test_engine, provider, now=NOW + timedelta(seconds=300)) == 2
    session.expire_all()
    result = cached(session, SLATE, "1", enabled=True, now=NOW + timedelta(seconds=301))
    assert result["data"]["game"]["teams"][0]["score"] == 101
    assert result["data"]["player_sections"] is None
    provider.events = [event("1", name="STATUS_POSTPONED")]
    assert poll_once(test_engine, provider, now=NOW + timedelta(seconds=360)) == 1
    result = cached(session, SLATE, enabled=True, now=NOW + timedelta(seconds=600))
    assert result["data"]["games"][0]["status"] == "postponed"
    assert result["stale"] and result["paused"]


@pytest.mark.parametrize("failures,delay", [(1, 120), (2, 240), (3, 600)])
def test_backoff_and_last_good(test_engine, session, failures, delay):
    demand(session)
    provider = FakeProvider()
    poll_once(test_engine, provider, now=NOW)
    provider.error = LiveProviderError("http_503")
    at = NOW + timedelta(seconds=60)
    for i in range(failures):
        demand(session, now=at)
        assert poll_once(test_engine, provider, now=at) == 1
        wait = (120, 240, 600)[i]
        assert poll_once(test_engine, provider, now=at + timedelta(seconds=wait - 1)) == 0
        if i < failures - 1:
            at += timedelta(seconds=wait)
    session.expire_all()
    feed = session.get(LiveFeed, "espn")
    assert feed.next_poll_at.replace(tzinfo=UTC) == at + timedelta(seconds=delay)
    result = cached(session, SLATE, enabled=True, now=at)
    assert result["data"] and result["status"] == "source_error"
    assert result["requests"] == failures + 1


def test_denial_disables_candidate_and_retry_after(test_engine, session):
    demand(session)
    provider = FakeProvider()
    provider.error = LiveProviderError("http_429", retry_after=900)
    assert poll_once(test_engine, provider, now=NOW) == 1
    demand(session, now=NOW + timedelta(seconds=899))
    assert poll_once(test_engine, provider, now=NOW + timedelta(seconds=899)) == 0
    provider.error = LiveProviderError("http_403", denied=True)
    assert poll_once(test_engine, provider, now=NOW + timedelta(seconds=900)) == 1
    demand(session, now=NOW + timedelta(hours=1))
    assert poll_once(test_engine, provider, now=NOW + timedelta(hours=1)) == 0


def test_lease_capacity_dates_heartbeat(session):
    leases = [demand(session) for _ in range(64)]
    with pytest.raises(HTTPException) as error:
        demand(session)
    assert error.value.status_code == 429
    subscribe(
        session,
        LiveSubscription(slate_date=SLATE),
        leases[0]["id"],
        now=NOW + timedelta(seconds=60),
    )
    assert session.get(LiveLease, leases[0]["id"]).expires_at.replace(
        tzinfo=UTC
    ) == NOW + timedelta(seconds=210)
    with pytest.raises(HTTPException):
        demand(session, slate=date(2020, 1, 1))
    with pytest.raises(HTTPException):
        subscribe(session, LiveSubscription(slate_date=SLATE), str(uuid4()), now=NOW)
    demand(session, now=NOW + timedelta(seconds=211))
    assert session.scalar(select(func.count()).select_from(LiveLease)) == 1


def test_namespace_ambiguity_and_observation_binding(test_engine, session):
    session.add_all(
        [
            WorkbenchIdentityCrosswalk(
                source_namespace="espn",
                source_id="28",
                target_namespace="nba",
                target_id=t,
                kind="team",
                confidence="verified",
            )
            for t in ["TOR", "MIA"]
        ]
    )
    session.commit()
    demand(session)
    poll_once(test_engine, FakeProvider(), now=NOW)
    data = cached(session, SLATE, now=NOW)["data"]
    assert data["games"][0]["teams"][0]["canonical_id"] is None
    assert data["games"][0]["teams"][0]["identity_status"] == "ambiguous"


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


def test_protected_api_cache_does_not_fetch(session, monkeypatch):
    app = create_app()
    app.dependency_overrides[get_db] = lambda: session
    monkeypatch.setattr(ESPNLiveProvider, "fetch", lambda *a: pytest.fail("API downloaded"))
    with TestClient(app) as client:
        assert client.get("/api/live", params={"slate_date": SLATE.isoformat()}).status_code == 200
        payload = {"slate_date": datetime.now(UTC).date().isoformat()}
        assert client.post("/api/live/subscriptions", json=payload).status_code == 401
        headers = {"X-Operator-Token": get_settings().operator_token.get_secret_value()}
        assert (
            client.post(
                "/api/live/subscriptions",
                json=payload,
                headers={**headers, "Origin": "https://evil.example"},
            ).status_code
            == 403
        )
        response = client.post("/api/live/subscriptions", json=payload, headers=headers)
        assert response.status_code == 200
        lease_id = response.json()["id"]
        assert (
            client.post(
                f"/api/live/subscriptions/{lease_id}/heartbeat", json=payload, headers=headers
            ).status_code
            == 200
        )
        assert (
            client.delete(f"/api/live/subscriptions/{lease_id}", headers=headers).status_code == 204
        )


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


def test_storage_cap_stops_without_deleting_evidence(test_engine, session, monkeypatch):
    import courtlens.services.live as live

    demand(session)
    provider = FakeProvider()
    poll_once(test_engine, provider, now=NOW)
    monkeypatch.setattr(live, "MAX_CONTENT_BYTES", 1)
    assert poll_once(test_engine, provider, now=NOW + timedelta(seconds=60)) == 0
    assert session.scalar(select(func.count()).select_from(LiveObservation)) == 1
    session.expire_all()
    assert session.get(LiveFeed, "espn").status == "storage_limit"


def test_distinct_slate_demand_is_fair_and_coalesced(test_engine, session):
    demand(session, slate=SLATE)
    demand(session, slate=SLATE + timedelta(days=1))

    class EmptyProvider(FakeProvider):
        def fetch(self, slate, game_id=None):
            self.calls.append((slate, game_id))
            return LiveFetch(b'{"events":[]}', parse_scoreboard({"events": []}, slate))

    provider = EmptyProvider()
    assert poll_once(test_engine, provider, now=NOW) == 1
    assert poll_once(test_engine, provider, now=NOW + timedelta(seconds=60)) == 1
    assert {s for s, _ in provider.calls} == {SLATE, SLATE + timedelta(days=1)}


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


def test_box_fairness_across_multiple_slates(test_engine, session):
    from copy import deepcopy

    leases = []
    for slate in [SLATE, SLATE + timedelta(days=1)]:
        for i in range(1, 7):
            leases.append((demand(session, str(i), slate=slate), slate, str(i)))

    class MultiSlate(FakeProvider):
        def fetch(self, slate, game_id=None):
            self.calls.append((slate, game_id))

            def dated(i):
                e = deepcopy(event(i, "in"))
                e["date"] = slate.isoformat() + "T23:00Z"
                e["competitions"][0]["date"] = e["date"]
                return e

            if game_id:
                payload = {"header": dated(game_id)}
                normalized = parse_summary(payload, slate, game_id)
            else:
                payload = {"events": [dated(str(i)) for i in range(1, 7)]}
                normalized = parse_scoreboard(payload, slate)
            return LiveFetch(str(payload).encode(), normalized)

    provider = MultiSlate()
    for seconds in [0, 60, 120, 180]:
        if seconds == 120:
            for lease, slate, game_id in leases:
                subscribe(
                    session,
                    LiveSubscription(slate_date=slate, game_id=game_id),
                    lease["id"],
                    now=NOW + timedelta(seconds=120),
                )
        assert poll_once(test_engine, provider, now=NOW + timedelta(seconds=seconds)) == 4
    for slate in [SLATE, SLATE + timedelta(days=1)]:
        assert {g for s, g in provider.calls if s == slate and g} == {str(i) for i in range(1, 7)}
