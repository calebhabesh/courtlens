"""Strict event-preserving ShotChartDetail transform and exact box reconciliation."""

from __future__ import annotations

import math
import re
from collections import Counter
from dataclasses import asdict, dataclass
from datetime import date, datetime
from itertools import pairwise
from typing import Any

from courtload.domain.rich_sources import classify_shot_zone, compute_payload_hash

TRANSFORM_VERSION = "courtload-shotchart-v1"
POLICY_VERSIONS = ("v1", "v2")
DISTANCE_TOLERANCE_FEET = 1.1
COUNT_FIELDS = (
    "field_goals_attempted",
    "field_goals_made",
    "three_pointers_attempted",
    "three_pointers_made",
)
REQUIRED_COLUMNS = {
    "GAME_ID",
    "GAME_EVENT_ID",
    "PLAYER_ID",
    "TEAM_ID",
    "PERIOD",
    "MINUTES_REMAINING",
    "SECONDS_REMAINING",
    "EVENT_TYPE",
    "SHOT_TYPE",
    "SHOT_DISTANCE",
    "LOC_X",
    "LOC_Y",
    "SHOT_ATTEMPTED_FLAG",
    "SHOT_MADE_FLAG",
    "GAME_DATE",
    "HTM",
    "VTM",
}


def integer(value: str, field: str, *, minimum: int = 0) -> int:
    if not re.fullmatch(r"[0-9]+", value):
        raise ValueError(f"invalid integer: {field}")
    result = int(value)
    if result < minimum:
        raise ValueError(f"out of range: {field}")
    return result


def game_identity(value: str, starting_year: int) -> str:
    if not re.fullmatch(r"[0-9]{1,10}", value):
        raise ValueError("invalid NBA GAME_ID")
    result = value.zfill(10)
    if result[:5] != f"002{starting_year % 100:02d}" or int(result[5:]) == 0:
        raise ValueError("wrong GAME_ID phase/season")
    return result


def optional_number(value: str, field: str) -> float | None:
    if value == "":
        return None
    try:
        result = float(value)
    except ValueError as exc:
        raise ValueError(f"invalid number: {field}") from exc
    if not math.isfinite(result):
        raise ValueError(f"nonfinite number: {field}")
    return result


@dataclass(frozen=True)
class ShotAttempt:
    game_id: str
    event_id: int
    player_id: str
    team_id: str
    game_date: str
    period: int
    seconds_remaining: int
    shot_value: int
    made: bool
    distance_feet: float | None
    x_feet: float | None
    y_feet: float | None
    home_tricode: str
    away_tricode: str
    source_line: int
    raw_fields_sha256: str
    geometry_exclusions: tuple[str, ...]
    zone: str

    def payload(self) -> dict[str, Any]:
        return asdict(self)


