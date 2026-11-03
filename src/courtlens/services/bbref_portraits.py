"""Basketball-Reference career headshots for seasons NBA.com has no photo for (policy v3).

NBA.com keeps one "latest" headshot per person (a retired player who became a coach shows his
coaching photo; most retired players get a generic silhouette, which CourtLens rejects) and
team-season headshots only from 2015-16. Basketball-Reference shows one photo from each player's
playing career on his page, but only at 120x180. Alignment row 9 follow-up 15 (owner, 2026-10-20)
chose it for seasons before 2015-16; follow-up 16 the same day put NBA.com's 1040x760 photo first
again and keeps the career photo for silhouettes and the coaching photos in
``POST_CAREER_NBA_PHOTOS``.

An operator command, never a visitor request. The headshot URL comes from the player's retained
Basketball-Reference page (``services/bbref_bio.py``), so players whose page has no photo are never
requested. Requests are serial at the source's pace; a refusal (HTTP 403/429) ends the run and a
rerun resumes from the players without a row. The JPEG is kept byte-for-byte beside the cut-out:
a PNG whose white studio background is made transparent, so it sits on team colours like the
NBA.com cut-outs and frames with the same face crop.
"""

from __future__ import annotations

import hashlib
import io
import logging
import re
import time
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path

import httpx
import numpy as np
from PIL import Image
from scipy import ndimage  # type: ignore[import-untyped]
from sqlalchemy import Engine, select, text
from sqlalchemy.orm import Session

from courtlens.models import utc_now
from courtlens.services.bbref_bio import INTERVAL_SECONDS
from courtlens.workbench_models import PlayerPortrait, WorkbenchAcquisition, WorkbenchArtifact

logger = logging.getLogger(__name__)

BBREF_PORTRAIT_SOURCE = "bbref_headshot"
ATTRIBUTION = "Basketball-Reference.com player headshot"
# The first season NBA.com has team-season headshots for; earlier seasons prefer this source.
NBA_TEAM_SEASON_FROM = "2015-16"
_HEADSHOT_URL = re.compile(
    rb"https://www\.basketball-reference\.com/req/\d+/images/headshots/([a-z0-9]+)\.jpg"
)
_MAX_BYTES = 500_000
# Near-white, near-neutral pixels connected to the top or upper sides are studio background.
_WHITE = 236
_NEUTRAL_SPREAD = 16
_SIDE_SEED_FRACTION = 0.6
# The matted outline's width, and the alpha below which an outline pixel is dropped as white.
_EDGE_PIXELS = 2
_MIN_EDGE_ALPHA = 0.08
# NBA.com player IDs (Basketball-Reference IDs as values, for reading) whose only NBA.com photo
# shows them later as a coach or staff member, not in a jersey. Owner, 2026-10-20 (alignment row 9,
# follow-up 16): NBA.com's sharper photo comes first, like Databallr, except for these. Found by
# reviewing every NBA.com photo of the 617 players who also have a career photo; review players
# who gain a career photo the same way.
POST_CAREER_NBA_PHOTOS: dict[str, str] = {
    "57": "chrisdo01",
    "422": "johnsav01",
    "699": "barrybr01",
    "959": "nashst01",
    "1497": "billuch01",
    "1891": "terryja01",
    "2571": "barbole01",
    "2757": "udrihbe01",
    "101198": "bynumwi01",
    "101249": "lucasjo02",
    "200755": "redicjj01",
    "201147": "breweco01",
    "201168": "splitti01",
    "201582": "ajincal01",
    "201960": "carrode01",
    "201975": "meeksjo01",
    "202066": "templga01",
    "202328": "monrogr01",
    "202689": "walkeke02",
    "203112": "acyqu01",
    "203143": "prigipa01",
    "203488": "muscami01",
}
_ORIGINAL_SHA = re.compile(r"original sha256 ([0-9a-f]{64})")


@dataclass
class BbrefPortraitSummary:
    targets: int = 0
    acquired: int = 0
    no_headshot: int = 0
    failed: int = 0
    stopped: str | None = None


def headshot_url(page: bytes, bbref_id: str) -> str | None:
    """The player's own headshot named on his page (never another player's thumbnail)."""
    for match in _HEADSHOT_URL.finditer(page):
        if match.group(1).decode() == bbref_id:
            return match.group(0).decode()
    return None


