"""W3b: both models from the same seals, the registered reads and the serving rule."""

from __future__ import annotations

import json
from datetime import UTC, date, datetime
from pathlib import Path
from types import SimpleNamespace

import numpy as np
import pytest

from courtlens.domain.win_probability_scorecard import game_bins
from courtlens.evaluation.win_probability_models import bootstrap_interval
from courtlens.services import win_probability_head_to_head as h2h
from courtlens.services import win_probability_production as production
from courtlens.services.win_probability_serving import GameInputs, StateColumns, sampled_states

INPUTS = {
    "mu": 2.0,
    "form": 0.0,
    "strength": 0.0,
    "rest": 0.0,
    "b2b_home": 0.0,
    "b2b_away": 0.0,
    "games7": 0.0,
    "travel_home": 0.0,
    "travel_away": 0.0,
    "neutral": 0.0,
    "denver": 0.0,
    "utah": 0.0,
}
NOW = datetime(2026, 11, 13, 14, 0, tzinfo=UTC)


class Echo:
    """A stand-in model whose probability follows the pregame margin it is given."""

    def predict_home(self, states: StateColumns, game: GameInputs) -> np.ndarray:
        return np.full(len(states), 1 / (1 + np.exp(-game.mu / 5)))


def record(line: float | None = 8.0) -> dict:
    return {
        "inputs": dict(INPUTS),
        "line": None if line is None else {"home_margin": line},
        "availability": "tip_off_capture",
    }


def summary(home: int = 100, away: int = 90) -> dict:
    plays = [
        {
            "id": "1",
            "period": 1,
            "clock": "12:00",
            "type": "Jumpball",
            "text": "",
            "side": "away",
            "scoring": False,
            "home_score": 0,
            "away_score": 0,
            "shot": None,
            "points_attempted": None,
            "player_source_id": "a",
        },
        {
            "id": "2",
            "period": 4,
            "clock": "1:00",
            "type": "Jump Shot",
            "text": "",
            "side": "home",
            "shot": "field_goal",
            "scoring": True,
            "points_attempted": None,
            "player_source_id": "b",
            "home_score": home,
            "away_score": away,
        },
    ]
    return {
        "game": {
            "source_id": "501",
            "slate_date": "2026-11-12",
            "teams": [
                {"side": "home", "score": home, "abbreviation": "PHI"},
                {"side": "away", "score": away, "abbreviation": "TOR"},
            ],
        },
        "plays": plays,
    }


MANIFEST = {"market": {"w": 1.0}, "manifest_sha256": "f" * 64}


def test_the_committed_manifest_loads_against_the_served_original():
    manifest = h2h.load_market_manifest()
    assert manifest["registration"] == "courtlens-win-probability-v4"
    assert manifest["market"]["w"] == 1.0


def test_the_opening_state_is_a_real_games_first_state():
    built, _ = production._replay_from(summary()["plays"])
    first = sampled_states(built)
    opening = h2h.opening_state()
    assert opening.time[0] == first.time[0] == 0.0
    assert opening.period[0] == first.period[0] == 1
    for name, values in opening.columns.items():
        assert values[0] == first.columns[name][0], name


def test_the_market_model_reads_mu4_and_the_seal_records_it():
    base = Echo()
    fields = h2h.seal_fields(base, record(8.0), 1.0)
    assert fields["mu4"] == 8.0 and fields["w"] == 1.0
    tip = fields["tip_off_home"]
    assert tip["original"] == pytest.approx(1 / (1 + np.exp(-2 / 5)))
    assert tip["market_informed"] == pytest.approx(1 / (1 + np.exp(-8 / 5)))
    no_line = h2h.seal_fields(base, record(None), 1.0)
    assert no_line["mu4"] == 2.0
    assert no_line["tip_off_home"]["market_informed"] == no_line["tip_off_home"]["original"]


def test_a_head_to_head_row_scores_both_models_on_the_same_states():
    row = h2h.head_to_head_row(
        Echo(), summary(), record(8.0), "2026-11-12T23:55:00+00:00", "2026-11-13T00:00Z", MANIFEST
    )
    assert row["states"] > 1 and row["seal_age_minutes"] == 5.0
    assert row["pregame"] == {
        "own": 2.0,
        "line": 8.0,
        "mu4": 8.0,
        "margin": 10,
        "squared_error_own": 64.0,
        "squared_error_mu4": 4.0,
    }
    # The home side won and both models favoured it; the market model more surely.
    assert row["original"]["log_loss"] > row["market_informed"]["log_loss"]
    assert row["calls"] == {"original": 1.0, "market_informed": 1.0, "line": 1.0}
    assert set(row["original"]["phases"]) == set(row["market_informed"]["phases"])


def test_a_pick_em_line_counts_half():
    row = h2h.head_to_head_row(
        Echo(), summary(), record(0.0), "2026-11-12T23:30:00+00:00", "2026-11-13T00:00Z", MANIFEST
    )
    assert row["calls"]["line"] == 0.5


def test_the_interval_is_stage_cs_bootstrap():
    values = np.random.default_rng(7).normal(0, 1, 137)
    assert h2h.paired_interval(values) == bootstrap_interval(values)


