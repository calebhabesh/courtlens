"""R17 Shot Aftermath: the frozen results file and the read-only API that serves it."""

from __future__ import annotations

import hashlib
import json
import shutil
from pathlib import Path
from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from courtlens.api.routers import shot_aftermath as router
from courtlens.domain import shot_aftermath as sa
from courtlens.domain.research_registry import registration_receipt
from courtlens.evaluation import shot_aftermath_runner as runner
from courtlens.services import shot_aftermath as service

FROZEN = service.RESULTS_PATH
POSITIONS = Path(
    "data/derived/position-estimates-v1/"
    "1f8c19f2f4f27e2322d80e59fbe1fa519d299bb970d6cdc60aa2d8febe572a00.json"
)


@pytest.fixture(scope="module")
def results() -> dict[str, Any]:
    return dict(json.loads(FROZEN.read_text()))


@pytest.fixture(scope="module")
def client() -> TestClient:
    app = FastAPI()
    app.include_router(router.router, prefix="/api")
    return TestClient(app)


def test_frozen_hashes(results: dict[str, Any]) -> None:
    body = {k: v for k, v in results.items() if k != "results_sha256"}
    assert hashlib.sha256(runner.canonical(body)).hexdigest() == results["results_sha256"]
    receipt = registration_receipt(runner.REGISTRATION)
    assert results["registration"]["content_sha256"] == receipt["content_sha256"]
    assert results["results_sha256"] == (
        "5aa5161b68b2be431bcdb00cc50dd9ad89d3da6f1b5790023a2ae11a534a97bf"
    )


def test_every_cell_is_complete_and_consistent(results: dict[str, Any]) -> None:
    for season, body in results["seasons"].items():
        teams = len(body["teams"])
        assert teams == 30
        assert len(body["cells"]) == (teams + 1) * len(sa.POSITIONS) * len(sa.ZONES)
        assert body["checks"] == {"count_residual": 0.0, "identity_residual": 0.0}
        for cell in body["cells"]:
            c, v = cell["counts"], cell["values"]
            assert cell["status"] == sa.status(
                c["attempts"], c["make_possessions"], c["dreb_possessions"]
            )
            assert c["attempts"] - c["makes"] == c["oreb"] + c["dreb"] + c["miss_unknown"]
            assert c["makes"] == (
                c["make_possessions"]
                + c["make_censored"]
                + c["make_same_team"]
                + c["make_followed"]
            )
            assert c["dreb"] == c["dreb_possessions"] + c["dreb_censored"] + c["dreb_same_team"]
            if cell["status"] == "unknown":
                assert all(v[name] is None for name in sa.VALUES), (season, cell)
                continue
            for name in sa.VALUES:
                if v[name] is not None:
                    assert v[name]["low"] <= v[name]["high"]
            if v["own"] and v["net"] and v["cost"]:
                assert v["net"]["value"] == pytest.approx(
                    v["own"]["value"] - v["cost"]["value"], abs=2e-9
                )
            for name in sa.COSTS:
                entry = v[name]
                tone = cell["tones"][name]
                if tone is not None:
                    assert cell["status"] == "ok"
                    assert (entry["high"] < 0) if tone == "benefit" else (entry["low"] > 0)
            if cell["status"] != "ok":
                assert all(t is None for t in cell["tones"].values())
            assert all(cell["tones"][name] is None for name in cell["tones"] if name == "net")


def test_league_cell_matches_season_counts(results: dict[str, Any]) -> None:
    for body in results["seasons"].values():
        league = next(
            c
            for c in body["cells"]
            if c["team"] == "all" and c["position"] == "all" and c["zone"] == "all"
        )
        assert league["counts"]["attempts"] == body["data_check"]["counts"]["first_chance_attempts"]
        assert league["counts"]["attempts"] == body["first_chance_by_zone"]["all"]
        zones = sum(
            body["first_chance_by_zone"][z] for z in ("rim", "short_mid", "long_mid", "three")
        )
        assert zones == body["first_chance_by_zone"]["all"]  # no unresolved mid-range shot
        ppp = body["league"]["points"] / body["league"]["possessions"]
        assert body["league"]["ppp"]["value"] == pytest.approx(ppp, abs=1e-9)


def test_position_accuracy_constants_match_the_artifact() -> None:
    if not POSITIONS.exists():
        pytest.skip("position-estimates artifact not present")
    confusion = json.loads(POSITIONS.read_text())["evaluation"]["model"]["confusion"]["counts"]
    group = (0, 0, 1, 1, 2)
    correct = sum(
        n for i, row in enumerate(confusion) for j, n in enumerate(row) if group[i] == group[j]
    )
    assert correct == service.POSITION_GROUP_CORRECT
    assert sum(map(sum, confusion)) == service.POSITION_GROUP_SAMPLES
    assert confusion[4][4] == service.CENTRES_ESTIMATED_C
    assert confusion[4][3] == service.CENTRES_ESTIMATED_PF
    assert sum(confusion[4]) == service.CENTRES


def test_summary_endpoint(client: TestClient) -> None:
    data = client.get("/api/shot-aftermath").json()
    assert data["registration"]["identity"] == "courtlens-shot-aftermath-v1"
    assert [s["season"] for s in data["seasons"]] == ["2024-25", "2025-26"]
    assert data["seasons"][0]["databallr_comparison"]["all"]["databallr"] == 190685
    assert data["seasons"][1]["databallr_comparison"] is None
    assert data["position_accuracy"]["group_correct"] == 888


def test_scope_endpoint(client: TestClient, results: dict[str, Any]) -> None:
    data = client.get(
        "/api/shot-aftermath/scope", params={"season": "2024-25", "team": "BOS", "position": "bigs"}
    ).json()
    assert data["team_code"] == "BOS" and [r["zone"] for r in data["rows"]] == list(sa.ZONES)
    stored = next(
        c
        for c in results["seasons"]["2024-25"]["cells"]
        if c["team"] == data["team"] and c["position"] == "bigs" and c["zone"] == "rim"
    )
    assert data["rows"][0]["values"] == stored["values"]
    default = client.get("/api/shot-aftermath/scope").json()
    assert default["season"] == "2025-26" and default["team"] == "all"
    by_id = client.get("/api/shot-aftermath/scope", params={"team": data["team"]}).json()
    assert by_id["team_code"] == "BOS"


def test_teams_endpoint(client: TestClient) -> None:
    data = client.get(
        "/api/shot-aftermath/teams", params={"season": "2025-26", "zone": "three"}
    ).json()
    assert len(data["rows"]) == 30
    codes = [r["team_code"] for r in data["rows"]]
    assert codes == sorted(codes)
    assert data["all_teams"]["team"] == "all"


def test_errors(client: TestClient) -> None:
    assert client.get("/api/shot-aftermath/scope", params={"season": "2019-20"}).status_code == 404
    assert client.get("/api/shot-aftermath/scope", params={"team": "XYZ"}).status_code == 404
    assert client.get("/api/shot-aftermath/scope", params={"position": "wings"}).status_code == 422
    assert client.get("/api/shot-aftermath/teams", params={"zone": "paint"}).status_code == 422
    assert client.get("/api/shot-aftermath/scope", params={"season": "2025"}).status_code == 422


def test_a_changed_file_serves_nothing(tmp_path: Path) -> None:
    copy = tmp_path / "results.json"
    shutil.copy(FROZEN, copy)
    assert service.load_results(copy) is not None
    data = json.loads(copy.read_text())
    data["seasons"]["2024-25"]["league"]["points"] += 1
    copy.write_text(json.dumps(data))
    assert service.load_results(copy) is None
