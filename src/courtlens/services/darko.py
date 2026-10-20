"""Operator-acquired, sealed DARKO dated ratings. Visitor queries never fetch.

DARKO's season selector holds opening projections. Its public `asof` leaderboard gives
each player's latest retrospective pregame rating at a date. Import at each phase's last
admitted game date; regular-season views must not inherit playoff updates.
"""

from __future__ import annotations

import hashlib
import json
import os
from datetime import UTC, date, datetime, timedelta
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
from courtlens.services.source_acquisition import (
    KEEP_DAYS,
    ScheduledFetcher,
    keep_body,
    prune_receipts,
    read_heartbeat,
    write_heartbeat,
)
from courtlens.services.workbench_analytics import resolve_workbench_context
from courtlens.workbench_models import WorkbenchArtifact, WorkbenchPlayerGame

VERSION = "courtlens-darko-dpm-v2"
SOURCE = "darko"
RESOURCE = "darko"
ATTRIBUTION = "DARKO Daily Plus-Minus by Kostya Medvedovsky (darko.app)"
INTERVAL_SECONDS = 5.0
PHASES = ("regular_season", "playoffs")
# The latest published ratings and expected minutes, sealed on demand between seasons; serves
# Roster Shapes' projection only, never a Stats scope.
CURRENT = "current"
# Pruned bundles' successors (sha -> sha), so a saved investigation pinned to a pruned bundle
# still resolves: pruning only drops bundles whose dated entries the successor carries verbatim.
ALIASES = ".aliases.json"
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
    def __init__(
        self, session: Session, root: Path, client: httpx.Client, *, retain_bodies: bool = True
    ) -> None:
        super().__init__(
            session,
            root,
            client,
            resource=RESOURCE,
            kinds={SOURCE: "dated_model_leaderboard"},
            validate_url=validate_darko_url,
            max_bytes=4_000_000,
            retain_bodies=retain_bodies,
        )


def refresh(
    session: Session,
    root: Path,
    client: httpx.Client,
    seasons: list[str],
    output: Path,
    phases: list[str] | None = None,
    carry_forward: Path | None = None,
) -> tuple[Path, list[dict[str, Any]]]:
    """Seal only after every requested scope succeeds; keep earlier bundles and receipts.

    `carry_forward` copies a sealed bundle's entries for scopes not fetched now, byte for byte,
    so adding history never re-fetches (and silently revises) already-sealed seasons.
    """
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
    if carry_forward is not None:
        entries = merge_carried(entries, carry_forward)
    path = _seal(entries, output)
    return path, results


def refresh_current(
    session: Session,
    root: Path,
    client: httpx.Client,
    season: str,
    as_of: date,
    output: Path,
    carry_forward: Path | None = None,
) -> tuple[Path, dict[str, Any]]:
    """Seal DARKO's dated board at `as_of` as the season's `current` entry (latest ratings and
    expected minutes); it replaces that season's earlier `current` entry and nothing else."""
    context = resolve_workbench_context(session)
    url = snapshot_url(as_of)
    receipt = DarkoFetcher(session, root, client).fetch(SOURCE, url, season)
    session.commit()
    if receipt.status != "success" or not receipt.artifact_id or receipt.finished_at is None:
        raise ValueError(f"DARKO current {season}: {receipt.error_summary}; no bundle sealed")
    artifact = session.get(WorkbenchArtifact, receipt.artifact_id)
    if artifact is None:
        raise ValueError("DARKO receipt lost its retained artifact")
    raw = (root / artifact.storage_path).read_bytes()
    if hashlib.sha256(raw).hexdigest() != artifact.sha256:
        raise ValueError("retained DARKO bytes changed")
    board = parse_leaderboard(raw)
    if board["season"] != season or board["as_of"] != as_of.isoformat():
        raise ValueError("DARKO returned a different season or snapshot date")
    entry = {
        **board,
        "phase": CURRENT,
        "url": url,
        "raw_sha256": artifact.sha256,
        "acquisition_id": str(receipt.id),
        "observed_at": receipt.finished_at.isoformat(),
        "dataset_id": context.dataset_id,
    }
    entries = merge_carried([entry], carry_forward) if carry_forward is not None else [entry]
    path = _seal(entries, output)
    return path, {
        "season": season,
        "phase": CURRENT,
        "as_of": board["as_of"],
        "data_date": board["data_date"],
        "players": len(board["players"]),
        "with_minutes": sum(p.get("x_minutes") is not None for p in board["players"].values()),
        "url": url,
    }


def _seal(entries: list[dict[str, Any]], output: Path) -> Path:
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
    return path


