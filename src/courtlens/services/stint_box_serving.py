"""Sealed stint box artifacts, keyed by the IM03 bundle a stint dataset was admitted from."""

from __future__ import annotations

import argparse
import json
from functools import lru_cache
from pathlib import Path
from typing import Any

from courtlens.config import get_settings
from courtlens.domain.stint_box import VERSION
from courtlens.evaluation.impact_rating_inputs import write_artifact
from courtlens.ingestion.native_reconstruction import content_hash


@lru_cache(maxsize=8)
def _artifact(path: str, digest: str) -> dict[str, Any]:
    body: dict[str, Any] = json.loads(Path(path).read_bytes())
    # File names are content addresses; a changed artifact is unavailable, not trusted.
    if content_hash(body) != digest or body.get("version") != VERSION:
        raise ValueError("stint box artifact changed")
    return body


@lru_cache(maxsize=2)
def _manifest(path: str) -> dict[str, Any]:
    body: dict[str, Any] = json.loads(Path(path).read_bytes())
    if content_hash(body) != Path(path).stem or body.get("version") != VERSION:
        raise ValueError("stint box manifest changed")
    return body


def stint_box_games(bundle_content_sha256: str | None) -> dict[str, Any] | None:
    """Per-game stint boxes for a bundle, or None when none is installed or it fails its hash."""
    path = get_settings().stint_box_manifest
    if bundle_content_sha256 is None or path is None or not path.exists():
        return None
    try:
        entry = _manifest(str(path))["artifacts"].get(bundle_content_sha256)
        if entry is None:
            return None
        body = _artifact(str(path.parent.parent / Path(entry["path"]).name), entry["sha256"])
    except (ValueError, OSError, KeyError):
        return None
    if body["bundle_content_sha256"] != bundle_content_sha256:
        return None
    games: dict[str, Any] = body["games"]
    return games


def write_manifest(receipt_path: Path, output_root: Path) -> tuple[Path, str]:
    """Index a completed runner receipt's artifacts by bundle hash."""
    receipt = json.loads(receipt_path.read_text())
    if receipt.get("limit") is not None:
        raise ValueError("a limited trial receipt cannot be installed")
    manifest = {
        "version": VERSION,
        "receipt_sha256": receipt["content_sha256"],
        "artifacts": {
            a["bundle_content_sha256"]: {
                "sha256": a["sha256"],
                "path": Path(a["path"]).name,
                "season": a["season"],
                "phase": a["phase"],
            }
            for a in receipt["artifacts"]
        },
    }
    return write_artifact(output_root / "manifest", manifest)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--receipt", type=Path, required=True)
    parser.add_argument("--output", type=Path, default=Path("data/derived/stint-box-v1"))
    args = parser.parse_args()
    path, digest = write_manifest(args.receipt, args.output)
    print(json.dumps({"manifest": str(path), "sha256": digest}))


if __name__ == "__main__":
    main()
