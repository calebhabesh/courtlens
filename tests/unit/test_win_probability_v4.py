"""W1: courtlens-win-probability-v4 rules that hold without the data files."""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pytest

from courtlens.domain.research_registry import load_registration
from courtlens.evaluation import win_probability_v4 as v4


def test_registration_loads_and_v4_shares_v2s_bootstrap_bins_and_seed() -> None:
    registration = load_registration(v4.REGISTRATION)
    assert registration.parameters["weight_bounds"] == [0.0, 1.0]
    assert v4.WEIGHT_SEASONS["selection"] == ["2022-23"]
    assert v4.WEIGHT_SEASONS["check"] == ["2022-23", "2023-24"]
    v4.check_shared_rules()


def test_weight_is_the_registered_least_squares_value() -> None:
    own = np.array([0.0, 2.0, -3.0, 5.0])
    line = np.array([2.0, 4.0, -5.0, 6.0])
    margin = np.array([1.0, 5.0, -4.0, 2.0])
    expected = float(np.sum((line - own) * (margin - own)) / np.sum((line - own) ** 2))
    fitted = v4.fit_weight(own, line, margin)
    assert 0 < expected < 1
    assert fitted["w"] == pytest.approx(expected)
    assert fitted["unclipped"] == pytest.approx(expected)
    assert fitted["games"] == 4


def test_weight_recovers_a_known_mix_without_noise() -> None:
    rng = np.random.default_rng(1)
    own = rng.normal(0, 6, 500)
    line = own + rng.normal(0, 3, 500)
    margin = own + 0.8 * (line - own)
    assert v4.fit_weight(own, line, margin)["w"] == pytest.approx(0.8)


def test_weight_is_clipped_to_the_registered_bounds() -> None:
    own = np.array([0.0, 1.0, 2.0])
    line = np.array([1.0, 2.0, 3.0])
    above = v4.fit_weight(own, line, own + 2.0 * (line - own))
    assert above["w"] == 1.0 and above["unclipped"] == pytest.approx(2.0)
    below = v4.fit_weight(own, line, own - 0.5 * (line - own))
    assert below["w"] == 0.0 and below["unclipped"] == pytest.approx(-0.5)


def test_weight_needs_games_whose_line_differs_from_the_own_forecast() -> None:
    with pytest.raises(ValueError):
        v4.fit_weight(np.array([1.0, 2.0]), np.array([1.0, 2.0]), np.array([3.0, 0.0]))
    with pytest.raises(ValueError):
        v4.fit_weight(np.array([]), np.array([]), np.array([]))


def test_mu4_moves_toward_the_line_and_keeps_the_own_forecast_without_one() -> None:
    assert v4.with_market(2.0, 6.0, 0.75) == pytest.approx(5.0)
    assert v4.with_market(2.0, None, 0.75) == 2.0
    assert v4.with_market(-3.0, 4.0, 0.0) == -3.0
    assert v4.with_market(-3.0, 4.0, 1.0) == 4.0


def test_pregame_table_adds_mu4_and_keeps_v2s_columns() -> None:
    v2 = {"games": {"a": {"mu_full": 1.0, "mu_form": 0.5}, "b": {"mu_full": -2.0, "mu_form": 0.0}}}
    table = v4.pregame_with(v2, {"a": 5.0}, 0.5)["games"]
    assert table["a"]["mu4"] == pytest.approx(3.0)
    assert table["b"]["mu4"] == -2.0  # no line: the own forecast
    assert table["a"]["mu_full"] == 1.0 and table["a"]["mu_form"] == 0.5
    assert v2["games"]["a"] == {"mu_full": 1.0, "mu_form": 0.5}


def test_winner_accuracy_follows_r15a_where_zero_picks_the_away_team() -> None:
    scores = v4.pregame_scores(np.array([3.0, -2.0, 1.0]), np.array([1.0, 0.0, 0.0]))
    assert scores["winner_accuracy"] == pytest.approx(2 / 3)
    assert scores["rmse"] == pytest.approx(np.sqrt((4 + 4 + 1) / 3))


def test_scoreboard_events_map_espn_teams_to_nba_ids() -> None:
    payload = {
        "events": [
            {
                "id": "401266805",
                "season": {"type": 2},
                "competitions": [
                    {
                        "competitors": [
                            {"homeAway": "home", "team": {"id": "17"}, "score": "125"},
                            {"homeAway": "away", "team": {"id": "9"}, "score": "99"},
                        ]
                    }
                ],
            }
        ]
    }
    [event] = v4.scoreboard_events(payload)
    assert event == {
        "event_id": 401266805,
        "season_type": 2,
        "home": "1610612751",
        "away": "1610612744",
        "home_score": 125,
        "away_score": 99,
    }


def write_log(output: Path, evidence: Path, body: dict[str, str]) -> None:
    output.mkdir(parents=True, exist_ok=True)
    evidence.mkdir(parents=True, exist_ok=True)
    text = json.dumps(body)
    (output / v4.SELECTION_LOG).write_text(text)
    (evidence / v4.SELECTION_LOG).write_text(text)


def test_stage_c_refuses_to_run_without_the_selection_log(tmp_path: Path) -> None:
    output, evidence = tmp_path / "out", tmp_path / "evidence"
    output.mkdir()
    with pytest.raises(ValueError, match="needs the selection log"):
        v4.require_selection(output, evidence, lambda _: True)
    with pytest.raises(ValueError, match="selection log"):
        v4.stage_check(output, evidence)


def test_stage_c_refuses_an_uncommitted_or_changed_selection_log(tmp_path: Path) -> None:
    output, evidence = tmp_path / "out", tmp_path / "evidence"
    write_log(output, evidence, {"selected": "K1"})
    with pytest.raises(ValueError, match="commit"):
        v4.require_selection(output, evidence, lambda _: False)
    (evidence / v4.SELECTION_LOG).write_text(json.dumps({"selected": "K2"}))
    with pytest.raises(ValueError, match="differs"):
        v4.require_selection(output, evidence, lambda _: True)


def test_stage_c_accepts_a_committed_log_and_refuses_to_run_twice(tmp_path: Path) -> None:
    output, evidence = tmp_path / "out", tmp_path / "evidence"
    write_log(output, evidence, {"selected": "K1"})
    assert v4.require_selection(output, evidence, lambda _: True) == {"selected": "K1"}
    (output / v4.CHECK_REPORT).write_text("{}")
    with pytest.raises(ValueError, match="already been read"):
        v4.require_selection(output, evidence, lambda _: True)
    with pytest.raises(ValueError, match="already been read"):
        v4.stage_check(output, evidence)


def test_stage_s_refuses_to_run_twice_and_without_the_prefit_checks(tmp_path: Path) -> None:
    with pytest.raises(ValueError, match="pre-fit checks"):
        v4.stage_select(tmp_path, tmp_path / "evidence")
    (tmp_path / "prefit-checks.json").write_text(json.dumps({"passed": False}))
    with pytest.raises(ValueError, match="did not pass"):
        v4.stage_select(tmp_path, tmp_path / "evidence")
    (tmp_path / v4.SELECTION_LOG).write_text("{}")
    with pytest.raises(ValueError, match="already written"):
        v4.stage_select(tmp_path, tmp_path / "evidence")
