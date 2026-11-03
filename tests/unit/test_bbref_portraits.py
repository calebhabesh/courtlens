import hashlib
import io
from pathlib import Path

import httpx
import numpy as np
import pytest
from fastapi.testclient import TestClient
from PIL import Image, ImageDraw
from sqlalchemy import Engine, select
from sqlalchemy.orm import Session

from courtlens.config import get_settings
from courtlens.models import utc_now
from courtlens.services import bbref_portraits, portrait_derivatives
from courtlens.services.bbref_portraits import (
    BBREF_PORTRAIT_SOURCE,
    acquire_bbref_portraits,
    cut_out,
    headshot_url,
    prefers_bbref,
    recut_bbref_portraits,
)
from courtlens.workbench_models import PlayerPortrait

KIDD = "https://www.basketball-reference.com/req/202610080/images/headshots/kiddja01.jpg"


def _jpeg() -> bytes:
    """A white studio frame with a dark head and a white jersey below the shoulders."""
    image = Image.new("RGB", (120, 180), (255, 255, 255))
    draw = ImageDraw.Draw(image)
    draw.ellipse((35, 20, 85, 85), fill=(120, 80, 60))
    draw.rectangle((10, 120, 110, 180), fill=(40, 40, 120))
    draw.rectangle((30, 130, 90, 180), fill=(250, 250, 250))
    buffer = io.BytesIO()
    image.save(buffer, format="JPEG", quality=95)
    return buffer.getvalue()


def test_headshot_url_is_the_players_own_photo() -> None:
    page = (
        b'<img src="https://www.basketball-reference.com/req/1/images/headshots/nashst01.jpg">'
        + f'<img itemscope="image" src="{KIDD}">'.encode()
    )
    assert headshot_url(page, "kiddja01") == KIDD
    assert headshot_url(page, "mariosh01") is None


def test_cut_out_clears_the_studio_background_but_keeps_a_white_jersey() -> None:
    with Image.open(io.BytesIO(cut_out(_jpeg()))) as image:
        alpha = image.getchannel("A")
        assert image.mode == "RGBA"
        assert alpha.getpixel((5, 5)) == 0  # background corner
        assert alpha.getpixel((60, 50)) == 255  # face
        assert alpha.getpixel((60, 170)) == 255  # white jersey enclosed by the darker shirt


def test_cut_out_mattes_the_outline_without_a_white_halo() -> None:
    with Image.open(io.BytesIO(cut_out(_jpeg()))) as image:
        rgba = np.asarray(image).astype(int)
    alpha = rgba[..., 3]
    edge = (alpha > 0) & (alpha < 255)
    assert edge.any()  # the head's outline fades instead of stopping hard
    # Outline pixels carry the subject's colour, not the white they were mixed with.
    assert rgba[edge][:, :3].min(axis=1).max() < 200


def test_recut_replaces_the_derived_png_from_the_retained_original(
    test_engine: Engine, session: Session, tmp_path: Path
) -> None:
    jpeg = _jpeg()
    original = hashlib.sha256(jpeg).hexdigest()
    (tmp_path / "bbref").mkdir()
    (tmp_path / "bbref" / f"{original}.jpg").write_bytes(jpeg)
    session.add(
        PlayerPortrait(player_id="467", source_name=BBREF_PORTRAIT_SOURCE, content_sha256="0" * 64,
                       storage_path="old.png", mime_type="image/png", bytes=1,
                       attribution=f"x; {KIDD}; original sha256 {original}", status="active",
                       acquired_at=utc_now())
    )  # fmt: skip
    session.commit()
    assert recut_bbref_portraits(test_engine, tmp_path) == 1
    session.expire_all()
    row = session.scalars(select(PlayerPortrait)).one()
    assert Path(row.storage_path).read_bytes() == cut_out(jpeg)
    assert recut_bbref_portraits(test_engine, tmp_path) == 0


