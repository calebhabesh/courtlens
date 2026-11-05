"""courtlens-signal-noise-v1: split-half stabilization and beta-binomial shrinkage (Research R03).

Pure numerics, no I/O. The registration (evaluation/research/registrations/
courtlens-signal-noise-v1.json) fixes every rule used here.

- Split-half reliability with the Spearman-Brown prediction formula (Spearman 1910; Brown 1910),
  as used for sports stabilization points by Russell Carleton and, for the NBA, Darryl Blackport.
- Beta-binomial empirical Bayes after Efron and Morris (1975) and David Robinson's exposition.
"""

from __future__ import annotations

import math
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass
from typing import Any

import numpy as np
from numpy.typing import NDArray
from scipy import optimize, special, stats  # type: ignore[import-untyped]

REGISTRATION = "courtlens-signal-noise-v1"
SEED = 3003
SPLITS = 500
BINS = 8
MIN_VALID_GAMES = 10
MIN_PCT_SAMPLE = 10.0
MIN_MINUTES = 100.0
MIN_PLAYERS_PER_BIN = 100.0
LEVELS = (0.5, 0.7)
PRIOR_SEASONS_BACK = 3
CREDIBLE = 0.95
TS_DRAWS = 4000
BOOTSTRAP = 200
FTA_WEIGHT = 0.44
# Bounds of the beta-binomial optimiser (log scale); hitting one is recorded, never hidden.
LOG_PRIOR_BOUNDS = (math.log(1e-3), math.log(1e6))

Float = NDArray[np.float64]

# Box fields read per game (stats_json keys) and the short names used here.
FIELDS = {
    "fgm": "field_goals_made",
    "fga": "field_goals_attempted",
    "fg3m": "three_pointers_made",
    "fg3a": "three_pointers_attempted",
    "ftm": "free_throws_made",
    "fta": "free_throws_attempted",
    "oreb": "rebounds_offensive",
    "dreb": "rebounds_defensive",
    "reb": "rebounds_total",
    "ast": "assists",
    "stl": "steals",
    "blk": "blocks",
    "tov": "turnovers",
    "pf": "fouls_personal",
    "pts": "points",
}
COLUMNS = ("minutes", *FIELDS, "rim_fgm", "rim_fga")


@dataclass(frozen=True)
class StatDef:
    key: str
    label: str
    family: str  # "percentage" or "per_36"
    unit: str
    requires: tuple[str, ...]


PER_36 = (
    ("pts", "PTS"),
    ("reb", "REB"),
    ("oreb", "OREB"),
    ("dreb", "DREB"),
    ("ast", "AST"),
    ("stl", "STL"),
    ("blk", "BLK"),
    ("tov", "TOV"),
    ("pf", "PF"),
    ("fga", "FGA"),
    ("fg3a", "3PA"),
    ("fta", "FTA"),
)
STATS: tuple[StatDef, ...] = (
    StatDef("fg_pct", "FG%", "percentage", "FGA", ("fgm", "fga")),
    StatDef("fg2_pct", "2P%", "percentage", "2PA", ("fgm", "fga", "fg3m", "fg3a")),
    StatDef("fg3_pct", "3P%", "percentage", "3PA", ("fg3m", "fg3a")),
    StatDef("ft_pct", "FT%", "percentage", "FTA", ("ftm", "fta")),
    StatDef("efg_pct", "eFG%", "percentage", "FGA", ("fgm", "fg3m", "fga")),
    StatDef("ts_pct", "TS%", "percentage", "TSA", ("pts", "fga", "fta")),
    StatDef("ftr", "FTr", "percentage", "FGA", ("fta", "fga")),
    StatDef("rim_fg_pct", "Rim FG%", "percentage", "rim FGA", ("rim_fgm", "rim_fga")),
    *(
        StatDef(f"{key}_per_36", f"{label}/36", "per_36", "minutes", (key, "minutes"))
        for key, label in PER_36
    ),
)
STAT_KEYS = tuple(stat.key for stat in STATS)
# Binomial stats shrunk directly; TS% is composed from three of them.
BINOMIAL = {
    "fg3_pct": ("fg3m", "fg3a"),
    "ft_pct": ("ftm", "fta"),
    "fg2_pct": ("fg2m", "fg2a"),
    "rim_fg_pct": ("rim_fgm", "rim_fga"),
}


