"""Explicit acquisition / offline integrity check for the bounded NBA branding bundle."""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import os
import re
import time
from collections import deque
from datetime import UTC, datetime
from pathlib import Path
from urllib.request import Request, urlopen
from xml.etree import ElementTree

from PIL import Image

from courtlens.domain.teams import (
    FRANCHISE_GAPS,
    NBA_TEAMS,
    TEAM_ERAS,
    franchise_active,
)

CATALOG = Path("dashboard/lib/team-branding.json")
PUBLIC = Path("dashboard/public")
MAX_BYTES = 512_000
USER_AGENT = "CourtLens/1.0 (non-commercial portfolio research)"
PNG_MAGIC = b"\x89PNG\r\n\x1a\n"

# Basketball-Reference logos sit on an opaque white square. Only white reachable from the image
# edge is cleared, so white inside a logo (a ball, lettering) stays; near-white edge pixels fade.
CLEAR_AT = 235
FADE_FROM = 170
DERIVATION = (
    f"edge-connected white (min channel >= {CLEAR_AT}) made transparent, fading from {FADE_FROM}"
)


def _clear_background(data: bytes) -> bytes:
    image = Image.open(io.BytesIO(data)).convert("RGBA")
    width, height = image.size
    pixels = image.load()
    assert pixels is not None
    seen: set[tuple[int, int]] = set()
    queue = deque(
        (x, y)
        for x in range(width)
        for y in range(height)
        if x in (0, width - 1) or y in (0, height - 1)
    )
    while queue:
        x, y = queue.popleft()
        if (x, y) in seen or not (0 <= x < width and 0 <= y < height):
            continue
        r, g, b, _ = pixels[x, y]
        lightest = min(r, g, b)
        if lightest < FADE_FROM:
            continue
        seen.add((x, y))
        if lightest >= CLEAR_AT:
            pixels[x, y] = (r, g, b, 0)
            queue.extend(((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)))
        else:
            pixels[x, y] = (r, g, b, round(255 * (CLEAR_AT - lightest) / (CLEAR_AT - FADE_FROM)))
    out = io.BytesIO()
    image.save(out, format="PNG", optimize=True)
    return out.getvalue()


# One artwork per era identity. Wikipedia hosts SVGs for two; Basketball-Reference's team pages
# carry an era logo for every season (125 px PNG), so the rest use the era's last season.
ERA_ARTWORK: dict[str, tuple[str, str]] = {
    "Seattle SuperSonics": (
        "wikipedia",
        "https://en.wikipedia.org/wiki/File:Seattle_SuperSonics_logo.svg",
    ),
    "Vancouver Grizzlies": (
        "wikipedia",
        "https://en.wikipedia.org/wiki/File:Vancouver_Grizzlies_logo.svg",
    ),
    "New Jersey Nets": ("bbref", "https://www.basketball-reference.com/teams/NJN/2012.html"),
    "Charlotte Hornets": ("bbref", "https://www.basketball-reference.com/teams/CHH/2002.html"),
    "New Orleans Hornets": ("bbref", "https://www.basketball-reference.com/teams/NOH/2013.html"),
    "New Orleans/Oklahoma City Hornets": (
        "bbref",
        "https://www.basketball-reference.com/teams/NOK/2007.html",
    ),
    "Charlotte Bobcats": ("bbref", "https://www.basketball-reference.com/teams/CHA/2014.html"),
}


def _get(url: str) -> tuple[bytes, str, str | None]:
    request = Request(url, headers={"User-Agent": USER_AGENT})
    with urlopen(request, timeout=30) as response:
        data: bytes = response.read(MAX_BYTES + 1)
        return data, response.headers.get_content_type(), response.headers.get("Last-Modified")


def _check_svg(data: bytes, source: str) -> None:
    root = ElementTree.fromstring(data)
    assert root.tag == "{http://www.w3.org/2000/svg}svg", source
    # Assets served as images only. Reject active content and external references.
    for node in root.iter():
        assert node.tag.rsplit("}", 1)[-1] not in {"script", "foreignObject"}
        for key, value in node.attrib.items():
            assert not key.lower().startswith("on")
            if key.rsplit("}", 1)[-1] == "href":
                assert value.startswith("#"), (source, value)


