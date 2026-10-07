#!/usr/bin/env python3
"""Rewrite legacy environment keys, retaining a private backup and never logging values."""

from __future__ import annotations

import argparse
import os
import re
import shutil
import tempfile
from datetime import UTC, datetime
from pathlib import Path

LEGACY_PREFIX = "COURTLOAD_"
CURRENT_PREFIX = "COURTLENS_"
KEY = re.compile(r"^(\s*(?:export\s+)?)([A-Za-z_][A-Za-z0-9_]*)(\s*=)", re.MULTILINE)


def migrate(path: Path) -> list[tuple[str, str]]:
    if path.is_symlink():
        raise ValueError("Use the actual environment file path, rather than a symlink")
    original = path.read_bytes()
    text = original.decode("utf-8")
    keys = [match.group(2) for match in KEY.finditer(text)]
    changes = sorted(
        (key, key.replace(LEGACY_PREFIX, CURRENT_PREFIX, 1))
        for key in set(keys)
        if key.startswith((LEGACY_PREFIX, "NEXT_PUBLIC_" + LEGACY_PREFIX))
    )
    if not changes:
        return []
    collisions = [new for _, new in changes if new in keys]
    if collisions:
        raise ValueError(
            "Both old and new keys exist; resolve these keys first: " + ", ".join(collisions)
        )
    replacements = dict(changes)
    updated = KEY.sub(
        lambda match: (
            match.group(1) + replacements.get(match.group(2), match.group(2)) + match.group(3)
        ),
        text,
    )
    backup = path.with_name(path.name + ".bak-" + datetime.now(UTC).strftime("%Y%m%dT%H%M%S.%fZ"))
    shutil.copy2(path, backup)
    temporary: str | None = None
    try:
        with tempfile.NamedTemporaryFile(dir=path.parent, delete=False) as output:
            temporary = output.name
            output.write(updated.encode("utf-8"))
        os.chmod(temporary, path.stat().st_mode)
        os.replace(temporary, path)
    finally:
        if temporary is not None and os.path.exists(temporary):
            os.unlink(temporary)
    print(f"Backup kept: {backup}")
    for old, new in changes:
        print(f"{old} -> {new}")
    return changes


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("path", nargs="?", type=Path, default=Path(".env"))
    args = parser.parse_args()
    try:
        changes = migrate(args.path)
    except (OSError, ValueError) as error:
        parser.exit(1, f"Environment migration failed: {error}\n")
    if not changes:
        print("No legacy keys found; file unchanged.")


if __name__ == "__main__":
    main()
