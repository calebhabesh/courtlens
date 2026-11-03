"""Career photos from Wikimedia Commons for players with no photo from any other source.

NBA.com serves only its silhouette for most players who retired before about 2015, and
Basketball-Reference has no headshot for many of them. Wikidata links a player's NBA.com ID
(P3647) or Basketball-Reference ID (P2685) to his image (P18) and his Commons category (P373),
so the photo is tied to the player by ID, not found by searching for his name.

For each player who has no active ``player_portraits`` row and no earlier row from this source,
the acquisition:

1. reads his Wikidata image and Commons category from one SPARQL query for all players;
2. learns his face from the Wikidata image when one face clearly dominates it, or from his own
   season headshots when he has some;
3. tries freely licensed files from his category, then the Wikidata image, in that order, and
   keeps the first whose matched face is in uniform (owner, 2026-10-22: "Uniform first, else
   any");
4. otherwise keeps the Wikidata image's dominant face out of uniform, so he still has a photo;
5. records the cropped square with author, licence and file page for the credits, or a
   ``missing`` row so a later run skips him.

Requests are sequential with a pause, under Wikimedia's API etiquette.
"""

from __future__ import annotations

import hashlib
import io
import logging
import re
import time
from collections.abc import Callable, Iterable
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Any
from urllib.parse import quote, unquote

import httpx
import numpy as np
from PIL import Image
from sqlalchemy import Engine, text
from sqlalchemy.orm import Session

from courtlens.models import utc_now
from courtlens.services.commons_portraits import (
    COMMONS_API,
    FREE_LICENCE,
    OFF_COURT,
    OUTPUT_SIDE,
    THUMB_WIDTH,
    USER_AGENT,
    FaceMatcher,
    crop_box,
    in_uniform,
    parse_taken,
    plain,
    reference_paths,
)
from courtlens.workbench_models import PlayerPortrait

logger = logging.getLogger(__name__)

WIKIDATA_PORTRAIT_SOURCE = "wikidata_commons"
SPARQL_URL = "https://query.wikidata.org/sparql"
SPARQL_QUERY = """SELECT ?nba ?bref ?image ?category WHERE {
  { ?person wdt:P3647 ?nba } UNION { ?person wdt:P2685 ?bref }
  OPTIONAL { ?person wdt:P3647 ?nba }
  OPTIONAL { ?person wdt:P2685 ?bref }
  OPTIONAL { ?person wdt:P18 ?image }
  OPTIONAL { ?person wdt:P373 ?category }
  FILTER(BOUND(?image) || BOUND(?category))
}"""
# Category files fetched and checked per player before falling back to the Wikidata image.
CATEGORY_LIMIT = 50
TRIES = 6
# The Wikidata image's largest face must be this wide (pixels in the 1280px thumbnail) and this
# many times the area of the next face, so a team photo never teaches the wrong face.
MIN_REFERENCE_FACE = 40
DOMINANCE = 1.5
# Smallest square kept; smaller crops would be too soft even as a 64px avatar.
MIN_SIDE = 80
# Photos dated within a career this long after the debut are tried first.
CAREER_YEARS = 20


@dataclass(frozen=True)
class WikidataEntry:
    image: str | None
    category: str | None


@dataclass(frozen=True)
class Target:
    player_id: str
    name: str
    bbref_id: str | None
    debut_year: int | None


@dataclass
class WikidataSummary:
    players: int = 0
    linked: int = 0
    uniform: int = 0
    out_of_uniform: int = 0
    missing: int = 0
    no_reference: int = 0
    checked: int = 0
    errors: int = 0


@dataclass(frozen=True)
class Photo:
    title: str
    page_url: str
    thumb_url: str
    licence: str
    artist: str
    taken: date | None


def file_title(value: str) -> str:
    """'http://commons.wikimedia.org/wiki/Special:FilePath/Reggie%20Geary.jpg' -> 'File:Reggie
    Geary.jpg'."""
    return "File:" + unquote(value.rsplit("/", 1)[-1]).replace("_", " ")


def parse_sparql(
    bindings: Iterable[dict[str, Any]],
) -> tuple[dict[str, WikidataEntry], dict[str, WikidataEntry]]:
    """Entries by NBA.com ID and by Basketball-Reference ID ('g/gearyre01' -> 'gearyre01'). The
    first image and category seen for an ID are kept."""
    by_nba: dict[str, WikidataEntry] = {}
    by_bref: dict[str, WikidataEntry] = {}
    for row in bindings:

        def value(key: str, row: dict[str, Any] = row) -> str | None:
            cell = row.get(key)
            return str(cell["value"]) if cell else None

        image = value("image")
        entry = WikidataEntry(file_title(image) if image else None, value("category"))
        if (nba := value("nba")) is not None:
            by_nba[nba] = _merge(by_nba.get(nba), entry)
        if (bref := value("bref")) is not None:
            key = bref.rsplit("/", 1)[-1]
            by_bref[key] = _merge(by_bref.get(key), entry)
    return by_nba, by_bref