def _store(stem: str, data: bytes, extension: str) -> tuple[str, str]:
    digest = hashlib.sha256(data).hexdigest()
    asset = f"/team-logos/{stem}-{digest[:16]}.{extension}"
    path = PUBLIC / asset.lstrip("/")
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        assert path.read_bytes() == data
    else:
        path.write_bytes(data)
    return asset, digest


def _acquire_era(name: str) -> dict[str, object]:
    kind, page = ERA_ARTWORK[name]
    if kind == "wikipedia":
        title = page.rsplit("/", 1)[1]
        api = (
            "https://en.wikipedia.org/w/api.php?action=query&prop=imageinfo&iiprop=url"
            f"&format=json&titles={title}"
        )
        info = json.loads(_get(api)[0])
        source = next(iter(info["query"]["pages"].values()))["imageinfo"][0]["url"].split("?")[0]
    else:
        html = _get(page)[0].decode("utf-8", "replace")
        match = re.search(r"https://cdn\.ssref\.net/req/\d+/tlogo/bbr/[A-Z]{3}-\d{4}\.png", html)
        assert match, page
        source = match.group(0)
    data, content_type, modified = _get(source)
    assert len(data) <= MAX_BYTES, source
    if source.endswith(".svg"):
        assert content_type == "image/svg+xml", source
        _check_svg(data, source)
        extension = "svg"
    stem = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    derived: dict[str, object] = {}
    if not source.endswith(".svg"):
        assert content_type == "image/png" and data.startswith(PNG_MAGIC), source
        derived = {"source_sha256": hashlib.sha256(data).hexdigest(), "derivation": DERIVATION}
        data, extension = _clear_background(data), "png"
    asset, digest = _store(stem, data, extension)
    return {
        "asset": asset,
        "sha256": digest,
        "bytes": len(data),
        "source_url": source,
        "source_page": page,
        "last_modified": modified,
        **derived,
    }


def _era_records(previous: list[dict[str, object]]) -> list[dict[str, object]]:
    artwork: dict[str, dict[str, object]] = {
        str(record["artwork_name"]): {
            key: record[key]
            for key in (
                "asset",
                "sha256",
                "bytes",
                "source_url",
                "source_page",
                "last_modified",
                "source_sha256",
                "derivation",
            )
            if key in record
        }
        for record in previous
    }
    for name in ERA_ARTWORK:
        if name not in artwork:
            artwork[name] = _acquire_era(name)
            time.sleep(3)  # Basketball-Reference asks for at most one request every few seconds.
    return [
        {
            "code": era.code,
            "franchise_id": era.franchise_id,
            "artwork_name": era.name,
            "first_season": era.first_season,
            "last_season": era.last_season,
            "stored_as_code": era.stored_as_code,
            **artwork[era.name],
        }
        for era in TEAM_ERAS
    ]


# Basketball-Reference's codes where they differ from the NBA's current tricodes.
BBREF_CODES = {"BKN": "BRK", "CHA": "CHO", "PHX": "PHO"}
BBREF_LOGO = "https://cdn.ssref.net/req/{version}/tlogo/bbr/{code}-{year}.png"
# Era SVGs stand in for the Basketball-Reference season whose logo they show.
ERA_SVG_SEASONS = {"Seattle SuperSonics": ("SEA", 2008), "Vancouver Grizzlies": ("VAN", 2001)}


def _bbref_code(franchise_id: str, season: str) -> str:
    era = next((e for e in TEAM_ERAS if e.franchise_id == franchise_id and e.covers(season)), None)
    if era is not None:
        return era.code
    tricode = NBA_TEAMS[franchise_id].tricode
    return BBREF_CODES.get(tricode, tricode)


def _bbref_logo(version: str, code: str, year: int, cache: Path) -> tuple[str, bytes]:
    """One season's logo, from the local cache when an earlier run fetched it."""
    url = BBREF_LOGO.format(version=version, code=code, year=year)
    path = cache / f"{code}-{year}.png"
    if not path.exists():
        data, content_type, _ = _get(url)
        assert content_type == "image/png" and data.startswith(PNG_MAGIC), url
        assert len(data) <= MAX_BYTES, url
        path.write_bytes(data)
        time.sleep(1)
    return url, path.read_bytes()


