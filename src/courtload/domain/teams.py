"""NBA Team definitions, tricodes, and canonical team identities."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class TeamInfo:
    team_id: str
    tricode: str
    name: str
    city: str
    conference: str
    division: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "team_id": self.team_id,
            "tricode": self.tricode,
            "name": self.name,
            "city": self.city,
            "conference": self.conference,
            "division": self.division,
        }


NBA_TEAMS: dict[str, TeamInfo] = {
    "1610612737": TeamInfo("1610612737", "ATL", "Atlanta Hawks", "Atlanta", "Eastern", "Southeast"),
    "1610612738": TeamInfo("1610612738", "BOS", "Boston Celtics", "Boston", "Eastern", "Atlantic"),
    "1610612739": TeamInfo(
        "1610612739", "CLE", "Cleveland Cavaliers", "Cleveland", "Eastern", "Central"
    ),
    "1610612740": TeamInfo(
        "1610612740", "NOP", "New Orleans Pelicans", "New Orleans", "Western", "Southwest"
    ),
    "1610612741": TeamInfo("1610612741", "CHI", "Chicago Bulls", "Chicago", "Eastern", "Central"),
    "1610612742": TeamInfo(
        "1610612742", "DAL", "Dallas Mavericks", "Dallas", "Western", "Southwest"
    ),
    "1610612743": TeamInfo("1610612743", "DEN", "Denver Nuggets", "Denver", "Western", "Northwest"),
    "1610612744": TeamInfo(
        "1610612744", "GSW", "Golden State Warriors", "Golden State", "Western", "Pacific"
    ),
    "1610612745": TeamInfo(
        "1610612745", "HOU", "Houston Rockets", "Houston", "Western", "Southwest"
    ),
    "1610612746": TeamInfo("1610612746", "LAC", "LA Clippers", "Los Angeles", "Western", "Pacific"),
    "1610612747": TeamInfo(
        "1610612747", "LAL", "Los Angeles Lakers", "Los Angeles", "Western", "Pacific"
    ),
    "1610612748": TeamInfo("1610612748", "MIA", "Miami Heat", "Miami", "Eastern", "Southeast"),
    "1610612749": TeamInfo(
        "1610612749", "MIL", "Milwaukee Bucks", "Milwaukee", "Eastern", "Central"
    ),
    "1610612750": TeamInfo(
        "1610612750", "MIN", "Minnesota Timberwolves", "Minnesota", "Western", "Northwest"
    ),
    "1610612751": TeamInfo("1610612751", "BKN", "Brooklyn Nets", "Brooklyn", "Eastern", "Atlantic"),
    "1610612752": TeamInfo(
        "1610612752", "NYK", "New York Knicks", "New York", "Eastern", "Atlantic"
    ),
    "1610612753": TeamInfo("1610612753", "ORL", "Orlando Magic", "Orlando", "Eastern", "Southeast"),
    "1610612754": TeamInfo("1610612754", "IND", "Indiana Pacers", "Indiana", "Eastern", "Central"),
    "1610612755": TeamInfo(
        "1610612755", "PHI", "Philadelphia 76ers", "Philadelphia", "Eastern", "Atlantic"
    ),
    "1610612756": TeamInfo("1610612756", "PHX", "Phoenix Suns", "Phoenix", "Western", "Pacific"),
    "1610612757": TeamInfo(
        "1610612757", "POR", "Portland Trail Blazers", "Portland", "Western", "Northwest"
    ),
    "1610612758": TeamInfo(
        "1610612758", "SAC", "Sacramento Kings", "Sacramento", "Western", "Pacific"
    ),
    "1610612759": TeamInfo(
        "1610612759", "SAS", "San Antonio Spurs", "San Antonio", "Western", "Southwest"
    ),
    "1610612760": TeamInfo(
        "1610612760", "OKC", "Oklahoma City Thunder", "Oklahoma City", "Western", "Northwest"
    ),
    "1610612761": TeamInfo(
        "1610612761", "TOR", "Toronto Raptors", "Toronto", "Eastern", "Atlantic"
    ),
    "1610612762": TeamInfo("1610612762", "UTA", "Utah Jazz", "Utah", "Western", "Northwest"),
    "1610612763": TeamInfo(
        "1610612763", "MEM", "Memphis Grizzlies", "Memphis", "Western", "Southwest"
    ),
    "1610612764": TeamInfo(
        "1610612764", "WAS", "Washington Wizards", "Washington", "Eastern", "Southeast"
    ),
    "1610612765": TeamInfo("1610612765", "DET", "Detroit Pistons", "Detroit", "Eastern", "Central"),
    "1610612766": TeamInfo(
        "1610612766", "CHA", "Charlotte Hornets", "Charlotte", "Eastern", "Southeast"
    ),
}

TRICODE_TO_TEAM: dict[str, TeamInfo] = {team.tricode: team for team in NBA_TEAMS.values()}


def get_team_info(team_id: str) -> TeamInfo | None:
    """Retrieve canonical team info by team ID or 3-letter tricode."""
    return NBA_TEAMS.get(team_id) or TRICODE_TO_TEAM.get(team_id.upper())


def get_team_by_tricode(tricode: str) -> TeamInfo | None:
    """Retrieve canonical team info by 3-letter tricode."""
    return TRICODE_TO_TEAM.get(tricode.upper())


def resolve_team_label(team_id: str, default: str | None = None) -> str:
    """Resolve human-readable team label or return tricode/fallback."""
    info = get_team_info(team_id)
    if info:
        return info.name
    return default or team_id


def resolve_team_tricode(team_id: str, default: str | None = None) -> str:
    """Resolve 3-letter team tricode."""
    info = get_team_info(team_id)
    if info:
        return info.tricode
    return default or team_id
