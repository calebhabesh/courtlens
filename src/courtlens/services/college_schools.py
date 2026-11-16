"""College schools for the player header (`courtlens refresh-college-schools`); visitors never
fetch.

Each player's college comes from his retained Basketball-Reference page (no fetch). One run then
fetches Sports-Reference's schools index and ESPN's college teams list (one request each), joins
them (ingestion/college_schools.py) and downloads the dark-background logo of each school it
newly needs, kept as a 96 px PNG. It writes `colleges.json` in the output directory atomically;
the API reads it and serves the logos from there. A run that cannot read either index writes
nothing, so the last good file keeps serving.
"""

from __future__ import annotations

import io
import json
import os
from collections.abc import Callable
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit

import httpx
from PIL import Image
from sqlalchemy import select
from sqlalchemy.orm import Session

from courtlens.config import get_settings
from courtlens.ingestion.college_schools import (
    ESPN_API_HOST,
    ESPN_LOGO_HOST,
    ESPN_TEAMS_URL,
    SR_HOST,
    SR_SCHOOLS_URL,
    match_espn,
    match_school,
    parse_espn_teams,
    parse_sr_schools,
    player_college,
    validate_url,
)
from courtlens.reference_models import BbrefPlayerProfile
from courtlens.services.source_acquisition import ScheduledFetcher, keep_body
from courtlens.workbench_models import WorkbenchAcquisition, WorkbenchArtifact

VERSION = "courtlens-college-schools-v1"
RESOURCE = "college_schools"
FILE = "colleges.json"
LOGO_PIXELS = 96
# Sports-Reference shares Basketball-Reference's 20 requests a minute; ESPN's API at the rosters'
# pace; the logo CDN serves static images.
SOURCES = {
    "sports_reference_cbb": (SR_HOST, 4.0),
    "espn_college_teams": (ESPN_API_HOST, 5.0),
    "espn_college_logos": (ESPN_LOGO_HOST, 1.0),
}
SR_ATTRIBUTION = "Sports-Reference.com college basketball schools"
ESPN_ATTRIBUTION = "ESPN"


def validate_college_url(source: str, url: str, season: str) -> float:
    if source not in SOURCES or urlsplit(url).netloc != SOURCES[source][0] or not validate_url(url):
        raise ValueError("only the schools index, ESPN's college teams and their logos")
    return SOURCES[source][1]


class CollegeFetcher(ScheduledFetcher):
    def __init__(self, session: Session, root: Path, client: httpx.Client) -> None:
        super().__init__(
            session,
            root,
            client,
            resource=RESOURCE,
            kinds={key: "player_bio" for key in SOURCES},
            validate_url=validate_college_url,
            max_bytes=5_000_000,
            # site.api.espn.com answers robots.txt with an edge 403 for every client (see
            # services/espn_rosters.py): it serves no robots file to read.
            robots_optional_hosts=frozenset({ESPN_API_HOST}),
            # The two indexes are retained (unchanged pages share one stored copy); logos are
            # kept only as the resized copy the API serves.
            retain_bodies=False,
        )


def player_colleges(session: Session, pages_root: Path) -> dict[str, tuple[str, str]]:
    """player_id -> (Basketball-Reference college slug, name), from each newest retained page."""
    rows = session.execute(
        select(BbrefPlayerProfile.player_id, WorkbenchArtifact.storage_path)
        .join(WorkbenchAcquisition, WorkbenchAcquisition.id == BbrefPlayerProfile.acquisition_id)
        .join(WorkbenchArtifact, WorkbenchArtifact.id == WorkbenchAcquisition.artifact_id)
        .order_by(
            BbrefPlayerProfile.player_id,
            BbrefPlayerProfile.observed_at.desc(),
            BbrefPlayerProfile.created_at.desc(),
        )
    ).all()
    colleges: dict[str, tuple[str, str]] = {}
    seen: set[str] = set()
    for player_id, storage_path in rows:
        if player_id in seen:
            continue
        seen.add(player_id)  # the newest profile only, even when its page names no college
        path = pages_root / storage_path
        if path.is_file() and (college := player_college(path.read_bytes())) is not None:
            colleges[player_id] = college
    return colleges


def _logo_png(raw: bytes) -> bytes:
    image = Image.open(io.BytesIO(raw)).convert("RGBA")
    image.thumbnail((LOGO_PIXELS, LOGO_PIXELS), Image.Resampling.LANCZOS)
    out = io.BytesIO()
    image.save(out, format="PNG", optimize=True)
    return out.getvalue()


