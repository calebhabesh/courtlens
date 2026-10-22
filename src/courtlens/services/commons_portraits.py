"""Team-era player photos from Wikimedia Commons, for seasons before NBA.com's season headshots.

NBA.com keeps team-season headshots from 2015-16 on, and Basketball-Reference one career photo,
so a player's earlier stints (LeBron James's Heat years) have no photo in that uniform. Commons
holds freely licensed game and event photos for many of them.

For each player-franchise stint before 2015-16 the acquisition:

1. searches Commons for files naming the player and the era's team (``"LeBron James" Heat``);
2. keeps a file only when its licence is free (CC BY, CC BY-SA, CC0, public domain), its text
   names the team, it is not an All-Star or national-team photo, and its date falls in one of
   the stint's seasons, which becomes the photo's season;
3. downloads Commons' 1280px thumbnail, finds the faces (OpenCV YuNet) and keeps the one that
   matches the player's own NBA.com or Basketball-Reference headshot (OpenCV SFace, cosine
   similarity at least ``MIN_SIMILARITY`` and clearly above any other face), so a teammate,
   opponent or fan is never shown as the player;
4. crops that face's head and shoulders to a square and records it as a season portrait with the
   author, licence and file page (``attribution``) for the credits.

Each stint season ends with a row (``active`` with a photo, or ``missing``), so a run resumes
where the last stopped. Requests are sequential with a pause, under Wikimedia's API etiquette.
"""

from __future__ import annotations

import hashlib
import html
import io
import logging
import re
import time
from collections import defaultdict
from collections.abc import Callable, Iterable
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path
from typing import Any

import httpx
import numpy as np
from PIL import Image
from sqlalchemy import Engine, select
from sqlalchemy.orm import Session

from courtlens.domain.teams import (
    TeamInfo,
    franchise_of,
    get_team_by_tricode,
    team_era,
    team_identity,
)
from courtlens.models import utc_now
from courtlens.services.bbref_portraits import BBREF_PORTRAIT_SOURCE
from courtlens.services.season_portraits import SEASON_PHOTOS_FROM, SEASON_PORTRAIT_SOURCE
from courtlens.workbench_models import (
    PlayerPortrait,
    PlayerSeasonPortrait,
    WorkbenchIdentity,
    WorkbenchPlayerGame,
)

logger = logging.getLogger(__name__)

COMMONS_PORTRAIT_SOURCE = "wikimedia_commons"
COMMONS_API = "https://commons.wikimedia.org/w/api.php"
# Wikimedia asks for a descriptive agent with a way to reach the operator.
USER_AGENT = "CourtLens/0.1 (non-commercial portfolio; https://github.com/calebhabesh/courtlens)"
THUMB_WIDTH = 1280
OUTPUT_SIDE = 576
SEARCH_LIMIT = 50
# Files downloaded and checked per season before giving up on it.
TRIES_PER_SEASON = 6

# OpenCV Zoo models (MIT and Apache-2.0), fetched once into the model cache and pinned by hash.
MODELS = {
    "face_detection_yunet_2023mar.onnx": (
        "https://github.com/opencv/opencv_zoo/raw/main/models/face_detection_yunet/"
        "face_detection_yunet_2023mar.onnx",
        "8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4",
    ),
    "face_recognition_sface_2021dec.onnx": (
        "https://github.com/opencv/opencv_zoo/raw/main/models/face_recognition_sface/"
        "face_recognition_sface_2021dec.onnx",
        "0ba9fbfa01b5270c96627c4ef784da859931e02f04419c829e83484087c34e79",
    ),
}

# SFace's published same-person threshold is 0.363 (cosine); a margin over it, and over the
# next face in the photo, keeps borderline and look-alike matches out.
MIN_SIMILARITY = 0.45
MIN_MARGIN = 0.15
# The matched face's width in the 1280px thumbnail: smaller faces crop too soft for a 288px
# avatar at 2x.
MIN_FACE_WIDTH = 100
# Head-and-shoulders framing around the detected face box, like the CDN headshots.
SIDE_PER_FACE_WIDTH = 2.4
HEADROOM_PER_FACE_HEIGHT = 0.45

