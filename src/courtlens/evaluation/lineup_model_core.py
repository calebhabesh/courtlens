"""Lineup model and ridge baseline in plain numpy (`courtlens-lineup-model-v1`, R14).

Training uses PyTorch (`lineup_model_train`), but every number this block publishes, and every
prediction the API serves, comes from the numpy forward pass here, so serving needs no PyTorch
and a test proves the two passes agree.

Both models predict a stint's home margin per 100 possessions from the same inputs:

- players with at least MIN_POSSESSIONS on court in the training window have their own
  parameters; everyone else reads a box-score fallback (`lineup_model_data.make_window`);
- a home term (zero at neutral sites).

**Ridge** (the baseline, RAPM on stint margins): home + sum of home players' ratings - sum of
away players' ratings, with a fallback player's rating = gamma . features + gamma0. Weighted by
possessions, penalised by alpha (players and the fallback map; home unpenalised).

**Lineup model**: the same additive part (initialised at ridge and kept under ridge's penalty)
plus an interaction term. Each player has a vector e (own, or A . features + a0 on the
fallback). The ten vectors, tagged home or away, pass through one multi-head self-attention
layer and a small feed-forward layer (both residual); the interaction is w . (mean of home
tokens - mean of away tokens), antisymmetrised by swapping the sides, so swapping the two fives
negates the prediction apart from the home term.
"""

from __future__ import annotations

import math
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import Any

import numpy as np

from courtlens.evaluation.lineup_model_data import Stints, Window

HEADS = 2
FFN_MULTIPLIER = 2
LEVEL = 0.95
REPLICATES = 2000


# ---------------------------------------------------------------------------------------------
# Inputs shared by both models.


@dataclass
class Encoded:
    """Stints mapped to a window's parameters."""

    slots: np.ndarray  # [n, 2, 5] own-parameter index, -1 on the fallback
    features: np.ndarray  # [n, 2, 5, F] standardized fallback features (zeros for own players)
    home: np.ndarray  # [n] 1, or 0 at a neutral site
    y: np.ndarray  # [n] home margin per possession (per-100 / 100)
    w: np.ndarray  # [n] mean possessions
    game: np.ndarray  # [n] global game index


def own_index(window: Window, players: int) -> np.ndarray:
    index = np.full(players, -1, dtype=np.int64)
    index[window.own] = np.arange(len(window.own))
    return index


def encode(s: Stints, idx: np.ndarray, window: Window) -> Encoded:
    sub = s.take(idx)
    margin, weight = sub.target()
    slots = own_index(window, len(s.players))[sub.lineups]
    return Encoded(
        slots,
        window.features[sub.lineups],
        (~sub.neutral).astype(np.float64),
        margin / 100,
        weight,
        sub.game,
    )


# ---------------------------------------------------------------------------------------------
# Ridge baseline.


@dataclass
class Ridge:
    alpha: float
    b_own: np.ndarray  # [K]
    gamma: np.ndarray  # [F]
    gamma0: float
    home: float


def ridge_design(e: Encoded, k: int) -> tuple[np.ndarray, np.ndarray]:
    """Dense normal-equation pieces: X^T W X and X^T W y, columns [K own | F | count | home]."""
    from scipy.sparse import csr_matrix, hstack  # type: ignore[import-untyped]

    n = len(e.y)
    sign = np.array([1.0, -1.0])[None, :, None]  # home +, away -
    rows = np.repeat(np.arange(n), 10)
    slots = e.slots.reshape(n, 10)
    signs = np.broadcast_to(sign, (n, 2, 5)).reshape(n, 10)
    own = slots >= 0
    x_own = csr_matrix((signs[own], (rows[own.reshape(-1)], slots[own])), shape=(n, k))
    fallback = (e.slots < 0).astype(np.float64) * sign
    x_box = np.einsum("nsp,nspf->nf", fallback, e.features)
    x_count = fallback.sum(axis=(1, 2))
    x = hstack([x_own, csr_matrix(np.column_stack([x_box, x_count, e.home]))]).tocsr()
    xw = x.multiply(e.w[:, None]).tocsr()
    return np.asarray((xw.T @ x).toarray()), np.asarray(xw.T @ e.y)


def fit_ridge(e: Encoded, k: int, alpha: float) -> Ridge:
    gram, rhs = ridge_design(e, k)
    f = e.features.shape[-1]
    penalty = np.full(gram.shape[0], alpha)
    penalty[-1] = 0.0  # home unpenalised
    beta = np.linalg.solve(gram + np.diag(penalty), rhs)
    return Ridge(alpha, beta[:k], beta[k : k + f], float(beta[k + f]), float(beta[-1]))


def additive(e: Encoded, b_own: np.ndarray, gamma: np.ndarray, gamma0: float) -> np.ndarray:
    """Per-player additive ratings [n, 2, 5] (per possession)."""
    own_b = b_own[np.maximum(e.slots, 0)]
    box_b = e.features @ gamma + gamma0
    return np.asarray(np.where(e.slots >= 0, own_b, box_b))


def predict_ridge(model: Ridge, e: Encoded) -> np.ndarray:
    """Home margin per 100."""
    b = additive(e, model.b_own, model.gamma, model.gamma0)
    return np.asarray(100 * (model.home * e.home + b[:, 0].sum(axis=1) - b[:, 1].sum(axis=1)))


# ---------------------------------------------------------------------------------------------
# Lineup model: numpy forward pass from exported weights.

