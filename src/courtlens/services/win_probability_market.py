"""The Market-informed model's predict path (`courtlens-win-probability-v4`, candidate K1).

K1 is the frozen Original model (`courtlens-win-probability-v2`) with one change: its boosters,
baseline and end-game specialist read mu4 = own + w x (line - own) where they read the own
forecast. Every other input is the Original's. So the predict path is the Original's
`FrozenModel.predict_home` with `mu` replaced; nothing here loads or changes the Original's files.

`line` is the market's expected home margin: `-home_point` in training, `-spread` from ESPN when
serving (`win_probability_seal.line_from_odds`). No line means mu4 = own.

Until W3's freeze, `w` is passed in; the freeze manifest will fix it.
"""

from __future__ import annotations

import dataclasses
from typing import Protocol

import numpy as np

from courtlens.services.win_probability_serving import GameInputs, StateColumns


class HomeModel(Protocol):
    def predict_home(self, states: StateColumns, game: GameInputs) -> np.ndarray: ...


def market_mu(own: float, line: float | None, w: float) -> float:
    """mu4 for one game; the same rule as stage S, C and F (`win_probability_v4.with_market`)."""
    if not 0.0 <= w <= 1.0:
        raise ValueError("the line's weight must lie in 0..1")
    if line is None:
        return own
    return own + w * (line - own)


def market_inputs(inputs: GameInputs, line: float | None, w: float) -> GameInputs:
    """The Original's inputs with the pregame forecast moved toward the line."""
    return dataclasses.replace(inputs, mu=market_mu(inputs.mu, line, w))


def predict_home(
    model: HomeModel, states: StateColumns, inputs: GameInputs, line: float | None, w: float
) -> np.ndarray:
    """K1's home win probability at each state: the Original's model reading mu4."""
    return model.predict_home(states, market_inputs(inputs, line, w))