# In uniform: a sleeveless jersey leaves his upper arms bare. At least this share of one arm's
# region (beside and below the face) must be his skin tone; t-shirts, warm-ups, hoodies and
# suits cover it. Tuned by eye on the first 762 Commons photos (owner, 2026-10-21).
MIN_BARE_ARM = 0.15
SKIN_CHROMA = 9.0

FREE_LICENCE = re.compile(r"^(CC BY(-SA)? \d(\.\d)?|CC0|Public domain|PD(-[\w.-]+)?)\b", re.I)
EXCLUDED = re.compile(r"all[- ]star|olympic|team usa|fiba|world cup|world championship|draft", re.I)
# Off-court settings, where he is out of uniform (owner, 2026-10-21: uniform photos only).
OFF_COURT = re.compile(
    r"press conference|parade|rally|\bvisit|charity|\bcamp\b|practice|fan jam|autograph|"
    r"signing|party|headset|commitment to service|troops|airmen|soldier|white house|president|"
    r"ceremony|award|gala|premiere|red carpet|interview|clinic|foundation|hospital|school|"
    r"wedding|golf|concert|book|meets|reception|dinner|tour\b|museum|street",
    re.I,
)
# Short names fans and captions use beside the official one.
ALIASES = {"SuperSonics": ("Sonics",), "76ers": ("Sixers",), "Trail Blazers": ("Blazers",)}


@dataclass(frozen=True)
class Stint:
    player_id: str
    name: str
    franchise_id: str
    code: str
    team_name: str
    nickname: str
    seasons: tuple[str, ...]


@dataclass
class Candidate:
    title: str
    page_url: str
    thumb_url: str
    season: str
    taken: date
    licence: str
    artist: str


@dataclass
class CommonsSummary:
    stints: int = 0
    searched: int = 0
    checked: int = 0
    acquired: int = 0
    missing: int = 0
    no_reference: int = 0
    out_of_uniform: int = 0
    errors: int = 0
    seasons: dict[str, int] = field(default_factory=dict)


def season_of(day: date) -> str:
    """The NBA season a date falls in: August on belongs to the season starting that year."""
    start = day.year if day.month >= 8 else day.year - 1
    return f"{start}-{(start + 1) % 100:02d}"


_MONTH_NAMES = (
    "january", "february", "march", "april", "may", "june",
    "july", "august", "september", "october", "november", "december",
)  # fmt: skip
_MONTHS = {name: index for index, name in enumerate(_MONTH_NAMES, 1)}


def parse_taken(value: str) -> date | None:
    """Commons' DateTimeOriginal: '2010-12-18 21:17:30', '2011-03-30' or 'Taken on 28 September
    2010, 10:53'. Only a full day counts; a year alone can't place a photo in a season."""
    text = html.unescape(re.sub(r"<[^>]+>", " ", value or ""))
    if match := re.search(r"(\d{4})[-:](\d{2})[-:](\d{2})", text):
        year, month, day = (int(part) for part in match.groups())
    elif match := re.search(r"(\d{1,2}) ([A-Za-z]+),? (\d{4})", text):
        month = _MONTHS.get(match.group(2).lower(), 0)
        day, year = int(match.group(1)), int(match.group(3))
    else:
        return None
    try:
        return date(year, month, day)
    except ValueError:
        return None


def plain(value: str) -> str:
    return " ".join(html.unescape(re.sub(r"<[^>]+>", " ", value or "")).split())


def nickname(team_name: str, city: str) -> str:
    """'Miami Heat' -> 'Heat'; 'Portland Trail Blazers' -> 'Trail Blazers'."""
    return team_name[len(city) :].strip() if team_name.startswith(city) else team_name.split()[-1]