def parse_shot(row: dict[str, str], *, starting_year: int, source_line: int) -> ShotAttempt:
    if REQUIRED_COLUMNS - row.keys() or any(row[k] is None for k in REQUIRED_COLUMNS):
        raise ValueError("missing required shot fields")
    gid = game_identity(row["GAME_ID"], starting_year)
    event_id = integer(row["GAME_EVENT_ID"], "GAME_EVENT_ID", minimum=1)
    player_id = str(integer(row["PLAYER_ID"], "PLAYER_ID", minimum=1))
    team_id = str(integer(row["TEAM_ID"], "TEAM_ID", minimum=1))
    if row["SHOT_ATTEMPTED_FLAG"] != "1" or row["SHOT_MADE_FLAG"] not in {"0", "1"}:
        raise ValueError("unknown/non-attempt shot flag")
    made = row["SHOT_MADE_FLAG"] == "1"
    if row["EVENT_TYPE"] != ("Made Shot" if made else "Missed Shot"):
        raise ValueError("outcome/event contradiction")
    types = {"2PT Field Goal": 2, "3PT Field Goal": 3}
    if row["SHOT_TYPE"] not in types:
        raise ValueError("unknown SHOT_TYPE")
    shot_value = types[row["SHOT_TYPE"]]
    if not re.fullmatch(r"[0-9]{8}", row["GAME_DATE"]):
        raise ValueError("invalid GAME_DATE")
    game_date = datetime.strptime(row["GAME_DATE"], "%Y%m%d").date()
    if not date(starting_year, 7, 1) <= game_date < date(starting_year + 1, 7, 1):
        raise ValueError("GAME_DATE outside season")
    period = integer(row["PERIOD"], "PERIOD", minimum=1)
    minutes = integer(row["MINUTES_REMAINING"], "MINUTES_REMAINING")
    seconds = integer(row["SECONDS_REMAINING"], "SECONDS_REMAINING")
    remaining = minutes * 60 + seconds
    if period > 20 or seconds >= 60 or remaining > (720 if period <= 4 else 300):
        raise ValueError("invalid period clock")
    for field in ("HTM", "VTM"):
        if not re.fullmatch(r"[A-Z]{3}", row[field]):
            raise ValueError(f"invalid {field}")
    distance = optional_number(row["SHOT_DISTANCE"], "SHOT_DISTANCE")
    x = optional_number(row["LOC_X"], "LOC_X")
    y = optional_number(row["LOC_Y"], "LOC_Y")
    if any(v is not None and not v.is_integer() for v in (distance, x, y)):
        raise ValueError("noninteger ShotChartDetail geometry")
    x = x / 10 if x is not None else None
    y = y / 10 if y is not None else None
    reasons = []
    if distance is None:
        reasons.append("missing_distance")
    elif distance < 0:
        reasons.append("negative_distance")
    if x is None or y is None:
        reasons.append("missing_coordinates")
    else:
        if not (-25 <= x <= 25 and -5.25 <= y <= 88.75):
            reasons.append("off_court_coordinates")
        if distance is not None and abs(distance - math.hypot(x, y)) > DISTANCE_TOLERANCE_FEET:
            reasons.append("distance_coordinate_mismatch")
    zone = classify_shot_zone(x, y, distance, shot_value)[0] if not reasons else "Unknown"
    return ShotAttempt(
        gid,
        event_id,
        player_id,
        team_id,
        game_date.isoformat(),
        period,
        remaining,
        shot_value,
        made,
        distance,
        x,
        y,
        row["HTM"],
        row["VTM"],
        source_line,
        compute_payload_hash(row),
        tuple(reasons),
        zone,
    )


def counts(shots: list[ShotAttempt]) -> tuple[int, int, int, int]:
    return (
        len(shots),
        sum(s.made for s in shots),
        sum(s.shot_value == 3 for s in shots),
        sum(s.shot_value == 3 and s.made for s in shots),
    )


def box_counts(row: dict[str, str]) -> tuple[int, int, int, int]:
    result = tuple(integer(row[k], k) for k in COUNT_FIELDS)
    fga, fgm, tpa, tpm = result
    if fgm > fga or tpa > fga or tpm > tpa or tpm > fgm or fgm - tpm > fga - tpa:
        raise ValueError("impossible box shooting counts")
    return fga, fgm, tpa, tpm


