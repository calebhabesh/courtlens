from __future__ import annotations

import hashlib
import json
import math
from pathlib import Path
from typing import Any
from unittest.mock import patch

import numpy as np
import pytest
from fastapi import HTTPException

from courtlens.config import Settings
from courtlens.domain.context import CapabilityStatus
from courtlens.evaluation.value_archetypes import (
    BOX_FIELDS,
    FEATURES,
    PlayerGame,
    TeamGame,
    evaluation,
    fit_archetypes,
    score_predictors,
    season_features,
    select_value_artifact,
)
from courtlens.services.value_archetypes import (
    VERSION,
    load_value_store,
    unknown_row,
    value_archetype_rows,
    value_archetypes_capability,
    value_archetypes_summary,
)


def box(**values: float) -> dict[str, float]:
    return {f: values.get(f, 0.0) for f in BOX_FIELDS}


TEAM = box(
    field_goals_made=40,
    field_goals_attempted=90,
    three_pointers_attempted=35,
    free_throws_attempted=20,
    turnovers=12,
    rebounds_offensive=10,
    rebounds_defensive=34,
)


def team_game(game: str, team: str, opponent: str) -> TeamGame:
    return TeamGame("2025-26", game, team, opponent, TEAM)


def lineup(game: str, team: str, seconds: list[float], star: dict[str, float]) -> list[PlayerGame]:
    rows = [PlayerGame("2025-26", game, team, "star", seconds[0], star)]
    rows += [
        PlayerGame("2025-26", game, team, f"{team}-{i}", s, box())
        for i, s in enumerate(seconds[1:])
    ]
    return rows


def test_features_use_each_games_team_context_and_skip_unknown_minutes() -> None:
    star = box(
        field_goals_made=10,
        field_goals_attempted=20,
        three_pointers_attempted=5,
        free_throws_attempted=10,
        turnovers=4,
        assists=8,
        rebounds_offensive=2,
        rebounds_defensive=6,
        steals=2,
        blocks=1,
    )
    full = [1440.0] + [1440.0] * 9  # 10 players x 24 min = 240 team minutes
    games = [
        *lineup("g1", "A", full, star),
        *lineup("g2", "B", full, star),  # traded: second team's context
        *lineup("g3", "A", [1440.0, math.nan, *full[2:]], star),  # unknown minutes
    ]
    teams = [team_game(g, t, o) for g in ("g1", "g2", "g3") for t, o in (("A", "B"), ("B", "A"))]
    rows, omitted = season_features(games, teams, {("2025-26", "star"): (10, 40)})
    assert omitted == {"team_games_missing_box": 0, "team_games_unknown_minutes": 1}
    r = rows["2025-26:star"]
    assert r["games"] == 2 and r["seconds"] == 2880 and not r["qualified"]
    share = 1440 / (14400 / 5)  # 0.5 of a fifth of team minutes
    f = r["features"]
    assert f["usg_pct"] == pytest.approx(100 * 2 * (20 + 4.4 + 4) / (2 * share * (90 + 8.8 + 12)))
    assert f["ast_pct"] == pytest.approx(100 * 16 / (2 * (share * 40 - 10)))
    assert f["oreb_pct"] == pytest.approx(100 * 4 / (2 * share * (10 + 34)))
    assert f["blk_pct"] == pytest.approx(100 * 2 / (2 * share * (90 - 35)))
    assert f["rim_rate"] == 0.25 and f["three_rate"] == 0.25 and f["ft_rate"] == 0.5
    assert r["complete"]


def test_zero_denominators_stay_null_not_zero() -> None:
    games = lineup("g1", "A", [1440.0] * 10, box(rebounds_defensive=3))
    teams = [team_game("g1", "A", "B"), team_game("g1", "B", "A")]
    rows, _ = season_features(games, teams, {})
    f = rows["2025-26:star"]["features"]
    assert f["three_rate"] is None and f["rim_rate"] is None and f["ft_rate"] is None
    assert f["dreb_pct"] > 0
    assert not rows["2025-26:star"]["complete"]


