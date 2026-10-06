#!/usr/bin/env python3
"""Read complete retained rich assets; report necessary gates without DB admission.

Regular season only, one ending year per run. Output creation refuses overwrite.
Raw row numbers are CSV data-row locators (header excluded). All failing games
and reason counts are retained; at most three examples per reason/game are kept.
This deliberately cannot certify stints, event membership or possession policy.
"""

from __future__ import annotations

import argparse
import csv
import gzip
import json
import math
import re
import time
from collections import Counter, defaultdict
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from courtload.ingestion.sportsdataverse import hash_file
from courtload.ingestion.workbench_normalization import (
    normalize_game_id,
    parse_minutes,
    parse_schedule_file,
)
from courtload.ingestion.workbench_source_config import canonical_season_name

AUDIT_VERSION = "b19-full-source-audit-v1"
COUNTS = (
    "field_goals_attempted",
    "field_goals_made",
    "three_pointers_attempted",
    "three_pointers_made",
)
FILES = {
    "pbp": "nba_play_by_play_{year}.csv.gz",
    "possessions": "nba_possessions_{year}.csv.gz",
    "lineups": "nba_lineups_{year}.csv.gz",
    "shots": "shots_{year}.csv",
    "matchups": "game_matchups_{year}.csv",
}


def rows(path: Path) -> Any:
    opener = gzip.open if path.suffix == ".gz" else Path.open
    with opener(path, "rt", encoding="utf-8-sig", newline="") as stream:
        yield from csv.DictReader(stream)


def count(raw: str) -> int:
    if not re.fullmatch(r"\d+", raw):
        raise ValueError(f"unknown/noninteger count {raw!r}")
    return int(raw)


def finite(raw: str) -> float:
    value = float(raw)
    if not math.isfinite(value):
        raise ValueError(f"nonfinite value {raw!r}")
    return value


def clock(raw: str) -> float:
    match = re.fullmatch(r"PT(\d+)M(\d+(?:\.\d+)?)S", raw)
    if match is None or float(match[2]) >= 60:
        raise ValueError(f"invalid clock {raw!r}")
    return 60 * int(match[1]) + float(match[2])


