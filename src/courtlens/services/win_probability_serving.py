"""Inference for the frozen win-probability model (R15b): CPU, one game at a time.

The feature rules are those of `evaluation.win_probability_models.Season.view` and the prediction
rules those of `predict_side`, `specialist_side`, `blend` and `symmetric`, written for one game
without the season files. `tests/unit/test_win_probability_serving.py` holds them equal, and the
R15b parity run reproduces the saved test-season predictions through this module.
"""

from __future__ import annotations

import hashlib
import json
import math
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np

from courtlens.domain.win_probability_state import (
    COLUMNS,
    REGULATION_SECONDS,
    Replay,
    period_at,
    state_rows,
)

MANIFEST_SCHEMA = "courtlens-win-probability-frozen-v1"
REMAINDER = 12
SPECIALIST_SECONDS = 120.0
SHRINK_DEFAULT = 0.7
INFERENCE_THREADS = 1


@dataclass(frozen=True)
class GameInputs:
    """What the model knows before tip-off, home minus away where that applies."""

    mu: float
    form: float
    strength: float
    rest: float
    b2b_home: float
    b2b_away: float
    games7: float
    travel_home: float
    travel_away: float
    neutral: float
    denver: float
    utah: float


@dataclass(frozen=True)
class StateColumns:
    """Replayed game state at each sampled time, from the home side."""

    time: np.ndarray
    period: np.ndarray
    columns: dict[str, np.ndarray]

    def __len__(self) -> int:
        return len(self.time)


def sampled_states(game: Replay, up_to: float | None = None) -> StateColumns:
    """The registered sample, optionally stopped at the latest event of a game in progress.

    Values pass through float32 because the training state files store float32.
    """
    times, rows = state_rows(game)
    if up_to is not None:
        keep = times <= up_to
        times, rows = times[keep], rows[keep]
    state = game.state[rows].astype(np.float32).astype(np.float64)
    columns = {name: state[:, i] for i, name in enumerate(COLUMNS)}
    return StateColumns(
        times.astype(np.float32).astype(np.float64),
        period_at(times),
        columns,
    )


def _features(
    names: tuple[str, ...], sign: float, states: StateColumns, game: GameInputs
) -> np.ndarray:
    c = states.columns
    own = sign > 0

    def pick(name: str, other: bool = False) -> np.ndarray:
        side = "home" if own != other else "away"
        result: np.ndarray = c[f"{name}_{side}"]
        return result

    period = states.period
    ends = np.where(period <= 4, REGULATION_SECONDS, REGULATION_SECONDS + (period - 4) * 300.0)
    left = ends - states.time
    fraction = np.maximum(left, 1.0) / REGULATION_SECONDS
    margin = c["home_score"] - c["away_score"]
    size = len(left)

    def constant(value: float) -> np.ndarray:
        return np.full(size, value, dtype=np.float64)

    mu = sign * game.mu
    builders: dict[str, Any] = {
        "margin": lambda: sign * margin,
        "seconds_left": lambda: left,
        "fraction": lambda: fraction,
        "overtime": lambda: (period > 4).astype(float),
        "mu": lambda: constant(mu),
        "mu_fraction": lambda: mu * fraction,
        "possession": lambda: sign * c["possession"],
        "pending_own": lambda: pick("ft_pending"),
        "pending_opp": lambda: pick("ft_pending", other=True),
        "timeouts_own": lambda: pick("timeouts"),
        "timeouts_opp": lambda: pick("timeouts", other=True),
        "fouls_own": lambda: pick("fouls"),
        "fouls_opp": lambda: pick("fouls", other=True),
        "bonus_own": lambda: pick("bonus"),
        "bonus_opp": lambda: pick("bonus", other=True),
        "possession_age": lambda: states.time - c["possession_start"],
        "home": lambda: constant(sign * (1 - game.neutral)),
        "strength": lambda: constant(sign * game.strength),
        "form": lambda: constant(sign * game.form),
        "rest": lambda: constant(sign * game.rest),
        "b2b_own": lambda: constant(game.b2b_home if own else game.b2b_away),
        "b2b_opp": lambda: constant(game.b2b_away if own else game.b2b_home),
        "games7": lambda: constant(sign * game.games7),
        "travel_own": lambda: constant(game.travel_home if own else game.travel_away),
        "travel_opp": lambda: constant(game.travel_away if own else game.travel_home),
        "denver": lambda: constant(sign * game.denver),
        "utah": lambda: constant(sign * game.utah),
    }
    return np.column_stack([builders[n]() for n in names]).astype(np.float32)


