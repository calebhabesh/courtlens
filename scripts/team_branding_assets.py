"""Explicit acquisition / offline integrity check for the bounded NBA branding bundle."""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import os
import re
import time
from collections import Counter, deque
from datetime import UTC, datetime
from pathlib import Path
from urllib.error import HTTPError
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


# One artwork per era identity, keyed by code (two different teams were the Baltimore Bullets).
# Wikipedia hosts SVGs for two; Basketball-Reference has a logo for every team-season (125 px
# PNG), so every other era uses its last season's.
ERA_WIKIPEDIA: dict[str, str] = {
    "SEA": "https://en.wikipedia.org/wiki/File:Seattle_SuperSonics_logo.svg",
    "VAN": "https://en.wikipedia.org/wiki/File:Vancouver_Grizzlies_logo.svg",
    # Folded teams Basketball-Reference has no logo for. Six others have none on either source.
    "AND": "https://en.wikipedia.org/wiki/File:Anderson_Packers_logo.PNG",
    "INO": "https://en.wikipedia.org/wiki/File:Indianapolis_Olympians_logo.svg",
}


def _logo_color(asset: str) -> str | None:
    """A logo's main color: the most common saturated color (black, white and greys ignored),
    for era accents nobody picked by hand. None when the logo has no saturated color."""
    data = (PUBLIC / asset.lstrip("/")).read_bytes()
    pixels: Counter[tuple[int, int, int]] = Counter()
    if asset.endswith(".svg"):
        for value in re.findall(rb"#([0-9a-fA-F]{6})\b", data):
            rgb = bytes.fromhex(value.decode())
            pixels[(rgb[0], rgb[1], rgb[2])] += 1
    else:
        image = Image.open(io.BytesIO(data)).convert("RGBA")
        for (r, g, b, alpha), n in Counter(image.getdata()).items():
            if alpha >= 200:
                pixels[(r, g, b)] += n
    # Group similar shades, pick the largest group and report its pixels' average color.
    groups: dict[tuple[int, int, int], Counter[tuple[int, int, int]]] = {}
    for rgb, n in pixels.items():
        if max(rgb) >= 40 and (max(rgb) - min(rgb)) / max(rgb) >= 0.3:
            groups.setdefault((rgb[0] // 32, rgb[1] // 32, rgb[2] // 32), Counter())[rgb] += n
    if not groups:
        return None
    largest = max(groups.values(), key=lambda group: sum(group.values()))
    total = sum(largest.values())
    r, g, b = (round(sum(rgb[i] * n for rgb, n in largest.items()) / total) for i in range(3))
    return f"#{r:02X}{g:02X}{b:02X}"


def _era_last_years() -> dict[str, int]:
    """Each era code's last season, by end year (its Basketball-Reference logo year)."""
    years: dict[str, int] = {}
    for era in TEAM_ERAS:
        years[era.code] = max(years.get(era.code, 0), int(era.last_season[:4]) + 1)
    return years


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


def _logo_version() -> str:
    page = _get("https://www.basketball-reference.com/teams/TOR/2026.html")[0].decode()
    found = re.search(r"cdn\.ssref\.net/req/(\d+)/tlogo/bbr/", page)
    assert found, "Basketball-Reference logo path not found"
    return found.group(1)


def _acquire_era(code: str, name: str, version: str) -> dict[str, object] | None:
    """The era's artwork, or None when the source has no logo for it."""
    if code in ERA_WIKIPEDIA:
        page = ERA_WIKIPEDIA[code]
        title = page.rsplit("/", 1)[1]
        api = (
            "https://en.wikipedia.org/w/api.php?action=query&prop=imageinfo&iiprop=url"
            f"&iiurlwidth=250&format=json&titles={title}"
        )
        info = json.loads(_get(api)[0])
        image = next(iter(info["query"]["pages"].values()))["imageinfo"][0]
        # SVGs as they are; raster files as Wikimedia's 250 px rendering.
        original = image["url"].split("?")[0]
        source = original if original.endswith(".svg") else image["thumburl"].split("?")[0]
    else:
        year = _era_last_years()[code]
        page = f"https://www.basketball-reference.com/teams/{code}/{year}.html"
        source = BBREF_LOGO.format(version=version, code=code, year=year)
    try:
        data, content_type, modified = _get(source)
    except HTTPError as error:
        if error.code == 404:
            return None
        raise
    assert len(data) <= MAX_BYTES, source
    if source.endswith(".svg"):
        assert content_type == "image/svg+xml", source
        _check_svg(data, source)
        extension = "svg"
    stem = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    if code in {"BLB", "DNN"}:  # Names a later franchise also used.
        stem = f"{stem}-{code.lower()}"
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
    artwork: dict[str, dict[str, object] | None] = {
        str(record["code"]): {
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
        if "asset" in record
    }
    version: str | None = None
    for era in TEAM_ERAS:
        if era.code not in artwork:
            version = version or _logo_version()
            artwork[era.code] = _acquire_era(era.code, era.name, version)
            time.sleep(3)  # Basketball-Reference asks for at most one request every few seconds.
    return [
        {
            "code": era.code,
            "franchise_id": era.franchise_id,
            "artwork_name": era.name,
            "first_season": era.first_season,
            "last_season": era.last_season,
            "stored_as_code": era.stored_as_code,
            **(artwork[era.code] or {}),
            **(
                {"brand_color": color}
                if (art := artwork[era.code]) and (color := _logo_color(str(art["asset"])))
                else {}
            ),
        }
        for era in TEAM_ERAS
    ]


# Basketball-Reference's codes where they differ from the NBA's current tricodes.
BBREF_CODES = {"BKN": "BRK", "CHA": "CHO", "PHX": "PHO"}
BBREF_LOGO = "https://cdn.ssref.net/req/{version}/tlogo/bbr/{code}-{year}.png"
# Era SVGs stand in for the Basketball-Reference season whose logo they show.
ERA_SVG_SEASONS = {"SEA": 2008, "VAN": 2001}


# The league's conference marks (the 2018 wordmarks NBA.com uses), from Wikimedia Commons.
CONFERENCE_ARTWORK: dict[str, str] = {
    "East": "Eastern_Conference_(NBA)_logo_2018.png",
    "West": "Western_Conference_(NBA)_logo_2018.png",
}
CONFERENCE_HEIGHT = 96
CONFERENCE_DERIVATION = (
    f"transparent margins trimmed, resized to {CONFERENCE_HEIGHT} px tall (Lanczos), PNG optimized"
)


def _acquire_conference(conference: str) -> dict[str, object]:
    title = CONFERENCE_ARTWORK[conference]
    api = (
        "https://commons.wikimedia.org/w/api.php?action=query&prop=imageinfo&iiprop=url|sha1"
        f"&format=json&titles=File:{title}"
    )
    info = next(iter(json.loads(_get(api)[0])["query"]["pages"].values()))["imageinfo"][0]
    source = info["url"].split("?")[0]
    data, content_type, modified = _get(source)
    assert content_type == "image/png" and data.startswith(PNG_MAGIC), source
    assert len(data) <= MAX_BYTES and hashlib.sha1(data).hexdigest() == info["sha1"], source
    image = Image.open(io.BytesIO(data)).convert("RGBA")
    image = image.crop(image.getbbox())
    width = round(image.width * CONFERENCE_HEIGHT / image.height)
    image = image.resize((width, CONFERENCE_HEIGHT), Image.Resampling.LANCZOS)
    out = io.BytesIO()
    image.save(out, format="PNG", optimize=True)
    asset, digest = _store(f"{conference.lower()}ern-conference", out.getvalue(), "png")
    return {
        "conference": conference,
        "artwork_name": f"{conference}ern Conference",
        "asset": asset,
        "sha256": digest,
        "bytes": len(out.getvalue()),
        "width": width,
        "height": CONFERENCE_HEIGHT,
        "source_url": source,
        "source_page": f"https://commons.wikimedia.org/wiki/File:{title}",
        "last_modified": modified,
        "source_sha256": hashlib.sha256(data).hexdigest(),
        "derivation": CONFERENCE_DERIVATION,
    }


def _bbref_code(franchise_id: str, season: str) -> str:
    era = next((e for e in TEAM_ERAS if e.franchise_id == franchise_id and e.covers(season)), None)
    if era is not None:
        return era.code
    tricode = NBA_TEAMS[franchise_id].tricode
    return BBREF_CODES.get(tricode, tricode)


def _bbref_logo(version: str, code: str, year: int, cache: Path) -> tuple[str, bytes | None]:
    """One season's logo, from the local cache when an earlier run fetched it; None when the
    source has none (a 404, remembered as an empty cache file)."""
    url = BBREF_LOGO.format(version=version, code=code, year=year)
    path = cache / f"{code}-{year}.png"
    if not path.exists():
        try:
            data, content_type, _ = _get(url)
        except HTTPError as error:
            if error.code != 404:
                raise
            path.write_bytes(b"")
            time.sleep(1)
            return url, None
        assert content_type == "image/png" and data.startswith(PNG_MAGIC), url
        assert len(data) <= MAX_BYTES, url
        path.write_bytes(data)
        time.sleep(1)
    return url, path.read_bytes() or None


def _season_logo_records(
    catalog: dict[str, object], first: int, last: int, current_year: int, cache: Path
) -> list[dict[str, object]]:
    """Every franchise-season's logo from ``first`` to ``last`` (start years), grouped into spans
    of identical artwork. A season the source has no logo for gets no span.

    A span whose logo is the franchise's current one (``current_year``'s) uses NBA.com's SVG; one
    matching an era's artwork uses that; any other gets one background-cleared
    Basketball-Reference PNG per distinct logo.
    """
    version = _logo_version()
    cache.mkdir(parents=True, exist_ok=True)
    teams = {str(t["team_id"]): t for t in catalog["teams"]}  # type: ignore[union-attr]
    eras = catalog["eras"]  # type: ignore[index]
    latest = f"{current_year}-{str(current_year + 1)[-2:]}"
    stand_ins: dict[str, dict[str, object]] = {}
    for code, year in ERA_SVG_SEASONS.items():
        record = next(e for e in eras if e["code"] == code)  # type: ignore[union-attr]
        logo = _bbref_logo(version, code, year, cache)[1]
        assert logo is not None, code
        stand_ins[hashlib.sha256(logo).hexdigest()] = record
    for era in eras:  # type: ignore[union-attr]
        if "source_sha256" in era:
            stand_ins.setdefault(str(era["source_sha256"]), era)
    records: list[dict[str, object]] = []
    for franchise_id, team in teams.items():
        code = _bbref_code(franchise_id, latest)
        current = _bbref_logo(version, code, current_year + 1, cache)[1]
        assert current is not None, code
        current_hash = hashlib.sha256(current).hexdigest()
        spans: list[dict[str, object]] = []
        for start in range(first, last + 1):
            season = f"{start}-{str(start + 1)[-2:]}"
            if not franchise_active(franchise_id, season):
                continue
            code = _bbref_code(franchise_id, season)
            url, data = _bbref_logo(version, code, start + 1, cache)
            if data is None:
                continue
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


def _merge_spans(
    kept: list[dict[str, object]], fetched: list[dict[str, object]], first: int, last: int
) -> list[dict[str, object]]:
    """Replace the spans inside ``first``..``last`` with ``fetched`` and keep the rest, joining
    a franchise's spans that meet with the same logo (1999-00 into 2000-01)."""

    def start(span: dict[str, object], key: str) -> int:
        return int(str(span[key])[:4])

    outside = [
        s for s in kept if start(s, "last_season") < first or start(s, "first_season") > last
    ]
    assert all(
        start(s, "first_season") > last or start(s, "last_season") < first for s in outside
    ), "a kept span straddles the fetched range"
    merged: list[dict[str, object]] = []
    for span in sorted(
        [*outside, *fetched], key=lambda s: (str(s["franchise_id"]), start(s, "first_season"))
    ):
        previous = merged[-1] if merged else None
        if (
            previous
            and previous["franchise_id"] == span["franchise_id"]
            and previous["source_sha256"] == span["source_sha256"]
            and start(previous, "last_season") + 1 == start(span, "first_season")
        ):
            previous["last_season"] = span["last_season"]
            continue
        merged.append(dict(span))
    return merged


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
        "--acquire-conferences",
        action="store_true",
        help="Fetch the East and West conference marks and rewrite the conference records",
    )
    parser.add_argument(
        "--first-season", type=int, default=2000, help="Start year of the first season"
    )
    parser.add_argument(
        "--last-season", type=int, default=2025, help="Start year of the last season"
    )
    parser.add_argument(
        "--current-season",
        type=int,
        default=2025,
        help="Start year of the season whose logo is each franchise's current one",
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
        fetched = _season_logo_records(
            catalog, args.first_season, args.last_season, args.current_season, cache
        )
        catalog["season_logos"] = _merge_spans(
            catalog.get("season_logos", []), fetched, args.first_season, args.last_season
        )
        catalog["season_logos_semantics"] = (
            "Each franchise's logo by season (Basketball-Reference team-season logos), grouped "
            "into spans; 'current' and 'era' spans reuse the sharper NBA.com and Wikipedia SVGs."
        )
        CATALOG.write_text(json.dumps(catalog, indent=2, ensure_ascii=False) + "\n")
    if args.acquire_conferences:
        catalog = json.loads(CATALOG.read_text())
        catalog["conferences"] = [_acquire_conference(name) for name in CONFERENCE_ARTWORK]
        catalog["conferences_semantics"] = (
            "The NBA's Eastern and Western Conference marks (2018 wordmarks), for conference "
            "filters. Source: Wikimedia Commons file pages."
        )
        CATALOG.write_text(json.dumps(catalog, indent=2, ensure_ascii=False) + "\n")
    catalog = json.loads(CATALOG.read_text())
    assert len(catalog["teams"]) == len(NBA_TEAMS) == 30
    eras = catalog.get("eras", [])
    assert len(eras) == len(TEAM_ERAS)
    for record in [
        *catalog["teams"],
        *(era for era in eras if "asset" in era),
        *catalog.get("season_logos", []),
        *catalog.get("conferences", []),
    ]:
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
                        if "asset" in r
                    }
                ),
                "season_spans": len(catalog.get("season_logos", [])),
                "total_bytes": sum(
                    (PUBLIC / asset.lstrip("/")).stat().st_size
                    for asset in {
                        r["asset"]
                        for r in [*catalog["teams"], *eras, *catalog.get("season_logos", [])]
                        if "asset" in r
                    }
                ),
            }
        )
    )


if __name__ == "__main__":
    main()