def candidate(page: dict[str, Any], stint: Stint) -> Candidate | None:
    """A search hit that may show the player in this stint's uniform, or None."""
    info = (page.get("imageinfo") or [{}])[0]
    meta = info.get("extmetadata") or {}

    def field_text(name: str) -> str:
        return plain(str((meta.get(name) or {}).get("value", "")))

    licence = field_text("LicenseShortName")
    if not FREE_LICENCE.match(licence) or not info.get("thumburl"):
        return None
    text = " ".join(
        [str(page.get("title", ""))]
        + [field_text(name) for name in ("ObjectName", "ImageDescription", "Categories")]
    )
    names = (stint.nickname, *ALIASES.get(stint.nickname, ()))
    if EXCLUDED.search(text) or OFF_COURT.search(text):
        return None
    if not any(n.lower() in text.lower() for n in names):
        return None
    surname = stint.name.split()[-1].lower()
    if surname not in text.lower():
        return None
    taken = parse_taken(field_text("DateTimeOriginal"))
    if taken is None or season_of(taken) not in stint.seasons:
        return None
    return Candidate(
        title=str(page["title"]),
        page_url=str(info.get("descriptionurl") or ""),
        thumb_url=str(info["thumburl"]),
        season=season_of(taken),
        taken=taken,
        licence=licence,
        artist=field_text("Artist") or "Unknown author",
    )


def attribution(found: Candidate) -> str:
    title = found.title.removeprefix("File:")
    return f"Photo: {found.artist}, {found.licence}, via Wikimedia Commons ({title})"


def crop_box(
    face: tuple[float, float, float, float], width: int, height: int
) -> tuple[int, int, int, int]:
    """A square around the face's head and shoulders, kept inside the image."""
    x, y, w, h = face
    side = min(width, height, round(w * SIDE_PER_FACE_WIDTH))
    left = min(max(0, round(x + w / 2 - side / 2)), width - side)
    top = min(max(0, round(y - h * HEADROOM_PER_FACE_HEIGHT)), height - side)
    return left, top, left + side, top + side


class FaceMatcher:
    """Finds the player's face in a photo by comparison with his reference headshots."""

    def __init__(self, model_dir: Path, client: httpx.Client) -> None:
        import cv2  # Optional dependency: the `photos` extra.

        self.cv2 = cv2
        paths = {name: ensure_model(model_dir, name, client) for name in MODELS}
        self.recognizer = cv2.FaceRecognizerSF.create(
            str(paths["face_recognition_sface_2021dec.onnx"]), ""
        )
        self.detector_path = str(paths["face_detection_yunet_2023mar.onnx"])

    def faces(self, image: np.ndarray) -> list[np.ndarray]:
        height, width = image.shape[:2]
        detector = self.cv2.FaceDetectorYN.create(
            self.detector_path, "", (width, height), 0.8, 0.3, 5000
        )
        _, found = detector.detect(image)
        return [] if found is None else list(found)

    def embedding(self, image: np.ndarray, face: np.ndarray) -> np.ndarray:
        return self.recognizer.feature(self.recognizer.alignCrop(image, face))

    def similarity(self, a: np.ndarray, b: np.ndarray) -> float:
        return float(self.recognizer.match(a, b, self.cv2.FaceRecognizerSF_FR_COSINE))

    def reference(self, paths: Iterable[Path]) -> list[np.ndarray]:
        """Embeddings of the largest face in each reference headshot that has one."""
        embeddings = []
        for path in paths:
            try:
                image = bgr(Image.open(path))
            except OSError:
                continue
            faces = self.faces(image)
            if faces:
                largest = max(faces, key=lambda face: face[2] * face[3])
                embeddings.append(self.embedding(image, largest))
        return embeddings

    def find(
        self, image: np.ndarray, references: list[np.ndarray]
    ) -> tuple[tuple[float, float, float, float], float] | None:
        """The player's face box and similarity, when one face clearly matches him."""
        scored = sorted(
            (
                (
                    max(self.similarity(ref, self.embedding(image, face)) for ref in references),
                    face,
                )
                for face in self.faces(image)
            ),
            key=lambda pair: -pair[0],
        )
        if not scored:
            return None
        best, face = scored[0]
        runner_up = scored[1][0] if len(scored) > 1 else -1.0
        if best < MIN_SIMILARITY or best - runner_up < MIN_MARGIN or face[2] < MIN_FACE_WIDTH:
            return None
        return (float(face[0]), float(face[1]), float(face[2]), float(face[3])), best


