"""Per-team play-by-play extras for team-filtered Stats rows (scripts/build_impact_team_splits.py).

Sealed extras are one row per player-season, so a team-filtered Stats query used to drop them.
This sidecar holds the same extras aggregated per (player, team), keyed by the sealed extras
artifact each splits. A missing or changed sidecar leaves team-filtered extras unknown.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any

from courtlens.config import get_settings
from courtlens.services.served_bundle import resolve

VERSION = "courtlens-impact-team-splits-v1"

_verified: dict[Path, tuple[tuple[int, int, int], dict[str, Any]]] = {}


def load_team_splits() -> tuple[str, dict[str, Any]] | None:
    """(content address, body) of the installed sidecar, or None when absent or changed."""
    path = resolve(get_settings().impact_team_splits_manifest)
    if path is None or not path.exists():
        return None
    stat = path.stat()
    signature = (stat.st_ino, stat.st_size, stat.st_mtime_ns)
    cached = _verified.get(path)
    if cached and cached[0] == signature:
        return path.stem, cached[1]
    raw = path.read_bytes()
    # The file name is the content address; a changed file is never served.
    if hashlib.sha256(raw).hexdigest() != path.stem:
        return None
    body: dict[str, Any] = json.loads(raw)
    if body.get("version") != VERSION:
        return None
    _verified[path] = (signature, body)
    return path.stem, body


def team_split(extras_sha256: str) -> tuple[str, dict[str, Any]] | None:
    """The sidecar address and per-player, per-team rows splitting one extras artifact."""
    loaded = load_team_splits()
    if loaded is None:
        return None
    address, body = loaded
    entry = body["entries"].get(extras_sha256)
    return (address, entry["players"]) if entry else None
