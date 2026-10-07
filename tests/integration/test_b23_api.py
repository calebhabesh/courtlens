"""B23 PostgreSQL reads; isolated fixture writes roll back after each check."""

from collections.abc import Iterator

import pytest
import test_b21_api
from sqlalchemy import select

from courtlens.models import new_uuid
from courtlens.workbench_models import (
    WorkbenchMatchup,
    WorkbenchPbpEvent,
    WorkbenchPossession,
    WorkbenchSchedule,
    WorkbenchShot,
    allow_admin_mutation,
)

fixture_api = test_b21_api.fixture_api

pytestmark = pytest.mark.postgres


@pytest.fixture
def shooting_api(fixture_api: tuple) -> Iterator[tuple]:
    client, session, payload, _ = fixture_api
    schedules = list(
        session.scalars(
            select(WorkbenchSchedule)
            .where(WorkbenchSchedule.dataset_id == payload["release_id"])
            .order_by(WorkbenchSchedule.game_id)
        )
    )
    shots = []
    with allow_admin_mutation(session):
        for schedule in schedules:
            gid = schedule.game_id
            for i, player in enumerate(["a", "a", "b", "c"]):
                row = WorkbenchShot(
                    id=new_uuid(),
                    dataset_id=schedule.dataset_id,
                    game_id=gid,
                    period=1,
                    clock="10:00" if i == 0 else "09:00",
                    seconds_remaining=600 if i == 0 else 540,
                    team_id="TOR",
                    person_id=player,
                    shot_result="Missed" if i == 0 else "Made",
                    is_made=i != 0,
                    shot_value=2,
                    points=0 if i == 0 else 2,
                    shot_distance=0,
                    coord_x_feet=0,
                    coord_y_feet=0,
                    coordinates_present=i != 1,
                    zone_basic="Restricted Area",
                    zone_range="Less Than 8 ft.",
                    source_hash="a" * 64,
                    status="valid",
                )
                shots.append(row)
                session.add(row)
            session.add(
                WorkbenchPbpEvent(
                    id=new_uuid(),
                    dataset_id=schedule.dataset_id,
                    game_id=gid,
                    order_index=1,
                    action_number=1,
                    period=1,
                    clock="10:00",
                    seconds_remaining=600,
                    event_type="Missed Shot",
                    team_id="TOR",
                    person_id="a",
                    shot_value=2,
                    source_hash="a" * 64,
                    status="valid",
                )
            )
            for number, offense, defense, points in [(1, "TOR", "O", 3), (2, "O", "TOR", 0)]:
                session.add(
                    WorkbenchPossession(
                        id=new_uuid(),
                        dataset_id=schedule.dataset_id,
                        game_id=gid,
                        possession_number=number,
                        period=1,
                        number_in_period=number,
                        offense_team_id=offense,
                        defense_team_id=defense,
                        start_order_index=1 if number == 1 else 4,
                        end_order_index=3 if number == 1 else 5,
                        start_seconds_remaining=600 if number == 1 else 580,
                        end_seconds_remaining=590 if number == 1 else 570,
                        points=points,
                        stats_json={},
                        source_hash="a" * 64,
                        status="valid",
                    )
                )
            session.add(
                WorkbenchMatchup(
                    id=new_uuid(),
                    dataset_id=schedule.dataset_id,
                    game_id=gid,
                    off_team_id="TOR",
                    def_team_id="O",
                    side="home",
                    off_person_id="a",
                    def_person_id="d",
                    matchup_minutes="01:30",
                    matchup_seconds=90,
                    partial_possessions=1.5,
                    matchup_fgm=1,
                    matchup_fga=2,
                    player_points=2,
                    team_points=3,
                    source_hash="a" * 64,
                    status="valid",
                )
            )
        session.flush()
    request = {
        k: v for k, v in payload.items() if k not in {"team_id", "together", "min_possessions"}
    }
    request.update(player_id="a", min_attempts=1)
    yield client, session, request, shots


def post(client: object, operation: str, payload: dict) -> dict:
    response = client.post(f"/api/workbench/operations/{operation}", json=payload)
    assert response.status_code == 200, response.text
    return response.json()


def test_profiles_totals_missing_coordinates_and_peers(shooting_api: tuple) -> None:
    client, _, request, _ = shooting_api
    data = post(client, "shot-profile", request)
    assert data["expected_games"] == data["observed_games"] == 3
    p = data["profile"]
    assert (p["attempts"], p["makes"], p["points"], p["unknown_attempts"]) == (6, 3, 6, 3)
    assert p["zones"][-1]["zone"] == "Unknown" and p["zones"][-1]["attempts"] == 3
    assert len(data["shots"]) == 6
    peers = post(client, "shot-profile-peers", request)["peers"]
    assert [p["profile"]["player_id"] for p in peers] == ["b", "c"]
    assert all(p["distance"] == 0 for p in peers)
    gated = post(client, "shot-profile-peers", dict(request, min_attempts=100))
    assert gated["peers"] == [] and gated["profile"]["sample_status"] == "insufficient_sample"


def test_assignment_fractional_exposure_and_pooled_pct(shooting_api: tuple) -> None:
    client, _, request, _ = shooting_api
    pair = post(client, "matchups", request)["assignments"][0]
    assert pair["fractional_possessions"] == 4.5 and pair["seconds"] == 270
    assert pair["attempts"] == 6 and pair["makes"] == 3 and pair["fg_pct"] == 0.5
    assert post(client, "matchups", dict(request, defender_id="missing"))["assignments"] == []


