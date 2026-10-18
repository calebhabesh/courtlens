"""Display-sized player portraits derived from the cached NBA CDN headshot.

The CDN headshot is a 1040x760 transparent cut-out with the head near the top centre and wide
empty margins. Shrinking it ~30x in the browser into a 30px avatar aliases badly and leaves the
face a dozen pixels wide. This module frames the head and shoulders in a square and resamples
it once, with Lanczos, to an allowlisted pixel size so the browser only resizes slightly.

Derivatives are a rebuildable cache keyed by the source content hash: written beside the
originals when the directory is writable, otherwise (the read-only hosted demo) kept in memory.
"""

from __future__ import annotations

import io
import logging
import os
from collections import OrderedDict
from pathlib import Path
from threading import Lock

import numpy as np
from PIL import Image
from scipy import ndimage  # type: ignore[import-untyped]

logger = logging.getLogger(__name__)

# Bump when the crop or encoding changes so cached derivatives are not reused, together with
# PORTRAIT_CROP_VERSION in dashboard/lib/portrait-source.ts, which puts it in the portrait URL
# so browsers (which keep a derivative for a day) fetch the new crop.
PORTRAIT_CROP_VERSION = "face-v2"
# Covers 28-144px avatars at 1x-2x device pixel ratios.
PORTRAIT_SIZES = (64, 96, 128, 192, 288)
PORTRAIT_DERIVATIVE_MIME = "image/webp"

# Rows below the top of the head that contain the head but not the shoulders, and the square's
# side and headroom relative to the head width. Tuned on current CDN headshots so the circle
# shows the face with a band of jersey for team identity.
_HEAD_BAND = 0.29
_SIDE_PER_HEAD_WIDTH = 2.1
_HEADROOM = 0.05
# Head width relative to image height when the image has no transparency to measure.
_DEFAULT_HEAD_WIDTH = 0.43
# CDN headshots put the head within ~3% of the horizontal centre. A head found further off was
# thrown by a stray speck (a couple of opaque pixels in a corner), so it is measured again with
# opaque blobs under 1% of the largest one removed.
_MAX_CENTRE_DRIFT = 0.05
_OPAQUE = 128
_SPECK = 0.01

_MEMORY_LIMIT = 2048
_memory: OrderedDict[tuple[str, int], bytes] = OrderedDict()
_memory_lock = Lock()


def _head(alpha: Image.Image) -> tuple[int, int, int] | None:
    """(top, left, right) of the head: the subject's top rows, before the shoulders widen."""
    width, height = alpha.size
    subject = alpha.getbbox()
    if subject is None:
        return None
    top = subject[1]
    band = alpha.crop((0, top, width, min(height, top + round(height * _HEAD_BAND)))).getbbox()
    return None if band is None else (top, band[0], band[2])


def _without_specks(alpha: Image.Image) -> Image.Image:
    """The opaque silhouette without specks and stray marks far smaller than the player."""
    labels, count = ndimage.label(np.asarray(alpha) >= _OPAQUE, structure=np.ones((3, 3)))
    if count == 0:
        return Image.new("L", alpha.size, 0)
    sizes = np.bincount(labels.ravel())
    sizes[0] = 0
    keep = sizes >= sizes.max() * _SPECK
    return Image.fromarray(np.where(keep[labels], 255, 0).astype(np.uint8))


def _centred(head: tuple[int, int, int] | None, width: int) -> bool:
    return (
        head is not None and abs((head[1] + head[2]) / 2 - width / 2) <= width * _MAX_CENTRE_DRIFT
    )


def face_crop_box(image: Image.Image) -> tuple[int, int, int, int]:
    """Return a square (left, top, right, bottom) framing the head and upper shoulders."""
    width, height = image.size
    alpha = image.getchannel("A") if image.mode == "RGBA" else None
    head = _head(alpha) if alpha is not None else None
    if alpha is not None and head is not None and not _centred(head, width):
        head = _head(_without_specks(alpha))
        if not _centred(head, width):
            head = None
    if head is not None:
        head_top, head_left, head_right = head
        centre_x = (head_left + head_right) / 2
        head_width = head_right - head_left
    else:
        centre_x = width / 2
        head_width = round(height * _DEFAULT_HEAD_WIDTH)
        head_top = 0
    side = max(1, min(width, height, round(head_width * _SIDE_PER_HEAD_WIDTH)))
    left = min(max(0, round(centre_x - side / 2)), width - side)
    upper = min(max(0, round(head_top - side * _HEADROOM)), height - side)
    return left, upper, left + side, upper + side


def render_portrait(source: Path, size: int) -> bytes:
    """Crop and resample one headshot to a ``size`` x ``size`` WebP that keeps transparency."""
    with Image.open(source) as opened:
        image = opened.convert("RGBA")
    square = image.crop(face_crop_box(image))
    resized = square.resize((size, size), Image.Resampling.LANCZOS)
    buffer = io.BytesIO()
    resized.save(buffer, format="WEBP", quality=88, method=4)
    return buffer.getvalue()


def _remember(key: tuple[str, int], content: bytes) -> None:
    with _memory_lock:
        _memory[key] = content
        _memory.move_to_end(key)
        while len(_memory) > _MEMORY_LIMIT:
            _memory.popitem(last=False)


def portrait_derivative(source: Path, content_sha256: str, size: int, cache_dir: Path) -> bytes:
    """Return the cached derivative for a source headshot, rendering it on first request."""
    if size not in PORTRAIT_SIZES:
        raise ValueError(f"unsupported portrait size {size}")
    key = (content_sha256, size)
    with _memory_lock:
        cached = _memory.get(key)
    if cached is not None:
        return cached

    target = cache_dir / "derived" / f"{content_sha256}-{PORTRAIT_CROP_VERSION}-{size}.webp"
    if target.exists():
        content = target.read_bytes()
    else:
        content = render_portrait(source, size)
        try:
            target.parent.mkdir(parents=True, exist_ok=True)
            partial = target.with_suffix(f".{os.getpid()}.tmp")
            partial.write_bytes(content)
            partial.replace(target)
        except OSError as exc:
            logger.debug("Portrait derivative cache not writable (%s); keeping it in memory", exc)
    _remember(key, content)
    return content
