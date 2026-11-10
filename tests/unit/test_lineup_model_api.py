"""R14 API: payloads, unknown states and checks against the committed frozen results.

Tool tests need the git-ignored model weights and skip without them (CI, the hosted demo); the
rest read only committed files.
"""

from __future__ import annotations

import json
import shutil
from pathlib import Path

import numpy as np
import pytest
from fastapi.testclient import TestClient

from courtlens.api.app import create_app
from courtlens.evaluation import lineup_model_core as core
from courtlens.services import lineup_model

FROZEN = Path("evaluation/research/frozen")
pytestmark = pytest.mark.skipif(
    not (FROZEN / "courtlens-lineup-model-v1-serving.json").exists(),
    reason="R14 results not frozen yet",
)


@pytest.fixture(autouse=True)
def fresh_cache() -> None:
    lineup_model._cache.clear()


def client() -> TestClient:
    return TestClient(create_app())


def page() -> dict:
    response = client().get("/api/lineup-model")
    assert response.status_code == 200
    return response.json()


def tool_ready() -> bool:
    return lineup_model.tool_available()


def test_page_payload() -> None:
    body = page()
    assert set(body) == {
        "results", "registration", "selection", "coverage", "map", "serving", "backtest",
        "credits", "caveats",
    }  # fmt: skip
    assert body["registration"]["identity"] == "courtlens-lineup-model-v1"
    assert body["results"]["test_seasons"] == ["2023-24", "2024-25", "2025-26"]
    assert {c["what"] for c in body["credits"]} >= {"Adjusted plus-minus", "UMAP"}


def test_verdict_follows_the_registered_rule_from_the_served_gains() -> None:
    r = page()["results"]
    gains = r["gains"]["lineup_over_ridge"]
    seasons = [gains["seasons"][s]["gain"] for s in r["test_seasons"]]
    assert r["verdict"] == core.verdict(gains["pooled"], seasons)
    assert r["seasons_lineup_lower"] == sum(g > 0 for g in seasons)
    for s in r["test_seasons"]:
        ridge, lineup = r["models"]["ridge"]["seasons"][s], r["models"]["lineup"]["seasons"][s]
        assert gains["seasons"][s]["gain"] == pytest.approx(ridge["wrmse"] - lineup["wrmse"])
        assert (
            gains["seasons"][s]["low"] <= gains["seasons"][s]["gain"] <= gains["seasons"][s]["high"]
        )


def test_selection_choices_are_the_grid_minima() -> None:
    sel = page()["selection"]
    alphas = sel["ridge_alpha_grid"]
    assert (
        float(min(alphas, key=lambda a: (alphas[a]["pooled"], -float(a)))) == sel["selected_alpha"]
    )
    grid = sel["lineup_grid"]
    best = min(grid, key=lambda k: (grid[k]["pooled"], grid[k]["dim"], -grid[k]["penalty"]))
    assert best == sel["selected_config"]["key"]
    assert sel["seasons"] == ["2021-22", "2022-23"]


def test_cold_start_counts_add_up() -> None:
    cov = page()["coverage"]
    for season, entry in cov["cold_start"].items():
        target = entry.get("target")
        if target is None:
            continue
        assert (
            target["own_embedding"] + target["box_fallback"] + target["newcomer_no_box_in_window"]
            == target["players"]
        ), season
        shares = (
            target["possession_share_own"]
            + target["possession_share_box_fallback"]
            + target["possession_share_newcomer"]
        )
        assert shares == pytest.approx(1, abs=2e-4)
    assert cov["totals"]["stints"] == sum(v["stints"] for v in cov["seasons"].values())


def test_map_points_are_the_serving_fits_own_players() -> None:
    body = page()
    facts = json.loads((FROZEN / "courtlens-lineup-model-v1-facts.json").read_text())
    own = {p for p, v in facts["players"].items() if v["status"] == "own"}
    points = body["map"]["points"]
    assert {p["player_id"] for p in points} == own
    assert all(p["status"] == "own" for p in points)
    assert len(own) == facts["cold_start"]["2026-27"]["own_embedding"]
    s = body["map"]["seed_stability"]
    assert s["players"] == len(points)
    assert s["mean_overlap"] == pytest.approx(np.mean(list(s["overlap_with_seed_1401"].values())))


