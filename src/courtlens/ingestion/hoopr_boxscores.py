"""hoopR's raw per-game NBA documents, flattened into the rows CourtLens' importers read.

SportsDataverse's `player_boxscores_<year>.csv` and `team_boxscores_<year>.csv` release assets are
the NBA's `boxscoretraditionalv3` documents flattened to snake_case, without preseason and
All-Star games. hoopR republishes each game's document daily under
`hoopR-nba-stats-raw/nba_stats/json/boxscoretraditionalv3/<end year>/<game id>.json`, so the
in-progress season is rebuilt here in the same columns and the existing importer reads it
unchanged. Field order and formatting match the release assets (checked against 2025-26).

The same repository carries each game's `playbyplayv3` and `boxscorematchupsv3`, the documents
behind Shufinskiy's `nbastatsv3` and `matchups` archives that the impact pipeline reads;
`playbyplay_rows` and `matchup_rows` rebuild those archive rows (identical on 16 sampled 2025-26
games, 8,193 play-by-play rows; matchup values differ only where the NBA later revised them).
"""

from __future__ import annotations

import json
import re
from typing import Any

HOST = "raw.githubusercontent.com"
REPO = "sportsdataverse/hoopR-nba-stats-raw"
# Per-game documents read daily: the box score, its play-by-play and defensive matchups.
FAMILIES = ("boxscoretraditionalv3", "playbyplayv3", "boxscorematchupsv3")
URL_PATTERN = re.compile(
    r"^https://raw\.githubusercontent\.com/sportsdataverse/hoopR-nba-stats-raw/([0-9a-f]{40})"
    r"/nba_stats/json/(?:(?:boxscoretraditionalv3|playbyplayv3|boxscorematchupsv3)/(\d{4})/(\d{10})"
    r"|scheduleleaguev2/(\d{4}))\.json$"
)
# Regular season, playoffs, play-in and the NBA Cup final; preseason (001) and the All-Star
# game (003) are not in the release assets.
SEASON_TYPES = {"002": 2, "004": 4, "005": 5, "006": 6}
STAT_FIELDS = (
    "minutes",
    "fieldGoalsMade",
    "fieldGoalsAttempted",
    "fieldGoalsPercentage",
    "threePointersMade",
    "threePointersAttempted",
    "threePointersPercentage",
    "freeThrowsMade",
    "freeThrowsAttempted",
    "freeThrowsPercentage",
    "reboundsOffensive",
    "reboundsDefensive",
    "reboundsTotal",
    "assists",
    "steals",
    "blocks",
    "turnovers",
    "foulsPersonal",
    "points",
    "plusMinusPoints",
)
TEAM_FIELDS = ("teamId", "teamCity", "teamName", "teamTricode", "teamSlug")
PLAYER_FIELDS = (
    "personId",
    "firstName",
    "familyName",
    "nameI",
    "playerSlug",
    "position",
    "comment",
    "jerseyNum",
)


def snake(name: str) -> str:
    return re.sub(r"(?<!^)(?=[A-Z])", "_", name).lower()


TEAM_COLUMNS = [
    *(snake(f) for f in TEAM_FIELDS),
    "side",
    *(snake(f) for f in STAT_FIELDS),
    "game_id",
    "season",
    "season_type_id",
]
PLAYER_COLUMNS = [
    *(snake(f) for f in TEAM_FIELDS),
    "side",
    *(snake(f) for f in PLAYER_FIELDS),
    *(snake(f) for f in STAT_FIELDS),
    "game_id",
    "season",
    "season_type_id",
]


def boxscore_url(
    revision: str, end_year: int, game_id: str, family: str = "boxscoretraditionalv3"
) -> str:
    if family not in FAMILIES:
        raise ValueError(f"unknown hoopR family {family}")
    return f"https://{HOST}/{REPO}/{revision}/nba_stats/json/{family}/{end_year}/{game_id}.json"


def schedule_url(revision: str, end_year: int) -> str:
    return f"https://{HOST}/{REPO}/{revision}/nba_stats/json/scheduleleaguev2/{end_year}.json"


def season_type(game_id: str) -> int | None:
    return SEASON_TYPES.get(game_id[:3])


def _value(value: Any) -> str:
    """The release assets' text: integers as written, floats with Python's repr, nulls empty."""
    if value is None:
        return ""
    if isinstance(value, bool):
        return str(value).upper()
    return str(value)


