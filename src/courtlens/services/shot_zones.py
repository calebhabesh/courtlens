"""Operator-acquired pbpstats shot-zone and box season totals (Player Twins); no visitor fetches.

pbpstats' player totals cap at 500 rows, so each season is read team by team (one request per
franchise, at the source's 5 s pace) and a traded player's rows are summed into one
player-season. Each team request is retained byte for byte; a rerun skips URLs it already holds,
so an interrupted run resumes. The bundle is sealed only when every requested URL has succeeded.
"""

from __future__ import annotations

import hashlib
import json
import os
from datetime import UTC, datetime
from functools import lru_cache
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urlsplit

import httpx
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from courtlens.config import get_settings
from courtlens.domain.teams import NBA_TEAMS
from courtlens.evaluation.impact_rating_inputs import write_artifact
from courtlens.ingestion.stats_feeds import PBPSTATS_BASE, pbpstats_url
from courtlens.services.source_acquisition import ScheduledFetcher
from courtlens.workbench_models import WorkbenchAcquisition, WorkbenchArtifact

VERSION = "courtlens-shot-zones-v1"
SOURCE = "pbpstats"
RESOURCE = "pbpstats_shot_zones"
ATTRIBUTION = "pbpstats.com season totals by Darryl Blackport"
INTERVAL_SECONDS = 5.0
# pbpstats' play-by-play totals begin in 1996-97 (1995-96 returns no rows).
FIRST_SEASON = 1996
# Summed per player-season. FTM is pbpstats' FtPoints (one point per made free throw).
FIELDS = {
    "games": "GamesPlayed",
    "seconds": "SecondsPlayed",
    "off_poss": "OffPoss",
    "points": "Points",
    "rim_fga": "AtRimFGA",
    "rim_fgm": "AtRimFGM",
    "short_mid_fga": "ShortMidRangeFGA",
    "short_mid_fgm": "ShortMidRangeFGM",
    "long_mid_fga": "LongMidRangeFGA",
    "long_mid_fgm": "LongMidRangeFGM",
    "fg3a": "FG3A",
    "fg3m": "FG3M",
    "fta": "FTA",
    "ftm": "FtPoints",
    # Box Score twins: offensive counts per offensive possession, defensive per defensive one.
    "def_poss": "DefPoss",
    "assists": "Assists",
    "turnovers": "Turnovers",
    "oreb": "OffRebounds",
    "dreb": "DefRebounds",
    "steals": "Steals",
    "blocks": "Blocks",
}


def season_label(start: int) -> str:
    return f"{start}-{(start + 1) % 100:02d}"


def validate_url(source: str, url: str, season: str) -> float:
    parts = urlsplit(url)
    if source != SOURCE or f"{parts.scheme}://{parts.netloc}{parts.path}" != PBPSTATS_BASE:
        raise ValueError("not a pbpstats totals URL")
    query = parse_qs(parts.query, keep_blank_values=True, strict_parsing=True)
    flat = {key: values[0] for key, values in query.items() if len(values) == 1}
    if set(flat) != {"Season", "SeasonType", "Type", "TeamId"} or len(flat) != len(query):
        raise ValueError("pbpstats parameters are not admitted")
    if flat["Season"] != season or flat["SeasonType"] != "Regular+Season":
        raise ValueError("pbpstats season disagrees")
    if flat["Type"] != "Player" or flat["TeamId"] not in NBA_TEAMS:
        raise ValueError("pbpstats shot zones read player totals for one NBA team")
    return INTERVAL_SECONDS


def team_url(season: str, team_id: str) -> str:
    return pbpstats_url(season, "regular_season", "Player", team_id)


def _held(session: Session, url: str) -> WorkbenchAcquisition | None:
    return session.scalar(
        select(WorkbenchAcquisition)
        .where(
            WorkbenchAcquisition.resource == RESOURCE,
            WorkbenchAcquisition.source_url == url,
            WorkbenchAcquisition.status == "success",
            WorkbenchAcquisition.artifact_id.is_not(None),
        )
        .order_by(WorkbenchAcquisition.finished_at.desc())
        .limit(1)
    )


def _body(session: Session, root: Path, receipt: WorkbenchAcquisition) -> bytes:
    artifact = session.get(WorkbenchArtifact, receipt.artifact_id)
    if artifact is None:
        raise ValueError("pbpstats receipt lost its retained artifact")
    raw = (root / artifact.storage_path).read_bytes()
    if hashlib.sha256(raw).hexdigest() != artifact.sha256:
        raise ValueError("retained pbpstats bytes changed")
    return raw


