"""Owner-reviewed career photos for notable players no automatic source covers (FH01d).

The Wikidata run (services/wikidata_portraits.py) needs a photo tied to the player by ID, and a
reference face to confirm a match. Many notable older players have neither, though freely
licensed photos of them exist. This module gathers candidates for the players above a career
points floor and leaves the decision to the owner:

1. ``gather_candidates`` reads, for each player, his Wikidata image and Commons category, the
   free lead image of his English Wikipedia article, and Commons files whose title or
   description names him exactly. Only freely licensed files are kept. Each detected face
   becomes a candidate crop; a face that matches faces in other files of the same player is
   flagged, since agreement across independent photos is good evidence it is him. Nothing is
   stored as a photo; the output is a review file with small previews.
2. The owner picks one candidate per player, or none.
3. ``apply_review`` crops each picked face from the file at full size and stores it as the
   player's career photo, replacing his ``missing`` Wikidata-source row, with the same author,
   licence and file-page credit as every other Commons photo.

Requests are sequential with a pause, under Wikimedia's API etiquette.
"""

from __future__ import annotations

import base64
import io
import json
import logging
import re
from collections.abc import Callable
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any

import httpx
import numpy as np
from PIL import Image
from sqlalchemy import Engine, select, text
from sqlalchemy.orm import Session

from courtlens.models import utc_now
from courtlens.services.commons_portraits import COMMONS_API, USER_AGENT, FaceMatcher, crop_box
from courtlens.services.wikidata_portraits import (
    MIN_REFERENCE_FACE,
    WIKIDATA_PORTRAIT_SOURCE,
    CommonsFiles,
    Photo,
    attribution,
    parse_sparql,
    photo,
)
from courtlens.workbench_models import PlayerPortrait

logger = logging.getLogger(__name__)

WIKIPEDIA_API = "https://en.wikipedia.org/w/api.php"
MAX_FILES = 8
MAX_FACES = 3
PREVIEW_SIDE = 160
# Two faces from different files at this cosine similarity are very likely the same person.
AGREE = 0.40


@dataclass
class Target:
    player_id: str
    name: str
    first_season: str
    last_season: str
    points: int
    teams: list[str]
    bbref_id: str | None


@dataclass
class Face:
    key: str
    file_title: str
    page_url: str
    licence: str
    artist: str
    taken: str | None
    source: str
    box: tuple[float, float, float, float]
    faces_in_file: int
    agrees: int = 0
    preview: str = ""  # data: URI, small JPEG


@dataclass
class Review:
    target: Target
    faces: list[Face] = field(default_factory=list)
    files_checked: int = 0
    article: str | None = None


def targets(session: Session, min_points: int) -> list[Target]:
    """Players with no active photo and at least ``min_points`` regular-season points."""
    rows = session.execute(
        text(
            """
            with pinned as (
                select source_sha256 from bbref_player_seasons
                group by source_sha256 order by max(id) desc limit 1
            ), p as (
                select s.player_id, max(s.player_name) as name, min(s.season) as first_season,
                       max(s.season) as last_season, sum(s.points) as points,
                       min(s.bbref_id) as bbref_id,
                       array_agg(distinct s.team_id) as teams
                from bbref_player_seasons s join pinned using (source_sha256)
                where not s.is_summary and s.phase = 'regular_season'
                group by s.player_id
            )
            select * from p
            where points >= :floor
              and not exists (
                  select 1 from player_portraits pp
                  where pp.player_id = p.player_id and pp.status = 'active'
              )
            order by points desc
            """
        ),
        {"floor": min_points},
    ).mappings()
    return [
        Target(
            str(r["player_id"]),
            str(r["name"]),
            str(r["first_season"]),
            str(r["last_season"]),
            int(r["points"]),
            sorted(str(t) for t in r["teams"]),
            r["bbref_id"],
        )
        for r in rows
    ]


