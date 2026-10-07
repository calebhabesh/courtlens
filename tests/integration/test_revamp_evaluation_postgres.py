"""The oracle is real SQL, independent of assistant execution and future outcomes."""

from datetime import date, datetime, timedelta
from unittest.mock import patch

from sqlalchemy import select
from test_conversation_postgres import postgres_conversation as _postgres_fixture

from courtlens.services.assistant.revamp_evaluation import expected_answer, sql_rows
from courtlens.workbench_models import ForecastIssuance, ModelPolicyActivation, WorkbenchPlayerGame

postgres_conversation = _postgres_fixture


def test_oracle_denominators_nulls_absence_and_strict_cutoff(postgres_conversation):
    session, context = postgres_conversation
    original = session.scalar(select(WorkbenchPlayerGame).limit(1))
    for game_id, when, appearance, value in [
        ("0022409981", context.before_date, "appeared", 999),
        ("0022409982", date(2025, 4, 14), "did_not_appear", 999),
        ("0022409983", date(2025, 4, 14), "appeared", None),
    ]:
        session.add(
            WorkbenchPlayerGame(
                dataset_id=context.dataset_id,
                game_id=game_id,
                player_id="1630567",
                team_id=original.team_id,
                opponent_id=original.opponent_id,
                game_date=when,
                season=context.season,
                phase=context.phase,
                appearance=appearance,
                minutes_original="30",
                minutes_seconds=None if value is None else 1800,
                points=value,
                stats_json={"assists": value},
                source_version_id=original.source_version_id,
                source_observation_id=original.source_observation_id,
            )
        )
    session.commit()
    with patch(
        "courtlens.services.assistant.operations.execute_operation",
        side_effect=AssertionError("Oracle must not execute an assistant operation"),
    ):
        row = next(r for r in sql_rows(session, context) if r["player_id"] == "1630567")
    assert row["gp"] == 31
    assert row["n_pts"] == row["n_ast"] == row["n_min"] == 30
    assert row["pts"] == 280 and row["pts_per_game"] == 9.3
    assert row["ast"] == 150 and row["ast_per_game"] == 5


def test_oracle_preserves_tie_order_and_forecast_unavailability(postgres_conversation):
    session, context = postgres_conversation
    case = {
        "id": "oracle",
        "expected_status": "answered",
        "oracle": {"kind": "ranking", "metric": "pts_per_game", "limit": 3},
    }
    expected = expected_answer(session, context, case)
    assert [r["player_id"] for r in expected["rows"]] == ["1", "1630567", "2"]
    assert all(r["value"] == 9.3 and r["n"] == 30 for r in expected["rows"])
    forecast = expected_answer(
        session,
        context,
        {
            "id": "forecast",
            "expected_status": "answered",
            "oracle": {"kind": "forecast", "player_id": "1630567"},
        },
    )
    assert forecast["data"] == {"status": "no_issuance", "player_id": "1630567"}
    assert forecast["status"] == "unable" and forecast["reason"] == "no_observations"


def test_forecast_oracle_selects_prior_issuance_without_later_knowledge(postgres_conversation):
    session, context = postgres_conversation
    cutoff = datetime.fromisoformat(context.cutoff_utc)
    policy = ModelPolicyActivation(
        policy_name="oracle",
        target_metric="pts",
        estimator_identity="last10",
        calibration_identity="empirical",
    )
    session.add(policy)
    session.flush()
    issuances = []
    for offset, estimate, target in [
        (-24, 10, context.before_date),
        (-12, 12, context.before_date),
        (0, 999, context.before_date),
        (12, 999, context.before_date),
        (-6, 999, context.before_date + timedelta(days=7)),
    ]:
        issuance = ForecastIssuance(
            policy_id=policy.id,
            player_id="1630567",
            target_game_id=f"00224099{len(issuances):02}",
            target_game_date=target,
            target_opponent_id="1610612738",
            issued_at_utc=cutoff + timedelta(hours=offset),
            dataset_id=context.dataset_id,
            features_hash="e" * 64,
            features_json={},
            schedule_evidence_json={},
            team_evidence_json={},
            point_estimate=estimate,
            interval_lower=0,
            interval_upper=30,
        )
        session.add(issuance)
        issuances.append(issuance)
    session.commit()
    expected = expected_answer(
        session,
        context,
        {
            "id": "forecast",
            "expected_status": "answered",
            "oracle": {"kind": "forecast", "player_id": "1630567"},
        },
    )
    assert expected["data"]["id"] == issuances[1].id
    assert expected["data"]["point_estimate"] == 12
    assert expected["data"]["interval_upper"] == 30
    assert expected["data"]["policy_id"] == policy.id
    assert "scores" not in expected["data"]
