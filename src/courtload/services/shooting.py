"""Bounded B23 reads over release-bound finalized rich facts."""

from __future__ import annotations

import math
from collections import Counter, defaultdict
from datetime import timedelta
from typing import Any

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from courtload.domain.shooting import (
    AftermathAnchor,
    AftermathSummary,
    AssignmentSummary,
    Operation,
    ProfilePeer,
    ShootingRequest,
    ShootingResponse,
    ShotFact,
    profile,
    shot_zone,
)
from courtload.services.workbench_analytics import canonical_hash, resolve_workbench_context
from courtload.workbench_models import (
    WorkbenchDataset,
    WorkbenchMatchup,
    WorkbenchPbpEvent,
    WorkbenchPossession,
    WorkbenchRichAdmission,
    WorkbenchSchedule,
    WorkbenchShot,
)

MAX_ROWS = 50000
DISCLOSURES = [
    "Historical reconstruction; original publication-time availability is not established.",
    "Coordinates are feet relative to the attacking basket; missing coordinates are Unknown.",
    "Zones reuse shot-zones-v1. Peers compare located attempt shares by Euclidean distance.",
    "Assignments are source-established pairs with fractional exposure, not inferred guarding.",
    "Aftermath is partial same-possession accounting, not net rating or causal impact.",
    "Continued points include all containing-possession free throws; foul attribution unavailable.",
    "Next opponent possession is number +1 in the same period; missing branches stay unknown.",
    "No tracking, nearest defender, uncertainty interval or verified video mapping is available.",
]


def aftermath(
    shots: list[ShotFact], events: list[dict[str, Any]], possessions: list[dict[str, Any]]
) -> list[AftermathAnchor]:
    """Unique event/range matching; never infer a missing branch from a zero score."""
    event_index: dict[tuple[Any, ...], list[dict[str, Any]]] = defaultdict(list)
    period_events: dict[tuple[str, int], list[dict[str, Any]]] = defaultdict(list)
    period_possessions: dict[tuple[str, int], list[dict[str, Any]]] = defaultdict(list)
    next_index: dict[tuple[str, int], list[dict[str, Any]]] = defaultdict(list)
    for e in events:
        event_index[
            (
                e["game_id"],
                e["period"],
                e["person_id"],
                e["team_id"],
                e["seconds_remaining"],
                e["shot_value"],
            )
        ].append(e)
        period_events[(e["game_id"], e["period"])].append(e)
    for p in possessions:
        period_possessions[(p["game_id"], p["period"])].append(p)
        next_index[(p["game_id"], p["possession_number"])].append(p)
    result = []
    for s in shots:
        matches = event_index[
            (s.game_id, s.period, s.player_id, s.team_id, s.seconds_remaining, s.shot_value)
        ]
        anchor = AftermathAnchor(
            game_id=s.game_id,
            branch="unknown",
            shot_points=s.points,
            reason="Missing or ambiguous event/possession mapping",
        )
        if len(matches) != 1:
            result.append(anchor)
            continue
        event = matches[0]
        containing = [
            p
            for p in period_possessions[(s.game_id, s.period)]
            if p["game_id"] == s.game_id
            and p["period"] == s.period
            and p["offense_team_id"] == s.team_id
            and p["count_as_possession"]
            and p["start_order_index"] <= event["order_index"] <= p["end_order_index"]
        ]
        if len(containing) != 1:
            result.append(anchor)
            continue
        p = containing[0]
        sequence = [
            e
            for e in period_events[(s.game_id, s.period)]
            if e["game_id"] == s.game_id
            and e["period"] == s.period
            and p["start_order_index"] <= e["order_index"] <= p["end_order_index"]
        ]
        attempts = sorted(
            [e for e in sequence if e["shot_value"] in (2, 3)], key=lambda e: e["order_index"]
        )
        if not attempts or attempts[0]["order_index"] != event["order_index"]:
            continue  # Only first-chance attempts are anchors.
        if p["points"] < s.points:
            result.append(anchor)
            continue
        recovery = any(
            e["order_index"] > event["order_index"]
            and e["team_id"] == s.team_id
            and (
                e["shot_value"] in (2, 3)
                or (
                    str(e["event_type"]).lower() == "rebound"
                    and "offensive" in str(e.get("sub_type", "")).lower()
                )
            )
            for e in sequence
        )
        anchor.first_chance_points = s.points
        anchor.possession_number = p["possession_number"]
        anchor.branch = (
            "made" if s.made else "missed_recovery" if recovery else "missed_no_observed_recovery"
        )
        anchor.continued_points = p["points"] - s.points
        anchor.reason = None
        following = next_index[(s.game_id, p["possession_number"] + 1)]
        if (
            len(following) == 1
            and following[0]["period"] == p["period"]
            and following[0]["offense_team_id"] == p["defense_team_id"]
            and following[0]["defense_team_id"] == p["offense_team_id"]
            and following[0]["count_as_possession"]
        ):
            anchor.next_status = "observed"
            anchor.next_opponent_points = following[0]["points"]
        elif p["end_seconds_remaining"] == 0:
            anchor.next_status = "censored"
        result.append(anchor)
    return result


