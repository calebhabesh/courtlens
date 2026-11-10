"""Rules for `courtlens-shot-aftermath-v1` (Research R17): zones, cell values, status and tone.

Registration: evaluation/research/registrations/courtlens-shot-aftermath-v1.json. Databallr's Shot
Aftermath page defines the views, the zones and the opponent-cost formula; CourtLens computes them
from its own sealed possessions. Every function here is pure: the runner sums counts per game and
cell, and these turn sums (one row per bootstrap replicate) into the served values.
"""

from __future__ import annotations

import math
from typing import Literal

import numpy as np

ZONES = ("rim", "short_mid", "long_mid", "three", "all")
# Base zones a shot can fall in; "unresolved" (a mid 2 with no distance) counts only in "all".
BASE_ZONES = ("rim", "short_mid", "long_mid", "three", "unresolved")
POSITIONS = ("all", "guards", "forwards", "bigs")
# Base groups a shooter can fall in; "unclassified" (no estimate) counts only in "all".
BASE_GROUPS = ("guards", "forwards", "bigs", "unclassified")
POSITION_GROUPS = {"PG": "guards", "SG": "guards", "SF": "forwards", "PF": "forwards", "C": "bigs"}
RIM_ACTION_WORDS = ("layup", "dunk", "tip", "alley oop", "putback", "finger roll")
RIM_MAX_FEET = 4
SHORT_MID_MAX_FEET = 14
THIN_ATTEMPTS = 100
THIN_POSSESSIONS = 50

# Per-game, per-base-cell sums. Order is the column order of the runner's arrays.
SUMS = (
    "attempts",
    "makes",
    "made_points",
    "oreb",
    "dreb",
    "miss_unknown",
    "second_points",
    "make_possessions",
    "make_points",
    "dreb_possessions",
    "dreb_points",
    "blocks",
    "and_ones",
    "make_censored",
    "make_same_team",
    "make_followed",
    "dreb_censored",
    "dreb_same_team",
)
S = {name: i for i, name in enumerate(SUMS)}

# Served values: the three views plus the parts they are made of.
VALUES = (
    "fg_pct",
    "made",
    "second_per_miss",
    "second",
    "own",
    "dreb_share",
    "ppp_make",
    "ppp_dreb",
    "cost",
    "net",
    "miss_cost",
    "miss_net",
    "dreb_cost",
)
COSTS = ("cost", "miss_cost", "dreb_cost")

Status = Literal["ok", "thin", "unknown"]
Tone = Literal["benefit", "cost"]


def zone(value: int, action_type: str, distance: float) -> str:
    """Databallr's zones: rim action labels first, then distance; threes by value."""
    if value == 3:
        return "three"
    text = action_type.lower()
    if any(word in text for word in RIM_ACTION_WORDS):
        return "rim"
    if not math.isfinite(distance):
        return "unresolved"
    if distance <= RIM_MAX_FEET:
        return "rim"
    if distance <= SHORT_MID_MAX_FEET:
        return "short_mid"
    return "long_mid"


def position_group(position: str | None) -> str:
    return POSITION_GROUPS.get(position or "", "unclassified")


def _ratio(num: np.ndarray, den: np.ndarray) -> np.ndarray:
    with np.errstate(divide="ignore", invalid="ignore"):
        return np.where(den > 0, num / np.where(den > 0, den, 1.0), np.nan)


def cell_values(sums: np.ndarray, league: np.ndarray) -> dict[str, np.ndarray]:
    """Values from sums shaped (..., len(SUMS)) and the league PPP broadcast to the leading shape.

    A value whose denominator is zero is NaN (unknown), never zero.
    """
    a, m = sums[..., S["attempts"]], sums[..., S["makes"]]
    o, d = sums[..., S["oreb"]], sums[..., S["dreb"]]
    fg = _ratio(m, a)
    made = _ratio(sums[..., S["made_points"]], a)
    sc = _ratio(sums[..., S["second_points"]], o + d)
    dshare = _ratio(d, o + d)
    ppp_make = _ratio(sums[..., S["make_points"]], sums[..., S["make_possessions"]])
    ppp_dreb = _ratio(sums[..., S["dreb_points"]], sums[..., S["dreb_possessions"]])
    second = (1.0 - fg) * sc
    own = made + second
    miss_cost = dshare * (ppp_dreb - league)
    cost = fg * (ppp_make - league) + (1.0 - fg) * miss_cost
    return {
        "fg_pct": fg,
        "made": made,
        "second_per_miss": sc,
        "second": second,
        "own": own,
        "dreb_share": dshare,
        "ppp_make": ppp_make,
        "ppp_dreb": ppp_dreb,
        "cost": cost,
        "net": own - cost,
        "miss_cost": miss_cost,
        "miss_net": sc - miss_cost,
        "dreb_cost": ppp_dreb - league,
    }


def identity_residual(values: dict[str, np.ndarray]) -> float:
    """Largest |own - (made + second)| and |net - (own - cost)| over finite entries."""
    parts = (
        values["own"] - (values["made"] + values["second"]),
        values["net"] - (values["own"] - values["cost"]),
        values["miss_net"] - (values["second_per_miss"] - values["miss_cost"]),
    )
    worst = 0.0
    for part in parts:
        finite = part[np.isfinite(part)]
        if finite.size:
            worst = max(worst, float(np.max(np.abs(finite))))
    return worst


def count_residual(sums: np.ndarray) -> float:
    """Largest gap in the count partitions (misses, makes, defensive rebounds)."""
    misses = sums[..., S["attempts"]] - sums[..., S["makes"]]
    gaps = (
        misses - (sums[..., S["oreb"]] + sums[..., S["dreb"]] + sums[..., S["miss_unknown"]]),
        sums[..., S["makes"]]
        - (
            sums[..., S["make_possessions"]]
            + sums[..., S["make_censored"]]
            + sums[..., S["make_same_team"]]
            + sums[..., S["make_followed"]]
        ),
        sums[..., S["dreb"]]
        - (
            sums[..., S["dreb_possessions"]]
            + sums[..., S["dreb_censored"]]
            + sums[..., S["dreb_same_team"]]
        ),
    )
    return max(float(np.max(np.abs(g))) if g.size else 0.0 for g in gaps)


def status(attempts: float, make_possessions: float, dreb_possessions: float) -> Status:
    if attempts <= 0:
        return "unknown"
    if attempts < THIN_ATTEMPTS or make_possessions + dreb_possessions < THIN_POSSESSIONS:
        return "thin"
    return "ok"


def tone(
    cell_status: Status, possessions: float, low: float | None, high: float | None
) -> Tone | None:
    """Green (benefit) or red (cost) only where the 95% interval excludes zero on an ok cell."""
    if cell_status != "ok" or possessions < THIN_POSSESSIONS or low is None or high is None:
        return None
    if high < 0:
        return "benefit"
    if low > 0:
        return "cost"
    return None
