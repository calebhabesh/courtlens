"""W4: the pregame "why" from a seal; its rows add up to the forecast exactly."""

from __future__ import annotations

import hashlib
import json

import pytest
from fastapi.testclient import TestClient

from courtlens.services import win_probability_breakdown as breakdown
from courtlens.services import win_probability_head_to_head as h2h
from courtlens.services import win_probability_production as production

COEFFICIENTS = production.load_manifest()["pregame"]["coefficients"]
INPUTS = {
    "mu": 0.0,
    "form": 0.25,
    "strength": 1.5,
    "rest": 1.0,
    "b2b_home": 0.0,
    "b2b_away": 1.0,
    "games7": -1.0,
    "travel_home": 0.0,
    "travel_away": 0.9,
    "neutral": 0.0,
    "denver": 1.0,
    "utah": 0.0,
}


def record(mu: float = 4.0, line: float | None = 6.5, split: bool = True) -> dict:
    return {
        "home": "1610612743",
        "away": "1610612747",
        "event_time": "2026-11-14T02:00Z",
        "inputs": {**INPUTS, "mu": mu},
        "form_split": {"team_form": -0.5, "home_court": 0.75} if split else None,
        "line": None if line is None else {"home_margin": line, "book": "B", "details": "DEN -6.5"},
        "tip_off_home": {"original": None, "market_informed": None},
        "out": {"home": [], "away": []},
    }


def test_the_rows_add_up_to_the_own_forecast_exactly():
    own = breakdown.own_rows(record(4.0), COEFFICIENTS)
    assert own["own"] == 4.0
    assert sum(g["contribution"] for g in own["groups"]) == pytest.approx(4.0, abs=1e-12)
    groups = {g["group"]: g for g in own["groups"]}
    assert list(groups) == ["players", "form", "home_court", "rest_travel"]
    # Home court: the home coefficient, the home-court part of form and altitude.
    home = groups["home_court"]
    assert {r["input"] for r in home["rows"]} == {"home", "denver", "utah", "home_court_form"}
    assert home["contribution"] == pytest.approx(
        COEFFICIENTS["home"] + COEFFICIENTS["denver"] + COEFFICIENTS["form"] * 0.75
    )
    assert groups["form"]["contribution"] == pytest.approx(COEFFICIENTS["form"] * -0.5)
    # Every row but players available is coefficient x input.
    for group in own["groups"][1:]:
        for row in group["rows"]:
            assert row["contribution"] == pytest.approx(row["coefficient"] * row["value"])


def test_a_v1_seal_without_the_form_split_keeps_form_whole():
    own = breakdown.own_rows(record(4.0, split=False), COEFFICIENTS)
    groups = {g["group"]: g for g in own["groups"]}
    assert groups["form"]["contribution"] == pytest.approx(COEFFICIENTS["form"] * 0.25)
    assert sum(g["contribution"] for g in own["groups"]) == pytest.approx(4.0, abs=1e-12)


def test_a_neutral_site_has_no_home_court_term():
    neutral = record()
    neutral["inputs"].update(neutral=1.0, denver=0.0)
    groups = {g["group"]: g for g in breakdown.own_rows(neutral, COEFFICIENTS)["groups"]}
    home = {r["input"]: r for r in groups["home_court"]["rows"]}
    assert home["home"]["contribution"] == 0.0


@pytest.mark.parametrize(
    ("captured", "line", "status"),
    [
        ("2026-11-13T23:55:00+00:00", 6.5, "ok"),
        ("2026-11-13T23:55:00+00:00", None, "no_line"),
        ("2026-11-12T15:25:07+00:00", 6.5, "sealed_before_freeze"),
    ],
)
def test_the_market_row_or_why_there_is_none(captured, line, status):
    row = breakdown.market_row(record(4.0, line), 4.0, captured)
    assert row["status"] == status
    if status == "ok":
        assert row["adjustment"] == pytest.approx(1.0 * (6.5 - 4.0))


def seal(directory, day: str, captured: str, games: dict) -> None:
    body = json.dumps({"captured_at": captured, "games": games}).encode()
    digest = hashlib.sha256(body).hexdigest()
    (directory / f"{day}.{digest}.json").write_bytes(body)


