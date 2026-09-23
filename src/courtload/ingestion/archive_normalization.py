"""Typed archive row normalization shared by validation and import."""

from __future__ import annotations

import csv
import hashlib
import json
import re
from collections.abc import Iterator
from datetime import date
from pathlib import Path

from courtload.ingestion.archive import FILES

SEASONS = ("2021-22", "2022-23", "2023-24")
SEASON_DATES = {
    "2021-22": (date(2021, 10, 19), date(2022, 4, 10)),
    "2022-23": (date(2022, 10, 18), date(2023, 4, 9)),
    "2023-24": (date(2023, 10, 24), date(2024, 4, 14)),
}
PLAYER_FILES = tuple(name for name in FILES if "box_scores" in name)
TEAM_FILE = "regular_season_totals_2010_2024.csv"
COUNT_FIELDS = (
    "fieldGoalsMade",
    "fieldGoalsAttempted",
    "threePointersMade",
    "threePointersAttempted",
    "freeThrowsMade",
    "freeThrowsAttempted",
    "reboundsOffensive",
    "reboundsDefensive",
    "reboundsTotal",
    "assists",
    "steals",
    "blocks",
    "turnovers",
    "foulsPersonal",
    "points",
)
TEAM_COUNT_FIELDS = dict(
    zip(
        COUNT_FIELDS,
        (
            "FGM",
            "FGA",
            "FG3M",
            "FG3A",
            "FTM",
            "FTA",
            "OREB",
            "DREB",
            "REB",
            "AST",
            "STL",
            "BLK",
            "TOV",
            "PF",
            "PTS",
        ),
        strict=True,
    )
)


def game_id(value: str) -> str:
    if not value.isascii() or not value.isdigit() or len(value) not in (8, 10):
        raise ValueError("malformed_game_id")
    normalized = value.zfill(10)
    if not normalized.startswith("002"):
        raise ValueError("non_regular_game_id")
    return normalized


def minutes(value: str) -> int | None:
    if not value:
        return None
    match = re.fullmatch(r"(\d+):(\d{1,2})", value)
    if not match or int(match.group(2)) > 59:
        raise ValueError("malformed_minutes")
    return 60 * int(match.group(1)) + int(match.group(2))


def count(value: str) -> int | None:
    if value == "":
        return None
    if not value.isascii() or not value.isdigit():
        raise ValueError("malformed_count")
    return int(value)


def team_count(value: str) -> int | None:
    """Parse team counts, whose CSV serialization sometimes appends an exact `.0`."""
    if value.endswith(".0"):
        value = value[:-2]
    return count(value)


def canonical_hash(value: object) -> str:
    payload = json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(payload.encode()).hexdigest()


def parse_matchup(value: str, abbreviation: str) -> tuple[str, str]:
    match = re.fullmatch(r"([A-Z]{2,3}) (vs\.|@) ([A-Z]{2,3})", value)
    if match is None or match.group(1) != abbreviation:
        raise ValueError("malformed_matchup")
    return ("home" if match.group(2) == "vs." else "away", match.group(3))


def validate_stats(stats: dict[str, int | None]) -> None:
    """Apply source-neutral count and scoring constraints."""
    if any(
        (made := stats[a]) is not None and (attempted := stats[b]) is not None and made > attempted
        for a, b in (
            ("fieldGoalsMade", "fieldGoalsAttempted"),
            ("threePointersMade", "threePointersAttempted"),
            ("freeThrowsMade", "freeThrowsAttempted"),
            ("threePointersMade", "fieldGoalsMade"),
            ("threePointersAttempted", "fieldGoalsAttempted"),
        )
    ):
        raise ValueError("makes_exceed_attempts")
    fgm, three, ftm, pts = (
        stats["fieldGoalsMade"],
        stats["threePointersMade"],
        stats["freeThrowsMade"],
        stats["points"],
    )
    if (
        fgm is not None
        and three is not None
        and ftm is not None
        and pts is not None
        and pts != 2 * (fgm - three) + 3 * three + ftm
    ):
        raise ValueError("point_formula_mismatch")


def parse_player(row: dict[str, str]) -> dict[str, object]:
    game = game_id(row["gameId"])
    game_date = date.fromisoformat(row["game_date"])
    if row["season_year"] in SEASON_DATES:
        start, end = SEASON_DATES[row["season_year"]]
        if not start <= game_date <= end:
            raise ValueError("date_outside_season")
    side, opponent = parse_matchup(row["matchup"], row["teamTricode"])
    stats = {field: count(row[field]) for field in COUNT_FIELDS}
    validate_stats(stats)
    played_seconds = minutes(row["minutes"])
    comment = row["comment"].strip()
    appearance = (
        "appeared"
        if played_seconds is not None and played_seconds > 0
        else "reported_nonappearance"
        if comment.startswith(("DNP", "DND", "NWT"))
        else "unknown"
    )
    return {
        "season": row["season_year"],
        "date": row["game_date"],
        "game": game,
        "team_id": row["teamId"],
        "team": row["teamTricode"],
        "side": side,
        "opponent": opponent,
        "player_id": row["personId"],
        "player": row["personName"],
        "minutes_original": row["minutes"],
        "minutes_seconds": played_seconds,
        "comment": comment,
        "appearance": appearance,
        "stats": stats,
    }


def parse_team(row: dict[str, str]) -> dict[str, object]:
    game_date = date.fromisoformat(row["GAME_DATE"][:10])
    if row["SEASON_YEAR"] in SEASON_DATES:
        start, end = SEASON_DATES[row["SEASON_YEAR"]]
        if not start <= game_date <= end:
            raise ValueError("date_outside_season")
    side, opponent = parse_matchup(row["MATCHUP"], row["TEAM_ABBREVIATION"])
    stats = {
        field: team_count(row.get(source_field, ""))
        for field, source_field in TEAM_COUNT_FIELDS.items()
    }
    validate_stats(stats)
    pts = stats["points"]
    if pts is None:
        raise ValueError("missing_team_points")
    return {
        "season": row["SEASON_YEAR"],
        "date": row["GAME_DATE"][:10],
        "game": game_id(row["GAME_ID"]),
        "team_id": row["TEAM_ID"],
        "team": row["TEAM_ABBREVIATION"],
        "side": side,
        "opponent": opponent,
        "points": pts,
        "minutes": row["MIN"],
        "stats": stats,
    }


def rows(path: Path) -> Iterator[tuple[int, dict[str, str]]]:
    with path.open(newline="", encoding="utf-8-sig") as stream:
        reader = csv.DictReader(stream)
        yield from enumerate(reader, start=2)
