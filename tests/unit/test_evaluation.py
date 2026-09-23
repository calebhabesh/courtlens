from __future__ import annotations

import math
from datetime import date

from courtload.evaluation.artifacts import write_once
from courtload.evaluation.baselines import available_history_mean, ewma, last_n_mean
from courtload.evaluation.config import load_config
from courtload.evaluation.features import PlayerGame, feature_hash, player_features
from courtload.evaluation.splits import cutoff_utc, is_purged, split_for_target

CONFIG = load_config(__import__("pathlib").Path("evaluation/config/baseline-v1.yaml"))


def game(day: int, points: float, *, season: str = "2022-23") -> PlayerGame:
    return PlayerGame(
        game_id=str(day),
        player_id="p1",
        team_id="A",
        opponent_id="B",
        game_date=date(2022, 10, day),
        season=season,
        appearance="appeared",
        minutes_seconds=1800,
        reference_points=points,
        field_goal_attempts=10,
        free_throw_attempts=4,
    )


def test_frozen_baseline_formulas_and_minimum_history() -> None:
    values = [float(value) for value in range(1, 21)]

    assert last_n_mean(values, window=10) == 15.5
    assert last_n_mean(values[:9], window=10) is None
    assert available_history_mean(values[:5], minimum=5, maximum=9) == 3
    assert available_history_mean(values[:4], minimum=5, maximum=9) is None
    expected = sum(value * 2 ** (-age / 5) for age, value in enumerate(reversed(values))) / sum(
        2 ** (-age / 5) for age in range(20)
    )
    assert math.isclose(ewma(values, window=20, half_life=5) or 0, expected)


def test_features_exclude_same_day_future_and_reset_by_supplied_season_history() -> None:
    history = [game(day, float(day)) for day in range(1, 13)]
    before, points_before = player_features(history, date(2022, 10, 12))
    mutated_target = [*history[:-1], game(12, 999)]
    after_target_mutation, points_after = player_features(mutated_target, date(2022, 10, 12))

    assert before == after_target_mutation
    assert points_before == points_after
    assert feature_hash(before) == feature_hash(after_target_mutation)

    changed_history = [history[0], game(2, 999), *history[2:]]
    changed, _ = player_features(changed_history, date(2022, 10, 12))
    assert feature_hash(before) != feature_hash(changed)

    other_season = [game(day, 500, season="2021-22") for day in range(1, 11)]
    current_features, current_points = player_features(history, date(2022, 10, 12))
    assert player_features(other_season, date(2022, 10, 12))[1] != current_points
    assert current_features["valid_history_count_capped_50"] == 11


def test_grouped_calendar_assignment_purging_and_dst_cutoff() -> None:
    assert split_for_target(CONFIG, "2022-23", date(2022, 12, 15)) == "v2"
    assert is_purged(CONFIG, "v2", date(2022, 12, 14))
    assert not is_purged(CONFIG, "v2", date(2022, 12, 15))
    assert cutoff_utc(date(2023, 3, 11)).hour == 5
    assert cutoff_utc(date(2023, 3, 13)).hour == 4


def test_immutable_artifact_write_allows_only_identical_content(tmp_path) -> None:
    target = tmp_path / "predictions.jsonl"
    original_hash = write_once(target, b"one\n")
    assert write_once(target, b"one\n") == original_hash

    try:
        write_once(target, b"two\n")
    except RuntimeError as error:
        assert "refusing to overwrite" in str(error)
    else:
        raise AssertionError("changed immutable artifact was overwritten")
