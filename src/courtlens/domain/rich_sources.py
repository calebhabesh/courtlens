"""Domain policies, schemas, coordinate normalization, and reconciliation for rich sources.

Implements Block B19 rich-source admission invariants:
- PBP event parsing and chronological order verification
- 5-on-5 on-court lineup verification
- Possession policy v1 (possession-policy-v1) and point conservation
- Shot coordinate normalization (tenths of feet to feet) and zone classification (shot-zones-v1)
- Defensive matchup pair reconciliation (matchup-pair-v1) and fractional possession semantics
- Provenance, SHA-256 signatures, and explicit quarantine/rejection reporting
"""

from __future__ import annotations

import csv
import gzip
import hashlib
import json
import math
import re
from collections.abc import Generator
from contextlib import contextmanager, suppress
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Final

POSSESSION_POLICY_VERSION: Final[str] = "possession-policy-v1"
SHOT_ZONES_VERSION: Final[str] = "shot-zones-v1"
MATCHUP_PAIR_VERSION: Final[str] = "matchup-pair-v1"
RICH_PARSER_SIGNATURE: Final[str] = "courtload-sdv-rich-v1"


def compute_payload_hash(data: Any) -> str:
    """Compute deterministic SHA-256 digest of arbitrary structured payload."""
    serialized = json.dumps(data, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(serialized.encode("utf-8")).hexdigest()


def parse_clock_to_seconds(clock_str: str | None, period: int = 1) -> float:
    """Parse ISO-8601 duration (PT11M41.00S) or MM:SS format into period seconds remaining.

    Period 1-4 standard: 720.0 seconds (12 min).
    Period 5+ (overtime): 300.0 seconds (5 min).
    """
    if not clock_str or clock_str.strip() == "":
        return 0.0

    raw = clock_str.strip()

    # ISO-8601 duration format: PT11M41.00S or PT05M00S
    iso_match = re.fullmatch(r"PT(?:(\d+)M)?(?:([\d.]+)S)?", raw)
    if iso_match:
        minutes = int(iso_match.group(1) or 0)
        seconds = float(iso_match.group(2) or 0.0)
        return minutes * 60.0 + seconds

    # MM:SS or M:SS format
    mm_ss_match = re.fullmatch(r"(\d+):(\d{1,2}(?:\.\d+)?)", raw)
    if mm_ss_match:
        minutes = int(mm_ss_match.group(1))
        seconds = float(mm_ss_match.group(2))
        return minutes * 60.0 + seconds

    try:
        return float(raw)
    except ValueError:
        return 0.0


# ---------------------------------------------------------------------------
# Shot Coordinate Normalization and Zone Classifier (shot-zones-v1)
# ---------------------------------------------------------------------------

# NBA court half-court dimensions:
# Width: 50 feet (x from -25.0 to +25.0)
# Basket is at (0, 0)
# Restricted area arc: 4.0 feet radius
# Paint (key): 16 feet wide (x from -8.0 to +8.0), 19 feet from baseline (y <= 14.25 from basket)
# Corner 3-point line: 22.0 feet from basket, parallel to sideline where y <= 14.0 feet
# Above the break 3-point arc: 23.75 feet radius from basket
# Backcourt boundary: distance > 43.0 feet or y > 43.0 feet


def normalize_shot_coordinates(
    x_legacy: float | int | str | None,
    y_legacy: float | int | str | None,
    shot_distance: float | int | str | None = None,
) -> tuple[float | None, float | None, bool]:
    """Normalize tenths-of-feet legacy coordinates to feet, validating present vs missing.

    Zero coordinates (0, 0) are only treated as present when the shot distance is
    consistent with an at-rim attempt (<= 3.0 feet).
    """
    if x_legacy is None or y_legacy is None:
        return None, None, False

    try:
        x_val = float(x_legacy)
        y_val = float(y_legacy)
    except (ValueError, TypeError):
        return None, None, False

    # Tenths of feet to feet
    x_feet = round(x_val / 10.0, 2)
    y_feet = round(y_val / 10.0, 2)

    dist: float | None = None
    if shot_distance is not None:
        try:
            dist = float(shot_distance)
        except (ValueError, TypeError):
            dist = None

    # Check for (0, 0) zero-fill placeholder on shots that were taken from distance
    if x_val == 0.0 and y_val == 0.0 and dist is not None and dist > 3.0:
        return None, None, False

    return x_feet, y_feet, True


def classify_shot_zone(
    coord_x_feet: float | None,
    coord_y_feet: float | None,
    shot_distance: float | None,
    shot_value: int = 2,
) -> tuple[str, str]:
    """Classify a shot into basic zone and distance range according to shot-zones-v1.

    Returns:
        tuple[zone_basic, zone_range]
    """
    if coord_x_feet is None or coord_y_feet is None:
        dist = shot_distance if shot_distance is not None else 0.0
        if dist < 8.0:
            rng = "Less Than 8 ft."
        elif dist < 16.0:
            rng = "8-16 ft."
        elif dist < 24.0:
            rng = "16-24 ft."
        else:
            rng = "24+ ft."
        return "Unknown", rng

    dist = (
        shot_distance
        if shot_distance is not None
        else round(math.hypot(coord_x_feet, coord_y_feet), 1)
    )

    # Backcourt
    if dist > 43.0 or coord_y_feet > 43.0:
        return "Backcourt", "Backcourt"

    # 3-Point attempts
    if shot_value == 3:
        # Corner 3: y <= 14.0 feet and abs(x) >= 22.0
        if coord_y_feet <= 14.0 and abs(coord_x_feet) >= 21.75:
            if coord_x_feet < 0:
                return "Left Corner 3", "24+ ft."
            return "Right Corner 3", "24+ ft."
        return "Above the Break 3", "24+ ft."

    # 2-Point attempts
    # Restricted Area: arc radius <= 4.0 feet
    if dist <= 4.0:
        return "Restricted Area", "Less Than 8 ft."

    # In The Paint (Non-RA): width <= 8.0 feet each side, y <= 14.25 feet from hoop
    if abs(coord_x_feet) <= 8.0 and coord_y_feet <= 14.25:
        range_cat = "Less Than 8 ft." if dist < 8.0 else "8-16 ft."
        return "In The Paint (Non-RA)", range_cat

    # Mid-Range: all other 2-point attempts outside paint
    range_cat = "8-16 ft." if dist < 16.0 else "16-24 ft."
    return "Mid-Range", range_cat


# ---------------------------------------------------------------------------
# Data Models and Parsers
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class NormalizedPbpEvent:
    game_id: str
    order_index: int
    action_number: int
    period: int
    clock: str
    seconds_remaining: float
    event_type: str
    action_type: str | None
    sub_type: str | None
    team_id: str | None
    person_id: str | None
    score_home: int
    score_away: int
    points_total: int
    shot_value: int | None
    shot_distance: float | None
    x_legacy: float | None
    y_legacy: float | None
    possession_number: int | None
    off_lineup: list[str]
    def_lineup: list[str]
    description: str | None
    video_available: bool
    source_hash: str


@dataclass(frozen=True)
class NormalizedPossession:
    game_id: str
    period: int
    possession_number: int
    number_in_period: int
    offense_team_id: str
    defense_team_id: str
    start_order_index: int
    end_order_index: int
    start_seconds_remaining: float
    end_seconds_remaining: float
    points: int
    is_second_chance: bool
    possession_start_type: str
    count_as_possession: bool
    stats_json: dict[str, int]
    off_lineup: list[str]
    def_lineup: list[str]
    lineup_source: str
    policy_version: str
    source_hash: str


@dataclass(frozen=True)
class NormalizedLineupStint:
    game_id: str
    action_number: int
    period: int
    home_lineup: list[str]
    away_lineup: list[str]
    source_hash: str


@dataclass(frozen=True)
class NormalizedShot:
    game_id: str
    period: int
    clock: str
    seconds_remaining: float | None
    team_id: str
    person_id: str
    player_name: str | None
    action_type: str | None
    sub_type: str | None
    shot_result: str
    is_made: bool
    shot_value: int
    points: int
    shot_distance: float
    x_legacy: float | None
    y_legacy: float | None
    coord_x_feet: float | None
    coord_y_feet: float | None
    coordinates_present: bool
    zone_basic: str
    zone_range: str
    score_home: int | None
    score_away: int | None
    description: str | None
    source_hash: str


@dataclass(frozen=True)
class NormalizedMatchup:
    game_id: str
    off_team_id: str
    def_team_id: str
    side: str
    off_person_id: str
    off_player_name: str | None
    def_person_id: str
    def_player_name: str | None
    matchup_minutes: str
    matchup_seconds: float
    partial_possessions: float
    pct_defender_total_time: float | None
    pct_offensive_total_time: float | None
    pct_total_time_both_on: float | None
    switches_on: int
    player_points: int
    team_points: int
    matchup_assists: int
    matchup_potential_assists: int
    matchup_turnovers: int
    matchup_blocks: int
    matchup_fgm: int
    matchup_fga: int
    matchup_fg_pct: float | None
    matchup_fg3m: int
    matchup_fg3a: int
    matchup_fg3_pct: float | None
    help_blocks: int
    help_fgm: int
    help_fga: int
    help_fg_pct: float | None
    matchup_ftm: int
    matchup_fta: int
    shooting_fouls: int
    source_hash: str


@dataclass
class RejectedGameRecord:
    game_id: str
    source_family: str
    rejection_code: str
    detail: str


@dataclass
class RichAdmissionSummary:
    season: str
    source_family: str
    total_games_expected: int
    total_games_observed: int
    total_games_admitted: int
    total_games_rejected: int
    rejected_games: list[RejectedGameRecord] = field(default_factory=list)
    reconciliation_summary: dict[str, Any] = field(default_factory=dict)
    source_sha256: str = ""
    source_bytes: int = 0
    parser_signature: str = RICH_PARSER_SIGNATURE
    policy_version: str = POSSESSION_POLICY_VERSION


# ---------------------------------------------------------------------------
# File Stream Readers & Normalized Generators
# ---------------------------------------------------------------------------


@contextmanager
def open_file_stream(file_path: Path) -> Generator[Any, None, None]:
    """Open plain or gzip-compressed file stream transparently."""
    if file_path.name.endswith(".gz"):
        with gzip.open(file_path, "rt", encoding="utf-8-sig") as gz:
            yield gz
    else:
        with file_path.open("r", encoding="utf-8-sig") as fh:
            yield fh


def parse_pbp_stream(
    stream: Any,
    target_game_ids: set[str] | None = None,
    limit_games: int | None = None,
) -> tuple[dict[str, list[NormalizedPbpEvent]], list[RejectedGameRecord]]:
    """Parse raw SportsDataverse PBP rows into NormalizedPbpEvents grouped by game."""
    reader = csv.DictReader(stream)
    games_events: dict[str, list[NormalizedPbpEvent]] = {}
    rejected: list[RejectedGameRecord] = []
    seen_game_ids: set[str] = set()

    for row in reader:
        gid = str(row.get("game_id", "")).strip().zfill(10)
        if not gid or len(gid) != 10:
            continue
        if target_game_ids is not None and gid not in target_game_ids:
            continue

        if gid not in seen_game_ids:
            if limit_games is not None and len(seen_game_ids) >= limit_games:
                break
            seen_game_ids.add(gid)
            games_events[gid] = []

        try:
            order_idx = int(row.get("order_index", 0) or 0)
            act_num = int(row.get("action_number", 0) or 0)
            period = int(row.get("period", 1) or 1)
            clock = str(row.get("clock", "")).strip()

            sec_rem = parse_clock_to_seconds(clock, period)
            if row.get("seconds_remaining"):
                with suppress(ValueError):
                    sec_rem = float(row["seconds_remaining"])

            # Extract 5-man lineups
            off_lineup = [
                str(row.get(f"off_player_{i}", "")).strip()
                for i in range(1, 6)
                if row.get(f"off_player_{i}")
            ]
            def_lineup = [
                str(row.get(f"def_player_{i}", "")).strip()
                for i in range(1, 6)
                if row.get(f"def_player_{i}")
            ]

            x_leg = float(row["x_legacy"]) if row.get("x_legacy") not in (None, "") else None
            y_leg = float(row["y_legacy"]) if row.get("y_legacy") not in (None, "") else None
            shot_dist = (
                float(row["shot_distance"]) if row.get("shot_distance") not in (None, "") else None
            )
            shot_val = int(row["shot_value"]) if row.get("shot_value") not in (None, "") else None
            poss_num = (
                int(row["possession_number"])
                if row.get("possession_number") not in (None, "")
                else None
            )

            raw_hash = compute_payload_hash(
                {
                    "gid": gid,
                    "order": order_idx,
                    "act": act_num,
                    "period": period,
                    "clock": clock,
                    "desc": row.get("description", ""),
                }
            )

            event = NormalizedPbpEvent(
                game_id=gid,
                order_index=order_idx,
                action_number=act_num,
                period=period,
                clock=clock,
                seconds_remaining=sec_rem,
                event_type=str(row.get("event_type", "unknown")),
                action_type=row.get("action_type") or None,
                sub_type=row.get("sub_type") or None,
                team_id=str(row.get("team_id")) if row.get("team_id") else None,
                person_id=str(row.get("person_id")) if row.get("person_id") else None,
                score_home=int(row.get("score_home", 0) or 0),
                score_away=int(row.get("score_away", 0) or 0),
                points_total=int(row.get("points_total", 0) or 0),
                shot_value=shot_val,
                shot_distance=shot_dist,
                x_legacy=x_leg,
                y_legacy=y_leg,
                possession_number=poss_num,
                off_lineup=off_lineup,
                def_lineup=def_lineup,
                description=row.get("description") or None,
                video_available=str(row.get("video_available", "0")).lower() in ("1", "true"),
                source_hash=raw_hash,
            )
            games_events[gid].append(event)
        except Exception as exc:
            rejected.append(
                RejectedGameRecord(
                    game_id=gid,
                    source_family="pbp",
                    rejection_code="pbp_row_parse_error",
                    detail=str(exc),
                )
            )

    return games_events, rejected


def parse_possessions_stream(
    stream: Any,
    target_game_ids: set[str] | None = None,
    limit_games: int | None = None,
) -> tuple[dict[str, list[NormalizedPossession]], list[RejectedGameRecord]]:
    """Parse raw SportsDataverse possessions rows into NormalizedPossessions."""
    reader = csv.DictReader(stream)
    games_poss: dict[str, list[NormalizedPossession]] = {}
    rejected: list[RejectedGameRecord] = []
    seen_game_ids: set[str] = set()

    for row in reader:
        gid = str(row.get("game_id", "")).strip().zfill(10)
        if not gid or len(gid) != 10:
            continue
        if target_game_ids is not None and gid not in target_game_ids:
            continue

        if gid not in seen_game_ids:
            if limit_games is not None and len(seen_game_ids) >= limit_games:
                break
            seen_game_ids.add(gid)
            games_poss[gid] = []

        try:
            poss_num = int(row.get("possession_number", 1) or 1)
            period = int(row.get("period", 1) or 1)
            number_in_period = int(row.get("number_in_period", 1) or 1)
            off_team = str(row.get("offense_team_id", "")).strip()
            def_team = str(row.get("defense_team_id", "")).strip()
            start_order = int(row.get("start_order_index", 0) or 0)
            end_order = int(row.get("end_order_index", 0) or 0)
            start_sec = float(row.get("start_seconds_remaining", 720.0) or 720.0)
            end_sec = float(row.get("end_seconds_remaining", 700.0) or 700.0)
            pts = int(row.get("points", 0) or 0)
            is_second_chance = str(row.get("is_second_chance", "false")).lower() in ("true", "1")
            count_as = str(row.get("count_as_possession", "true")).lower() in ("true", "1")
            start_type = str(row.get("possession_start_type", "OffDeadball"))

            stats = {
                "fg2a": int(row.get("fg2a", 0) or 0),
                "fg2m": int(row.get("fg2m", 0) or 0),
                "fg3a": int(row.get("fg3a", 0) or 0),
                "fg3m": int(row.get("fg3m", 0) or 0),
                "fta": int(row.get("fta", 0) or 0),
                "ftm": int(row.get("ftm", 0) or 0),
                "oreb": int(row.get("oreb", 0) or 0),
                "dreb": int(row.get("dreb", 0) or 0),
                "tov": int(row.get("tov", 0) or 0),
            }

            off_lineup = [
                str(row.get(f"off_player_{i}", "")).strip()
                for i in range(1, 6)
                if row.get(f"off_player_{i}")
            ]
            def_lineup = [
                str(row.get(f"def_player_{i}", "")).strip()
                for i in range(1, 6)
                if row.get(f"def_player_{i}")
            ]

            raw_hash = compute_payload_hash(
                {
                    "gid": gid,
                    "poss_num": poss_num,
                    "period": period,
                    "off_team": off_team,
                    "pts": pts,
                }
            )

            poss = NormalizedPossession(
                game_id=gid,
                period=period,
                possession_number=poss_num,
                number_in_period=number_in_period,
                offense_team_id=off_team,
                defense_team_id=def_team,
                start_order_index=start_order,
                end_order_index=end_order,
                start_seconds_remaining=start_sec,
                end_seconds_remaining=end_sec,
                points=pts,
                is_second_chance=is_second_chance,
                possession_start_type=start_type,
                count_as_possession=count_as,
                stats_json=stats,
                off_lineup=off_lineup,
                def_lineup=def_lineup,
                lineup_source=str(row.get("lineup_source", "quarter_box")),
                policy_version=POSSESSION_POLICY_VERSION,
                source_hash=raw_hash,
            )
            games_poss[gid].append(poss)
        except Exception as exc:
            rejected.append(
                RejectedGameRecord(
                    game_id=gid,
                    source_family="possessions",
                    rejection_code="possession_parse_error",
                    detail=str(exc),
                )
            )

    return games_poss, rejected


def parse_lineups_stream(
    stream: Any,
    target_game_ids: set[str] | None = None,
    limit_games: int | None = None,
) -> tuple[dict[str, list[NormalizedLineupStint]], list[RejectedGameRecord]]:
    """Parse raw SportsDataverse lineup stint rows."""
    reader = csv.DictReader(stream)
    games_lineups: dict[str, list[NormalizedLineupStint]] = {}
    rejected: list[RejectedGameRecord] = []
    seen_game_ids: set[str] = set()

    for row in reader:
        gid = str(row.get("game_id", "")).strip().zfill(10)
        if not gid or len(gid) != 10:
            continue
        if target_game_ids is not None and gid not in target_game_ids:
            continue

        if gid not in seen_game_ids:
            if limit_games is not None and len(seen_game_ids) >= limit_games:
                break
            seen_game_ids.add(gid)
            games_lineups[gid] = []

        try:
            act_num = int(row.get("action_number", 0) or 0)
            period = int(row.get("period", 1) or 1)

            home_lineup = [
                str(row.get(f"home_player_{i}", "")).strip()
                for i in range(1, 6)
                if row.get(f"home_player_{i}")
            ]
            away_lineup = [
                str(row.get(f"away_player_{i}", "")).strip()
                for i in range(1, 6)
                if row.get(f"away_player_{i}")
            ]

            raw_hash = compute_payload_hash(
                {"gid": gid, "act": act_num, "home": home_lineup, "away": away_lineup}
            )

            stint = NormalizedLineupStint(
                game_id=gid,
                action_number=act_num,
                period=period,
                home_lineup=home_lineup,
                away_lineup=away_lineup,
                source_hash=raw_hash,
            )
            games_lineups[gid].append(stint)
        except Exception as exc:
            rejected.append(
                RejectedGameRecord(
                    game_id=gid,
                    source_family="lineups",
                    rejection_code="lineup_parse_error",
                    detail=str(exc),
                )
            )

    return games_lineups, rejected


def parse_shots_stream(
    stream: Any,
    target_game_ids: set[str] | None = None,
    limit_games: int | None = None,
) -> tuple[dict[str, list[NormalizedShot]], list[RejectedGameRecord]]:
    """Parse raw SportsDataverse shot events into NormalizedShots with zone classification."""
    reader = csv.DictReader(stream)
    games_shots: dict[str, list[NormalizedShot]] = {}
    rejected: list[RejectedGameRecord] = []
    seen_game_ids: set[str] = set()

    for row in reader:
        gid = str(row.get("game_id", "")).strip().zfill(10)
        if not gid or len(gid) != 10:
            continue
        if target_game_ids is not None and gid not in target_game_ids:
            continue

        if gid not in seen_game_ids:
            if limit_games is not None and len(seen_game_ids) >= limit_games:
                break
            seen_game_ids.add(gid)
            games_shots[gid] = []

        try:
            period = int(row.get("period", 1) or 1)
            clock = str(row.get("clock", "")).strip()
            sec_rem = parse_clock_to_seconds(clock, period)
            team_id = str(row.get("team_id", "")).strip()
            person_id = str(row.get("person_id", "")).strip()
            player_name = row.get("player_name") or None
            act_type = row.get("action_type") or None
            sub_type = row.get("sub_type") or None
            shot_res = str(row.get("shot_result", "Missed")).strip()
            is_made = shot_res.lower() in ("made", "1", "true")
            shot_val = int(row.get("shot_value", 2) or 2)
            points = shot_val if is_made else 0

            shot_dist_val = (
                float(row["shot_distance"]) if row.get("shot_distance") not in (None, "") else 0.0
            )
            raw_x = row.get("x_legacy")
            raw_y = row.get("y_legacy")

            x_leg = float(str(raw_x)) if raw_x not in (None, "") else None
            y_leg = float(str(raw_y)) if raw_y not in (None, "") else None

            coord_x, coord_y, coords_present = normalize_shot_coordinates(
                x_leg, y_leg, shot_dist_val
            )

            zone_basic, zone_range = classify_shot_zone(
                coord_x, coord_y, shot_dist_val, shot_value=shot_val
            )

            score_h = int(row["score_home"]) if row.get("score_home") not in (None, "") else None
            score_a = int(row["score_away"]) if row.get("score_away") not in (None, "") else None

            raw_hash = compute_payload_hash(
                {
                    "gid": gid,
                    "period": period,
                    "clock": clock,
                    "pid": person_id,
                    "x": x_leg,
                    "y": y_leg,
                    "val": shot_val,
                    "res": shot_res,
                }
            )

            shot = NormalizedShot(
                game_id=gid,
                period=period,
                clock=clock,
                seconds_remaining=sec_rem,
                team_id=team_id,
                person_id=person_id,
                player_name=player_name,
                action_type=act_type,
                sub_type=sub_type,
                shot_result=shot_res,
                is_made=is_made,
                shot_value=shot_val,
                points=points,
                shot_distance=shot_dist_val,
                x_legacy=x_leg,
                y_legacy=y_leg,
                coord_x_feet=coord_x,
                coord_y_feet=coord_y,
                coordinates_present=coords_present,
                zone_basic=zone_basic,
                zone_range=zone_range,
                score_home=score_h,
                score_away=score_a,
                description=row.get("description") or None,
                source_hash=raw_hash,
            )
            games_shots[gid].append(shot)
        except Exception as exc:
            rejected.append(
                RejectedGameRecord(
                    game_id=gid,
                    source_family="shots",
                    rejection_code="shot_parse_error",
                    detail=str(exc),
                )
            )

    return games_shots, rejected


def parse_matchups_stream(
    stream: Any,
    target_game_ids: set[str] | None = None,
    limit_games: int | None = None,
) -> tuple[dict[str, list[NormalizedMatchup]], list[RejectedGameRecord]]:
    """Parse raw SportsDataverse matchup records into NormalizedMatchup objects."""
    reader = csv.DictReader(stream)
    games_matchups: dict[str, list[NormalizedMatchup]] = {}
    rejected: list[RejectedGameRecord] = []
    seen_game_ids: set[str] = set()

    for row in reader:
        gid = str(row.get("game_id", "")).strip().zfill(10)
        if not gid or len(gid) != 10:
            continue
        if target_game_ids is not None and gid not in target_game_ids:
            continue

        if gid not in seen_game_ids:
            if limit_games is not None and len(seen_game_ids) >= limit_games:
                break
            seen_game_ids.add(gid)
            games_matchups[gid] = []

        try:
            off_team = str(row.get("off_team_id", "")).strip()
            def_team = str(row.get("def_team_id", "")).strip()
            side = str(row.get("side", "home")).strip().lower()
            off_pid = str(row.get("off_person_id", "")).strip()
            def_pid = str(row.get("def_person_id", "")).strip()

            off_name = (
                f"{row.get('off_first_name', '')} {row.get('off_family_name', '')}".strip() or None
            )
            def_name = (
                f"{row.get('def_first_name', '')} {row.get('def_family_name', '')}".strip() or None
            )

            mm_str = str(row.get("matchup_minutes", "0:00")).strip()
            mm_sec = (
                float(row["matchup_minutes_sort"])
                if row.get("matchup_minutes_sort") not in (None, "")
                else 0.0
            )
            part_poss = (
                float(row["partial_possessions"])
                if row.get("partial_possessions") not in (None, "")
                else 0.0
            )

            pct_def = (
                float(row["percentage_defender_total_time"])
                if row.get("percentage_defender_total_time") not in (None, "")
                else None
            )
            pct_off = (
                float(row["percentage_offensive_total_time"])
                if row.get("percentage_offensive_total_time") not in (None, "")
                else None
            )
            pct_both = (
                float(row["percentage_total_time_both_on"])
                if row.get("percentage_total_time_both_on") not in (None, "")
                else None
            )

            switches = int(row.get("switches_on", 0) or 0)
            p_pts = int(row.get("player_points", 0) or 0)
            t_pts = int(row.get("team_points", 0) or 0)
            ast = int(row.get("matchup_assists", 0) or 0)
            pot_ast = int(row.get("matchup_potential_assists", 0) or 0)
            tov = int(row.get("matchup_turnovers", 0) or 0)
            blk = int(row.get("matchup_blocks", 0) or 0)

            fgm = int(row.get("matchup_field_goals_made", 0) or 0)
            fga = int(row.get("matchup_field_goals_attempted", 0) or 0)
            fg_pct = (
                float(row["matchup_field_goals_percentage"])
                if row.get("matchup_field_goals_percentage") not in (None, "")
                else (fgm / fga if fga > 0 else None)
            )

            fg3m = int(row.get("matchup_three_pointers_made", 0) or 0)
            fg3a = int(row.get("matchup_three_pointers_attempted", 0) or 0)
            fg3_pct = (
                float(row["matchup_three_pointers_percentage"])
                if row.get("matchup_three_pointers_percentage") not in (None, "")
                else (fg3m / fg3a if fg3a > 0 else None)
            )

            h_blk = int(row.get("help_blocks", 0) or 0)
            h_fgm = int(row.get("help_field_goals_made", 0) or 0)
            h_fga = int(row.get("help_field_goals_attempted", 0) or 0)
            h_pct = (
                float(row["help_field_goals_percentage"])
                if row.get("help_field_goals_percentage") not in (None, "")
                else (h_fgm / h_fga if h_fga > 0 else None)
            )

            ftm = int(row.get("matchup_free_throws_made", 0) or 0)
            fta = int(row.get("matchup_free_throws_attempted", 0) or 0)
            fouls = int(row.get("shooting_fouls", 0) or 0)

            raw_hash = compute_payload_hash(
                {
                    "gid": gid,
                    "off_pid": off_pid,
                    "def_pid": def_pid,
                    "mm": mm_str,
                    "part_poss": part_poss,
                }
            )

            matchup = NormalizedMatchup(
                game_id=gid,
                off_team_id=off_team,
                def_team_id=def_team,
                side=side,
                off_person_id=off_pid,
                off_player_name=off_name,
                def_person_id=def_pid,
                def_player_name=def_name,
                matchup_minutes=mm_str,
                matchup_seconds=mm_sec,
                partial_possessions=part_poss,
                pct_defender_total_time=pct_def,
                pct_offensive_total_time=pct_off,
                pct_total_time_both_on=pct_both,
                switches_on=switches,
                player_points=p_pts,
                team_points=t_pts,
                matchup_assists=ast,
                matchup_potential_assists=pot_ast,
                matchup_turnovers=tov,
                matchup_blocks=blk,
                matchup_fgm=fgm,
                matchup_fga=fga,
                matchup_fg_pct=fg_pct,
                matchup_fg3m=fg3m,
                matchup_fg3a=fg3a,
                matchup_fg3_pct=fg3_pct,
                help_blocks=h_blk,
                help_fgm=h_fgm,
                help_fga=h_fga,
                help_fg_pct=h_pct,
                matchup_ftm=ftm,
                matchup_fta=fta,
                shooting_fouls=fouls,
                source_hash=raw_hash,
            )
            games_matchups[gid].append(matchup)
        except Exception as exc:
            rejected.append(
                RejectedGameRecord(
                    game_id=gid,
                    source_family="matchups",
                    rejection_code="matchup_parse_error",
                    detail=str(exc),
                )
            )

    return games_matchups, rejected


# ---------------------------------------------------------------------------
# Strict Invariant Reconciliation & Quarantine Checkers
# ---------------------------------------------------------------------------


def validate_game_pbp_invariants(
    game_id: str, events: list[NormalizedPbpEvent]
) -> tuple[bool, str | None]:
    """Validate PBP chronology, period sequence, and 5-player on-court sides."""
    if not events:
        return False, "pbp_no_events"

    # Sort events by order_index
    sorted_events = sorted(events, key=lambda e: (e.period, e.order_index))

    # Period continuity
    periods = {e.period for e in sorted_events}
    if not periods:
        return False, "pbp_no_periods"

    # Check that maximum period contains at least 1 event
    for p in range(1, max(periods) + 1):
        if p not in periods:
            return False, f"pbp_missing_period_{p}"

    # Check clock sequence: within same period, seconds_remaining should not increase
    # allowing 1.0s tolerance for clock adjustments/resets
    curr_period = 1
    last_sec = 725.0
    for e in sorted_events:
        if e.period != curr_period:
            curr_period = e.period
            last_sec = 305.0 if curr_period >= 5 else 725.0

        if e.seconds_remaining > last_sec + 2.0:
            # Significant backward clock jump
            return (
                False,
                f"clock_inversion_period_{curr_period}_sec_{e.seconds_remaining}_after_{last_sec}",
            )
        last_sec = e.seconds_remaining

        # When on-court lineups are present, must have 5 players
        if e.off_lineup and len(e.off_lineup) != 5:
            return False, f"invalid_off_lineup_count_{len(e.off_lineup)}"
        if e.def_lineup and len(e.def_lineup) != 5:
            return False, f"invalid_def_lineup_count_{len(e.def_lineup)}"

    return True, None


def validate_game_possessions_invariants(
    game_id: str,
    possessions: list[NormalizedPossession],
    team_points_lookup: dict[str, int] | None = None,
) -> tuple[bool, str | None]:
    """Validate possession numbers, order, 5-man lineups, and team point conservation."""
    if not possessions:
        return False, "possessions_empty"

    sorted_poss = sorted(possessions, key=lambda p: (p.period, p.possession_number))

    # Check 5-man lineups on each possession
    team_points_accum: dict[str, int] = {}
    for p in sorted_poss:
        if p.off_lineup and len(set(p.off_lineup)) != 5:
            return False, f"poss_{p.possession_number}_invalid_off_lineup_{len(p.off_lineup)}"
        if p.def_lineup and len(set(p.def_lineup)) != 5:
            return False, f"poss_{p.possession_number}_invalid_def_lineup_{len(p.def_lineup)}"

        team_points_accum[p.offense_team_id] = (
            team_points_accum.get(p.offense_team_id, 0) + p.points
        )

    # Point conservation against team box score if provided
    if team_points_lookup:
        for team_id, expected_pts in team_points_lookup.items():
            actual_pts = team_points_accum.get(team_id, 0)
            if actual_pts != expected_pts:
                # Small tolerance of 0 points for strict conservation
                return (
                    False,
                    f"point_conservation_mismatch_{team_id}_exp_{expected_pts}_act_{actual_pts}",
                )

    return True, None


def validate_game_shots_invariants(
    game_id: str,
    shots: list[NormalizedShot],
    boxscore_fga_lookup: dict[str, int] | None = None,
    boxscore_fgm_lookup: dict[str, int] | None = None,
) -> tuple[bool, str | None]:
    """Validate shot outcomes, point values, makes <= attempts, and joins to box score."""
    if not shots:
        return False, "shots_empty"

    player_fga: dict[str, int] = {}
    player_fgm: dict[str, int] = {}

    for s in shots:
        if s.shot_value not in (2, 3):
            return False, f"invalid_shot_value_{s.shot_value}"
        if s.is_made and s.points != s.shot_value:
            return False, f"made_shot_points_mismatch_{s.points}_vs_{s.shot_value}"
        if not s.is_made and s.points != 0:
            return False, f"missed_shot_nonzero_points_{s.points}"

        player_fga[s.person_id] = player_fga.get(s.person_id, 0) + 1
        if s.is_made:
            player_fgm[s.person_id] = player_fgm.get(s.person_id, 0) + 1

    # Check player box-score FGA/FGM reconciliation if lookup provided
    if boxscore_fga_lookup:
        for pid, exp_fga in boxscore_fga_lookup.items():
            act_fga = player_fga.get(pid, 0)
            if exp_fga > 0 and act_fga != exp_fga:
                # Report difference
                return False, f"player_{pid}_fga_mismatch_exp_{exp_fga}_act_{act_fga}"

    if boxscore_fgm_lookup:
        for pid, exp_fgm in boxscore_fgm_lookup.items():
            act_fgm = player_fgm.get(pid, 0)
            if exp_fgm > 0 and act_fgm != exp_fgm:
                return False, f"player_{pid}_fgm_mismatch_exp_{exp_fgm}_act_{act_fgm}"

    return True, None


def validate_game_matchups_invariants(
    game_id: str,
    matchups: list[NormalizedMatchup],
    active_player_ids: set[str] | None = None,
) -> tuple[bool, str | None]:
    """Validate defensive matchup assignments, positive minutes, and roster participation."""
    if not matchups:
        return False, "matchups_empty"

    for m in matchups:
        if not m.off_person_id or not m.def_person_id:
            return False, "missing_matchup_player_id"
        if m.off_person_id == m.def_person_id:
            return False, f"same_offensive_and_defensive_player_{m.off_person_id}"
        if m.matchup_seconds < 0:
            return False, f"negative_matchup_seconds_{m.matchup_seconds}"
        if m.matchup_fgm > m.matchup_fga:
            return False, f"matchup_fgm_exceeds_fga_{m.matchup_fgm}_vs_{m.matchup_fga}"
        if m.matchup_fg3m > m.matchup_fg3a:
            return False, f"matchup_fg3m_exceeds_fg3a_{m.matchup_fg3m}_vs_{m.matchup_fg3a}"
        if m.matchup_ftm > m.matchup_fta:
            return False, f"matchup_ftm_exceeds_fta_{m.matchup_ftm}_vs_{m.matchup_fta}"

        if active_player_ids:
            if m.off_person_id not in active_player_ids:
                return False, f"off_player_{m.off_person_id}_not_in_box_scores"
            if m.def_person_id not in active_player_ids:
                return False, f"def_player_{m.def_person_id}_not_in_box_scores"

    return True, None
