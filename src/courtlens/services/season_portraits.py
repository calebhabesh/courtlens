"""Team-season player headshots from the NBA CDN.

The CDN keeps one official headshot per player, team and season at
``/headshots/nba/{team_id}/{start_year}/1040x760/{player_id}.png`` from the 2015-16 season on;
the folder is the season's starting year (2016 is 2016-17). A miss answers with a small XML
"Access Denied" document or the generic silhouette, never a photo.

Targets are the player-team-seasons observed in admitted box scores, so a stray upload under a
team the player never played for is never requested. Each request ends as an ``active`` row
(image in the content-addressed portrait cache) or a ``missing`` row, so the next run only asks
for stints it has not settled. Transient failures (timeouts, 5xx) leave no row and are retried.
"""

from __future__ import annotations

import hashlib
import logging
import re
import struct
import time
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from pathlib import Path

import httpx
from sqlalchemy import Engine, select
from sqlalchemy.orm import Session

from courtlens.domain.teams import get_team_by_tricode, get_team_info
from courtlens.models import utc_now
from courtlens.services.workbench_jobs import PLACEHOLDER_PORTRAIT_SHA256
from courtlens.workbench_models import PlayerSeasonPortrait, WorkbenchPlayerGame

logger = logging.getLogger(__name__)

SEASON_PORTRAIT_SOURCE = "nba_cdn_team_season_1040x760"
FIRST_SEASON = "2015-16"
_SEASON = re.compile(r"^(\d{4})-(\d{2})$")
_NUMERIC = re.compile(r"^[0-9]{1,12}$")
_MAX_BYTES = 1_000_000


@dataclass(frozen=True)
class SeasonPortraitTarget:
    player_id: str
    team_id: str
    team_tricode: str
    season: str

    @property
    def url(self) -> str:
        start_year = self.season[:4]
        return (
            f"https://cdn.nba.com/headshots/nba/{self.team_id}/{start_year}/1040x760/"
            f"{self.player_id}.png"
        )


@dataclass
class SeasonPortraitSummary:
    targets: int = 0
    acquired: int = 0
    missing: int = 0
    retry_later: int = 0
    bytes: int = 0


def resolve_team(team: str) -> tuple[str, str] | None:
    """(NBA team ID, tricode) for a tricode or numeric team ID; None when it is not an NBA team."""
    info = get_team_info(team) if _NUMERIC.match(team) else get_team_by_tricode(team.upper())
    return (info.team_id, info.tricode) if info is not None else None


def season_portrait_targets(
    session: Session, from_season: str = FIRST_SEASON, seasons: list[str] | None = None
) -> list[SeasonPortraitTarget]:
    """Observed player-team-seasons with no settled row yet, oldest season first."""
    if not _SEASON.match(from_season):
        raise ValueError("from_season must look like 2015-16")
    query = (
        select(
            WorkbenchPlayerGame.player_id, WorkbenchPlayerGame.team_id, WorkbenchPlayerGame.season
        )
        .where(WorkbenchPlayerGame.season >= from_season)
        .distinct()
        .order_by(
            WorkbenchPlayerGame.season, WorkbenchPlayerGame.team_id, WorkbenchPlayerGame.player_id
        )
    )
    if seasons:
        query = query.where(WorkbenchPlayerGame.season.in_(seasons))
    rows = session.execute(query).all()
    settled = {
        (row.player_id, row.team_id, row.season)
        for row in session.execute(
            select(
                PlayerSeasonPortrait.player_id,
                PlayerSeasonPortrait.team_id,
                PlayerSeasonPortrait.season,
            ).where(PlayerSeasonPortrait.source_name == SEASON_PORTRAIT_SOURCE)
        )
    }
    targets: list[SeasonPortraitTarget] = []
    for player_id, team, season in rows:
        resolved = resolve_team(str(team))
        if resolved is None or not _NUMERIC.match(str(player_id)) or not _SEASON.match(season):
            continue
        if (str(player_id), resolved[0], season) in settled:
            continue
        targets.append(SeasonPortraitTarget(str(player_id), resolved[0], resolved[1], season))
    return targets


