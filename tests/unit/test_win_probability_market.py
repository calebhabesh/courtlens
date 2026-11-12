"""The Market-informed model's predict path and W3's offline freeze checks (v4, K1)."""

import json

import numpy as np
import pytest

from courtlens.evaluation import win_probability_platform_check as platform_check
from courtlens.evaluation import win_probability_v4 as v4
from courtlens.evaluation import win_probability_v4_checks as checks
from courtlens.services import win_probability_market as market
from courtlens.services.win_probability_serving import GameInputs

INPUTS = GameInputs(3.0, 1.0, 2.0, 0.0, 0.0, 1.0, 0.0, 0.4, 1.1, 0.0, 0.0, 0.0)


def test_mu4_moves_the_own_forecast_toward_the_line():
    assert market.market_mu(3.0, None, 0.9) == 3.0
    assert market.market_mu(3.0, 7.0, 0.0) == 3.0
    assert market.market_mu(3.0, 7.0, 1.0) == 7.0
    assert market.market_mu(3.0, -1.0, 0.5) == 1.0
    with pytest.raises(ValueError):
        market.market_mu(3.0, 7.0, 1.2)


def test_the_serving_rule_is_the_fitting_rule():
    rng = np.random.default_rng(2501)
    for own, line, w in rng.normal(0, 8, (200, 3)):
        w = abs(w) % 1.0
        assert market.market_mu(own, line, w) == v4.with_market(own, line, w)


def test_only_mu_changes_and_the_originals_model_reads_it():
    moved = market.market_inputs(INPUTS, 7.0, 0.5)
    assert moved.mu == 5.0
    assert {k: v for k, v in vars(moved).items() if k != "mu"} == {
        k: v for k, v in vars(INPUTS).items() if k != "mu"
    }

    class Echo:
        def predict_home(self, states, game):
            return np.array([game.mu])

    assert market.predict_home(Echo(), None, INPUTS, 7.0, 0.5)[0] == 5.0
    assert market.predict_home(Echo(), None, INPUTS, None, 0.5)[0] == 3.0


def test_v2s_platform_inputs_are_unchanged_without_an_override():
    assert platform_check._inputs(INPUTS, "g", None) is INPUTS
    assert platform_check._inputs(INPUTS, "g", lambda _: 9.0).mu == 9.0


def reference(probabilities):
    return {
        "version": checks.REGISTRATION,
        "w": 1.0,
        "manifest_sha256": "m",
        "written_on": {"machine": "x86_64"},
        "games": [],
        "probabilities": probabilities,
    }


def test_the_platform_check_uses_the_registered_limit(monkeypatch):
    monkeypatch.setattr(checks, "ARM64_LIMIT", 1e-9)
    import courtlens.services.win_probability_production as production

    monkeypatch.setattr(production, "load_manifest", lambda: {"manifest_sha256": "m"})
    monkeypatch.setattr(platform_check, "score", lambda _: np.array([0.25, 0.5]))
    assert checks.platform_check(reference([0.25, 0.5 + 5e-10]))["passed"] is True
    assert checks.platform_check(reference([0.25, 0.5 + 5e-9]))["passed"] is False
    with pytest.raises(ValueError):
        checks.platform_check({**reference([0.25, 0.5]), "version": "courtlens-win-probability-v2"})
    with pytest.raises(ValueError):
        checks.platform_check({**reference([0.25, 0.5]), "manifest_sha256": "other"})


def test_registered_freeze_limits():
    assert checks.LOG_LOSS_LIMIT == 0.002
    assert checks.P95_LIMIT_SECONDS == 0.1
    assert checks.ARM64_LIMIT == 1e-9


@pytest.mark.parametrize(
    ("report", "selection"),
    [({"continue": False, "selected": "K1"}, "K1"), ({"continue": True, "selected": "K2"}, "K2")],
)
def test_stage_f_runs_only_after_a_passed_stage_c_with_k1(tmp_path, report, selection):
    (tmp_path / v4.CHECK_REPORT).write_text(json.dumps(report))
    (tmp_path / v4.SELECTION_LOG).write_text(json.dumps({"selected": selection}))
    with pytest.raises(ValueError):
        v4.stage_final(tmp_path, tmp_path / "evidence")