def _region(
    image: np.ndarray, x0: float, x1: float, y0: float, y1: float
) -> tuple[np.ndarray, float] | None:
    """Pixels of a box, clipped to the image, and the share of the box inside it."""
    height, width = image.shape[:2]
    left, right = max(0, round(x0)), min(width, round(x1))
    top, bottom = max(0, round(y0)), min(height, round(y1))
    if right <= left or bottom <= top:
        return None
    return image[top:bottom, left:right], (right - left) * (bottom - top) / max(
        1.0, (x1 - x0) * (y1 - y0)
    )


def bare_arm_share(photo: Image.Image, face: tuple[float, float, float, float]) -> float | None:
    """The larger share of either upper-arm region that matches the face's skin tone (chroma
    in YCrCb, so lighting matters less). None when neither arm region is mostly in the frame."""
    ycc = np.asarray(photo.convert("YCbCr"), dtype=float)
    x, y, w, h = face
    centre = _region(ycc, x + 0.25 * w, x + 0.75 * w, y + 0.35 * h, y + 0.75 * h)
    if centre is None:
        return None
    blue, red = np.median(centre[0][..., 1]), np.median(centre[0][..., 2])
    shares = []
    for x0, x1 in ((x - 1.2 * w, x - 0.35 * w), (x + 1.35 * w, x + 2.2 * w)):
        arm = _region(ycc, x0, x1, y + 1.4 * h, y + 2.3 * h)
        if arm is not None and arm[1] > 0.5:
            pixels = arm[0]
            skin = (np.abs(pixels[..., 1] - blue) < SKIN_CHROMA) & (
                np.abs(pixels[..., 2] - red) < SKIN_CHROMA
            )
            shares.append(float(skin.mean()))
    return max(shares) if shares else None


def in_uniform(photo: Image.Image, face: tuple[float, float, float, float]) -> bool:
    share = bare_arm_share(photo, face)
    return share is not None and share >= MIN_BARE_ARM


def bgr(image: Image.Image) -> np.ndarray:
    """An OpenCV BGR array; a transparent cut-out is flattened onto white."""
    rgba = image.convert("RGBA")
    flat = Image.new("RGBA", rgba.size, (255, 255, 255, 255))
    flat.alpha_composite(rgba)
    return np.asarray(flat.convert("RGB"))[:, :, ::-1].copy()


def ensure_model(model_dir: Path, name: str, client: httpx.Client) -> Path:
    url, sha256 = MODELS[name]
    path = model_dir / name
    if not path.exists() or hashlib.sha256(path.read_bytes()).hexdigest() != sha256:
        content = client.get(url, timeout=120.0).raise_for_status().content
        if hashlib.sha256(content).hexdigest() != sha256:
            raise RuntimeError(f"{name} does not match its pinned hash")
        model_dir.mkdir(parents=True, exist_ok=True)
        path.write_bytes(content)
    return path


def stints(session: Session, player_ids: set[str] | None = None) -> list[Stint]:
    """Every player-franchise stint before 2015-16 seen in box scores, with its seasons,
    skipping seasons already settled by an earlier run."""
    rows = session.execute(
        select(
            WorkbenchPlayerGame.player_id, WorkbenchPlayerGame.team_id, WorkbenchPlayerGame.season
        )
        .where(
            WorkbenchPlayerGame.season < SEASON_PHOTOS_FROM,
            WorkbenchPlayerGame.appearance == "appeared",
        )
        .distinct()
    ).all()
    settled = set(
        session.execute(
            select(
                PlayerSeasonPortrait.player_id,
                PlayerSeasonPortrait.team_id,
                PlayerSeasonPortrait.season,
            ).where(PlayerSeasonPortrait.source_name == COMMONS_PORTRAIT_SOURCE)
        ).all()
    )
    names = {
        str(external_id): str(display_name)
        for external_id, display_name in session.execute(
            select(WorkbenchIdentity.external_id, WorkbenchIdentity.display_name).where(
                WorkbenchIdentity.kind == "player"
            )
        )
    }
    # One stint per era: the SuperSonics and Thunder seasons of one franchise search apart.
    grouped: dict[tuple[str, str, str], set[str]] = defaultdict(set)
    teams: dict[tuple[str, str, str], TeamInfo] = {}
    for player_id, team, season in rows:
        player_id, team = str(player_id), str(team)
        if player_ids is not None and player_id not in player_ids:
            continue
        franchise = franchise_of(team)
        if franchise is None or (player_id, franchise, season) in settled:
            continue
        info = season_identity(team, franchise, season)
        if info is None:
            continue
        key = (player_id, franchise, info.name)
        grouped[key].add(season)
        teams[key] = info
    result = []
    for key, seasons in sorted(grouped.items()):
        player_id, franchise, _ = key
        name, info = names.get(player_id), teams[key]
        if not name:
            continue
        result.append(
            Stint(
                player_id=player_id,
                name=name,
                franchise_id=franchise,
                code=info.tricode,
                team_name=info.name,
                nickname=nickname(info.name, info.city),
                seasons=tuple(sorted(seasons)),
            )
        )
    return result


