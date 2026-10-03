"""Bounded finalized shared-floor analytics, with no query-time mutations."""

from __future__ import annotations

from datetime import timedelta
from itertools import product
from typing import Any, Literal

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from courtload.domain.on_off import (
    STAT_KEYS,
    ExposureCell,
    MetricShift,
    SharedFloorRequest,
    SharedFloorResponse,
    UncertaintyInterval,
    difference_interval,
    linear_ratio_interval,
    lineup_matches,
    ratio_interval,
)
from courtload.domain.teams import get_team_info
from courtload.services.workbench_analytics import (
    ResolvedContext,
    canonical_hash,
    resolve_workbench_context,
)
from courtload.workbench_models import WorkbenchDataset, WorkbenchLineupStint, WorkbenchSchedule

MAX_STINTS = 20000
DISCLOSURES = [
    "Shared-floor splits describe lineup, opponent and role context; "
    "they are not causal impact or RAPM.",
    "Historical reconstruction does not establish original publication-time availability.",
    "Raw estimates remain visible below sample gates; gated differences are unavailable.",
    "Default gates: 100 offensive and defensive possessions and 5 games per cell; "
    "adjustable, not tuned.",
    "95% intervals use game-cluster ratio linearization with a normal approximation "
    "and at least 10 games per split; they are not calibrated forecast intervals.",
    "No leverage filter or shrinkage is applied. Missing event production remains unknown.",
    "2-4 player units require all members together; 5-player units match the full side exactly.",
]

# Each row is a single team-side stint, never ten duplicated player exposures.
FloorRow = dict[str, Any]
Clusters = dict[str, dict[str, tuple[float, float]]]


def summarize_cell(
    key: str,
    rows: list[FloorRow],
    request: SharedFloorRequest,
    present: list[str] | None = None,
    absent: list[str] | None = None,
) -> tuple[ExposureCell, Clusters]:
    games = len({r["game_id"] for r in rows})
    off = sum(float(r["off"]) for r in rows)
    defense = sum(float(r["def"]) for r in rows)
    seconds = sum(float(r["seconds"]) for r in rows)
    status: Literal["available", "insufficient_sample", "empty"] = (
        "empty"
        if not rows
        else "available"
        if games >= request.min_games and min(off, defense) >= request.min_possessions
        else "insufficient_sample"
    )
    clusters: Clusters = {}
    metrics: dict[str, float | None] = {}
    denominators: dict[str, float] = {}
    valid_stints: dict[str, int] = {}
    intervals: dict[str, UncertaintyInterval] = {}
    specs = [("offensive_rating", "points", "off"), ("defensive_rating", "allowed", "def")]
    if request.player_id:
        specs += [
            (f"{k}_per_100", k, "def" if k in ("stl", "blk", "dreb") else "off") for k in STAT_KEYS
        ]
    for name, numerator, denominator in specs:
        valid = [
            r
            for r in rows
            if (
                r.get("stats", {}).get(numerator) if name.endswith("_per_100") else r.get(numerator)
            )
            is not None
            and r[denominator] > 0
        ]
        grouped: dict[str, tuple[float, float]] = {}
        for r in valid:
            y = float(r["stats"][numerator] if name.endswith("_per_100") else r[numerator])
            old_y, old_d = grouped.get(r["game_id"], (0.0, 0.0))
            grouped[r["game_id"]] = (old_y + y, old_d + float(r[denominator]))
        d = sum(x for _, x in grouped.values())
        metrics[name] = 100 * sum(y for y, _ in grouped.values()) / d if d > 0 else None
        denominators[name] = d
        valid_stints[name] = len(valid)
        clusters[name] = grouped
        intervals[name] = ratio_interval(grouped)
    metrics["net_rating"] = (
        metrics["offensive_rating"] - metrics["defensive_rating"]
        if metrics["offensive_rating"] is not None and metrics["defensive_rating"] is not None
        else None
    )
    intervals["net_rating"] = linear_ratio_interval(
        [
            (clusters["offensive_rating"], 1.0),
            (clusters["defensive_rating"], -1.0),
        ]
    )
    return ExposureCell(
        key=key,
        present=present or [],
        absent=absent or [],
        games=games,
        stints=len(rows),
        seconds=seconds,
        minutes=seconds / 60.0,
        offensive_possessions=off,
        defensive_possessions=defense,
        points=sum(r["points"] for r in rows) if rows else None,
        points_allowed=sum(r["allowed"] for r in rows) if rows else None,
        sample_status=status,
        reason=None if status == "available" else "Insufficient shared-floor exposure",
        event_totals={
            k: sum(float(r["stats"][k]) for r in rows if r.get("stats", {}).get(k) is not None)
            if any(r.get("stats", {}).get(k) is not None for r in rows)
            else None
            for k in STAT_KEYS
        }
        if request.player_id
        else {},
        raw_metrics=metrics,
        metric_denominators=denominators,
        metric_valid_stints=valid_stints,
        intervals=intervals,
    ), clusters