WEIGHT_NAMES = (
    "b_own",
    "gamma",
    "gamma0",
    "home",
    "e_own",
    "a",
    "a0",
    "side",
    "wq",
    "wk",
    "wv",
    "wo",
    "w1",
    "c1",
    "w2",
    "c2",
    "w_out",
)


def embeddings(e: Encoded, w: Mapping[str, np.ndarray]) -> np.ndarray:
    """Per-player vectors [n, 2, 5, d]."""
    own = w["e_own"][np.maximum(e.slots, 0)]
    box = e.features @ w["a"] + w["a0"]
    return np.asarray(np.where((e.slots >= 0)[..., None], own, box))


def _softmax(x: np.ndarray) -> np.ndarray:
    z = x - x.max(axis=-1, keepdims=True)
    ez = np.exp(z)
    return np.asarray(ez / ez.sum(axis=-1, keepdims=True))


def interaction_one_way(first: np.ndarray, second: np.ndarray, w: Mapping[str, np.ndarray]) -> Any:
    """w . (mean token of `first` - mean token of `second`) after attention, `first` tagged home."""
    tokens = np.concatenate([first + w["side"][0], second + w["side"][1]], axis=1)  # [n, 10, d]
    n, t, d = tokens.shape
    h = HEADS
    dh = d // h

    def split(x: np.ndarray) -> np.ndarray:
        return x.reshape(n, t, h, dh).transpose(0, 2, 1, 3)

    q, k, v = (split(tokens @ w[name]) for name in ("wq", "wk", "wv"))
    attention = _softmax(q @ k.transpose(0, 1, 3, 2) / math.sqrt(dh))
    mixed = (attention @ v).transpose(0, 2, 1, 3).reshape(n, t, d)
    z = tokens + mixed @ w["wo"]
    z = z + np.maximum(z @ w["w1"] + w["c1"], 0.0) @ w["w2"] + w["c2"]
    return (z[:, :5].mean(axis=1) - z[:, 5:].mean(axis=1)) @ w["w_out"]


def interaction(e: Encoded, w: Mapping[str, np.ndarray]) -> np.ndarray:
    """Antisymmetrised interaction (per possession)."""
    vec = embeddings(e, w)
    home, away = vec[:, 0], vec[:, 1]
    return np.asarray(
        0.5 * (interaction_one_way(home, away, w) - interaction_one_way(away, home, w))
    )


def predict_lineup(w: Mapping[str, np.ndarray], e: Encoded, chunk: int = 8192) -> np.ndarray:
    """Home margin per 100 for one seed's weights (float64 arithmetic)."""
    w64 = {k: np.asarray(v, dtype=np.float64) for k, v in w.items()}
    out = np.empty(len(e.y))
    for start in range(0, len(e.y), chunk):
        part = take_encoded(e, slice(start, start + chunk))
        b = additive(part, w64["b_own"], w64["gamma"], float(w64["gamma0"]))
        out[start : start + chunk] = 100 * (
            float(w64["home"]) * part.home
            + b[:, 0].sum(axis=1)
            - b[:, 1].sum(axis=1)
            + interaction(part, w64)
        )
    return out


def predict_ensemble(seeds: Sequence[Mapping[str, np.ndarray]], e: Encoded) -> np.ndarray:
    return np.asarray(np.mean([predict_lineup(w, e) for w in seeds], axis=0))


def take_encoded(e: Encoded, idx: Any) -> Encoded:
    return Encoded(e.slots[idx], e.features[idx], e.home[idx], e.y[idx], e.w[idx], e.game[idx])


# ---------------------------------------------------------------------------------------------
# Scoring: possession-weighted stint margin error with a paired game bootstrap.


def game_sums(e: Encoded, prediction: np.ndarray, games: np.ndarray) -> np.ndarray:
    """Per game (in `games` order): sum of w x squared error (per 100)."""
    sq = e.w * (100 * e.y - prediction) ** 2
    position = np.searchsorted(games, e.game)
    out = np.zeros(len(games))
    np.add.at(out, position, sq)
    return out


def game_weights(e: Encoded, games: np.ndarray) -> np.ndarray:
    out = np.zeros(len(games))
    np.add.at(out, np.searchsorted(games, e.game), e.w)
    return out


def resample_counts(n: int, seed: int, year: int, replicates: int = REPLICATES) -> np.ndarray:
    rng = np.random.default_rng(np.random.SeedSequence([seed, year]))
    picks = rng.integers(0, n, size=(replicates, n))
    counts = np.zeros((replicates, n))
    np.add.at(counts, (np.repeat(np.arange(replicates), n), picks.reshape(-1)), 1.0)
    return counts


def wrmse(sums: np.ndarray, weights: np.ndarray) -> float:
    return float(math.sqrt(sums.sum() / weights.sum()))


def interval(values: np.ndarray) -> dict[str, float]:
    tail = (1 - LEVEL) / 2
    return {"low": float(np.quantile(values, tail)), "high": float(np.quantile(values, 1 - tail))}


def verdict(pooled: Mapping[str, float], season_gains: Sequence[float]) -> str:
    """Registered rule: the lineup model is better only if the pooled 95% interval of
    (ridge WRMSE - lineup WRMSE) lies above zero AND it has the lower WRMSE in more than half of
    the test seasons; ridge is better under the mirror rule; otherwise no difference."""
    wins = sum(g > 0 for g in season_gains)
    losses = sum(g < 0 for g in season_gains)
    half = len(season_gains) / 2
    if pooled["low"] > 0 and wins > half:
        return "lineup_better"
    if pooled["high"] < 0 and losses > half:
        return "ridge_better"
    return "no_difference"
