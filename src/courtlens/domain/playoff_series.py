"""Every completed season's playoff series (playoff_series.json).

Written offline by ``scripts/playoff_series.py`` from the retained Basketball-Reference league
season pages: each series' round as the source names it, winner, loser, result and games (date,
home team, both scores). Codes are the ones releases store games under. Rounds and series
lengths changed over the years (best-of-three first rounds, division playoffs, tiebreakers), so
the round and the wins needed come from here, never from a game id or a fixed best-of-seven.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from functools import cache
from pathlib import Path
from typing import Any

# Round numbers follow the modern bracket: 1 first round, 2 semifinals, 3 conference (or
# division) finals, 4 Finals; 0 is a tiebreaker game played before the playoffs proper.
_GROUPED = re.compile(r"^(Eastern|Western|Central) (Conference|Division) (.+)$")
_STAGES = {"First Round": 1, "Semifinals": 2, "Finals": 3}


@dataclass(frozen=True)
class RoundLabel:
    number: int
    conference: str | None
    name: str


def classify_round(label: str, season: str) -> RoundLabel:
    """Round number, group (conference or, before 1970-71, division) and display name."""
    if "Tiebreaker" in label:
        match = _GROUPED.match(label)
        return RoundLabel(0, match.group(1) if match else None, "Tiebreakers")
    if label == "Finals":
        return RoundLabel(4, None, "BAA Finals" if season <= "1948-49" else "NBA Finals")
    if label == "Quarterfinals":
        return RoundLabel(1, None, "Quarterfinals")
    if label == "Semifinals":
        return RoundLabel(2, None, "Semifinals")
    match = _GROUPED.match(label)
    if match is None or match.group(3) not in _STAGES:
        raise ValueError(f"unknown playoff round: {label!r}")
    group, kind, stage = match.groups()
    return RoundLabel(
        _STAGES[stage], group, "First Round" if stage == "First Round" else f"{kind} {stage}"
    )


@cache
def _seasons() -> dict[str, dict[str, Any]]:
    document = json.loads(Path(__file__).with_name("playoff_series.json").read_text())
    seasons: dict[str, dict[str, Any]] = document["seasons"]
    return seasons


def season_playoff_series(season: str) -> list[dict[str, Any]] | None:
    """A completed season's series as the source lists them; None when the file lacks it."""
    entry = _seasons().get(season)
    return list(entry["series"]) if entry else None


def season_source(season: str) -> tuple[str, str] | None:
    """(page URL, page SHA-256) the season's series were read from."""
    entry = _seasons().get(season)
    return (entry["source_url"], entry["source_sha256"]) if entry else None