def season_of(day: date) -> str:
    start = day.year if day.month >= 7 else day.year - 1
    return f"{start}-{(start + 1) % 100:02d}"


def _ratings_digest(entry: dict[str, Any]) -> str:
    """What a `current` entry says, apart from the date it was asked for."""
    body = {key: entry[key] for key in ("season", "data_date", "players")}
    return hashlib.sha256(json.dumps(body, sort_keys=True).encode()).hexdigest()


def refresh_daily(
    session: Session,
    root: Path,
    client: httpx.Client,
    output: Path,
    as_of: date,
    keep_days: int = KEEP_DAYS,
) -> tuple[Path, dict[str, Any]]:
    """Scheduled run: seal DARKO's board at `as_of` as `current` only when its ratings changed.

    DARKO's dated board repeats its last ratings until it publishes new ones (all offseason),
    so an unchanged run keeps only a receipt, pruned after the window, and rewrites the
    heartbeat. A changed run retains the response and seals a bundle carrying every other entry
    verbatim from the newest one; bundles past the window that the newest supersedes are pruned.
    """
    base = newest_bundle(output)
    if base is None:
        raise ValueError("no sealed DARKO bundle to carry forward; run refresh-darko first")
    fetcher = DarkoFetcher(session, root, client, retain_bodies=False)
    url = snapshot_url(as_of)
    receipt = fetcher.fetch(SOURCE, url, season_of(as_of))
    session.commit()
    raw = fetcher.bodies.get(receipt.id)
    if receipt.status != "success" or raw is None or receipt.finished_at is None:
        raise ValueError(f"DARKO {as_of}: {receipt.error_summary}; no bundle sealed")
    board = parse_leaderboard(raw)
    previous = season_of(as_of.replace(year=as_of.year - 1))
    if board["as_of"] != as_of.isoformat() or board["season"] not in {season_of(as_of), previous}:
        raise ValueError("DARKO returned a different snapshot date or an unexpected season")
    checked = receipt.finished_at.replace(tzinfo=receipt.finished_at.tzinfo or UTC)
    pruned_receipts = prune_receipts(session, SOURCE, keep_days, checked)
    summary: dict[str, Any] = {
        "season": board["season"],
        "as_of": board["as_of"],
        "data_date": board["data_date"],
        "players": len(board["players"]),
    }
    held = next(
        (
            e
            for e in _decode(base.read_bytes())["entries"]
            if e["season"] == board["season"] and e["phase"] == CURRENT
        ),
        None,
    )
    beat = {"checked_at": checked.isoformat(), "as_of": board["as_of"]}
    if held is not None and _ratings_digest(held) == _ratings_digest(board):
        write_heartbeat(output, beat | {"manifest_sha256": base.stem})
        return base, {**summary, "changed": False, "pruned": {"receipts": pruned_receipts}}
    keep_body(fetcher, receipt, "application/json")
    session.commit()
    entry = {
        **board,
        "phase": CURRENT,
        "url": url,
        "raw_sha256": hashlib.sha256(raw).hexdigest(),
        "acquisition_id": str(receipt.id),
        "observed_at": checked.isoformat(),
        "dataset_id": resolve_workbench_context(session).dataset_id,
    }
    path = _seal(merge_carried([entry], base), output)
    write_heartbeat(output, beat | {"manifest_sha256": path.stem})
    pruned = prune(output, root, keep_days, checked) | {"receipts": pruned_receipts}
    return path, {**summary, "changed": True, "pruned": pruned}


def _dated(body: dict[str, Any]) -> list[tuple[str, str, str]]:
    return sorted(
        (e["season"], e["phase"], e["raw_sha256"]) for e in body["entries"] if e["phase"] in PHASES
    )


def prune(output: Path, root: Path, keep_days: int, now: datetime) -> dict[str, int]:
    """Drop bundles sealed before the window whose dated entries the newest carries verbatim.

    A bundle holding dated history the newest lacks is never pruned. Each pruned bundle is
    aliased to the newest, and its `current` responses go unless a kept bundle cites them.
    """
    newest = newest_bundle(output)
    if newest is None:
        return {"bundles": 0, "raw": 0}
    head = _decode(newest.read_bytes())
    cutoff = now - timedelta(days=keep_days)
    kept_raw: set[str] = set()
    dropped: list[tuple[Path, dict[str, Any]]] = []
    for path in output.glob("*.json"):
        body = _bundle(path)
        if body is None:
            continue
        old = datetime.fromisoformat(body["sealed_at"]) < cutoff
        if path != newest and old and _dated(body) == _dated(head):
            dropped.append((path, body))
        else:
            kept_raw.update(e["raw_sha256"] for e in body["entries"])
    aliases = _aliases(output)
    raw = 0
    for path, body in dropped:
        for entry in body["entries"]:
            sha = entry["raw_sha256"]
            file = root / sha[:2] / sha
            if entry["phase"] == CURRENT and sha not in kept_raw and file.exists():
                file.unlink()
                raw += 1
                kept_raw.add(sha)
        aliases[path.stem] = newest.stem
        path.unlink()
    if dropped:
        gone = {path.stem for path, _ in dropped}
        aliases = {old: newest.stem if new in gone else new for old, new in aliases.items()}
        tmp = output / f"{ALIASES}.tmp"
        tmp.write_text(json.dumps(aliases, sort_keys=True))
        os.replace(tmp, output / ALIASES)
    return {"bundles": len(dropped), "raw": raw}


