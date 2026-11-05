"""R05 Shot Quality v2: possession replay, metrics, and the registered runner on synthetic data."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any

import numpy as np
import pytest

from courtlens.domain import expected_shot_v2 as es
from courtlens.evaluation import expected_shot_v2_data as data
from courtlens.evaluation import expected_shot_v2_runner as runner

HOME, AWAY = "1610612754", "1610612739"


def event(
    number: int,
    clock: str,
    kind: str,
    team: str = "0",
    person: str = "0",
    *,
    sub: str = "",
    period: int = 1,
    fg: bool = False,
    result: str = "",
    home: str = "",
    away: str = "",
    description: str = "",
) -> dict[str, str]:
    location = "h" if team == HOME else "v" if team == AWAY else ""
    return {
        "actionNumber": str(number),
        "clock": clock,
        "period": str(period),
        "teamId": team,
        "personId": person,
        "location": location,
        "actionType": kind,
        "subType": sub,
        "isFieldGoal": "1" if fg else "0",
        "shotResult": result,
        "scoreHome": home,
        "scoreAway": away,
        "description": description,
    }


def team_event(number: int, clock: str, kind: str, team: str, **kw: Any) -> dict[str, str]:
    row = event(number, clock, kind, "0", team, **kw)
    row["location"] = "h" if team == HOME else "v"
    return row


def shot(number: int, clock: str, team: str, made: bool, **kw: Any) -> dict[str, str]:
    return event(
        number,
        clock,
        "Made Shot" if made else "Missed Shot",
        team,
        "p" + team[-3:],
        fg=True,
        result="Made" if made else "Missed",
        **kw,
    )


def test_possession_gains_and_offensive_rebounds() -> None:
    rows = [
        event(1, "PT12M00.00S", "period", sub="start"),
        shot(2, "PT11M50.00S", HOME, True, home="2", away="0", description="X (Y 1 AST)"),
        shot(3, "PT11M30.00S", AWAY, False),
        event(4, "PT11M28.00S", "Rebound", AWAY, "pa"),
        shot(5, "PT11M26.00S", AWAY, False),
        team_event(6, "PT11M25.00S", "Rebound", HOME),  # team rebound: personId holds the team
        shot(7, "PT11M10.00S", HOME, False),
    ]
    result = es.game_context(rows)
    first, second, putback, home = (result.shots[n] for n in (2, 3, 5, 7))
    assert first.possession_seconds == 10.0 and first.margin == 0.0
    assert first.assisted_in_description and not second.assisted_in_description
    assert second.possession_seconds == 20.0 and second.margin == -2.0
    assert putback.possession_seconds == 24.0 and putback.after_offensive_rebound == 1
    assert putback.since_offensive_rebound == 2.0
    assert home.possession_seconds == 15.0 and home.after_offensive_rebound == 0
    assert np.isnan(home.since_offensive_rebound)


def test_free_throws_turnovers_and_unknown_states() -> None:
    rows = [
        event(1, "PT12M00.00S", "period", sub="start"),
        event(2, "PT11M40.00S", "Free Throw", HOME, "ph", sub="Free Throw 1 of 2", result="Made"),
        event(3, "PT11M40.00S", "Free Throw", HOME, "ph", sub="Free Throw 2 of 2", result="Made"),
        shot(4, "PT11M30.00S", AWAY, False),  # away gained at the last made free throw
        team_event(5, "PT11M29.00S", "Turnover", AWAY),
        shot(6, "PT11M20.00S", HOME, False),
        event(7, "PT11M18.00S", "Jump Ball", HOME, "ph"),
        shot(8, "PT11M10.00S", AWAY, False),  # after a mid-period jump ball: unknown
        shot(9, "PT11M00.00S", HOME, False),  # still unknown: no gain since
        event(10, "PT10M58.00S", "Rebound", AWAY, "pa"),
        shot(11, "PT10M50.00S", AWAY, False),
        shot(12, "PT10M40.00S", HOME, False),  # home shoots while away holds the ball
    ]
    result = es.game_context(rows)
    assert result.shots[4].possession_seconds == 10.0
    assert result.shots[6].possession_seconds == 9.0
    for number in (8, 9):
        assert result.shots[number].possession_unknown_reason == "jump_ball_or_clock"
        assert np.isnan(result.shots[number].possession_seconds)
        assert result.shots[number].after_offensive_rebound == -1
    assert result.shots[11].possession_seconds == 8.0
    assert result.shots[12].possession_unknown_reason == "possession_conflict"


def test_missed_and_one_rebounded_by_the_shooters() -> None:
    rows = [
        event(1, "PT12M00.00S", "period", sub="start"),
        event(2, "PT12M00.00S", "Jump Ball", AWAY, "pa"),  # at the period start: no change
        shot(3, "PT11M50.00S", HOME, True, home="2", away="0"),
        event(4, "PT11M50.00S", "Foul", AWAY, "pa", sub="Shooting"),
        event(5, "PT11M50.00S", "Free Throw", HOME, "ph", sub="Free Throw 1 of 1", result="Missed"),
        event(6, "PT11M48.00S", "Rebound", HOME, "ph2"),
        shot(7, "PT11M45.00S", HOME, False),
    ]
    later = es.game_context(rows).shots[7]
    assert later.possession_seconds == 3.0 and later.after_offensive_rebound == 1
    assert later.margin == 2.0  # the made shot's points count before the next shot


def test_metrics() -> None:
    p = np.array([0.2, 0.8, 0.5, 0.5])
    y = np.array([0.0, 1.0, 1.0, 0.0])
    assert es.brier_terms(p, y).mean() == pytest.approx(0.145)
    assert es.log_loss_terms(np.array([1.0]), np.array([1.0]))[0] == pytest.approx(1e-6, rel=1e-3)
    assert es.ece(p, y) == pytest.approx(0.1)
    curve = es.calibration_curve(p, y, 2)
    assert [c["count"] for c in curve] == [2, 2]
    weights = es.game_bootstrap_weights(5, 100, 1)
    assert weights.shape == (100, 5) and (weights.sum(axis=1) == 5).all()
    assert es.platt(np.array([0.3]), 0.0, 1.0)[0] == pytest.approx(0.3)


def test_registered_constants_match() -> None:
    params = runner.parameters()
    assert params["candidates"] == list(runner.CANDIDATES)
    assert set(params["table_sha256"]) == set(data.SEASONS)


# ---- The runner on synthetic tables ---------------------------------------------------------


def synthetic(season: str, shots: int = 3000) -> dict[str, np.ndarray]:
    rng = np.random.default_rng(int(season[:4]))
    distance = rng.integers(0, 30, shots).astype(float)
    action = rng.choice(["Jump Shot", "Dunk Shot", "Layup Shot"], shots)
    p = np.clip(0.65 - 0.012 * distance + 0.2 * (action == "Dunk Shot"), 0.05, 0.95)
    zone = np.where(
        distance < 4, "Restricted Area", np.where(distance < 23, "Mid-Range", "Above the Break 3")
    )
    games = rng.integers(0, 40, shots)
    possession = rng.uniform(0, 24, shots)
    possession[rng.random(shots) < 0.01] = np.nan
    after = np.where(np.isnan(possession), -1, (rng.random(shots) < 0.1).astype(int))
    return {
        "game_id": np.array([f"00{season[:4]}{g:04d}" for g in games]),
        "event_id": np.arange(shots, dtype=np.int64),
        "player_id": np.array([f"{i % 12}" for i in range(shots)]),
        "team_id": np.array([HOME if i % 2 else AWAY for i in range(shots)]),
        "date": np.full(shots, 20240101, dtype=np.int64),
        "made": (rng.random(shots) < p).astype(np.int8),
        "value": np.where(distance >= 23, 3, 2).astype(np.int8),
        "loc_x": rng.normal(0, 100, shots),
        "loc_y": distance * 10,
        "distance": distance,
        "action_type": action,
        "zone_basic": zone,
        "zone_area": np.array(["Center(C)"] * shots),
        "zone_range": np.array(["x"] * shots),
        "period": rng.integers(1, 5, shots).astype(np.int8),
        "remaining": rng.uniform(0, 720, shots),
        "margin": rng.integers(-20, 20, shots).astype(float),
        "possession_seconds": possession,
        "after_oreb": after.astype(np.int8),
        "since_oreb": np.where(after == 1, rng.uniform(0, 10, shots), np.nan),
        "unjoined_reason": np.array([""] * shots),
        "possession_reason": np.array([""] * shots),
    }


@pytest.fixture
def synthetic_run(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> Path:
    tables = {s: synthetic(s) for s in data.SEASONS}
    monkeypatch.setattr(runner, "load_season", lambda season, sha: tables[season])
    monkeypatch.setattr(runner, "data_receipts", lambda: {"synthetic": True})
    params = runner.parameters()
    monkeypatch.setitem(runner.LIGHTGBM, "n_estimators", 40)
    monkeypatch.setattr(runner, "REPLICATES", 50)
    monkeypatch.setattr(runner, "PLAYER_MIN", 100)
    monkeypatch.setattr(runner, "parameters", lambda: params)
    return tmp_path / "run"


def test_runner_end_to_end_is_reproducible(synthetic_run: Path, tmp_path: Path) -> None:
    choice = runner.fit_pass(synthetic_run)
    assert choice["chosen"] in runner.CANDIDATES
    assert set(choice["metrics"]["models"]) == {"baseline", "reference", *runner.CANDIDATES}
    assert choice["fits"]["lightgbm_31"]["trees"] == 40
    result = runner.test_pass(synthetic_run)
    assert result["outcome"] in {
        "accepted",
        "selection_failed_negative_result",
        "test_failed_negative_result",
    }
    seasons = result["players"]["seasons"]
    assert set(seasons) == set(runner.PLAYER_SEASONS)
    for block in seasons.values():
        served = [r for r in block["players"].values() if r["status"] == "served"]
        assert served
        for row in served:
            low, high = row["interval"]
            assert low <= high
            expected = 100 * ((row["pps"] - row["xpps"]) - block["league_term"])
            assert row["shot_making"] == pytest.approx(expected, abs=1e-6)
    # The fitted models and results reproduce from the seed.
    again = runner.fit_pass(tmp_path / "again")
    assert again["model_sha256"] == choice["model_sha256"]
    second = runner.test_pass(tmp_path / "again")
    assert second["results_sha256"] == result["results_sha256"]


def test_test_pass_refuses_a_changed_model(synthetic_run: Path) -> None:
    runner.fit_pass(synthetic_run)
    model = synthetic_run / "models" / "baseline.json"
    body = json.loads(model.read_text())
    body["zones"]["Mid-Range"] = 0.9
    model.write_text(json.dumps(body))
    with pytest.raises(SystemExit, match="changed after the choice pass"):
        runner.test_pass(synthetic_run)


# ---- The frozen results ---------------------------------------------------------------------

ROOT = Path(__file__).resolve().parents[2]
FROZEN = ROOT / "evaluation/research/frozen/courtlens-expected-shot-v2.json"
EVIDENCE = ROOT / "docs/evidence/research/r05/results.json"


@pytest.fixture(scope="module")
def frozen() -> dict[str, Any]:
    return json.loads(FROZEN.read_text())


def test_frozen_results_hash_and_registration(frozen: dict[str, Any]) -> None:
    from courtlens.domain.research_registry import registration_receipt

    body = {k: v for k, v in frozen.items() if k != "results_sha256"}
    assert frozen["results_sha256"] == hashlib.sha256(runner.canonical(body)).hexdigest()
    assert frozen["registration"] == registration_receipt(runner.REGISTRATION)
    assert frozen["choice"]["registration"] == frozen["registration"]
    evidence = json.loads(EVIDENCE.read_text())
    assert evidence == runner.evidence_extract(frozen)


def test_frozen_gates_follow_the_registered_rules(frozen: dict[str, Any]) -> None:
    choice = frozen["choice"]
    briers = {n: choice["metrics"]["models"][n]["brier"] for n in runner.CANDIDATES}
    assert choice["chosen"] == min(briers, key=lambda n: briers[n])
    base = choice["metrics"]["models"]["baseline"]["brier"]
    assert choice["relative_brier"] == pytest.approx(1 - briers[choice["chosen"]] / base, abs=1e-8)
    assert choice["passed"] == (choice["relative_brier"] >= runner.SELECTION_GATE)
    gates = frozen["test"]["gates"]
    pooled = frozen["test"]["pooled"]
    chosen = choice["chosen"]
    rel = 1 - pooled["models"][chosen]["brier"] / pooled["models"]["baseline"]["brier"]
    assert gates["relative_brier"]["value"] == pytest.approx(rel, abs=1e-8)
    assert gates["relative_brier"]["passed"] == (
        rel >= runner.TEST_GATE and gates["relative_brier"]["brier_difference_interval"][0] > 0
    )
    assert gates["log_loss"]["passed"] == (gates["log_loss"]["interval"][0] > 0)
    assert gates["ece"]["passed"] == (pooled["models"][chosen]["ece"] <= runner.TEST_MAX_ECE)
    accepted = all(g["passed"] for g in gates.values())
    assert frozen["outcome"] == ("accepted" if accepted else "test_failed_negative_result")
    assert frozen["serving_model"] == (chosen if accepted else "baseline")


def test_frozen_counts_match_the_tables(frozen: dict[str, Any]) -> None:
    data_rows = {s: r["rows"] for s, r in frozen["data"].items()}
    assert sum(data_rows[s] for s in runner.TRAIN) == frozen["choice"]["training_attempts"]
    assert frozen["choice"]["metrics"]["attempts"] == data_rows[runner.SELECT]
    assert frozen["test"]["pooled"]["attempts"] == sum(data_rows[s] for s in runner.TEST)
    for season, block in frozen["test"]["by_season"].items():
        assert block["attempts"] == data_rows[season]
    for curve in frozen["test"]["curves"].values():
        assert sum(b["count"] for b in curve) == frozen["test"]["pooled"]["attempts"]
    for season, block in frozen["players"]["seasons"].items():
        assert block["attempts"] == data_rows[season]
        assert sum(r["fga"] for r in block["players"].values()) == data_rows[season]
        for row in block["players"].values():
            served = row["fga"] >= runner.PLAYER_MIN
            assert row["status"] == ("served" if served else "small_sample")
            assert (row["shot_making"] is None) == (not served)
            if served:
                expected = 100 * ((row["pps"] - row["xpps"]) - block["league_term"])
                assert row["shot_making"] == pytest.approx(expected, abs=1e-6)
                assert row["interval"][0] <= row["shot_making"] <= row["interval"][1]
    # The assist is recorded only on makes: never a pre-shot feature.
    assert all(
        r["assist_in_description"].get("missed_True", 0) == 0 for r in frozen["data"].values()
    )


def test_service_serves_the_frozen_values(
    monkeypatch: pytest.MonkeyPatch, frozen: dict[str, Any]
) -> None:
    from courtlens.services import shot_quality as service

    monkeypatch.setattr(service, "RESULTS_PATH", FROZEN)
    summary = service.summary()
    assert summary is not None and summary["results_sha256"] == frozen["results_sha256"]
    board = service.leaderboard("2025-26")
    assert board is not None and board["status"] == "available"
    source = frozen["players"]["seasons"]["2025-26"]["players"]
    assert len(board["rows"]) == sum(1 for r in source.values() if r["status"] == "served")
    values = [r["shot_making"] for r in board["rows"]]
    assert values == sorted(values, reverse=True)
    for row in board["rows"][:20]:
        assert row["shot_making"] == source[row["player_id"]]["shot_making"]
    filtered = service.leaderboard("2025-26", team="BOS", min_fga=1000)
    assert filtered is not None and all(r["fga"] >= 1000 for r in filtered["rows"])
    assert all("BOS" in {t["tricode"] for t in r["teams"]} for r in filtered["rows"])
    default = service.default_player()
    assert default == max(source, key=lambda p: (source[p]["fga"], -int(p)))
    assert service.leaderboard("2019-20")["status"] == "unknown"  # type: ignore[index]
