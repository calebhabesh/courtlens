"""Acquisition and local content-addressing for SportsDataverse NBA Stats assets."""

from __future__ import annotations

import hashlib
import json
import os
import tempfile
import time
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import httpx

from courtload.ingestion.workbench_source_config import (
    ADMITTED_SEASONS,
    canonical_season_name,
    player_boxscores_url,
    raw_schedule_json_url,
    schedule_csv_url,
    team_boxscores_url,
)

MAX_DOWNLOAD_BYTES: int = 50_000_000
MAX_DOWNLOAD_SECONDS: float = 120.0
USER_AGENT: str = "CourtLoad-workbench/1.0"


def hash_file(path: Path) -> tuple[str, int]:
    """Compute sha256 digest and byte size of a file."""
    digest = hashlib.sha256()
    size = 0
    with path.open("rb") as stream:
        while chunk := stream.read(1024 * 1024):
            size += len(chunk)
            digest.update(chunk)
    return digest.hexdigest(), size


def acquire_file(
    url: str,
    destination: Path,
    *,
    expected_sha256: str | None = None,
    max_bytes: int = MAX_DOWNLOAD_BYTES,
    timeout_seconds: float = MAX_DOWNLOAD_SECONDS,
    client: httpx.Client | None = None,
) -> dict[str, Any]:
    """Download a source file atomically, checking size and content digest."""
    destination.parent.mkdir(parents=True, exist_ok=True)
    if destination.exists():
        existing_sha, size = hash_file(destination)
        if expected_sha256 is None or existing_sha == expected_sha256:
            return {
                "url": url,
                "path": str(destination),
                "bytes": size,
                "sha256": existing_sha,
                "reused": True,
            }
        raise ValueError(
            f"Existing file {destination} hash {existing_sha} "
            f"does not match expected {expected_sha256}"
        )

    descriptor, temp_path_str = tempfile.mkstemp(
        prefix=f".{destination.name}.", dir=destination.parent
    )
    temp_path = Path(temp_path_str)
    try:
        digest = hashlib.sha256()
        size = 0
        deadline = time.monotonic() + timeout_seconds

        owns_client = client is None
        http = client or httpx.Client(
            follow_redirects=True, timeout=30.0, headers={"User-Agent": USER_AGENT}
        )
        try:
            with http.stream("GET", url) as response:
                if response.status_code != 200:
                    raise httpx.HTTPStatusError(
                        f"Failed to download {url}: HTTP {response.status_code}",
                        request=response.request,
                        response=response,
                    )
                with os.fdopen(descriptor, "wb") as output:
                    for chunk in response.iter_bytes(chunk_size=1024 * 1024):
                        if time.monotonic() > deadline:
                            msg = f"Download of {url} exceeded timeout {timeout_seconds}s"
                            raise TimeoutError(msg)
                        size += len(chunk)
                        if size > max_bytes:
                            raise ValueError(
                                f"Download of {url} exceeded maximum size {max_bytes} bytes"
                            )
                        output.write(chunk)
                        digest.update(chunk)
                    output.flush()
                    os.fsync(output.fileno())
        finally:
            if owns_client:
                http.close()

        actual_sha = digest.hexdigest()
        if expected_sha256 is not None and actual_sha != expected_sha256:
            raise ValueError(f"Downloaded {url} SHA mismatch: {actual_sha} != {expected_sha256}")

        os.replace(temp_path, destination)
        return {
            "url": url,
            "path": str(destination),
            "bytes": size,
            "sha256": actual_sha,
            "reused": False,
        }
    finally:
        if temp_path.exists():
            temp_path.unlink()


def acquire_season_assets(
    ending_year: int,
    raw_root: Path,
    *,
    client: httpx.Client | None = None,
) -> dict[str, Any]:
    """Acquire and verify all assets for a given season ending year into raw_root."""
    cfg = ADMITTED_SEASONS.get(ending_year)
    season_name = canonical_season_name(ending_year)
    season_dir = raw_root / f"sportsdataverse_{ending_year}"
    season_dir.mkdir(parents=True, exist_ok=True)

    acquired_files: dict[str, dict[str, Any]] = {}

    if cfg is None or cfg.has_player_boxscores:
        url = player_boxscores_url(ending_year)
        dest = season_dir / f"player_boxscores_{ending_year}.csv"
        acquired_files["player_boxscores"] = acquire_file(url, dest, client=client)

    if cfg is None or cfg.has_team_boxscores:
        url = team_boxscores_url(ending_year)
        dest = season_dir / f"team_boxscores_{ending_year}.csv"
        acquired_files["team_boxscores"] = acquire_file(url, dest, client=client)

    if cfg is None or cfg.has_schedule_csv:
        url = schedule_csv_url(ending_year)
        dest = season_dir / f"nba_schedule_{ending_year}.csv.gz"
        acquired_files["schedule"] = acquire_file(url, dest, client=client)

    if cfg is not None and cfg.has_raw_schedule_json:
        url = raw_schedule_json_url(ending_year)
        dest = season_dir / f"schedule_{ending_year}.json"
        acquired_files["raw_schedule_json"] = acquire_file(url, dest, client=client)

    manifest_path = season_dir / "retrieval-manifest.json"
    manifest: dict[str, Any] = {
        "source": "sportsdataverse/sportsdataverse-data",
        "ending_year": ending_year,
        "canonical_season": season_name,
        "acquired_at_utc": datetime.now(UTC).isoformat(),
        "license_declared": "CC BY 4.0; underlying NBA data rights unverified",
        "files": acquired_files,
    }
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    return manifest
