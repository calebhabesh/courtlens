"""RD03: team playtype difficulty and role moves on the zTS page (descriptive, owner-approved)."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

import pytest

from courtlens.domain import zts, zts_teams
from courtlens.evaluation import zts_runner as runner
from courtlens.evaluation import zts_teams as teams_runner
from courtlens.services import zts as service

ROOT = Path(__file__).resolve().parents[2]
FROZEN = ROOT / "evaluation/research/frozen/courtlens-zts-validation-v1.json"
TEAMS = ROOT / "evaluation/research/derived/courtlens-zts-teams-v1.json"


@pytest.fixture
def served(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(service, "RESULTS_PATH", FROZEN)
    monkeypatch.setattr(service, "TEAMS_PATH", TEAMS)
    service.load_results.cache_clear()
    service.load_teams.cache_clear()


def row(kind: str, poss: float, pts: float, tov: float = 0.0) -> zts.TypeRow:
    return zts.TypeRow(kind, poss, 0.5, pts, tov)


def reference(rows: list[zts.TypeRow]) -> dict:
    # A league reference over every play type: pad the absent ones so the reference is defined.
    pad = [row(k, 10.0, 10.0) for k in zts.PLAY_TYPES]
    return zts.league_references(rows + pad)


def test_team_season_sums_players_and_weights_the_league_to_zero() -> None:
    a = [row("cut", 20.0, 28.0), row("isolation", 30.0, 24.0, 0.1)]
    b = [row("cut", 10.0, 12.0), row("spotup", 40.0, 44.0)]
    c = [row("isolation", 25.0, 20.0)]
    pad = [row(k, 10.0, 10.0) for k in zts.PLAY_TYPES]
    rows = {"p1": {"T1": a}, "p2": {"T1": b, "T2": c}, "pad": {"T3": pad}}
    ref = reference(a + b + c)
    teams = zts_teams.team_season(rows, ref)
    t1 = teams["T1"]
    assert t1["types"]["cut"]["possessions"] == 30.0
    assert t1["types"]["cut"]["points"] == 40.0
    assert [p["player_id"] for p in t1["players"]] == ["p2", "p1"]
    assert sum(p["share"] for p in t1["players"]) == pytest.approx(1.0)
    shares = zts.shares(t1["types"])
    assert t1["expected_ts"] == pytest.approx(zts.expected_ts(shares, ref))
    assert t1["difficulty"] == pytest.approx(ref["ts"] - t1["expected_ts"])
    sp = sum(v["scoring_possessions"] for v in t1["types"].values())
    assert t1["synergy_ts"] == pytest.approx(t1["points"] / (2 * sp))
    assert zts_teams.league_difficulty(teams) == pytest.approx(0.0, abs=1e-12)


def test_spread_is_the_population_standard_deviation() -> None:
    assert zts_teams.spread([1.0, 3.0]) == pytest.approx(1.0)
    with pytest.raises(ValueError):
        zts_teams.spread([])


def test_build_refuses_rows_that_differ_from_the_frozen_run() -> None:
    frozen = json.loads(FROZEN.read_text())
    synergy = {"rows": {}, "sha256": dict.fromkeys(frozen["references"], "different")}
    with pytest.raises(SystemExit):
        teams_runner.build(frozen, synergy)


def test_team_file_matches_the_frozen_run_and_is_reproducible_from_its_payload() -> None:
    frozen = json.loads(FROZEN.read_text())
    teams = json.loads(TEAMS.read_text())
    assert teams["inputs"]["zts_results_sha256"] == frozen["results_sha256"]
    assert teams["inputs"]["play_types_sha256"] == frozen["inputs"]["play_types_sha256"]
    payload = {k: v for k, v in teams.items() if k != "teams_sha256"}

    assert hashlib.sha256(runner.canonical(payload)).hexdigest() == teams["teams_sha256"]
    for season, entry in teams["seasons"].items():
        assert len(entry["teams"]) == 30, season
        assert entry["league_difficulty"] == pytest.approx(0.0, abs=1e-8)
        ref = frozen["references"][season]
        for t in entry["teams"].values():
            assert t["expected_ts"] == pytest.approx(
                zts.expected_ts(zts.shares(t["types"]), ref), abs=1e-8
            )
            assert t["difficulty"] == pytest.approx(ref["ts"] - t["expected_ts"], abs=1e-8)


@pytest.mark.usefixtures("served")
def test_team_board_ranks_teams_and_carries_roles_and_spread() -> None:
    board = service.team_board("2025-26")
    assert board is not None and board["status"] == "available"
    values = [t["difficulty"] for t in board["teams"]]
    assert values == sorted(values, reverse=True) and len(values) == 30
    assert [t["rank"] for t in board["teams"]] == list(range(1, 31))
    assert all(t["tricode"] for t in board["teams"])
    players = service.load_results()["players"]["2025-26"]  # type: ignore[index]
    for t in board["teams"]:
        for p in t["players"]:
            assert p["difficulty"] == players[p["player_id"]]["difficulty"]
            assert p["multi_team"] == (len(players[p["player_id"]]["teams"]) > 1)
    spread = board["spread"]
    assert len(spread["teams"]["values"]) == 330
    assert len(spread["players"]["values"]) == 3329
    assert spread["teams"]["sd"] < spread["players"]["sd"]
    missing = service.team_board("2014-15")
    assert missing is not None and missing["status"] == "unknown"


@pytest.mark.usefixtures("served")
def test_role_moves_follow_their_rule(monkeypatch: pytest.MonkeyPatch) -> None:
    results = service.load_results()
    assert results is not None
    window = ["2021-22", "2022-23", "2023-24", "2024-25", "2025-26"]

    def busy(season: str) -> dict:
        return {pid: {"minutes": 2000.0} for pid in results["players"][season]}

    monkeypatch.setattr(service, "volume", busy)
    moves = service.role_moves("2025-26")
    assert moves is not None and moves["status"] == "available"
    assert moves["window"] == window
    pool = [
        pid
        for pid in results["players"][window[0]]
        if all(results["players"][s].get(pid, {}).get("status") == zts.KNOWN for s in window)
    ]
    assert moves["pool"] == len(pool)
    change = {
        pid: results["players"][window[-1]][pid]["difficulty"]
        - results["players"][window[0]][pid]["difficulty"]
        for pid in pool
    }
    expected = sorted(change, key=lambda pid: (-abs(change[pid]), pid))[:6]
    assert [p["player_id"] for p in moves["players"]] == expected
    assert all([h["season"] for h in p["history"]] == window for p in moves["players"])
    first = service.role_moves("2015-16")
    assert first is not None and first["status"] == "unknown"
    short = service.role_moves("2016-17")
    assert short is not None and short["window"] == ["2015-16", "2016-17"]