def test_backtest_summary_keeps_the_lineup_pairs() -> None:
    bt = page()["backtest"]
    assert bt["version"] == "courtlens-lineup-backtest-v1"
    assert all(
        "lineup_model" in (p["candidate"], p["reference"])
        or "lineup_ridge" in (p["candidate"], p["reference"])
        for p in bt["pairs"]
    )
    others = set(bt["candidates"]) - {"lineup_model"}
    assert set(bt["verdict"]["lineup_model_against"]) == others


def test_changed_results_give_503(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    copy = tmp_path / "results.json"
    body = json.loads((FROZEN / "courtlens-lineup-model-v1.json").read_text())
    body["verdict"] = "lineup_better" if body["verdict"] != "lineup_better" else "ridge_better"
    copy.write_text(json.dumps(body))
    monkeypatch.setattr(lineup_model, "RESULTS_PATH", copy)
    assert client().get("/api/lineup-model").status_code == 503


def test_missing_weights_report_the_unknown_state(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(lineup_model, "OUTPUT", tmp_path / "absent")
    assert client().get("/api/lineup-model").json()["serving"]["tool_available"] is False
    assert client().get("/api/lineup-model/players").json() == {
        "state": "unavailable",
        "players": [],
    }
    fit = client().get("/api/lineup-model/fit", params={"players": "1,2,3,4,5"}).json()
    assert fit["state"] == "unavailable"


@pytest.mark.parametrize(
    ("players", "status"),
    [("1,2,3,4", 422), ("1,1,2,3,4", 422), ("1,2,3,4,5,6", 422)],
)
def test_bad_fives_are_refused(players: str, status: int) -> None:
    assert client().get("/api/lineup-model/fit", params={"players": players}).status_code == status


@pytest.mark.skipif(
    not lineup_model.tool_available() if FROZEN.exists() else True, reason="weights absent"
)
def test_tool_on_the_real_fit() -> None:
    players = client().get("/api/lineup-model/players").json()
    assert players["state"] == "ready"
    ids = {p["player_id"] for p in players["players"]}
    five = page()["serving"]["default_five"]
    assert set(five) <= ids
    fit = client().get("/api/lineup-model/fit", params={"players": ",".join(five)}).json()
    assert fit["state"] == "ready"
    lin, r = fit["lineup_model"], fit["ridge"]
    assert lin["net"] == pytest.approx(lin["additive"] + lin["interaction"])
    assert lin["net"] == pytest.approx(np.mean(lin["seeds"]))
    assert lin["low"] <= lin["high"] and r["low"] <= r["high"]
    assert fit["refits"] == 100
    assert fit["opponents"] <= fit["panel_size"]
    unknown = client().get(
        "/api/lineup-model/fit", params={"players": ",".join([*five[:4], "nobody"])}
    )
    assert unknown.status_code == 404


@pytest.mark.skipif(
    not lineup_model.tool_available() if FROZEN.exists() else True, reason="weights absent"
)
def test_tool_is_antisymmetric_against_a_panel_lineup() -> None:
    models = lineup_model._models()
    a, b = models["panel"][0], models["panel"][1]
    if set(a) & set(b):
        pytest.skip("first two panel lineups share a player")
    e1 = lineup_model._encode(models, [(a, b)])
    e2 = lineup_model._encode(models, [(b, a)])
    for w in models["lineup"]:
        assert core.predict_lineup(w, e1)[0] == pytest.approx(
            -core.predict_lineup(w, e2)[0], abs=1e-9
        )


def test_copy_without_weights_still_serves_results(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    # The hosted demo has the committed frozen files only.
    for name in ("courtlens-lineup-model-v1.json", "courtlens-lineup-model-v1-serving.json"):
        shutil.copy(FROZEN / name, tmp_path / name)
    monkeypatch.setattr(lineup_model, "OUTPUT", tmp_path / "no-weights")
    body = page()
    assert body["serving"]["tool_available"] is False
    assert len(body["map"]["points"]) > 0
