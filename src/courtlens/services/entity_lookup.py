"""Entity discovery and incremental lookup service for players, teams, and navigation pages."""

from __future__ import annotations

import threading
import time
from collections import OrderedDict
from datetime import date
from typing import Any

from fastapi import HTTPException
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from courtlens.api.workbench_schemas import (
    LookupAvailability,
    LookupItem,
    LookupResponse,
    LookupTeamAssociation,
    QueryNormalizationInfo,
)
from courtlens.archive_models import ArchiveDataset
from courtlens.domain.entity_lookup import (
    LOOKUP_CATALOG_VERSION,
    LOOKUP_NORMALIZATION_VERSION,
    NBA_TEAM_EXTRA_ALIASES,
    STATIC_NAVIGATION_PAGES,
    IndexedEntity,
    MatchBasis,
    build_destination_url,
    generate_player_aliases,
    get_portrait_fallback,
    normalize_lookup_text,
    score_entity_match,
    tokenize_lookup_text,
)
from courtlens.domain.teams import NBA_TEAMS, get_team_info, resolve_team_tricode
from courtlens.warehouse_models import PublishedSnapshot, ServingSnapshot
from courtlens.workbench_models import (
    WorkbenchDataset,
    WorkbenchIdentity,
    WorkbenchPlayerGame,
    WorkbenchReleaseBinding,
)

# Bounded LRU cache capacity for warm query responses
LOOKUP_CACHE_MAX_ENTRIES = 1024

_index_lock = threading.RLock()
_indices_by_dataset: dict[str, list[IndexedEntity]] = {}
_association_cache: OrderedDict[tuple[Any, ...], LookupTeamAssociation] = OrderedDict()
_response_cache: OrderedDict[tuple[Any, ...], LookupResponse] = OrderedDict()


def clear_lookup_caches() -> None:
    """Clear in-memory entity indices and query response caches (used for test isolation)."""
    with _index_lock:
        _indices_by_dataset.clear()
        _response_cache.clear()
        _association_cache.clear()


def resolve_lookup_binding(
    session: Session, release_id: str | None
) -> tuple[str | None, str | None]:
    """Resolve identity dataset through metadata only; typing never computes coverage.

    Resolve the publication pointer each time so a pointer swap invalidates scope.
    An unpublished installation can still discover identities/pages without an
    analytical team association. Explicit invalid releases never fall back.
    """
    target = release_id
    if target is None:
        pointer = session.get(PublishedSnapshot, "public")
        if pointer is None:
            return None, None
        target = pointer.snapshot_id
    binding = session.scalar(
        select(WorkbenchReleaseBinding).where(
            or_(
                WorkbenchReleaseBinding.snapshot_id == target,
                WorkbenchReleaseBinding.id == target,
            )
        )
    )
    dataset = session.get(WorkbenchDataset, binding.dataset_id if binding else target)
    if dataset is not None:
        return target, dataset.id
    snapshot = session.get(ServingSnapshot, target)
    if snapshot is not None:
        return target, snapshot.dataset_id
    archive = session.get(ArchiveDataset, target)
    if archive is not None:
        return target, archive.id
    raise HTTPException(status_code=404, detail="snapshot or dataset not found")