def season_identity(team: str, franchise: str, season: str) -> TeamInfo | None:
    """The team's name that season: an era code's (SEA: Seattle SuperSonics), an era kept under
    the franchise id (the 2012-13 New Orleans Hornets), else the franchise's own."""
    if team_era(team, season) is not None:
        return team_identity(team, season)
    return team_identity(franchise, season) or get_team_by_tricode(team)


def reference_paths(session: Session, player_id: str) -> list[Path]:
    """The player's own headshots on disk: NBA.com season and current photos, then the
    Basketball-Reference career photo."""
    seasonal = session.scalars(
        select(PlayerSeasonPortrait.storage_path)
        .where(
            PlayerSeasonPortrait.player_id == player_id,
            PlayerSeasonPortrait.status == "active",
            PlayerSeasonPortrait.source_name == SEASON_PORTRAIT_SOURCE,
        )
        .order_by(PlayerSeasonPortrait.season)
        .limit(2)
    ).all()
    current = session.scalars(
        select(PlayerPortrait.storage_path)
        .where(PlayerPortrait.player_id == player_id, PlayerPortrait.status == "active")
        .order_by(
            (PlayerPortrait.source_name == BBREF_PORTRAIT_SOURCE).desc(),
            PlayerPortrait.acquired_at.desc(),
        )
        .limit(3)
    ).all()
    return [Path(path) for path in [*seasonal, *current] if path and Path(path).exists()]


class Commons:
    """Sequential Commons API and thumbnail requests, pausing between them."""

    def __init__(self, client: httpx.Client, delay_seconds: float) -> None:
        self.client = client
        self.delay = delay_seconds

    def _get(self, url: str, params: dict[str, Any] | None = None) -> httpx.Response:
        for attempt in range(4):
            response = self.client.get(url, params=params, timeout=30.0)
            if self.delay:
                time.sleep(self.delay)
            if response.status_code not in (429, 500, 502, 503, 504):
                return response.raise_for_status()
            time.sleep(min(60, 5 * 2**attempt))
        return response.raise_for_status()

    def search(self, query: str) -> list[dict[str, Any]]:
        data = self._get(
            COMMONS_API,
            {
                "action": "query",
                "format": "json",
                "generator": "search",
                "gsrsearch": f"{query} filetype:bitmap",
                "gsrnamespace": 6,
                "gsrlimit": SEARCH_LIMIT,
                "prop": "imageinfo",
                "iiprop": "url|extmetadata",
                "iiurlwidth": THUMB_WIDTH,
                "iiextmetadatafilter": (
                    "DateTimeOriginal|LicenseShortName|Artist|ObjectName|ImageDescription|Categories"
                ),
                "maxlag": 5,
            },
        ).json()
        pages = (data.get("query") or {}).get("pages") or {}
        return sorted(pages.values(), key=lambda page: page.get("index", 0))

    def image(self, url: str) -> Image.Image:
        return Image.open(io.BytesIO(self._get(url).content))


