"""Fail-closed reconstruction from retained NBA responses, never derived lineups.

This candidate boundary deliberately does not grant possession/DB admission.
Rotation times are elapsed tenths; event clocks retain exact decimal seconds.
"""

from __future__ import annotations

import hashlib
import json
import re
import unicodedata
from collections import Counter, defaultdict
from decimal import Decimal
from itertools import pairwise
from typing import Any

VERSION = "nba-native-reconstruction-v1"
MINUTE_TOLERANCE = Decimal("1")


def name_key(value: str) -> str:
    """NBA PBP omits box-name accents; collisions remain unresolved."""
    return "".join(
        c for c in unicodedata.normalize("NFKD", value) if not unicodedata.combining(c)
    ).casefold()


def content_hash(value: Any) -> str:
    return hashlib.sha256(
        json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()
    ).hexdigest()


def period_start(period: int) -> Decimal:
    if period < 1:
        raise ValueError("nonpositive period")
    return Decimal(720 * min(period - 1, 4) + 300 * max(period - 5, 0))


def clock_seconds(raw: str) -> Decimal:
    match = re.fullmatch(r"PT(\d+)M(\d+(?:\.\d+)?)S", raw)
    if match is None or Decimal(match[2]) >= 60:
        raise ValueError(f"invalid clock: {raw}")
    return Decimal(match[1]) * 60 + Decimal(match[2])


def minute_seconds(raw: str) -> Decimal:
    match = re.fullmatch(r"(\d+):(\d{2}(?:\.\d+)?)", raw)
    if match is None or Decimal(match[2]) >= 60:
        raise ValueError(f"unknown/invalid minutes: {raw!r}")
    return Decimal(match[1]) * 60 + Decimal(match[2])


