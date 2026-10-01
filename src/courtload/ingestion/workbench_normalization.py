"""Normalization, validation, and reconciliation for SportsDataverse NBA Stats assets."""

from __future__ import annotations

import csv
import gzip
import hashlib
import json
import re
from collections import defaultdict
from collections.abc import Iterator
from pathlib import Path
from typing import Any

PLAYER_COUNT_FIELDS = (
    "field_goals_made",
    "field_goals_attempted",
    "three_pointers_made",
    "three_pointers_attempted",
    "free_throws_made",
    "free_throws_attempted",
    "rebounds_offensive",
    "rebounds_defensive",
    "rebounds_total",
    "assists",
    "steals",
    "blocks",
    "turnovers",
    "fouls_personal",
    "points",
)

TEAM_COUNT_FIELDS = PLAYER_COUNT_FIELDS


def parse_minutes(value: str) -> int | None:
    """Parse minutes in 'm:ss' format with seconds strictly in 0..59.

    Empty string returns None. Team minutes may exceed 60 minutes.
    """
    if not value or value.strip() == "":
        return None
    val = value.strip()
    match = re.fullmatch(r"(\d+):(\d{1,2})", val)
    if not match:
        raise ValueError(f"malformed_minutes: '{value}'")
    seconds = int(match.group(2))
    if seconds > 59:
        raise ValueError(f"malformed_minutes_seconds_out_of_range: '{value}'")
    return 60 * int(match.group(1)) + seconds


def parse_count(value: str | None) -> int | None:
    """Parse integer boxscore counts, stripping any spurious '.0' suffix."""
    if value is None or value == "":
        return None
    val = str(value).strip()
    if val.endswith(".0"):
        val = val[:-2]
    if val == "":
        return None
    if not (val.isdigit() or (val.startswith("-") and val[1:].isdigit())):
        raise ValueError(f"malformed_count: '{value}'")
    return int(val)


def normalize_game_id(value: str) -> str:
    """Normalize game id to a 10-digit zero-padded ascii string."""
    val = str(value).strip()
    if not val.isascii() or not val.isdigit() or len(val) not in (8, 9, 10):
        raise ValueError(f"malformed_game_id: '{value}'")
    return val.zfill(10)


def canonical_phase_from_game_id(game_id: str, season_type_hint: str | None = None) -> str:
    """Determine canonical competition phase from 10-digit game id prefix and source hints."""
    prefix = game_id[:3]
    if prefix == "001":
        return "preseason"
    if prefix == "002":
        if season_type_hint == "nba-cup-final":
            return "cup_final"
        return "regular_season"
    if prefix == "004":
        return "playoffs"
    if prefix == "005":
        return "play_in"
    if prefix == "006":
        return "cup_final"
    return "unknown"


def canonical_hash(payload: object) -> str:
    """Compute deterministic SHA-256 digest of arbitrary structured payload."""
    serialized = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(serialized.encode("utf-8")).hexdigest()


def validate_stats(stats: dict[str, int | None]) -> None:
    """Validate internal count consistency and basketball points formula."""
    for made_key, att_key in (
        ("field_goals_made", "field_goals_attempted"),
        ("three_pointers_made", "three_pointers_attempted"),
        ("free_throws_made", "free_throws_attempted"),
        ("three_pointers_made", "field_goals_made"),
        ("three_pointers_attempted", "field_goals_attempted"),
    ):
        made = stats.get(made_key)
        att = stats.get(att_key)
        if made is not None and att is not None and made > att:
            raise ValueError(f"makes_exceed_attempts: {made_key}={made} > {att_key}={att}")

    fgm = stats.get("field_goals_made")
    three = stats.get("three_pointers_made")
    ftm = stats.get("free_throws_made")
    pts = stats.get("points")
    if fgm is not None and three is not None and ftm is not None and pts is not None:
        expected_pts = 2 * (fgm - three) + 3 * three + ftm
        if pts != expected_pts:
            msg = (
                f"point_formula_mismatch: declared={pts}, expected={expected_pts} "
                f"(fgm={fgm}, 3pm={three}, ftm={ftm})"
            )
            raise ValueError(msg)


