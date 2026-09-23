"""Frozen baseline metrics, calibration and calendar-block uncertainty."""

from __future__ import annotations

import math
import random
from collections import defaultdict
from datetime import date, timedelta
from typing import Any


def regression_metrics(rows: list[dict[str, Any]], prediction_key: str) -> dict[str, Any]:
    paired = [
        row for row in rows if row.get("actual") is not None and row.get(prediction_key) is not None
    ]
    errors = [float(row[prediction_key]) - float(row["actual"]) for row in paired]
    by_player: dict[str, list[float]] = defaultdict(list)
    by_player_game: dict[str, list[float]] = defaultdict(list)
    for row, error in zip(paired, errors, strict=True):
        by_player[str(row["player_id"])].append(abs(error))
        by_player_game[f"{row['player_id']}:{row['target_game_id']}"].append(abs(error))
    return {
        "mae": math.fsum(abs(error) for error in errors) / len(errors) if errors else None,
        "rmse": math.sqrt(math.fsum(error * error for error in errors) / len(errors))
        if errors
        else None,
        "player_balanced_mae": (
            math.fsum(math.fsum(values) / len(values) for values in by_player.values())
            / len(by_player)
            if by_player
            else None
        ),
        "player_game_balanced_mae": (
            math.fsum(math.fsum(values) / len(values) for values in by_player_game.values())
            / len(by_player_game)
            if by_player_game
            else None
        ),
        "forecast_rows": len(paired),
        "unique_player_games": len(by_player_game),
        "players": len(by_player),
        "target_dates": len({row["target_game_date"] for row in paired}),
    }


def residual_quantile(
    rows: list[dict[str, Any]], prediction_key: str, coverage: float
) -> dict[str, Any]:
    residuals = sorted(
        abs(float(row[prediction_key]) - float(row["actual"]))
        for row in rows
        if row.get("actual") is not None and row.get(prediction_key) is not None
    )
    if not residuals:
        return {"rows": 0, "target_dates": 0, "absolute_residual_quantile": None}
    rank = min(len(residuals), math.ceil((len(residuals) + 1) * coverage))
    return {
        "rows": len(residuals),
        "target_dates": len(
            {row["target_game_date"] for row in rows if row.get("actual") is not None}
        ),
        "order_statistic_rank": rank,
        "absolute_residual_quantile": residuals[rank - 1],
    }


def moving_block_difference_interval(
    rows_by_fold: dict[str, list[dict[str, Any]]],
    *,
    left_key: str,
    right_key: str,
    ranges: dict[str, tuple[date, date]],
    replicates: int,
    block_days: int,
    seed: int,
) -> dict[str, Any]:
    """Bootstrap MAE(left)-MAE(right) by consecutive target-game calendar days."""
    randomizer = random.Random(seed)
    indexed: dict[str, tuple[list[date], dict[date, list[tuple[float, float]]]]] = {}
    for fold, rows in rows_by_fold.items():
        start, end = ranges[fold]
        calendar = [start + timedelta(days=offset) for offset in range((end - start).days + 1)]
        by_date: dict[date, list[tuple[float, float]]] = defaultdict(list)
        for row in rows:
            if row.get("actual") is None or row.get(left_key) is None or row.get(right_key) is None:
                continue
            actual = float(row["actual"])
            by_date[date.fromisoformat(str(row["target_game_date"]))].append(
                (abs(float(row[left_key]) - actual), abs(float(row[right_key]) - actual))
            )
        indexed[fold] = (calendar, by_date)

    estimates: list[float] = []
    for _ in range(replicates):
        left_errors: list[float] = []
        right_errors: list[float] = []
        for calendar, by_date in indexed.values():
            selected: list[date] = []
            while len(selected) < len(calendar):
                start_index = randomizer.randrange(len(calendar))
                selected.extend(
                    calendar[(start_index + offset) % len(calendar)] for offset in range(block_days)
                )
            for selected_date in selected[: len(calendar)]:
                for left_error, right_error in by_date.get(selected_date, []):
                    left_errors.append(left_error)
                    right_errors.append(right_error)
        if left_errors:
            estimates.append(
                math.fsum(left_errors) / len(left_errors)
                - math.fsum(right_errors) / len(right_errors)
            )
    estimates.sort()
    if not estimates:
        return {"replicates": 0, "lower": None, "upper": None}
    lower_index = max(0, math.ceil(0.025 * len(estimates)) - 1)
    upper_index = min(len(estimates) - 1, math.ceil(0.975 * len(estimates)) - 1)
    return {
        "estimand": f"{left_key}_MAE - {right_key}_MAE",
        "replicates": len(estimates),
        "block_calendar_days": block_days,
        "seed": seed,
        "lower": estimates[lower_index],
        "upper": estimates[upper_index],
    }