def reconstruct_native_game(
    pbp: dict[str, Any],
    rotation: dict[str, Any],
    box: dict[str, Any],
    opening_boxes: dict[str, Any],
    input_hashes: dict[str, str],
) -> dict[str, Any]:
    """Return full event lineups, interval candidates and every reconciliation error.

    Starters use observed rotation interval boundaries, checked against explicit
    P1 box positions and later positive-minute opening-window rows. Disagreement
    quarantines the candidate; neither evidence is silently rewritten.
    Substitution personId is the outgoing player in this native schema; incoming
    names must uniquely resolve within the independent team's box roster.
    Source event order is preserved; actionNumber is never a lookup identity.
    """
    errors: list[dict[str, Any]] = []

    def reject(reason: str, **detail: Any) -> None:
        errors.append({"reason": reason, **detail})

    game = pbp["game"]
    gid = str(game["gameId"])
    b = box["boxScoreTraditional"]
    if str(b["gameId"]) != gid:
        raise ValueError("PBP/box game mismatch")
    actions = game["actions"]
    if not actions:
        raise ValueError("empty native PBP")
    periods = sorted({int(a["period"]) for a in actions})
    if periods != list(range(1, max(periods) + 1)) or max(periods) < 4:
        raise ValueError("incomplete periods")
    for period in periods:
        rows = [a for a in actions if int(a["period"]) == period]
        length = Decimal(720 if period <= 4 else 300)
        if clock_seconds(rows[0]["clock"]) != length or clock_seconds(rows[-1]["clock"]) != 0:
            raise ValueError("missing native period endpoints")
    duration = period_start(max(periods) + 1)
    sides = {side: str(b[f"{side}TeamId"]) for side in ("home", "away")}
    roster: dict[str, dict[str, Any]] = {}
    names: dict[str, dict[str, set[str]]] = defaultdict(lambda: defaultdict(set))
    alias_evidence = []
    for side, team in sides.items():
        for player in b[f"{side}Team"]["players"]:
            pid = str(player["personId"])
            if pid in roster:
                raise ValueError("duplicate box player identity")
            roster[pid] = {**player, "team": team}
            for key in ("firstName", "familyName", "nameI"):
                names[team][name_key(str(player[key]))].add(pid)

    # Identity aliases come from explicit native person/team IDs, never from
    # inferred appearances or matching a name to a different player's ID.
    for index, action in enumerate(actions):
        pid, team = str(action["personId"]), str(action["teamId"])
        if pid in roster and roster[pid]["team"] == team:
            for key in ("playerName", "playerNameI"):
                if action.get(key):
                    names[team][name_key(action[key])].add(pid)
                    alias_evidence.append(
                        {
                            "player_id": pid,
                            "team_id": team,
                            "name": action[key],
                            "locator": f"/game/actions/{index}/{key}",
                        }
                    )

    rotations: dict[str, list[tuple[Decimal, Decimal]]] = defaultdict(list)
    if str(rotation.get("parameters", {}).get("GameID")) != gid:
        raise ValueError("rotation game mismatch")
    for result in rotation["resultSets"]:
        for raw in result["rowSet"]:
            row = dict(zip(result["headers"], raw, strict=True))
            pid = str(row["PERSON_ID"])
            if str(row["GAME_ID"]) != gid or pid not in roster:
                raise ValueError("rotation game/player identity mismatch")
            if str(row["TEAM_ID"]) != roster[pid]["team"]:
                raise ValueError("rotation player team mismatch")
            start = Decimal(str(row["IN_TIME_REAL"])) / 10
            end = Decimal(str(row["OUT_TIME_REAL"])) / 10
            if not start.is_finite() or not end.is_finite() or not 0 <= start < end <= duration:
                raise ValueError("invalid rotation interval")
            if any(start < old_end and end > old_start for old_start, old_end in rotations[pid]):
                raise ValueError("overlapping player rotation intervals")
            rotations[pid].append((start, end))

    def rotation_side(team: str, elapsed: Decimal) -> set[str]:
        return {
            pid
            for pid, ranges in rotations.items()
            if roster[pid]["team"] == team and any(s <= elapsed < e for s, e in ranges)
        }

    starters: dict[int, dict[str, set[str]]] = {}
    for period in periods:
        evidence = b if period == 1 else opening_boxes[str(period)]["boxScoreTraditional"]
        if str(evidence["gameId"]) != gid:
            raise ValueError("starter evidence game mismatch")
        starters[period] = {}
        for side, team in sides.items():
            if str(evidence[f"{side}TeamId"]) != team:
                raise ValueError("starter evidence team mismatch")
            selected = set()
            for player in evidence[f"{side}Team"]["players"]:
                if period == 1:
                    present = bool(player["position"])
                else:
                    present = minute_seconds(player["statistics"]["minutes"]) > 0
                if present:
                    selected.add(str(player["personId"]))
            rotated = rotation_side(team, period_start(period))
            if len(selected) != 5 or selected != rotated:
                reject(
                    "starter_evidence_disagreement",
                    period=period,
                    team=team,
                    opening=sorted(selected),
                    rotation=sorted(rotated),
                )
            if len(rotated) != 5:
                raise ValueError("missing observed five-player rotation starters")
            starters[period][team] = rotated

    lineups: dict[str, set[str]] = {}
    stints: list[dict[str, Any]] = []
    events: list[dict[str, Any]] = []
    minutes: dict[str, Decimal] = defaultdict(Decimal)
    counts: dict[str, Counter[str]] = defaultdict(Counter)
    seen_ids: set[int] = set()
    previous_period = 0
    previous_time = Decimal(0)
    previous_id = 0
    team_points: Counter[str] = Counter()
    last_scores: dict[str, int] = {}

    def interval(start: Decimal, end: Decimal, period: int) -> None:
        if end <= start:
            return
        for team, lineup in lineups.items():
            if len(lineup) != 5:
                reject("invalid_five_player_side", team=team, start=str(start))
            # Independently check every rotation segment, including boundaries
            # that have no PBP substitution. A midpoint alone could miss them.
            boundaries = {start, end}
            for pid, ranges in rotations.items():
                if roster[pid]["team"] == team:
                    boundaries.update(t for pair in ranges for t in pair if start < t < end)
            ordered = sorted(boundaries)
            for left, right in pairwise(ordered):
                observed = rotation_side(team, (left + right) / 2)
                if observed != lineup:
                    reject(
                        "rotation_lineup_disagreement",
                        team=team,
                        start=str(left),
                        end=str(right),
                        reconstructed=sorted(lineup),
                        rotation=sorted(observed),
                    )
            for pid in lineup:
                minutes[pid] += end - start
        stints.append(
            {
                "period": period,
                "start": str(start),
                "end": str(end),
                "duration": str(end - start),
                "lineups": {t: sorted(v) for t, v in lineups.items()},
            }
        )

    for index, action in enumerate(actions):
        period = int(action["period"])
        seconds = clock_seconds(action["clock"])
        length = Decimal(720 if period <= 4 else 300)
        if not 0 <= seconds <= length:
            raise ValueError("out-of-period event clock")
        elapsed = period_start(period) + length - seconds
        event_id = int(action["actionId"])
        if event_id in seen_ids:
            raise ValueError("duplicate native actionId; immutable correction required")
        if event_id <= previous_id:
            raise ValueError("native actionId order inversion")
        seen_ids.add(event_id)
        if period < previous_period or elapsed < previous_time:
            raise ValueError("native event time inversion; immutable correction required")
        if period != previous_period:
            if previous_period:
                interval(previous_time, period_start(period), previous_period)
            lineups = {team: set(players) for team, players in starters[period].items()}
            previous_time = period_start(period)
        interval(previous_time, elapsed, period)
        team = str(action["teamId"])
        pid = str(action["personId"])
        before = {t: sorted(v) for t, v in lineups.items()}
        kind = str(action["actionType"]).lower()
        if kind == "substitution":
            match = re.fullmatch(r"SUB: (.+) FOR (.+)", action["description"])
            if team not in lineups or pid not in lineups[team] or match is None:
                raise ValueError(f"unresolved outgoing substitution at actionId {event_id}")
            incoming = names[team].get(name_key(match[1]), set())
            outgoing = names[team].get(name_key(match[2]), set())
            if len(incoming) != 1 or pid not in outgoing or incoming & lineups[team]:
                raise ValueError(f"ambiguous substitution identity at actionId {event_id}")
            lineups[team].remove(pid)
            lineups[team].update(incoming)
        stats: Counter[str] = Counter()
        if action["isFieldGoal"]:
            value = int(action["shotValue"])
            if value not in (2, 3) or action["shotResult"] not in ("Made", "Missed"):
                raise ValueError("unresolved field goal")
            stats["fga"] = 1
            stats["fg3a"] = int(value == 3)
            stats["fgm"] = int(action["shotResult"] == "Made")
            stats["fg3m"] = int(value == 3 and stats["fgm"] == 1)
            stats["points"] = value * stats["fgm"]
        elif kind == "free throw":
            stats["fta"] = 1
            desc = action["description"]
            if desc.startswith("MISS "):
                stats["ftm"] = 0
            elif re.search(r"Free Throw.*\(\d+ PTS\)", desc):
                stats["ftm"] = 1
            else:
                raise ValueError("unresolved free throw outcome")
            stats["points"] = stats["ftm"]
        if stats:
            if pid not in roster or team != roster[pid]["team"]:
                raise ValueError("scoring event player/team mismatch")
            if pid not in lineups[team]:
                reject("shooter_absent", action_id=event_id, player=pid)
            counts[pid].update(stats)
            team_points[team] += stats["points"]
        scoreboard = {}
        for side, observed_team in sides.items():
            raw_score = action.get(f"score{side.title()}")
            if raw_score in (None, ""):
                continue
            if not re.fullmatch(r"\d+", str(raw_score)):
                raise ValueError("invalid native scoreboard observation")
            score = int(raw_score)
            scoreboard[observed_team] = score
            if score != team_points[observed_team]:
                reject(
                    "scoreboard_event_disagreement",
                    action_id=event_id,
                    team=observed_team,
                    observed=score,
                    event_points=team_points[observed_team],
                )
            if score < last_scores.get(observed_team, 0):
                reject(
                    "scoreboard_decrease",
                    action_id=event_id,
                    team=observed_team,
                    previous=last_scores[observed_team],
                    observed=score,
                )
            last_scores[observed_team] = score
        events.append(
            {
                "action_id": event_id,
                "action_number": action["actionNumber"],
                "locator": f"/game/actions/{index}",
                "payload_sha256": content_hash(action),
                "period": period,
                "elapsed": str(elapsed),
                "lineups_before": before,
                "lineups_after": {t: sorted(v) for t, v in lineups.items()},
                "player_id": pid,
                "team_id": team,
                "stats": dict(stats),
                "scoreboard_observations": scoreboard,
            }
        )
        previous_period, previous_time = period, elapsed
        previous_id = event_id
    interval(previous_time, duration, previous_period)
    comparisons = {}
    stat_fields = {
        "points": "points",
        "fga": "fieldGoalsAttempted",
        "fgm": "fieldGoalsMade",
        "fg3a": "threePointersAttempted",
        "fg3m": "threePointersMade",
        "fta": "freeThrowsAttempted",
        "ftm": "freeThrowsMade",
    }
    for pid, player in roster.items():
        raw = player["statistics"]["minutes"]
        try:
            box_time = minute_seconds(raw)
            delta = minutes[pid] - box_time
            comparisons[pid] = {
                "seconds": str(minutes[pid]),
                "box_seconds": str(box_time),
                "delta": str(delta),
                "box_raw": raw,
            }
            if abs(delta) > MINUTE_TOLERANCE:
                reject("player_minutes_mismatch", player=pid, delta=str(delta))
        except ValueError:
            comparisons[pid] = {
                "seconds": str(minutes[pid]),
                "box_raw": raw,
                "comment": player["comment"],
            }
            explicit = str(player["comment"]).startswith(("DNP", "DND", "NWT"))
            if not explicit or minutes[pid] != 0:
                reject("independent_minutes_unknown", player=pid, raw=raw)
        for stat, source in stat_fields.items():
            observed = player["statistics"].get(source)
            if observed is None or observed != counts[pid][stat]:
                reject(
                    "player_event_total_mismatch",
                    player=pid,
                    stat=stat,
                    box=observed,
                    reconstructed=counts[pid][stat],
                )
    for side, team in sides.items():
        observed = b[f"{side}Team"]["statistics"]["points"]
        points = sum(c["points"] for pid, c in counts.items() if roster[pid]["team"] == team)
        if points != observed:
            reject("team_points_mismatch", team=team, box=observed, reconstructed=points)
    result = {
        "version": VERSION,
        "game_id": gid,
        "input_sha256": input_hashes,
        "minute_tolerance_seconds": str(MINUTE_TOLERANCE),
        "events": events,
        "stints": stints,
        "player_seconds": comparisons,
        "errors": errors,
        "reconstruction_passed": not errors,
        "database_admission": False,
        "possession_policy_admitted": False,
        "alias_evidence": alias_evidence,
        "starters": {str(p): {t: sorted(v) for t, v in s.items()} for p, s in starters.items()},
    }
    result["content_sha256"] = content_hash(result)
    return result
