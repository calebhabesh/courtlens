"""Playoff-series matchups from NBA.com's per-game matchup box scores (`boxscorematchupsv3`).

`scripts/series_matchups.py` writes one file per season with the pairs of every playoff game
and of the regular-season games between teams that met in those playoffs. A series sums its own
games' pairs by phase; the page adds the phases for "All". NBA.com credits a possession to the
defender its tracking assigns, so possessions nobody is assigned to are missing and partial
possessions are fractional: these are the source's figures, not a reconstruction.
"""

from __future__ import annotations

import gzip
import json
from collections.abc import Callable, Iterable
from functools import lru_cache
from pathlib import Path
from typing import Any

from courtlens.api.workbench_schemas import SeriesMatchupRow, SeriesMatchups
from courtlens.config import get_settings

VERSION = "courtlens-series-matchups-v1"
FIELDS = [
    "off_player_id",
    "def_player_id",
    "off_tricode",
    "possessions",
    "seconds",
    "points",
    "fgm",
    "fga",
    "fg3m",
    "fg3a",
    "ftm",
    "fta",
    "assists",
    "turnovers",
]
SOURCE = "NBA.com box score matchups (boxscorematchupsv3)"
_COUNTS = ("points", "fgm", "fga", "fg3m", "fg3a", "ftm", "fta", "assists", "turnovers")


def matchups_dir() -> Path:
    return get_settings().series_matchups_dir or Path("data/derived/series-matchups-v1")


@lru_cache(maxsize=8)
def _load(path: Path, mtime_ns: int) -> dict[str, Any] | None:
    body: dict[str, Any] = json.loads(gzip.decompress(path.read_bytes()))
    if body.get("version") != VERSION or body.get("fields") != FIELDS:
        return None
    return body


def season_matchups(season: str) -> dict[str, Any] | None:
    """The season's file, or None when none was written (before 2023-24)."""
    path = matchups_dir() / f"{season}.json.gz"
    if not path.is_file():
        return None
    return _load(path, path.stat().st_mtime_ns)


def series_matchups(
    season: str,
    side_of: Callable[[str], str | None],
    playoff_game_ids: Iterable[str],
    regular_game_ids: Iterable[str],
) -> SeriesMatchups | None:
    """Pairs summed per phase over the given games; `side_of` maps a tricode to its team id.

    None when the season has no file or none of the series' playoff games is in it.
    """
    body = season_matchups(season)
    if body is None:
        return None
    games: dict[str, dict[str, Any]] = body["games"]
    names: dict[str, str] = body["names"]
    wanted = {"playoffs": list(playoff_game_ids), "regular_season": list(regular_game_ids)}
    present = {phase: [g for g in ids if g in games] for phase, ids in wanted.items()}
    if not present["playoffs"]:
        return None
    totals: dict[tuple[str, str, str], dict[str, Any]] = {}
    for phase, ids in present.items():
        for game_id in ids:
            for values in games[game_id]["pairs"]:
                pair = dict(zip(FIELDS, values, strict=True))
                team = side_of(str(pair["off_tricode"]))
                if team is None:
                    continue
                key = (phase, str(pair["off_player_id"]), str(pair["def_player_id"]))
                row = totals.setdefault(
                    key,
                    {"team": team, "games": 0, "possessions": 0.0, "seconds": 0.0}
                    | dict.fromkeys(_COUNTS, 0),
                )
                row["games"] += 1
                row["possessions"] += float(pair["possessions"])
                row["seconds"] += float(pair["seconds"])
                for count in _COUNTS:
                    row[count] += int(pair[count])
    rows = [
        SeriesMatchupRow(
            phase=phase,
            off_player_id=off,
            off_player_name=names.get(off, off),
            off_team_id=row["team"],
            def_player_id=defender,
            def_player_name=names.get(defender, defender),
            games=row["games"],
            possessions=round(row["possessions"], 1),
            seconds=round(row["seconds"], 1),
            **{count: row[count] for count in _COUNTS},
        )
        for (phase, off, defender), row in sorted(totals.items())
    ]
    return SeriesMatchups(
        playoff_games=len(present["playoffs"]),
        playoff_games_played=len(wanted["playoffs"]),
        regular_season_games=len(present["regular_season"]),
        source=SOURCE,
        rows=rows,
    )
