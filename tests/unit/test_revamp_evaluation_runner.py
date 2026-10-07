"""Provider quota stops, finite call accounting, and sealed holdout CLI behavior."""

import importlib.util
import json
import subprocess
import sys
from datetime import date
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, patch
from uuid import uuid4

import pytest

from courtlens.domain.hybrid_assistant import HybridTurnResponse, InabilityBlock
from courtlens.services.assistant.planner import PlanningOutput, ProviderFailure

SCRIPT = Path(__file__).resolve().parents[2] / "scripts/evaluate_assistant.py"
SPEC = importlib.util.spec_from_file_location("ar02_runner", SCRIPT)
assert SPEC and SPEC.loader
runner = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(runner)


class Provider:
    observed_model_version = "test"

    def __init__(self, failure=None):
        self.calls = 0
        self.failure = failure

    def plan(self, payload, *, timeout_seconds):
        self.calls += 1
        if self.failure:
            raise self.failure
        return PlanningOutput({"steps": []}, {"total_token_count": 3})


PAYLOAD = json.dumps({"message": "stats", "operations": []})


def test_default_recording_has_no_arbitrary_daily_call_allowance():
    provider = Provider()
    recording = runner.RecordingProvider(provider, interval=0, max_calls=None)
    for _ in range(25):
        recording.plan(PAYLOAD, timeout_seconds=45)
    assert len(recording.calls) == provider.calls == 25
    assert recording.calls[-1]["data"] == {"steps": []}
    assert recording.calls[-1]["usage"]["total_token_count"] == 3
    assert "operations" not in recording.calls[-1]["input"]


@pytest.mark.parametrize("failure", [ProviderFailure("quota_exceeded", 60), TimeoutError()])
def test_recording_stops_on_provider_failure_without_retries(failure):
    provider = Provider(failure)
    recording = runner.RecordingProvider(provider, interval=0, max_calls=None)
    with pytest.raises(type(failure)):
        recording.plan(PAYLOAD, timeout_seconds=45)
    with pytest.raises(ProviderFailure, match="disabled"):
        recording.plan(PAYLOAD, timeout_seconds=45)
    assert provider.calls == len(recording.calls) == 1
    assert recording.stopped == (
        "quota_exceeded" if isinstance(failure, ProviderFailure) else "timeout"
    )


def test_optional_limit_and_pacing_do_not_dispatch_extra_calls():
    provider = Provider()
    recording = runner.RecordingProvider(provider, interval=0, max_calls=1)
    recording.plan(PAYLOAD, timeout_seconds=45)
    with pytest.raises(ProviderFailure):
        recording.plan(PAYLOAD, timeout_seconds=45)
    assert provider.calls == 1
    assert recording.stopped == "optional_call_limit"
    paced = runner.RecordingProvider(provider, interval=10, max_calls=None)
    paced.last_started = 100
    with patch.object(runner.time, "monotonic", return_value=100), pytest.raises(TimeoutError):
        paced.plan(PAYLOAD, timeout_seconds=5)
    assert provider.calls == 1


def test_hard_caller_timeout_stops_even_before_transport_exits():
    provider = Provider()
    recording = runner.RecordingProvider(provider, interval=0, max_calls=None)
    recording.observe_terminal(
        HybridTurnResponse(
            request_id=uuid4(),
            thread_id=uuid4(),
            turn_id=uuid4(),
            status="unable",
            intent="inability",
            blocks=[
                InabilityBlock(
                    reason="provider_timeout", text="Planner timed out.", next_action="Retry later."
                )
            ],
        )
    )
    with pytest.raises(ProviderFailure, match="disabled"):
        recording.plan(PAYLOAD, timeout_seconds=45)
    assert recording.stopped == "provider_timeout" and provider.calls == 0


def test_followup_setup_timeout_prevents_further_transport_calls(tmp_path):
    provider = Provider()
    answer = HybridTurnResponse(
        request_id=uuid4(),
        thread_id=uuid4(),
        turn_id=uuid4(),
        status="unable",
        intent="inability",
        blocks=[
            InabilityBlock(
                reason="provider_timeout", text="Planner timed out.", next_action="Retry later."
            )
        ],
    )
    case = {
        "id": "setup-timeout",
        "category": "clarify_refuse",
        "split": "dev",
        "message": "Now show the top three.",
        "expected_plan": None,
        "setup": {"message": "Show the leaders.", "expected_plan": None},
        "oracle": {"kind": "terminal", "reason": "provider_timeout"},
    }
    corpus = {
        "version": "test",
        "runs": 1,
        "as_of": "2026-10-06",
        "context_season": "2025-26",
        "before_date": "2026-10-06",
        "cases": [case],
    }
    context = SimpleNamespace(
        release_id=str(uuid4()),
        season="2025-26",
        phase="regular_season",
        before_date=date(2026, 10, 6),
        to_dict=lambda: {},
    )
    settings = SimpleNamespace(
        gemini_api_key=SimpleNamespace(get_secret_value=lambda: "test"), gemini_model="test"
    )

    def turn(_session, request, *, provider, **kwargs):
        if request.message == case["message"]:
            with pytest.raises(ProviderFailure, match="disabled"):
                provider.plan(PAYLOAD, timeout_seconds=45)
        return answer

    output = tmp_path / "capture.json"
    with (
        patch.object(sys, "argv", [str(SCRIPT), "--output", str(output)]),
        patch.object(runner, "load_corpus", return_value=(corpus, "test")),
        patch.object(runner, "get_settings", return_value=settings),
        patch.object(runner, "GeminiPlanProvider", return_value=provider),
        patch.object(runner, "SessionLocal", return_value=MagicMock()),
        patch.object(runner, "resolve_workbench_context", return_value=context),
        patch.object(runner, "sql_rows", return_value=[]),
        patch.object(runner, "canonical_plan", return_value=None),
        patch.object(
            runner, "expected_answer", return_value={"kind": "terminal", "status": "unable"}
        ),
        patch.object(runner, "run_hybrid_turn", side_effect=turn),
        pytest.raises(SystemExit) as stopped,
    ):
        runner.main()
    assert stopped.value.code == 2 and provider.calls == 0
    assert json.loads(output.read_text())["stopped"] == "provider_timeout"


def test_holdout_flag_required_before_any_work():
    result = subprocess.run(
        [sys.executable, str(SCRIPT), "--mode", "fixture", "--split", "holdout"],
        capture_output=True,
        text=True,
    )
    assert result.returncode == 2
    assert "Holdout is sealed until AR08" in result.stderr


def test_holdout_rescoring_also_requires_opt_in(tmp_path):
    capture = tmp_path / "capture.json"
    capture.write_text(json.dumps({"split": "holdout"}))
    rescore = SCRIPT.with_name("rescore_assistant.py")
    result = subprocess.run(
        [sys.executable, str(rescore), str(capture), str(tmp_path / "score.json")],
        capture_output=True,
        text=True,
    )
    assert result.returncode == 2
    assert "Holdout is sealed until AR08" in result.stderr


def test_existing_evidence_is_not_overwritten(tmp_path):
    output = tmp_path / "retained.json"
    output.write_text("retained evidence")
    result = subprocess.run(
        [sys.executable, str(SCRIPT), "--mode", "fixture", "--output", str(output)],
        capture_output=True,
        text=True,
    )
    assert result.returncode == 2 and "Refusing to overwrite" in result.stderr
    assert output.read_text() == "retained evidence"