def stat_arrays(columns: Mapping[str, Float]) -> tuple[Float, Float, Float]:
    """Per-game numerator, sample and validity (games x stats).

    Validity is the Stats engine's joint rule: every field the stat reads is present (a missing
    field is unknown, never zero). An invalid game gives 0 and 0. Ratios of the sums give each
    stat exactly: TS% is PTS/2 over TSA, a per-36 rate is 36 x stat over minutes.
    """
    c = columns
    n = len(c["minutes"])
    numerator = np.zeros((n, len(STATS)))
    sample = np.zeros((n, len(STATS)))
    valid_games = np.zeros((n, len(STATS)))
    for index, stat in enumerate(STATS):
        valid = c["minutes"] > 0
        for field in stat.requires:
            valid = valid & ~np.isnan(c[field])
        num, den = _stat_parts(stat.key, c)
        numerator[:, index] = np.where(valid, num, 0.0)
        sample[:, index] = np.where(valid, den, 0.0)
        valid_games[:, index] = valid
    return numerator, sample, valid_games


def _stat_parts(key: str, c: Mapping[str, Float]) -> tuple[Float, Float]:
    parts: dict[str, tuple[Float, Float]] = {
        "fg_pct": (c["fgm"], c["fga"]),
        "fg2_pct": (c["fgm"] - c["fg3m"], c["fga"] - c["fg3a"]),
        "fg3_pct": (c["fg3m"], c["fg3a"]),
        "ft_pct": (c["ftm"], c["fta"]),
        "efg_pct": (c["fgm"] + 0.5 * c["fg3m"], c["fga"]),
        "ts_pct": (0.5 * c["pts"], c["fga"] + FTA_WEIGHT * c["fta"]),
        "ftr": (c["fta"], c["fga"]),
        "rim_fg_pct": (c["rim_fgm"], c["rim_fga"]),
    }
    if key in parts:
        return parts[key]
    return 36.0 * c[key.removesuffix("_per_36")], c["minutes"]