def _aliases(directory: Path) -> dict[str, str]:
    try:
        aliases = json.loads((directory / ALIASES).read_text())
    except (OSError, ValueError):
        return {}
    return aliases if isinstance(aliases, dict) else {}


def _bundle(path: Path) -> dict[str, Any] | None:
    try:
        raw = path.read_bytes()
        if hashlib.sha256(raw).hexdigest() != path.stem:
            return None
        return _decode(raw)
    except (OSError, ValueError):
        return None


_newest: dict[Path, tuple[frozenset[str], Path | None]] = {}


def newest_bundle(directory: Path) -> Path | None:
    """The intact bundle sealed last; cached while the set of (content-addressed) names holds."""
    if not directory.is_dir():
        return None
    paths = list(directory.glob("*.json"))
    signature = frozenset(path.name for path in paths)
    cached = _newest.get(directory)
    if cached and cached[0] == signature:
        return cached[1]
    sealed = [(body["sealed_at"], path) for path in paths if (body := _bundle(path)) is not None]
    newest = max(sealed)[1] if sealed else None
    _newest[directory] = (signature, newest)
    return newest


def darko_path(manifest_sha256: str | None = None) -> Path | None:
    """The configured bundle: a file, or the newest in a directory; a pin names one by hash."""
    configured = get_settings().darko_manifest
    if configured is None:
        return None
    directory = configured if configured.is_dir() else configured.parent
    if manifest_sha256:
        path = directory / f"{manifest_sha256}.json"
        if not path.exists() and manifest_sha256 in (aliases := _aliases(directory)):
            path = directory / f"{aliases[manifest_sha256]}.json"
        return path
    return newest_bundle(configured) if configured.is_dir() else configured


def last_checked(path: Path) -> str | None:
    """When a scheduled run last confirmed this bundle's `current` ratings."""
    beat = read_heartbeat(path.parent)
    return str(beat["checked_at"]) if beat and beat.get("manifest_sha256") == path.stem else None


def merge_carried(entries: list[dict[str, Any]], carry_forward: Path) -> list[dict[str, Any]]:
    """Fresh entries plus the sealed bundle's entries for every other season/phase, verbatim."""
    raw = carry_forward.read_bytes()
    if hashlib.sha256(raw).hexdigest() != carry_forward.stem:
        raise ValueError("carried DARKO bundle changed")
    fetched = {(entry["season"], entry["phase"]) for entry in entries}
    kept = [
        entry
        for entry in _decode(raw)["entries"]
        if (entry["season"], entry["phase"]) not in fetched
    ]
    return sorted(kept + entries, key=lambda entry: (entry["season"], entry["phase"]))


@lru_cache(maxsize=2)
def _decode(raw: bytes) -> dict[str, Any]:
    body: dict[str, Any] = json.loads(raw)
    if body.get("version") != VERSION:
        raise ValueError("unsupported DARKO artifact version")
    return body


_verified: dict[Path, tuple[tuple[int, int, int], dict[str, Any]]] = {}


def load_darko_store(manifest_sha256: str | None = None) -> dict[str, Any] | None:
    path = darko_path(manifest_sha256)
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
    path = darko_path()
    return {
        "status": "available" if store else "not_configured",
        "source": ATTRIBUTION,
        "version": VERSION,
        "manifest_sha256": path.stem if store and path else None,
        "limitations": LIMITATIONS,
        "scopes": [
            {key: entry[key] for key in ("season", "phase", "as_of", "data_date")}
            for entry in (store or {}).get("entries", [])
            if entry["phase"] in PHASES
        ],
    }


def darko_disclosure(query: QuerySpec, cutoff: date) -> dict[str, Any]:
    entry = darko_scope(query, cutoff)
    store = load_darko_store(query.darko_manifest_sha256)
    path = darko_path()
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
