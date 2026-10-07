"""Resumable historical backfill service for NBA seasons toward 2000-01."""

from __future__ import annotations

import logging
from datetime import date
from pathlib import Path
from typing import Any

import httpx
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from courtlens.config import get_settings
from courtlens.ingestion.sportsdataverse import acquire_season_assets
from courtlens.ingestion.workbench_source_config import canonical_season_name
from courtlens.services.workbench_ingestion import import_workbench_data
from courtlens.workbench_models import (
    WorkbenchDataset,
    WorkbenchPlayerDraft,
    WorkbenchPlayerGame,
)

logger = logging.getLogger(__name__)

DEFAULT_HISTORICAL_START_YEAR = 2001  # 2000-01 season
DEFAULT_HISTORICAL_END_YEAR = 2023  # 2022-23 season (2023-24+ is in workbench default)


def get_backfill_status(
    session: Session,
    raw_root: Path | None = None,
    start_year: int = DEFAULT_HISTORICAL_START_YEAR,
    end_year: int = DEFAULT_HISTORICAL_END_YEAR,
) -> dict[str, Any]:
    """Inspect current backfill progress across historical seasons."""
    root = raw_root or get_settings().raw_store_path

    # Query all imported seasons across datasets
    all_datasets = session.scalars(select(WorkbenchDataset)).all()
    imported_seasons_set: set[str] = set()
    for ds in all_datasets:
        if ds.seasons_json:
            imported_seasons_set.update(ds.seasons_json)

    seasons_status: dict[int, dict[str, Any]] = {}
    acquired_years: list[int] = []
    imported_years: list[int] = []
    pending_years: list[int] = []

    for year in range(start_year, end_year + 1):
        c_season = canonical_season_name(year)
        season_dir = root / f"sportsdataverse_{year}"
        is_acquired = (
            season_dir.exists()
            and (season_dir / f"player_boxscores_{year}.csv").exists()
            and (season_dir / f"player_boxscores_{year}.csv").stat().st_size > 0
        )
        is_imported = c_season in imported_seasons_set

        status = "pending"
        if is_imported:
            status = "imported"
            imported_years.append(year)
        elif is_acquired:
            status = "acquired"
            acquired_years.append(year)
        else:
            pending_years.append(year)

        seasons_status[year] = {
            "ending_year": year,
            "canonical_season": c_season,
            "status": status,
            "is_acquired": is_acquired,
            "is_imported": is_imported,
        }

    return {
        "range": [start_year, end_year],
        "total_seasons": end_year - start_year + 1,
        "imported_count": len(imported_years),
        "acquired_count": len(acquired_years),
        "pending_count": len(pending_years),
        "imported_years": sorted(imported_years),
        "acquired_years": sorted(acquired_years),
        "pending_years": sorted(pending_years),
        "seasons": seasons_status,
    }


