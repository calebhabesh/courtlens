"""Operator-acquired, sealed DARKO dated ratings. Visitor queries never fetch.

DARKO's season selector holds opening projections. Its public `asof` leaderboard gives
each player's latest retrospective pregame rating at a date. Import at each phase's last
admitted game date; regular-season views must not inherit playoff updates.
"""

from __future__ import annotations

import hashlib
import json
from datetime import UTC, date, datetime
from functools import lru_cache
from pathlib import Path
from typing import Any

import httpx
from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from courtlens.config import get_settings
from courtlens.domain.query_spec import QuerySpec
from courtlens.evaluation.impact_rating_inputs import write_artifact
from courtlens.ingestion.darko import URL_PATTERN, parse_leaderboard, snapshot_url
from courtlens.services.source_acquisition import ScheduledFetcher
from courtlens.services.workbench_analytics import resolve_workbench_context
from courtlens.workbench_models import WorkbenchArtifact, WorkbenchPlayerGame

VERSION = "courtlens-darko-dpm-v2"
SOURCE = "darko"
RESOURCE = "darko"
ATTRIBUTION = "DARKO Daily Plus-Minus by Kostya Medvedovsky (darko.app)"
INTERVAL_SECONDS = 5.0
PHASES = ("regular_season", "playoffs")
LIMITATIONS = [
    "DARKO's retrospective pregame forecast at the phase's last admitted game date; not a "
    "season average or a CourtLens estimate. Higher is better for DPM, ODPM and DDPM.",
    "Historical ratings are published retrospectively; original publication-time model "
    "versions are unavailable. Never used as CourtLens forecasting features.",
    "Different dates or model revisions can differ from Databallr. Percentiles are CourtLens "
    "league ranks, not DARKO or Databallr percentiles.",
]


def validate_darko_url(source: str, url: str, season: str) -> float:
    match = URL_PATTERN.fullmatch(url)
    if source != SOURCE or match is None:
        raise ValueError("not a dated DARKO leaderboard URL")
    as_of = date.fromisoformat(match[1])
    # Do not assume a July endpoint: the 2019-20 bubble ended in October.
    if as_of.year not in {int(season[:4]), int(season[:4]) + 1}:
        raise ValueError("DARKO snapshot date is outside the season")
    return INTERVAL_SECONDS


class DarkoFetcher(ScheduledFetcher):
    def __init__(self, session: Session, root: Path, client: httpx.Client) -> None:
        super().__init__(
            session,
            root,
            client,
            resource=RESOURCE,
            kinds={SOURCE: "dated_model_leaderboard"},
            validate_url=validate_darko_url,
            max_bytes=4_000_000,
        )


def refresh(
    session: Session,
    root: Path,
    client: httpx.Client,
    seasons: list[str],
    output: Path,
    phases: list[str] | None = None,
) -> tuple[Path, list[dict[str, Any]]]:
    """Seal only after every requested scope succeeds; keep earlier bundles and receipts."""
    phases = phases or list(PHASES)
    if not seasons or len(set(seasons)) != len(seasons) or not set(phases) <= set(PHASES):
        raise ValueError("unique seasons and regular_season/playoffs phases required")
    context = resolve_workbench_context(session, requested_season=seasons[0])
    scopes = []
    for season in seasons:
        for phase in phases:
            end = session.scalar(
                select(func.max(WorkbenchPlayerGame.game_date)).where(
                    WorkbenchPlayerGame.dataset_id == context.dataset_id,
                    WorkbenchPlayerGame.season == season,
                    WorkbenchPlayerGame.phase == phase,
                )
            )
            if end is None:
                raise ValueError(f"no admitted game dates for {season}/{phase}")
            scopes.append((season, phase, end))
    fetcher = DarkoFetcher(session, root, client)
    results: list[dict[str, Any]] = []
    entries = []
    for season, phase, end in scopes:
        url = snapshot_url(end)
        receipt = fetcher.fetch(SOURCE, url, season)
        session.commit()
        if receipt.status != "success" or not receipt.artifact_id or receipt.finished_at is None:
            raise ValueError(f"DARKO {season}/{phase}: {receipt.error_summary}; no bundle sealed")
        artifact = session.get(WorkbenchArtifact, receipt.artifact_id)
        if artifact is None:
            raise ValueError("DARKO receipt lost its retained artifact")
        raw = (root / artifact.storage_path).read_bytes()
        if hashlib.sha256(raw).hexdigest() != artifact.sha256:
            raise ValueError("retained DARKO bytes changed")
        board = parse_leaderboard(raw)
        if board["season"] != season or board["as_of"] != end.isoformat():
            raise ValueError("DARKO returned a different season or snapshot date")
        entries.append(
            {
                **board,
                "phase": phase,
                "url": url,
                "raw_sha256": artifact.sha256,
                "acquisition_id": str(receipt.id),
                "observed_at": receipt.finished_at.isoformat(),
                "dataset_id": context.dataset_id,
            }
        )
        results.append(
            {
                "season": season,
                "phase": phase,
                "as_of": board["as_of"],
                "status": receipt.status,
                "players": len(board["players"]),
                "url": url,
            }
        )
    sealed = {
        "version": VERSION,
        "source": {
            "name": ATTRIBUTION,
            "host": "www.darko.app",
            "policy": "courtlens-source-policy-v3",
            "limitations": LIMITATIONS,
        },
        "sealed_at": datetime.now(UTC).isoformat(),
        "entries": entries,
    }
    path, _ = write_artifact(output, sealed)
    return path, results