def split_masks(rng: np.random.Generator, games: int, splits: int = SPLITS) -> Float:
    """Half-A indicator (splits x games): the floor(n/2) games with the smallest uniform keys."""
    keys = rng.random((splits, games))
    order = np.argsort(keys, axis=1, kind="stable")
    mask = np.zeros((splits, games))
    rows = np.arange(splits)[:, None]
    mask[rows, order[:, : games // 2]] = 1.0
    return mask


def bin_edges(samples: Float, bins: int = BINS) -> Float:
    """Inner octile edges of the full-season sample (bins - 1 values)."""
    return np.quantile(samples, np.arange(1, bins) / bins)


def assign_bins(samples: Float, edges: Float) -> NDArray[np.int64]:
    return np.searchsorted(edges, samples, side="right").astype(np.int64)


def split_half_sums(
    half_num: Float, half_den: Float, total_num: Float, total_den: Float, weights: Float
) -> dict[str, Float]:
    """Weighted correlation terms per split (rows) and weight column.

    half_* are (players, splits); total_* (players,); weights (players, columns). A player counts
    in a split only when both halves have a positive sample.
    """
    other_num = total_num[:, None] - half_num
    other_den = total_den[:, None] - half_den
    valid = (half_den > 0) & (other_den > 1e-9)
    a = np.where(valid, half_num / np.where(valid, half_den, 1.0), 0.0)
    b = np.where(valid, other_num / np.where(valid, other_den, 1.0), 0.0)
    v = valid.astype(np.float64)
    h = np.where(valid, 0.5 * (half_den + other_den), 0.0)
    # (splits x players) @ (players x columns)
    return {
        "n": v.T @ weights,
        "a": a.T @ weights,
        "b": b.T @ weights,
        "aa": (a * a).T @ weights,
        "bb": (b * b).T @ weights,
        "ab": (a * b).T @ weights,
        "h": h.T @ weights,
    }


def correlations(terms: Mapping[str, Float]) -> Float:
    n, a, b = terms["n"], terms["a"], terms["b"]
    cov = n * terms["ab"] - a * b
    var_a = n * terms["aa"] - a * a
    var_b = n * terms["bb"] - b * b
    denom = np.sqrt(np.clip(var_a, 0, None) * np.clip(var_b, 0, None))
    with np.errstate(invalid="ignore", divide="ignore"):
        r = np.where(denom > 0, cov / np.where(denom > 0, denom, 1.0), np.nan)
    return np.asarray(r)


def fisher_mean(r: Float, axis: int = 0) -> Float:
    clipped = np.clip(r, -0.999999, 0.999999)
    return np.asarray(np.tanh(np.nanmean(np.arctanh(clipped), axis=axis)))


def spearman_brown_full(r: Float | float) -> Any:
    """Reliability of the doubled sample from the split-half correlation."""
    return 2 * np.asarray(r) / (1 + np.asarray(r))


def fit_m(r: Float, h: Float, w: Float) -> tuple[float, bool]:
    """Fit M in r = h/(h+M); returns (M, on_upper_bound)."""
    lower = math.log(1e-3 * float(np.min(h)))
    upper = math.log(1e3 * 2 * float(np.max(h)))
    grid = np.linspace(lower, upper, 2001)
    m = np.exp(grid)[:, None]
    loss = (w[None, :] * (r[None, :] - h[None, :] / (h[None, :] + m)) ** 2).sum(axis=1)
    best = int(np.argmin(loss))
    lo, hi = grid[max(best - 1, 0)], grid[min(best + 1, len(grid) - 1)]

    def objective(log_m: float) -> float:
        value = math.exp(log_m)
        return float((w * (r - h / (h + value)) ** 2).sum())

    if hi > lo:
        found = optimize.minimize_scalar(
            objective, bounds=(lo, hi), method="bounded", options={"xatol": 1e-10}
        )
        log_m = float(found.x)
    else:
        log_m = float(grid[best])
    return math.exp(log_m), best == len(grid) - 1 or log_m >= upper - 1e-6


def level_status(
    level: float,
    m: float,
    on_bound: bool,
    rho: Sequence[float],
    n: Sequence[float],
    r: Sequence[float],
) -> dict[str, Any]:
    """The registration's reached / not reached / inconsistent / no signal rule."""
    n_level = m * level / (1 - level)
    largest = max(n) if n else None
    if not rho or all(value <= 0 for value in r) or on_bound:
        return {"status": "no_signal", "n": None, "extrapolated": None, "largest_n": largest}
    reached_bin = any(value >= level for value in rho)
    if reached_bin and largest is not None and n_level <= largest:
        return {"status": "reached", "n": n_level, "extrapolated": None, "largest_n": largest}
    if not reached_bin:
        return {"status": "not_reached", "n": None, "extrapolated": n_level, "largest_n": largest}
    return {"status": "inconsistent", "n": n_level, "extrapolated": n_level, "largest_n": largest}


# ---- Beta-binomial empirical Bayes -------------------------------------------------------------


def fit_beta_binomial(makes: Float, attempts: Float) -> dict[str, Any]:
    """Maximum-likelihood Beta(alpha, beta) prior for player-season (makes, attempts).

    Profile likelihood over the strength alpha + beta (log scale): a coarse grid, then Brent's
    bounded search around the best grid point; for each strength the prior mean is optimised by
    a bounded search on its logit. The objective is the mean log-likelihood, so its scale does
    not grow with the number of player-seasons. A strength on the search bound is recorded.
    """
    keep = attempts >= 1
    m = makes[keep].astype(np.float64)
    a = attempts[keep].astype(np.float64)
    if len(a) == 0:
        raise ValueError("no player-seasons to fit a prior")
    pooled = float(m.sum() / a.sum())
    centre = float(special.logit(min(max(pooled, 1e-6), 1 - 1e-6)))

    def loss(logit_mean: float, strength: float) -> float:
        mean = float(special.expit(logit_mean))
        alpha, beta = mean * strength, (1 - mean) * strength
        return -float(
            (special.betaln(m + alpha, a - m + beta) - special.betaln(alpha, beta)).mean()
        )

    def inner(log_strength: float) -> tuple[float, float]:
        strength = math.exp(log_strength)
        found = optimize.minimize_scalar(
            lambda x: loss(x, strength),
            bounds=(centre - 4.0, centre + 4.0),
            method="bounded",
            options={"xatol": 1e-10, "maxiter": 500},
        )
        if not found.success:
            raise ValueError("beta-binomial prior mean search did not converge")
        return float(found.fun), float(found.x)

    low, high = LOG_PRIOR_BOUNDS
    grid = np.linspace(low, high, 61)
    values = [inner(float(x))[0] for x in grid]
    best = int(np.argmin(values))
    lo, hi = float(grid[max(best - 1, 0)]), float(grid[min(best + 1, len(grid) - 1)])
    outer = optimize.minimize_scalar(
        lambda x: inner(x)[0],
        bounds=(lo, hi),
        method="bounded",
        options={"xatol": 1e-9, "maxiter": 500},
    )
    if not outer.success:
        raise ValueError("beta-binomial prior strength search did not converge")
    log_strength = float(outer.x)
    _, logit_mean = inner(log_strength)
    mean = float(special.expit(logit_mean))
    strength = math.exp(log_strength)
    return {
        "alpha": mean * strength,
        "beta": (1 - mean) * strength,
        "mean": mean,
        "strength": strength,
        "player_seasons": len(a),
        "converged": True,
        "on_bound": bool(best in (0, len(grid) - 1) and abs(log_strength - grid[best]) < 0.2),
    }


def prior_window(target: str, available: Iterable[str]) -> list[str]:
    """The up-to-three regular seasons immediately before target that have data."""
    start = int(target[:4])
    wanted = {f"{year}-{(year + 1) % 100:02d}" for year in range(start - PRIOR_SEASONS_BACK, start)}
    return sorted(season for season in set(available) if season in wanted)


def posterior(makes: float, attempts: float, alpha: float, beta: float) -> dict[str, float | None]:
    if attempts <= 0:
        return {"value": None, "low": None, "high": None}
    a, b = alpha + makes, beta + attempts - makes
    tail = (1 - CREDIBLE) / 2
    return {
        "value": a / (a + b),
        "low": float(stats.beta.ppf(tail, a, b)),
        "high": float(stats.beta.ppf(1 - tail, a, b)),
    }


def shrunk_rate(makes: float, attempts: float, alpha: float, beta: float) -> float | None:
    return None if attempts <= 0 else (makes + alpha) / (attempts + alpha + beta)


def composed_ts(
    fg2a: float, fg3a: float, fta: float, p2: float | None, p3: float | None, pft: float | None
) -> float | None:
    """TS% from component percentages and the player's own attempt mix."""
    tsa = fg2a + fg3a + FTA_WEIGHT * fta
    if tsa <= 0:
        return None
    points = 0.0
    for attempts, rate, value in ((fg2a, p2, 2.0), (fg3a, p3, 3.0), (fta, pft, 1.0)):
        if attempts > 0:
            if rate is None:
                return None
            points += value * attempts * rate
    return points / (2 * tsa)


def composed_ts_interval(
    totals: Mapping[str, float], priors: Mapping[str, Mapping[str, float]], seed: int = SEED
) -> dict[str, float | None]:
    """Shrunk TS% with a 95% interval from joint draws of the three component posteriors."""
    fg2a, fg3a, fta = totals["fg2a"], totals["fg3a"], totals["fta"]
    components = (("fg2_pct", "fg2m", fg2a), ("fg3_pct", "fg3m", fg3a), ("ft_pct", "ftm", fta))
    means: dict[str, float | None] = {}
    for key, made, attempts in components:
        prior = priors.get(key)
        means[key] = (
            None
            if prior is None
            else shrunk_rate(totals[made], attempts, prior["alpha"], prior["beta"])
        )
        if attempts > 0 and prior is None:
            return {"value": None, "low": None, "high": None}
    value = composed_ts(fg2a, fg3a, fta, means["fg2_pct"], means["fg3_pct"], means["ft_pct"])
    if value is None:
        return {"value": None, "low": None, "high": None}
    rng = np.random.default_rng(seed)
    draws = {}
    for key, made, attempts in components:
        prior = priors.get(key)
        if attempts > 0 and prior is not None:
            draws[key] = rng.beta(
                prior["alpha"] + totals[made], prior["beta"] + attempts - totals[made], TS_DRAWS
            )
        else:
            draws[key] = np.zeros(TS_DRAWS)
    tsa = fg2a + fg3a + FTA_WEIGHT * fta
    sampled = (
        2 * fg2a * draws["fg2_pct"] + 3 * fg3a * draws["fg3_pct"] + fta * draws["ft_pct"]
    ) / (2 * tsa)
    tail = (1 - CREDIBLE) / 2 * 100
    return {
        "value": value,
        "low": float(np.percentile(sampled, tail)),
        "high": float(np.percentile(sampled, 100 - tail)),
    }