def blobs(n: int = 40, seed: int = 0) -> dict[str, dict[str, Any]]:
    rng = np.random.default_rng(seed)
    rows = {}
    for c in range(6):
        center = np.zeros(len(FEATURES))
        center[c] = 8.0
        for i in range(n * (c + 1) // 2 + n):
            values = center + rng.normal(0, 0.5, len(FEATURES))
            rows[f"2025-26:{c}-{i}"] = {
                "season": "2025-26",
                "player_id": f"{c}-{i}",
                "seconds": 40000.0,
                "games": 50,
                "qualified": True,
                "complete": True,
                "features": dict(zip(FEATURES, values.tolist(), strict=True)),
            }
    return rows


def test_archetypes_are_deterministic_ordered_and_soft() -> None:
    rows = blobs()
    rows["2025-26:bench"] = {**rows["2025-26:0-0"], "player_id": "bench", "qualified": False}
    rows["2025-26:gap"] = {**rows["2025-26:0-0"], "player_id": "gap", "complete": False}
    first, second = fit_archetypes(rows), fit_archetypes(rows)
    assert json.dumps(first, sort_keys=True) == json.dumps(second, sort_keys=True)
    assert first["components"] in (6, 7, 8)
    assert first["weights"] == sorted(first["weights"], reverse=True)
    bench = first["members"]["2025-26:bench"]
    assert not bench["training"] and sum(bench["membership"]) == pytest.approx(1, abs=1e-5)
    assert "2025-26:gap" not in first["members"]
    assert "2025-26:bench" not in first["training_samples"]


def rated(phase: str, seasons: list[str], bpr: bool, players: dict[str, Any]) -> dict[str, Any]:
    block = {"players": players}
    priors = {p: (r["total"] / 2, -r["total"] / 2) for p, r in players.items()}
    return {
        "input": {"phase": phase, "seasons": seasons, "cutoff": f"{seasons[-1][:4]}-07-01"},
        "rapm": block,
        "bpr": block if bpr else None,
        "bpr_prior": {"status": "available", "player_priors": priors, "target_artifacts": []}
        if bpr
        else {"status": "unavailable"},
    }


def player(total: float, qualified: bool = True) -> dict[str, Any]:
    return {"total": total, "seconds": 1000.0, "qualified": qualified}


def test_value_rule_is_latest_season_longest_window_with_bpr() -> None:
    p = {"a": player(1.0)}
    artifacts = [
        rated("regular_season", ["2024-25"], True, p),
        rated("regular_season", ["2024-25", "2025-26"], True, p),
        rated("regular_season", ["2023-24", "2024-25", "2025-26"], False, p),
        rated("playoffs", ["2025-26"], True, p),
    ]
    assert select_value_artifact(artifacts)["input"]["seasons"] == ["2024-25", "2025-26"]


def test_missing_predictors_are_excluded_not_zero() -> None:
    target = {"a": player(2.0), "b": player(-2.0), "c": player(1.0), "d": player(0, False)}
    result = score_predictors(target, {"x": {"a": 2.0, "b": -2.0}})
    assert result["shared_players"] == 2 and result["excluded_missing_predictor"] == 1
    assert result["scores"]["x"]["weighted_rmse"] == 0
    assert result["scores"]["zero"]["weighted_rmse"] == 2


def test_evaluation_folds_use_only_earlier_windows() -> None:
    p = {k: player(v) for k, v in {"a": 1.0, "b": -1.0, "c": 0.5, "d": -0.5}.items()}
    artifacts = [
        rated("regular_season", ["2023-24"], False, p),
        rated("regular_season", ["2024-25"], True, p),
        rated("regular_season", ["2023-24", "2024-25"], False, p),
        rated("regular_season", ["2024-25", "2025-26"], True, p),
        rated("regular_season", ["2025-26"], True, p),
    ]
    folds = {f["target_season"]: f for f in evaluation(artifacts)["folds"]}
    assert folds["2025-26"]["predictors"] == [
        "box prior (earlier seasons)",
        "bpr 1Y ending 2024-25",
        "rapm 1Y ending 2024-25",
        "rapm 2Y ending 2024-25",
    ]
    assert folds["2024-25"]["predictors"] == [
        "box prior (earlier seasons)",
        "rapm 1Y ending 2023-24",
    ]


def store(tmp_path: Path) -> Path:
    manifest = {
        "version": VERSION,
        "value": {
            "label": "Box-prior RAPM (BPR)",
            "rule": "rule",
            "claim": "claim",
            "unit": "unit",
            "scope": {"seasons": ["2024-25", "2025-26"]},
            "sha256": "v",
            "source_artifact": "s",
            "players": {"a": {"value": 3.0}},
        },
        "evaluation": {"sha256": "e", "folds": []},
        "archetypes": {
            "sha256": "x",
            "claim": "derived archetype",
            "components": 2,
            "features": ["usg_pct"],
            "seasons": ["2025-26"],
            "training_samples": 10,
            "weights": [0.6, 0.4],
            "means": [[20.0], [10.0]],
            "names": {
                "status": "proposed",
                "clusters": [
                    {"name": "Lead creator", "short": "creator", "description": "d"},
                    {"name": "Rim runner", "short": "rim runner", "description": "d"},
                ],
            },
            "players": {
                "b": {
                    "season": "2025-26",
                    "minutes": 120.0,
                    "games": 9,
                    "qualified": False,
                    "features": {"usg_pct": 15.0},
                    "membership": [0.72, 0.28],
                    "primary": 0,
                }
            },
        },
    }
    raw = json.dumps(manifest).encode()
    path = tmp_path / f"{hashlib.sha256(raw).hexdigest()}.json"
    path.write_bytes(raw)
    return path


def test_serving_reports_unknown_reasons_and_soft_membership(tmp_path: Path) -> None:
    path = store(tmp_path)
    with patch(
        "courtlens.services.value_archetypes.get_settings",
        return_value=Settings(value_archetypes_manifest=path),
    ):
        loaded = load_value_store()
        assert loaded is not None
        rows = value_archetype_rows(loaded)
        summary = value_archetypes_summary(loaded)
    assert rows["a"]["archetype"] is None and "unknown" in rows["a"]["archetype_reason"]
    assert rows["b"]["value"] is None and "unknown" in rows["b"]["value_reason"]
    b = rows["b"]["archetype"]
    assert b["small_sample"] and b["primary_name"] == "Lead creator"
    assert [m["name"] for m in b["membership"]] == ["creator", "rim runner"]
    assert summary["archetypes"]["clusters"][1]["color_token"] == "--color-category-2"
    assert summary["archetypes"]["names_status"] == "proposed"


def test_serving_rejects_tamper_and_reports_absence(tmp_path: Path) -> None:
    path = store(tmp_path)
    path.write_bytes(path.read_bytes().replace(b"3.0", b"9.0"))
    with (
        patch(
            "courtlens.services.value_archetypes.get_settings",
            return_value=Settings(value_archetypes_manifest=path),
        ),
        pytest.raises(HTTPException, match="503"),
    ):
        load_value_store()
    with patch(
        "courtlens.services.value_archetypes.get_settings",
        return_value=Settings(value_archetypes_manifest=tmp_path / "missing.json"),
    ):
        assert load_value_store() is None
        assert value_archetypes_summary(None)["status"] == "unavailable"


def test_requested_rookie_is_unknown_and_capability_tracks_store(tmp_path: Path) -> None:
    row = unknown_row("rookie")
    assert row["value"] is None and row["archetype"] is None
    assert "unknown" in row["value_reason"] and "unknown" in row["archetype_reason"]
    assert value_archetypes_capability(None).status == CapabilityStatus.SOURCE_BLOCKED
    with patch(
        "courtlens.services.value_archetypes.get_settings",
        return_value=Settings(value_archetypes_manifest=store(tmp_path)),
    ):
        entry = value_archetypes_capability(load_value_store())
    assert entry.status == CapabilityStatus.AVAILABLE and entry.seasons == ["2025-26"]