def test_aftermath_raw_samples_and_unknown_branches(shooting_api: tuple) -> None:
    client, _, request, _ = shooting_api
    data = post(client, "shot-aftermath", request)
    assert data["branch_counts"] == {"missed_no_observed_recovery": 3, "unknown": 3}
    assert (
        sum(a["continued_points"] for a in data["anchors"] if a["continued_points"] is not None)
        == 9
    )
    assert all(a["next_opponent_points"] == 0 for a in data["anchors"] if a["branch"] != "unknown")
    unknown = data["aftermath_summary"][-1]
    assert unknown["continued_points"] is None and unknown["opponent_samples"] == 0
    assert unknown["first_chance_points"] is None
    assert data["coverage_status"] == "partial"


def test_future_same_day_phase_finality_and_content_identity(shooting_api: tuple) -> None:
    client, session, request, shots = shooting_api
    before = post(client, "shot-profile", request)
    with allow_admin_mutation(session):
        for index in [8, 12, 16, 20]:
            shots[index].is_made = True
            shots[index].points = 2
        session.flush()
    assert post(client, "shot-profile", request)["evidence_hash"] == before["evidence_hash"]
    with allow_admin_mutation(session):
        shots[0].is_made = True
        shots[0].points = 2
        session.flush()
    assert post(client, "shot-profile", request)["evidence_hash"] != before["evidence_hash"]


def test_date_scope_source_blocked_and_quarantine(shooting_api: tuple) -> None:
    client, session, request, shots = shooting_api
    lower = post(client, "shot-profile", dict(request, lower_date="2024-01-11"))
    assert lower["profile"]["attempts"] == 4 and lower["observed_games"] == 2
    blocked = post(client, "shot-profile", dict(request, player_id="missing"))
    assert blocked["profile"]["sample_status"] == "empty"
    with allow_admin_mutation(session):
        for s in shots:
            s.status = "quarantined"
        session.flush()
    blocked = post(client, "shot-profile", request)
    assert blocked["coverage_status"] == "source_blocked"
    assert blocked["excluded_rows"] == 12


def test_schema_scope_bounds_and_no_write(
    shooting_api: tuple, monkeypatch: pytest.MonkeyPatch
) -> None:
    client, session, request, _ = shooting_api
    assert not session.new and not session.dirty
    for changes in [
        {"season": "2000-01"},
        {"phase": "invalid"},
        {"before_date": "2030-01-01"},
        {"lower_date": "2020-01-01"},
        {"limit": 26},
        {"nearest_defender": True},
        {"defender_id": "d"},
    ]:
        assert (
            client.post(
                "/api/workbench/operations/shot-profile", json=dict(request, **changes)
            ).status_code
            == 422
        )
    post(client, "shot-profile", request)
    assert not session.new and not session.dirty
    monkeypatch.setattr("courtlens.services.shooting.MAX_ROWS", 1)
    response = client.post("/api/workbench/operations/shot-profile", json=request)
    assert (
        response.status_code == 422
        and response.json()["detail"]["reason"] == "query_bound_exceeded"
    )


def test_peer_distance_explains_zone_shares_and_provenance_hash(shooting_api: tuple) -> None:
    client, session, request, shots = shooting_api
    initial = post(client, "shot-profile-peers", request)
    with allow_admin_mutation(session):
        for s in shots:
            s.source_hash = "b" * 64
        session.flush()
    assert post(client, "shot-profile-peers", request)["input_hash"] == initial["input_hash"]
    with allow_admin_mutation(session):
        for s in shots:
            if s.person_id == "c":
                s.coord_x_feet = 22
                s.coord_y_feet = 10
                s.shot_distance = 24
                s.shot_value = 3
                s.points = 3
        session.flush()
    peers = post(client, "shot-profile-peers", request)["peers"]
    assert peers[0]["profile"]["player_id"] == "b" and peers[0]["distance"] == 0
    assert peers[1]["distance"] == pytest.approx(2**0.5)
    assert peers[1]["profile"]["points"] == 9


def test_prior_assignment_possession_changes_and_invalid_input(shooting_api: tuple) -> None:
    client, session, request, _ = shooting_api
    initial = {name: post(client, name, request) for name in ["matchups", "shot-aftermath"]}
    pair = session.scalar(
        select(WorkbenchMatchup)
        .where(WorkbenchMatchup.dataset_id == request["release_id"])
        .order_by(WorkbenchMatchup.game_id)
    )
    possession = session.scalar(
        select(WorkbenchPossession)
        .where(WorkbenchPossession.dataset_id == request["release_id"])
        .order_by(WorkbenchPossession.game_id, WorkbenchPossession.possession_number)
    )
    assert pair is not None and possession is not None
    with allow_admin_mutation(session):
        pair.partial_possessions = 0.75
        possession.points = 4
        session.flush()
    for name in initial:
        assert post(client, name, request)["evidence_hash"] != initial[name]["evidence_hash"]
    with allow_admin_mutation(session):
        possession.status = "quarantined"
        session.flush()
    data = post(client, "shot-aftermath", request)
    assert data["observed_games"] == 2
    assert data["excluded_rows"] == 7  # Four shots, one event, both possessions in that game.