def aggregate_shared_floor(
    rows: list[FloorRow],
    request: SharedFloorRequest,
    operation: Literal["wowy", "on-off", "stat-shift"],
    context: ResolvedContext,
    expected_games: int,
    excluded_stints: int = 0,
) -> SharedFloorResponse:
    """Partition eligible team stints and compute selected minus complement estimates."""
    observed = len({r["game_id"] for r in rows})
    # A player's stat shift is conditional on that player actually sharing the floor.
    eligible = [r for r in rows if not request.player_id or request.player_id in r["lineup"]]
    selected = [r for r in eligible if lineup_matches(r["lineup"], request)]
    complement = [r for r in eligible if not lineup_matches(r["lineup"], request)]
    a, ca = summarize_cell("selected", selected, request)
    b, cb = summarize_cell("complement", complement, request)
    conditions = sorted(request.together + request.apart + request.exact_unit)
    groups: dict[tuple[bool, ...], list[FloorRow]] = {
        mask: [] for mask in product((False, True), repeat=len(conditions))
    }
    for row in eligible:
        groups[tuple(p in row["lineup"] for p in conditions)].append(row)
    partitions = [
        summarize_cell(
            "".join("1" if v else "0" for v in mask),
            group,
            request,
            [p for p, v in zip(conditions, mask, strict=True) if v],
            [p for p, v in zip(conditions, mask, strict=True) if not v],
        )[0]
        for mask, group in groups.items()
    ]
    shifts: list[MetricShift] = []
    for metric, av in a.raw_metrics.items():
        bv = b.raw_metrics[metric]
        valid = (
            a.sample_status == b.sample_status == "available"
            and av is not None
            and bv is not None
            and a.metric_denominators.get(metric, 0) >= request.min_possessions
            and b.metric_denominators.get(metric, 0) >= request.min_possessions
            and len(ca.get(metric, {})) >= request.min_games
            and len(cb.get(metric, {})) >= request.min_games
        )
        # Net rating combines the two valid directional ratings.
        if metric == "net_rating":
            valid = all(s.difference is not None for s in shifts[:2])
        interval = (
            difference_interval(ca[metric], cb[metric])
            if valid and metric in ca
            else UncertaintyInterval(
                games=len({r["game_id"] for r in eligible}),
                reason="Insufficient sample or joint interval unavailable",
            )
        )
        if metric == "net_rating" and valid:
            interval = linear_ratio_interval(
                [
                    (ca["offensive_rating"], 1.0),
                    (ca["defensive_rating"], -1.0),
                    (cb["offensive_rating"], -1.0),
                    (cb["defensive_rating"], 1.0),
                ]
            )
        shifts.append(
            MetricShift(
                metric=metric,
                selected_value=av,
                complement_value=bv,
                difference=av - bv if valid and av is not None and bv is not None else None,
                interval=interval,
            )
        )
    # Hash actual eligible normalized facts, excluding local IDs and release-wide signatures.
    scope = {
        "season": context.season,
        "phase": context.phase,
        "before_date": context.before_date.isoformat(),
        "lower_date": request.lower_date.isoformat() if request.lower_date else None,
    }
    canonical_request = request.model_dump(
        mode="json", exclude={"release_id", "season", "phase", "before_date"}
    )
    input_hash = canonical_hash({"scope": scope, "facts": rows})
    response = SharedFloorResponse(
        operation=operation,
        context=context.to_dict(),
        request=request,
        coverage_status="source_blocked"
        if not observed
        else "available"
        if observed == expected_games and not excluded_stints
        else "partial",
        expected_games=expected_games,
        observed_games=observed,
        excluded_stints=excluded_stints,
        cells=[a, b],
        partitions=partitions,
        shifts=shifts,
        input_hash=input_hash,
        evidence_hash="",
        disclosures=DISCLOSURES,
    )
    response.evidence_hash = canonical_hash(
        {
            "version": response.operation_version,
            "operation": operation,
            "request": canonical_request,
            "scope": scope,
            "input_hash": input_hash,
            "cells": [c.model_dump() for c in response.cells],
            "shifts": [s.model_dump() for s in shifts],
        }
    )
    return response


