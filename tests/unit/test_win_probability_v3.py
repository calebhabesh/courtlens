"""F05: courtlens-win-probability-v3 rules that hold without the data files."""

from __future__ import annotations

from types import SimpleNamespace
from typing import Any, cast

import numpy as np

from courtlens.api.routers.win_probability import upgrade_result
from courtlens.domain.research_registry import load_registration
from courtlens.evaluation.win_probability_v3 import (
    REGISTRATION,
    specialist_mask,
    specialist_weight,
    team_pi,
)


def season(period: list[int], left: list[float]) -> Any:
    return SimpleNamespace(period=np.array(period), left=np.array(left, dtype=float))


def test_published_result_matches_its_registration_and_gates() -> None:
    body = upgrade_result()
    assert body is not None
    registration = load_registration(REGISTRATION)
    assert body["version"] == REGISTRATION
    assert body["registration_sha256"] == registration.content_hash()
    assert body["test_seasons"] == registration.parameters["splits"]["test"]
    gates = body["gates"]
    assert gates["A1"]["passed"] == (gates["A1"]["improvement_vs_v2_frozen"]["low"] > 0)
    assert gates["A2"]["passed"] == (gates["A2"]["ece"] <= 0.02)
    assert body["adopted"] == (gates["A1"]["passed"] and gates["A2"]["passed"])
    # The page states the gain against the frozen model; it must be the gate's number.
    assert body["comparisons"]["v3_vs_v2_frozen"] == {
        k: gates["A1"]["improvement_vs_v2_frozen"][k] for k in ("mean", "low", "high", "games")
    }


def test_v2_specialist_covers_the_last_two_minutes_of_regulation_and_each_overtime() -> None:
    s = season([3, 4, 4, 5, 5], [100, 300, 60, 290, 30])
    assert specialist_mask(s, overtime=False).tolist() == [False, False, True, False, True]
    weight = specialist_weight(s, overtime=False)
    assert weight[2] == 0.5 and weight[4] == 0.75


def test_p3_specialist_takes_every_overtime_state_at_full_weight() -> None:
    s = season([4, 5, 5, 6], [60, 290, 30, 299])
    assert specialist_mask(s, overtime=True).tolist() == [True, True, True, True]
    assert specialist_weight(s, overtime=True).tolist() == [0.5, 1.0, 1.0, 1.0]


def test_team_pi_weights_projections_by_minutes_and_gives_unknown_players_the_rookie_mean() -> None:
    projections = {"group_means": {"rookie": -1.5, "returner": -0.5}, "projections": {"1": 4.0}}
    roster = cast(list[list[Any]], [["1", 36.0, None], ["2", 12.0, None]])
    assert team_pi(roster, projections) == 36 / 48 * 4.0 + 12 / 48 * -1.5