@pytest.fixture
def serving(tmp_path, monkeypatch):
    monkeypatch.setattr(production, "serving_root", lambda: tmp_path)
    (tmp_path / "pregame").mkdir()
    monkeypatch.setattr(h2h, "read_summary", lambda: None)
    return tmp_path


def test_the_seal_used_is_the_newest_before_tip(serving):
    pregame = serving / "pregame"
    seal(pregame, "2026-11-13", "2026-11-13T17:00:00+00:00", {"9": record(1.0)})
    seal(pregame, "2026-11-13", "2026-11-14T01:55:00+00:00", {"9": record(2.0)})
    seal(pregame, "2026-11-13", "2026-11-14T02:05:00+00:00", {"9": record(3.0)})  # after tip
    found = breakdown.sealed("9", "2026-11-13")
    assert found is not None and found[0]["inputs"]["mu"] == 2.0
    assert found[1] == "2026-11-14T01:55:00+00:00"
    assert breakdown.sealed("10", "2026-11-13") is None


def sealed_probabilities(mu: float, line: float) -> dict:
    """A post-freeze seal carries both models' tip-off chances, so no model file is loaded (CI
    has none)."""
    return {**record(mu, line), "tip_off_home": {"original": 0.61, "market_informed": 0.68}}


def test_the_breakdown_leads_with_the_own_read_and_shows_the_market_model_beside_it(serving):
    seal(
        serving / "pregame",
        "2026-11-13",
        "2026-11-14T01:55:00+00:00",
        {"9": sealed_probabilities(4.0, 6.5)},
    )
    body = breakdown.breakdown("9", "2026-11-13")
    assert body["model"] == body["serving"] == "original" and body["market"]["status"] == "ok"
    assert body["prediction"] == {"home_margin": 4.0, "home_win": 0.61}
    assert body["market_informed"]["home_margin"] == pytest.approx(6.5)
    assert body["market_informed"]["home_win"] == body["tip_off_home"]["market_informed"] == 0.68
    assert body["result"] is None


def test_with_no_line_there_is_no_market_figure(serving):
    seal(
        serving / "pregame",
        "2026-11-13",
        "2026-11-14T01:55:00+00:00",
        {"9": {**sealed_probabilities(4.0, 6.5), "line": None}},
    )
    body = breakdown.breakdown("9", "2026-11-13")
    assert body["market"]["status"] == "no_line" and body["market_informed"] is None
    assert body["prediction"] == {"home_margin": 4.0, "home_win": 0.61}


def test_the_endpoint(serving):
    from courtlens.api.app import create_app

    seal(
        serving / "pregame",
        "2026-11-13",
        "2026-11-14T01:55:00+00:00",
        {"9": sealed_probabilities(4.0, 6.5)},
    )
    client = TestClient(create_app())  # no lifespan: the route reads no database
    ok = client.get("/api/win-probability/games/9/breakdown", params={"date": "2026-11-13"})
    assert ok.status_code == 200 and ok.json()["seal"].startswith("2026-11-13.")
    missing = client.get("/api/win-probability/games/8/breakdown", params={"date": "2026-11-13"})
    assert missing.status_code == 404
    bad = client.get("/api/win-probability/games/x/breakdown", params={"date": "2026-11-13"})
    assert bad.status_code == 422


def test_the_card_leads_with_the_own_read_and_carries_the_market_chance(serving):
    # W-D16: the card's call is the Original's; the Market-informed chance rides beside it.
    seal(
        serving / "pregame",
        "2026-11-13",
        "2026-11-14T01:55:00+00:00",
        {
            "9": {**sealed_probabilities(4.0, 6.5), "availability": "tip_off_capture"},
            "10": {
                **sealed_probabilities(4.0, 6.5),
                "line": None,
                "availability": "tip_off_capture",
            },
        },
    )
    teams = [{"side": "home", "score": 99}, {"side": "away", "score": 104}]
    game = {"source_id": "9", "slate_date": "2026-11-13", "status": "final", "teams": teams}
    body = breakdown.card(game)
    assert body["model"] == "original" and body["home_win"] == 0.61
    assert body["favourite"] == "home" and body["probability"] == 0.61
    assert body["market_informed_home_win"] == 0.68
    assert body["right"] is False
    no_line = breakdown.card({**game, "source_id": "10", "status": "scheduled"})
    assert no_line["home_win"] == 0.61 and no_line["market_informed_home_win"] is None