class Sources(CommonsFiles):
    """Wikipedia and Commons searches on top of the Wikidata reader."""

    def article_image(self, name: str) -> tuple[str | None, str | None]:
        """(article title, free lead image) of the player's English Wikipedia article."""
        data = self._get(
            WIKIPEDIA_API,
            {
                "action": "query",
                "format": "json",
                "list": "search",
                "srsearch": f'"{name}" basketball NBA',
                "srlimit": 3,
            },
        ).json()
        surname = name.split()[-1].lower()
        for hit in (data.get("query") or {}).get("search", []):
            title = str(hit["title"])
            snippet = re.sub(r"<[^>]+>", "", str(hit.get("snippet", ""))).lower()
            if surname not in title.lower() or "basketball" not in (title + snippet).lower():
                continue
            pages = self._get(
                WIKIPEDIA_API,
                {
                    "action": "query",
                    "format": "json",
                    "titles": title,
                    "prop": "pageimages",
                    "piprop": "name",
                    "pilicense": "free",
                },
            ).json()["query"]["pages"]
            image = next(iter(pages.values())).get("pageimage")
            return title, f"File:{image}" if image else None
        return None, None

    def search_files(self, name: str) -> list[dict[str, Any]]:
        """Commons files whose text names the player exactly."""
        return self._imageinfo(
            {
                "generator": "search",
                "gsrnamespace": 6,
                "gsrsearch": f'"{name}" basketball',
                "gsrlimit": MAX_FILES,
            }
        )


def _preview(image: Image.Image, box: tuple[float, float, float, float]) -> str:
    square = image.crop(crop_box(box, image.width, image.height))
    square = square.resize((PREVIEW_SIDE, PREVIEW_SIDE), Image.Resampling.LANCZOS)
    buffer = io.BytesIO()
    square.save(buffer, format="JPEG", quality=82)
    return "data:image/jpeg;base64," + base64.b64encode(buffer.getvalue()).decode()


def gather_candidates(
    session: Session,
    *,
    min_points: int = 5000,
    model_dir: Path,
    delay_seconds: float = 1.0,
    client: httpx.Client | None = None,
    player_ids: set[str] | None = None,
    progress: Callable[[int, int], None] | None = None,
) -> list[Review]:
    todo = [
        t for t in targets(session, min_points) if player_ids is None or t.player_id in player_ids
    ]
    owned = client is None
    http = client or httpx.Client(
        headers={"User-Agent": USER_AGENT}, follow_redirects=True, timeout=60.0
    )
    reviews: list[Review] = []
    try:
        sources = Sources(http, delay_seconds)
        matcher = FaceMatcher(model_dir, http)
        by_nba, by_bref = parse_sparql(sources.wikidata()) if todo else ({}, {})
        for index, target in enumerate(todo):
            try:
                reviews.append(_review(target, by_nba, by_bref, sources, matcher))
            except (httpx.HTTPError, OSError, ValueError) as exc:
                logger.warning("Candidates for %s skipped: %s", target.name, exc)
                reviews.append(Review(target))
            if progress is not None:
                progress(index + 1, len(todo))
    finally:
        if owned:
            http.close()
    return reviews


