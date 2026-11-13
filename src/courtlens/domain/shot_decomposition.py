"""Shooting-value decomposition (Research R06, `courtlens-shot-decomposition-v1`).

Pure rules, no I/O. Every shooting attempt on an R01 possession gets four values that add up
exactly: TS = SQ + MAKE + FT (Databallr's ShotQuality RAPM decomposition, rebuilt on CourtLens'
own expected-shot model instead of the paid ShotQuality feed).

- A field-goal attempt is one shot: TS = actual field-goal points, SQ = expected field-goal points
  (R05 model plus the season's additive shift), MAKE = TS - SQ, FT = 0.
- A free throw of a 2-shot or 3-shot trip is 1/n of a shot (the foul replaced a possession):
  TS = the shooter's expected FT value, SQ = avg_pts / n, FT = TS - SQ, MAKE = 0.
- Any other free throw (and-one, technical, flagrant, clear path, away-from-play and transition
  take fouls) replaced no possession: it is no shot, SQ = 0, FT = TS = expected FT value.
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping
from dataclasses import dataclass

TWO_SHOT = "two_shot"
THREE_SHOT = "three_shot"
AND_ONE = "and_one"
TECHNICAL = "technical"
FLAGRANT = "flagrant"
CLEAR_PATH = "clear_path"
ONE_SHOT_OTHER = "one_shot_other"
FGA = "fga"
FREE_THROW_KINDS = (TWO_SHOT, THREE_SHOT, AND_ONE, TECHNICAL, FLAGRANT, CLEAR_PATH, ONE_SHOT_OTHER)
KINDS = (FGA, *FREE_THROW_KINDS)
# Free throws per trip for the kinds whose foul replaced a possession; every other kind is 0 shots.
TRIP_SIZE = {TWO_SHOT: 2, THREE_SHOT: 3}


@dataclass(frozen=True)
class FreeThrow:
    action_number: int
    person_id: str
    team_id: str
    made: bool
    kind: str
    sub_type: str


def classify(sub_type: str, and_one: bool) -> str | None:
    """Trip kind from the PlayByPlayV3 subType; None when the text is not one we know."""
    text = sub_type.strip()
    if "Technical" in text:
        return TECHNICAL
    if "Flagrant" in text:
        return FLAGRANT
    if "Clear Path" in text:
        return CLEAR_PATH
    if text == "Free Throw 1 of 1":
        return AND_ONE if and_one else ONE_SHOT_OTHER
    if text in ("Free Throw 1 of 2", "Free Throw 2 of 2"):
        return TWO_SHOT
    if text in ("Free Throw 1 of 3", "Free Throw 2 of 3", "Free Throw 3 of 3"):
        return THREE_SHOT
    return None


def game_free_throws(rows: Iterable[Mapping[str, str]]) -> tuple[list[FreeThrow], list[str]]:
    """Every free throw of one game in PlayByPlayV3 order, classified, and unknown subTypes.

    A "Free Throw 1 of 1" is an and-one when a made field goal by the shooter's team has the same
    period and clock and has not already been paired with an and-one (the shooter may be a
    substitute for the fouled player). Misses are rows whose description starts with "MISS "
    (case and space matter: "Missi Free Throw" is Yves Missi making one).
    """
    unpaired: dict[tuple[str, str, str], int] = {}
    result: list[FreeThrow] = []
    unknown: list[str] = []
    for row in rows:
        kind = row.get("actionType", "").strip()
        moment = (row.get("teamId", ""), row.get("period", ""), row.get("clock", ""))
        if kind == "Made Shot":
            unpaired[moment] = unpaired.get(moment, 0) + 1
            continue
        if kind != "Free Throw":
            continue
        sub_type = row.get("subType", "").strip()
        is_and_one = sub_type == "Free Throw 1 of 1" and unpaired.get(moment, 0) > 0
        label = classify(sub_type, is_and_one)
        if label is None:
            unknown.append(sub_type)
            continue
        if label == AND_ONE:
            unpaired[moment] -= 1
        result.append(
            FreeThrow(
                int(row["actionNumber"]),
                row.get("personId", "").strip(),
                row.get("teamId", "").strip(),
                not row.get("description", "").strip().startswith("MISS "),
                label,
                sub_type,
            )
        )
    return result, unknown


def ft_probability(alpha: float, beta: float, makes: int, attempts: int) -> float:
    """Posterior mean FT% from a league Beta prior and the shooter's earlier attempts."""
    if alpha <= 0 or beta <= 0 or makes < 0 or attempts < makes:
        raise ValueError("invalid free-throw prior or counts")
    return (alpha + makes) / (alpha + beta + attempts)


@dataclass(frozen=True)
class Targets:
    shots: float
    ts: float
    sq: float
    make: float
    ft: float


def attempt_targets(
    kind: str,
    *,
    points: float = 0.0,
    expected_points: float = 0.0,
    ft_probability: float = 0.0,
    avg_points: float = 0.0,
) -> Targets:
    """The four values of one attempt; TS = SQ + MAKE + FT exactly, by construction."""
    if kind == FGA:
        return Targets(1.0, points, expected_points, points - expected_points, 0.0)
    if kind not in FREE_THROW_KINDS:
        raise ValueError(f"unknown attempt kind {kind}")
    size = TRIP_SIZE.get(kind)
    baseline = avg_points / size if size else 0.0
    return Targets(
        1.0 / size if size else 0.0, ft_probability, baseline, 0.0, ft_probability - baseline
    )
