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


@dataclass(frozen=True)
class TeamEra:
    """A franchise's earlier identity (Seattle SuperSonics for the Thunder) over inclusive seasons.

    Releases key the games of most eras by their own code (``SEA``) instead of the franchise id;
    ``stored_as_code`` is False for eras kept under the franchise id (the Charlotte Bobcats).
    """

    code: str
    franchise_id: str
    name: str
    city: str
    conference: str
    division: str
    first_season: str
    last_season: str
    stored_as_code: bool = True

    def covers(self, season: str) -> bool:
        return (
            _season_start(self.first_season)
            <= _season_start(season)
            <= _season_start(self.last_season)
        )


# Lineage follows the NBA's franchise records: the 1988-2002 Hornets belong to Charlotte and the
# New Orleans Hornets to the Pelicans. Eras split where the 2004-05 realignment moved a team.
TEAM_ERAS: tuple[TeamEra, ...] = (
    TeamEra(
        "SEA",
        "1610612760",
        "Seattle SuperSonics",
        "Seattle",
        "Western",
        "Pacific",
        "1967-68",
        "2003-04",
    ),
    TeamEra(
        "SEA",
        "1610612760",
        "Seattle SuperSonics",
        "Seattle",
        "Western",
        "Northwest",
        "2004-05",
        "2007-08",
    ),
    TeamEra(
        "NJN",
        "1610612751",
        "New Jersey Nets",
        "New Jersey",
        "Eastern",
        "Atlantic",
        "1977-78",
        "2011-12",
    ),
    TeamEra(
        "VAN",
        "1610612763",
        "Vancouver Grizzlies",
        "Vancouver",
        "Western",
        "Midwest",
        "1995-96",
        "2000-01",
    ),
    TeamEra(
        "CHH",
        "1610612766",
        "Charlotte Hornets",
        "Charlotte",
        "Eastern",
        "Central",
        "1988-89",
        "2001-02",
    ),
    TeamEra(
        "NOH",
        "1610612740",
        "New Orleans Hornets",
        "New Orleans",
        "Eastern",
        "Central",
        "2002-03",
        "2003-04",
    ),
    TeamEra(
        "NOH",
        "1610612740",
        "New Orleans Hornets",
        "New Orleans",
        "Western",
        "Southwest",
        "2004-05",
        "2004-05",
    ),
    TeamEra(
        "NOK",
        "1610612740",
        "New Orleans/Oklahoma City Hornets",
        "New Orleans/Oklahoma City",
        "Western",
        "Southwest",
        "2005-06",
        "2006-07",
    ),
    TeamEra(
        "NOH",
        "1610612740",
        "New Orleans Hornets",
        "New Orleans",
        "Western",
        "Southwest",
        "2007-08",
        "2012-13",
    ),
    TeamEra(
        "CHA",
        "1610612766",
        "Charlotte Bobcats",
        "Charlotte",
        "Eastern",
        "Southeast",
        "2004-05",
        "2013-14",
        stored_as_code=False,
    ),
)


# Seasons a current franchise fielded no team: New Orleans began in 2002-03 (the Hornets' earlier
# seasons belong to Charlotte), and Charlotte sat out 2002-03 and 2003-04. ``None`` is unbounded.
FRANCHISE_GAPS: tuple[tuple[str, str | None, str | None], ...] = (
    ("1610612740", None, "2001-02"),
    ("1610612766", "2002-03", "2003-04"),
)


def franchise_active(franchise_id: str, season: str) -> bool:
    start = _season_start(season)
    return not any(
        team == franchise_id
        and (first is None or _season_start(first) <= start)
        and (last is None or start <= _season_start(last))
        for team, first, last in FRANCHISE_GAPS
    )


def _season_start(season: str) -> int:
    return int(season[:4])


def team_era(team_id: str, season: str | None = None) -> TeamEra | None:
    """The era a team id names in a season: an era code (``SEA``), or a franchise id whose games
    that season belong to an era kept under the franchise id. Without a season only codes match,
    to their latest era."""
    matches = [
        era
        for era in TEAM_ERAS
        if (season is None or era.covers(season))
        and (
            (era.stored_as_code and team_id.upper() == era.code)
            or (season is not None and not era.stored_as_code and team_id == era.franchise_id)
        )
    ]
    return matches[-1] if matches else None


def team_identity(team_id: str, season: str | None = None) -> TeamInfo | None:
    """Season-aware identity: the era's name and code when one applies, else the franchise."""
    era = team_era(team_id, season)
    if era is None:
        return get_team_info(team_id)
    return TeamInfo(
        era.code if era.stored_as_code else era.franchise_id,
        era.code,
        era.name,
        era.city,
        era.conference,
        era.division,
    )


def season_team_id(franchise_id: str, season: str) -> str:
    """The id a release keys a franchise's games by in a season (``SEA`` for OKC in 2005-06)."""
    for era in TEAM_ERAS:
        if era.stored_as_code and era.franchise_id == franchise_id and era.covers(season):
            return era.code
    return franchise_id


def franchise_of(team_id: str) -> str | None:
    """The current franchise a team id or era code belongs to."""
    era = team_era(team_id)
    if era is not None:
        return era.franchise_id
    info = get_team_info(team_id)
    return info.team_id if info else None


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
    era = team_era(team_id)
    if era:
        return era.name
    return default or team_id


def resolve_team_tricode(team_id: str, default: str | None = None) -> str:
    """Resolve 3-letter team tricode."""
    info = get_team_info(team_id)
    if info:
        return info.tricode
    return default or team_id
