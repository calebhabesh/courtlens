"""The frozen model's serving rules: same features as training, hashes checked, no leaks (R15b)."""

import hashlib
import json
from datetime import UTC, datetime
from pathlib import Path
from types import SimpleNamespace

import numpy as np
import pytest

from courtlens.domain.win_probability_state import COLUMNS, GRID_SECONDS, Replay
from courtlens.evaluation import win_probability_models as training
from courtlens.services import win_probability_production as production
from courtlens.services.win_probability_serving import (
    FrozenModel,
    GameInputs,
    StateColumns,
    _features,
    manifest_hash,
    sampled_states,
)

GAME = GameInputs(
    mu=3.5,
    form=2.0,
    strength=1.25,
    rest=-1.0,
    b2b_home=1.0,
    b2b_away=0.0,
    games7=1.0,
    travel_home=0.4,
    travel_away=1.2,
    neutral=0.0,
    denver=1.0,
    utah=0.0,
)
ALL_FEATURES = tuple(training.GROUPS["base"]) + training.GROUPS["S1"] + training.GROUPS["S2"]


def random_states(size=200):
    rng = np.random.default_rng(1)
    time = np.sort(rng.uniform(0, 3100, size)).astype(np.float32).astype(np.float64)
    period = np.where(time < 2880, (time // 720).astype(int) + 1, 5)
    columns = {
        name: rng.integers(0, 30, size).astype(np.float32).astype(np.float64)
        for name in COLUMNS
        if name not in {"elapsed", "period"}
    }
    columns["possession"] = rng.integers(-1, 2, size).astype(np.float64)
    columns["possession_start"] = time - rng.uniform(0, 24, size)
    return StateColumns(time, period, columns)


def training_season(states):
    season = training.Season.__new__(training.Season)
    # `view` reads the S4 lineup columns eagerly; the frozen model has no S4 features.
    size = len(states)
    season.columns = {
        **states.columns,
        "current_home": np.zeros(size),
        "current_away": np.zeros(size),
    }
    season.time = states.time
    season.period = states.period
    ends = np.where(states.period <= 4, 2880.0, 2880.0 + (states.period - 4) * 300.0)
    season.left = ends - states.time
    season.fraction = np.maximum(season.left, 1.0) / 2880.0
    season.margin = states.columns["home_score"] - states.columns["away_score"]

    def fill(value):
        return np.full(size, value, dtype=np.float64)

    season.game = {
        training.MU_FULL: fill(GAME.mu),
        "form": fill(GAME.form),
        "neutral": fill(GAME.neutral),
        "strength": fill(GAME.strength),
        "rest": fill(GAME.rest),
        "b2b_home": fill(GAME.b2b_home),
        "b2b_away": fill(GAME.b2b_away),
        "games7": fill(GAME.games7),
        "travel_home": fill(GAME.travel_home),
        "travel_away": fill(GAME.travel_away),
        "denver": fill(GAME.denver),
        "utah": fill(GAME.utah),
    }
    return season


@pytest.mark.parametrize("sign", [1.0, -1.0])
def test_features_equal_the_training_view(sign):
    states = random_states()
    season = training_season(states)
    expected = season.view(np.full(len(states), sign), training.MU_FULL, ALL_FEATURES)
    assert np.array_equal(_features(ALL_FEATURES, sign, states, GAME), expected)


def test_a_changed_model_file_is_refused(tmp_path):
    digest = "a" * 64
    (tmp_path / f"{digest}.txt").write_text("tampered")
    manifest = {
        "main_features": [],
        "end_game_features": [],
        "baseline": {"beta": 1, "sigma": 1},
        "overtime_slope": 0,
        "mean_start_shrink": 0.7,
        "models": {"mean": digest, "variance": digest, "end_game": digest},
    }
    with pytest.raises(ValueError, match="does not match its hash"):
        FrozenModel(manifest, tmp_path)


def test_committed_manifest_is_intact_and_pins_what_the_model_reads():
    manifest = production.load_manifest()
    assert manifest_hash(manifest) == manifest["manifest_sha256"]
    assert manifest["registration"] == "courtlens-win-probability-v2"
    assert manifest["models"]["mean"].startswith("2b5c29aa")
    assert manifest["models"]["variance"].startswith("c6a7d990")
    assert manifest["models"]["end_game"].startswith("26bbd8a9")
    # Changing any of these changes the served model's inputs and needs a new version.
    for name, digest in manifest["espn_state_adapter"].items():
        assert hashlib.sha256(Path(name).read_bytes()).hexdigest() == digest
    rating_code = Path("src/courtlens/evaluation/impact_history_ratings.py")
    assert (
        hashlib.sha256(rating_code.read_bytes()).hexdigest()
        == (manifest["pregame"]["rating_code_sha256"])
    )
    assert "Projected Impact" in manifest["pregame"]["player_rating"]
    assert not {"rotation", "current", "run_120"} & set(manifest["main_features"])


def test_a_tampered_manifest_is_refused(tmp_path, monkeypatch):
    body = json.loads(production.MANIFEST_PATH.read_text())
    body["trained_through"] = "2025-26"
    path = tmp_path / "manifest.json"
    path.write_text(json.dumps(body))
    monkeypatch.setattr(production, "MANIFEST_PATH", path)
    with pytest.raises(ValueError, match="hash check"):
        production.load_manifest()


def test_a_game_in_progress_is_never_padded_with_future_states():
    state = np.zeros((2, len(COLUMNS)))
    state[:, 0] = [10.0, 40.0]
    state[:, 1] = 1
    states = sampled_states(Replay(state), up_to=40.0)
    assert states.time.max() <= 40.0
    assert len(states) == int(40 // GRID_SECONDS)


class Fixed:
    """Stands in for the boosters, which are git-ignored."""

    def predict_home(self, states, _):
        return np.linspace(0.6, 0.9, len(states))


def plays():
    def play(number, period, clock, kind, side, home, away, **extra):
        return {
            "id": str(number),
            "period": period,
            "clock": clock,
            "type": kind,
            "text": kind,
            "side": side,
            "shot": None,
            "scoring": False,
            "points_attempted": None,
            "player_source_id": extra.pop("player", "p1"),
            "home_score": home,
            "away_score": away,
            **extra,
        }

    return [
        play(1, 1, "11:00", "Jump Shot", "home", 2, 0, shot="field_goal", scoring=True),
        play(
            2, 1, "10:30", "Jump Shot", "away", 2, 2, shot="field_goal", scoring=True, player="p2"
        ),
        play(3, 4, "2:00", "Jump Shot", "home", 90, 88, shot="field_goal", scoring=True),
        play(4, 4, "1:00", "Substitution", "home", 90, 88),
        play(5, 4, "0.0", "End Game", None, 90, 88, player=None),
    ]


RECORD = {"inputs": vars(GAME), "availability": "tip_off_capture"}


def summary():
    return {
        "game": {
            "source_id": "401",
            "slate_date": "2026-11-05",
            "teams": [
                {"side": "home", "score": 90, "abbreviation": "BOS"},
                {"side": "away", "score": 88, "abbreviation": "NY"},
            ],
        },
        "plays": plays(),
        "win_probability": [{"play_id": "1", "home": 0.55}, {"play_id": "3", "home": 0.8}],
    }


def test_prospective_needs_a_capture_before_tip_off_and_a_game_after_the_freeze():
    frozen = "2026-11-04T22:00:00+00:00"
    after = production.score_game(Fixed(), summary(), RECORD, frozen, "2026-11-05T00:00Z")
    assert after["prospective"] is True
    before = production.score_game(Fixed(), summary(), RECORD, frozen, "2026-11-01T00:00Z")
    assert before["prospective"] is False
    hindsight = {**RECORD, "availability": "hindsight_box"}
    replay = production.score_game(Fixed(), summary(), hindsight, frozen, "2026-11-05T00:00Z")
    assert replay["prospective"] is False


def test_both_models_are_scored_only_on_states_with_a_matching_espn_score():
    row = production.score_game(Fixed(), summary(), RECORD, "2026-11-04", "2026-11-05T00:00Z")
    assert row["courtlens"]["log_loss"] > 0
    assert row["espn"] is not None
    assert 0 < row["espn"]["matched_share"] <= 1
    assert row["espn"]["courtlens_log_loss"] > 0


def test_inputs_sealed_after_tip_off_are_ignored(tmp_path, monkeypatch):
    settings = SimpleNamespace(win_probability_serving_dir=tmp_path)
    monkeypatch.setattr(production, "get_settings", lambda: settings)
    early = {"captured_at": "2026-11-04T13:30:00+00:00", "games": {"401": {"inputs": {"mu": 1}}}}
    late = {"captured_at": "2026-11-05T02:00:00+00:00", "games": {"401": {"inputs": {"mu": 2}}}}
    production._seal(tmp_path / "pregame", "2026-11-04", early)
    production._seal(tmp_path / "pregame", "2026-11-04", late)
    record, when = production.inputs_for("401", "2026-11-04", "2026-11-05T00:00Z")
    assert record["inputs"]["mu"] == 1 and when == early["captured_at"]
    assert production.inputs_for("999", "2026-11-04", "2026-11-05T00:00Z") is None


def test_a_changed_capture_is_skipped(tmp_path, monkeypatch):
    settings = SimpleNamespace(win_probability_serving_dir=tmp_path)
    monkeypatch.setattr(production, "get_settings", lambda: settings)
    path = production._seal(tmp_path / "pregame", "2026-11-04", {"captured_at": "x", "games": {}})
    path.write_text("{}")
    assert production.read_captures("2026-11-04") == []


def test_end_of_game_plays_are_not_scored_and_credit_skips_substitutions():
    series = production.event_series(Fixed(), plays(), RECORD)
    assert "5" not in {point["play_id"] for point in series}
    credit = production.player_credit(series, plays())
    assert set(credit) == {"p1", "p2"}
    assert credit["p1"]["events"] == 2
    # Only the fourth-quarter make is clutch: margin under five with 2:00 left.
    assert credit["p1"]["clutch_events"] == 1
    assert credit["p2"]["clutch_events"] == 0


def test_biggest_swings_come_back_in_game_order():
    series = [
        {"play_id": "1", "t": 10.0, "home": 0.5, "home_score": 0, "away_score": 0, "period": 1},
        {"play_id": "2", "t": 20.0, "home": 0.9, "home_score": 3, "away_score": 0, "period": 1},
        {"play_id": "3", "t": 30.0, "home": 0.1, "home_score": 3, "away_score": 2, "period": 1},
        {"play_id": "4", "t": 40.0, "home": 0.11, "home_score": 3, "away_score": 2, "period": 1},
    ]
    swings = production.biggest_swings(series, [{"id": str(i)} for i in range(1, 5)], 2)
    assert [s["play_id"] for s in swings] == ["2", "3"]
    assert swings[1]["delta_home"] == pytest.approx(-0.8)


def test_season_label():
    assert production.season_of("2026-11-04") == "2026-27"
    assert production.season_of("2027-03-01") == "2026-27"


def test_no_inputs_is_a_status_not_a_guess(tmp_path, monkeypatch):
    settings = SimpleNamespace(win_probability_serving_dir=tmp_path)
    monkeypatch.setattr(production, "get_settings", lambda: settings)
    data = {
        "game": {"slate_date": "2026-11-04", "event_time": datetime.now(UTC).isoformat()},
        "plays": [{"id": "1"}],
    }
    result = production.game_probability("401", data)
    assert result["status"] == "no_inputs"
    assert len(result["model"]["manifest_sha256"]) == 64
    assert production.game_probability("401", {"plays": []})["status"] == "no_plays"
