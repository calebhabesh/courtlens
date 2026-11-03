"""DARKO (darko.app) dated leaderboard parsing. Pure: no network, no database.

darko.app is a SvelteKit site; each leaderboard page's data is served as `__data.json` in
SvelteKit's compact `devalue` serialization (a flat value table whose arrays and objects hold
indices into it). The leaderboard node carries a column table of players keyed by NBA person ID.
"""

from __future__ import annotations

import json
import math
import re
from datetime import date
from typing import Any

HOST = "www.darko.app"
URL_PATTERN = re.compile(r"^https://www\.darko\.app/__data\.json\?asof=(\d{4}-\d{2}-\d{2})$")
FIELDS = ("dpm", "o_dpm", "d_dpm", "box_dpm", "on_off_dpm")
# Kept when the board publishes them: DARKO's expected minutes per game (Roster Shapes v2) and
# its market value in dollars (Contracts' Small vs Big).
OPTIONAL_FIELDS = ("x_minutes", "sal_market_fixed")
_SPECIAL = {-1: None, -2: None, -3: float("nan"), -4: float("inf"), -5: float("-inf"), -6: -0.0}


def snapshot_url(as_of: date) -> str:
    """Season-only URLs select opening projections; import explicit dates instead."""
    return f"https://{HOST}/__data.json?asof={as_of.isoformat()}"


def season_label(end_year: int) -> str:
    return f"{end_year - 1}-{str(end_year)[2:]}"


def unflatten(values: list[Any]) -> Any:
    """Rebuild a devalue value table (root at index 0)."""
    cache: dict[int, Any] = {}

    def hydrate(index: int) -> Any:
        if index in _SPECIAL:
            return _SPECIAL[index]
        if index in cache:
            return cache[index]
        value = values[index]
        if isinstance(value, list):
            # A list led by a string is a typed value (Date, Set, ...); keep it raw.
            typed = bool(value) and isinstance(value[0], str)
            result: Any = value if typed else [hydrate(i) for i in value]
        elif isinstance(value, dict):
            result = {key: hydrate(i) for key, i in value.items()}
        else:
            result = value
        cache[index] = result
        return result

    return hydrate(0)


def parse_leaderboard(body: bytes) -> dict[str, Any]:
    """Require the source's actual snapshot date; retain full published precision."""
    document = json.loads(body)
    nodes = [node for node in document.get("nodes", []) if node and node.get("type") == "data"]
    if not nodes:
        raise ValueError("DARKO response has no data node")
    data = unflatten(nodes[-1]["data"])
    as_of = data.get("asOf") if isinstance(data, dict) else None
    if not isinstance(as_of, dict) or not as_of.get("date") or not as_of.get("dataDate"):
        raise ValueError("DARKO response is not a dated leaderboard")
    requested = date.fromisoformat(as_of["date"])
    data_date = date.fromisoformat(as_of["dataDate"])
    if data_date > requested:
        raise ValueError("DARKO data date is after its requested snapshot")
    table = data.get("players") if isinstance(data, dict) else None
    if not isinstance(table, dict) or "keys" not in table or "values" not in table:
        raise ValueError("DARKO response has no player table")
    keys: list[str] = table["keys"]
    missing = {"nba_id", "season", *FIELDS} - set(keys)
    if missing:
        raise ValueError(f"DARKO player table lacks {sorted(missing)}")
    rows = [dict(zip(keys, row, strict=True)) for row in zip(*table["values"], strict=True)]
    seasons = {int(row["season"]) for row in rows}
    if len(seasons) != 1 or seasons != {int(as_of["season"])}:
        raise ValueError(f"expected one DARKO season, got {sorted(seasons)}")
    players: dict[str, dict[str, Any]] = {}
    for row in rows:
        if row["nba_id"] is None:
            continue
        pid = str(int(row["nba_id"]))
        if int(pid) <= 0 or float(row["nba_id"]) != int(pid) or pid in players:
            raise ValueError("invalid or duplicate DARKO NBA identity")
        players[pid] = {
            **{field: _number(row.get(field)) for field in FIELDS},
            **{field: _number(row.get(field)) for field in OPTIONAL_FIELDS if field in keys},
            "career_games": row.get("career_game_num"),
            "name": row.get("player_name"),
        }
    end_year = seasons.pop()
    return {
        "season": season_label(end_year),
        "as_of": requested.isoformat(),
        "data_date": data_date.isoformat(),
        "players": dict(sorted(players.items())),
    }


def _number(value: Any) -> float | None:
    if value is None:
        return None
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise ValueError("DARKO rating must be finite or unknown")
    return float(value)