def shared_floor_service(
    session: Session,
    request: SharedFloorRequest,
    operation: Literal["wowy", "on-off", "stat-shift"],
) -> SharedFloorResponse:
    if operation == "on-off" and (
        len(request.together) != 1 or request.apart or request.exact_unit or request.player_id
    ):
        raise HTTPException(
            422,
            detail={
                "reason": "invalid_conditions",
                "message": "On/off requires one together player",
            },
        )
    if operation == "stat-shift" and (
        not request.player_id
        or request.player_id in request.together + request.apart + request.exact_unit
    ):
        raise HTTPException(
            422,
            detail={
                "reason": "invalid_conditions",
                "message": "Stat shifts require a separate focal player",
            },
        )
    team = get_team_info(request.team_id)
    team_aliases = [team.team_id, team.tricode] if team else [request.team_id]
    if team is not None:
        request = request.model_copy(update={"team_id": team.team_id})
    context = resolve_workbench_context(
        session,
        release_id=request.release_id,
        requested_season=request.season,
        requested_phase=request.phase,
        requested_before_date=request.before_date,
        requested_window="season",
    )
    if context.dataset_type != "workbench":
        raise HTTPException(
            422,
            detail={
                "reason": "source_blocked",
                "message": "This release has no admitted stint dataset",
            },
        )
    dataset = session.get(WorkbenchDataset, context.dataset_id)
    assert dataset is not None
    if context.season not in dataset.seasons_json or context.phase not in dataset.phases_json:
        raise HTTPException(422, detail={"reason": "unsupported_scope"})
    if request.lower_date and request.lower_date >= context.before_date:
        raise HTTPException(422, detail={"reason": "invalid_date_range"})
    first_date, last_date = session.execute(
        select(func.min(WorkbenchSchedule.game_date), func.max(WorkbenchSchedule.game_date)).where(
            WorkbenchSchedule.dataset_id == context.dataset_id,
            WorkbenchSchedule.season == context.season,
            WorkbenchSchedule.phase == context.phase,
            WorkbenchSchedule.game_status == 3,
        )
    ).one()
    if (
        first_date is not None
        and last_date is not None
        and (
            (
                request.before_date is not None
                and not first_date <= request.before_date <= last_date + timedelta(days=1)
            )
            or (request.lower_date is not None and request.lower_date < first_date)
        )
    ):
        raise HTTPException(422, detail={"reason": "out_of_coverage_date"})
    schedule_query = select(WorkbenchSchedule).where(
        WorkbenchSchedule.dataset_id == context.dataset_id,
        WorkbenchSchedule.season == context.season,
        WorkbenchSchedule.phase == context.phase,
        WorkbenchSchedule.game_date < context.before_date,
        WorkbenchSchedule.game_status == 3,
        (WorkbenchSchedule.home_team_id.in_(team_aliases))
        | (WorkbenchSchedule.away_team_id.in_(team_aliases)),
    )
    if request.lower_date:
        schedule_query = schedule_query.where(WorkbenchSchedule.game_date >= request.lower_date)
    schedules = schedule_query.subquery()
    query = (
        select(WorkbenchLineupStint, schedules.c.game_date)
        .join(
            schedules,
            (schedules.c.dataset_id == WorkbenchLineupStint.dataset_id)
            & (schedules.c.game_id == WorkbenchLineupStint.game_id),
        )
        .order_by(
            schedules.c.game_date, WorkbenchLineupStint.game_id, WorkbenchLineupStint.stint_index
        )
        .limit(MAX_STINTS + 1)
    )
    records = session.execute(query).all()
    stints = [stint for stint, _ in records]
    game_dates = {stint.game_id: game_date.isoformat() for stint, game_date in records}
    if len(stints) > MAX_STINTS:
        raise HTTPException(
            422,
            detail={
                "reason": "query_bound_exceeded",
                "message": "Narrow the date range; maximum 20,000 stints",
            },
        )
    expected = len(session.execute(select(schedules.c.game_id)).all())
    rows: list[FloorRow] = []
    invalid_games: set[str] = set()
    for s in stints:
        if (
            s.status != "valid"
            or s.policy_version != "possession-policy-v1"
            or len(set(s.home_lineup_json)) != 5
            or len(s.home_lineup_json) != 5
            or len(set(s.away_lineup_json)) != 5
            or len(s.away_lineup_json) != 5
            or set(s.home_lineup_json) & set(s.away_lineup_json)
            or s.duration_seconds <= 0
            or min(s.home_possessions, s.away_possessions) < 0
        ):
            invalid_games.add(s.game_id)
            continue
        home = s.home_team_id in team_aliases
        if (s.home_team_id if home else s.away_team_id) not in team_aliases:
            invalid_games.add(s.game_id)
            continue
        rows.append(
            {
                "game_id": s.game_id,
                "game_date": game_dates[s.game_id],
                "team_id": request.team_id,
                "opponent_team_id": s.away_team_id if home else s.home_team_id,
                "index": s.stint_index,
                "period": s.period,
                "lineup": sorted(s.home_lineup_json if home else s.away_lineup_json),
                "opponent_lineup": sorted(s.away_lineup_json if home else s.home_lineup_json),
                "seconds": s.duration_seconds,
                "off": s.home_possessions if home else s.away_possessions,
                "def": s.away_possessions if home else s.home_possessions,
                "points": s.home_points if home else s.away_points,
                "allowed": s.away_points if home else s.home_points,
                "stats": (s.player_stats_json or {}).get(request.player_id, {})
                if request.player_id
                else {},
                "policy": s.policy_version,
            }
        )
    # One invalid segment makes that game's shared-floor partitions incomplete.
    rows = [r for r in rows if r["game_id"] not in invalid_games]
    excluded = sum(s.game_id in invalid_games for s in stints)
    return aggregate_shared_floor(rows, request, operation, context, expected, excluded)