def audit_family(
    family: str,
    path: Path,
    year: int,
    teams: dict[str, dict[str, dict[str, str]]],
    players: dict[str, dict[str, dict[str, str]]],
) -> dict[str, Any]:
    issues: dict[str, Counter[str]] = defaultdict(Counter)
    examples: dict[str, dict[str, list[Any]]] = defaultdict(lambda: defaultdict(list))
    observed: Counter[str] = Counter()
    phases: Counter[str] = Counter()
    nulls: Counter[str] = Counter()
    seen_keys: dict[str, set[Any]] = defaultdict(set)
    sides_points: dict[str, Counter[str]] = defaultdict(Counter)
    shots: dict[str, dict[str, Counter[str]]] = defaultdict(lambda: defaultdict(Counter))
    action_numbers: dict[str, set[int]] = defaultdict(set)
    repeated_actions: Counter[str] = Counter()
    last_event: dict[str, tuple[int, int, float]] = {}
    periods: dict[str, set[int]] = defaultdict(set)
    end_scores: dict[str, dict[str, int]] = defaultdict(dict)
    lineup_sources: Counter[str] = Counter()
    header: list[str] = []
    total = 0

    def reject(gid: str, reason: str, row_number: int, detail: Any = None) -> None:
        issues[gid][reason] += 1
        if len(examples[gid][reason]) < 3:
            examples[gid][reason].append({"row": row_number, "detail": detail})

    def lineup(gid: str, row: dict[str, str], prefix: str, n: int, team: str | None) -> None:
        ids = [row.get(f"{prefix}_player_{i}", "") for i in range(1, 6)]
        if len(set(ids)) != 5 or any(not pid.isdigit() or int(pid) <= 0 for pid in ids):
            reject(gid, "invalid_five_player_side", n, {prefix: ids})
            return
        roster = players.get(gid, {})
        if any(pid not in roster for pid in ids):
            reject(gid, "lineup_identity_missing_from_player_box", n, {prefix: ids})
            return
        affiliations = {roster[pid]["team_id"] for pid in ids}
        if len(affiliations) != 1 or (team is not None and affiliations != {team}):
            reject(gid, "lineup_wrong_team", n, {prefix: ids, "expected_team": team})
        try:
            appeared = all((parse_minutes(roster[pid]["minutes"]) or 0) > 0 for pid in ids)
        except ValueError as exc:
            reject(gid, "independent_player_minutes_invalid", n, str(exc))
            return
        if not appeared:
            reject(gid, "lineup_unconfirmed_appearance", n, {prefix: ids})

    for n, row in enumerate(rows(path), start=1):
        total = n
        if not header:
            header = list(row)
        for key, value in row.items():
            if value in ("", None):
                nulls[key] += 1
        try:
            gid = normalize_game_id(row["game_id"])
        except (KeyError, ValueError) as exc:
            reject("unresolved", "invalid_game_identity", n, str(exc))
            continue
        phases[gid[:3]] += 1
        if not gid.startswith("002"):
            continue
        observed[gid] += 1
        if gid not in teams:
            reject(gid, "missing_independent_team_baseline", n)
            continue
        try:
            if count(row["season"]) != year or gid[3:5] != str(year - 1)[-2:]:
                reject(gid, "season_identity_mismatch", n)
            if family in ("pbp", "possessions", "lineups", "shots"):
                period = count(row["period"])
                if period < 1:
                    raise ValueError("nonpositive period")
                periods[gid].add(period)
                duration = 720 if period <= 4 else 300
            if family == "pbp":
                order = count(row["order_index"])
                action = count(row["action_number"])
                event_id = count(row["action_id"])
                if event_id in seen_keys[gid]:
                    reject(gid, "duplicate_provider_event_identity", n, event_id)
                seen_keys[gid].add(event_id)
                if action in action_numbers[gid]:
                    repeated_actions[gid] += 1
                action_numbers[gid].add(action)
                seconds = finite(row["seconds_remaining"])
                if seconds != clock(row["clock"]) or not 0 <= seconds <= duration:
                    reject(gid, "invalid_event_clock", n)
                previous = last_event.get(gid)
                if previous and (order <= previous[0] or period < previous[1]):
                    reject(gid, "event_order_inversion", n)
                if previous and period == previous[1] and seconds > previous[2]:
                    reject(gid, "clock_increase_requires_review", n, [previous[2], seconds])
                last_event[gid] = (order, period, seconds)
                for side in ("home", "away"):
                    if row["score_" + side] != "":
                        score = count(row["score_" + side])
                        if score < end_scores[gid].get(side, 0):
                            reject(gid, "score_decrease_requires_review", n, side)
                        end_scores[gid][side] = score
                for prefix in ("off", "def"):
                    lineup(gid, row, prefix, n, None)
                if row["is_field_goal"] == "1":
                    record_shot(row, shots[gid], count(row["shot_value"]), row["shot_result"])
            elif family == "possessions":
                key = (period, count(row["possession_number"]))
                if key in seen_keys[gid]:
                    reject(gid, "duplicate_possession_identity", n, key)
                seen_keys[gid].add(key)
                start = finite(row["start_seconds_remaining"])
                end = finite(row["end_seconds_remaining"])
                if not 0 <= end <= start <= duration:
                    reject(gid, "invalid_possession_clock", n, [start, end])
                if count(row["start_order_index"]) > count(row["end_order_index"]):
                    reject(gid, "invalid_possession_event_boundaries", n)
                off, defense = row["offense_team_id"], row["defense_team_id"]
                if off == defense or {off, defense} != set(teams[gid]):
                    reject(gid, "invalid_possession_teams", n, [off, defense])
                sides_points[gid][off] += count(row["points"])
                lineup_sources[row["lineup_source"]] += 1
                for prefix, team in (("off", off), ("def", defense)):
                    lineup(gid, row, prefix, n, team)
                if row["count_as_possession"] not in ("true", "false"):
                    reject(gid, "unknown_possession_count_flag", n)
            elif family == "lineups":
                action = count(row["action_number"])
                if action in seen_keys[gid]:
                    reject(gid, "duplicate_lineup_event_identity", n, action)
                seen_keys[gid].add(action)
                for side in ("home", "away"):
                    team = next(tid for tid, box in teams[gid].items() if box["side"] == side)
                    lineup(gid, row, side, n, team)
            elif family == "shots":
                seconds = clock(row["clock"])
                if not 0 <= seconds <= duration:
                    reject(gid, "invalid_shot_clock", n)
                record_shot(row, shots[gid], count(row["shot_value"]), row["shot_result"])
                if row["person_id"] not in players.get(gid, {}):
                    reject(gid, "shot_player_missing_from_box", n, row["person_id"])
                elif players[gid][row["person_id"]]["team_id"] != row["team_id"]:
                    reject(gid, "shot_player_wrong_team", n)
                x, y, distance = (finite(row[k]) for k in ("x_legacy", "y_legacy", "shot_distance"))
                if distance < 0 or abs(x / 10) > 25 or not -5.25 <= y / 10 <= 88.75:
                    reject(gid, "shot_geometry_requires_review", n, [x, y, distance])
            elif family == "matchups":
                off, defense = row["off_person_id"], row["def_person_id"]
                key = (row["off_team_id"], row["def_team_id"], off, defense)
                if key in seen_keys[gid]:
                    reject(gid, "duplicate_assignment_identity", n, key)
                seen_keys[gid].add(key)
                for pid, team_key in ((off, "off_team_id"), (defense, "def_team_id")):
                    box = players.get(gid, {}).get(pid)
                    if box is None or box["team_id"] != row[team_key]:
                        reject(gid, "assignment_identity_mismatch", n, [pid, row[team_key]])
                if off == defense or row["off_team_id"] == row["def_team_id"]:
                    reject(gid, "assignment_same_side", n)
                for k in ("matchup_minutes_sort", "partial_possessions"):
                    if finite(row[k]) < 0:
                        reject(gid, "negative_assignment_exposure", n, k)
                for made, attempted in (
                    ("matchup_field_goals_made", "matchup_field_goals_attempted"),
                    ("matchup_three_pointers_made", "matchup_three_pointers_attempted"),
                    ("matchup_free_throws_made", "matchup_free_throws_attempted"),
                ):
                    if count(row[made]) > count(row[attempted]):
                        reject(gid, "assignment_makes_exceed_attempts", n, made)
        except (ValueError, KeyError, StopIteration, TypeError) as exc:
            reject(gid, "required_value_invalid", n, str(exc))

    for gid in teams:
        if gid not in observed:
            reject(gid, "missing_source_game", 0)
            continue
        if family in ("pbp", "possessions", "lineups") and (
            periods[gid] != set(range(1, max(periods[gid], default=0) + 1)) or len(periods[gid]) < 4
        ):
            reject(gid, "incomplete_periods", 0, sorted(periods[gid]))
        if family == "pbp":
            for box in teams[gid].values():
                if end_scores[gid].get(box["side"]) != count(box["points"]):
                    reject(gid, "final_score_mismatch", 0, box["side"])
        if family == "possessions":
            for tid, box in teams[gid].items():
                actual = sides_points[gid][tid]
                if actual != count(box["points"]):
                    reject(gid, "possession_point_mismatch", 0, [tid, actual, box["points"]])
        if family in ("pbp", "shots"):
            for pid in set(shots[gid]) | set(players.get(gid, {})):
                box = players.get(gid, {}).get(pid)
                if box is None:
                    reject(gid, "shot_player_missing_from_box", 0, pid)
                    continue
                for metric in COUNTS:
                    if box[metric] == "":
                        reject(gid, "unknown_box_shot_denominator", 0, [pid, metric])
                    elif shots[gid][pid][metric] != count(box[metric]):
                        reject(
                            gid,
                            "player_shot_total_mismatch",
                            0,
                            [pid, metric, shots[gid][pid][metric], box[metric]],
                        )

    return {
        "source": {"path": str(path), "sha256": hash_file(path)[0], "bytes": path.stat().st_size},
        "columns": header,
        "total_rows": total,
        "phase_prefix_row_counts": dict(phases),
        "null_counts_all_phases": dict(nulls),
        "regular_games_observed": len(observed),
        "regular_rows": sum(observed.values()),
        "necessary_checks_passed_games": sorted(set(teams) & set(observed) - set(issues)),
        "not_admitted": True,
        "regular_lineup_source_counts": dict(lineup_sources),
        "repeated_action_number_rows_by_game": dict(repeated_actions),
        "rejected_or_review_games": {
            gid: {"reason_counts": dict(issues[gid]), "examples": examples[gid]}
            for gid in sorted(issues)
        },
        "unresolved_gates": {
            "pbp": [
                "event/team score increments",
                "exact event-to-lineup joins",
                "player minute conservation",
            ],
            "possessions": [
                "event membership and FT/rebound policy",
                "cross-lineup scoring/exposure attribution",
            ],
            "lineups": [
                "event join and time continuity",
                "duration and player minute conservation",
            ],
            "shots": [
                "provider event identity absent",
                "distance/coordinate consistency and corrections",
            ],
            "matchups": [
                "assignment denominator/source methodology",
                "precise numeric seconds versus rounded display minutes",
            ],
        }[family],
    }