def fetch_season_portrait(
    client: httpx.Client, target: SeasonPortraitTarget, cache_dir: Path
) -> tuple[str, Path, int] | Exception | None:
    """The cached image's (sha256, path, bytes); None for a CDN miss; an exception to retry."""
    try:
        response = client.get(target.url, timeout=10.0)
    except httpx.HTTPError as exc:
        return exc
    if response.status_code >= 500 or response.status_code == 429:
        return RuntimeError(f"CDN answered {response.status_code}")
    content = response.content
    if (
        response.status_code != 200
        or len(content) < 33
        or len(content) > _MAX_BYTES
        or response.headers.get("content-type", "").split(";")[0] != "image/png"
        or content[:8] != b"\x89PNG\r\n\x1a\n"
        or content[12:16] != b"IHDR"
        or struct.unpack(">II", content[16:24]) != (1040, 760)
    ):
        return None
    sha256 = hashlib.sha256(content).hexdigest()
    if sha256 in PLACEHOLDER_PORTRAIT_SHA256:
        return None
    cache_dir.mkdir(parents=True, exist_ok=True)
    path = cache_dir / f"{sha256}.png"
    if not path.exists():
        path.write_bytes(content)
    return sha256, path, len(content)


def acquire_season_portraits(
    engine: Engine,
    cache_dir: Path,
    *,
    from_season: str = FIRST_SEASON,
    seasons: list[str] | None = None,
    limit: int | None = None,
    delay_seconds: float = 0.1,
    workers: int = 4,
    client: httpx.Client | None = None,
    progress: Callable[[SeasonPortraitSummary], None] | None = None,
) -> SeasonPortraitSummary:
    """Request each unsettled stint once, recording photos and misses.

    A few workers share one connection pool and each waits ``delay_seconds`` after its request,
    so the CDN sees at most ``workers`` requests in flight. Rows are written by this thread.
    """
    with Session(engine) as session:
        targets = season_portrait_targets(session, from_season, seasons)
    if limit is not None:
        targets = targets[:limit]
    summary = SeasonPortraitSummary(targets=len(targets))
    owned = client is None
    http = client or httpx.Client(
        follow_redirects=True, timeout=10.0, limits=httpx.Limits(max_connections=workers)
    )

    def fetch(target: SeasonPortraitTarget) -> tuple[str, Path, int] | Exception | None:
        result = fetch_season_portrait(http, target, cache_dir)
        if delay_seconds:
            time.sleep(delay_seconds)
        return result

    try:
        with ThreadPoolExecutor(max_workers=max(1, workers)) as pool:
            for index, (target, result) in enumerate(
                zip(targets, pool.map(fetch, targets), strict=True)
            ):
                if isinstance(result, Exception):
                    summary.retry_later += 1
                    logger.debug("Season portrait %s will be retried: %s", target, result)
                else:
                    _record(engine, target, result, summary)
                if progress is not None and (index + 1) % 100 == 0:
                    progress(summary)
    finally:
        if owned:
            http.close()
    return summary


def _record(
    engine: Engine,
    target: SeasonPortraitTarget,
    result: tuple[str, Path, int] | None,
    summary: SeasonPortraitSummary,
) -> None:
    row = PlayerSeasonPortrait(
        player_id=target.player_id,
        team_id=target.team_id,
        team_tricode=target.team_tricode,
        season=target.season,
        source_name=SEASON_PORTRAIT_SOURCE,
        source_url=target.url,
        status="missing" if result is None else "active",
        attribution="NBA CDN team-season 1040x760 headshot",
        acquired_at=utc_now(),
    )
    if result is None:
        summary.missing += 1
    else:
        sha256, path, size = result
        row.content_sha256, row.storage_path, row.bytes = sha256, str(path), size
        row.mime_type, row.width, row.height = "image/png", 1040, 760
        summary.acquired += 1
        summary.bytes += size
    with Session(engine) as session:
        session.add(row)
        session.commit()


def find_season_portrait(
    session: Session, player_id: str, season: str, team: str | None = None
) -> PlayerSeasonPortrait | None:
    """The player's photo for that season: the named team's when it exists, else the season's
    latest-acquired one (a traded player's other team)."""
    rows = session.scalars(
        select(PlayerSeasonPortrait)
        .where(
            PlayerSeasonPortrait.player_id == player_id,
            PlayerSeasonPortrait.season == season,
            PlayerSeasonPortrait.status == "active",
        )
        .order_by(PlayerSeasonPortrait.acquired_at.desc())
    ).all()
    if not rows:
        return None
    resolved = resolve_team(team) if team else None
    if resolved is not None:
        for row in rows:
            if row.team_id == resolved[0]:
                return row
    return rows[0]
