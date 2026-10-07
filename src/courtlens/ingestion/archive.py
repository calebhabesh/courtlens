"""Pinned, bounded acquisition of the candidate historical CSV archive."""

from __future__ import annotations

import hashlib
import json
import os
import tempfile
import time
import urllib.request
from datetime import UTC, datetime
from pathlib import Path

REVISION = "a5f108b5b1f08074d78b9e8e901926a9ce4c06c5"
SOURCE = "NocturneBear/NBA-Data-2010-2024"
FILES = {
    "regular_season_box_scores_2010_2024_part_1.csv": 22_567_190,
    "regular_season_box_scores_2010_2024_part_2.csv": 22_717_782,
    "regular_season_box_scores_2010_2024_part_3.csv": 22_493_295,
    "regular_season_totals_2010_2024.csv": 9_130_719,
}
SHA256 = {
    "regular_season_box_scores_2010_2024_part_1.csv": (
        "ca9636d08c577e3d752f69e32f90b173f4c3374c15f4dc8494b655049fdfc557"
    ),
    "regular_season_box_scores_2010_2024_part_2.csv": (
        "5643af8a9f15ce3540dced759375ca79e77c71644e23270136f23b7a57fc182d"
    ),
    "regular_season_box_scores_2010_2024_part_3.csv": (
        "65a01fee3df865a272e578cf4b365dce7dbc62eef2ce6f15f0844cf6694ef375"
    ),
    "regular_season_totals_2010_2024.csv": (
        "b63367be8c58155f978c841bb966f5b19e334cec833a37ddae2915a29cd352d9"
    ),
}
MAX_FILE_BYTES = 30_000_000
MAX_DOWNLOAD_SECONDS = 300


def acquire_file(
    name: str, destination: Path, *, local_source: Path | None = None
) -> dict[str, str | int]:
    """Copy/download a complete pinned file, atomically installing it after size checks."""
    if name not in FILES:
        raise ValueError(f"Unknown archive file: {name}")
    url = f"https://raw.githubusercontent.com/{SOURCE}/{REVISION}/{name}"
    expected_bytes = FILES[name]
    destination.parent.mkdir(parents=True, exist_ok=True)
    if destination.exists():
        existing_digest, size = hash_file(destination)
        if size == expected_bytes and existing_digest == SHA256[name]:
            return {"file": name, "url": url, "bytes": size, "sha256": existing_digest}
        raise ValueError(f"Existing {destination} does not match the pinned size and SHA-256")

    descriptor, temporary_name = tempfile.mkstemp(prefix=f".{name}.", dir=destination.parent)
    try:
        digest = hashlib.sha256()
        size = 0
        deadline = time.monotonic() + MAX_DOWNLOAD_SECONDS
        with os.fdopen(descriptor, "wb") as output:
            if local_source is None:
                request = urllib.request.Request(
                    url, headers={"User-Agent": "CourtLens-source-spike/1"}
                )
                stream = urllib.request.urlopen(request, timeout=30)
            else:
                stream = local_source.open("rb")
            with stream:
                while True:
                    if time.monotonic() > deadline:
                        raise TimeoutError(f"{name} exceeded download time limit")
                    chunk = stream.read(1024 * 1024)
                    if not chunk:
                        break
                    size += len(chunk)
                    if size > MAX_FILE_BYTES or size > expected_bytes:
                        raise ValueError(f"{name} exceeds declared size or safety limit")
                    output.write(chunk)
                    digest.update(chunk)
            output.flush()
            os.fsync(output.fileno())
        if size != expected_bytes:
            raise ValueError(f"Incomplete {name}: {size} bytes; expected {expected_bytes}")
        if digest.hexdigest() != SHA256[name]:
            raise ValueError(f"{name} SHA-256 differs from pinned archive")
        os.replace(temporary_name, destination)
        return {"file": name, "url": url, "bytes": size, "sha256": digest.hexdigest()}
    finally:
        if os.path.exists(temporary_name):
            os.unlink(temporary_name)


def hash_file(path: Path) -> tuple[str, int]:
    digest = hashlib.sha256()
    size = 0
    with path.open("rb") as stream:
        while chunk := stream.read(1024 * 1024):
            size += len(chunk)
            digest.update(chunk)
    return digest.hexdigest(), size


def acquire_archive(destination: Path, *, local_source: Path | None = None) -> Path:
    """Write a retrieval manifest for four independently verified complete files."""
    files = [
        acquire_file(
            name, destination / name, local_source=local_source / name if local_source else None
        )
        for name in FILES
    ]
    manifest_path = destination / "retrieval-manifest.json"
    if manifest_path.exists():
        prior = json.loads(manifest_path.read_text())
        if prior.get("revision") == REVISION and prior.get("files") == files:
            return manifest_path
        raise ValueError("Existing retrieval manifest differs from pinned archive")
    manifest = {
        "source": SOURCE,
        "revision": REVISION,
        "retrieved_at_utc": datetime.now(UTC).isoformat(),
        "license_declared": "MIT; underlying data rights unverified",
        "files": files,
    }
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")
    return manifest_path
