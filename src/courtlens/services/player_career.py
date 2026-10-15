"""A player's career Stats table in one read: each season's row and table ranks, and a Career row.

Each season row is the player's row in that season's whole-league Stats cohort, ranked against
that season's qualified league players exactly as the Stats table ranks it (table_percentiles).
Seasons come from the persisted cohort store in one indexed read; a season not stored yet is
computed once and stored. The Career row aggregates only this player's games over the same
seasons: every Stats value is aggregated per player, so it equals that player's row in the
whole range cohort. Season-only joins (DARKO, tracking, impact) stay unknown there.

Rows carry every Stats column, so a client switches views and counting modes without
another request.
"""

from __future__ import annotations

import time
from dataclasses import dataclass
from datetime import date
from typing import Any

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from courtlens.domain.impact_catalog import IMPACT_COLUMNS
from courtlens.domain.query_spec import QuerySpec, SeasonScope, ViewState, WindowKind, WindowSpec
from courtlens.domain.stats_presentation import StatsPresentation
from courtlens.domain.stats_v4_catalog import DARKO_METRICS, TRACKING_METRICS
from courtlens.services import stats_cohort_store
from courtlens.services.darko import darko_catalog_scope
from courtlens.services.impact_serving import impact_catalog_scope
from courtlens.services.stats_catalog import stats_catalog_scope
from courtlens.services.stats_cohort_cache import cohort_query, persisted_key, presentation_cohort
from courtlens.services.stats_engine import execute_stats_query
from courtlens.services.table_percentiles import rank_items, table_reference
from courtlens.services.workbench_analytics import (
    ResolvedContext,
    resolve_workbench_context,
    season_context,
)
from courtlens.workbench_models import WorkbenchPlayerGame

JOINED_COLUMNS = sorted(IMPACT_COLUMNS.keys() | TRACKING_METRICS.keys() | DARKO_METRICS.keys())


@dataclass(frozen=True)
class CareerSeason:
    season: str
    item: dict[str, Any] | None


@dataclass(frozen=True)
class PlayerCareer:
    context: ResolvedContext
    phase: str
    seasons: list[CareerSeason]
    career: dict[str, Any] | None


def career_query(
    context: ResolvedContext, season: str, before_date: date, seasons: list[str] | None = None
) -> QuerySpec:
    """A whole-season Stats query with every joined column: one cohort serves every view."""
    impact = impact_catalog_scope()["manifest_sha256"]
    darko = darko_catalog_scope()["manifest_sha256"]
    return QuerySpec(
        release_id=context.release_id,
        season=season,
        phase=context.phase,
        before_date=before_date,
        window=WindowSpec(kind=WindowKind.SEASON),
        view_state=ViewState(columns=JOINED_COLUMNS),
        impact_manifest_sha256=impact,
        # DARKO is one rating per player-season; a range leaves it unknown.
        darko_manifest_sha256=None if seasons else darko,
        **(
            {"season_scope": SeasonScope(seasons=seasons, aggregate_multi_season=True)}
            if seasons
            else {}
        ),
    )


def player_seasons(session: Session, context: ResolvedContext, player_id: str) -> list[str]:
    return sorted(
        session.scalars(
            select(WorkbenchPlayerGame.season)
            .where(
                WorkbenchPlayerGame.dataset_id == context.dataset_id,
                WorkbenchPlayerGame.phase == context.phase,
                WorkbenchPlayerGame.player_id == player_id,
            )
            .distinct()
        ).all()
    )


def serving_item(row: dict[str, Any]) -> dict[str, Any]:
    """A row without heavy impact support: the table reads only each column's qualification."""
    item = dict(row)
    if item.get("impact_support") is not None:
        item["impact_support"] = {
            key: {"qualified": entry.get("qualified")}
            for key, entry in item["impact_support"].items()
        }
    return item


def ranked_player_row(rows: list[dict[str, Any]], player_id: str) -> dict[str, Any] | None:
    """The player's row ranked against its whole-season league cohort (Stats table ranks)."""
    row = next((row for row in rows if row["player_id"] == player_id), None)
    if row is None:
        return None
    item = {**row}
    qualified, distributions = table_reference(rows, rows, [item])
    rank_items([item], qualified, distributions)
    return item