def team_rows(raw: bytes, team_id: str) -> list[dict[str, Any]]:
    """One team's player rows; an empty table is an observed empty team-season (no franchise)."""
    body = json.loads(raw)
    rows = body.get("multi_row_table_data") if isinstance(body, dict) else None
    if not isinstance(rows, list):
        raise ValueError("pbpstats payload has no row table")
    result = []
    for row in rows:
        if not isinstance(row, dict) or not str(row.get("EntityId", "")).isdigit():
            raise ValueError("pbpstats row without an NBA person id")
        if str(row.get("TeamId")) != team_id:
            raise ValueError("pbpstats row from another team")
        result.append(row)
    return result


def season_players(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Sum each player's team rows; the team list keeps each stint's possessions."""
    players: dict[str, dict[str, Any]] = {}
    for row in rows:
        pid = str(row["EntityId"])
        player = players.setdefault(
            pid,
            {"player_id": pid, "name": row.get("Name"), "teams": []} | {key: 0.0 for key in FIELDS},
        )
        if any(team["tricode"] == row.get("TeamAbbreviation") for team in player["teams"]):
            raise ValueError("one team-season returned by two franchise ids")
        for key, column in FIELDS.items():
            player[key] += float(row.get(column) or 0)
        player["teams"].append(
            {
                "team_id": str(row["TeamId"]),
                "tricode": row.get("TeamAbbreviation"),
                "off_poss": float(row.get("OffPoss") or 0),
            }
        )
    for player in players.values():
        player["teams"].sort(key=lambda team: -team["off_poss"])
    return sorted(players.values(), key=lambda player: player["player_id"])


def acquire(
    session: Session,
    root: Path,
    client: httpx.Client,
    seasons: list[str],
    output: Path,
    log: Any = print,
) -> Path:
    """Fetch every missing team-season, then seal one bundle over all requested seasons."""
    fetcher = ScheduledFetcher(
        session,
        root,
        client,
        resource=RESOURCE,
        kinds={SOURCE: "season_totals"},
        validate_url=validate_url,
    )
    plan = [(season, team_id) for season in seasons for team_id in sorted(NBA_TEAMS)]
    for index, (season, team_id) in enumerate(plan, 1):
        url = team_url(season, team_id)
        if _held(session, url) is not None:
            continue
        receipt = fetcher.fetch(SOURCE, url, season)
        session.commit()
        log(f"{index}/{len(plan)} {season} {NBA_TEAMS[team_id].tricode} {receipt.status}")
        if receipt.status != "success":
            raise ValueError(f"pbpstats {season} {team_id}: {receipt.error_summary}; not sealed")
    entries = {}
    for season in seasons:
        rows: list[dict[str, Any]] = []
        raw_sha: list[str] = []
        for team_id in sorted(NBA_TEAMS):
            held = _held(session, team_url(season, team_id))
            if held is None:
                raise ValueError(f"pbpstats {season} {team_id} missing; not sealed")
            raw = _body(session, root, held)
            raw_sha.append(hashlib.sha256(raw).hexdigest())
            rows.extend(team_rows(raw, team_id))
        entries[season] = {"raw_sha256": raw_sha, "players": season_players(rows)}
    path, _ = write_artifact(
        output,
        {
            "version": VERSION,
            "source": ATTRIBUTION,
            "sealed_at": datetime.now(UTC).isoformat(),
            "seasons": entries,
        },
    )
    return path


def bundle_path() -> Path | None:
    """The configured bundle: a file, or the newest sealed in a directory."""
    configured = get_settings().shot_zones_manifest
    if configured is None or not configured.exists():
        return None
    if configured.is_file():
        return configured
    paths = sorted(configured.glob("*.json"), key=lambda path: path.stat().st_mtime_ns)
    return paths[-1] if paths else None


@lru_cache(maxsize=2)
def _decode(path: str, signature: tuple[int, int, int]) -> dict[str, Any]:
    raw = Path(path).read_bytes()
    if hashlib.sha256(raw).hexdigest() != Path(path).stem:
        raise ValueError("shot-zone bundle content address changed")
    body: dict[str, Any] = json.loads(raw)
    if body.get("version") != VERSION:
        raise ValueError("unsupported shot-zone bundle version")
    return body


def load_shot_zones() -> dict[str, Any] | None:
    path = bundle_path()
    if path is None:
        return None
    try:
        stat = path.stat()
        return _decode(os.fspath(path), (stat.st_ino, stat.st_size, stat.st_mtime_ns))
    except (OSError, ValueError) as exc:
        raise HTTPException(status_code=503, detail="Shot-zone bundle integrity failed") from exc
