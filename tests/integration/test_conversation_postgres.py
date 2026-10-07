"""Disposable PostgreSQL acceptance for supervised assistant reads and immutability."""

import json
import os
import time
from datetime import date
from types import SimpleNamespace
from unittest.mock import patch
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, func, select, text
from sqlalchemy.orm import Session

from courtlens.api.app import create_app
from courtlens.database import Base, get_db
from courtlens.domain.conversation import (
    AnalysisPlan,
    ConversationContext,
    ConversationTurnRequest,
    OperationStep,
)
from courtlens.services.assistant.conversations import reset_local_state, run_conversation_turn
from courtlens.services.assistant.execution import _worker, execute_bounded
from courtlens.services.assistant.operations import (
    EntityClarification,
    canonical_step,
    resolve_entity,
)
from courtlens.services.workbench_analytics import resolve_workbench_context
from courtlens.workbench_models import (
    WorkbenchAcquisition,
    WorkbenchArtifact,
    WorkbenchDataset,
    WorkbenchIdentity,
    WorkbenchObservation,
    WorkbenchPlayerGame,
    WorkbenchVersion,
)


@pytest.fixture
def postgres_conversation():
    url = os.environ.get("COURTLENS_TEST_POSTGRES_URL")
    if not url:
        pytest.skip("disposable PostgreSQL URL required")
    root = create_engine(url)
    schema = "b33_" + uuid4().hex
    with root.begin() as connection:
        connection.execute(text(f"CREATE SCHEMA {schema}"))
    engine = create_engine(url, connect_args={"options": f"-csearch_path={schema}"})
    Base.metadata.create_all(engine)
    reset_local_state()
    try:
        with Session(engine) as session:
            artifact = WorkbenchArtifact(
                sha256="a" * 64,
                resource="synthetic",
                bytes=1,
                storage_path="synthetic",
                mime_type="application/json",
                source_attribution="synthetic",
            )
            session.add(artifact)
            session.flush()
            acquisition = WorkbenchAcquisition(
                source_name="synthetic",
                resource="synthetic",
                source_url="synthetic",
                status="success",
                artifact_id=artifact.id,
            )
            session.add(acquisition)
            session.flush()
            identity = WorkbenchIdentity(
                namespace="nba", kind="player", external_id="1630567", display_name="Scottie Barnes"
            )
            second = WorkbenchIdentity(
                namespace="nba", kind="player", external_id="1", display_name="Another Barnes"
            )
            unicode = WorkbenchIdentity(
                namespace="nba", kind="player", external_id="2", display_name="Luka Dončić"
            )
            unrelated = WorkbenchIdentity(
                namespace="other",
                kind="player",
                external_id="42",
                display_name="Unsupported Namespace",
            )
            session.add_all([identity, second, unicode, unrelated])
            session.flush()
            identity.canonical_id = identity.id
            version = WorkbenchVersion(
                identity_id=identity.id,
                content_sha256="b" * 64,
                parser_version="synthetic",
                payload_json={},
            )
            session.add(version)
            session.flush()
            observation = WorkbenchObservation(
                acquisition_id=acquisition.id,
                artifact_id=artifact.id,
                row_identifier="row",
                identity_id=identity.id,
                version_id=version.id,
                observation_order=1,
            )
            session.add(observation)
            session.flush()
            dataset = WorkbenchDataset(
                content_sha256="c" * 64,
                membership_sha256="d" * 64,
                semantic_signature="e" * 64,
                source_namespace="synthetic",
                parser_version="synthetic",
                quality_version="synthetic",
                seasons_json=["2024-25", "2025-26"],
                phases_json=["regular_season"],
                manifest_json={},
                coverage_json={},
                exclusions_json={},
                status="ready",
            )
            session.add(dataset)
            session.flush()
            for pid in ("1630567", "1", "2"):
                for day in range(1, 31):
                    session.add(
                        WorkbenchPlayerGame(
                            dataset_id=dataset.id,
                            game_id=f"002240{day:04}",
                            player_id=pid,
                            team_id="1610612761",
                            opponent_id="1610612738",
                            game_date=date(2025, 3, day),
                            season="2024-25",
                            phase="regular_season",
                            appearance="appeared",
                            minutes_original="30",
                            minutes_seconds=1200 if day <= 20 else 1800,
                            points=10 if day <= 20 else 8,
                            stats_json={
                                "points": 10 if day <= 20 else 8,
                                "rebounds_total": 5,
                                "assists": 5,
                                "steals": 1,
                                "blocks": 0,
                                "turnovers": 1,
                                "field_goals_attempted": 10,
                                "field_goals_made": 4,
                                "three_pointers_attempted": 3,
                                "three_pointers_made": 1,
                                "free_throws_attempted": 2,
                                "free_throws_made": 1,
                            },
                            source_version_id=version.id,
                            source_observation_id=observation.id,
                        )
                    )
            session.commit()
            context = resolve_workbench_context(
                session,
                release_id=dataset.id,
                requested_season="2024-25",
                requested_before_date=date(2025, 4, 15),
            )
            yield session, context
    finally:
        reset_local_state()
        engine.dispose()
        with root.begin() as connection:
            connection.execute(text(f"DROP SCHEMA {schema} CASCADE"))
        root.dispose()


def request(context, steps):
    return ConversationTurnRequest(
        message="Manual read",
        request_id=uuid4(),
        context=ConversationContext(
            release_id=context.release_id, season=context.season, before_date=context.before_date
        ),
        plan=AnalysisPlan(steps=steps),
    )


