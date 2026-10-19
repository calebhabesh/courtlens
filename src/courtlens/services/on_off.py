"""Bounded finalized shared-floor analytics, with no query-time mutations."""

from __future__ import annotations

from collections.abc import Callable
from datetime import timedelta
from itertools import product
from typing import Any, Literal

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from courtlens.domain.on_off import (
    RATE_METRICS,
    STAT_KEYS,
    ExposureCell,
    MetricShift,
    RosterPlayer,
    SharedFloorRequest,
    SharedFloorResponse,
    StatShiftRosterRequest,
    StatShiftRosterResponse,
    UncertaintyInterval,
    difference_interval,
    linear_ratio_interval,
    lineup_matches,
    ratio_interval,
)
from courtlens.domain.stint_box import stint_player_stats
from courtlens.domain.teams import get_team_info
from courtlens.services.stint_box_serving import stint_box_games
from courtlens.services.workbench_analytics import (
    ResolvedContext,
    canonical_hash,
    resolve_workbench_context,
)
from courtlens.workbench_models import (
    WorkbenchDataset,
    WorkbenchIdentity,
    WorkbenchLineupStint,
    WorkbenchSchedule,
)

MAX_STINTS = 20000
# Sums of directional rates; each keeps its game-cluster covariance (net = ORTG - DRTG).
COMBINED: dict[str, tuple[tuple[str, float], ...]] = {
    "net_rating": (("offensive_rating", 1.0), ("defensive_rating", -1.0)),
    "reb_per_100": (("oreb_per_100", 1.0), ("dreb_per_100", 1.0)),
}
# v2 admits IM02-repaired stints under the IM03 possession method, as IM04's ratings do.
ACCEPTED_STATUSES = frozenset({"valid", "patched"})
ACCEPTED_POLICIES = frozenset({"possession-policy-v1", "possession-policy-v2"})
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


RowValue = Callable[[FloorRow], float | None]


def _stat(key: str) -> RowValue:
    def read(r: FloorRow) -> float | None:
        value = r.get("stats", {}).get(key)
        return None if value is None else float(value)

    return read


def _side(key: str) -> RowValue:
    return lambda r: float(r[key])


def plays(stats: dict[str, Any]) -> float | None:
    """FGA + 0.44 FTA + TOV; unknown when any part is unrecorded."""
    parts = [stats.get(k) for k in ("fga", "fta", "tov")]
    if any(v is None for v in parts):
        return None
    fga, fta, tov = (float(v) for v in parts)  # type: ignore[arg-type]
    return fga + 0.44 * fta + tov


def _focal_plays(r: FloorRow) -> float | None:
    return plays(r.get("stats", {}))


def _true_shot_attempts(r: FloorRow) -> float | None:
    fga, fta = r.get("stats", {}).get("fga"), r.get("stats", {}).get("fta")
    return None if fga is None or fta is None else 2 * (float(fga) + 0.44 * float(fta))