def _write_atomic(path: Path, body: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_bytes(body)
    os.replace(temporary, path)


def refresh(
    session: Session,
    fetcher: ScheduledFetcher,
    *,
    pages_root: Path,
    out_dir: Path,
    log: Callable[[dict[str, Any]], None] = lambda event: None,
) -> dict[str, Any]:
    """One run: both indexes, the join, the missing logos, then colleges.json."""
    colleges = player_colleges(session, pages_root)

    def index(source: str, url: str, mime: str) -> tuple[WorkbenchAcquisition, bytes] | None:
        receipt = fetcher.fetch(source, url, "all")
        if receipt.status != "success":
            session.commit()
            log({"url": url, "status": "failed", "reason": receipt.error_summary})
            return None
        body = fetcher.bodies[receipt.id]
        keep_body(fetcher, receipt, mime)
        session.commit()
        return receipt, body

    sr = index("sports_reference_cbb", SR_SCHOOLS_URL, "text/html")
    espn = index("espn_college_teams", ESPN_TEAMS_URL, "application/json") if sr else None
    if sr is None or espn is None:
        return {"written": False, "reason": "an index could not be read", "players": len(colleges)}
    schools = parse_sr_schools(sr[1])
    teams = parse_espn_teams(espn[1])

    logos_dir = out_dir / "logos"
    served: dict[str, dict[str, Any]] = {}
    players: dict[str, dict[str, Any]] = {}
    unmatched: dict[str, str] = {}
    fetched = failed = 0
    for player_id, (slug, name) in sorted(colleges.items()):
        school_slug = match_school(slug, name, schools)
        players[player_id] = {"college": name, "bbref_college": slug, "school": school_slug}
        if school_slug is None:
            unmatched[slug] = name
            continue
        if school_slug in served:
            continue
        school = schools[school_slug]
        team = match_espn(school, teams)
        logo = None
        if team is not None:
            path = logos_dir / f"{team.espn_id}.png"
            if not path.is_file() and ESPN_LOGO_HOST not in fetcher.stopped:
                receipt = fetcher.fetch("espn_college_logos", team.logo_url, "all")
                session.commit()
                if receipt.status == "success":
                    try:
                        _write_atomic(path, _logo_png(fetcher.bodies[receipt.id]))
                        fetched += 1
                    except OSError as error:
                        failed += 1
                        log({"url": team.logo_url, "status": "rejected", "reason": str(error)})
                else:
                    failed += 1
                    log({"url": team.logo_url, "status": "failed", "reason": receipt.error_summary})
            logo = team.espn_id if path.is_file() else None
        served[school_slug] = {
            "name": school.name,
            "location": school.location,
            "source_url": f"https://{SR_HOST}/cbb/schools/{school_slug}/men/",
            "logo": logo,
        }

    body = {
        "version": VERSION,
        "built_at": datetime.now(UTC).isoformat(timespec="seconds"),
        "sources": {
            "schools": {
                "url": SR_SCHOOLS_URL,
                "attribution": SR_ATTRIBUTION,
                "acquisition_id": sr[0].id,
                "sha256": sr[0].content_sha256,
            },
            "logos": {
                "url": ESPN_TEAMS_URL,
                "attribution": ESPN_ATTRIBUTION,
                "acquisition_id": espn[0].id,
                "sha256": espn[0].content_sha256,
            },
        },
        "schools": served,
        "players": players,
    }
    _write_atomic(out_dir / FILE, (json.dumps(body, indent=1, sort_keys=True) + "\n").encode())
    return {
        "written": True,
        "players": len(players),
        "placed": sum(1 for row in players.values() if row["school"]),
        "schools": len(served),
        "with_logo": sum(1 for row in served.values() if row["logo"]),
        "logos_fetched": fetched,
        "logos_failed": failed,
        "unmatched_colleges": len(unmatched),
    }


_cache: dict[Path, tuple[int, dict[str, Any]]] = {}


def _served() -> dict[str, Any] | None:
    directory = get_settings().college_schools_dir
    if directory is None:
        return None
    path = directory / FILE
    try:
        stamp = path.stat().st_mtime_ns
    except OSError:
        return None
    cached = _cache.get(path)
    if cached is None or cached[0] != stamp:
        cached = (stamp, json.loads(path.read_text()))
        _cache[path] = cached
    return cached[1]


def player_school(player_id: str) -> dict[str, Any] | None:
    """The header's college: name, "City, State" and logo URL where known, or None."""
    served = _served()
    row = served["players"].get(player_id) if served else None
    if served is None or row is None:
        return None
    school = served["schools"].get(row["school"]) if row["school"] else None
    return {
        "name": row["college"],
        "school": school["name"] if school else None,
        "location": school["location"] if school else None,
        "logo_url": f"/api/workbench/college-logos/{school['logo']}"
        if school and school["logo"]
        else None,
        "source_url": school["source_url"] if school else None,
        "attribution": served["sources"]["schools"]["attribution"] if school else None,
    }


def logo_path(espn_id: str) -> Path | None:
    directory = get_settings().college_schools_dir
    if directory is None or not espn_id.isdigit():
        return None
    path = directory / "logos" / f"{espn_id}.png"
    return path if path.is_file() else None
