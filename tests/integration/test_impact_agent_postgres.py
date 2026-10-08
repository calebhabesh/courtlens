"""IM07 typed tools, evidence, frozen replay and per-cell warehouse conflict audits."""

from datetime import date
from pathlib import Path
from uuid import UUID

import pytest
from impact_serving_fixture import make_store
from test_agent_tools_postgres import postgres_conversation as postgres_conversation
from test_agent_tools_postgres import tool_data as tool_data

from courtlens.config import Settings
from courtlens.domain.assistant_agent import AgentSource
from courtlens.domain.hybrid_assistant import HybridTurnRequest
from courtlens.evaluation.impact_rating_inputs import write_artifact
from courtlens.services.assistant import operations
from courtlens.services.assistant.agent.evaluation import score_answer
from courtlens.services.assistant.agent.loop import run_turn
from courtlens.services.assistant.agent.provenance import audit_warehouse_coverage
from courtlens.services.assistant.agent.providers.base import AgentStep, ToolCall
from courtlens.services.assistant.agent.providers.replay import RecordedStep, ReplayProvider
from courtlens.services.assistant.agent.tools import dispatch

pytestmark = pytest.mark.postgres
TODAY = date(2026, 10, 8)
PID = "1641705"


@pytest.fixture
def impact_agent(tool_data, tmp_path: Path, monkeypatch):
    path, body = make_store(tmp_path)
    entry = body["entries"][0]
    entry["scope"].update(
        season="2025-26", seasons=["2025-26"], cutoff="2026-07-01", last_included_date="2026-03-31"
    )
    entry["players"] = {PID: entry["players"]["a"]}
    row = entry["players"][PID]
    row["on_off"] = {"1610612759": row["on_off"]["1610612761"]}
    for key, value in (("drapm", 1.5), ("o_ts", 0.75), ("d_ts", 1.25), ("bpr", 1.8)):
        row["metrics"][key] = value
        row["support"][key] = dict(row["support"]["rapm"])
    path, _ = write_artifact(path.parent, body)
    monkeypatch.setattr(
        "courtlens.services.impact_serving.get_settings",
        lambda: Settings(_env_file=None, impact_serving_manifest=path),
    )
    monkeypatch.setenv("COURTLENS_IMPACT_SERVING_MANIFEST", str(path))
    session, selections = tool_data
    return session, selections.model_copy(update={"season": "2025-26", "before_date": TODAY}), path


def query(metric, **scope):
    return ToolCall(
        id="impact",
        name="query_stats",
        arguments={
            "operation": "query",
            "season": "last_season",
            **scope,
            "arguments": {
                "name": "Victor Wembanyama",
                "window": {"kind": "season"},
                "metric_selectors": [{"key": metric, "version": "courtlens-impact-serving-v1"}],
                "sort": [{"field": metric, "direction": "desc"}],
                "page": {"limit": 1},
            },
        },
    )


@pytest.mark.parametrize(
    "metric,value,unit",
    [
        ("rapm", 2, "points per 100 controls"),
        ("drapm", 1.5, "points per 100 controls"),
        ("o_ts", 0.75, "percentage points"),
        ("d_ts", 1.25, "percentage points"),
        ("onoff_net_rating", 10, "points per 100 controls"),
        ("bpr", 1.8, "points per 100 controls"),
    ],
)
def test_impact_tools_bind_units_samples_provenance_and_pin(impact_agent, metric, value, unit):
    session, selections, path = impact_agent
    result = dispatch(session, query(metric), selections=selections, as_of=TODAY)
    assert not result.result.is_error, result.full_payload
    data = result.warehouse_result
    assert data.rows[0]["metrics"][metric] == value
    assert data.rows[0]["sample_sizes"][metric] == 30
    assert result.full_payload["units"][metric] == unit
    cell = next(c for c in data.evidence if c.path == f"/items/0/metrics/{metric}")
    assert cell.entity_id == PID and cell.metric_version == "courtlens-impact-serving-v1"
    assert cell.sample["impact_support"][metric]["qualified"]
    assert cell.input_identity["impact"]["artifacts"][0]["sha256"] == "rating-one"
    assert data.arguments["impact_manifest_sha256"] == path.stem
    assert path.stem in data.open_url
    # Server-owned pin survives canonical saved replay without exposing it in tool schemas.
    assert (
        operations.canonical_step(
            session,
            result.context,
            operations.OperationStep(
                step_id="saved",
                operation="query",
                arguments=data.arguments,
            ),
        ).arguments
        == data.arguments
    )