def player_career(
    session: Session, player_id: str, phase: str, release_id: str | None = None
) -> PlayerCareer:
    base = resolve_workbench_context(session, release_id=release_id, requested_phase=phase)
    if base.dataset_type != "workbench":
        raise HTTPException(status_code=422, detail="Career tables need a workbench release")
    cutoffs = {
        scope["season"]: date.fromisoformat(scope["default_before_date"])
        for scope in stats_catalog_scope(session, base)["stats_scopes"]
        if scope["phase"] == phase
    }
    # Covered seasons with observed games only, newest first.
    seasons = [season for season in player_seasons(session, base, player_id) if season in cutoffs]
    seasons.reverse()

    scoped = {
        season: (
            season_context(base, season, cutoffs[season]),
            cohort_query(career_query(base, season, cutoffs[season])),
        )
        for season in seasons
    }
    keys = {season: persisted_key(session, *scoped[season]) for season in seasons}
    stored = stats_cohort_store.load_player(
        session, [key for key in keys.values() if key is not None], player_id
    )

    rows: list[CareerSeason] = []
    for season in seasons:
        key = keys[season]
        if key is not None and key in stored:
            item = stored[key]
        else:
            # Not stored yet: compute (and store) the season cohort once.
            cohort, _ = presentation_cohort(session, *scoped[season])
            item = ranked_player_row(cohort, player_id)
        rows.append(CareerSeason(season, serving_item(item) if item else None))

    career = None
    if seasons:
        newest = seasons[0]
        query = career_query(base, newest, cutoffs[newest], seasons=sorted(seasons))
        found, _, _, _ = execute_stats_query(
            session,
            season_context(base, newest, cutoffs[newest]),
            query,
            is_export=True,
            max_export_rows=1,
            presentation=StatsPresentation(),
            cohort_percentiles=False,
            subject_player_ids=[player_id],
        )
        career = serving_item(found[0]) if found else None
    return PlayerCareer(context=base, phase=phase, seasons=rows, career=career)


@dataclass(frozen=True)
class CareerThrough:
    seasons: list[str]
    item: dict[str, Any] | None


def career_through(
    session: Session,
    player_ids: list[str],
    phase: str,
    season: str,
    before_date: date,
    release_id: str | None = None,
) -> dict[str, CareerThrough]:
    """Each player's career aggregated through a comparison's cutoff (alignment row 3, 21).

    The seasons are the player's observed seasons up to the compared one; games on or after the
    cutoff are excluded, so a later game never changes the comparison. One aggregate Stats query
    serves both players.
    """
    base = resolve_workbench_context(session, release_id=release_id, requested_phase=phase)
    if base.dataset_type != "workbench":
        raise HTTPException(status_code=422, detail="Career comparisons need a workbench release")
    owned = {
        player_id: [entry for entry in player_seasons(session, base, player_id) if entry <= season]
        for player_id in player_ids
    }
    covered = sorted({entry for seasons in owned.values() for entry in seasons})
    if not covered:
        return {player_id: CareerThrough([], None) for player_id in player_ids}
    query = career_query(base, season, before_date, seasons=covered)
    found, _, _, _ = execute_stats_query(
        session,
        season_context(base, season, before_date),
        query,
        is_export=True,
        max_export_rows=len(player_ids),
        presentation=StatsPresentation(),
        cohort_percentiles=False,
        subject_player_ids=player_ids,
    )
    rows = {row["player_id"]: serving_item(row) for row in found}
    return {
        player_id: CareerThrough(owned[player_id], rows.get(player_id)) for player_id in player_ids
    }


def warm_stats_cohorts(
    session: Session, release_id: str | None = None, *, prune: bool = False
) -> dict[str, Any]:
    """Store every covered season's whole-league cohort so no visitor pays for computing it.

    Run after a deploy or publication: a changed release, source or serving module changes the
    keys, so the first request for each season would otherwise compute it. With prune, entries
    of other releases are deleted.
    """
    started = time.perf_counter()
    base = resolve_workbench_context(session, release_id=release_id)
    if base.dataset_type != "workbench":
        raise ValueError("Stats cohorts persist for workbench releases only")
    phases: dict[str, ResolvedContext] = {}
    built = existing = 0
    for scope in stats_catalog_scope(session, base)["stats_scopes"]:
        phase = scope["phase"]
        if phase not in phases:
            phases[phase] = resolve_workbench_context(
                session, release_id=base.release_id, requested_phase=phase
            )
        cutoff = date.fromisoformat(scope["default_before_date"])
        context = season_context(phases[phase], scope["season"], cutoff)
        query = cohort_query(career_query(context, scope["season"], cutoff))
        key = persisted_key(session, context, query)
        if key is None:
            raise ValueError("This release's cohorts cannot persist: its dataset is not ready")
        if stats_cohort_store.stored_keys(session, [key]):
            existing += 1
            continue
        presentation_cohort(session, context, query)
        built += 1
    removed = stats_cohort_store.prune(session, {base.release_id}) if prune else 0
    return {
        "release_id": base.release_id,
        "built": built,
        "existing": existing,
        "pruned": removed,
        "seconds": round(time.perf_counter() - started, 1),
    }