def cut_out(jpeg: bytes) -> bytes:
    """PNG with the white background connected to the top and upper sides made transparent.

    A hard mask leaves the subject's outline pixels, half subject and half white studio, opaque:
    a light halo on team colours. The outline is matted instead: each pixel within
    ``_EDGE_PIXELS`` of the background takes the colour of the nearest interior pixel and the
    alpha of its own mix of that colour and white, so the edge fades into whatever is behind it.
    """
    with Image.open(io.BytesIO(jpeg)) as opened:
        image = opened.convert("RGB")
    pixels = np.asarray(image).astype(np.float64)
    white = (pixels.min(axis=2) >= _WHITE) & (np.ptp(pixels, axis=2) <= _NEUTRAL_SPREAD)
    labels, _ = ndimage.label(white)
    height = white.shape[0]
    side_rows = max(1, round(height * _SIDE_SEED_FRACTION))
    seeds = np.concatenate([labels[0, :], labels[:side_rows, 0], labels[:side_rows, -1]])
    background = np.isin(labels, seeds[seeds > 0])
    core = ndimage.distance_transform_edt(~background) > _EDGE_PIXELS
    if not core.any():
        core = ~background
    _, (rows, columns) = ndimage.distance_transform_edt(~core, return_indices=True)
    subject = pixels[rows, columns]
    edge = ~core & (ndimage.distance_transform_edt(background) <= 1)
    # Project each pixel onto the line from white to its subject colour: 0 is white, 1 is subject.
    towards_subject = 255.0 - subject
    mix = ((255.0 - pixels) * towards_subject).sum(axis=2) / np.maximum(
        (towards_subject**2).sum(axis=2), 1e-6
    )
    alpha = np.where(core, 1.0, np.where(edge, np.clip(mix, 0.0, 1.0), 0.0))
    alpha[alpha < _MIN_EDGE_ALPHA] = 0.0
    colour = np.where(edge[..., None], subject, pixels)
    rgba = np.dstack([colour, alpha * 255.0]).round().clip(0, 255).astype(np.uint8)
    buffer = io.BytesIO()
    Image.fromarray(rgba, "RGBA").save(buffer, format="PNG", optimize=True)
    return buffer.getvalue()


def recut_bbref_portraits(engine: Engine, cache_dir: Path) -> int:
    """Cut the retained originals again with the current ``cut_out``; returns rows changed.

    The JPEG named in each row's attribution is the acquisition; the PNG is derived from it, so a
    better cut-out replaces the row's file in place without asking the source again.
    """
    changed = 0
    with Session(engine) as session:
        rows = session.scalars(
            select(PlayerPortrait).where(PlayerPortrait.source_name == BBREF_PORTRAIT_SOURCE)
        ).all()
        for row in rows:
            match = _ORIGINAL_SHA.search(row.attribution)
            original = cache_dir / "bbref" / f"{match.group(1)}.jpg" if match else None
            if original is None or not original.exists():
                logger.warning("No retained original for %s; skipped", row.player_id)
                continue
            png = cut_out(original.read_bytes())
            sha256 = hashlib.sha256(png).hexdigest()
            if sha256 == row.content_sha256:
                continue
            path = _write_png(cache_dir, sha256, png)
            row.content_sha256, row.storage_path, row.bytes = sha256, str(path), len(png)
            changed += 1
        session.commit()
    return changed


