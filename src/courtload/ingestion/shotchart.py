"""Bounded, revision-pinned source acquisition and streaming archive inspection."""

from __future__ import annotations

import csv
import io
import json
import lzma
import re
import tarfile
from collections.abc import Iterator
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from courtload.ingestion.sportsdataverse import acquire_file, hash_file

MAX_COMPRESSED_BYTES = 10 * 1024 * 1024
MAX_EXPANDED_BYTES = 64 * 1024 * 1024
MAX_ROWS = 300_000
MAX_FIELD_BYTES = 4096
DOCUMENTS = ("README.md", "description_fields.md", "LICENSE")


def archive_url(revision: str, starting_year: int, name: str | None = None) -> str:
    if not re.fullmatch(r"[0-9a-f]{40}", revision) or not 1996 <= starting_year <= 2099:
        raise ValueError("require full Git revision and supported NBA starting year")
    return (
        f"https://raw.githubusercontent.com/shufinskiy/nba_data/{revision}/"
        f"{name or f'datasets/shotdetail_{starting_year}.tar.xz'}"
    )


def acquire_source(root: Path, *, revision: str, starting_year: int) -> Path:
    """Create a new observation directory; refuse replacement or metadata backdating."""
    archive_url(revision, starting_year)
    root.mkdir(parents=True, exist_ok=False)
    assets = []
    for name in (*DOCUMENTS, f"datasets/shotdetail_{starting_year}.tar.xz"):
        result = acquire_file(
            archive_url(revision, starting_year, name),
            root / name,
            max_bytes=MAX_COMPRESSED_BYTES if name.endswith(".xz") else 1024 * 1024,
        )
        result["observed_at"] = datetime.now(UTC).isoformat()
        assets.append(result)
    receipt = root / "acquisition.json"
    with receipt.open("x", encoding="utf-8") as stream:
        json.dump({"revision": revision, "assets": assets}, stream, sort_keys=True, indent=2)
        stream.write("\n")
    return receipt


def verify_source(root: Path, *, starting_year: int) -> dict[str, Any]:
    receipt_path = root / "acquisition.json"
    if receipt_path.stat().st_size > 64 * 1024:
        raise ValueError("source receipt too large")
    receipt = json.loads(receipt_path.read_text())
    revision = receipt["revision"]
    expected_names = (*DOCUMENTS, f"datasets/shotdetail_{starting_year}.tar.xz")
    assets = receipt["assets"]
    if len(assets) != len(expected_names):
        raise ValueError("source receipt must contain archive and all notices")
    verified = []
    for name in expected_names:
        url = archive_url(revision, starting_year, name)
        matches = [a for a in assets if a["url"] == url]
        if len(matches) != 1:
            raise ValueError("missing/duplicate pinned source receipt")
        declared = matches[0]
        observed = datetime.fromisoformat(declared["observed_at"])
        if observed.tzinfo is None or observed.utcoffset() is None or observed > datetime.now(UTC):
            raise ValueError("source observation must be actual timezone-aware past time")
        limit = MAX_COMPRESSED_BYTES if name.endswith(".xz") else 1024 * 1024
        if not 0 < (root / name).stat().st_size <= limit:
            raise ValueError("source file exceeds size limit")
        digest, size = hash_file(root / name)
        if digest != declared["sha256"] or size != declared["bytes"]:
            raise ValueError("source receipt bytes/hash mismatch")
        verified.append(
            {
                "name": name,
                "url": url,
                "sha256": digest,
                "bytes": size,
                "observed_at": declared["observed_at"],
            }
        )
    return {"revision": revision, "assets": verified, "receipt_sha256": hash_file(receipt_path)[0]}


class _LimitedReader(io.RawIOBase):
    def __init__(self, stream: Any) -> None:
        self.stream = stream
        self.remaining = MAX_EXPANDED_BYTES

    def readable(self) -> bool:
        return True

    def readinto(self, buffer: Any) -> int:
        payload = self.stream.read(min(len(buffer), self.remaining + 1))
        self.remaining -= len(payload)
        if self.remaining < 0:
            raise ValueError("archive exceeds expanded byte limit")
        buffer[: len(payload)] = payload
        return len(payload)


def shot_rows(path: Path, *, starting_year: int) -> Iterator[tuple[int, dict[str, str]]]:
    """Read exactly one bounded regular member; never extract untrusted tar paths."""
    if not 0 < path.stat().st_size <= MAX_COMPRESSED_BYTES:
        raise ValueError("archive exceeds compressed byte limit")
    previous_limit = csv.field_size_limit(MAX_FIELD_BYTES)
    try:
        with (
            lzma.LZMAFile(path) as expanded,
            io.BufferedReader(_LimitedReader(expanded)) as bounded,
        ):
            with tarfile.open(fileobj=bounded, mode="r|") as archive:
                count = 0
                for member in archive:
                    count += 1
                    if (
                        count != 1
                        or member.name != f"shotdetail_{starting_year}.csv"
                        or not member.isfile()
                        or not 0 < member.size < MAX_EXPANDED_BYTES
                    ):
                        raise ValueError(
                            "archive must contain exactly the expected regular CSV member"
                        )
                    extracted = archive.extractfile(member)
                    assert extracted is not None
                    # tarfile's streaming ExFileObject is not seekable on Python 3.14.
                    # This wrapper advertises only readinto to TextIOWrapper.
                    with (
                        io.BufferedReader(_LimitedReader(extracted)) as member_stream,
                        io.TextIOWrapper(member_stream, encoding="utf-8-sig", newline="") as text,
                    ):
                        reader = csv.DictReader(text, strict=True)
                        headers = reader.fieldnames or []
                        if not headers or len(headers) != len(set(headers)) or len(headers) > 100:
                            raise ValueError("missing/duplicate/excessive CSV header")
                        for index, row in enumerate(reader, start=1):
                            if index > MAX_ROWS:
                                raise ValueError("shot row budget exceeded")
                            if None in row or any(v is None for v in row.values()):
                                raise ValueError(f"malformed CSV record at line {reader.line_num}")
                            yield reader.line_num, row
                if count != 1:
                    raise ValueError("missing shot CSV member")
            # Consume trailing padding to check the expansion cap and the xz checksum.
            while bounded.read(64 * 1024):
                pass
    finally:
        csv.field_size_limit(previous_limit)