@pytest.mark.parametrize(
    ("low", "high", "result"),
    [(0.1, 0.5, "better"), (-0.5, -0.1, "worse"), (-0.1, 0.1, "not distinguishable")],
)
def test_each_read_has_one_of_three_results(low, high, result):
    assert h2h.result_of({"low": low, "high": high}) == result


def game(i: int, own_error: float, mu4_error: float, original: float, market: float) -> dict:
    tip = f"2026-11-{13 + i // 10:02d}T{i % 10:02d}:00Z"
    return {
        "game_id": str(1000 + i),
        "date": tip[:10],
        "tip_off": tip,
        "seal_age_minutes": 5.0,
        "pregame": {"line": 3.0, "squared_error_own": own_error, "squared_error_mu4": mu4_error},
        "calls": {"original": 1.0, "market_informed": 1.0, "line": 1.0},
        "original": {"log_loss": original, "phases": {}, "tip_off_home": 0.6},
        "market_informed": {
            "log_loss": market,
            "phases": {},
            "tip_off_home": 0.7,
            "bins": game_bins(np.full(10, 0.7), 1.0),
        },
    }


@pytest.fixture
def serving(tmp_path, monkeypatch):
    monkeypatch.setattr(production, "serving_root", lambda: tmp_path)
    return tmp_path


def test_the_verdict_is_read_once_at_300_games_on_the_first_300(serving):
    rng = np.random.default_rng(1)
    games = [game(i, 100 + rng.normal(), 90 + rng.normal(), 0.45, 0.44) for i in range(299)]
    assert h2h.take_reads(games, False, NOW) == []
    games.append(game(299, 100, 90, 0.45, 0.44))
    first = h2h.take_reads(games, False, NOW)
    assert [r["kind"] for r in first] == ["verdict"] and first[0]["games"] == 300
    assert first[0]["v1"]["result"] == "better" and first[0]["v2"]["result"] == "better"
    # Later games never change the verdict.
    games += [game(300 + i, 0, 900, 0.1, 2.0) for i in range(50)]
    again = h2h.take_reads(games, False, NOW)
    assert again == first and len(h2h.written_reads()) == 1


def test_the_registered_rule_returns_live_to_the_original_on_a_worse_read(serving):
    games = [game(i, 90, 100, 0.40, 0.45) for i in range(300)]
    written = h2h.take_reads(games, False, NOW)
    assert written[0]["v1"]["result"] == "worse"
    assert h2h.registered_serving_model(written)["model"] == "original"
    assert h2h.registered_serving_model([])["model"] == "market_informed"


def test_live_leads_with_the_original_and_reports_the_registered_rule(serving):
    # W-D16: the own read leads whatever the reads say; the registered rule is still reported.
    none = h2h.serving_model([])
    assert none["model"] == "original" and none["since"] == "2026-11-12"
    assert none["registered_rule"]["model"] == "market_informed"
    games = [game(i, 90, 100, 0.40, 0.45) for i in range(300)]
    worse = h2h.serving_model(h2h.take_reads(games, False, NOW))
    assert worse["model"] == "original" and worse["registered_rule"]["model"] == "original"


def test_the_page_never_reads_a_stale_lead_from_a_stored_summary(serving, monkeypatch):
    stored = {"games": 0, "reads": [], "serving_model": {"model": "market_informed", "reason": "x"}}
    monkeypatch.setattr(h2h, "read_summary", lambda: stored)
    page = h2h.page_summary()
    assert page["serving_model"]["model"] == "original"
    assert page["serving_model"]["registered_rule"]["model"] == "market_informed"
    assert page["games"] == 0 and stored["serving_model"]["model"] == "market_informed"
    monkeypatch.setattr(h2h, "read_summary", lambda: None)
    assert h2h.page_summary() is None


def test_the_final_read_waits_for_the_season_to_end_and_is_written_once(serving):
    games = [game(i, 100, 90, 0.45, 0.44) for i in range(40)]
    assert h2h.take_reads(games, False, NOW) == []
    final = h2h.take_reads(games, True, NOW)
    assert [r["kind"] for r in final] == ["final"]
    assert h2h.take_reads(games, True, NOW) == final


def test_the_final_read_can_flip_the_registered_rule_too(serving):
    games = [game(i, 100, 90, 0.40, 0.48) for i in range(40)]
    written = h2h.take_reads(games, True, NOW)
    assert written[0]["kind"] == "final" and written[0]["v2"]["result"] == "worse"
    assert h2h.registered_serving_model(written)["model"] == "original"


@pytest.mark.parametrize(
    ("kind", "day", "over"),
    [
        (3, date(2027, 4, 20), True),
        (5, date(2027, 4, 15), True),
        (2, date(2027, 4, 10), False),
        (1, date(2026, 10, 5), False),
        (None, date(2027, 4, 20), False),
    ],
)
def test_the_season_is_over_when_espn_leaves_the_regular_season_in_spring(kind, day, over):
    payload = {"leagues": [{"season": {"type": {"type": kind}} if kind else {}}]}
    assert h2h.season_over(payload, day) is over


