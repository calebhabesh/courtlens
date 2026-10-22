"""Each season's team records and the source's season measures (team_season_records.json).

Written offline by ``scripts/team_season_records.py`` from the retained Basketball-Reference
league season pages: wins and losses from the standings, and margin of victory, schedule
strength, SRS, offensive and defensive rating, pace, arena and attendance from the advanced
team table. Ratings and pace are the source's own possession estimates. Keys are the codes
releases store games under. From 1983-84 the records equal CourtLens's own game logs.
"""

from __future__ import annotations

import json
from functools import cache
from pathlib import Path
from typing import Any


@cache
def _seasons() -> dict[str, dict[str, Any]]:
    document = json.loads(Path(__file__).with_name("team_season_records.json").read_text())
    seasons: dict[str, dict[str, Any]] = document["seasons"]
    return seasons


def team_season_record(code: str, season: str) -> dict[str, Any] | None:
    """One team's record and measures in a season; None when the season or team is unknown."""
    record: dict[str, Any] | None = _seasons().get(season, {}).get("teams", {}).get(code)
    return record


def season_source(season: str) -> tuple[str, str] | None:
    """(page URL, page SHA-256) the season's records were read from."""
    entry = _seasons().get(season)
    return (entry["source_url"], entry["source_sha256"]) if entry else None
