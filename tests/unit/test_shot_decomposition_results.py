"""R06 served results: the frozen files, their arithmetic, the services and the routers."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from courtlens.api.routers import defensive_shot_quality as dsq_router
from courtlens.api.routers import shot_quality as sq_router
from courtlens.database import get_db
from courtlens.domain.research_registry import registration_receipt
from courtlens.evaluation import defensive_shot_quality_runner as dsq_runner
from courtlens.evaluation import shot_decomposition_runner as runner
from courtlens.services import defensive_shot_quality as dsq
from courtlens.services import shot_decomposition as sd

A = json.loads(sd.RESULTS_PATH.read_text())
B = json.loads(dsq.RESULTS_PATH.read_text())
TARGETS = ("ts", "sq", "make", "ft")


def stamp(result: dict[str, Any]) -> str:
    body = {k: v for k, v in result.items() if k != "results_sha256"}
    return hashlib.sha256(runner.canonical(body)).hexdigest()


def test_results_hashes_and_registration_receipts() -> None:
    assert stamp(A) == A["results_sha256"]
    assert stamp(B) == B["results_sha256"]
    assert A["registration"] == registration_receipt(runner.REGISTRATION)
    assert B["registration"] == registration_receipt(dsq_runner.REGISTRATION)
    assert B["part_a_results_sha256"] == A["results_sha256"]
    assert runner.parameters()["table_sha256"].keys() == A["seasons"].keys()
    assert dsq_runner.parameters()["part_a_results_sha256"] == A["results_sha256"]


def test_evidence_extracts_equal_the_frozen_results() -> None:
    root = Path("docs/evidence/research/r06")
    assert json.loads((root / "decomposition-results.json").read_text()) == json.loads(
        json.dumps(runner.evidence_extract(A))
    )
    assert json.loads((root / "defensive-results.json").read_text()) == json.loads(
        json.dumps(dsq_runner.evidence_extract(B))
    )


@pytest.mark.parametrize("season", sorted(A["seasons"]))
def test_every_served_player_adds_up_and_sits_inside_or_near_its_interval(season: str) -> None:
    block = A["seasons"][season]
    assert block["coefficient_additivity_residual"] == {"combined": 0, "defense": 0, "offense": 0}
    assert block["players_qualified"] == sum(p["status"] == "served" for p in block["players"])
    for player in block["players"]:
        if player["status"] != "served":
            assert "offense" not in player
            assert (
                player["games"] < 20 or min(player["offense_shots"], player["defense_shots"]) < 1000
            )
            continue
        assert player["games"] >= 20
        assert min(player["offense_shots"], player["defense_shots"]) >= 1000
        for side in ("offense", "defense", "combined"):
            values = player[side]
            assert values["ts"] == pytest.approx(
                values["sq"] + values["make"] + values["ft"], abs=5e-8
            )
            for target in TARGETS:
                low, high = player[f"{side}_interval"][target]
                assert low < high
        for target in TARGETS:
            assert player["combined"][target] == pytest.approx(
                player["offense"][target] + player["defense"][target], abs=5e-9
            )
    for stage in block["second_stage"].values():
        assert stage["coefficients"] == pytest.approx([1, 1, 1], abs=1e-8)
        assert stage["r2"] == pytest.approx(1, abs=1e-8)


def test_persistence_statistic_and_verdict_follow_the_registered_rule() -> None:
    p = A["persistence"]
    c = p["correlations"]
    assert c["offense:sq_minus_make"]["r"] == pytest.approx(
        c["offense:sq"]["r"] - c["offense:make"]["r"], abs=2e-9
    )
    low, high = c["offense:sq_minus_make"]["interval"]
    assert p["verdict"] == (
        "oMake persists less than oSQ"
        if low > 0
        else "oMake persists more than oSQ"
        if high < 0
        else "no clear difference"
    )
    assert p["pairs"] == sum(p["pairs_by_season"].values())


@pytest.mark.parametrize("season", sorted(B["seasons"]))
def test_every_served_defender_follows_the_formula(season: str) -> None:
    block = B["seasons"][season]
    excluding = 0
    for player in block["players"]:
        if player["status"] != "served":
            assert player["fga"] < 300 and "kinds" not in player
            continue
        assert player["fga"] >= 300
        for kind, value in player["kinds"].items():
            if value["status"] != "served":
                assert value["fga"] < 100 and value["dsq"] is None and value["interval"] is None
                continue
            term = block["league"][kind]["term"]
            assert value["dsq"] == pytest.approx(
                100 * (value["xpps"] - value["pps"] - term), abs=1e-6
            )
            assert value["interval"][0] < value["interval"][1]
        low, high = player["kinds"]["all"]["interval"]
        excluding += low > 0 or high < 0
        assert len(player["key_matchups"]) <= 5
        assert [m["fga"] for m in player["key_matchups"]] == sorted(
            (m["fga"] for m in player["key_matchups"]), reverse=True
        )
    assert excluding == block["interval_excludes_zero"]


def test_signal_totals_are_the_sum_of_the_seasons() -> None:
    blocks = B["seasons"].values()
    assert B["signal"]["defender_seasons"] == sum(b["defenders_served"] for b in blocks)
    assert B["signal"]["interval_excludes_zero"] == sum(b["interval_excludes_zero"] for b in blocks)
    assert B["persistence"]["pairs"] == sum(B["persistence"]["pairs_by_season"].values())


def test_decomposition_board_filters_ranks_and_keeps_unknowns_valueless() -> None:
    board = sd.board("2025-26")
    assert board is not None and board["status"] == "available"
    values = [r["values"]["ts"] for r in board["rows"]]
    assert values == sorted(values, reverse=True)
    assert all("values" not in u and u["reason"] == sd.REASON for u in board["unknown"])
    defense = sd.board("2025-26", "defense", "make", "BOS", 2000)
    assert defense is not None
    assert defense["labels"]["make"] == "dContest"
    assert defense["rows"] and all(
        r["tricode"] == "BOS" and r["shots"] >= 2000 for r in defense["rows"]
    )
    ranked = [r["values"]["make"] for r in defense["rows"]]
    assert ranked == sorted(ranked, reverse=True)
    assert sd.board("2025-26", min_shots=0)["min_shots"] == 1000  # type: ignore[index]
    assert sd.board("2019-20")["status"] == "unknown"  # type: ignore[index]


@pytest.mark.parametrize("kind", ["all", "2pt", "3pt"])
def test_card_ranks_and_values_match_the_frozen_file(kind: str) -> None:
    board = dsq.cards("2025-26", kind)
    assert board is not None and board["status"] == "available"
    frozen = {p["player_id"]: p for p in B["seasons"]["2025-26"]["players"]}
    assert board["ranked"] == B["seasons"]["2025-26"]["defenders_served"]
    served = [r for r in board["rows"] if r["value"]["status"] == "served"]
    for metric, reverse in (("fga", True), ("dsq", True), ("xpps", False), ("pps", False)):
        order = sorted(served, key=lambda r: r["rank"][metric])
        series = [r["value"][metric] for r in order]
        assert series == sorted(series, reverse=reverse)
    for row in board["rows"]:
        assert row["value"] == frozen[row["player_id"]]["kinds"][kind]
    known = [r for r in board["rows"] if r["value"]["dsq"] is not None]
    assert [r["value"]["dsq"] for r in known] == sorted(
        (r["value"]["dsq"] for r in known), reverse=True
    )


def test_card_rapm_headline_is_part_a_dsq_and_unknown_before_it() -> None:
    board = dsq.cards("2025-26")
    assert board is not None
    served = {
        p["player_id"]: p for p in A["seasons"]["2025-26"]["players"] if p["status"] == "served"
    }
    for row in board["rows"]:
        fit = served.get(row["player_id"])
        if fit:
            assert row["rapm"]["value"] == fit["defense"]["sq"]
            assert row["rapm"]["interval"] == fit["defense_interval"]["sq"]
            assert row["rapm"]["reason"] is None
        else:
            assert (
                row["rapm"]["value"] is None and row["rapm"]["reason"] == dsq.RAPM_UNKNOWN["small"]
            )
    early = dsq.cards("2019-20")
    assert early is not None
    assert all(r["rapm"]["reason"] == dsq.RAPM_UNKNOWN["before"] for r in early["rows"])
    assert dsq.cards("2016-17")["status"] == "unknown"  # type: ignore[index]
    by_rapm = dsq.cards("2025-26", sort="rapm", team="BOS")
    assert by_rapm is not None and by_rapm["rows"]
    known = [r["rapm"]["value"] for r in by_rapm["rows"] if r["rapm"]["value"] is not None]
    assert known == sorted(known, reverse=True)
    assert all(r["tricode"] == "BOS" for r in by_rapm["rows"])


class _Session:
    def execute(self, _statement: Any) -> Any:
        class Rows:
            def all(self) -> list[tuple[str, str]]:
                return [("203999", "Nikola Jokić")]

        return Rows()


def test_routers_are_get_only_and_name_players() -> None:
    app = FastAPI()
    app.include_router(sq_router.router, prefix="/api")
    app.include_router(dsq_router.router, prefix="/api")
    app.dependency_overrides[get_db] = lambda: _Session()
    client = TestClient(app)
    assert (
        client.get("/api/shot-quality/decomposition").json()["results_sha256"]
        == A["results_sha256"]
    )
    rows = client.get("/api/shot-quality/decomposition/players").json()["rows"]
    assert rows[0]["player_id"] == "203999" and rows[0]["player_name"] == "Nikola Jokić"
    assert any(r["player_name"].startswith("NBA player ") for r in rows)
    assert client.get("/api/shot-quality/decomposition/players?side=nope").status_code == 422
    defensive = client.get("/api/defensive-shot-quality").json()
    assert defensive["results_sha256"] == B["results_sha256"]
    cards = client.get("/api/defensive-shot-quality/cards?kind=3pt").json()
    assert cards["kind"] == "3pt" and cards["rows"][0]["key_matchups"][0]["player_name"]
    assert client.post("/api/defensive-shot-quality/cards").status_code == 405