def metric_specs(request: SharedFloorRequest) -> list[tuple[str, RowValue, RowValue, str]]:
    """(metric, numerator, denominator, possession side); each value is 100 * sum(Y) / sum(D)."""
    specs: list[tuple[str, RowValue, RowValue, str]] = [
        ("offensive_rating", _side("points"), _side("off"), "off"),
        ("defensive_rating", _side("allowed"), _side("def"), "def"),
    ]
    if request.player_id:
        for k in STAT_KEYS:
            side = "def" if k in ("stl", "blk", "dreb") else "off"
            specs.append((f"{k}_per_100", _stat(k), _side(side), side))
        specs += [
            # Usage: the focal player's plays over all five teammates' plays on the floor.
            (
                "usage_pct",
                lambda r: plays(r.get("stats", {})),
                lambda r: r.get("team_plays"),
                "off",
            ),
            ("ts_pct", _stat("points"), _true_shot_attempts, "off"),
            ("fg3_pct", _stat("fg3m"), _stat("fg3a"), "off"),
        ]
    return specs


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
    for name, numerator, denominator, side in metric_specs(request):
        grouped: dict[str, tuple[float, float]] = {}
        valid_count = 0
        for r in rows:
            y, d = numerator(r), denominator(r)
            if y is None or d is None or d < 0 or r[side] <= 0:
                continue
            valid_count += 1
            old_y, old_d = grouped.get(r["game_id"], (0.0, 0.0))
            grouped[r["game_id"]] = (old_y + y, old_d + d)
        d_total = sum(x for _, x in grouped.values())
        metrics[name] = 100 * sum(y for y, _ in grouped.values()) / d_total if d_total > 0 else None
        denominators[name] = d_total
        valid_stints[name] = valid_count
        clusters[name] = grouped
        intervals[name] = ratio_interval(grouped)
    for name, parts in COMBINED.items():
        if any(part not in metrics for part, _ in parts):
            continue
        values = [metrics[part] for part, _ in parts]
        metrics[name] = (
            sum(w * v for (_, w), v in zip(parts, values, strict=True) if v is not None)
            if all(v is not None for v in values)
            else None
        )
        intervals[name] = linear_ratio_interval([(clusters[part], w) for part, w in parts])
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
    stint_dataset: str | None = None,
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
    done: dict[str, MetricShift] = {}
    for metric, av in a.raw_metrics.items():
        bv = b.raw_metrics[metric]
        valid = (
            a.sample_status == b.sample_status == "available"
            and av is not None
            and bv is not None
            and (
                a.metric_denominators.get(metric, 0) > 0
                and b.metric_denominators.get(metric, 0) > 0
                if metric in RATE_METRICS
                else a.metric_denominators.get(metric, 0) >= request.min_possessions
                and b.metric_denominators.get(metric, 0) >= request.min_possessions
            )
            and len(ca.get(metric, {})) >= request.min_games
            and len(cb.get(metric, {})) >= request.min_games
        )
        # Net rating combines the two valid directional ratings.
        if metric in COMBINED:
            valid = all(done[part].difference is not None for part, _ in COMBINED[metric])
        interval = (
            difference_interval(ca[metric], cb[metric])
            if valid and metric in ca
            else UncertaintyInterval(
                games=len({r["game_id"] for r in eligible}),
                reason="Insufficient sample or joint interval unavailable",
            )
        )
        if metric in COMBINED and valid:
            interval = linear_ratio_interval(
                [(ca[part], w) for part, w in COMBINED[metric]]
                + [(cb[part], -w) for part, w in COMBINED[metric]]
            )
        done[metric] = MetricShift(
            metric=metric,
            selected_value=av,
            complement_value=bv,
            difference=av - bv if valid and av is not None and bv is not None else None,
            interval=interval,
        )
    shifts = list(done.values())
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
        context={**context.to_dict(), "stint_dataset_id": stint_dataset},
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
    if team is not None:
        request = request.model_copy(update={"team_id": team.team_id})
    rows, context, expected, excluded, stints_from = load_floor_rows(session, request)
    return aggregate_shared_floor(
        rows, request, operation, context, expected, excluded, stint_dataset=stints_from
    )


Scope = SharedFloorRequest | StatShiftRosterRequest


def stint_dataset_id(session: Session, context: ResolvedContext) -> str | None:
    """The release's own stints when it has them, else the sealed stint dataset for the scope."""
    own = session.scalar(
        select(WorkbenchLineupStint.id)
        .join(
            WorkbenchSchedule,
            (WorkbenchSchedule.dataset_id == WorkbenchLineupStint.dataset_id)
            & (WorkbenchSchedule.game_id == WorkbenchLineupStint.game_id),
        )
        .where(
            WorkbenchLineupStint.dataset_id == context.dataset_id,
            WorkbenchSchedule.season == context.season,
            WorkbenchSchedule.phase == context.phase,
        )
        .limit(1)
    )
    if own is not None:
        return context.dataset_id
    sealed = sorted(
        (
            d
            for d in session.scalars(
                select(WorkbenchDataset).where(
                    WorkbenchDataset.source_namespace == "courtlens-impact",
                    WorkbenchDataset.status == "ready",
                )
            )
            if d.seasons_json == [context.season] and d.phases_json == [context.phase]
        ),
        key=lambda d: d.content_sha256,
    )
    return sealed[0].id if sealed else None