def flatten_game(body: bytes, game_id: str, end_year: int) -> tuple[list[dict[str, str]], ...]:
    """(player rows, team rows) for one game, in the release assets' columns.

    Raises when the document is for another game or lacks either team, so a truncated or
    misnamed file fails loudly instead of importing a one-sided game.
    """
    kind = season_type(game_id)
    if kind is None:
        raise ValueError(f"{game_id} is not a regular-season, play-in, playoff or Cup game")
    box = json.loads(body).get("boxScoreTraditional") or {}
    if box.get("gameId") != game_id:
        raise ValueError(f"box score names game {box.get('gameId')!r}, not {game_id}")
    players: list[dict[str, str]] = []
    teams: list[dict[str, str]] = []
    tail = {"game_id": game_id, "season": str(end_year), "season_type_id": str(kind)}
    for side in ("home", "away"):
        team = box.get(f"{side}Team")
        if not team or not team.get("players") or not team.get("statistics"):
            raise ValueError(f"{game_id}: {side} team box score missing")
        head = {snake(f): _value(team.get(f)) for f in TEAM_FIELDS} | {"side": side}
        teams.append(
            head | {snake(f): _value(team["statistics"].get(f)) for f in STAT_FIELDS} | tail
        )
        for player in team["players"]:
            stats = player.get("statistics") or {}
            players.append(
                head
                | {snake(f): _value(player.get(f)) for f in PLAYER_FIELDS}
                | {snake(f): _value(stats.get(f)) for f in STAT_FIELDS}
                | tail
            )
    return players, teams


def final_games(schedule: bytes, end_year: int) -> list[str]:
    """Game ids the schedule marks final (status 3) that the release assets would include."""
    data = json.loads(schedule)
    dates = (data.get("leagueSchedule") or {}).get("gameDates") or []
    season = f"{end_year - 1}-{end_year % 100:02d}"
    if (data.get("leagueSchedule") or {}).get("seasonYear") not in (season, None):
        raise ValueError("schedule is for another season")
    ids = []
    for day in dates:
        for game in day.get("games", []):
            gid = str(game.get("gameId", ""))
            if game.get("gameStatus") == 3 and season_type(gid) is not None:
                ids.append(gid)
    return sorted(set(ids))


def archive_value(value: Any) -> str:
    """Shufinskiy's archive text: integral floats without a fraction, booleans as 0/1."""
    if value is None:
        return ""
    if isinstance(value, bool):
        return "1" if value else "0"
    if isinstance(value, float):
        return str(int(value)) if value.is_integer() else repr(value)
    return str(value)


def playbyplay_rows(body: bytes, game_id: str) -> list[dict[str, str]]:
    """`nbastatsv3` archive rows (each action plus an unpadded `gameId`) for one game."""
    game = json.loads(body).get("game") or {}
    if game.get("gameId") != game_id or not game.get("actions"):
        raise ValueError(f"{game_id}: play-by-play missing or for another game")
    gid = str(int(game_id))
    return [
        {**{k: archive_value(v) for k, v in action.items()}, "gameId": gid}
        for action in game["actions"]
    ]


def matchup_rows(body: bytes, game_id: str) -> list[dict[str, str]]:
    """`matchups` archive rows: one per offensive player and defender pairing."""
    box = json.loads(body).get("boxScoreMatchups") or {}
    if box.get("gameId") != game_id:
        raise ValueError(f"{game_id}: matchups missing or for another game")
    head = {
        "game_id": str(int(game_id)),
        "away_team_id": archive_value(box.get("awayTeamId")),
        "home_team_id": archive_value(box.get("homeTeamId")),
    }
    rows = []
    for side in ("homeTeam", "awayTeam"):
        team = box.get(side) or {}
        team_head = {
            "team_id": archive_value(team.get("teamId")),
            "team_name": archive_value(team.get("teamName")),
            "team_city": archive_value(team.get("teamCity")),
            "team_tricode": archive_value(team.get("teamTricode")),
            "team_slug": archive_value(team.get("teamSlug")),
        }
        for player in team.get("players", []):
            person = {snake(k): archive_value(v) for k, v in player.items() if k != "matchups"}
            for pairing in player.get("matchups", []):
                defender = {
                    "matchups_" + snake(k): archive_value(v)
                    for k, v in pairing.items()
                    if k != "statistics"
                }
                stats = {
                    snake(k): archive_value(v) for k, v in pairing.get("statistics", {}).items()
                }
                rows.append({**head, **team_head, **person, **defender, **stats})
    return rows