def _merge(old: WikidataEntry | None, new: WikidataEntry) -> WikidataEntry:
    if old is None:
        return new
    return WikidataEntry(old.image or new.image, old.category or new.category)


def targets(session: Session) -> list[Target]:
    """Players seen in box scores or with a Basketball-Reference profile who have no active
    photo and no earlier row from this source, most career minutes first."""
    rows = session.execute(
        text(
            """WITH universe AS (
                SELECT player_id FROM workbench_player_games
                UNION SELECT player_id FROM bbref_player_profiles),
            have AS (
                SELECT DISTINCT player_id FROM player_portraits
                WHERE status = 'active' OR source_name = :source),
            careers AS (
                SELECT player_id, SUM(COALESCE(minutes_seconds, 0)) AS seconds,
                    MIN(season) AS first_season
                FROM workbench_player_games GROUP BY player_id),
            profiles AS (
                SELECT DISTINCT ON (player_id) player_id, bbref_id,
                    profile->>'name' AS name, profile->>'debut_date' AS debut
                FROM bbref_player_profiles ORDER BY player_id, observed_at DESC),
            names AS (
                SELECT DISTINCT ON (external_id) external_id AS player_id, display_name
                FROM workbench_identities WHERE kind = 'player'
                ORDER BY external_id, display_name)
            SELECT u.player_id, p.bbref_id, COALESCE(n.display_name, p.name) AS name,
                p.debut, c.first_season
            FROM universe u
            LEFT JOIN have h USING (player_id)
            LEFT JOIN careers c USING (player_id)
            LEFT JOIN profiles p USING (player_id)
            LEFT JOIN names n USING (player_id)
            WHERE h.player_id IS NULL
            ORDER BY c.seconds DESC NULLS LAST, u.player_id"""
        ),
        {"source": WIKIDATA_PORTRAIT_SOURCE},
    ).all()
    found = []
    for row in rows:
        debut = None
        if row.debut and str(row.debut)[:4].isdigit():
            debut = int(str(row.debut)[:4])
        elif row.first_season:
            debut = int(str(row.first_season)[:4])
        found.append(
            Target(str(row.player_id), str(row.name or row.player_id), row.bbref_id, debut)
        )
    return found


def photo(page: dict[str, Any]) -> Photo | None:
    """A Commons file with a free licence and a thumbnail, not taken somewhere off court."""
    info = (page.get("imageinfo") or [{}])[0]
    meta = info.get("extmetadata") or {}

    def field_text(name: str) -> str:
        return plain(str((meta.get(name) or {}).get("value", "")))

    licence = field_text("LicenseShortName")
    if not FREE_LICENCE.match(licence) or not info.get("thumburl"):
        return None
    words = " ".join(
        [str(page.get("title", ""))] + [field_text(n) for n in ("ObjectName", "ImageDescription")]
    )
    if OFF_COURT.search(words):
        return None
    return Photo(
        title=str(page["title"]),
        page_url=str(info.get("descriptionurl") or ""),
        thumb_url=str(info["thumburl"]),
        licence=licence,
        artist=field_text("Artist") or "Unknown author",
        taken=parse_taken(field_text("DateTimeOriginal")),
    )


def ordered(photos: Iterable[Photo], debut_year: int | None) -> list[Photo]:
    """Photos from his playing years first (oldest first), then other dated ones, then undated."""

    def key(found: Photo) -> tuple[int, int]:
        if found.taken is None:
            return (2, 0)
        year = found.taken.year
        in_career = debut_year is not None and debut_year <= year <= debut_year + CAREER_YEARS
        return (0 if in_career else 1, year)

    return sorted(photos, key=key)


def dominant_face(faces: list[np.ndarray]) -> np.ndarray | None:
    """The largest face when it is big enough and clearly the subject of the photo."""
    if not faces:
        return None
    ranked = sorted(faces, key=lambda face: -float(face[2] * face[3]))
    first = ranked[0]
    if float(first[2]) < MIN_REFERENCE_FACE:
        return None
    if len(ranked) > 1 and float(first[2] * first[3]) < DOMINANCE * float(
        ranked[1][2] * ranked[1][3]
    ):
        return None
    return first