def portrait_targets(session: Session, root: Path) -> list[tuple[str, str, str]]:
    """(player_id, bbref_id, headshot URL) for mapped players without a Basketball-Reference
    portrait who need one (a season before 2015-16, no NBA.com photo, or no CourtLens game rows:
    careers before 2000-01), most career minutes first, newest profile per player, read from the
    retained pages."""
    have = set(
        session.scalars(
            select(PlayerPortrait.player_id).where(
                PlayerPortrait.source_name == BBREF_PORTRAIT_SOURCE
            )
        )
    )
    rows = session.execute(
        text(
            """WITH profiles AS (
                SELECT DISTINCT ON (player_id) player_id, bbref_id, acquisition_id
                FROM bbref_player_profiles ORDER BY player_id, observed_at DESC),
            careers AS (
                SELECT player_id, SUM(COALESCE(minutes_seconds, 0)) AS seconds,
                    MIN(season) AS first_season
                FROM workbench_player_games GROUP BY player_id),
            nba AS (
                SELECT DISTINCT player_id FROM player_portraits
                WHERE status = 'active' AND source_name NOT IN (:source, :commons))
            SELECT p.player_id, p.bbref_id, p.acquisition_id
            FROM profiles p LEFT JOIN careers c USING (player_id)
            WHERE c.player_id IS NULL
                OR c.first_season < :from_season
                OR p.player_id NOT IN (SELECT player_id FROM nba)
            ORDER BY c.seconds DESC NULLS LAST, p.player_id"""
        ),
        # The Wikidata career photo (services/wikidata_portraits.py) is not an NBA.com photo.
        {
            "source": BBREF_PORTRAIT_SOURCE,
            "commons": "wikidata_commons",
            "from_season": NBA_TEAM_SEASON_FROM,
        },
    ).all()
    targets: list[tuple[str, str, str]] = []
    for row in rows:
        if row.player_id in have:
            continue
        receipt = session.get(WorkbenchAcquisition, row.acquisition_id)
        artifact = session.get(WorkbenchArtifact, receipt.artifact_id) if receipt else None
        if artifact is None:
            continue
        path = (root / artifact.storage_path).resolve()
        if not path.is_relative_to(root.resolve()) or not path.exists():
            continue
        url = headshot_url(path.read_bytes(), row.bbref_id)
        if url is not None:
            targets.append((row.player_id, row.bbref_id, url))
    return targets


def acquire_bbref_portraits(
    engine: Engine,
    raw_root: Path,
    cache_dir: Path,
    *,
    limit: int | None = None,
    interval_seconds: float = INTERVAL_SECONDS,
    client: httpx.Client | None = None,
    progress: Callable[[BbrefPortraitSummary], None] | None = None,
) -> BbrefPortraitSummary:
    with Session(engine) as session:
        targets = portrait_targets(session, raw_root)
    if limit is not None:
        targets = targets[:limit]
    summary = BbrefPortraitSummary(targets=len(targets))
    owned = client is None
    http = client or httpx.Client(
        follow_redirects=True,
        timeout=15.0,
        headers={"User-Agent": "CourtLens portfolio research (non-commercial)"},
    )
    try:
        for index, (player_id, bbref_id, url) in enumerate(targets):
            if index:
                time.sleep(interval_seconds)
            try:
                response = http.get(url)
            except httpx.HTTPError as exc:
                summary.failed += 1
                logger.debug("Headshot %s will be retried: %s", bbref_id, exc)
                continue
            if response.status_code in (403, 429):
                summary.stopped = f"HTTP {response.status_code} at {bbref_id}; rerun later"
                break
            content = response.content
            if (
                response.status_code != 200
                or not content.startswith(b"\xff\xd8")
                or len(content) > _MAX_BYTES
            ):
                summary.no_headshot += 1
                continue
            _store(engine, cache_dir, player_id, url, content)
            summary.acquired += 1
            if progress is not None and (index + 1) % 50 == 0:
                progress(summary)
    finally:
        if owned:
            http.close()
    return summary


def _store(engine: Engine, cache_dir: Path, player_id: str, url: str, jpeg: bytes) -> None:
    original_sha = hashlib.sha256(jpeg).hexdigest()
    originals = cache_dir / "bbref"
    originals.mkdir(parents=True, exist_ok=True)
    (originals / f"{original_sha}.jpg").write_bytes(jpeg)
    png = cut_out(jpeg)
    sha256 = hashlib.sha256(png).hexdigest()
    path = _write_png(cache_dir, sha256, png)
    with Image.open(io.BytesIO(png)) as image:
        width, height = image.size
    with Session(engine) as session:
        session.add(
            PlayerPortrait(
                player_id=player_id,
                source_name=BBREF_PORTRAIT_SOURCE,
                content_sha256=sha256,
                storage_path=str(path),
                mime_type="image/png",
                width=width,
                height=height,
                bytes=len(png),
                attribution=f"{ATTRIBUTION}; {url}; original sha256 {original_sha}",
                status="active",
                acquired_at=utc_now(),
            )
        )
        session.commit()


def _write_png(cache_dir: Path, sha256: str, png: bytes) -> Path:
    path = cache_dir / f"{sha256}.png"
    if not path.exists():
        path.write_bytes(png)
    return path


def prefers_bbref(player_id: str) -> bool:
    """Players whose NBA.com photo is from after their career show the career photo first."""
    return player_id in POST_CAREER_NBA_PHOTOS
