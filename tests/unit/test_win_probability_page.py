"""W5: the page's head-to-head calibration, the worked example's rule and the do-no-harm check."""

from __future__ import annotations

import pytest

from courtlens.services import win_probability_page as page


def game(
    game_id: str, tip: str, bins_market: list[list[float]], bins_original: list[list[float]]
) -> dict:
    return {
        "game_id": game_id,
        "date": tip[:10],
        "tip_off": tip,
        "home": "PHI",
        "away": "TOR",
        "home_score": 110,
        "away_score": 101,
        "calls": {"original": 1.0, "market_informed": 1.0, "line": 1.0},
        "market_informed": {"bins": bins_market},
        "original": {"bins": bins_original},
    }


def why(costs: list[float | None]) -> dict:
    return {"out": {"home": [{"name": "A", "cost": c} for c in costs], "away": []}}


def test_calibration_pools_every_state_of_every_game() -> None:
    a = [[0.5, 0.15, 0.0], [0.5, 0.35, 0.5]]
    b = [[0.0, 0.0, 0.0], [1.0, 0.8, 1.0]]
    body = page.calibration(
        [game("1", "2026-11-13T00:00Z", a, a), game("2", "2026-11-13T00:30Z", b, b)]
    )
    assert body is not None and body["games"] == 2
    curve = body["market_informed"]["curve"]
    assert [round(p["share"], 6) for p in curve] == [0.25, 0.75]
    assert curve[0]["predicted"] == pytest.approx(0.3) and curve[0]["observed"] == 0.0
    assert curve[1]["predicted"] == pytest.approx(1.15 / 1.5) and curve[1]["observed"] == 1.0
    assert page.calibration([]) is None


def test_worked_example_is_the_first_qualifying_game_by_tip(monkeypatch, tmp_path) -> None:
    monkeypatch.setattr(page, "EXAMPLE_PATH", tmp_path / "missing.json")
    whys = {"1": why([0.4]), "2": why([None, 1.2]), "3": why([3.0])}
    monkeypatch.setattr(page.breakdown_service, "breakdown", lambda gid, day: whys[gid])
    bins = [[1.0, 0.6, 1.0]]
    games = [
        game("3", "2026-11-14T00:00Z", bins, bins),
        game("2", "2026-11-13T01:00Z", bins, bins),
        game("1", "2026-11-13T00:00Z", bins, bins),
    ]
    example = page.worked_example(games)
    assert example["game"]["game_id"] == "2" and example["stored"] is False
    assert example["rule"].startswith("The first head-to-head game")
    assert page.worked_example([games[2]])["game"] is None


def test_a_stored_example_never_moves(monkeypatch, tmp_path) -> None:
    stored = tmp_path / "example.json"
    stored.write_text('{"game": {"game_id": "9"}, "why": {}}')
    monkeypatch.setattr(page, "EXAMPLE_PATH", stored)
    assert page.worked_example([])["game"]["game_id"] == "9"
    assert page.worked_example([])["stored"] is True


def test_do_no_harm_reads_the_frozen_check() -> None:
    body = page.do_no_harm()
    assert body is not None and body["passed"] is True and body["games"] == 2439
    assert (
        body["log_loss_gain"]["low"] > 0 and body["calibration_error"] < body["calibration_limit"]
    )
