"""R10 API: Wingspan and four-factor payloads, unknown states and checks against the committed
frozen results (no database; the current D-DPM board is stubbed)."""

from __future__ import annotations

import math
from typing import Any

import numpy as np
import pytest
from fastapi.testclient import TestClient

from courtlens.api.app import create_app
from courtlens.services import four_factors, wingspan


@pytest.fixture(autouse=True)
def fresh(monkeypatch: pytest.MonkeyPatch) -> None:
    wingspan._cache.clear()
    four_factors._cache.clear()
    board = {
        "season": "2026-27",
        "data_date": "2026-11-02",
        "as_of": "2026-11-05",
        "players": {"203497": {"d_dpm": 2.5}},
    }
    monkeypatch.setattr(wingspan, "current_board", lambda: board)


def get(path: str) -> Any:
    response = TestClient(create_app()).get(path)
    assert response.status_code == 200, response.text
    return response.json()


def test_wingspan_summary_matches_frozen_counts_and_keeps_unknowns() -> None:
    body = get("/api/wingspan")
    assert body["population"]["measured"] == 1751
    assert body["population"]["analysis"] == 822
    # RD01 round 2: the frozen 1,804 combine rows plus CraftedNBA players the combine never saw.
    combine = [p for p in body["players"] if p["combine_year"] is not None]
    assert len(combine) == 1804
    assert len(body["players"]) == 1804 + body["coverage"]["counts"]["adds_player"]
    assert body["current"] == {"state": "ready", "season": "2026-27", "data_date": "2026-11-02"}
    unmeasured = [p for p in body["players"] if p["measurement_source"] is None]
    assert unmeasured and all(p["height"] is None or p["wingspan"] is None for p in unmeasured)
    assert all(p["diff"] is None and p["d_dpm"] is None for p in unmeasured)
    wemby = next(p for p in body["players"] if p["player_id"] == "203497")
    assert wemby["active"] is True and wemby["d_dpm_now"] == 2.5
    off_board = next(p for p in body["players"] if p["player_id"] != "203497")
    assert off_board["active"] is False and off_board["d_dpm_now"] is None
    primary = body["correlations"][0]
    assert (primary["x"], primary["y"], primary["n"]) == ("diff", "d_dpm", 822)


def test_wingspan_correlations_recompute_from_served_rows() -> None:
    body = get("/api/wingspan")
    rows = [p for p in body["players"] if p["in_population"]]
    for c in body["correlations"]:
        group = (
            rows if c["population"] == "analysis" else [p for p in body["players"] if p["measured"]]
        )
        x = np.array([p[c["x"]] for p in group], dtype=float)
        y = np.array([p[c["y"]] for p in group], dtype=float)
        assert np.corrcoef(x, y)[0, 1] == pytest.approx(c["r"], abs=2e-6)
        assert c["low"] <= c["r"] <= c["high"]
    for avg in body["positional_averages"]:
        group = [p for p in rows if avg["position"] in ("ALL", p["position"])]
        assert avg["d_dpm"]["n"] == len(group)


def test_current_board_unavailable_is_unknown(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(wingspan, "current_board", lambda: None)
    body = get("/api/wingspan")
    assert body["current"]["state"] == "unavailable"
    assert all(p["active"] is None and p["d_dpm_now"] is None for p in body["players"])


def test_nearest_builds() -> None:
    body = get("/api/wingspan/nearest/203497")
    assert body["state"] == "ready" and len(body["neighbours"]) == 5
    distances = [n["distance"] for n in body["neighbours"]]
    assert distances == sorted(distances)
    assert "203497" not in {n["player_id"] for n in body["neighbours"]}
    scale = body["scaling"]
    first = body["neighbours"][0]
    rows = {p["player_id"]: p for p in get("/api/wingspan")["players"]}
    me = rows["203497"]
    expected = math.dist(
        [(me[k] - scale[k]["mean"]) / scale[k]["sd"] for k in ("height", "wingspan")],
        [(first[k] - scale[k]["mean"]) / scale[k]["sd"] for k in ("height", "wingspan")],
    )
    assert first["distance"] == pytest.approx(expected, abs=1e-6)
    unmeasured = next(pid for pid, p in rows.items() if not p["measured"])
    assert get(f"/api/wingspan/nearest/{unmeasured}")["state"] == "not_measured"
    assert TestClient(create_app()).get("/api/wingspan/nearest/999999999").status_code == 404


def test_four_factors_summary_and_season() -> None:
    body = get("/api/four-factors")
    assert body["seasons"][0]["season"] == "2014-15"
    assert len(body["seasons"]) == 12
    for s in body["seasons"]:
        assert s["league"]["ortg_factors"] == pytest.approx(s["league"]["ortg_box"], abs=1e-6)
        assert 0.40 < s["mu"] < 0.45
    season = get("/api/four-factors/seasons/2024-25")
    assert len(season["teams"]) == 30 and season["teams"][0]["team"] == "ATL"
    assert TestClient(create_app()).get("/api/four-factors/seasons/2013-14").status_code == 404