@lru_cache(maxsize=2)
def _decode(raw: bytes) -> dict[str, Any]:
    body: dict[str, Any] = json.loads(raw)
    if body.get("version") != VERSION:
        raise ValueError("unsupported DARKO artifact version")
    return body


_verified: dict[Path, tuple[tuple[int, int, int], dict[str, Any]]] = {}


def load_darko_store(manifest_sha256: str | None = None) -> dict[str, Any] | None:
    path = get_settings().darko_manifest
    if manifest_sha256:
        if path is None:
            raise HTTPException(status_code=503, detail="Pinned DARKO bundle is unavailable")
        path = path.parent / f"{manifest_sha256}.json"
    if path is None or not path.exists():
        if manifest_sha256:
            raise HTTPException(status_code=503, detail="Pinned DARKO bundle is unavailable")
        return None
    try:
        stat = path.stat()
        signature = (stat.st_ino, stat.st_size, stat.st_mtime_ns)
        cached = _verified.get(path)
        if cached and cached[0] == signature:
            return cached[1]
        raw = path.read_bytes()
        if hashlib.sha256(raw).hexdigest() != path.stem:
            raise ValueError("DARKO artifact content address changed")
        body = _decode(raw)
        _verified[path] = (signature, body)
        return body
    except (ValueError, OSError) as exc:
        raise HTTPException(status_code=503, detail="DARKO integrity check failed") from exc


def darko_scope(query: QuerySpec, cutoff: date) -> dict[str, Any] | None:
    """One phase-specific dated snapshot wholly before the exclusive cutoff."""
    if query.window.kind.value != "season" or query.season_scope.seasons:
        return None
    store = load_darko_store(query.darko_manifest_sha256)
    return next(
        (
            entry
            for entry in (store or {}).get("entries", [])
            if entry["season"] == query.season
            and entry["phase"] == query.phase
            and entry["as_of"] < cutoff.isoformat()
        ),
        None,
    )


def darko_binding(query: QuerySpec, cutoff: date) -> dict[str, Any]:
    entry = darko_scope(query, cutoff)
    return {
        "darko_snapshot": {
            key: entry[key] for key in ("season", "phase", "as_of", "data_date", "raw_sha256")
        }
        if entry
        else None
    }


def darko_catalog_scope() -> dict[str, Any]:
    store = load_darko_store()
    path = get_settings().darko_manifest
    return {
        "status": "available" if store else "not_configured",
        "source": ATTRIBUTION,
        "version": VERSION,
        "manifest_sha256": path.stem if store and path else None,
        "limitations": LIMITATIONS,
        "scopes": [
            {key: entry[key] for key in ("season", "phase", "as_of", "data_date")}
            for entry in (store or {}).get("entries", [])
        ],
    }


def darko_disclosure(query: QuerySpec, cutoff: date) -> dict[str, Any]:
    entry = darko_scope(query, cutoff)
    store = load_darko_store(query.darko_manifest_sha256)
    path = get_settings().darko_manifest
    return {
        "status": ("partial" if entry["data_date"] < entry["as_of"] else "available")
        if entry
        else "unavailable",
        "source": ATTRIBUTION,
        "version": VERSION,
        "manifest_sha256": query.darko_manifest_sha256 or (path.stem if store and path else None),
        "limitations": LIMITATIONS,
        **(
            {key: entry[key] for key in ("as_of", "data_date", "url", "raw_sha256", "observed_at")}
            if entry
            else {}
        ),
    }


def darko_sql_rows(query: QuerySpec, cutoff: date) -> tuple[str, str | None]:
    """Rows and snapshot horizon; SQL also checks the bound dataset's phase coverage."""
    entry = darko_scope(query, cutoff)
    players = (entry or {}).get("players", {})
    return json.dumps(
        [
            {"player_id": pid, "dpm": row["dpm"], "o_dpm": row["o_dpm"], "d_dpm": row["d_dpm"]}
            for pid, row in players.items()
        ],
        separators=(",", ":"),
    ), (entry or {}).get("as_of")
