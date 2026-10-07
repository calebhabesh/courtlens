"""Deterministic serialization and immutable local artifact writes."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any

from courtlens.evaluation.config import canonical_json


def sha256_bytes(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest()


def json_bytes(value: Any) -> bytes:
    return (json.dumps(value, indent=2, sort_keys=True, default=str) + "\n").encode()


def jsonl_bytes(rows: list[dict[str, Any]]) -> bytes:
    return ("\n".join(canonical_json(row) for row in rows) + "\n").encode()


def write_once(path: Path, payload: bytes) -> str:
    """Create an artifact, or verify an existing immutable artifact is identical."""
    if path.exists():
        existing = path.read_bytes()
        if existing != payload:
            raise RuntimeError(f"refusing to overwrite changed evaluation artifact: {path}")
    else:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(payload)
    return sha256_bytes(payload)