def execute_backfill_batch(
    session: Session,
    start_year: int = DEFAULT_HISTORICAL_START_YEAR,
    end_year: int = DEFAULT_HISTORICAL_END_YEAR,
    batch_size: int = 2,
    target_years: list[int] | None = None,
    raw_root: Path | None = None,
    client: httpx.Client | None = None,
) -> dict[str, Any]:
    """Execute a single bounded, resumable batch of historical season backfills.

    Backfills proceed backwards toward 2000-01 in configurable batches.
    Does not mutate or overwrite active published releases.
    Checkpoints progress for clean resumption.
    """
    root = raw_root or get_settings().raw_store_path
    root.mkdir(parents=True, exist_ok=True)

    status_info = get_backfill_status(
        session, raw_root=root, start_year=start_year, end_year=end_year
    )

    if target_years is not None:
        batch_years = sorted(target_years)
    else:
        # Prioritize un-imported seasons descending from end_year down to start_year
        imported_years_set = set(status_info["imported_years"])
        unimported = [y for y in range(end_year, start_year - 1, -1) if y not in imported_years_set]
        if not unimported:
            return {
                "status": "already_completed",
                "message": f"All historical seasons {start_year}..{end_year} are already imported.",
                "batch_years": [],
                "completed_count": status_info["imported_count"],
                "total_count": status_info["total_seasons"],
            }
        batch_years = unimported[:batch_size]

    logger.info("Executing backfill batch for seasons: %s", batch_years)

    # 1. Acquire missing assets for this batch
    acquired_results: dict[str, Any] = {}
    for year in batch_years:
        season_dir = root / f"sportsdataverse_{year}"
        has_local_box = (
            season_dir.exists()
            and (season_dir / f"player_boxscores_{year}.csv").exists()
            and (season_dir / f"player_boxscores_{year}.csv").stat().st_size > 0
        )
        if not has_local_box:
            logger.info("Acquiring historical assets for ending year %d", year)
            manifest = acquire_season_assets(year, root, client=client)
            acquired_results[str(year)] = manifest
        else:
            acquired_results[str(year)] = {"status": "reused_local"}

    # 2. Import batch into WorkbenchDataset
    dataset = import_workbench_data(session, ending_years=batch_years, raw_root=root)

    # 3. Check remaining seasons after this batch
    post_status = get_backfill_status(
        session, raw_root=root, start_year=start_year, end_year=end_year
    )

    return {
        "status": "batch_completed",
        "batch_years": batch_years,
        "batch_canonical_seasons": [canonical_season_name(y) for y in batch_years],
        "dataset_id": dataset.id,
        "content_sha256": dataset.content_sha256,
        "semantic_signature": dataset.semantic_signature,
        "imported_total_player_games": dataset.coverage_json.get("total_player_games", 0),
        "imported_total_team_games": dataset.coverage_json.get("total_team_games", 0),
        "overall_imported_seasons_count": post_status["imported_count"],
        "overall_total_seasons": post_status["total_seasons"],
        "remaining_pending_count": post_status["pending_count"],
        "next_batch_candidate_years": [
            y for y in range(end_year, start_year - 1, -1) if y not in post_status["imported_years"]
        ][:batch_size],
    }


def verify_player_career_completeness(
    session: Session,
    player_id: str,
    dataset_coverage_start: date | None = None,
) -> dict[str, Any]:
    """Check whether a player's career is completely observed or explicitly partial.

    Guardrail: Never claim complete career when observations are bounded by coverage start.
    """
    earliest_game_date = session.scalar(
        select(func.min(WorkbenchPlayerGame.game_date)).where(
            WorkbenchPlayerGame.player_id == player_id
        )
    )
    earliest_season = session.scalar(
        select(WorkbenchPlayerGame.season)
        .where(WorkbenchPlayerGame.player_id == player_id)
        .order_by(WorkbenchPlayerGame.game_date.asc())
        .limit(1)
    )

    draft_info = session.scalar(
        select(WorkbenchPlayerDraft).where(WorkbenchPlayerDraft.player_id == player_id)
    )

    is_partial = False
    reasons: list[str] = []

    # If player was drafted before earliest observed game year
    if (
        draft_info is not None
        and earliest_game_date is not None
        and draft_info.draft_year < earliest_game_date.year
    ):
        is_partial = True
        reasons.append(
            f"Player drafted in {draft_info.draft_year}, but admitted dataset begins in "
            f"{earliest_season}."
        )

    # If dataset has a defined coverage start and player's earliest game is at or near that boundary
    if (
        dataset_coverage_start
        and earliest_game_date
        and earliest_game_date <= dataset_coverage_start
    ):
        is_partial = True
        reasons.append(
            f"Earliest appearance ({earliest_game_date.isoformat()}) aligns with dataset "
            f"coverage start ({dataset_coverage_start.isoformat()}). Earlier career unadmitted."
        )

    return {
        "player_id": player_id,
        "is_partial_career": is_partial,
        "earliest_observed_date": earliest_game_date.isoformat() if earliest_game_date else None,
        "earliest_observed_season": earliest_season,
        "draft_year": draft_info.draft_year if draft_info else None,
        "disclaimer": (
            "Career statistics are explicitly partial: coverage begins at dataset boundary; "
            "prior professional seasons are unadmitted and not scored as zero."
            if is_partial
            else "Observed career within admitted seasons."
        ),
        "reasons": reasons,
    }