def parse_schedule_file(path: Path) -> dict[str, dict[str, Any]]:
    """Parse schedule CSV (.csv or .csv.gz) or raw JSON into a game_id -> details lookup."""
    lookup: dict[str, dict[str, Any]] = {}

    if path.name.endswith(".json"):
        data = json.loads(path.read_text(encoding="utf-8"))
        league_sched = data.get("leagueSchedule", {})
        for gdate_entry in league_sched.get("gameDates", []):
            for game in gdate_entry.get("games", []):
                gid = normalize_game_id(game["gameId"])
                game_date_str = game.get("gameDateEst", "")[:10]
                tipoff = game.get("gameDateTimeUTC")
                status_num = game.get("gameStatus", 1)
                status = "final" if status_num == 3 else "scheduled"
                lookup[gid] = {
                    "game_id": gid,
                    "game_date": game_date_str,
                    "tipoff_utc": tipoff,
                    "phase": canonical_phase_from_game_id(gid),
                    "status": status,
                    "game_status": (
                        status_num
                        if isinstance(status_num, int)
                        else (3 if status == "final" else 1)
                    ),
                    "home_team_id": str(game.get("homeTeam", {}).get("teamId", "")),
                    "away_team_id": str(game.get("awayTeam", {}).get("teamId", "")),
                    "home_pts": game.get("homeTeam", {}).get("score"),
                    "away_pts": game.get("awayTeam", {}).get("score"),
                }
        return lookup

    def _read_rows(stream_obj: Any) -> dict[str, dict[str, Any]]:
        result: dict[str, dict[str, Any]] = {}
        reader = csv.DictReader(stream_obj)
        for row in reader:
            gid = normalize_game_id(row["game_id"])
            stype = row.get("season_type", "").lower()
            season_hint = "nba-cup-final" if stype == "nba-cup" else stype
            is_final = bool(row.get("home_pts") and row.get("away_pts"))
            result[gid] = {
                "game_id": gid,
                "game_date": row["game_date"][:10],
                "tipoff_utc": None,
                "phase": canonical_phase_from_game_id(gid, season_hint),
                "status": "final" if is_final else "scheduled",
                "game_status": 3 if is_final else 1,
                "home_team_id": str(row.get("home_team_id", "")),
                "away_team_id": str(row.get("away_team_id", "")),
                "home_pts": parse_count(row.get("home_pts")),
                "away_pts": parse_count(row.get("away_pts")),
            }
        return result

    if path.name.endswith(".gz"):
        with gzip.open(path, mode="rt", encoding="utf-8-sig") as gz_stream:
            return _read_rows(gz_stream)
    with path.open(mode="r", encoding="utf-8-sig") as txt_stream:
        return _read_rows(txt_stream)


def normalize_player_row(
    row: dict[str, str], schedule_lookup: dict[str, dict[str, Any]]
) -> dict[str, Any]:
    """Normalize a raw SportsDataverse player boxscore row."""
    gid = normalize_game_id(row["game_id"])
    sched_info = schedule_lookup.get(gid)
    if sched_info is None:
        raise ValueError(f"game_missing_from_schedule: {gid}")

    played_seconds = parse_minutes(row.get("minutes", ""))
    comment = (row.get("comment") or "").strip()

    if played_seconds is not None and played_seconds > 0:
        appearance = "appeared"
    elif comment.startswith(("DNP", "DND", "NWT", "Inactive", "Not With Team")):
        appearance = "reported_nonappearance"
    else:
        appearance = "unknown"

    stats: dict[str, int | None] = {
        field: parse_count(row.get(field)) for field in PLAYER_COUNT_FIELDS
    }
    validate_stats(stats)

    person_id = str(row["person_id"]).strip()
    team_id = str(row["team_id"]).strip()
    side = row.get("side", "").strip().lower()
    tricode = row.get("team_tricode", "").strip()

    return {
        "game_id": gid,
        "game_date": sched_info["game_date"],
        "phase": sched_info["phase"],
        "player_id": person_id,
        "person_id": person_id,
        "first_name": row.get("first_name", ""),
        "family_name": row.get("family_name", ""),
        "player_name": f"{row.get('first_name', '')} {row.get('family_name', '')}".strip(),
        "team_id": team_id,
        "team_tricode": tricode,
        "side": side,
        "minutes_original": row.get("minutes", ""),
        "minutes_seconds": played_seconds,
        "points": stats.get("points"),
        "comment": comment,
        "appearance": appearance,
        "stats": stats,
        "stats_json": stats,
    }


def normalize_team_row(
    row: dict[str, str], schedule_lookup: dict[str, dict[str, Any]]
) -> dict[str, Any]:
    """Normalize a raw SportsDataverse team boxscore row."""
    gid = normalize_game_id(row["game_id"])
    sched_info = schedule_lookup.get(gid)
    if sched_info is None:
        raise ValueError(f"game_missing_from_schedule: {gid}")

    team_seconds = parse_minutes(row.get("minutes", ""))
    stats: dict[str, int | None] = {
        field: parse_count(row.get(field)) for field in TEAM_COUNT_FIELDS
    }
    validate_stats(stats)

    pts = stats.get("points")
    if pts is None:
        raise ValueError(f"missing_team_points: game {gid}, team {row.get('team_id')}")

    return {
        "game_id": gid,
        "game_date": sched_info["game_date"],
        "phase": sched_info["phase"],
        "team_id": str(row["team_id"]).strip(),
        "team_tricode": row.get("team_tricode", "").strip(),
        "side": row.get("side", "").strip().lower(),
        "minutes_original": row.get("minutes", ""),
        "minutes_seconds": team_seconds,
        "points": pts,
        "stats": stats,
        "stats_json": stats,
    }