def _season_logo_records(
    catalog: dict[str, object], first: int, last: int, cache: Path
) -> list[dict[str, object]]:
    """Every franchise-season's logo, grouped into spans of identical artwork.

    A span whose logo is the franchise's current one uses NBA.com's SVG; one matching an era SVG
    uses that; any other gets one background-cleared Basketball-Reference PNG per distinct logo.
    """
    page = _get("https://www.basketball-reference.com/teams/TOR/2026.html")[0].decode()
    found = re.search(r"cdn\.ssref\.net/req/(\d+)/tlogo/bbr/", page)
    assert found, "Basketball-Reference logo path not found"
    version = found.group(1)
    cache.mkdir(parents=True, exist_ok=True)
    teams = {str(t["team_id"]): t for t in catalog["teams"]}  # type: ignore[union-attr]
    eras = catalog["eras"]  # type: ignore[index]
    latest = f"{last}-{str(last + 1)[-2:]}"
    stand_ins: dict[str, dict[str, object]] = {}
    for name, (code, year) in ERA_SVG_SEASONS.items():
        record = next(e for e in eras if e["artwork_name"] == name)  # type: ignore[union-attr]
        stand_ins[hashlib.sha256(_bbref_logo(version, code, year, cache)[1]).hexdigest()] = record
    for era in eras:  # type: ignore[union-attr]
        if "source_sha256" in era:
            stand_ins.setdefault(str(era["source_sha256"]), era)
    records: list[dict[str, object]] = []
    for franchise_id, team in teams.items():
        current = _bbref_logo(version, _bbref_code(franchise_id, latest), last + 1, cache)[1]
        current_hash = hashlib.sha256(current).hexdigest()
        spans: list[dict[str, object]] = []
        for start in range(first, last + 1):
            season = f"{start}-{str(start + 1)[-2:]}"
            if not franchise_active(franchise_id, season):
                continue
            code = _bbref_code(franchise_id, season)
            url, data = _bbref_logo(version, code, start + 1, cache)
            source_hash = hashlib.sha256(data).hexdigest()
            previous = spans[-1] if spans else None
            if (
                previous
                and previous["source_sha256"] == source_hash
                and int(str(previous["last_season"])[:4]) == start - 1
            ):
                previous["last_season"] = season
                continue
            if source_hash == current_hash:
                artwork = {"artwork": "current", "asset": team["asset"], "sha256": team["sha256"]}
            elif source_hash in stand_ins:
                era = stand_ins[source_hash]
                artwork = {"artwork": "era", "asset": era["asset"], "sha256": era["sha256"]}
            else:
                cleared = _clear_background(data)
                asset, digest = _store(f"{code.lower()}-{start + 1}", cleared, "png")
                artwork = {
                    "artwork": "season",
                    "asset": asset,
                    "sha256": digest,
                    "bytes": len(cleared),
                    "derivation": DERIVATION,
                }
            spans.append(
                {
                    "franchise_id": franchise_id,
                    "code": code,
                    "first_season": season,
                    "last_season": season,
                    "source_url": url,
                    "source_sha256": source_hash,
                    **artwork,
                }
            )
        records.extend(spans)
    return records


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--acquire", action="store_true", help="Download official assets explicitly"
    )
    parser.add_argument(
        "--acquire-eras",
        action="store_true",
        help="Download missing era artwork and rewrite the era records, keeping current teams",
    )
    parser.add_argument(
        "--acquire-season-logos",
        action="store_true",
        help="Fetch every franchise-season's Basketball-Reference logo and rewrite season spans",
    )
    parser.add_argument(
        "--first-season", type=int, default=2000, help="Start year of the first season"
    )
    parser.add_argument(
        "--last-season", type=int, default=2025, help="Start year of the last season"
    )
    args = parser.parse_args()
    if args.acquire:
        records = []
        for team in NBA_TEAMS.values():
            source = f"https://cdn.nba.com/logos/nba/{team.team_id}/primary/L/logo.svg"
            with urlopen(source, timeout=30) as response:
                data = response.read(MAX_BYTES + 1)
                assert len(data) <= MAX_BYTES, source
                assert response.headers.get_content_type() == "image/svg+xml", source
                modified = response.headers.get("Last-Modified")
            _check_svg(data, source)
            asset, digest = _store(team.team_id, data, "svg")
            records.append(
                {
                    "team_id": team.team_id,
                    "tricode": team.tricode,
                    "artwork_name": team.name,
                    "asset": asset,
                    "sha256": digest,
                    "bytes": len(data),
                    "source_url": source,
                    "source_page": "https://www.nba.com/teams",
                    "last_modified": modified,
                }
            )
        previous = json.loads(CATALOG.read_text()) if CATALOG.exists() else {}
        CATALOG.write_text(
            json.dumps(
                {
                    "version": "pf03-v1",
                    "acquired_at": datetime.now(UTC).isoformat(),
                    "identity_semantics": (
                        "Decorative current-franchise artwork; "
                        "not era-specific identity or roster evidence."
                    ),
                    "attribution": (
                        "NBA Properties, Inc. and respective NBA teams. All rights reserved."
                    ),
                    "terms_url": "https://www.nba.com/termsofuse",
                    "reuse": (
                        "Retained for this local, personal, noncommercial research workbench. "
                        "No open license or public/commercial redistribution permission asserted."
                    ),
                    "teams": records,
                    "eras": previous.get("eras", []),
                    "inactive": previous.get("inactive", []),
                },
                indent=2,
            )
            + "\n"
        )
    if args.acquire_eras:
        catalog = json.loads(CATALOG.read_text())
        catalog["eras"] = _era_records(catalog.get("eras", []))
        catalog["eras_semantics"] = (
            "Era identity artwork for franchises' earlier names, matched by season. "
            "Sources: Wikipedia file pages and Basketball-Reference team pages."
        )
        catalog["inactive"] = [
            {"franchise_id": team, "first_season": first, "last_season": last}
            for team, first, last in FRANCHISE_GAPS
        ]
        CATALOG.write_text(json.dumps(catalog, indent=2, ensure_ascii=False) + "\n")
    if args.acquire_season_logos:
        catalog = json.loads(CATALOG.read_text())
        cache = (
            Path(os.environ.get("TMPDIR") or Path.home() / ".cache/courtlens-tmp") / "bbref-logos"
        )
        catalog["season_logos"] = _season_logo_records(
            catalog, args.first_season, args.last_season, cache
        )
        catalog["season_logos_semantics"] = (
            "Each franchise's logo by season (Basketball-Reference team-season logos), grouped "
            "into spans; 'current' and 'era' spans reuse the sharper NBA.com and Wikipedia SVGs."
        )
        CATALOG.write_text(json.dumps(catalog, indent=2, ensure_ascii=False) + "\n")
    catalog = json.loads(CATALOG.read_text())
    assert len(catalog["teams"]) == len(NBA_TEAMS) == 30
    eras = catalog.get("eras", [])
    assert len(eras) == len(TEAM_ERAS)
    for record in [*catalog["teams"], *eras, *catalog.get("season_logos", [])]:
        data = (PUBLIC / record["asset"].lstrip("/")).read_bytes()
        assert hashlib.sha256(data).hexdigest() == record["sha256"]
        assert len(data) == record.get("bytes", len(data)) <= MAX_BYTES
    print(
        json.dumps(
            {
                "verified_assets": len(
                    {
                        r["asset"]
                        for r in [*catalog["teams"], *eras, *catalog.get("season_logos", [])]
                    }
                ),
                "season_spans": len(catalog.get("season_logos", [])),
                "total_bytes": sum(
                    (PUBLIC / asset.lstrip("/")).stat().st_size
                    for asset in {
                        r["asset"]
                        for r in [*catalog["teams"], *eras, *catalog.get("season_logos", [])]
                    }
                ),
            }
        )
    )


if __name__ == "__main__":
    main()