def build_entity_index(session: Session, dataset_id: str | None = None) -> list[IndexedEntity]:
    """Build in-memory searchable entity index from database identities, teams, and pages."""
    entities: list[IndexedEntity] = []

    # 1. Load Player Identities from WorkbenchIdentity
    player_identities = (
        session.execute(select(WorkbenchIdentity).where(WorkbenchIdentity.kind == "player"))
        .scalars()
        .all()
    )

    # 2. Load player appearance summaries (seasons, latest team, latest date)
    player_summaries: dict[str, dict[str, Any]] = {}
    try:
        summary_query = select(
            WorkbenchPlayerGame.player_id,
            WorkbenchPlayerGame.season,
            WorkbenchPlayerGame.team_id,
            func.max(WorkbenchPlayerGame.game_date).label("latest_date"),
        ).group_by(
            WorkbenchPlayerGame.player_id,
            WorkbenchPlayerGame.season,
            WorkbenchPlayerGame.team_id,
        )
        if dataset_id is not None:
            summary_query = summary_query.where(WorkbenchPlayerGame.dataset_id == dataset_id)

        summary_rows = session.execute(summary_query).all()

        for pid, season, team_id, latest_date in summary_rows:
            if pid not in player_summaries:
                player_summaries[pid] = {
                    "seasons": set(),
                    "latest_date": latest_date,
                    "latest_team_id": team_id,
                }
            entry = player_summaries[pid]
            entry["seasons"].add(season)
            if latest_date and (
                entry["latest_date"] is None or latest_date >= entry["latest_date"]
            ):
                entry["latest_date"] = latest_date
                entry["latest_team_id"] = team_id
    except Exception:
        # Fallback if table is not accessible or dataset does not exist
        pass

    for ident in player_identities:
        raw_aliases = []
        if isinstance(ident.metadata_json, dict) and "aliases" in ident.metadata_json:
            raw_aliases = ident.metadata_json["aliases"]
        generated = generate_player_aliases(ident.display_name, raw_aliases)

        summary = player_summaries.get(ident.external_id, {})
        seasons = tuple(sorted(summary.get("seasons", [])))
        latest_team_id = summary.get("latest_team_id")
        latest_tricode = None
        if latest_team_id:
            team_info = get_team_info(latest_team_id)
            if team_info:
                latest_tricode = team_info.tricode

        display_norm = normalize_lookup_text(ident.display_name)
        tokens = tuple(tokenize_lookup_text(ident.display_name))
        fallback = get_portrait_fallback(ident.display_name, "player")

        entities.append(
            IndexedEntity(
                id=ident.external_id,
                kind="player",
                canonical_id=ident.canonical_id or ident.external_id,
                display_name=ident.display_name,
                display_name_norm=display_norm,
                aliases_norm=tuple(generated),
                tokens=tokens,
                subtitle=None,  # Dynamic based on requested season
                portrait_url=f"/api/workbench/players/{ident.external_id}/portrait",
                portrait_fallback=fallback,
                base_destination=f"/players/{ident.external_id}",
                seasons=seasons,
                latest_team_id=latest_team_id,
                latest_tricode=latest_tricode,
                metadata={"identity_id": ident.id, "namespace": ident.namespace},
            )
        )

    # 3. Load Teams from NBA_TEAMS domain
    for team_id, team in NBA_TEAMS.items():
        team_aliases: list[str] = [
            team.name.casefold(),
            team.tricode.casefold(),
            team.city.casefold(),
        ]
        extra = NBA_TEAM_EXTRA_ALIASES.get(team_id, [])
        for e in extra:
            e_norm = normalize_lookup_text(e)
            if e_norm and e_norm not in team_aliases:
                team_aliases.append(e_norm)

        display_norm = normalize_lookup_text(team.name)
        tokens = tuple(tokenize_lookup_text(team.name))

        entities.append(
            IndexedEntity(
                id=team.team_id,
                kind="team",
                canonical_id=team.team_id,
                display_name=team.name,
                display_name_norm=display_norm,
                aliases_norm=tuple(team_aliases),
                tokens=tokens,
                subtitle=f"NBA Team · {team.conference} {team.division}",
                portrait_url=None,
                portrait_fallback=team.tricode,
                base_destination=f"/teams/{team.team_id}",
                latest_team_id=team.team_id,
                latest_tricode=team.tricode,
                conference=team.conference,
                division=team.division,
                metadata={"tricode": team.tricode, "city": team.city},
            )
        )

    # 4. Load Static Navigation Pages
    for page in STATIC_NAVIGATION_PAGES:
        p_aliases: list[str] = []
        for a in page.get("aliases", []):
            a_norm = normalize_lookup_text(a)
            if a_norm and a_norm not in p_aliases:
                p_aliases.append(a_norm)

        display_norm = normalize_lookup_text(page["display_name"])
        tokens = tuple(tokenize_lookup_text(page["display_name"]))

        entities.append(
            IndexedEntity(
                id=page["id"],
                kind="page",
                canonical_id=page["canonical_id"],
                display_name=page["display_name"],
                display_name_norm=display_norm,
                aliases_norm=tuple(p_aliases),
                tokens=tokens,
                subtitle=page.get("subtitle"),
                portrait_url=None,
                portrait_fallback=page.get("portrait_fallback", "NAV"),
                base_destination=page["base_destination"],
                metadata={"canonical_id": page["canonical_id"]},
            )
        )

    return entities


