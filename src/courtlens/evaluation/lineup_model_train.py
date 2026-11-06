"""PyTorch training for the lineup model (`courtlens-lineup-model-v1`, R14). CPU only (D12).

Backfitting, fixed in the registration: ROUNDS times, (1) solve the additive part exactly by
ridge on the stint margin minus the current interaction, then (2) run EPOCHS of Adam on the
interaction parameters with the additive part held fixed; a final ridge solve makes the additive
part exact for the final interaction. Adam never moves the player ratings, so the additive part
is always a true ridge solution and the model equals ridge when the interaction is zero.

Determinism: float32, `torch.use_deterministic_algorithms(True)`, a fixed thread count, every
random draw from generators seeded by the registered seed. Weights are exported as numpy arrays
and every published number is computed by `lineup_model_core.predict_lineup`.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Any

import numpy as np

from courtlens.evaluation.lineup_model_core import FFN_MULTIPLIER, HEADS, Encoded, Ridge, fit_ridge

THREADS = 2
ROUNDS = 2
EPOCHS = 6
BATCH = 2048
LEARNING_RATE = 2e-3
INIT_SCALE = 0.1


@dataclass(frozen=True)
class Config:
    dim: int
    penalty: float  # L2 on the interaction weights (per-possession loss units)

    def key(self) -> str:
        return f"d{self.dim}-l{self.penalty:g}"


def residual_encoded(e: Encoded, offset: np.ndarray) -> Encoded:
    return Encoded(e.slots, e.features, e.home, e.y - offset, e.w, e.game)


def _init(k: int, f: int, d: int, seed: int) -> dict[str, Any]:
    import torch

    g = torch.Generator().manual_seed(seed)

    def normal(*shape: int, scale: float) -> Any:
        return (torch.randn(*shape, generator=g, dtype=torch.float32) * scale).requires_grad_()

    hidden = FFN_MULTIPLIER * d
    return {
        "e_own": normal(k, d, scale=INIT_SCALE),
        "a": normal(f, d, scale=INIT_SCALE / math.sqrt(f)),
        "a0": torch.zeros(d, requires_grad=True),
        "side": normal(2, d, scale=INIT_SCALE),
        "wq": normal(d, d, scale=1 / math.sqrt(d)),
        "wk": normal(d, d, scale=1 / math.sqrt(d)),
        "wv": normal(d, d, scale=1 / math.sqrt(d)),
        "wo": normal(d, d, scale=1 / math.sqrt(d)),
        "w1": normal(d, hidden, scale=1 / math.sqrt(d)),
        "c1": torch.zeros(hidden, requires_grad=True),
        "w2": normal(hidden, d, scale=1 / math.sqrt(hidden)),
        "c2": torch.zeros(d, requires_grad=True),
        "w_out": normal(d, scale=0.01),
    }


PENALISED = ("e_own", "a", "side", "wq", "wk", "wv", "wo", "w1", "w2", "w_out")


def _one_way(first: Any, second: Any, p: dict[str, Any]) -> Any:
    import torch

    tokens = torch.cat([first + p["side"][0], second + p["side"][1]], dim=1)
    n, t, d = tokens.shape
    dh = d // HEADS

    def split(x: Any) -> Any:
        return x.reshape(n, t, HEADS, dh).transpose(1, 2)

    q, k, v = (split(tokens @ p[name]) for name in ("wq", "wk", "wv"))
    attention = torch.softmax(q @ k.transpose(-1, -2) / math.sqrt(dh), dim=-1)
    mixed = (attention @ v).transpose(1, 2).reshape(n, t, d)
    z = tokens + mixed @ p["wo"]
    z = z + torch.relu(z @ p["w1"] + p["c1"]) @ p["w2"] + p["c2"]
    return (z[:, :5].mean(dim=1) - z[:, 5:].mean(dim=1)) @ p["w_out"]


def torch_interaction(slots: Any, features: Any, p: dict[str, Any]) -> Any:
    import torch

    own = p["e_own"][slots.clamp(min=0)]
    box = features @ p["a"] + p["a0"]
    vec = torch.where((slots >= 0).unsqueeze(-1), own, box)
    home, away = vec[:, 0], vec[:, 1]
    return 0.5 * (_one_way(home, away, p) - _one_way(away, home, p))


def _interaction_numpy(e: Encoded, p: dict[str, Any], chunk: int = 16384) -> np.ndarray:
    import torch

    out = []
    with torch.no_grad():
        for start in range(0, len(e.y), chunk):
            slots = torch.from_numpy(e.slots[start : start + chunk].astype(np.int64))
            feats = torch.from_numpy(e.features[start : start + chunk].astype(np.float32))
            out.append(torch_interaction(slots, feats, p).double().numpy())
    return np.concatenate(out) if out else np.zeros(0)


def _ridge_target(e: Encoded, k: int, alpha: float, interaction: np.ndarray) -> Ridge:
    return fit_ridge(residual_encoded(e, interaction), k, alpha)


def train(
    e: Encoded, k: int, alpha: float, config: Config, seed: int, *, warm: Ridge | None = None
) -> tuple[dict[str, np.ndarray], dict[str, Any]]:
    """One seed's weights (numpy, float32) and training diagnostics."""
    import torch

    torch.set_num_threads(THREADS)
    torch.use_deterministic_algorithms(True)
    torch.manual_seed(seed)
    f = e.features.shape[-1]
    p = _init(k, f, config.dim, seed)
    order = torch.Generator().manual_seed(seed + 7919)
    slots = torch.from_numpy(e.slots.astype(np.int64))
    feats = torch.from_numpy(e.features.astype(np.float32))
    home = torch.from_numpy(e.home.astype(np.float32))
    y = torch.from_numpy(e.y.astype(np.float32))
    w = torch.from_numpy(e.w.astype(np.float32))
    n = len(e.y)
    total = float(e.w.sum())
    params = [p[name] for name in p]
    optimizer = torch.optim.Adam(params, lr=LEARNING_RATE)
    ridge = warm if warm is not None else fit_ridge(e, k, alpha)
    history = []
    for round_ in range(ROUNDS):
        if round_ > 0:
            ridge = _ridge_target(e, k, alpha, _interaction_numpy(e, p))
        b_own = torch.from_numpy(ridge.b_own.astype(np.float32))
        gamma = torch.from_numpy(ridge.gamma.astype(np.float32))
        own_b = b_own[slots.clamp(min=0)]
        box_b = feats @ gamma + float(ridge.gamma0)
        b = torch.where(slots >= 0, own_b, box_b)
        base = float(ridge.home) * home + b[:, 0].sum(dim=1) - b[:, 1].sum(dim=1)
        target = y - base
        for epoch in range(EPOCHS):
            perm = torch.randperm(n, generator=order)
            running = 0.0
            for start in range(0, n, BATCH):
                idx = perm[start : start + BATCH]
                pred = torch_interaction(slots[idx], feats[idx], p)
                data = (w[idx] * (target[idx] - pred) ** 2).sum() * (n / len(idx)) / total
                reg = sum((p[name] ** 2).sum() for name in PENALISED)
                loss = data + config.penalty * reg
                optimizer.zero_grad()
                loss.backward()
                optimizer.step()
                running += float(data.detach()) * len(idx) / n
            history.append({"round": round_, "epoch": epoch, "data_loss": running})
    final = _ridge_target(e, k, alpha, _interaction_numpy(e, p))
    weights = {name: p[name].detach().numpy().astype(np.float32).copy() for name in p}
    weights.update(
        {
            "b_own": final.b_own.astype(np.float32),
            "gamma": final.gamma.astype(np.float32),
            "gamma0": np.array(final.gamma0, dtype=np.float32),
            "home": np.array(final.home, dtype=np.float32),
        }
    )
    return weights, {"history": history, "seed": seed, "config": config.key()}


def check_parity(e: Encoded, weights: dict[str, np.ndarray]) -> float:
    """Largest |torch - numpy| interaction (per 100) on the given stints."""
    import torch

    from courtlens.evaluation.lineup_model_core import interaction

    p = {name: torch.from_numpy(np.asarray(v, dtype=np.float32)) for name, v in weights.items()}
    ours = interaction(e, {k: np.asarray(v, dtype=np.float64) for k, v in weights.items()})
    theirs = _interaction_numpy(e, p)
    return float(100 * np.max(np.abs(ours - theirs))) if len(ours) else 0.0
