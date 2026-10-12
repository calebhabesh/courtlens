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


def season_positions(season: str) -> dict[str, str]:
    """Player ID → estimated position for one season; empty when no estimate exists."""
    store = load_position_store()
    if store is None:
        return {}
    rows = store["seasons"].get(season, {})
    return {pid: row["position"] for pid, row in rows.items()}


def position_player_ids(season: str, positions: Sequence[str]) -> set[str]:
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