def test_catalog_reports_artifact_scope_and_absent_store_without_faking_cells(
    impact_agent, monkeypatch
):
    session, selections, _ = impact_agent
    call = ToolCall(id="catalog", name="list_metrics", arguments={"key": "rapm"})
    result = dispatch(session, call, selections=selections, as_of=TODAY)
    entry = result.full_payload["metrics"][0]
    assert result.full_payload["catalog_version"] == "courtlens-stats-v3"
    assert entry["queryable"] and entry["availability"] == "available"
    assert entry["observed_scopes"][0]["season"] == "2025-26"
    monkeypatch.setattr(
        "courtlens.services.impact_serving.get_settings",
        lambda: Settings(_env_file=None, impact_serving_manifest=None),
    )
    monkeypatch.delenv("COURTLENS_IMPACT_SERVING_MANIFEST")
    result = dispatch(session, call, selections=selections, as_of=TODAY)
    entry = result.full_payload["metrics"][0]
    assert entry["availability"] == "source_blocked" and not entry["observed_scopes"]
    result = dispatch(session, query("rapm"), selections=selections, as_of=TODAY)
    assert result.warehouse_result.rows[0]["metrics"]["rapm"] is None
    assert result.full_payload["data"]["impact"]["status"] == "unavailable"


def test_prior_cutoff_never_reads_final_coefficient(impact_agent):
    session, selections, _ = impact_agent
    result = dispatch(
        session, query("rapm", before_date="2026-03-10"), selections=selections, as_of=TODAY
    )
    assert result.warehouse_result.rows[0]["metrics"]["rapm"] is None
    assert not result.full_payload["data"]["impact"]["artifacts"]


def test_impact_season_window_overrides_inherited_short_window_in_reported_scope(impact_agent):
    session, selections, _ = impact_agent
    result = dispatch(
        session,
        query("rapm"),
        selections=selections.model_copy(update={"window": "last_5"}),
        as_of=TODAY,
    )
    assert not result.result.is_error
    assert result.warehouse_result.rows[0]["metrics"]["rapm"] == 2
    assert result.context.window == "season" and result.full_payload["scope"]["window"] == "season"


def test_independent_original_coefficient_sql_oracle_and_future_gate(impact_agent):
    from courtlens.services.assistant.agent.impact_oracle import oracle_answer
    from courtlens.services.workbench_analytics import resolve_workbench_context

    session, selections, _ = impact_agent
    context = resolve_workbench_context(
        session,
        release_id=selections.release_id,
        requested_season="2025-26",
        requested_before_date=TODAY,
    )
    body = {
        "input": {
            "seasons": ["2025-26"],
            "phase": "regular_season",
            "games": {"g": {"day": "2026-03-31"}},
        },
        "rapm": {"players": {PID: {"games": 30, "qualified": True, "total": 2}}},
    }
    case = {
        "expected_status": "answered",
        "oracle": {
            "kind": "impact_single",
            "metric": "rapm",
            "player_id": PID,
            "limit": 1,
        },
    }
    artifacts = ({"sha256": "original-fixture", "body": body},)
    expected = oracle_answer(session, context, case, artifacts=artifacts)
    assert expected["rows"] == [{"player_id": PID, "value": 2, "n": 30}]
    body["input"]["games"]["g"]["day"] = "2027-01-01"
    with pytest.raises(ValueError, match="fully observable sealed fit"):
        oracle_answer(session, context, case, artifacts=artifacts)


class AuthoredImpactProvider:
    model = "synthetic-im07-not-language-accuracy"

    def __init__(self):
        self.called = False

    def step(self, prompt, messages, tools, **kwargs):
        if not self.called:
            self.called = True
            return AgentStep(tool_calls=[query("rapm")])
        return AgentStep(text="Victor Wembanyama had a CourtLens RAPM of +2.0 in 2025-26.[^s1]")