def reconcile_season(
    player_rows_iter: Iterator[dict[str, str]],
    team_rows_iter: Iterator[dict[str, str]],
    schedule_lookup: dict[str, dict[str, Any]],
) -> dict[str, Any]:
    """Reconcile entire player and team datasets for a season."""
    player_games: list[dict[str, Any]] = []
    team_games: list[dict[str, Any]] = []
    quarantined_player_rows: list[dict[str, Any]] = []
    quarantined_team_rows: list[dict[str, Any]] = []

    # 1. Parse player rows
    player_pts_sum: dict[tuple[str, str], int] = defaultdict(int)
    distinct_players: set[str] = set()
    distinct_player_games: set[str] = set()

    for idx, row in enumerate(player_rows_iter, start=2):
        try:
            norm_p = normalize_player_row(row, schedule_lookup)
            player_games.append(norm_p)
            distinct_players.add(norm_p["player_id"])
            distinct_player_games.add(norm_p["game_id"])
            if norm_p["stats"]["points"] is not None:
                player_pts_sum[(norm_p["game_id"], norm_p["team_id"])] += norm_p["stats"]["points"]
        except Exception as err:
            quarantined_player_rows.append({"row_index": idx, "row": row, "error": str(err)})

    # 2. Parse team rows
    teams_by_game: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for idx, row in enumerate(team_rows_iter, start=2):
        try:
            norm_t = normalize_team_row(row, schedule_lookup)
            team_games.append(norm_t)
            teams_by_game[norm_t["game_id"]].append(norm_t)
        except Exception as err:
            quarantined_team_rows.append({"row_index": idx, "row": row, "error": str(err)})

    # 3. Check team side matching and pair opponents
    opposing_side_mismatches: list[str] = []
    for gid, trows in teams_by_game.items():
        if len(trows) == 2:
            trows[0]["opponent_id"] = trows[1]["team_id"]
            trows[0]["opponent_tricode"] = trows[1]["team_tricode"]
            trows[0]["opponent_points"] = trows[1]["points"]

            trows[1]["opponent_id"] = trows[0]["team_id"]
            trows[1]["opponent_tricode"] = trows[0]["team_tricode"]
            trows[1]["opponent_points"] = trows[0]["points"]

            sides = {trows[0]["side"], trows[1]["side"]}
            if sides != {"home", "away"}:
                opposing_side_mismatches.append(f"{gid}: sides={sides}")
        else:
            opposing_side_mismatches.append(f"{gid}: count={len(trows)}")
            for tr in trows:
                tr.setdefault("opponent_id", "")
                tr.setdefault("opponent_tricode", "")
                tr.setdefault("opponent_points", 0)

    # 4. Check player points sum vs team points
    point_reconciliation_failures: list[dict[str, Any]] = []
    for t_game in team_games:
        key = (t_game["game_id"], t_game["team_id"])
        p_sum = player_pts_sum[key]
        if t_game["points"] != p_sum:
            point_reconciliation_failures.append(
                {
                    "game_id": t_game["game_id"],
                    "team_id": t_game["team_id"],
                    "team_points": t_game["points"],
                    "player_points_sum": p_sum,
                }
            )

    # 5. Enrich players with opponent info
    for norm_p in player_games:
        gid = norm_p["game_id"]
        trows = teams_by_game.get(gid, [])
        if len(trows) == 2:
            is_team_0 = (
                trows[0]["team_tricode"] == norm_p["team_tricode"]
                or trows[0]["team_id"] == norm_p["team_id"]
            )
            if is_team_0:
                norm_p["opponent_tricode"] = trows[1]["team_tricode"]
                norm_p["opponent_id"] = trows[1]["team_id"]
            else:
                norm_p["opponent_tricode"] = trows[0]["team_tricode"]
                norm_p["opponent_id"] = trows[0]["team_id"]
        else:
            sched_info = schedule_lookup.get(gid, {})
            h = sched_info.get("home_team_id", "")
            a = sched_info.get("away_team_id", "")
            norm_p["opponent_tricode"] = a if norm_p["team_tricode"] == h else h
            norm_p["opponent_id"] = norm_p["opponent_tricode"]

    return {
        "valid_player_rows": player_games,
        "valid_team_rows": team_games,
        "quarantined_player_rows": quarantined_player_rows,
        "quarantined_team_rows": quarantined_team_rows,
        "player_rows_count": len(player_games),
        "distinct_players_count": len(distinct_players),
        "distinct_player_games_count": len(distinct_player_games),
        "team_rows_count": len(team_games),
        "distinct_team_games_count": len(teams_by_game),
        "player_quarantines_count": len(quarantined_player_rows),
        "team_quarantines_count": len(quarantined_team_rows),
        "quarantined_player_rows_count": len(quarantined_player_rows),
        "quarantined_team_rows_count": len(quarantined_team_rows),
        "opposing_side_mismatches_count": len(opposing_side_mismatches),
        "point_reconciliation_failures_count": len(point_reconciliation_failures),
        "opposing_side_mismatches": opposing_side_mismatches,
        "point_reconciliation_failures": point_reconciliation_failures,
    }