class FrozenModel:
    """The three boosters and their fixed parameters; hashes are checked at load."""

    def __init__(self, manifest: dict[str, Any], directory: Path) -> None:
        import lightgbm as lgb

        self.manifest = manifest
        self.main_features = tuple(manifest["main_features"])
        self.end_features = tuple(manifest["end_game_features"])
        self.beta = float(manifest["baseline"]["beta"])
        self.sigma = float(manifest["baseline"]["sigma"])
        self.slope = float(manifest["overtime_slope"])
        self.shrink = float(manifest["mean_start_shrink"])
        self.boosters = {}
        for role in ("mean", "variance", "end_game"):
            digest = manifest["models"][role]
            text = (directory / f"{digest}.txt").read_text()
            if hashlib.sha256(text.encode()).hexdigest() != digest:
                raise ValueError(f"frozen {role} model does not match its hash")
            self.boosters[role] = lgb.Booster(model_str=text)

    @property
    def hash(self) -> str:
        return str(self.manifest["manifest_sha256"])

    def _side(self, states: StateColumns, game: GameInputs, sign: float) -> np.ndarray:
        from scipy.special import expit  # type: ignore[import-untyped]
        from scipy.stats import norm  # type: ignore[import-untyped]

        x = _features(self.main_features, sign, states, game)
        margin = states.columns["home_score"] - states.columns["away_score"]
        period = states.period
        ends = np.where(period <= 4, REGULATION_SECONDS, REGULATION_SECONDS + (period - 4) * 300.0)
        left = ends - states.time
        fraction = np.maximum(left, 1.0) / REGULATION_SECONDS
        mean = sign * margin + self.beta * sign * game.mu * fraction
        log_variance = 2 * math.log(self.sigma) + np.log(fraction)
        mean = self.shrink * mean + self.boosters["mean"].predict(x, num_threads=INFERENCE_THREADS)
        log_variance = log_variance + self.boosters["variance"].predict(
            x, raw_score=True, num_threads=INFERENCE_THREADS
        )
        tie = float(expit(self.slope * sign * game.mu))
        sd = np.exp(0.5 * log_variance)
        above = norm.sf((0.5 - mean) / sd)
        tied = norm.cdf((0.5 - mean) / sd) - norm.cdf((-0.5 - mean) / sd)
        result: np.ndarray = above + tied * tie
        return result

    def _end_game(self, states: StateColumns, game: GameInputs, sign: float) -> np.ndarray:
        from scipy.special import expit

        period = states.period
        ends = np.where(period <= 4, REGULATION_SECONDS, REGULATION_SECONDS + (period - 4) * 300.0)
        left = ends - states.time
        mask = (period >= 4) & (left <= SPECIALIST_SECONDS)
        result: np.ndarray = np.full(len(left), np.nan)
        if not mask.any():
            return result
        x = _features(self.end_features, sign, states, game)[mask]
        probabilities = self.boosters["end_game"].predict(x, num_threads=INFERENCE_THREADS)
        margin = (sign * (states.columns["home_score"] - states.columns["away_score"]))[mask]
        tie = float(expit(self.slope * sign * game.mu))
        remainder = np.arange(-REMAINDER, REMAINDER + 1)
        final = margin[:, None] + remainder[None, :]
        result[mask] = (probabilities * (final > 0)).sum(axis=1) + (
            probabilities * (final == 0)
        ).sum(axis=1) * tie
        return result

    def predict_home(self, states: StateColumns, game: GameInputs) -> np.ndarray:
        """Home win probability at each state; the two teams' views are averaged, as registered."""
        if not len(states):
            return np.zeros(0)
        main = 0.5 * (self._side(states, game, 1.0) + 1 - self._side(states, game, -1.0))
        special = 0.5 * (self._end_game(states, game, 1.0) + 1 - self._end_game(states, game, -1.0))
        period = states.period
        ends = np.where(period <= 4, REGULATION_SECONDS, REGULATION_SECONDS + (period - 4) * 300.0)
        left = ends - states.time
        mask = (period >= 4) & (left <= SPECIALIST_SECONDS)
        weight = np.clip(1 - left / SPECIALIST_SECONDS, 0.0, 1.0)
        result: np.ndarray = np.asarray(main).copy()
        result[mask] = (1 - weight[mask]) * main[mask] + weight[mask] * special[mask]
        return result


def manifest_hash(body: dict[str, Any]) -> str:
    content = {k: v for k, v in body.items() if k != "manifest_sha256"}
    return hashlib.sha256(json.dumps(content, sort_keys=True).encode()).hexdigest()