def test_the_record_of_calls_counts_halves_and_toss_ups():
    games = [game(i, 1, 1, 0.5, 0.5) for i in range(4)]
    games[0]["calls"] = {"original": 0.5, "market_informed": 0.0, "line": None}
    games[1]["market_informed"]["tip_off_home"] = 0.5
    calls = h2h.record_of_calls(games)
    assert calls["original"] == 3.5 and calls["market_informed"] == 3.0
    assert calls["line"] == {"games": 3, "right": 3.0}
    assert calls["toss_ups"] == 1
    assert calls["toss_ups_by_model"] == {"original": 0, "market_informed": 1}


def test_the_summary_reports_from_25_games_and_says_it_is_too_early(serving):
    few = h2h.summarize([game(i, 100, 90, 0.45, 0.44) for i in range(24)], [])
    assert few["current"] is None and few["too_early_to_call"] is True
    some = h2h.summarize([game(i, 100, 90, 0.45, 0.44) for i in range(25)], [])
    assert some["current"]["games"] == 25 and some["too_early_to_call"] is True
    assert some["serving_model"]["model"] == "original"
    assert some["serving_model"]["registered_rule"]["model"] == "market_informed"


def test_only_games_tipping_after_the_freeze_with_a_seal_are_pending(serving, monkeypatch):
    scorecard = [
        {"game_id": "1", "prospective": True, "tip_off": "2026-11-12T00:00Z"},
        {"game_id": "2", "prospective": True, "tip_off": "2026-11-13T00:00Z"},
        {"game_id": "3", "prospective": False, "tip_off": "2026-11-13T00:00Z"},
        {"game_id": "4", "prospective": True, "tip_off": "2026-11-13T01:00Z"},
    ]
    monkeypatch.setattr(production, "scorecard_rows", lambda: scorecard)
    (serving / "scorecard").mkdir()
    (serving / "scorecard" / h2h.ROWS).write_text(json.dumps({"game_id": "4"}) + "\n")
    pending = h2h.pending_games({"frozen_at": "2026-11-12T17:00:42+00:00"})
    assert [r["game_id"] for r in pending] == ["2"]


def live_data() -> dict:
    data = summary()
    data["game"]["event_time"] = "2026-11-13T00:00Z"
    return data


@pytest.fixture
def live(monkeypatch):
    original = {
        "status": "ok",
        "model": {"version": "v2"},
        "captured_at": "2026-11-12T23:55:00+00:00",
        "points": ["original"],
        "swings": [],
    }
    monkeypatch.setattr(production, "game_probability", lambda game_id, data: dict(original))
    monkeypatch.setattr(production, "get_model", lambda: Echo())
    monkeypatch.setattr(
        production, "inputs_for", lambda *a: (record(8.0), "2026-11-12T23:55:00+00:00")
    )
    monkeypatch.setattr(h2h, "read_summary", lambda: None)
    return original


def test_live_leads_with_the_original_and_carries_the_market_line_beside_it(live):
    result = h2h.live_probability("501", live_data())
    assert result["serving"] == "original"
    assert result["model"] == {"version": "v2"} and result["points"] == ["original"]
    beside = result["market_informed"]
    assert beside["model"]["version"].startswith("courtlens-win-probability-v4")
    assert beside["market"]["mu4"] == 8.0 and beside["points"] != ["original"]


def test_live_has_no_market_line_for_a_game_sealed_before_the_freeze(live):
    live["captured_at"] = "2026-11-12T16:00:00+00:00"
    result = h2h.live_probability("501", live_data())
    assert result["serving"] == "original" and result["points"] == ["original"]
    assert "market_informed" not in result


def test_live_has_no_market_line_when_the_seal_has_no_line(live, monkeypatch):
    monkeypatch.setattr(
        production, "inputs_for", lambda *a: (record(None), "2026-11-12T23:55:00+00:00")
    )
    result = h2h.live_probability("501", live_data())
    assert result["points"] == ["original"] and "market_informed" not in result


def test_the_v4_drift_interval_is_committed_with_its_predictions():
    body = json.loads(Path(h2h.DRIFT_PATH).read_text())
    assert body["version"] == "courtlens-win-probability-v4"
    assert [w["games"] for w in body["by_window_games"]][:3] == [25, 50, 75]
    assert set(body["predictions"]) == {"2024-25", "2025-26"}


def test_protocol_notes_are_served_in_order():
    notes = h2h.protocol_notes()
    assert [n["kind"] for n in notes][:4] == [
        "seal_moved_to_vps",
        "seal_times_moved",
        "registered_parameter_deviation",
        "registered_serving_rule_deviation",
    ]


def test_a_namespace_is_not_a_model():
    # MarketModel only needs predict_home; anything else is passed through untouched.
    model = h2h.MarketModel(SimpleNamespace(predict_home=lambda s, g: np.array([g.mu])), 8.0, 0.5)
    assert model.predict_home(h2h.opening_state(), GameInputs(**INPUTS))[0] == 5.0