def get_or_build_entity_index(
    session: Session, dataset_id: str | None = None
) -> list[IndexedEntity]:
    """Retrieve thread-safe cached entity index or build from database."""
    cache_key = dataset_id or "default"
    with _index_lock:
        if cache_key in _indices_by_dataset:
            return _indices_by_dataset[cache_key]

        index = build_entity_index(session, dataset_id=dataset_id)
        _indices_by_dataset[cache_key] = index
        return index


def scoped_team_associations(
    session: Session,
    dataset_id: str | None,
    season: str | None,
    phase: str | None,
    before_date: date | None,
    player_ids: list[str],
    window: str = "season",
) -> dict[str, LookupTeamAssociation]:
    """Cache observed associations per entity and immutable scope; query at most 20 players.

    Scoped results include every represented team. Unscoped results include all teams
    tied on the last observed appearance date, without claiming a current roster.
    Unknown/historical abbreviations remain literal; no franchise migration is inferred.
    """
    if dataset_id is None:
        return {}
    scope = (dataset_id, season, phase, before_date, window)
    with _index_lock:
        result = {}
        for player_id in player_ids:
            key = (*scope, player_id)
            if key in _association_cache:
                _association_cache.move_to_end(key)
                result[player_id] = _association_cache[key]
        missing = [player_id for player_id in player_ids if player_id not in result]
        if not missing:
            return result
        query = select(
            WorkbenchPlayerGame.player_id,
            WorkbenchPlayerGame.team_id,
            func.max(WorkbenchPlayerGame.game_date),
        ).where(
            WorkbenchPlayerGame.appearance == "appeared",
            WorkbenchPlayerGame.player_id.in_(missing),
        )
        if dataset_id is not None:
            query = query.where(WorkbenchPlayerGame.dataset_id == dataset_id)
        if season is not None:
            query = query.where(WorkbenchPlayerGame.season == season)
        if phase is not None:
            query = query.where(WorkbenchPlayerGame.phase == phase)
        if before_date is not None:
            query = query.where(WorkbenchPlayerGame.game_date < before_date)
        if window in ("last_5", "last_10"):
            # Bounded comparison identity follows the same appearance ordering.
            conditions = query.whereclause
            assert conditions is not None
            ranked = (
                select(
                    WorkbenchPlayerGame.player_id,
                    WorkbenchPlayerGame.team_id,
                    WorkbenchPlayerGame.game_date,
                    func.row_number()
                    .over(
                        partition_by=WorkbenchPlayerGame.player_id,
                        order_by=(
                            WorkbenchPlayerGame.game_date.desc(),
                            WorkbenchPlayerGame.game_id.desc(),
                        ),
                    )
                    .label("appearance_rank"),
                )
                .where(conditions)
                .subquery()
            )
            query = (
                select(
                    ranked.c.player_id,
                    ranked.c.team_id,
                    func.max(ranked.c.game_date),
                )
                .where(ranked.c.appearance_rank <= (5 if window == "last_5" else 10))
                .group_by(
                    ranked.c.player_id,
                    ranked.c.team_id,
                )
            )
        else:
            query = query.group_by(WorkbenchPlayerGame.player_id, WorkbenchPlayerGame.team_id)
        scoped = any(value is not None for value in (season, phase, before_date))
        grouped: dict[str, list[tuple[str, date]]] = {}
        for player_id, team_id, latest in session.execute(query).all():
            grouped.setdefault(player_id, []).append((team_id, latest))
        for player_id in missing:
            rows = grouped.get(player_id, [])
            if not rows:
                result[player_id] = LookupTeamAssociation(
                    basis="selected_scope" if scoped else "last_observed",
                    season=season,
                    phase=phase,
                    before_date=before_date,
                )
                continue
            latest = max(day for _, day in rows)
            teams = sorted(
                {resolve_team_tricode(team) for team, day in rows if scoped or day == latest}
            )
            result[player_id] = LookupTeamAssociation(
                basis="selected_scope" if scoped else "last_observed",
                teams=teams,
                observed_through=latest,
                season=season,
                phase=phase,
                before_date=before_date,
            )
        for player_id in missing:
            if len(_association_cache) >= LOOKUP_CACHE_MAX_ENTRIES:
                _association_cache.popitem(last=False)
            _association_cache[(*scope, player_id)] = result[player_id]
        return result