def acquire_commons_portraits(
    engine: Engine,
    cache_dir: Path,
    model_dir: Path,
    *,
    player_ids: set[str] | None = None,
    limit: int | None = None,
    delay_seconds: float = 1.0,
    client: httpx.Client | None = None,
    progress: Callable[[CommonsSummary], None] | None = None,
) -> CommonsSummary:
    with Session(engine) as session:
        todo = stints(session, player_ids)
    if limit is not None:
        todo = todo[:limit]
    summary = CommonsSummary(stints=len(todo))
    owned = client is None
    http = client or httpx.Client(
        headers={"User-Agent": USER_AGENT}, follow_redirects=True, timeout=30.0
    )
    try:
        matcher = FaceMatcher(model_dir, http)
        commons = Commons(http, delay_seconds)
        for index, stint in enumerate(todo):
            try:
                _acquire_stint(engine, stint, commons, matcher, cache_dir, summary)
            except (httpx.HTTPError, OSError, ValueError) as exc:
                summary.errors += 1
                logger.warning(
                    "Commons stint %s %s left for a later run: %s", stint.name, stint.code, exc
                )
            if progress is not None and (index + 1) % 25 == 0:
                progress(summary)
    finally:
        if owned:
            http.close()
    return summary


def _acquire_stint(
    engine: Engine,
    stint: Stint,
    commons: Commons,
    matcher: FaceMatcher,
    cache_dir: Path,
    summary: CommonsSummary,
) -> None:
    with Session(engine) as session:
        references = matcher.reference(reference_paths(session, stint.player_id))
    if not references:
        # Nothing to recognise him by; a later run retries once a headshot exists.
        summary.no_reference += 1
        return
    hits = commons.search(f'"{stint.name}" {stint.nickname}')
    summary.searched += 1
    by_season: dict[str, list[Candidate]] = defaultdict(list)
    seen = set()
    for page in hits:
        found = candidate(page, stint)
        if found is not None and found.title not in seen:
            seen.add(found.title)
            by_season[found.season].append(found)
    results: dict[str, tuple[Candidate, Image.Image, float] | None] = {}
    for season in stint.seasons:
        results[season] = None
        for found in by_season.get(season, [])[:TRIES_PER_SEASON]:
            summary.checked += 1
            photo = commons.image(found.thumb_url).convert("RGB")
            match = matcher.find(np.asarray(photo)[:, :, ::-1].copy(), references)
            if match is None:
                continue
            face, score = match
            if not in_uniform(photo, face):
                summary.out_of_uniform += 1
                continue
            square = photo.crop(crop_box(face, photo.width, photo.height))
            if square.width > OUTPUT_SIDE:
                square = square.resize((OUTPUT_SIDE, OUTPUT_SIDE), Image.Resampling.LANCZOS)
            results[season] = (found, square, score)
            break
    with Session(engine) as session:
        for season, result in results.items():
            session.add(_row(stint, season, result, cache_dir, summary))
        session.commit()


def _row(
    stint: Stint,
    season: str,
    result: tuple[Candidate, Image.Image, float] | None,
    cache_dir: Path,
    summary: CommonsSummary,
) -> PlayerSeasonPortrait:
    row = PlayerSeasonPortrait(
        player_id=stint.player_id,
        team_id=stint.franchise_id,
        team_tricode=stint.code,
        season=season,
        source_name=COMMONS_PORTRAIT_SOURCE,
        source_url=f"{COMMONS_API}?search={stint.name} {stint.nickname}",
        status="missing",
        attribution="No freely licensed Commons photo matched this player and season",
        acquired_at=utc_now(),
    )
    if result is None:
        summary.missing += 1
        return row
    found, square, score = result
    buffer = io.BytesIO()
    square.save(buffer, format="JPEG", quality=90, optimize=True)
    content = buffer.getvalue()
    sha256 = hashlib.sha256(content).hexdigest()
    cache_dir.mkdir(parents=True, exist_ok=True)
    path = cache_dir / f"{sha256}.jpg"
    if not path.exists():
        path.write_bytes(content)
    row.status = "active"
    row.source_url = found.page_url
    row.attribution = attribution(found)
    row.content_sha256 = sha256
    row.storage_path = str(path)
    row.mime_type = "image/jpeg"
    row.width = row.height = square.width
    row.bytes = len(content)
    summary.acquired += 1
    summary.seasons[season] = summary.seasons.get(season, 0) + 1
    logger.info(
        "Commons %s %s %s: %s (similarity %.2f)", stint.name, stint.code, season, found.title, score
    )
    return row