def attribution(found: Photo) -> str:
    title = found.title.removeprefix("File:")
    return f"Photo: {found.artist}, {found.licence}, via Wikimedia Commons ({title})"


def file_page(credit: str) -> str | None:
    """The Commons file page named at the end of a credit, for the credits list."""
    match = re.search(r"via Wikimedia Commons \((.+)\)$", credit)
    if match is None:
        return None
    return f"https://commons.wikimedia.org/wiki/File:{quote(match.group(1).replace(' ', '_'))}"


class CommonsFiles:
    """Sequential Wikidata and Commons requests, pausing between them."""

    def __init__(self, client: httpx.Client, delay_seconds: float) -> None:
        self.client = client
        self.delay = delay_seconds

    def _get(self, url: str, params: dict[str, Any] | None = None, **kwargs: Any) -> httpx.Response:
        for attempt in range(4):
            response = self.client.get(url, params=params, timeout=60.0, **kwargs)
            if self.delay:
                time.sleep(self.delay)
            if response.status_code not in (429, 500, 502, 503, 504):
                return response.raise_for_status()
            time.sleep(min(60, 5 * 2**attempt))
        return response.raise_for_status()

    def wikidata(self) -> list[dict[str, Any]]:
        data = self._get(
            SPARQL_URL,
            {"query": SPARQL_QUERY},
            headers={"Accept": "application/sparql-results+json"},
        ).json()
        return list(data["results"]["bindings"])

    def _imageinfo(self, params: dict[str, Any]) -> list[dict[str, Any]]:
        data = self._get(
            COMMONS_API,
            {
                "action": "query",
                "format": "json",
                "prop": "imageinfo",
                "iiprop": "url|extmetadata",
                "iiurlwidth": THUMB_WIDTH,
                "iiextmetadatafilter": (
                    "DateTimeOriginal|LicenseShortName|Artist|ObjectName|ImageDescription"
                ),
                "maxlag": 5,
            }
            | params,
        ).json()
        pages = (data.get("query") or {}).get("pages") or {}
        return [page for page in pages.values() if "imageinfo" in page]

    def file(self, title: str) -> dict[str, Any] | None:
        pages = self._imageinfo({"titles": title})
        return pages[0] if pages else None

    def category(self, name: str) -> list[dict[str, Any]]:
        return self._imageinfo(
            {
                "generator": "categorymembers",
                "gcmtitle": f"Category:{name}",
                "gcmtype": "file",
                "gcmlimit": CATEGORY_LIMIT,
            }
        )

    def image(self, url: str) -> Image.Image:
        return Image.open(io.BytesIO(self._get(url).content)).convert("RGB")


def acquire_wikidata_portraits(
    engine: Engine,
    cache_dir: Path,
    model_dir: Path,
    *,
    player_ids: set[str] | None = None,
    limit: int | None = None,
    delay_seconds: float = 1.0,
    client: httpx.Client | None = None,
    progress: Callable[[WikidataSummary], None] | None = None,
) -> WikidataSummary:
    with Session(engine) as session:
        todo = [t for t in targets(session) if player_ids is None or t.player_id in player_ids]
    if limit is not None:
        todo = todo[:limit]
    summary = WikidataSummary(players=len(todo))
    owned = client is None
    http = client or httpx.Client(
        headers={"User-Agent": USER_AGENT}, follow_redirects=True, timeout=60.0
    )
    try:
        files = CommonsFiles(http, delay_seconds)
        by_nba, by_bref = parse_sparql(files.wikidata()) if todo else ({}, {})
        matcher = FaceMatcher(model_dir, http) if todo else None
        for index, target in enumerate(todo):
            entry = by_nba.get(target.player_id) or (
                by_bref.get(target.bbref_id) if target.bbref_id else None
            )
            try:
                assert matcher is not None
                _acquire_player(engine, target, entry, files, matcher, cache_dir, summary)
            except (httpx.HTTPError, OSError, ValueError) as exc:
                summary.errors += 1
                logger.warning("Wikidata photo for %s left for a later run: %s", target.name, exc)
            if progress is not None and (index + 1) % 25 == 0:
                progress(summary)
    finally:
        if owned:
            http.close()
    return summary


def _acquire_player(
    engine: Engine,
    target: Target,
    entry: WikidataEntry | None,
    files: CommonsFiles,
    matcher: FaceMatcher,
    cache_dir: Path,
    summary: WikidataSummary,
) -> None:
    result: tuple[Photo, Image.Image, bool] | None = None
    if entry is not None:
        summary.linked += 1
        with Session(engine) as session:
            own = matcher.reference(reference_paths(session, target.player_id))
        result = _choose(target, entry, own, files, matcher, summary)
    with Session(engine) as session:
        session.add(_row(target, entry, result, cache_dir, summary))
        session.commit()


