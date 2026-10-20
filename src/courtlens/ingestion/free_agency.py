"""NBA.com's free-agent tracker (`/players/free-agent-tracker/<year>`).

The page is a Next.js document; every tracked player is in its `__NEXT_DATA__` page props with
NBA ids, the old and new team, the class (UFA/RFA), option and two-way flags, availability
(`U` unsigned, `S` signed) and the article NBA.com links for the move. It carries no deal terms.
"""

from __future__ import annotations

import json
import math
import re
from typing import Any

HOST = "www.nba.com"
URL_PATTERN = re.compile(r"^https://www\.nba\.com/players/free-agent-tracker/(\d{4})$")
_NEXT_DATA = re.compile(rb'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', re.S)


def tracker_url(year: int) -> str:
    return f"https://{HOST}/players/free-agent-tracker/{year}"


def _team(value: Any) -> str | None:
    """NBA writes `0` for no team (open market, or no NBA team before the move)."""
    team = str(value or "0")
    return None if team == "0" else team


def _number(value: Any) -> float | None:
    if value is None or isinstance(value, bool):
        return None
    if not isinstance(value, (int, float)) or not math.isfinite(value):
        raise ValueError("free-agent tracker number must be finite or absent")
    return float(value)


def _option(row: dict[str, Any]) -> str | None:
    if row.get("isPlayerOption"):
        return "player"
    if row.get("isTeamOption"):
        return "team"
    if row.get("isEarlyTerminationOption"):
        return "early_termination"
    return None


def parse_tracker(body: bytes, year: int) -> dict[str, Any]:
    """One row per tracked player, in the source's order; absent values stay absent."""
    match = _NEXT_DATA.search(body)
    if match is None:
        raise ValueError("free-agent tracker page has no __NEXT_DATA__")
    props = json.loads(match[1]).get("props", {}).get("pageProps", {})
    rows = props.get("players")
    if str(props.get("season")) != str(year) or not isinstance(rows, list) or not rows:
        raise ValueError("free-agent tracker page is not the requested class")
    players: list[dict[str, Any]] = []
    seen: set[str] = set()
    for row in rows:
        pid = str(row.get("playerId") or "")
        if not pid.isdigit() or int(pid) <= 0 or pid in seen:
            raise ValueError("invalid or duplicate free-agent NBA identity")
        seen.add(pid)
        availability = row.get("availability")
        if availability not in ("U", "S") or row.get("type") not in ("ufa", "rfa"):
            raise ValueError(f"unexpected free-agent status for {pid}")
        old, new = _team(row.get("oldTeamId")), _team(row.get("newTeamId"))
        signed = availability == "S"
        players.append(
            {
                "player_id": pid,
                "name": row.get("playerDisplayName")
                or f"{row.get('playerFirstName', '')} {row.get('playerLastName', '')}".strip(),
                "position": row.get("position") or None,
                "class": row["type"],
                "option": _option(row),
                "two_way": bool(row.get("isTwoWayFreeAgent")),
                "status": ("returned" if new == old else "signed") if signed else "unsigned",
                "old_team_id": old,
                "new_team_id": new if signed else None,
                "points_per_game": _number(row.get("PPG")),
                "rebounds_per_game": _number(row.get("RPG")),
                "assists_per_game": _number(row.get("APG")),
                "age": row.get("age") if isinstance(row.get("age"), int) else None,
                "experience": row.get("exp") if isinstance(row.get("exp"), int) else None,
                "note": row.get("articleLabel") or None,
                "note_url": row.get("articleUrl") or None,
            }
        )
    return {"year": year, "players": players}
