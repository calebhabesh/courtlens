#!/usr/bin/env python3
"""B19c retained-byte identity/conservation diagnostic; never admits or repairs data.

The ordered projection join is specific to the pinned pair of source artifacts.
Row-hold exposure is a diagnostic hypothesis, not an admitted substitution policy.
"""

from __future__ import annotations

import argparse
import csv
import gzip
import hashlib
import json
import re
import time
from collections import Counter, defaultdict
from decimal import Decimal
from itertools import groupby
from pathlib import Path
from typing import Any

from courtlens.ingestion.sportsdataverse import hash_file
from courtlens.ingestion.workbench_normalization import normalize_game_id, parse_schedule_file

VERSION = "b19-event-conservation-audit-v1"
MINUTE_TOLERANCE_SECONDS = Decimal("1")
Record = tuple[int, dict[str, str]]


def payload_hash(value: Any) -> str:
    return hashlib.sha256(
        json.dumps(value, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()


def rows(path: Path) -> Any:
    opener = gzip.open if path.suffix == ".gz" else Path.open
    with opener(path, "rt", encoding="utf-8-sig", newline="") as stream:
        yield from enumerate(csv.DictReader(stream), 1)


def games(path: Path) -> Any:
    """Require sorted, contiguous regular game groups instead of silently regrouping."""
    previous = ""
    for gid, records in groupby(rows(path), lambda item: normalize_game_id(item[1]["game_id"])):
        if not gid.startswith("002"):
            # Consume excluded rows without admitting their identities or phase.
            for _ in records:
                pass
            continue
        if gid <= previous:
            raise ValueError(f"noncontiguous/unsorted regular game: {path}, {gid}")
        previous = gid
        yield gid, list(records)


def decimal(raw: str) -> Decimal:
    value = Decimal(raw)
    if not value.is_finite() or value < 0:
        raise ValueError(f"unknown/nonfinite/negative value: {raw!r}")
    return value


def integer(raw: str) -> int:
    if re.fullmatch(r"\d+", raw) is None:
        raise ValueError(f"unknown/noninteger value: {raw!r}")
    return int(raw)


def minute_seconds(raw: str) -> Decimal:
    match = re.fullmatch(r"(\d+):(\d{2}(?:\.\d+)?)", raw)
    if match is None or decimal(match[2]) >= 60:
        raise ValueError(f"unknown/invalid box minutes: {raw!r}")
    return Decimal(match[1]) * 60 + decimal(match[2])


def side(row: dict[str, str], prefix: str) -> tuple[str, ...]:
    return tuple(row[f"{prefix}_player_{i}"] for i in range(1, 6))


def event_points(row: dict[str, str]) -> int:
    """Explicit observed shot outcomes; FT text recipe is a diagnostic version."""
    if row["is_field_goal"] == "1":
        if row["shot_result"] not in ("Made", "Missed") or row["shot_value"] not in ("2", "3"):
            raise ValueError("unknown field-goal outcome")
        return integer(row["shot_value"]) if row["shot_result"] == "Made" else 0
    if row["event_type"] == "free_throw":
        description = row["description"]
        if "Free Throw" not in description:
            raise ValueError("unknown free-throw description")
        if description.startswith("MISS "):
            return 0
        if not re.search(r"\(\d+ PTS\)$", description):
            raise ValueError("unknown free-throw outcome")
        return 1
    return 0


def audit_game(
    gid: str,
    pbp: list[Record],
    lineups: list[Record],
    possessions: list[Record],
    teams: dict[str, dict[str, str]],
    players: dict[str, dict[str, str]],
) -> dict[str, Any]:
    issues: Counter[str] = Counter()
    examples: dict[str, list[Any]] = defaultdict(list)

    def reject(reason: str, locator: Any, detail: Any = None) -> None:
        issues[reason] += 1
        if len(examples[reason]) < 3:
            examples[reason].append({"locator": locator, "detail": detail})

    home = next(tid for tid, box in teams.items() if box["side"] == "home")
    away = next(tid for tid, box in teams.items() if box["side"] == "away")
    join_ok = len(pbp) == len(lineups) and bool(pbp)
    if join_ok:
        join_ok = all(
            (p["period"], p["action_number"], p["season"], normalize_game_id(p["game_id"]))
            == (
                lineup["period"],
                lineup["action_number"],
                lineup["season"],
                normalize_game_id(lineup["game_id"]),
            )
            for (_, p), (_, lineup) in zip(pbp, lineups, strict=True)
        )
    if not join_ok:
        reject(
            "ordered_projection_join_failed", {"pbp_rows": len(pbp), "lineup_rows": len(lineups)}
        )
        return {"join_verified": False, "reason_counts": dict(issues), "examples": dict(examples)}

    # A transcript binds both complete decoded payloads and original CSV locators.
    transcript = hashlib.sha256()
    projection_lineups: dict[tuple[str, str], set[Any]] = defaultdict(set)
    for _, lineup in lineups:
        projection_lineups[(lineup["period"], lineup["action_number"])].add(
            (tuple(sorted(side(lineup, "home"))), tuple(sorted(side(lineup, "away"))))
        )
    for key, alternatives in projection_lineups.items():
        if len(alternatives) > 1:
            reject(
                "ambiguous_repeated_projection_lineup", {"period_action": key}, len(alternatives)
            )
    ids: set[int] = set()
    orders: dict[int, int] = {}
    held: Counter[str] = Counter()
    endpoint_held: Counter[str] = Counter()
    invalid_elapsed = Decimal(0)
    invalid_types: Counter[str] = Counter()
    last_scores = {home: 0, away: 0}
    direct_points: Counter[str] = Counter()
    points_by_order: dict[int, tuple[str, int]] = {}
    valid_lineups: list[bool] = []
    elapsed_total = Decimal(0)
    periods: dict[int, list[int]] = defaultdict(list)
    source_pbp_bad = 0
    side_disagreements = 0
    for index, ((pn, event), (ln, lineup)) in enumerate(zip(pbp, lineups, strict=True)):
        locator = {"pbp_row": pn, "lineup_row": ln, "action_id": event["action_id"]}
        transcript.update((payload_hash([locator, event, lineup]) + "\n").encode())
        try:
            if event["season"] != "20" + str(int(gid[3:5]) + 1):
                reject("season_identity_mismatch", locator)
            order, event_id = integer(event["order_index"]), integer(event["action_id"])
            if order in orders or order != index:
                reject("noncontiguous_or_duplicate_order", locator, order)
            if event_id in ids or event_id <= 0:
                reject("duplicate_or_invalid_event_id", locator, event_id)
            ids.add(event_id)
            orders[order] = index
            period = integer(event["period"])
            if period < 1:
                raise ValueError("nonpositive period")
            periods[period].append(index)
            remaining = decimal(event["seconds_remaining"])
            length = Decimal(720 if period <= 4 else 300)
            match = re.fullmatch(r"PT(\d+)M(\d+(?:\.\d+)?)S", event["clock"])
            if (
                remaining > length
                or match is None
                or decimal(match[2]) >= 60
                or remaining != Decimal(match[1]) * 60 + decimal(match[2])
            ):
                raise ValueError("invalid/inconsistent event clock")
            hp, ap = side(lineup, "home"), side(lineup, "away")
            valid = True
            for prefix, team, members in (("home", home, hp), ("away", away, ap)):
                if len(set(members)) != 5 or any(not p.isdigit() or int(p) <= 0 for p in members):
                    reject("invalid_lineup_five", locator, {prefix: members})
                    invalid_types[event["event_type"]] += 1
                    valid = False
                if any(players.get(p, {}).get("team_id") != team for p in members):
                    reject("lineup_roster_or_team_mismatch", locator, {prefix: members})
                    valid = False
            valid_lineups.append(valid)
            op, dp = side(event, "off"), side(event, "def")
            if len(set(op)) != 5 or len(set(dp)) != 5:
                source_pbp_bad += 1
            if {tuple(sorted(op)), tuple(sorted(dp))} != {tuple(sorted(hp)), tuple(sorted(ap))}:
                side_disagreements += 1
                reject(
                    "pbp_lineup_side_disagreement",
                    locator,
                    {"off": op, "def": dp, "home": hp, "away": ap},
                )
            if index + 1 < len(pbp):
                following = pbp[index + 1][1]
                if integer(following["period"]) == period:
                    duration = remaining - decimal(following["seconds_remaining"])
                    if duration < 0:
                        reject("clock_inversion", locator, str(duration))
                    else:
                        elapsed_total += duration
                        next_lineup_row = lineups[index + 1][1]
                        next_hp = side(next_lineup_row, "home")
                        next_ap = side(next_lineup_row, "away")
                        if (
                            len(set(next_hp)) == len(set(next_ap)) == 5
                            and all(players.get(p, {}).get("team_id") == home for p in next_hp)
                            and all(players.get(p, {}).get("team_id") == away for p in next_ap)
                        ):
                            for pid in next_hp + next_ap:
                                endpoint_held[pid] += duration
                        if valid:
                            for pid in hp + ap:
                                held[pid] += duration
                        elif duration:
                            invalid_elapsed += duration
                            reject("invalid_lineup_positive_duration", locator, str(duration))
                elif integer(following["period"]) != period + 1:
                    reject("period_order_inversion", locator)
            for tid, prefix in ((home, "home"), (away, "away")):
                if event["score_" + prefix] != "":
                    score = integer(event["score_" + prefix])
                    if score < last_scores[tid]:
                        reject("score_decrease", locator, [tid, last_scores[tid], score])
                    last_scores[tid] = score
            points = event_points(event)
            tid = event["team_id"]
            if points:
                pid = event["person_id"]
                if tid not in teams or players.get(pid, {}).get("team_id") != tid:
                    reject("scorer_identity_mismatch", locator, [tid, pid])
                if pid not in hp + ap:
                    reject("scorer_absent_from_lineup", locator, pid)
                direct_points[tid] += points
            points_by_order[order] = (tid, points)
            for scoring_tid, prefix in ((home, "home"), (away, "away")):
                raw_score = event["score_" + prefix]
                if raw_score != "" and integer(raw_score) != direct_points[scoring_tid]:
                    reject(
                        "observed_score_differs_from_direct_events",
                        locator,
                        [scoring_tid, raw_score, direct_points[scoring_tid]],
                    )
        except (ValueError, KeyError, ArithmeticError) as exc:
            reject("event_required_value_invalid", locator, str(exc))
            if len(valid_lineups) <= index:
                valid_lineups.append(False)

    for period, indices in periods.items():
        length = Decimal(720 if period <= 4 else 300)
        first, last = pbp[indices[0]][1], pbp[indices[-1]][1]
        try:
            if (
                decimal(first["seconds_remaining"]) != length
                or decimal(last["seconds_remaining"]) != 0
            ):
                reject("incomplete_period_clock_span", period)
        except (ValueError, ArithmeticError) as exc:
            reject("incomplete_period_clock_span", period, str(exc))
    if set(periods) != set(range(1, max(periods, default=0) + 1)) or len(periods) < 4:
        reject("incomplete_periods", 0, sorted(periods))
    expected_duration = Decimal(2880 + 300 * max(0, max(periods, default=4) - 4))
    if elapsed_total != expected_duration:
        reject("elapsed_game_duration_mismatch", 0, [str(elapsed_total), str(expected_duration)])

    minute_comparison = {}
    endpoint_mismatches = 0
    explicit_nonparticipants = 0
    unknown_minutes = 0
    for pid, box in players.items():
        try:
            if box["minutes"] == "" and box.get("comment", "").startswith(
                ("DNP -", "DND -", "NWT -")
            ):
                explicit_nonparticipants += 1
                minute_comparison[pid] = {
                    "candidate_seconds": str(held[pid]),
                    "endpoint_candidate_seconds": str(endpoint_held[pid]),
                    "source_nonparticipation": box["comment"],
                    "box_raw": "",
                }
                if held[pid] or endpoint_held[pid]:
                    reject("nonparticipant_has_candidate_time", {"person_id": pid})
                continue
            if box["minutes"] == "":
                unknown_minutes += 1
            expected_seconds = minute_seconds(box["minutes"])
            delta = held[pid] - expected_seconds
            endpoint_delta = endpoint_held[pid] - expected_seconds
            if abs(endpoint_delta) > MINUTE_TOLERANCE_SECONDS:
                endpoint_mismatches += 1
            minute_comparison[pid] = {
                "candidate_seconds": str(held[pid]),
                "box_seconds": str(expected_seconds),
                "delta_seconds": str(delta),
                "endpoint_candidate_seconds": str(endpoint_held[pid]),
                "endpoint_delta_seconds": str(endpoint_delta),
            }
            if abs(delta) > MINUTE_TOLERANCE_SECONDS:
                reject("player_seconds_mismatch", {"person_id": pid}, str(delta))
        except (ValueError, ArithmeticError) as exc:
            reject("independent_minutes_invalid", {"person_id": pid}, str(exc))
            minute_comparison[pid] = {
                "candidate_seconds": str(held[pid]),
                "box_raw": box["minutes"],
            }
    for tid, box in teams.items():
        expected_points = integer(box["points"])
        if last_scores[tid] != expected_points:
            reject("final_score_mismatch", 0, [tid, last_scores[tid], expected_points])
        if direct_points[tid] != expected_points:
            reject("direct_event_point_mismatch", 0, [tid, direct_points[tid], expected_points])

    if not possessions:
        reject("missing_possession_game", 0)
    membership: Counter[int] = Counter()
    possession_keys: set[tuple[int, int]] = set()
    possession_totals: Counter[str] = Counter()
    opponent_scoring_points = 0
    crossing = 0
    for n, possession in possessions:
        try:
            period = integer(possession["period"])
            key = (period, integer(possession["possession_number"]))
            if key in possession_keys:
                reject("duplicate_possession_identity", n, key)
            possession_keys.add(key)
            start, end = (integer(possession[k]) for k in ("start_order_index", "end_order_index"))
            if start > end or start not in orders or end not in orders:
                raise ValueError("unresolved possession boundaries")
            selected = pbp[orders[start] : orders[end] + 1]
            if len(selected) != end - start + 1 or any(
                integer(e["period"]) != period for _, e in selected
            ):
                raise ValueError("noncontiguous/cross-period possession interval")
            if decimal(possession["start_seconds_remaining"]) != decimal(
                selected[0][1]["seconds_remaining"]
            ) or decimal(possession["end_seconds_remaining"]) != decimal(
                selected[-1][1]["seconds_remaining"]
            ):
                raise ValueError("possession boundary clocks differ from events")
            off, defense = possession["offense_team_id"], possession["defense_team_id"]
            if off == defense or {off, defense} != set(teams):
                raise ValueError("invalid possession teams")
            observed = integer(possession["points"])
            possession_totals[off] += observed
            own, opponent = 0, 0
            signatures = set()
            for _, e in selected:
                order = integer(e["order_index"])
                membership[order] += 1
                tid, pts = points_by_order.get(order, ("", 0))
                own += pts if tid == off else 0
                opponent += pts if tid == defense else 0
                joined_lineup = lineups[orders[order]][1]
                signatures.add(
                    (
                        tuple(sorted(side(joined_lineup, "home"))),
                        tuple(sorted(side(joined_lineup, "away"))),
                    )
                )
            if len(signatures) > 1:
                crossing += 1
            if own != observed:
                reject("possession_direct_point_mismatch", n, [start, end, off, observed, own])
            if opponent:
                opponent_scoring_points += opponent
                reject("opponent_points_inside_possession", n, [start, end, defense, opponent])
        except (ValueError, KeyError, ArithmeticError) as exc:
            reject("possession_required_value_invalid", n, str(exc))
    for order, (_, points) in points_by_order.items():
        if membership[order] > 1:
            reject(
                "overlapping_possession_event_membership", {"order_index": order}, membership[order]
            )
        if points and membership[order] != 1:
            reject("scoring_event_membership_not_one", {"order_index": order}, membership[order])
    for tid, box in teams.items():
        if possession_totals[tid] != integer(box["points"]):
            reject(
                "possession_team_point_mismatch", 0, [tid, possession_totals[tid], box["points"]]
            )
    return {
        "join_verified": True,
        "ordered_join_sha256": transcript.hexdigest(),
        "event_rows": len(pbp),
        "possession_rows": len(possessions),
        "repeated_action_rows": len(pbp) - len({e["action_number"] for _, e in pbp}),
        "invalid_pbp_off_def_rows": source_pbp_bad,
        "pbp_lineup_side_disagreement_rows": side_disagreements,
        "invalid_lineup_event_types": dict(invalid_types),
        "invalid_lineup_positive_seconds": str(invalid_elapsed),
        "candidate_player_seconds": minute_comparison,
        "endpoint_player_mismatch_count": endpoint_mismatches,
        "explicit_nonparticipants": explicit_nonparticipants,
        "unknown_box_minutes": unknown_minutes,
        "elapsed_seconds": str(elapsed_total),
        "expected_duration_seconds": str(expected_duration),
        "direct_points": dict(direct_points),
        "last_observed_scores": last_scores,
        "possession_points": dict(possession_totals),
        "opponent_points_inside_possessions": opponent_scoring_points,
        "cross_lineup_possessions": crossing,
        "unassigned_nonscoring_event_rows": sum(
            membership[o] == 0 and pts == 0 for o, (_, pts) in points_by_order.items()
        ),
        "reason_counts": dict(issues),
        "examples": dict(examples),
    }


def run(raw: Path, baseline: Path, output: Path, year: int) -> None:
    output.mkdir(parents=True, exist_ok=False)
    started = time.monotonic()
    paths = {
        "pbp": raw / f"nba_play_by_play_{year}.csv.gz",
        "lineups": raw / f"nba_lineups_{year}.csv.gz",
        "possessions": raw / f"nba_possessions_{year}.csv.gz",
        "teams": baseline / f"team_boxscores_{year}.csv",
        "players": baseline / f"player_boxscores_{year}.csv",
        "schedule": baseline / f"nba_schedule_{year}.csv.gz",
    }
    inputs = {
        k: {"path": str(p), "sha256": hash_file(p)[0], "bytes": p.stat().st_size}
        for k, p in paths.items()
    }
    dependency_paths = [
        Path(__file__).parents[1] / "src/courtlens/ingestion/sportsdataverse.py",
        Path(__file__).parents[1] / "src/courtlens/ingestion/workbench_normalization.py",
    ]
    dependencies = {
        str(p.relative_to(Path(__file__).parents[1])): hash_file(p)[0] for p in dependency_paths
    }
    teams: dict[str, Any] = defaultdict(dict)
    players: dict[str, Any] = defaultdict(dict)
    for family, target, identity in (
        ("teams", teams, "team_id"),
        ("players", players, "person_id"),
    ):
        for _, row in rows(paths[family]):
            gid = normalize_game_id(row["game_id"])
            if gid.startswith("002"):
                if row[identity] in target[gid]:
                    raise ValueError("duplicate independent baseline identity")
                target[gid][row[identity]] = row
    schedule = parse_schedule_file(paths["schedule"])
    expected = {g for g, row in schedule.items() if row["phase"] == "regular_season"}
    if set(teams) != expected or set(players) != expected:
        raise ValueError("independent baseline coverage mismatch")
    for gid in expected:
        boxes = teams[gid]
        if len(boxes) != 2 or {b["side"] for b in boxes.values()} != {"home", "away"}:
            raise ValueError("incomplete two-team baseline")
        for tid, b in boxes.items():
            if (
                tid != schedule[gid][b["side"] + "_team_id"]
                or integer(b["points"]) != schedule[gid][b["side"] + "_pts"]
            ):
                raise ValueError("independent schedule outcome mismatch")
    # All three complete assets are streamed one game at a time.
    possession_iterator = iter(games(paths["possessions"]))
    next_possession = next(possession_iterator, None)
    lineup_iterator = iter(games(paths["lineups"]))
    next_lineup = next(lineup_iterator, None)
    reports = {}
    for gid, events in games(paths["pbp"]):
        if gid not in teams:
            raise ValueError(f"orphan source game: {gid}")
        if next_lineup is not None and next_lineup[0] < gid:
            raise ValueError(f"orphan/unjoined lineup game: {next_lineup[0]}")
        lineup_records = []
        if next_lineup is not None and next_lineup[0] == gid:
            lineup_records = next_lineup[1]
            next_lineup = next(lineup_iterator, None)
        possession_records = []
        if next_possession is not None and next_possession[0] < gid:
            raise ValueError(f"orphan/unjoined possession game: {next_possession[0]}")
        if next_possession is not None and next_possession[0] == gid:
            possession_records = next_possession[1]
            next_possession = next(possession_iterator, None)
        reports[gid] = audit_game(
            gid,
            events,
            lineup_records,
            possession_records,
            teams[gid],
            players[gid],
        )
    if next_lineup is not None or next_possession is not None or set(reports) != expected:
        raise ValueError("missing/orphan source game coverage")
    reason_games: Counter[str] = Counter()
    for report in reports.values():
        reason_games.update(report["reason_counts"].keys())
    report = {
        "version": VERSION,
        "database_admission": False,
        "inputs": inputs,
        "script_sha256": hash_file(Path(__file__))[0],
        "dependency_sha256": dependencies,
        "ending_year": year,
        "join_policy": (
            "pinned-artifact ordered projection; complete game/season/period/action "
            "sequence equality; CSV row locators preserved"
        ),
        "exposure_hypothesis": (
            "row-hold until next event in same period; not an admitted substitution policy"
        ),
        "minute_tolerance_seconds": str(MINUTE_TOLERANCE_SECONDS),
        "point_hypothesis": (
            "explicit FG outcome/value plus versioned FT description; corrections quarantined"
        ),
        "unresolved_gates": [
            "independent per-period starters/rotation",
            "substitution timing/overrides",
            "possession-policy-v1 and cross-lineup attribution",
            "append-only event/stint admission",
        ],
        "summary": {
            "games": len(reports),
            "ordered_projection_join_games": sum(r["join_verified"] for r in reports.values()),
            "necessary_checks_passed_games": [
                g for g, r in reports.items() if not r["reason_counts"]
            ],
            "reason_game_counts": dict(reason_games),
        },
        "games": reports,
    }
    (output / "audit.json").write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
    (output / "timing.json").write_text(
        json.dumps({"elapsed_seconds": round(time.monotonic() - started, 3)}) + "\n"
    )
    print(json.dumps(report["summary"], indent=2))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--raw", type=Path, required=True)
    parser.add_argument("--baseline", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--year", type=int, default=2026)
    args = parser.parse_args()
    run(args.raw, args.baseline, args.output, args.year)