def record_shot(
    row: dict[str, str], tally: dict[str, Counter[str]], value: int, result: str
) -> None:
    if value not in (2, 3) or result not in ("Made", "Missed"):
        raise ValueError("unknown field-goal outcome/value")
    pid = row["person_id"]
    tally[pid][COUNTS[0]] += 1
    tally[pid][COUNTS[1]] += int(result == "Made")
    tally[pid][COUNTS[2]] += int(value == 3)
    tally[pid][COUNTS[3]] += int(value == 3 and result == "Made")


def run(raw: Path, baseline: Path, output: Path, year: int) -> None:
    output.mkdir(parents=True, exist_ok=False)
    started = time.monotonic()
    teams: dict[str, dict[str, dict[str, str]]] = defaultdict(dict)
    players: dict[str, dict[str, dict[str, str]]] = defaultdict(dict)
    baseline_sources = {}
    for family, target, identity in (("team", teams, "team_id"), ("player", players, "person_id")):
        path = baseline / f"{family}_boxscores_{year}.csv"
        digest, size = hash_file(path)
        baseline_sources[family] = {"path": str(path), "sha256": digest, "bytes": size}
        for row in rows(path):
            gid = normalize_game_id(row["game_id"])
            if gid.startswith("002"):
                if row[identity] in target[gid]:
                    raise ValueError("duplicate independent box identity")
                target[gid][row[identity]] = row
    if not teams or any(
        len(boxes) != 2 or {box["side"] for box in boxes.values()} != {"home", "away"}
        for boxes in teams.values()
    ):
        raise ValueError("independent two-team baseline incomplete")
    schedule_path = baseline / f"nba_schedule_{year}.csv.gz"
    schedule = parse_schedule_file(schedule_path)
    expected = {gid for gid, game in schedule.items() if game["phase"] == "regular_season"}
    if set(teams) != expected:
        raise ValueError("regular-season schedule and team-box coverage differ")
    for gid, boxes in teams.items():
        for tid, box in boxes.items():
            side = box["side"]
            if (
                tid != schedule[gid][side + "_team_id"]
                or count(box["points"]) != schedule[gid][side + "_pts"]
            ):
                raise ValueError(f"schedule/team outcome mismatch: {gid}")
            for metric in COUNTS:
                player_total = sum(
                    count(row[metric])
                    for row in players.get(gid, {}).values()
                    if row["team_id"] == tid
                )
                if player_total != count(box[metric]):
                    raise ValueError(f"independent player/team shot totals differ: {gid}, {metric}")
    baseline_sources["schedule"] = {
        "path": str(schedule_path),
        "sha256": hash_file(schedule_path)[0],
        "bytes": schedule_path.stat().st_size,
    }
    report: dict[str, Any] = {
        "audit_version": AUDIT_VERSION,
        "script_sha256": hash_file(Path(__file__))[0],
        "observed_at_utc": datetime.now(UTC).isoformat(),
        "ending_year": year,
        "season": canonical_season_name(year),
        "scope": "complete files scanned; regular-season independent-box necessary checks only",
        "baseline": baseline_sources,
        "expected_regular_game_ids": sorted(teams),
        "database_admission": False,
        "families": {},
    }
    for family, filename in FILES.items():
        result = audit_family(family, raw / filename.format(year=year), year, teams, players)
        report["families"][family] = result
        print(
            f"{family}: {result['total_rows']} rows; "
            f"{len(result['necessary_checks_passed_games'])}/{len(teams)} "
            "games pass necessary checks",
            flush=True,
        )
    report["elapsed_seconds"] = round(time.monotonic() - started, 3)
    (output / "audit.json").write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--raw", type=Path, required=True)
    parser.add_argument("--baseline", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--year", type=int, default=2026)
    args = parser.parse_args()
    run(args.raw, args.baseline, args.output, args.year)
