from __future__ import annotations

import hashlib
import json
import os
import re
import tempfile
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class StoredObject:
    checksum: str
    uri: str
    canonical_bytes: bytes


class RawStore:
    """Content-addressed immutable JSON storage on a local or mounted volume."""

    def __init__(self, root: Path) -> None:
        self.root = root

    @staticmethod
    def canonicalize(payload: dict[str, Any]) -> bytes:
        return json.dumps(
            payload,
            sort_keys=True,
            separators=(",", ":"),
            ensure_ascii=False,
            default=str,
        ).encode("utf-8")

    @staticmethod
    def safe_component(value: str) -> str:
        return re.sub(r"[^a-zA-Z0-9_.-]", "_", value)[:180]

    def put(
        self,
        *,
        source: str,
        resource: str,
        source_key: str,
        payload: dict[str, Any],
        fetched_at: datetime | None = None,
    ) -> StoredObject:
        # Kept in the interface because fetch time belongs in relational lineage, not the
        # immutable object address. Identical content must resolve to the same path on any day.
        del fetched_at
        canonical = self.canonicalize(payload)
        checksum = hashlib.sha256(canonical).hexdigest()
        relative = Path(self.safe_component(source)) / self.safe_component(resource)
        relative /= checksum[:2]
        relative /= f"{self.safe_component(source_key)}--{checksum}.json"
        destination = self.root / relative
        destination.parent.mkdir(parents=True, exist_ok=True)

        if not destination.exists():
            descriptor, temporary_name = tempfile.mkstemp(
                prefix=f".{destination.name}.", dir=destination.parent
            )
            try:
                with os.fdopen(descriptor, "wb") as handle:
                    handle.write(canonical)
                    handle.flush()
                    os.fsync(handle.fileno())
                os.replace(temporary_name, destination)
            finally:
                if os.path.exists(temporary_name):
                    os.unlink(temporary_name)

        return StoredObject(checksum=checksum, uri=str(relative), canonical_bytes=canonical)
