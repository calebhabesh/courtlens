"""NBA Team definitions, tricodes, and canonical team identities."""

from __future__ import annotations

import json
from dataclasses import dataclass
from functools import cache
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class TeamInfo:
    team_id: str
    tricode: str
    name: str
    city: str
    # None before 1970-71, when the league had divisions only.
    conference: str | None
    division: str | None

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
    ``franchise_id`` is None for a team that folded (the Anderson Packers). Conference and
    division are the era's last season's; ``team_identity`` reads each season's from the standings.
    """

    code: str
    franchise_id: str | None
    name: str
    city: str
    conference: str | None
    division: str | None
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
    # Identities before 1983-84 (full history): the season totals key them by these codes.
    TeamEra(
        "PHW",
        "1610612744",
        "Philadelphia Warriors",
        "Philadelphia",
        None,
        "Eastern",
        "1946-47",
        "1961-62",
    ),
    TeamEra(
        "SFW",
        "1610612744",
        "San Francisco Warriors",
        "San Francisco",
        "Western",
        "Pacific",
        "1962-63",
        "1970-71",
    ),
    TeamEra(
        "SYR",
        "1610612755",
        "Syracuse Nationals",
        "Syracuse",
        None,
        "Eastern",
        "1949-50",
        "1962-63",
    ),
    TeamEra(
        "MNL",
        "1610612747",
        "Minneapolis Lakers",
        "Minneapolis",
        None,
        "Western",
        "1948-49",
        "1959-60",
    ),
    TeamEra(
        "FTW",
        "1610612765",
        "Fort Wayne Pistons",
        "Fort Wayne",
        None,
        "Western",
        "1948-49",
        "1956-57",
    ),
    TeamEra(
        "ROC",
        "1610612758",
        "Rochester Royals",
        "Rochester",
        None,
        "Western",
        "1948-49",
        "1956-57",
    ),
    TeamEra(
        "CIN",
        "1610612758",
        "Cincinnati Royals",
        "Cincinnati",
        "Eastern",
        "Central",
        "1957-58",
        "1971-72",
    ),
    TeamEra(
        "KCO",
        "1610612758",
        "Kansas City-Omaha Kings",
        "Kansas City-Omaha",
        "Western",
        "Midwest",
        "1972-73",
        "1974-75",
    ),
    TeamEra(
        "TRI",
        "1610612737",
        "Tri-Cities Blackhawks",
        "Tri-Cities",
        None,
        "Western",
        "1949-50",
        "1950-51",
    ),
    TeamEra(
        "MLH",
        "1610612737",
        "Milwaukee Hawks",
        "Milwaukee",
        None,
        "Western",
        "1951-52",
        "1954-55",
    ),
    TeamEra(
        "STL",
        "1610612737",
        "St. Louis Hawks",
        "St. Louis",
        None,
        "Western",
        "1955-56",
        "1967-68",
    ),
    TeamEra(
        "CHP",
        "1610612764",
        "Chicago Packers",
        "Chicago",
        None,
        "Western",
        "1961-62",
        "1961-62",
    ),
    TeamEra(
        "CHZ",
        "1610612764",
        "Chicago Zephyrs",
        "Chicago",
        None,
        "Western",
        "1962-63",
        "1962-63",
    ),
    TeamEra(
        "BAL",
        "1610612764",
        "Baltimore Bullets",
        "Baltimore",
        "Eastern",
        "Central",
        "1963-64",
        "1972-73",
    ),
    TeamEra(
        "CAP",
        "1610612764",
        "Capital Bullets",
        "Capital",
        "Eastern",
        "Central",
        "1973-74",
        "1973-74",
    ),
    TeamEra(
        "SDR",
        "1610612745",
        "San Diego Rockets",
        "San Diego",
        "Western",
        "Pacific",
        "1967-68",
        "1970-71",
    ),
    TeamEra(
        "BUF",
        "1610612746",
        "Buffalo Braves",
        "Buffalo",
        "Eastern",
        "Atlantic",
        "1970-71",
        "1977-78",
    ),
    TeamEra(
        "NOJ",
        "1610612762",
        "New Orleans Jazz",
        "New Orleans",
        "Eastern",
        "Central",
        "1974-75",
        "1978-79",
    ),
    TeamEra(
        "NYN",
        "1610612751",
        "New York Nets",
        "New York",
        "Eastern",
        "Atlantic",
        "1976-77",
        "1976-77",
    ),
    # Teams that folded: no current franchise.
    TeamEra(
        "CHS",
        None,
        "Chicago Stags",
        "Chicago",
        None,
        "Central",
        "1946-47",
        "1949-50",
    ),
    TeamEra(
        "CLR",
        None,
        "Cleveland Rebels",
        "Cleveland",
        None,
        "Western",
        "1946-47",
        "1946-47",
    ),
    TeamEra(
        "DTF",
        None,
        "Detroit Falcons",
        "Detroit",
        None,
        "Western",
        "1946-47",
        "1946-47",
    ),
    TeamEra(
        "PIT",
        None,
        "Pittsburgh Ironmen",
        "Pittsburgh",
        None,
        "Western",
        "1946-47",
        "1946-47",
    ),
    TeamEra(
        "PRO",
        None,
        "Providence Steamrollers",
        "Providence",
        None,
        "Eastern",
        "1946-47",
        "1948-49",
    ),
    TeamEra(
        "STB",
        None,
        "St. Louis Bombers",
        "St. Louis",
        None,
        "Central",
        "1946-47",
        "1949-50",
    ),
    TeamEra(
        "TRH",
        None,
        "Toronto Huskies",
        "Toronto",
        None,
        "Eastern",
        "1946-47",
        "1946-47",
    ),
    TeamEra(
        "WSC",
        None,
        "Washington Capitols",
        "Washington",
        None,
        "Eastern",
        "1946-47",
        "1950-51",
    ),
    TeamEra(
        "BLB",
        None,
        "Baltimore Bullets",
        "Baltimore",
        None,
        "Eastern",
        "1947-48",
        "1954-55",
    ),
    TeamEra(
        "INJ",
        None,
        "Indianapolis Jets",
        "Indianapolis",
        None,
        "Western",
        "1948-49",
        "1948-49",
    ),
    TeamEra(
        "AND",
        None,
        "Anderson Packers",
        "Anderson",
        None,
        "Western",
        "1949-50",
        "1949-50",
    ),
    TeamEra(
        "DNN",
        None,
        "Denver Nuggets",
        "Denver",
        None,
        "Western",
        "1949-50",
        "1949-50",
    ),
    TeamEra(
        "INO",
        None,
        "Indianapolis Olympians",
        "Indianapolis",
        None,
        "Western",
        "1949-50",
        "1952-53",
    ),
    TeamEra(
        "SHE",
        None,
        "Sheboygan Red Skins",
        "Sheboygan",
        None,
        "Western",
        "1949-50",
        "1949-50",
    ),
    TeamEra(
        "WAT",
        None,
        "Waterloo Hawks",
        "Waterloo",
        None,
        "Western",
        "1949-50",
        "1949-50",
    ),
    # Eras before 2000-01 (full-history FH03): the Basketball-Reference game logs key them so.
    TeamEra(
        "WSB",
        "1610612764",
        "Washington Bullets",
        "Washington",
        "Eastern",
        "Atlantic",
        "1974-75",
        "1996-97",
    ),
    TeamEra(
        "KCK",
        "1610612758",
        "Kansas City Kings",
        "Kansas City",
        "Western",
        "Midwest",
        "1975-76",
        "1984-85",
    ),
    TeamEra(
        "SDC",
        "1610612746",
        "San Diego Clippers",
        "San Diego",
        "Western",
        "Pacific",
        "1978-79",
        "1983-84",
    ),
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
        "LAC",
        "1610612746",
        "Los Angeles Clippers",
        "Los Angeles",
        "Western",
        "Pacific",
        "1984-85",
        "2014-15",
        stored_as_code=False,
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


# Seasons a current franchise fielded no team: before its first season (from the league's
# standings, team_seasons.json), and Charlotte's 2002-03 and 2003-04. New Orleans began in 2002-03:
# the Hornets' earlier seasons belong to Charlotte. ``None`` is unbounded.
FRANCHISE_GAPS: tuple[tuple[str, str | None, str | None], ...] = (
    ("1610612737", None, "1948-49"),  # ATL: first season 1949-50
    ("1610612751", None, "1975-76"),  # BKN: first season 1976-77
    ("1610612766", None, "1987-88"),  # CHA: first season 1988-89
    ("1610612741", None, "1965-66"),  # CHI: first season 1966-67
    ("1610612739", None, "1969-70"),  # CLE: first season 1970-71
    ("1610612742", None, "1979-80"),  # DAL: first season 1980-81
    ("1610612743", None, "1975-76"),  # DEN: first season 1976-77
    ("1610612765", None, "1947-48"),  # DET: first season 1948-49
    ("1610612745", None, "1966-67"),  # HOU: first season 1967-68
    ("1610612754", None, "1975-76"),  # IND: first season 1976-77
    ("1610612746", None, "1969-70"),  # LAC: first season 1970-71
    ("1610612747", None, "1947-48"),  # LAL: first season 1948-49
    ("1610612763", None, "1994-95"),  # MEM: first season 1995-96
    ("1610612748", None, "1987-88"),  # MIA: first season 1988-89
    ("1610612749", None, "1967-68"),  # MIL: first season 1968-69
    ("1610612750", None, "1988-89"),  # MIN: first season 1989-90
    ("1610612740", None, "2001-02"),  # NOP: first season 2002-03
    ("1610612760", None, "1966-67"),  # OKC: first season 1967-68
    ("1610612753", None, "1988-89"),  # ORL: first season 1989-90
    ("1610612755", None, "1948-49"),  # PHI: first season 1949-50
    ("1610612756", None, "1967-68"),  # PHX: first season 1968-69
    ("1610612757", None, "1969-70"),  # POR: first season 1970-71
    ("1610612758", None, "1947-48"),  # SAC: first season 1948-49
    ("1610612759", None, "1975-76"),  # SAS: first season 1976-77
    ("1610612761", None, "1994-95"),  # TOR: first season 1995-96
    ("1610612762", None, "1973-74"),  # UTA: first season 1974-75
    ("1610612764", None, "1960-61"),  # WAS: first season 1961-62
    ("1610612766", "2002-03", "2003-04"),  # CHA: Charlotte sat out two seasons
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
    """The era a team id names in a season: an era code (``SEA``), or a franchise id or code
    whose games that season belong to an era kept under the franchise id (``CHA`` in 2010-11).
    Without a season only stored codes match, to their latest era."""
    code = team_id.upper()
    matches = [
        era
        for era in TEAM_ERAS
        if (season is None or era.covers(season))
        and (
            (era.stored_as_code and code == era.code)
            or (
                season is not None
                and not era.stored_as_code
                and (team_id == era.franchise_id or code == era.code)
            )
        )
    ]
    return matches[-1] if matches else None


@dataclass(frozen=True)
class TeamSeason:
    """A team's season as the league's standings list it."""

    name: str
    conference: str | None
    division: str | None


@cache
def _team_seasons() -> dict[str, dict[str, TeamSeason]]:
    document = json.loads((Path(__file__).with_name("team_seasons.json")).read_text())
    return {
        season: {code: TeamSeason(**row) for code, row in entry["teams"].items()}
        for season, entry in document["seasons"].items()
    }


def team_season(code: str, season: str) -> TeamSeason | None:
    """The standings' name, conference and division for a team code in a season, if it played."""
    return _team_seasons().get(season, {}).get(code.upper())


def team_identity(team_id: str, season: str | None = None) -> TeamInfo | None:
    """Season-aware identity: the era's name and code when one applies, else the franchise; with
    a season, that season's conference and division (realignments, none before 1970-71)."""
    era = team_era(team_id, season)
    if era is None:
        info = get_team_info(team_id)
    else:
        info = TeamInfo(
            era.code if era.stored_as_code or era.franchise_id is None else era.franchise_id,
            era.code,
            era.name,
            era.city,
            era.conference,
            era.division,
        )
    if info is None or season is None:
        return info
    played = team_season(info.tricode, season)
    if played is None:
        return info
    return TeamInfo(
        info.team_id, info.tricode, info.name, info.city, played.conference, played.division
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
