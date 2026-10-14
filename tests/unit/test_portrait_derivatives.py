import io
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from PIL import Image, ImageDraw
from sqlalchemy.orm import Session

from courtlens.config import get_settings
from courtlens.services import portrait_derivatives
from courtlens.services.portrait_derivatives import face_crop_box, portrait_derivative
from courtlens.workbench_models import PlayerPortrait


def _headshot(path: Path, head_centre_x: int = 520) -> Path:
    """A transparent 1040x760 cut-out shaped like a CDN headshot: head on top, wide shoulders."""
    image = Image.new("RGBA", (1040, 760), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    draw.ellipse((head_centre_x - 165, 20, head_centre_x + 165, 480), fill=(200, 150, 120, 255))
    draw.rectangle((60, 500, 980, 760), fill=(20, 60, 160, 255))
    image.save(path)
    return path


@pytest.fixture(autouse=True)
def _empty_memory_cache() -> None:
    portrait_derivatives._memory.clear()


def test_crop_frames_the_head_not_the_canvas(tmp_path: Path) -> None:
    with Image.open(_headshot(tmp_path / "a.png", head_centre_x=470)) as image:
        left, top, right, bottom = face_crop_box(image.convert("RGBA"))
    assert right - left == bottom - top == 695  # 2.1 x the 331px head width
    assert (left + right) / 2 == pytest.approx(470, abs=1)
    assert 0 <= top < 20


def test_crop_without_transparency_uses_a_centred_square(tmp_path: Path) -> None:
    image = Image.new("RGB", (260, 190), (255, 255, 255))
    left, top, right, bottom = face_crop_box(image)
    assert right - left == bottom - top <= 190
    assert (left + right) / 2 == pytest.approx(130, abs=1)


def test_derivative_is_a_square_webp_cached_on_disk(tmp_path: Path) -> None:
    source = _headshot(tmp_path / "a.png")
    content = portrait_derivative(source, "f" * 64, 96, tmp_path)
    with Image.open(io.BytesIO(content)) as image:
        assert (image.format, image.size, image.mode) == ("WEBP", (96, 96), "RGBA")
    assert (tmp_path / "derived" / f"{'f' * 64}-face-v1-96.webp").read_bytes() == content


def test_derivative_falls_back_to_memory_when_cache_is_read_only(tmp_path: Path) -> None:
    source = _headshot(tmp_path / "a.png")
    blocked = tmp_path / "read-only"
    blocked.write_text("a file where the cache directory would go")
    first = portrait_derivative(source, "e" * 64, 64, blocked)
    source.unlink()  # A second render would fail; the memory copy must answer.
    assert portrait_derivative(source, "e" * 64, 64, blocked) == first


def test_derivative_rejects_sizes_outside_the_allowlist(tmp_path: Path) -> None:
    with pytest.raises(ValueError):
        portrait_derivative(_headshot(tmp_path / "a.png"), "d" * 64, 100, tmp_path)


def test_portrait_endpoint_serves_sized_derivatives(
    api_client: TestClient, session: Session, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(get_settings(), "portraits_cache_path", tmp_path)
    source = _headshot(tmp_path / "a.png")
    session.add(
        PlayerPortrait(
            player_id="100",
            source_name="nba_cdn_1040x760",
            content_sha256="c" * 64,
            storage_path=str(source),
            mime_type="image/png",
            bytes=source.stat().st_size,
            status="active",
            attribution="NBA CDN",
        )
    )
    session.commit()

    original = api_client.get("/api/workbench/players/100/portrait")
    assert original.status_code == 200
    assert original.headers["content-type"] == "image/png"

    sized = api_client.get("/api/workbench/players/100/portrait", params={"size": 128})
    assert sized.status_code == 200
    assert sized.headers["content-type"] == "image/webp"
    assert sized.headers["cache-control"] == "public, max-age=86400"
    with Image.open(io.BytesIO(sized.content)) as image:
        assert image.size == (128, 128)

    assert api_client.get("/api/workbench/players/100/portrait?size=100").status_code == 422