def shooting_service(
    session: Session, request: ShootingRequest, operation: Operation
) -> ShootingResponse:
    if request.defender_id and operation != "matchups":
        raise HTTPException(422, detail={"reason": "unsupported_defender_filter"})
    context = resolve_workbench_context(
        session,
        release_id=request.release_id,
        requested_season=request.season,
        requested_phase=request.phase,
        requested_before_date=request.before_date,
        requested_window="season",
    )
    dataset = session.get(WorkbenchDataset, context.dataset_id)
    if context.dataset_type != "workbench" or dataset is None:
        raise HTTPException(422, detail={"reason": "source_blocked"})
    if context.season not in dataset.seasons_json or context.phase not in dataset.phases_json:
        raise HTTPException(422, detail={"reason": "unsupported_scope"})
    first, last = session.execute(
        select(func.min(WorkbenchSchedule.game_date), func.max(WorkbenchSchedule.game_date)).where(
            WorkbenchSchedule.dataset_id == dataset.id,
            WorkbenchSchedule.season == context.season,
            WorkbenchSchedule.phase == context.phase,
            WorkbenchSchedule.game_status == 3,
        )
    ).one()
    if request.lower_date and request.lower_date >= context.before_date:
        raise HTTPException(422, detail={"reason": "invalid_date_range"})
    if (
        first
        and last
        and (
            (request.before_date and not first <= request.before_date <= last + timedelta(days=1))
            or (request.lower_date and request.lower_date < first)
        )
    ):
        raise HTTPException(422, detail={"reason": "out_of_coverage_date"})
    scope = select(WorkbenchSchedule).where(
        WorkbenchSchedule.dataset_id == dataset.id,
        WorkbenchSchedule.season == context.season,
        WorkbenchSchedule.phase == context.phase,
        WorkbenchSchedule.game_status == 3,
        WorkbenchSchedule.game_date < context.before_date,
    )
    if request.lower_date:
        scope = scope.where(WorkbenchSchedule.game_date >= request.lower_date)
    schedules = scope.subquery()
    expected = session.scalar(select(func.count()).select_from(schedules)) or 0
    models: list[Any] = [WorkbenchMatchup] if operation == "matchups" else [WorkbenchShot]
    if operation == "shot-aftermath":
        models += [WorkbenchPbpEvent, WorkbenchPossession]
    facts: dict[str, list[dict[str, Any]]] = {}
    excluded = 0
    observed_sets = []
    rejected_games: set[str] = set()
    for model in models:
        records = session.execute(
            select(model, schedules.c.game_date)
            .join(
                schedules,
                (schedules.c.dataset_id == model.dataset_id)
                & (schedules.c.game_id == model.game_id),
            )
            .order_by(schedules.c.game_date, model.game_id, model.id)
            .limit(MAX_ROWS + 1)
        ).all()
        if len(records) > MAX_ROWS:
            raise HTTPException(
                422,
                detail={
                    "reason": "query_bound_exceeded",
                    "message": "Narrow dates; maximum 50,000 records per relation",
                },
            )
        rows = []
        bad_games = set()
        for record, day in records:
            row = {
                c.name: getattr(record, c.name)
                for c in model.__table__.columns
                if c.name
                not in {
                    "id",
                    "dataset_id",
                    "source_hash",
                    "description",
                    "player_name",
                    "off_player_name",
                    "def_player_name",
                }
            }
            row["game_date"] = day.isoformat()
            invalid = row["status"] != "valid"
            if model == WorkbenchPossession:
                invalid |= row["policy_version"] != "possession-policy-v1" or row["points"] < 0
            if model == WorkbenchShot:
                invalid |= row["shot_value"] not in (2, 3) or row["points"] != (
                    row["shot_value"] if row["is_made"] else 0
                )
                invalid |= not math.isfinite(row["shot_distance"]) or row["shot_distance"] < 0
                if row["coordinates_present"]:
                    invalid |= any(
                        row[k] is None or not math.isfinite(row[k])
                        for k in ("coord_x_feet", "coord_y_feet")
                    )
            if model == WorkbenchMatchup:
                invalid |= (
                    not math.isfinite(row["partial_possessions"])
                    or row["partial_possessions"] < 0
                    or not math.isfinite(row["matchup_seconds"])
                    or row["matchup_seconds"] < 0
                )
                invalid |= (
                    not 0 <= row["matchup_fgm"] <= row["matchup_fga"]
                    or row["off_person_id"] == row["def_person_id"]
                )
            if invalid:
                bad_games.add(row["game_id"])
            rows.append(row)
        rejected_games.update(bad_games)
        excluded += sum(r["game_id"] in bad_games for r in rows)
        valid = [r for r in rows if r["game_id"] not in bad_games]
        valid.sort(key=lambda r: canonical_hash(r))
        facts[model.__tablename__] = valid
        observed_sets.append({r["game_id"] for r in valid})
    if operation == "shot-aftermath":
        for name, rows in facts.items():
            kept = [r for r in rows if r["game_id"] not in rejected_games]
            excluded += len(rows) - len(kept)
            facts[name] = kept
        observed_sets = [{r["game_id"] for r in rows} for rows in facts.values()]
    observed = len(set.intersection(*observed_sets))
    shots = [
        ShotFact(
            game_id=r["game_id"],
            game_date=r["game_date"],
            player_id=r["person_id"],
            team_id=r["team_id"],
            period=r["period"],
            seconds_remaining=r["seconds_remaining"],
            shot_value=r["shot_value"],
            made=r["is_made"],
            points=r["points"],
            x_feet=r["coord_x_feet"] if r["coordinates_present"] else None,
            y_feet=r["coord_y_feet"] if r["coordinates_present"] else None,
            distance_feet=r["shot_distance"],
            zone=shot_zone(
                r["coord_x_feet"] if r["coordinates_present"] else None,
                r["coord_y_feet"] if r["coordinates_present"] else None,
                r["shot_distance"],
                r["shot_value"],
            ),
        )
        for r in facts.get("workbench_shots", [])
    ]
    focal = profile(request.player_id, shots, request) if operation != "matchups" else None
    peers = []
    if operation == "shot-profile-peers" and focal and focal.sample_status == "available":
        by_player: dict[str, list[ShotFact]] = defaultdict(list)
        for fact in shots:
            by_player[fact.player_id].append(fact)
        for player in sorted(set(by_player) - {request.player_id}):
            candidate = profile(player, by_player[player], request)
            if candidate.sample_status != "available":
                continue
            distance = math.sqrt(
                sum(
                    (a.attempts / focal.located_attempts - b.attempts / candidate.located_attempts)
                    ** 2
                    for a, b in zip(focal.zones[:-1], candidate.zones[:-1], strict=True)
                )
            )
            peers.append(ProfilePeer(profile=candidate, distance=distance))
        peers.sort(key=lambda p: (p.distance, p.profile.player_id))
    groups: dict[tuple[str, str], list[dict[str, Any]]] = {}
    for r in facts.get("workbench_matchups", []):
        if r["off_person_id"] == request.player_id and (
            not request.defender_id or r["def_person_id"] == request.defender_id
        ):
            groups.setdefault((r["off_person_id"], r["def_person_id"]), []).append(r)
    assignments = []
    for (off, defense), rows in sorted(groups.items()):
        attempts = sum(r["matchup_fga"] for r in rows)
        makes = sum(r["matchup_fgm"] for r in rows)
        assignments.append(
            AssignmentSummary(
                offensive_player_id=off,
                defensive_player_id=defense,
                games=len({r["game_id"] for r in rows}),
                seconds=sum(r["matchup_seconds"] for r in rows),
                fractional_possessions=sum(r["partial_possessions"] for r in rows),
                attempts=attempts,
                makes=makes,
                player_points=sum(r["player_points"] for r in rows),
                team_points=sum(r["team_points"] for r in rows),
                fg_pct=makes / attempts if attempts else None,
            )
        )
    selected = [s for s in shots if s.player_id == request.player_id]
    anchors = (
        aftermath(
            selected, facts.get("workbench_pbp_events", []), facts.get("workbench_possessions", [])
        )
        if operation == "shot-aftermath"
        else []
    )
    summaries = []
    for branch in ("made", "missed_recovery", "missed_no_observed_recovery", "unknown"):
        cell = [a for a in anchors if a.branch == branch]
        games = len({a.game_id for a in cell})
        first_chance = [a.first_chance_points for a in cell if a.first_chance_points is not None]
        continued = [a.continued_points for a in cell if a.continued_points is not None]
        opponent = [a.next_opponent_points for a in cell if a.next_opponent_points is not None]
        summaries.append(
            AftermathSummary(
                branch=branch,
                anchors=len(cell),
                games=games,
                continued_samples=len(continued),
                opponent_samples=len(opponent),
                missing_opponent=sum(a.next_status == "missing" for a in cell),
                censored_opponent=sum(a.next_status == "censored" for a in cell),
                first_chance_points=sum(first_chance) if first_chance else None,
                continued_points=sum(continued) if continued else None,
                next_opponent_points=sum(opponent) if opponent else None,
                sample_status="empty"
                if not cell
                else "available"
                if branch != "unknown"
                and len(cell) >= request.min_attempts
                and games >= request.min_games
                else "insufficient_sample",
            )
        )
    provenance = [
        dict(
            source_family=a.source_family,
            source_url=a.source_url,
            source_sha256=a.source_sha256,
            parser_signature=a.parser_signature,
            policy_version=a.policy_version,
            status=a.status,
        )
        for a in session.scalars(
            select(WorkbenchRichAdmission)
            .where(
                WorkbenchRichAdmission.dataset_id == dataset.id,
                WorkbenchRichAdmission.season == context.season,
            )
            .order_by(WorkbenchRichAdmission.source_family)
        )
    ]
    hash_scope = {
        "season": context.season,
        "phase": context.phase,
        "before_date": context.before_date.isoformat(),
        "lower_date": request.lower_date.isoformat() if request.lower_date else None,
    }
    response = ShootingResponse(
        operation=operation,
        context=context.to_dict(),
        request=request,
        coverage_status="source_blocked"
        if not observed
        else "available"
        if observed == expected and not excluded and not any(a.branch == "unknown" for a in anchors)
        else "partial",
        expected_games=expected,
        observed_games=observed,
        excluded_rows=excluded,
        input_counts={k: len(v) for k, v in facts.items()},
        profile=focal,
        peers=peers[: request.limit],
        provenance=provenance,
        aftermath_summary=summaries if operation == "shot-aftermath" else [],
        assignments=assignments,
        shots=selected,
        anchors=anchors,
        branch_counts=dict(Counter(a.branch for a in anchors)),
        input_hash=canonical_hash({"scope": hash_scope, "facts": facts}),
        evidence_hash="",
        disclosures=DISCLOSURES,
    )
    response.evidence_hash = canonical_hash(
        {
            "scope": hash_scope,
            "result": response.model_dump(
                mode="json", exclude={"context", "request", "evidence_hash", "provenance"}
            ),
            "request": request.model_dump(
                mode="json", exclude={"release_id", "season", "phase", "before_date", "lower_date"}
            ),
        }
    )
    return response
