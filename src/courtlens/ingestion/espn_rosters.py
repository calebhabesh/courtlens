"""ESPN team rosters (`site.api.espn.com/.../nba/teams/<id>/roster`).

One JSON document per team: the team (ESPN id and abbreviation), the season it describes and
every listed athlete with ESPN's id and name. ESPN ids are not NBA ids; matching is the
service's job (`courtlens.services.espn_rosters`), never the parser's.
"""

from __future__ import annotations

import json
import re
from typing import Any

from courtlens.domain.teams import TRICODE_TO_TEAM

HOST = "site.api.espn.com"
URL_PATTERN = re.compile(
    r"^https://site\.api\.espn\.com/apis/site/v2/sports/basketball/nba/teams/(\d{1,2})/roster$"
)
# ESPN team id -> NBA tricode. ESPN writes some abbreviations differently (NY, GS, SA, NO, UTAH,
# WSH); the parser checks each response against this table, so a renumbering fails loudly.
ESPN_TEAMS: dict[str, tuple[str, str]] = {
    "1": ("ATL", "ATL"),
    "2": ("BOS", "BOS"),
    "3": ("NO", "NOP"),
    "4": ("CHI", "CHI"),
    "5": ("CLE", "CLE"),
    "6": ("DAL", "DAL"),
    "7": ("DEN", "DEN"),
    "8": ("DET", "DET"),
    "9": ("GS", "GSW"),
    "10": ("HOU", "HOU"),
    "11": ("IND", "IND"),
    "12": ("LAC", "LAC"),
    "13": ("LAL", "LAL"),
    "14": ("MIA", "MIA"),
    "15": ("MIL", "MIL"),
    "16": ("MIN", "MIN"),
    "17": ("BKN", "BKN"),
    "18": ("NY", "NYK"),
    "19": ("ORL", "ORL"),
    "20": ("PHI", "PHI"),
    "21": ("PHX", "PHX"),
    "22": ("POR", "POR"),
    "23": ("SAC", "SAC"),
    "24": ("SA", "SAS"),
    "25": ("OKC", "OKC"),
    "26": ("UTAH", "UTA"),
    "27": ("WSH", "WAS"),
    "28": ("TOR", "TOR"),
    "29": ("MEM", "MEM"),
    "30": ("CHA", "CHA"),
}


def roster_url(espn_team_id: str) -> str:
    return f"https://{HOST}/apis/site/v2/sports/basketball/nba/teams/{espn_team_id}/roster"


def season_label(year: int) -> str:
    """ESPN's season year is the year it ends (2027 is 2026-27)."""
    return f"{year - 1}-{str(year)[2:]}"


def parse_roster(body: bytes, espn_team_id: str) -> dict[str, Any]:
    if espn_team_id not in ESPN_TEAMS:
        raise ValueError("not an ESPN NBA team id")
    data = json.loads(body)
    team = data.get("team") or {}
    abbreviation, tricode = ESPN_TEAMS[espn_team_id]
    if str(team.get("id")) != espn_team_id or team.get("abbreviation") != abbreviation:
        raise ValueError(f"ESPN roster {espn_team_id} is not {abbreviation}")
    season = data.get("season") or {}
    if not isinstance(season.get("year"), int):
        raise ValueError("ESPN roster must declare its season")
    athletes = data.get("athletes")
    if not isinstance(athletes, list) or not athletes:
        raise ValueError("ESPN roster lists no athletes")
    players: list[dict[str, Any]] = []
    seen: set[str] = set()
    for athlete in athletes:
        espn_id = str(athlete.get("id") or "")
        name = str(athlete.get("fullName") or athlete.get("displayName") or "").strip()
        if not espn_id.isdigit() or not name:
            raise ValueError("ESPN athlete without an id or name")
        if espn_id in seen:
            raise ValueError("duplicate ESPN athlete on one roster")
        seen.add(espn_id)
        status = (athlete.get("status") or {}).get("type")
        players.append(
            {
                "espn_id": espn_id,
                "name": name,
                "position": (athlete.get("position") or {}).get("abbreviation") or None,
                "jersey": athlete.get("jersey") or None,
                "status": status or None,
            }
        )
    return {
        "espn_team_id": espn_team_id,
        "tricode": tricode,
        "team_id": TRICODE_TO_TEAM[tricode].team_id,
        "season": season_label(season["year"]),
        "players": players,
    }