def reconcile_game(
    shots: list[ShotAttempt],
    schedule: dict[str, str],
    teams: list[dict[str, str]],
    players: list[dict[str, str]],
    *,
    starting_year: int,
    policy_version: str = "v1",
) -> dict[str, Any]:
    """Compare all attempts before any geometry filter; fail the whole game on mismatch."""
    if policy_version not in POLICY_VERSIONS:
        raise ValueError("unknown shot admission policy")
    reasons: list[str] = []
    comparisons: list[dict[str, Any]] = []
    gid = game_identity(schedule["game_id"], starting_year)
    expected_teams = {schedule["home_team_id"], schedule["away_team_id"]}
    if (
        len(expected_teams) != 2
        or len(teams) != 2
        or {t["team_id"] for t in teams} != expected_teams
    ):
        reasons.append("missing_duplicate_or_unexpected_team_boxes")
    seen_players: set[str] = set()
    player_counts: dict[str, list[tuple[int, int, int, int]]] = {}

    def compare(
        kind: str, key: str, expected: tuple[int, int, int, int], actual: tuple[int, int, int, int]
    ) -> None:
        comparisons.append({"kind": kind, "id": key, "box_counts": expected, "shot_counts": actual})
        if expected != actual:
            reasons.append(f"{kind}_counts_mismatch:{key}")

    def validate_box(row: dict[str, str]) -> None:
        if (
            row["game_id"] != gid
            or row["season"] != str(starting_year + 1)
            or row["season_type_id"] != "2"
            or row["team_id"] not in expected_teams
        ):
            raise ValueError("box game/season/phase/team mismatch")
        side = "home" if row["team_id"] == schedule["home_team_id"] else "away"
        if row["side"] != side or row["team_tricode"] != schedule[f"{side}_team_abbreviation"]:
            raise ValueError("box side/tricode mismatch")

    if not shots:
        reasons.append("missing_shots")
    event_ids = Counter(s.event_id for s in shots)
    if any(n > 1 for n in event_ids.values()):
        reasons.append("duplicate_game_event")
    ordered = sorted(shots, key=lambda s: s.event_id)
    clock_violations = []
    for previous, current in pairwise(ordered):
        if current.period < previous.period or (
            current.period == previous.period
            and current.seconds_remaining > previous.seconds_remaining
        ):
            if policy_version == "v1":
                reasons.append("event_clock_order")
            clock_violations.append(
                {
                    "previous_event_id": previous.event_id,
                    "previous_period": previous.period,
                    "previous_seconds_remaining": previous.seconds_remaining,
                    "event_id": current.event_id,
                    "period": current.period,
                    "seconds_remaining": current.seconds_remaining,
                }
            )
    for shot in shots:
        if (
            shot.game_id != gid
            or shot.game_date != schedule["game_date"]
            or shot.team_id not in expected_teams
            or shot.home_tricode != schedule["home_team_abbreviation"]
            or shot.away_tricode != schedule["away_team_abbreviation"]
        ):
            reasons.append(f"shot_schedule_identity_mismatch:{shot.event_id}")
    for player in players:
        pid = player["person_id"]
        try:
            integer(pid, "person_id", minimum=1)
            validate_box(player)
            if pid in seen_players:
                raise ValueError("duplicate_player_box")
            seen_players.add(pid)
            expected = box_counts(player)
            player_counts.setdefault(player["team_id"], []).append(expected)
            selected = [s for s in shots if s.player_id == pid]
            if any(s.team_id != player["team_id"] for s in selected):
                reasons.append(f"player_team_mismatch:{pid}")
            compare("player", pid, expected, counts(selected))
        except (KeyError, ValueError) as exc:
            reasons.append(f"invalid_player_box:{pid}:{exc}")
    for pid in sorted({s.player_id for s in shots} - seen_players):
        reasons.append(f"unexpected_shooter:{pid}")
    for team in teams:
        tid = team["team_id"]
        try:
            validate_box(team)
            expected = box_counts(team)
            side = team["side"]
            points = integer(team["points"], "points")
            if points != integer(schedule[f"{side}_pts"], "schedule score"):
                raise ValueError("final_score_mismatch")
            ftm = integer(team["free_throws_made"], "free_throws_made")
            fta = integer(team["free_throws_attempted"], "free_throws_attempted")
            if ftm > fta or points != 2 * expected[1] + expected[3] + ftm:
                raise ValueError("team_scoring_conservation")
            compare("team", tid, expected, counts([s for s in shots if s.team_id == tid]))
            summed = tuple(sum(c[i] for c in player_counts.get(tid, [])) for i in range(4))
            if summed != expected:
                reasons.append(f"player_box_team_totals_mismatch:{tid}")
        except (KeyError, ValueError) as exc:
            reasons.append(f"invalid_team_box:{tid}:{exc}")
    geometry = [
        {
            "event_id": s.event_id,
            "reasons": s.geometry_exclusions,
            "distance_feet": s.distance_feet,
            "x_feet": s.x_feet,
            "y_feet": s.y_feet,
        }
        for s in shots
        if s.geometry_exclusions
    ]
    reasons = sorted(set(reasons))
    return {
        "game_id": gid,
        "game_date": schedule["game_date"],
        "status": "quarantined" if reasons else "reconciled",
        "reasons": reasons,
        "observed_attempts": len(shots),
        "geometry_eligible_attempts": sum(not s.geometry_exclusions for s in shots),
        "model_eligible_attempts": sum(not s.geometry_exclusions for s in shots)
        if not reasons
        else 0,
        "geometry_exclusions": geometry,
        "clock_order_violations": clock_violations,
        "comparisons": comparisons,
        "row_membership_sha256": compute_payload_hash([s.payload() for s in ordered]),
    }