def lookup_entities(
    session: Session,
    query: str = "",
    release_id: str | None = None,
    dataset_id: str | None = None,
    season: str | None = None,
    phase: str | None = None,
    before_date: date | None = None,
    kinds: list[str] | None = None,
    limit: int = 10,
) -> LookupResponse:
    """Execute bounded entity discovery search and return ranked, normalized lookup items."""
    t0 = time.perf_counter()

    clamped_limit = min(max(1, limit), 20)
    allowed_kinds = set(kinds) if kinds else {"player", "team", "page"}

    norm_q = normalize_lookup_text(query)
    q_tokens = tokenize_lookup_text(query)

    cache_key = (
        LOOKUP_CATALOG_VERSION,
        dataset_id,
        release_id,
        season,
        phase,
        before_date,
        tuple(sorted(allowed_kinds)),
        norm_q,
        clamped_limit,
    )

    with _index_lock:
        cached = _response_cache.get(cache_key)
        if cached is not None:
            # Recompute latency for accurate measurement
            elapsed_ms = round((time.perf_counter() - t0) * 1000, 3)
            return cached.model_copy(update={"latency_ms": elapsed_ms})

    index = get_or_build_entity_index(session, dataset_id=dataset_id)

    items: list[LookupItem] = []
    total_matches = 0

    # 1. Empty query -> Navigation suggestions
    if not norm_q:
        suggestion_entities = [e for e in index if e.kind in allowed_kinds]
        # Prefer pages and prominent entities for empty suggestions
        suggestion_entities.sort(
            key=lambda e: 0 if e.kind == "page" else 1 if e.kind == "team" else 2
        )
        for entity in suggestion_entities[:clamped_limit]:
            items.append(
                LookupItem(
                    id=entity.id,
                    kind=entity.kind,
                    canonical_id=entity.canonical_id,
                    display_name=entity.display_name,
                    subtitle=(
                        entity.subtitle
                        or (
                            f"{entity.latest_tricode or 'NBA'} · Player"
                            if entity.kind == "player"
                            else None
                        )
                    ),
                    match_basis="suggestion",
                    match_score=0.0,
                    matched_alias=None,
                    portrait_url=entity.portrait_url,
                    portrait_fallback=entity.portrait_fallback,
                    availability=LookupAvailability(
                        has_current_season=True,
                        status="available",
                        seasons=list(entity.seasons),
                        latest_team_id=entity.latest_team_id,
                        latest_tricode=entity.latest_tricode,
                        conference=entity.conference,
                        division=entity.division,
                    ),
                    destination_url=build_destination_url(
                        entity.base_destination,
                        release_id=release_id,
                        season=season,
                        phase=phase,
                        before_date=before_date.isoformat() if before_date else None,
                    ),
                    metadata=entity.metadata,
                )
            )
        total_matches = len(items)

    # 2. Non-empty query -> Search and rank candidates
    else:
        scored_candidates: list[tuple[float, int, IndexedEntity, MatchBasis, str | None]] = []
        kind_rank_map = {"player": 1, "team": 2, "page": 3}

        for entity in index:
            if entity.kind not in allowed_kinds:
                continue

            match_res = score_entity_match(entity, norm_q, q_tokens)
            if match_res is not None:
                match_basis, match_score, matched_term = match_res
                k_rank = kind_rank_map.get(entity.kind, 4)
                scored_candidates.append((match_score, k_rank, entity, match_basis, matched_term))

        # Stable deterministic tie ordering:
        # 1. match_score DESC
        # 2. kind priority (player > team > page)
        # 3. display_name ASC
        # 4. id ASC
        scored_candidates.sort(
            key=lambda item: (-item[0], item[1], item[2].display_name_norm, item[2].id)
        )

        total_matches = len(scored_candidates)

        for match_score, _, entity, match_basis, matched_term in scored_candidates[:clamped_limit]:
            # Evaluate availability in requested season
            sub: str | None = None
            if entity.kind == "player":
                if not entity.seasons:
                    has_current = False
                    status = "no_current_games"
                    sub = "Rookie / No observed games"
                elif season is not None and season not in entity.seasons:
                    has_current = False
                    status = "no_current_games"
                    sub = f"{entity.latest_tricode or 'NBA'} · No appearances in {season}"
                else:
                    has_current = True
                    status = "available"
                    seasons_str = (
                        f"{entity.seasons[0]}-{entity.seasons[-1]}"
                        if len(entity.seasons) > 1
                        else entity.seasons[0]
                    )
                    sub = f"{entity.latest_tricode or 'NBA'} · Active ({seasons_str})"
            else:
                has_current = True
                status = "available"
                sub = entity.subtitle

            items.append(
                LookupItem(
                    id=entity.id,
                    kind=entity.kind,
                    canonical_id=entity.canonical_id,
                    display_name=entity.display_name,
                    subtitle=sub,
                    match_basis=match_basis,
                    match_score=round(match_score, 4),
                    matched_alias=matched_term,
                    portrait_url=entity.portrait_url,
                    portrait_fallback=entity.portrait_fallback,
                    availability=LookupAvailability(
                        has_current_season=has_current,
                        status=status,
                        seasons=list(entity.seasons),
                        latest_team_id=entity.latest_team_id,
                        latest_tricode=entity.latest_tricode,
                        conference=entity.conference,
                        division=entity.division,
                    ),
                    destination_url=build_destination_url(
                        entity.base_destination,
                        release_id=release_id,
                        season=season,
                        phase=phase,
                        before_date=before_date.isoformat() if before_date else None,
                    ),
                    metadata=entity.metadata,
                )
            )

    if any(item.kind == "player" for item in items):
        associations = scoped_team_associations(
            session,
            dataset_id,
            season,
            phase,
            before_date,
            [item.id for item in items if item.kind == "player"],
        )
        scoped = any(value is not None for value in (season, phase, before_date))
        for item in items:
            if item.kind != "player":
                continue
            association = associations.get(item.id) or LookupTeamAssociation(
                basis="selected_scope" if scoped else "last_observed",
                season=season,
                phase=phase,
                before_date=before_date,
            )
            item.team_association = association
            label = ", ".join(association.teams)
            item.subtitle = (
                f"{label} · Observed in selected scope"
                if scoped and label
                else f"{label} · Last observed {association.observed_through}"
                if label
                else "No observed appearances in selected scope"
                if scoped
                else "No observed appearances"
            )
            item.availability.has_current_season = bool(association.teams)
            item.availability.status = "available" if association.teams else "no_current_games"

    elapsed_ms = round((time.perf_counter() - t0) * 1000, 3)

    response = LookupResponse(
        query=QueryNormalizationInfo(
            raw=query,
            normalized=norm_q,
            tokens=q_tokens,
            version=LOOKUP_NORMALIZATION_VERSION,
        ),
        catalog_version=LOOKUP_CATALOG_VERSION,
        release_id=release_id,
        season=season,
        total_matches=total_matches,
        items=items,
        latency_ms=elapsed_ms,
    )

    with _index_lock:
        if len(_response_cache) >= LOOKUP_CACHE_MAX_ENTRIES:
            _response_cache.popitem(last=False)
        _response_cache[cache_key] = response

    return response