def test_postgres_real_query_and_context_bound_http(postgres_conversation):
    session, context = postgres_conversation
    app = create_app()
    app.dependency_overrides[get_db] = lambda: session
    client = TestClient(app)
    count = session.scalar(select(func.count()).select_from(WorkbenchPlayerGame))
    payload = request(
        context, [OperationStep(step_id="a", operation="query", arguments={"page": {"limit": 10}})]
    )
    response = client.post("/api/workbench/assistant/turn", json=payload.model_dump(mode="json"))
    assert response.status_code == 200
    answer = response.json()
    assert answer["status"] == "answered" and answer["results"][0]["eligible_count"] == 3
    assert answer["results"][0]["rows"][0]["metrics"]["pts_per_game"] == pytest.approx(9.3)
    assert answer["accounting"]["provider_calls"] == 0
    assert session.scalar(select(func.count()).select_from(WorkbenchPlayerGame)) == count
    assert (
        client.post(
            "/api/workbench/assistant/turn",
            json={**payload.model_dump(mode="json"), "sql": "SELECT 1"},
        ).status_code
        == 422
    )
    assert client.delete(
        "/api/workbench/assistant/conversations/" + answer["conversation_id"]
    ).json()["cleared"]


def test_postgres_names_namespace_and_ambiguity(postgres_conversation):
    session, context = postgres_conversation
    assert resolve_entity(session, context, "1630567", "player_id") == "1630567"
    assert resolve_entity(session, context, "Scottie Barnes", "player_id") == "1630567"
    assert resolve_entity(session, context, "Luka Doncic", "player_id") == "2"
    with pytest.raises(EntityClarification) as ambiguous:
        resolve_entity(session, context, "Barnes", "player_id")
    assert {c["value"] for c in ambiguous.value.choices} == {"1630567", "1"}
    with pytest.raises(ValueError):
        resolve_entity(session, context, "42", "player_id")


def test_postgres_both_distributions_and_periods(postgres_conversation):
    session, context = postgres_conversation
    steps = [
        OperationStep(
            step_id="points",
            operation="distribution",
            arguments={"player_id": "1630567", "metric": "pts"},
        ),
        OperationStep(
            step_id="minutes",
            operation="distribution",
            arguments={"player_id": "1630567", "metric": "min_per_game"},
        ),
    ]
    answer = run_conversation_turn(session, request(context, steps))
    assert answer.status == "answered"
    points, minutes = [r.data["summary"] for r in answer.results]
    assert points["n"] == minutes["n"] == 20
    assert points["mean"] == 9 and minutes["mean"] == 25
    assert points["population_sd"] == 1 and minutes["population_sd"] == 5
    period = run_conversation_turn(
        session,
        request(
            context,
            [
                OperationStep(
                    step_id="a",
                    operation="compare_periods",
                    arguments={"player_id": "1630567", "metrics": ["pts_per_game", "min_per_game"]},
                )
            ],
        ),
    )
    assert period.status == "answered"
    delta = {d["metric_key"]: d["absolute_delta"] for d in period.results[0].data["deltas"]}
    assert delta == {"pts_per_game": -2, "min_per_game": 10}


def test_postgres_future_mutation_preserves_previous_result(postgres_conversation):
    session, context = postgres_conversation
    step = canonical_step(
        session, context, OperationStep(step_id="a", operation="query", arguments={})
    )
    first = execute_bounded(session, context, step, time.monotonic() + 5)
    original = session.scalar(select(WorkbenchPlayerGame).limit(1))
    future = WorkbenchPlayerGame(
        dataset_id=context.dataset_id,
        game_id="0022409999",
        player_id="1630567",
        team_id=original.team_id,
        opponent_id=original.opponent_id,
        game_date=date(2025, 4, 16),
        season="2024-25",
        phase="regular_season",
        appearance="appeared",
        minutes_original="48",
        minutes_seconds=2880,
        points=999,
        stats_json={"points": 999},
        source_version_id=original.source_version_id,
        source_observation_id=original.source_observation_id,
    )
    session.add(future)
    session.commit()
    second = execute_bounded(session, context, step, time.monotonic() + 5)
    assert second == first
    # Administrative mutation is permitted only on this disposable synthetic fixture.
    session.info["allow_admin_mutation"] = True
    try:
        future.points = 0
        future.stats_json = {"points": 0}
        session.commit()
    finally:
        session.info.pop("allow_admin_mutation", None)
    assert execute_bounded(session, context, step, time.monotonic() + 5) == first


def test_postgres_worker_rejects_writes_and_sanitizes_error(postgres_conversation):
    session, context = postgres_conversation
    output = []
    transport = SimpleNamespace(send_bytes=output.append, close=lambda: None)

    def malicious(db, *_):
        db.execute(text("DELETE FROM workbench_player_games"))
        return {}

    with patch("courtlens.services.assistant.execution.execute_operation", side_effect=malicious):
        _worker(
            transport,
            session.get_bind().url.render_as_string(hide_password=False),
            session.execute(text("SHOW search_path")).scalar_one(),
            context,
            OperationStep(step_id="a", operation="definition"),
            time.monotonic() + 5,
        )
    assert json.loads(output[0]) == {"failed": True}
    assert session.scalar(select(func.count()).select_from(WorkbenchPlayerGame)) == 90


def test_postgres_deadline_kills_worker(postgres_conversation):
    session, context = postgres_conversation
    start = time.monotonic()
    with pytest.raises(TimeoutError):
        execute_bounded(
            session,
            context,
            OperationStep(step_id="a", operation="definition", arguments={"metric": "pts"}),
            start + 0.02,
        )
    assert time.monotonic() - start < 1