def test_only_post_career_nba_photos_put_the_career_photo_first() -> None:
    assert prefers_bbref("959")  # Nash: NBA.com shows him as a coach
    assert not prefers_bbref("1495")  # Duncan: NBA.com shows him in a Spurs jersey


def test_acquire_stores_the_original_and_cut_out_and_stops_on_refusal(
    test_engine: Engine, session: Session, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    targets = [("467", "kiddja01", KIDD), ("959", "nashst01", KIDD.replace("kiddja01", "nashst01")),
               ("1890", "mariosh01", KIDD.replace("kiddja01", "mariosh01"))]  # fmt: skip
    monkeypatch.setattr(bbref_portraits, "portrait_targets", lambda _session, _root: targets)

    def handle(request: httpx.Request) -> httpx.Response:
        if "nashst01" in request.url.path:
            return httpx.Response(429)
        return httpx.Response(200, content=_jpeg(), headers={"content-type": "image/jpeg"})

    with httpx.Client(transport=httpx.MockTransport(handle)) as client:
        summary = acquire_bbref_portraits(
            test_engine, tmp_path, tmp_path, client=client, interval_seconds=0
        )
    assert (summary.acquired, summary.stopped) == (1, "HTTP 429 at nashst01; rerun later")
    row = session.scalars(select(PlayerPortrait)).one()
    assert (row.player_id, row.source_name) == ("467", BBREF_PORTRAIT_SOURCE)
    assert row.mime_type == "image/png"
    assert KIDD in row.attribution and len(list((tmp_path / "bbref").glob("*.jpg"))) == 1


def test_endpoint_prefers_nba_com_unless_its_photo_is_post_career(
    api_client: TestClient, session: Session, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(get_settings(), "portraits_cache_path", tmp_path)
    portrait_derivatives._memory.clear()
    nba, career = tmp_path / "coach.png", tmp_path / "career.png"
    Image.new("RGBA", (1040, 760), (1, 1, 1, 255)).save(nba)
    Image.new("RGBA", (120, 180), (2, 2, 2, 255)).save(career)
    session.add_all([
        PlayerPortrait(player_id="959", source_name="nba_cdn_1040x760", content_sha256="a" * 64,
                       storage_path=str(nba), mime_type="image/png", bytes=1, status="active",
                       attribution="NBA CDN"),
        PlayerPortrait(player_id="959", source_name=BBREF_PORTRAIT_SOURCE, content_sha256="b" * 64,
                       storage_path=str(career), mime_type="image/png", bytes=1, status="active",
                       attribution="Basketball-Reference.com"),
        PlayerPortrait(player_id="467", source_name=BBREF_PORTRAIT_SOURCE, content_sha256="c" * 64,
                       storage_path=str(career), mime_type="image/png", bytes=1, status="active",
                       attribution="Basketball-Reference.com"),
        PlayerPortrait(player_id="1495", source_name="nba_cdn_1040x760", content_sha256="d" * 64,
                       storage_path=str(nba), mime_type="image/png", bytes=1, status="active",
                       attribution="NBA CDN"),
        PlayerPortrait(player_id="1495", source_name=BBREF_PORTRAIT_SOURCE,
                       content_sha256="e" * 64, storage_path=str(career), mime_type="image/png",
                       bytes=1, status="active", attribution="Basketball-Reference.com"),
    ])  # fmt: skip
    session.commit()

    def served(player: str, **params: str) -> bytes:
        response = api_client.get(f"/api/workbench/players/{player}/portrait", params=params)
        assert response.status_code == 200
        return response.content

    # Nash: NBA.com's photo is from his coaching years, so his playing photo everywhere.
    assert served("959", season="2005-06") == career.read_bytes()
    assert served("959") == career.read_bytes()
    # Duncan: NBA.com's sharper photo is a playing photo, so it comes first even for 2000-01.
    assert served("1495", season="2000-01") == nba.read_bytes()
    # Kidd: NBA.com has nothing, so the career photo is the last resort everywhere.
    assert served("467") == career.read_bytes()
