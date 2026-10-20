"""Which content-addressed bundle a directory serves: a pinned file, `.current`, or the only one.

Impact serving and team splits were pinned to one file. The weekly provisional run writes a new
bundle and moves `.current` to it (`install`); an explicit file path in config still pins one.
Pruned bundles are aliased to the bundle that replaced them (`.aliases.json`), so a pin to a
pruned weekly bundle resolves; its sealed seasons are carried verbatim, its provisional season
is the newer run's.
"""

from __future__ import annotations

import json
import os
from pathlib import Path

CURRENT = ".current"
ALIASES = ".aliases.json"


def _read(path: Path) -> dict[str, str]:
    try:
        value = json.loads(path.read_text())
    except (OSError, ValueError):
        return {}
    return value if isinstance(value, dict) else {}


def _write(path: Path, value: dict[str, str]) -> None:
    tmp = path.with_name(f"{path.name}.tmp")
    tmp.write_text(json.dumps(value, sort_keys=True))
    os.replace(tmp, path)


def resolve(configured: Path | None, sha256: str | None = None) -> Path | None:
    """The bundle to read: a pinned hash, else the configured file, `.current` or the only one."""
    if configured is None:
        return None
    directory = configured if configured.is_dir() else configured.parent
    if sha256:
        path = directory / f"{sha256}.json"
        if not path.exists() and sha256 in (aliases := _read(directory / ALIASES)):
            path = directory / f"{aliases[sha256]}.json"
        return path
    if not configured.is_dir():
        return configured
    current = _read(configured / CURRENT).get("manifest_sha256")
    if current:
        return configured / f"{current}.json"
    bundles = list(configured.glob("[0-9a-f]*.json"))
    return bundles[0] if len(bundles) == 1 else None


def install(directory: Path, path: Path) -> None:
    """Serve `path` from now on (an atomic pointer swap)."""
    _write(directory / CURRENT, {"manifest_sha256": path.stem})


def prune(directory: Path, keep: set[str]) -> list[str]:
    """Delete bundles not in `keep`, aliasing each to the current bundle."""
    current = _read(directory / CURRENT).get("manifest_sha256")
    if not current:
        return []
    keep = keep | {current}
    aliases = _read(directory / ALIASES)
    removed = []
    for path in directory.glob("[0-9a-f]*.json"):
        if path.stem not in keep:
            aliases[path.stem] = current
            path.unlink()
            removed.append(path.stem)
    if removed:
        gone = set(removed)
        _write(
            directory / ALIASES,
            {old: current if new in gone else new for old, new in aliases.items()},
        )
    return removed
