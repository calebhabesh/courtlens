"""Descriptive possessions and ordered stints bound to accepted IM02 candidates."""

from __future__ import annotations

import re
from collections import Counter, defaultdict
from decimal import Decimal
from typing import Any

from courtlens.domain.possession_repair import POLICY_VERSION, RepairEvent
from courtlens.ingestion.native_reconstruction import content_hash

METHOD_VERSION = "courtlens-impact-possession-v1"
METHOD_VERSION_V2 = "courtlens-impact-possession-v2"
FACTORS = ("points", "fga", "fgm", "fta", "ftm", "turnovers", "orb_opportunities", "orb")


def verify_candidate(candidate: dict[str, Any], digest: str) -> None:
    if (
        candidate.get("content_sha256") != digest
        or content_hash({k: v for k, v in candidate.items() if k != "content_sha256"}) != digest
        or candidate.get("policy_version") != POLICY_VERSION
        or candidate.get("quality") not in {"clean", "patched"}
        or candidate.get("errors")
    ):
        raise ValueError("invalid or excluded IM02 candidate")


def build_impact_game(
    *,
    candidate: dict[str, Any],
    events: list[RepairEvent],
    raw_rows: dict[int, dict[str, str]],
    home_team: str,
    away_team: str,
    team_boxes: list[dict[str, str]],
    method_version: str = METHOD_VERSION,
) -> dict[str, Any]:
    """Use source events for boundaries and IM02's ordered lineups for attribution.

    Each possession retains event-level contributions. A possession spanning substitutions
    counts once at its ending lineup; factors/points stay with their actual event lineup.
    Technical/retained-ball FT points do not manufacture an extra possession.
    """
    if method_version not in {METHOD_VERSION, METHOD_VERSION_V2}:
        raise ValueError("unknown impact possession method")
    verify_candidate(candidate, candidate["content_sha256"])
    teams = (home_team, away_team)
    if set(candidate["team_stints"]) != set(teams) or not events:
        raise ValueError("missing events or wrong team sides")
    lineups = {
        t: {content_hash(v["locator"]): v["lineup"] for v in candidate["event_lineups"][t]}
        for t in teams
    }
    if any(set(lineups[t]) != {content_hash(e.locator()) for e in events} for t in teams):
        raise ValueError("ordered source event identities differ from IM02")
    stints: list[dict[str, Any]] = []
    event_stints: dict[int, int] = {}
    scores: Counter[str] = Counter()

    def append(period: int, start: Decimal, end: Decimal, h: list[str], a: list[str]) -> int:
        if len(set(h)) != 5 or len(set(a)) != 5 or set(h) & set(a) or start < end:
            raise ValueError("invalid stint lineup or duration")
        if stints and (
            stints[-1]["period"],
            stints[-1]["home_lineup_json"],
            stints[-1]["away_lineup_json"],
        ) == (period, h, a):
            s = stints[-1]
            s["end_seconds_remaining"] = float(end)
            s["duration_seconds"] += float(start - end)
            s["end_clock"] = str(end)
            return len(stints) - 1
        s = {
            "stint_index": len(stints),
            "period": period,
            "start_clock": str(start),
            "end_clock": str(end),
            "start_seconds_remaining": float(start),
            "end_seconds_remaining": float(end),
            "duration_seconds": float(start - end),
            "home_team_id": home_team,
            "away_team_id": away_team,
            "home_lineup_json": h,
            "away_lineup_json": a,
            "home_lineup_key": "|".join(sorted(h)),
            "away_lineup_key": "|".join(sorted(a)),
            "start_home_score": scores[home_team],
            "start_away_score": scores[away_team],
            "end_home_score": scores[home_team],
            "end_away_score": scores[away_team],
            "home_points": 0,
            "away_points": 0,
            "home_possessions": 0.0,
            "away_possessions": 0.0,
            "total_possessions": 0.0,
            "stats_json": {t: dict.fromkeys(FACTORS, 0) for t in teams},
            "player_stats_json": {},
            "policy_version": POLICY_VERSION,
            "status": candidate["quality"],
        }
        stints.append(s)
        return len(stints) - 1

    def duration_lineup(team: str, period: int, midpoint: Decimal) -> list[str]:
        for segment in candidate["team_stints"][team]:
            if segment["period"] == period and Decimal(
                segment["start_seconds"]
            ) >= midpoint > Decimal(segment["end_seconds"]):
                return list(segment["lineup"])
        raise ValueError("accepted stint coverage has a gap")

    last_period = 0
    last_clock = Decimal(0)
    for i, e in enumerate(events):
        if e.period != last_period:
            if last_period and last_clock:
                append(
                    last_period,
                    last_clock,
                    Decimal(0),
                    duration_lineup(home_team, last_period, last_clock / 2),
                    duration_lineup(away_team, last_period, last_clock / 2),
                )
            if e.period != last_period + 1:
                raise ValueError("noncontiguous periods")
            last_period, last_clock = e.period, Decimal(720 if e.period <= 4 else 300)
        if not 0 <= e.seconds <= last_clock:
            raise ValueError("event clock reversal")
        if e.seconds < last_clock:
            mid = (last_clock + e.seconds) / 2
            append(
                e.period,
                last_clock,
                e.seconds,
                duration_lineup(home_team, e.period, mid),
                duration_lineup(away_team, e.period, mid),
            )
        at = append(
            e.period,
            e.seconds,
            e.seconds,
            lineups[home_team][content_hash(e.locator())],
            lineups[away_team][content_hash(e.locator())],
        )
        event_stints[i] = at
        if e.stats.get("points"):
            if e.team_id not in teams:
                raise ValueError("scoring event lacks team")
            side = "home" if e.team_id == home_team else "away"
            scores[e.team_id] += e.stats["points"]
            stints[at][f"{side}_points"] += e.stats["points"]
            pstats = stints[at]["player_stats_json"].setdefault(e.player_id, {})
            pstats["points"] = pstats.get("points", 0) + e.stats["points"]
        stints[at]["end_home_score"] = scores[home_team]
        stints[at]["end_away_score"] = scores[away_team]
        last_clock = e.seconds
    if last_clock:
        append(
            last_period,
            last_clock,
            Decimal(0),
            duration_lineup(home_team, last_period, last_clock / 2),
            duration_lineup(away_team, last_period, last_clock / 2),
        )

    possessions: list[dict[str, Any]] = []
    active: dict[str, Any] | None = None
    period_counts: Counter[int] = Counter()
    pending_miss: str | None = None
    pending_and_one: tuple[str, str, Decimal, int] | None = None

    def retained_ft(index: int) -> bool:
        event = events[index]
        row = raw_rows[event.row_index]
        text = (row.get("description", "") + " " + row.get("subType", "")).lower()
        if event.technical or any(
            x in text for x in ("flagrant", "clear path", "away from play", "transition take")
        ):
            return True
        if method_version == METHOD_VERSION:
            return False
        for earlier in reversed(events[:index]):
            if (earlier.period, earlier.seconds) != (event.period, event.seconds):
                break
            if earlier.kind != "foul" or earlier.technical:
                continue
            before = raw_rows[earlier.row_index]
            foul = (before.get("description", "") + " " + before.get("subType", "")).lower()
            return any(
                x in foul
                for x in (
                    "flagrant",
                    "clear path",
                    "away from play",
                    "away.from.play",
                    "transition take",
                    "inbound",
                )
            )
        return False

    def start(team: str, i: int) -> dict[str, Any]:
        e = events[i]
        return {
            "offense_team_id": team,
            "defense_team_id": teams[1] if team == teams[0] else teams[0],
            "period": e.period,
            "start_order_index": i,
            "end_order_index": i,
            "start_seconds_remaining": float(e.seconds),
            "end_seconds_remaining": float(e.seconds),
            "points": 0,
            "is_second_chance": False,
            "possession_start_type": "ObservedControl",
            "count_as_possession": True,
            "stats_json": {**dict.fromkeys(FACTORS, 0), "events": []},
            "off_lineup_json": [],
            "def_lineup_json": [],
            "lineup_source": "im02_ordered_events",
            "policy_version": POLICY_VERSION,
            "status": candidate["quality"],
        }

    def finish(i: int, *, counted: bool = True) -> None:
        nonlocal active, pending_miss, pending_and_one
        if active is None:
            return
        e = events[i]
        active["end_order_index"] = i
        active["end_seconds_remaining"] = float(e.seconds)
        active["count_as_possession"] = counted
        team = active["offense_team_id"]
        s = stints[event_stints[i]]
        side = "home" if team == home_team else "away"
        active["off_lineup_json"] = s[f"{side}_lineup_json"]
        active["def_lineup_json"] = s["away_lineup_json" if side == "home" else "home_lineup_json"]
        active["possession_number"] = len(possessions) + 1
        period_counts[e.period] += 1
        active["number_in_period"] = period_counts[e.period]
        if counted:
            s[f"{side}_possessions"] += 1
            s["total_possessions"] += 1
        possessions.append(active)
        active, pending_miss, pending_and_one = None, None, None

    def contribute(i: int, values: dict[str, int]) -> None:
        assert active is not None
        e = events[i]
        active["end_order_index"] = i
        active["end_seconds_remaining"] = float(e.seconds)
        active["points"] += values.get("points", 0)
        active["stats_json"]["events"].append(
            {"locator": e.locator(), "order_index": i, "values": values}
        )
        for key, value in values.items():
            active["stats_json"][key] += value
            stints[event_stints[i]]["stats_json"][active["offense_team_id"]][key] += value

    for i, e in enumerate(events):
        row = raw_rows[e.row_index]
        description = (row.get("description", "") + " " + row.get("subType", "")).lower()
        if active and e.period != active["period"]:
            finish(i - 1)
        if e.kind == "free_throw" and retained_ft(i):
            # An explicit noncount scoring record keeps retained-ball points separate.
            saved = active
            active = start(e.team_id, i)
            contribute(i, {k: v for k, v in e.stats.items() if k in FACTORS})
            saved_miss, saved_and_one = pending_miss, pending_and_one
            finish(i, counted=False)
            active, pending_miss, pending_and_one = saved, saved_miss, saved_and_one
            continue
        if e.kind not in {"shot", "free_throw", "turnover", "rebound"}:
            continue
        if e.team_id not in teams:
            continue
        if e.kind == "rebound":
            if active and pending_miss:
                contribute(
                    i,
                    {
                        "orb_opportunities": int(e.player_id != "0"),
                        "orb": int(e.player_id != "0" and e.team_id == active["offense_team_id"]),
                    },
                )
                if e.team_id != active["offense_team_id"]:
                    finish(i)
                else:
                    active["is_second_chance"] = True
                    pending_miss = None
            continue
        if active and active["offense_team_id"] != e.team_id:
            finish(max(active["end_order_index"], i - 1))
        if active is None:
            active = start(e.team_id, i)
        values = {k: v for k, v in e.stats.items() if k in FACTORS}
        if e.kind == "turnover":
            values["turnovers"] = 1
        contribute(i, values)
        if e.kind == "turnover":
            finish(i)
        elif e.kind == "shot":
            if e.stats["fgm"]:
                # And-one attempts retain the made-shot possession through the FT.
                following = [
                    x for x in events[i + 1 :] if x.period == e.period and x.seconds == e.seconds
                ]
                and_one = any(
                    x.kind == "free_throw"
                    and not x.technical
                    and (method_version == METHOD_VERSION or not retained_ft(events.index(x)))
                    and x.team_id == e.team_id
                    and (x.player_id == e.player_id or method_version == METHOD_VERSION_V2)
                    and re.search(
                        r"1\s*(?:of|/)\s*1",
                        (
                            raw_rows[x.row_index].get("subType", "")
                            + " "
                            + raw_rows[x.row_index].get("description", "")
                        ).lower(),
                    )
                    for x in following
                )
                if and_one:
                    pending_and_one = (e.team_id, e.player_id, e.seconds, e.period)
                else:
                    finish(i)
            else:
                pending_miss = e.team_id
        elif e.kind == "free_throw":
            match = re.search(r"(\d)\s*(?:of|/)\s*(\d)", description)
            if match is None:
                raise ValueError(f"unknown free-throw sequence: {e.locator()}")
            pending_miss = None
            if match[1] == match[2]:
                if e.stats["ftm"]:
                    finish(i)
                else:
                    pending_miss = e.team_id
    if active:
        finish(len(events) - 1)

    reconstructed: dict[str, Decimal] = defaultdict(Decimal)
    for s in stints:
        for pid in s["home_lineup_json"] + s["away_lineup_json"]:
            reconstructed[pid] += Decimal(str(s["duration_seconds"]))
        s["stats_json"]["candidate_sha256"] = candidate["content_sha256"]
        s["stats_json"]["method_version"] = method_version
        for team in teams:
            values = s["stats_json"][team]
            values["ts_attempts"] = round(values["fga"] + 0.44 * values["fta"], 4)
        s["source_hash"] = content_hash(s)
    for pid, comparison in candidate["player_comparisons"].items():
        if abs(reconstructed[pid] - Decimal(comparison["seconds"])) > Decimal("0.000001"):
            raise ValueError(f"minutes changed from accepted candidate for {pid}")
    estimates = {}
    for b in team_boxes:
        team = b["team_id"]
        if scores[team] != int(b["points"]):
            raise ValueError("team points do not conserve")
        team_possessions = [p for p in possessions if p["offense_team_id"] == team]
        if sum(p["points"] for p in team_possessions) != scores[team]:
            raise ValueError("possession points do not conserve")
        totals = {k: sum(p["stats_json"][k] for p in team_possessions) for k in FACTORS}
        for key, box_key in (
            ("fga", "field_goals_attempted"),
            ("fgm", "field_goals_made"),
            ("fta", "free_throws_attempted"),
            ("ftm", "free_throws_made"),
        ):
            if box_key in b and totals[key] != int(b[box_key]):
                raise ValueError(f"possession shooting totals do not conserve: {team}/{key}")
        count = sum(p["count_as_possession"] for p in team_possessions)
        estimate = (
            float(b["field_goals_attempted"])
            + 0.44 * float(b["free_throws_attempted"])
            - float(b["rebounds_offensive"])
            + float(b["turnovers"])
        )
        estimates[team] = {
            "points": scores[team],
            "factor_totals": totals,
            "orb_box_delta": totals["orb"] - int(b["rebounds_offensive"]),
            "turnovers_box_delta": totals["turnovers"] - int(b["turnovers"]),
            "possessions": count,
            "box_estimate": round(estimate, 4),
            "delta": round(count - estimate, 4),
        }
    for p in possessions:
        p["stats_json"]["ts_attempts"] = round(
            p["stats_json"]["fga"] + 0.44 * p["stats_json"]["fta"], 4
        )
        p["source_hash"] = content_hash(p)
    result = {
        "game_id": candidate["game_id"],
        "candidate_sha256": candidate["content_sha256"],
        "method_version": method_version,
        "quality": candidate["quality"],
        "stints": stints,
        "possessions": possessions,
        "conservation": estimates,
        "player_comparisons": candidate["player_comparisons"],
    }
    result["content_sha256"] = content_hash(result)
    return result
