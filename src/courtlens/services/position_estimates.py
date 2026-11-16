"""Read-only serving of estimated positions (position-estimates-v1) and draft classes."""

from __future__ import annotations

import hashlib
import json
from collections.abc import Sequence
from functools import lru_cache
from typing import Any

from fastapi import HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session

from courtlens.config import get_settings

VERSION = "courtlens-position-estimates-v1"
POSITIONS = ("PG", "SG", "SF", "PF", "C")
METHOD_URL = "/methodology#position-estimates"
LIMITATIONS = [
    "Estimated from listed position and size plus that season's box rates; not a roster listing.",
    "Trained on NBA Draft Combine positions; neighbouring positions are often interchangeable.",
]


@lru_cache(maxsize=2)
def _decode(raw: bytes) -> dict[str, Any]:
    body: dict[str, Any] = json.loads(raw)
    if body.get("version") != VERSION:
        raise ValueError("unsupported position estimate version")
    return body


def load_position_store() -> dict[str, Any] | None:
    path = get_settings().position_estimates_manifest
    if path is None or not path.exists():
        return None
    try:
        raw = path.read_bytes()
        # The file name is the external content address; re-hash on every read.
        if hashlib.sha256(raw).hexdigest() != path.stem:
            raise ValueError("position estimate content address changed")
        return _decode(raw)
    except (ValueError, OSError) as exc:
        raise HTTPException(
            status_code=503, detail="Position estimate integrity check failed"
        ) from exc


def load_provisional_store() -> dict[str, Any] | None:
    """The season in progress, labelled daily by the frozen model (`refresh-position-estimates`).

    Only seasons newer than every sealed one are read from it; a sealed season always wins.
    """
    from courtlens.services.served_bundle import resolve

    path = resolve(get_settings().position_estimates_provisional_dir)
    if path is None or not path.exists():
        return None
    try:
        raw = path.read_bytes()
        if hashlib.sha256(raw).hexdigest() != path.stem:
            raise ValueError("provisional position estimate content address changed")
        return _decode(raw)
    except (ValueError, OSError) as exc:
        raise HTTPException(
            status_code=503, detail="Position estimate integrity check failed"
        ) from exc


def _season_rows() -> dict[str, dict[str, Any]]:
    """Sealed seasons, then provisional seasons after the newest sealed one."""
    sealed = (load_position_store() or {}).get("seasons", {})
    newest = max(sealed, default="")
    pending = (load_provisional_store() or {}).get("seasons", {})
    return {**sealed, **{k: v for k, v in pending.items() if k > newest}}


def season_estimates(season: str | Sequence[str]) -> dict[str, dict[str, Any]]:
    """Player ID → estimate, NBA listing it was bounded by, and whether it is provisional.

    A season range uses each player's latest estimated season inside the range.
    """
    sealed = (load_position_store() or {}).get("seasons", {})
    rows = _season_rows()
    seasons = [season] if isinstance(season, str) else sorted(season)
    estimates: dict[str, dict[str, Any]] = {}
    for name in seasons:
        for pid, row in rows.get(name, {}).items():
            estimates[pid] = {
                "position": row["position"],
                "listed": row.get("listed"),
                "provisional": name not in sealed,
                "season": name,
            }
    return estimates


def position_coverage() -> dict[str, Any]:
    """Which seasons have estimates, and which of them are provisional (season in progress)."""
    sealed = (load_position_store() or {}).get("seasons", {})
    newest = max(sealed, default="")
    store = load_provisional_store() or {}
    pending = sorted(k for k in store.get("seasons", {}) if k > newest)
    return {
        "version": VERSION,
        "method_url": METHOD_URL,
        "sealed_seasons": sorted(sealed),
        "provisional_seasons": pending,
        "provisional_observed_at": store.get("input", {}).get("player_index_observed_at")
        if pending
        else None,
    }


def season_positions(season: str | Sequence[str]) -> dict[str, str]:
    """Player ID → estimated position; empty when no estimate exists.

    A season range uses each player's latest estimated season inside the range.
    """
    rows = _season_rows()
    seasons = [season] if isinstance(season, str) else sorted(season)
    positions: dict[str, str] = {}
    for name in seasons:
        positions.update({pid: row["position"] for pid, row in rows.get(name, {}).items()})
    return positions


def position_player_ids(season: str | Sequence[str], positions: Sequence[str]) -> set[str]:
    wanted = set(positions)
    return {pid for pid, position in season_positions(season).items() if position in wanted}


def draft_classes(session: Session) -> list[dict[str, int]]:
    """Draft years with the number of drafted players that have an NBA person ID."""
    rows = session.execute(
        text(
            "SELECT draft_year, count(DISTINCT player_id) AS players "
            "FROM analytics_marts.mart_stats_draft_history "
            "WHERE player_id IS NOT NULL AND player_id NOT IN ('', '-1') "
            "GROUP BY draft_year ORDER BY draft_year DESC"
        )
    ).all()
    return [{"year": int(r.draft_year), "players": int(r.players)} for r in rows]


def draft_class_player_ids(session: Session, year: int) -> set[str]:
    rows = session.execute(
        text(
            "SELECT DISTINCT player_id FROM analytics_marts.mart_stats_draft_history "
            "WHERE draft_year = :year AND player_id IS NOT NULL AND player_id NOT IN ('', '-1')"
        ),
        {"year": year},
    ).scalars()
    return {str(pid) for pid in rows}