def test_impact_answer_replays_exactly_and_scorer_rejects_wrong_cell(impact_agent):
    session, selections, _ = impact_agent
    request = HybridTurnRequest(
        request_id=UUID(int=701),
        thread_id=UUID(int=702),
        message="What was Victor Wembanyama's RAPM last season?",
        context=selections,
    )
    kwargs = {
        "settings": Settings(_env_file=None, assistant_provider="none"),
        "today": TODAY,
        "turn_id": UUID(int=703),
    }
    run = run_turn(session, request, provider=AuthoredImpactProvider(), **kwargs)
    answer = run.response
    assert (
        not answer.provenance.unsupported_numbers
        and answer.provenance.warehouse_override_missed == 0
    )
    assert answer.sources[0].origin == "warehouse" and "CourtLens" in answer.sources[0].title
    provider = ReplayProvider(
        "synthetic-im07-not-language-accuracy",
        [RecordedStep.model_validate(s) for s in run.transcript["steps"]],
        expected_tools=run.transcript["tools"],
    )
    replay = run_turn(session, request, provider=provider, **kwargs)
    assert provider.exhausted and replay.transcript == run.transcript
    expected = {
        "kind": "single",
        "status": "answered",
        "metric": "rapm",
        "rows": [{"player_id": PID, "value": 2, "n": 30}],
        "artifact_sha256": "rating-one",
    }
    case = {
        "id": "im07",
        "category": "single_player",
        "expected_status": "answered",
        "require_warehouse": True,
    }
    assert score_answer(case, expected, answer, run.transcript)["exact_answer"]
    expected["rows"][0]["value"] = 3
    assert "sql_cells_or_order" in score_answer(case, expected, answer, run.transcript)["failures"]


def test_web_only_impact_claim_audits_actual_cell_and_respects_phase_cutoff(impact_agent):
    import time

    session, selections, _ = impact_agent
    source = AgentSource(
        source_id="s1",
        origin="web",
        title="Synthetic web claim",
        publisher="example.org",
        url="https://example.org/fixture",
        excerpt="+99.0",
    )

    def audit(text, scope=selections):
        return audit_warehouse_coverage(
            session, text, [source], scope, today=TODAY, deadline=time.monotonic() + 30
        )

    overrides, tools = audit("Victor Wembanyama had a RAPM of +99.0 in 2025-26.[^s1]")
    assert overrides == 1 and tools[0].warehouse_result.rows[0]["metrics"]["rapm"] == 2
    assert audit("Victor Wembanyama's RAPM was +99.0 in 2025-26.[^s1]")[0] == 1
    assert audit("Victor Wembanyama had a RAPM of +99.0 in the 2025-26 playoffs.[^s1]")[0] == 0
    assert (
        audit(
            "Victor Wembanyama had a RAPM of +99.0 in 2025-26.[^s1]",
            selections.model_copy(update={"before_date": date(2026, 3, 10)}),
        )[0]
        == 0
    )
    assert (
        audit("Victor Wembanyama had a DRAPM of +99.0 in 2025-26.[^s1]")[1][
            0
        ].warehouse_result.rows[0]["metrics"]["drapm"]
        == 1.5
    )


def test_unqualified_coefficient_support_never_establishes_warehouse_authority(
    impact_agent, monkeypatch
):
    import json
    import time

    from courtlens.services.assistant.agent.provenance import check_provenance

    session, selections, path = impact_agent
    body = json.loads(path.read_bytes())
    row = body["entries"][0]["players"][PID]
    row["metrics"]["rapm"] = None
    row["support"]["rapm"]["qualified"] = False
    replacement, _ = write_artifact(path.parent, body)
    monkeypatch.setenv("COURTLENS_IMPACT_SERVING_MANIFEST", str(replacement))
    monkeypatch.setattr(
        "courtlens.services.impact_serving.get_settings",
        lambda: Settings(
            _env_file=None,
            impact_serving_manifest=replacement,
        ),
    )
    tool = dispatch(session, query("rapm"), selections=selections, as_of=TODAY)
    assert tool.warehouse_result.rows[0]["metrics"]["rapm"] is None
    assert tool.warehouse_result.rows[0]["impact_support"]["rapm"]["games"] == 30
    source = AgentSource(
        source_id="s1",
        origin="web",
        title="Fixture",
        publisher="example.org",
        url="https://example.org/fixture",
        excerpt="+99.0",
    )
    prose = "Victor Wembanyama had a RAPM of +99.0 in 2025-26.[^s1]"
    report = check_provenance(
        prose,
        [tool.warehouse_result],
        [source],
        contexts={tool.warehouse_result.operation_hash: tool.context.to_dict()},
    )
    assert report.warehouse_override_missed == 0
    overrides, _ = audit_warehouse_coverage(
        session, prose, [source], selections, today=TODAY, deadline=time.monotonic() + 30
    )
    assert overrides == 0
