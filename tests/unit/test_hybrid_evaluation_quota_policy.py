"""Evaluation uses provider quotas without a required separately approved call budget."""

import importlib.util
from pathlib import Path

import pytest

from courtlens.services.assistant.planner import PlanningOutput, ProviderFailure

spec = importlib.util.spec_from_file_location(
    "hybrid_evaluation_runner",
    Path(__file__).resolve().parents[2] / "scripts/evaluate_pf07d_hybrid.py",
)
assert spec and spec.loader
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)
MeteredProvider = runner.MeteredProvider
validate_free_project_evidence = runner.validate_free_project_evidence


class Provider:
    observed_model_version = "fixture-model"

    def __init__(self, failure=None):
        self.calls = 0
        self.failure = failure

    def plan(self, payload, *, timeout_seconds):
        self.calls += 1
        if self.failure:
            raise self.failure
        return PlanningOutput({"steps": []}, usage={"input_tokens": 3})


def test_default_meter_has_no_twenty_four_call_allowance():
    provider = Provider()
    metered = MeteredProvider(provider)
    for _ in range(25):
        metered.plan("fixture", timeout_seconds=45)
    assert provider.calls == len(metered.calls) == 25
    assert metered.calls[-1]["model_version"] == "fixture-model"


def test_optional_smoke_test_stop_does_not_dispatch_an_extra_call():
    provider = Provider()
    metered = MeteredProvider(provider, limit=1)
    metered.plan("fixture", timeout_seconds=45)
    with pytest.raises(ProviderFailure, match="disabled"):
        metered.plan("fixture", timeout_seconds=45)
    assert provider.calls == len(metered.calls) == 1


@pytest.mark.parametrize("failure", [ProviderFailure("quota_exceeded"), TimeoutError()])
def test_failures_are_recorded_without_retry_or_fallback(failure):
    provider = Provider(failure)
    metered = MeteredProvider(provider)
    with pytest.raises(type(failure)):
        metered.plan("fixture", timeout_seconds=45)
    assert provider.calls == len(metered.calls) == 1
    assert metered.calls[0]["failure"] == (
        "quota_exceeded" if isinstance(failure, ProviderFailure) else "timeout"
    )


def test_free_tier_confirmation_does_not_require_authorized_calls():
    validate_free_project_evidence(
        {
            "verified_free": True,
            "checked_at": "2026-10-06",
            "verification_method": "Owner checked AI Studio project Billing Tier: Free",
        }
    )


@pytest.mark.parametrize(
    "evidence",
    [
        {"verified_free": False, "checked_at": "2026-10-06", "verification_method": "Paid"},
        {"verified_free": True, "verification_method": "Undated assertion"},
        {"verified_free": True, "checked_at": "2026-10-06"},
    ],
)
def test_free_evaluation_still_requires_account_tier_confirmation(evidence):
    with pytest.raises(ValueError, match="Free billing tier"):
        validate_free_project_evidence(evidence)
