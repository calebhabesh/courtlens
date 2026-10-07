from __future__ import annotations

from datetime import date
from typing import Any

DEMO_WEEK_START = date(2025, 2, 3)
DEMO_EMAIL = "demo@courtlens.dev"
DEMO_PASSWORD = "CourtLens-demo-2026"

TEAMS: list[dict[str, Any]] = [
    {
        "id": 9001,
        "conference": "East",
        "division": "Fixture",
        "city": "North",
        "name": "Stars",
        "full_name": "North Stars",
        "abbreviation": "NST",
    },
    {
        "id": 9002,
        "conference": "East",
        "division": "Fixture",
        "city": "Harbour",
        "name": "Waves",
        "full_name": "Harbour Waves",
        "abbreviation": "HBR",
    },
    {
        "id": 9003,
        "conference": "West",
        "division": "Fixture",
        "city": "Lake City",
        "name": "Loons",
        "full_name": "Lake City Loons",
        "abbreviation": "LKC",
    },
    {
        "id": 9004,
        "conference": "West",
        "division": "Fixture",
        "city": "Capital",
        "name": "Arrows",
        "full_name": "Capital Arrows",
        "abbreviation": "CAP",
    },
]

PLAYER_SPECS = [
    (9101, "Maya", "Chen", "PG", 9001),
    (9102, "Jordan", "Brooks", "SG", 9001),
    (9103, "Alex", "Morgan", "SF", 9002),
    (9104, "Sam", "Okafor", "PF", 9002),
    (9105, "Riley", "Singh", "C", 9003),
    (9106, "Casey", "Laurent", "G", 9003),
    (9107, "Taylor", "Mensah", "PF", 9004),
    (9108, "Devon", "Park", "C", 9004),
]

HISTORICAL_GAME_SPECS = [
    (8001, "2025-01-27", 9001, 9002, 111, 106),
    (8002, "2025-01-27", 9003, 9004, 104, 109),
    (8003, "2025-01-29", 9001, 9003, 118, 114),
    (8004, "2025-01-29", 9002, 9004, 101, 103),
    (8005, "2025-01-31", 9004, 9001, 107, 112),
    (8006, "2025-01-31", 9003, 9002, 110, 108),
]

PLANNING_GAME_SPECS = [
    (8010, "2025-02-03", 9001, 9002),
    (8011, "2025-02-03", 9003, 9004),
    (8012, "2025-02-04", 9001, 9003),
    (8013, "2025-02-05", 9002, 9004),
    (8014, "2025-02-06", 9001, 9004),
    (8015, "2025-02-07", 9002, 9003),
    (8016, "2025-02-08", 9001, 9002),
    (8017, "2025-02-09", 9003, 9004),
]

BASE_STATS: dict[int, dict[str, int]] = {
    9101: {"pts": 25, "reb": 5, "ast": 9, "stl": 2, "blk": 0, "turnover": 3},
    9102: {"pts": 18, "reb": 4, "ast": 4, "stl": 1, "blk": 0, "turnover": 2},
    9103: {"pts": 22, "reb": 7, "ast": 3, "stl": 1, "blk": 1, "turnover": 2},
    9104: {"pts": 17, "reb": 10, "ast": 2, "stl": 1, "blk": 2, "turnover": 2},
    9105: {"pts": 20, "reb": 12, "ast": 3, "stl": 0, "blk": 2, "turnover": 2},
    9106: {"pts": 16, "reb": 4, "ast": 8, "stl": 2, "blk": 0, "turnover": 2},
    9107: {"pts": 19, "reb": 8, "ast": 4, "stl": 1, "blk": 1, "turnover": 1},
    9108: {"pts": 14, "reb": 11, "ast": 2, "stl": 0, "blk": 3, "turnover": 2},
}


def team(team_id: int) -> dict[str, Any]:
    return next(dict(item) for item in TEAMS if item["id"] == team_id)


def players() -> list[dict[str, Any]]:
    return [
        {
            "id": player_id,
            "first_name": first_name,
            "last_name": last_name,
            "position": position,
            "team": team(team_id),
        }
        for player_id, first_name, last_name, position, team_id in PLAYER_SPECS
    ]


def games() -> list[dict[str, Any]]:
    completed = [
        {
            "id": game_id,
            "date": game_date,
            "season": 2024,
            "status": "Final",
            "status_state": "final",
            "datetime": f"{game_date}T23:30:00Z",
            "postseason": False,
            "postponed": False,
            "home_team_score": home_score,
            "visitor_team_score": away_score,
            "home_team": team(home_id),
            "visitor_team": team(away_id),
        }
        for game_id, game_date, home_id, away_id, home_score, away_score in HISTORICAL_GAME_SPECS
    ]
    scheduled = [
        {
            "id": game_id,
            "date": game_date,
            "season": 2024,
            "status": "7:30 pm ET",
            "status_state": "scheduled",
            "datetime": f"{game_date}T23:30:00Z",
            "postseason": False,
            "postponed": False,
            "home_team_score": 0,
            "visitor_team_score": 0,
            "home_team": team(home_id),
            "visitor_team": team(away_id),
        }
        for game_id, game_date, home_id, away_id in PLANNING_GAME_SPECS
    ]
    return completed + scheduled


def stats() -> list[dict[str, Any]]:
    player_lookup = {item["id"]: item for item in players()}
    player_team = {player_id: team_id for player_id, _, _, _, team_id in PLAYER_SPECS}
    rows: list[dict[str, Any]] = []
    for game_index, (game_id, game_date, home_id, away_id, home_score, away_score) in enumerate(
        HISTORICAL_GAME_SPECS
    ):
        participants = [
            player_id for player_id, team_id in player_team.items() if team_id in {home_id, away_id}
        ]
        for player_id in participants:
            values = dict(BASE_STATS[player_id])
            variation = (game_index + player_id) % 5 - 2
            values["pts"] += variation
            rebounds = values["reb"]
            rows.append(
                {
                    "id": game_id * 100 + (player_id - 9100),
                    "min": str(29 + (player_id + game_index) % 8),
                    "fgm": max(0, values["pts"] // 3),
                    "fga": max(1, values["pts"] // 2 + 5),
                    "fg3m": (player_id + game_index) % 4,
                    "fg3a": 5,
                    "ftm": 4,
                    "fta": 5,
                    "oreb": rebounds // 3,
                    "dreb": rebounds - rebounds // 3,
                    **values,
                    "pf": 2,
                    "plus_minus": variation * 2,
                    "player": {
                        "id": player_id,
                        "first_name": player_lookup[player_id]["first_name"],
                        "last_name": player_lookup[player_id]["last_name"],
                        "position": player_lookup[player_id]["position"],
                        "team_id": player_team[player_id],
                    },
                    "team": team(player_team[player_id]),
                    "game": {
                        "id": game_id,
                        "date": game_date,
                        "season": 2024,
                        "status": "Final",
                        "status_state": "final",
                        "postseason": False,
                        "postponed": False,
                        "home_team_score": home_score,
                        "visitor_team_score": away_score,
                        "home_team_id": home_id,
                        "visitor_team_id": away_id,
                    },
                }
            )
    return rows


def fixture_documents() -> list[dict[str, Any]]:
    """Provider-shaped deterministic fixtures; none are represented as real NBA records."""
    return [
        {"resource": "teams", "data": TEAMS},
        {"resource": "players", "data": players()},
        {"resource": "games", "data": games()},
        {"resource": "stats", "data": stats()},
    ]
