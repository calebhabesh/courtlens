"""R02: the page copies served values exactly and never invents an unknown."""

import hashlib
from pathlib import Path
from typing import Any

import pytest

from courtlens.services import six_factor_research as research
from courtlens.services.six_factor_research import (
    BELOW_QUALIFICATION,
    ESTIMATE,
    FACTORS,
    NO_INTERVAL,
    NODES,
    NOT_IN_FIT,
    build_node,
    composites,
    load_reconstruction,
    main_team,
    pick_archetypes,
    season_weights,
)

WEIGHTS = {"intercept": 0.5, **dict.fromkeys(FACTORS, 2.0)}


def player(**metrics: Any) -> dict[str, Any]:
    support = {
        key: {"total_percentile": 91.0, "offense_percentile": 70.0, "defense_percentile": 30.0}
        for key in NODES
    }
    return {"metrics": metrics, "support": support, "on_off": {}}


def row(player_id: str, **metrics: float) -> dict[str, Any]:
    values = dict.fromkeys(NODES, 0.0) | metrics
    return {
        "player_id": player_id,
        "metrics": {key: {"value": values[key]} for key in NODES},
        "composites": composites(values, WEIGHTS),
    }


def test_a_node_copies_the_served_value_and_interval_unrounded() -> None:
    interval = {"o_ts": {"p10": -0.123456789, "p90": 1.987654321, "replicates": 187, "sd": 0.5}}
    node = build_node(player(o_ts=0.555555555), interval, "o_ts")
    assert node == {
        "value": 0.555555555,
        "low": -0.123456789,
        "high": 1.987654321,
        "replicates": 187,
        "percentile": 70.0,
        "status": ESTIMATE,
    }


def test_a_value_without_an_interval_is_unknown_never_fabricated() -> None:
    node = build_node(player(rapm=1.5), None, "rapm")
    assert node["value"] == 1.5
    assert (node["low"], node["high"], node["status"]) == (None, None, NO_INTERVAL)


def test_a_half_served_interval_counts_as_unknown() -> None:
    node = build_node(player(rapm=1.5), {"rapm": {"p10": None, "p90": 2.0}}, "rapm")
    assert (node["low"], node["high"], node["status"]) == (None, None, NO_INTERVAL)


def test_a_hidden_estimate_keeps_its_interval_hidden() -> None:
    """The bundle holds an interval for an unqualified value; showing it would reveal the value."""
    node = build_node(player(o_reb=None), {"o_reb": {"p10": -1.0, "p90": 1.0}}, "o_reb")
    assert set(node.values()) == {None, BELOW_QUALIFICATION}


def test_a_player_outside_the_fit_is_unknown_not_zero() -> None:
    node = build_node(None, None, "rapm")
    assert node["status"] == NOT_IN_FIT
    assert node["value"] is None


def test_composites_add_up_to_the_reconstruction_and_need_every_factor() -> None:
    values = dict(zip(FACTORS, (1.0, 2.0, 3.0, 4.0, 5.0, 6.0), strict=True))
    result = composites(values, WEIGHTS)
    assert result["net_efficiency"] == 2.0 * (1.0 + 4.0)
    assert result["possession_control"] == 2.0 * (2.0 + 3.0 + 5.0 + 6.0)
    assert result["reconstructed_rapm"] == pytest.approx(
        0.5 + result["net_efficiency"] + result["possession_control"]
    )
    partial = composites({**values, "o_reb": None}, WEIGHTS)
    assert partial["net_efficiency"] == 10.0
    assert partial["possession_control"] is None
    assert partial["reconstructed_rapm"] is None
    assert set(composites(values, None).values()) == {None}


def test_a_traded_player_shows_the_team_with_most_seconds() -> None:
    records = {
        "1610612749": {"on": {"seconds": 100.0}},
        "1610612766": {"on": {"seconds": 900.0}},
    }
    assert main_team({"on_off": records}) == "CHA"
    assert main_team(None) is None


def test_archetypes_are_rule_based_and_never_repeat_a_player() -> None:
    rows = [
        row("a", o_ts=5.0, d_ts=5.0, o_tov=-3.0),
        row("b", o_tov=20.0, d_tov=4.0, o_ts=-3.0),
        row("c", o_ts=2.0, d_ts=2.0, o_tov=2.0, d_tov=2.0),
        row("d", d_ts=9.0, o_tov=-9.0),
        row("e", d_tov=9.0, o_ts=-9.0),
        row("f", o_reb=9.0, d_reb=9.0, o_ts=-9.0),
        row("g"),
        row("h", o_ts=1.0, d_ts=-1.0),
        # No card can go to a player missing a value.
        {**row("x", o_ts=99.0), "metrics": {**row("x")["metrics"], "d_reb": {"value": None}}},
    ]
    cards = pick_archetypes(rows, WEIGHTS)
    ids = [card["player_id"] for card in cards]
    assert len(ids) == len(set(ids))
    assert "x" not in ids
    assert dict(zip([card["key"] for card in cards], ids, strict=True))["glass_cleaner"] == "f"
    assert pick_archetypes(rows, None) == []


def test_the_frozen_reconstruction_is_r01s_evidence_byte_for_byte() -> None:
    frozen = Path("evaluation/research/frozen/courtlens-six-factor-reconstruction-v1.json")
    evidence = Path("docs/evidence/research/r01/six-factor-reconstruction.json")
    assert hashlib.sha256(frozen.read_bytes()).digest() == (
        hashlib.sha256(evidence.read_bytes()).digest()
    )
    body = load_reconstruction()
    assert body is not None
    assert body["registration"]["identity"] == "courtlens-six-factor-reconstruction-v1"
    assert body["factor_columns"] == list(FACTORS)
    weights = season_weights(body, "2025-26")
    assert weights is not None
    assert set(weights) == {"intercept", *FACTORS}
    assert season_weights(body, "2031-32") is None


def test_missing_reconstruction_leaves_r2_unknown(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(research, "RECONSTRUCTION_PATH", Path("does/not/exist.json"))
    assert load_reconstruction() is None