def _review(
    target: Target,
    by_nba: dict[str, Any],
    by_bref: dict[str, Any],
    sources: Sources,
    matcher: FaceMatcher,
) -> Review:
    review = Review(target)
    files: dict[str, tuple[str, dict[str, Any] | None]] = {}
    entry = by_nba.get(target.player_id) or (
        by_bref.get(target.bbref_id) if target.bbref_id else None
    )
    if entry is not None and entry.image:
        files[entry.image] = ("Wikidata image", None)
    review.article, lead = sources.article_image(target.name)
    if lead:
        files.setdefault(lead, ("Wikipedia article", None))
    if entry is not None and entry.category:
        for page in sources.category(entry.category)[:MAX_FILES]:
            files.setdefault(str(page["title"]), ("Commons category", page))
    for page in sources.search_files(target.name):
        files.setdefault(str(page["title"]), ("Commons search", page))

    embeddings: list[tuple[int, str, np.ndarray]] = []
    for title, (origin, listed) in list(files.items())[:MAX_FILES]:
        file_page = listed or sources.file(title)
        found: Photo | None = photo(file_page) if file_page else None
        if found is None:
            continue
        review.files_checked += 1
        image = sources.image(found.thumb_url)
        bgr = np.asarray(image)[:, :, ::-1].copy()
        faces = [f for f in matcher.faces(bgr) if float(f[2]) >= MIN_REFERENCE_FACE]
        faces.sort(key=lambda f: -float(f[2] * f[3]))
        for face in faces[:MAX_FACES]:
            box = (float(face[0]), float(face[1]), float(face[2]), float(face[3]))
            candidate = Face(
                key=f"{target.player_id}:{len(review.faces)}",
                file_title=found.title,
                page_url=found.page_url,
                licence=found.licence,
                artist=found.artist,
                taken=found.taken.isoformat() if found.taken else None,
                source=origin,
                box=box,
                faces_in_file=len(faces),
                preview=_preview(image, box),
            )
            embeddings.append((len(review.faces), found.title, matcher.embedding(bgr, face)))
            review.faces.append(candidate)
    # Agreement: how many other files hold a face this face matches.
    for index, title, vector in embeddings:
        others = {
            other_title
            for other_index, other_title, other in embeddings
            if other_title != title and matcher.similarity(vector, other) >= AGREE
        }
        review.faces[index].agrees = len(others)
    review.faces.sort(key=lambda f: (-f.agrees, f.faces_in_file))
    return review


def write_review(reviews: list[Review], path: Path) -> None:
    path.write_text(json.dumps([{**asdict(r)} for r in reviews], indent=1, default=str) + "\n")


def apply_review(
    engine: Engine,
    review_path: Path,
    choices: dict[str, str],
    cache_dir: Path,
    *,
    client: httpx.Client | None = None,
) -> dict[str, Any]:
    """Store each chosen face (``player_id -> face key``) as the player's career photo."""
    from courtlens.services.wikidata_portraits import Target as WikidataTarget
    from courtlens.services.wikidata_portraits import WikidataSummary, _row, _square

    reviews = {r["target"]["player_id"]: r for r in json.loads(review_path.read_text())}
    owned = client is None
    http = client or httpx.Client(
        headers={"User-Agent": USER_AGENT}, follow_redirects=True, timeout=60.0
    )
    stored: list[str] = []
    summary = WikidataSummary(players=len(choices))
    try:
        sources = Sources(http, 1.0)
        for player_id, key in sorted(choices.items()):
            review = reviews[player_id]
            face = next(f for f in review["faces"] if f["key"] == key)
            page = sources.file(face["file_title"])
            found = photo(page) if page else None
            if found is None:
                raise ValueError(f"{face['file_title']} is no longer a free file")
            image = sources.image(found.thumb_url)
            x, y, w, h = (float(v) for v in face["box"])
            square = _square(image, (x, y, w, h))
            if square is None:
                raise ValueError(f"{face['file_title']}: the face is too small to crop")
            row = _row(
                WikidataTarget(player_id, review["target"]["name"], None, None),
                None,
                (found, square, False),
                cache_dir,
                summary,
            )
            with Session(engine) as session:
                existing = session.scalar(
                    select(PlayerPortrait).where(
                        PlayerPortrait.player_id == player_id,
                        PlayerPortrait.source_name == WIKIDATA_PORTRAIT_SOURCE,
                    )
                )
                if existing is None:
                    session.add(row)
                else:
                    for column in (
                        "content_sha256",
                        "storage_path",
                        "mime_type",
                        "width",
                        "height",
                        "bytes",
                        "attribution",
                        "status",
                    ):
                        setattr(existing, column, getattr(row, column))
                    existing.acquired_at = utc_now()
                session.commit()
            stored.append(player_id)
            logger.info("Reviewed photo %s: %s", review["target"]["name"], attribution(found))
    finally:
        if owned:
            http.close()
    return {"stored": len(stored), "players": stored}


__all__ = ["COMMONS_API", "apply_review", "gather_candidates", "targets", "write_review"]