def load_floor_rows(
    session: Session, request: Scope
) -> tuple[list[FloorRow], ResolvedContext, int, int, str | None]:
    """Bounded team-side stints in scope, joined to the release's finalized schedule."""
    if request.team_id is None:
        raise ValueError("a team is required to load stints")
    team = get_team_info(request.team_id)
    team_aliases = [team.team_id, team.tricode] if team else [request.team_id]
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
    expected = len(session.execute(select(schedules.c.game_id)).all())
    stints_from = stint_dataset_id(session, context)
    if stints_from is None:
        return [], context, expected, 0, None
    # Game ids are NBA ids in both datasets; the release schedule decides which games count.
    query = (
        select(WorkbenchLineupStint, schedules.c.game_date)
        .join(schedules, schedules.c.game_id == WorkbenchLineupStint.game_id)
        .where(WorkbenchLineupStint.dataset_id == stints_from)
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
    focal = request.player_id if isinstance(request, SharedFloorRequest) else None
    stint_dataset = session.get(WorkbenchDataset, stints_from)
    # Sealed IM03 stints carry player points only; the stint box supplies the rest.
    boxes = (
        stint_box_games(stint_dataset.content_sha256)
        if stint_dataset is not None and stint_dataset.source_namespace == "courtlens-impact"
        else None
    )
    rows: list[FloorRow] = []
    invalid_games: set[str] = set()
    for s in stints:
        if (
            s.status not in ACCEPTED_STATUSES
            or s.policy_version not in ACCEPTED_POLICIES
            or len(set(s.home_lineup_json)) != 5
            or len(s.home_lineup_json) != 5
            or len(set(s.away_lineup_json)) != 5
            or len(s.away_lineup_json) != 5
            or set(s.home_lineup_json) & set(s.away_lineup_json)
            # IM03 keeps zero-duration instants (events at a substitution); v1 required time.
            or s.duration_seconds < 0
            or (s.duration_seconds == 0 and s.policy_version == "possession-policy-v1")
            or min(s.home_possessions, s.away_possessions) < 0
        ):
            invalid_games.add(s.game_id)
            continue
        home = s.home_team_id in team_aliases
        if (s.home_team_id if home else s.away_team_id) not in team_aliases:
            invalid_games.add(s.game_id)
            continue
        lineup = sorted(s.home_lineup_json if home else s.away_lineup_json)
        side_team = s.home_team_id if home else s.away_team_id
        player_stats = (
            stint_player_stats(boxes[s.game_id], s.stint_index, lineup, side_team)
            if boxes is not None and s.game_id in boxes
            else {p: (s.player_stats_json or {}).get(p, {}) for p in lineup}
        )
        lineup_plays = [plays(player_stats[p]) for p in lineup]
        rows.append(
            {
                "game_id": s.game_id,
                "game_date": game_dates[s.game_id],
                "team_id": team.team_id if team else request.team_id,
                "opponent_team_id": s.away_team_id if home else s.home_team_id,
                "index": s.stint_index,
                "period": s.period,
                "lineup": lineup,
                "opponent_lineup": sorted(s.away_lineup_json if home else s.home_lineup_json),
                "seconds": s.duration_seconds,
                "off": s.home_possessions if home else s.away_possessions,
                "def": s.away_possessions if home else s.home_possessions,
                "points": s.home_points if home else s.away_points,
                "allowed": s.away_points if home else s.home_points,
                "stats": player_stats.get(focal, {}) if focal else {},
                "player_stats": player_stats,
                # Unknown when any of the five has an unrecorded play field.
                "team_plays": None
                if any(v is None for v in lineup_plays)
                else sum(v for v in lineup_plays if v is not None),
                "policy": s.policy_version,
            }
        )
    # One invalid segment makes that game's shared-floor partitions incomplete.
    rows = [r for r in rows if r["game_id"] not in invalid_games]
    excluded = sum(s.game_id in invalid_games for s in stints)
    return rows, context, expected, excluded, stints_from


def stat_shift_roster(session: Session, request: StatShiftRosterRequest) -> StatShiftRosterResponse:
    """One stint read; each teammate's stat shift as the focal player with the subject together."""
    scopes = stint_scopes(session)
    if request.season is None:
        phase = request.phase or "regular_season"
        latest = next((s["season"] for s in scopes if s["phase"] == phase), None)
        request = request.model_copy(update={"season": latest, "phase": phase})
    if request.team_id is None:
        context = resolve_workbench_context(
            session,
            release_id=request.release_id,
            requested_season=request.season,
            requested_phase=request.phase,
            requested_before_date=request.before_date,
            requested_window="season",
        )
        return StatShiftRosterResponse(
            context={**context.to_dict(), "stint_dataset_id": None},
            team_id=None,
            subject_id=None,
            coverage_status="source_blocked",
            expected_games=0,
            observed_games=0,
            excluded_stints=0,
            available_scopes=scopes,
            roster=[],
            shifts=[],
        )
    team = get_team_info(request.team_id)
    if team is not None:
        request = request.model_copy(update={"team_id": team.team_id})
    rows, context, expected, excluded, stints_from = load_floor_rows(session, request)
    seconds: dict[str, float] = {}
    games: dict[str, set[str]] = {}
    for r in rows:
        for p in r["lineup"]:
            seconds[p] = seconds.get(p, 0.0) + float(r["seconds"])
            games.setdefault(p, set()).add(r["game_id"])
    names = player_names(session, set(seconds))
    roster = sorted(
        (
            RosterPlayer(
                player_id=p, name=names.get(p), games=len(games[p]), minutes=seconds[p] / 60.0
            )
            for p in seconds
        ),
        key=lambda x: (-x.minutes, x.player_id),
    )
    observed = len({r["game_id"] for r in rows})
    shifts: list[SharedFloorResponse] = []
    if request.subject_id:
        for player in roster:
            if player.player_id == request.subject_id:
                continue
            focal = SharedFloorRequest(
                team_id=request.team_id,
                release_id=request.release_id,
                season=context.season,
                phase=context.phase,
                before_date=request.before_date,
                lower_date=request.lower_date,
                together=[request.subject_id],
                player_id=player.player_id,
                min_possessions=request.min_possessions,
                min_games=request.min_games,
            )
            focal_rows = [{**r, "stats": r["player_stats"].get(player.player_id, {})} for r in rows]
            shifts.append(
                aggregate_shared_floor(
                    focal_rows,
                    focal,
                    "stat-shift",
                    context,
                    expected,
                    excluded,
                    stint_dataset=stints_from,
                )
            )
    return StatShiftRosterResponse(
        context={**context.to_dict(), "stint_dataset_id": stints_from},
        team_id=request.team_id,
        subject_id=request.subject_id,
        coverage_status="source_blocked"
        if not observed
        else "available"
        if observed == expected and not excluded
        else "partial",
        expected_games=expected,
        observed_games=observed,
        excluded_stints=excluded,
        available_scopes=scopes,
        roster=roster,
        shifts=shifts,
    )


def stint_scopes(session: Session) -> list[dict[str, str]]:
    datasets = session.scalars(
        select(WorkbenchDataset).where(
            WorkbenchDataset.source_namespace == "courtlens-impact",
            WorkbenchDataset.status == "ready",
        )
    )
    scopes = {
        (season, phase) for d in datasets for season in d.seasons_json for phase in d.phases_json
    }
    return [{"season": season, "phase": phase} for season, phase in sorted(scopes, reverse=True)]


def player_names(session: Session, ids: set[str]) -> dict[str, str]:
    rows = session.execute(
        select(WorkbenchIdentity.external_id, WorkbenchIdentity.display_name).where(
            WorkbenchIdentity.kind == "player", WorkbenchIdentity.external_id.in_(sorted(ids))
        )
    ).all()
    return {str(pid): name for pid, name in rows}