def _bgr(image: Image.Image) -> np.ndarray:
    return np.asarray(image.convert("RGB"))[:, :, ::-1].copy()


def _box(face: np.ndarray) -> tuple[float, float, float, float]:
    return float(face[0]), float(face[1]), float(face[2]), float(face[3])


def _square(image: Image.Image, face: tuple[float, float, float, float]) -> Image.Image | None:
    square = image.crop(crop_box(face, image.width, image.height))
    if square.width < MIN_SIDE:
        return None
    if square.width > OUTPUT_SIDE:
        square = square.resize((OUTPUT_SIDE, OUTPUT_SIDE), Image.Resampling.LANCZOS)
    return square


def _choose(
    target: Target,
    entry: WikidataEntry,
    own: list[np.ndarray],
    files: CommonsFiles,
    matcher: FaceMatcher,
    summary: WikidataSummary,
) -> tuple[Photo, Image.Image, bool] | None:
    """(photo, square crop, in uniform) for the best file, or None. ``own`` holds embeddings of
    the player's own headshots, when he has any."""
    lead: tuple[Photo, Image.Image, tuple[float, float, float, float]] | None = None
    references = list(own)
    if entry.image:
        page = files.file(entry.image)
        found = photo(page) if page else None
        if found is not None:
            image = files.image(found.thumb_url)
            bgr = _bgr(image)
            if own:
                match = matcher.find(bgr, own)
                face = match[0] if match else None
            else:
                dominant = dominant_face(matcher.faces(bgr))
                face = _box(dominant) if dominant is not None else None
                if dominant is not None:
                    references.append(matcher.embedding(bgr, dominant))
            if face is not None:
                lead = (found, image, face)
    if not references:
        summary.no_reference += 1
        return None
    if lead is not None and in_uniform(lead[1], lead[2]):
        square = _square(lead[1], lead[2])
        if square is not None:
            return lead[0], square, True
    candidates: list[Photo] = []
    if entry.category:
        candidates = ordered(
            (p for p in map(photo, files.category(entry.category)) if p is not None),
            target.debut_year,
        )
    for found in [c for c in candidates if lead is None or c.title != lead[0].title][:TRIES]:
        summary.checked += 1
        image = files.image(found.thumb_url)
        match = matcher.find(_bgr(image), references)
        if match is None or not in_uniform(image, match[0]):
            continue
        square = _square(image, match[0])
        if square is not None:
            return found, square, True
    if lead is not None:
        square = _square(lead[1], lead[2])
        if square is not None:
            return lead[0], square, False
    return None


def _row(
    target: Target,
    entry: WikidataEntry | None,
    result: tuple[Photo, Image.Image, bool] | None,
    cache_dir: Path,
    summary: WikidataSummary,
) -> PlayerPortrait:
    """The chosen square, or a ``missing`` row (no file) so later runs skip the player."""
    if result is None:
        summary.missing += 1
        reason = (
            "No Wikidata image or Commons category for this player"
            if entry is None
            else "No freely licensed Commons photo clearly showed this player"
        )
        return PlayerPortrait(
            player_id=target.player_id,
            source_name=WIKIDATA_PORTRAIT_SOURCE,
            content_sha256="",
            storage_path="",
            mime_type="",
            bytes=0,
            attribution=reason,
            status="missing",
            acquired_at=utc_now(),
        )
    found, square, uniform = result
    buffer = io.BytesIO()
    square.save(buffer, format="JPEG", quality=90, optimize=True)
    content = buffer.getvalue()
    sha256 = hashlib.sha256(content).hexdigest()
    cache_dir.mkdir(parents=True, exist_ok=True)
    path = cache_dir / f"{sha256}.jpg"
    if not path.exists():
        path.write_bytes(content)
    if uniform:
        summary.uniform += 1
    else:
        summary.out_of_uniform += 1
    logger.info(
        "Wikidata photo %s: %s (%s)", target.name, found.title, "uniform" if uniform else "any"
    )
    return PlayerPortrait(
        player_id=target.player_id,
        source_name=WIKIDATA_PORTRAIT_SOURCE,
        content_sha256=sha256,
        storage_path=str(path),
        mime_type="image/jpeg",
        width=square.width,
        height=square.height,
        bytes=len(content),
        attribution=attribution(found),
        status="active",
        acquired_at=utc_now(),
    )
