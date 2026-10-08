"""IM01 append-only acquisitions and independent game coverage; never warehouse admission."""

from __future__ import annotations

import argparse
import csv
import gzip
import io
import json
import lzma
import os
import re
import shutil
import tarfile
import tempfile
from collections import Counter
from collections.abc import Iterator
from datetime import UTC, date, datetime
from pathlib import Path
from typing import Any
from uuid import NAMESPACE_URL, UUID, uuid4, uuid5

import httpx

from courtlens.ingestion.sportsdataverse import acquire_file, hash_file
from courtlens.ingestion.workbench_normalization import canonical_hash, normalize_game_id
from courtlens.ingestion.workbench_source_config import schedule_csv_url

VERSION = "courtlens-impact-archive-v1"
STARTING_YEARS = (2023, 2024, 2025)
FAMILIES = ("nbastatsv3", "cdnnba", "matchups", "shotdetail")
PHASES = {"regular_season": "002", "playoffs": "004"}
NOTICES = ("LICENSE", "README.md", "description_fields.md", "list_data.txt")
MAX_COMPRESSED_BYTES = 32 * 1024 * 1024
MAX_EXPANDED_BYTES = 512 * 1024 * 1024
MAX_ROWS = 1_000_000
MAX_FIELD_BYTES = 64 * 1024
SDV_REVISION = "d15f7693a2d4d2cd9570e619c9d6df4fdea87c3c"
ATTRIBUTION = (
    "NBA Stats and NBA CDN; pbpstats; Sergey Shufinskiy (shufinskiy/nba_data, Apache-2.0); "
    "SportsDataverse NBA Stats schedules (CC BY 4.0 data, MIT software). "
    "Local noncommercial research; underlying NBA redistribution rights not granted."
)


def archive_names() -> tuple[str, ...]:
    return tuple(
        f"{family}{'_po' if phase == 'playoffs' else ''}_{year}"
        for year in STARTING_YEARS
        for phase in PHASES
        for family in (*FAMILIES, *(("pbpstats",) if year < 2025 else ()))
    )


def source_url(revision: str, name: str) -> str:
    if not re.fullmatch(r"[0-9a-f]{40}", revision):
        raise ValueError("require a full lowercase Git revision")
    if name not in NOTICES and name not in {f"datasets/{n}.tar.xz" for n in archive_names()}:
        raise ValueError("unsupported impact archive asset")
    return f"https://raw.githubusercontent.com/shufinskiy/nba_data/{revision}/{name}"


def write_json(path: Path, payload: Any) -> None:
    """Install a complete JSON file without overwriting or leaving partial JSON."""
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(dir=path.parent, delete=False) as stream:
        temporary = Path(stream.name)
        try:
            stream.write(
                (json.dumps(payload, sort_keys=True, indent=2, allow_nan=False) + "\n").encode()
            )
            stream.flush()
            os.fsync(stream.fileno())
            os.link(temporary, path)
        finally:
            temporary.unlink()


def retain_asset(
    root: Path, name: str, url: str, *, client: httpx.Client | None = None
) -> dict[str, Any]:
    """Always fetch; atomically install exact bytes under their content address."""
    limit = MAX_COMPRESSED_BYTES if name.endswith(".tar.xz") else 2 * 1024 * 1024
    root.mkdir(parents=True, exist_ok=True)
    if shutil.disk_usage(root).free < 2 * limit:
        raise ValueError("insufficient free space for bounded acquisition")
    with tempfile.TemporaryDirectory(dir=root, prefix=".acquire-") as scratch:
        temporary = Path(scratch) / "download"
        receipt = acquire_file(url, temporary, max_bytes=limit, client=client)
        if receipt["bytes"] == 0:
            raise ValueError("empty source asset")
        observed_at = datetime.now(UTC).isoformat()
        digest = receipt["sha256"]
        relative = Path("objects") / digest[:2] / digest
        destination = root / relative
        destination.parent.mkdir(parents=True, exist_ok=True)
        existing = False
        try:
            os.link(temporary, destination)
        except FileExistsError:
            if hash_file(destination) != (digest, receipt["bytes"]):
                raise ValueError("retained content-addressed object is corrupt") from None
            existing = True
    asset = {
        "name": name,
        "url": url,
        "sha256": digest,
        "bytes": receipt["bytes"],
        "object": relative.as_posix(),
        "observed_at": observed_at,
        "content_version_id": str(uuid5(NAMESPACE_URL, f"{url}#sha256={digest}")),
        "content_already_retained": existing,
        "observation_id": str(uuid4()),
    }
    write_json(root / "asset-observations" / f"{asset['observation_id']}.json", asset)
    return asset


class _LimitedReader(io.RawIOBase):
    def __init__(self, stream: Any, limit: int) -> None:
        self.stream = stream
        self.remaining = limit

    def readable(self) -> bool:
        return True

    def readinto(self, buffer: Any) -> int:
        payload = self.stream.read(min(len(buffer), self.remaining + 1))
        self.remaining -= len(payload)
        if self.remaining < 0:
            raise ValueError("expanded byte budget exceeded")
        buffer[: len(payload)] = payload
        return len(payload)


def archive_rows(path: Path, name: str) -> Iterator[dict[str, str]]:
    """Consume one exact bounded CSV member, including the xz integrity check."""
    if name not in archive_names():
        raise ValueError("unsupported archive name")
    if not 0 < path.stat().st_size <= MAX_COMPRESSED_BYTES:
        raise ValueError("compressed byte budget exceeded")
    prior = csv.field_size_limit(MAX_FIELD_BYTES)
    try:
        with (
            lzma.LZMAFile(path) as expanded,
            io.BufferedReader(_LimitedReader(expanded, MAX_EXPANDED_BYTES)) as bounded,
            tarfile.open(fileobj=bounded, mode="r|") as archive,
        ):
            members = 0
            for member in archive:
                members += 1
                if (
                    members != 1
                    or member.name != f"{name}.csv"
                    or not member.isfile()
                    or not 0 < member.size < MAX_EXPANDED_BYTES
                ):
                    raise ValueError("expected exactly one regular CSV member")
                extracted = archive.extractfile(member)
                assert extracted is not None
                with (
                    io.BufferedReader(_LimitedReader(extracted, MAX_EXPANDED_BYTES)) as stream,
                    io.TextIOWrapper(stream, encoding="utf-8-sig", newline="") as text,
                ):
                    reader = csv.DictReader(text, strict=True)
                    headers = reader.fieldnames or []
                    if not headers or len(headers) != len(set(headers)) or len(headers) > 150:
                        raise ValueError("invalid CSV header")
                    rows = 0
                    for rows, row in enumerate(reader, start=1):
                        if rows > MAX_ROWS or None in row or any(v is None for v in row.values()):
                            raise ValueError("row budget exceeded or malformed CSV record")
                        yield row
                    if not rows:
                        raise ValueError("empty archive CSV")
            if members != 1:
                raise ValueError("missing archive CSV")
            while bounded.read(64 * 1024):
                pass
    finally:
        csv.field_size_limit(prior)


def schedule_membership(path: Path, starting_year: int) -> dict[str, dict[str, Any]]:
    """Validate the independent schedule without inferring missing outcomes."""
    if starting_year not in STARTING_YEARS:
        raise ValueError("unsupported schedule season")
    result: dict[str, dict[str, Any]] = {
        phase: {"games": {}, "team_games": Counter()} for phase in PHASES
    }
    if not 0 < path.stat().st_size <= 2 * 1024 * 1024:
        raise ValueError("schedule byte budget exceeded")
    with (
        gzip.open(path, "rb") as expanded,
        io.BufferedReader(_LimitedReader(expanded, 2 * 1024 * 1024)) as bounded,
        io.TextIOWrapper(bounded, encoding="utf-8-sig", newline="") as text,
    ):
        reader = csv.DictReader(text, strict=True)
        headers = reader.fieldnames or []
        required = {
            "game_id",
            "season",
            "season_type",
            "game_date",
            "home_team_id",
            "away_team_id",
            "home_pts",
            "away_pts",
            "home_wl",
            "away_wl",
        }
        if len(headers) != len(set(headers)) or not required.issubset(headers):
            raise ValueError("invalid schedule header")
        for index, row in enumerate(reader, start=1):
            if index > 2000 or None in row or any(v is None for v in row.values()):
                raise ValueError("schedule row budget exceeded or malformed record")
            phase = {"regular-season": "regular_season", "playoffs": "playoffs"}.get(
                row["season_type"]
            )
            if phase is None:
                continue
            gid = normalize_game_id(row["game_id"])
            home, away = row["home_team_id"], row["away_team_id"]
            game_date = date.fromisoformat(row["game_date"])
            if (
                not gid.startswith(PHASES[phase] + str(starting_year)[-2:])
                or row["season"] != str(starting_year + 1)
                or not date(starting_year, 7, 1) <= game_date < date(starting_year + 1, 7, 1)
                or home == away
                or any(not v.isascii() or not v.isdigit() or int(v) <= 0 for v in (home, away))
                or gid in result[phase]["games"]
            ):
                raise ValueError("invalid/duplicate schedule identity, team or date")
            if any(
                not row[key].isascii() or not row[key].isdigit() for key in ("home_pts", "away_pts")
            ):
                raise ValueError("unknown schedule outcome")
            home_pts, away_pts = int(row["home_pts"]), int(row["away_pts"])
            if home_pts == away_pts or (row["home_wl"], row["away_wl"]) != (
                ("W", "L") if home_pts > away_pts else ("L", "W")
            ):
                raise ValueError("nonfinal/nonreciprocal schedule outcome")
            result[phase]["games"][gid] = {key: row[key] for key in sorted(required)}
            result[phase]["team_games"].update((home, away))
    regular = result["regular_season"]
    if (
        len(regular["games"]) != 1230
        or len(regular["team_games"]) != 30
        or set(regular["team_games"].values()) != {82}
        or not result["playoffs"]["games"]
    ):
        raise ValueError("independent schedule denominator incomplete")
    for data in result.values():
        data["membership_sha256"] = canonical_hash(data["games"])
        data["team_games"] = dict(sorted(data["team_games"].items()))
    return result


def coverage(path: Path, name: str, schedules: dict[str, dict[str, Any]]) -> dict[str, Any]:
    family = name.split("_")[0]
    phase = "playoffs" if "_po_" in name else "regular_season"
    year = int(name.rsplit("_", 1)[1])
    id_column = {"matchups": "game_id", "shotdetail": "GAME_ID", "pbpstats": "GAMEID"}.get(
        family, "gameId"
    )
    counts: Counter[str] = Counter()
    headers: list[str] = []
    for row in archive_rows(path, name):
        if not headers:
            headers = list(row)
        gid = normalize_game_id(row[id_column])
        if gid[3:5] != str(year)[-2:]:
            raise ValueError("archive game season mismatch")
        counts[gid] += 1
    expected = set(schedules[phase]["games"])
    observed = {gid for gid in counts if gid.startswith(PHASES[phase])}
    return {
        "family": family,
        "season": f"{year}-{str(year + 1)[-2:]}",
        "phase": phase,
        "schedule_membership_sha256": schedules[phase]["membership_sha256"],
        "expected_games": len(expected),
        "observed_games": len(observed),
        "matched_games": len(expected & observed),
        "coverage_fraction": len(expected & observed) / len(expected),
        "missing_game_ids": sorted(expected - observed),
        "unexpected_game_ids": sorted(observed - expected),
        "outside_requested_phase_game_ids": sorted(set(counts) - observed),
        "rows": sum(counts.values()),
        "headers": headers,
        "rows_per_game": dict(sorted(counts.items())),
        "quality_scope": "availability_only; reconstruction_not_admitted",
    }


def acquire_impact_archive(
    root: Path,
    *,
    revision: str,
    policy_path: Path = Path("docs/design/research-source-admission-v2.md"),
    client: httpx.Client | None = None,
) -> Path:
    """Acquire all IM01 assets and atomically record one completed observation."""
    source_url(revision, "LICENSE")
    policy_hash, _ = hash_file(policy_path)
    assets = []
    schedules = {}
    for name in NOTICES:
        assets.append(retain_asset(root, name, source_url(revision, name), client=client))
    index_asset = assets[-1]
    index = (root / index_asset["object"]).read_text()
    available = {line.split("=", 1)[0] for line in index.splitlines() if "=" in line}
    if not set(archive_names()).issubset(available):
        raise ValueError("pinned archive index lacks requested families")
    for name in ("LICENSE", "README.md"):
        assets.append(
            retain_asset(
                root,
                f"sportsdataverse/{name}",
                f"https://raw.githubusercontent.com/sportsdataverse/sportsdataverse-data/{SDV_REVISION}/{name}",
                client=client,
            )
        )
    for year in STARTING_YEARS:
        asset = retain_asset(
            root, f"nba_schedule_{year + 1}.csv.gz", schedule_csv_url(year + 1), client=client
        )
        assets.append(asset)
        schedules[year] = schedule_membership(root / asset["object"], year)
    reports = []
    for name in archive_names():
        asset = retain_asset(
            root,
            f"datasets/{name}.tar.xz",
            source_url(revision, f"datasets/{name}.tar.xz"),
            client=client,
        )
        assets.append(asset)
        report = coverage(root / asset["object"], name, schedules[int(name.rsplit("_", 1)[1])])
        report["source_sha256"] = asset["sha256"]
        reports.append(report)
        print(f"{name}: {report['matched_games']}/{report['expected_games']} games", flush=True)
    observation_id = str(uuid4())
    content = {
        "version": VERSION,
        "revision": revision,
        "policy_sha256": policy_hash,
        "assets": [
            {k: a[k] for k in ("name", "url", "sha256", "bytes", "content_version_id")}
            for a in assets
        ],
        "coverage": reports,
    }
    manifest = {
        **content,
        "assets": assets,
        "observation_id": observation_id,
        "completed_at": datetime.now(UTC).isoformat(),
        "content_sha256": canonical_hash(content),
        "attribution": ATTRIBUTION,
        "schedule_denominators": {
            str(y): {p: {k: v for k, v in d.items() if k != "games"} for p, d in s.items()}
            for y, s in schedules.items()
        },
        "unavailable": ["pbpstats_2025", "pbpstats_po_2025"],
        "admission_scope": "raw_acquisition_and_coverage_only",
    }
    path = root / "observations" / f"{observation_id}.json"
    write_json(path, manifest)
    return path


def verify_observation(
    root: Path,
    receipt_path: Path,
    *,
    policy_path: Path = Path("docs/design/research-source-admission-v2.md"),
) -> dict[str, Any]:
    """Offline rehash and rescan of a complete acquisition, including its denominator."""
    if not 0 < receipt_path.stat().st_size <= 4 * 1024 * 1024:
        raise ValueError("observation receipt byte budget exceeded")
    manifest: dict[str, Any] = json.loads(receipt_path.read_text())
    revision = manifest["revision"]
    if manifest["version"] != VERSION or manifest["policy_sha256"] != hash_file(policy_path)[0]:
        raise ValueError("unknown parser or admission policy bytes")
    if (
        manifest["attribution"] != ATTRIBUTION
        or manifest["unavailable"] != ["pbpstats_2025", "pbpstats_po_2025"]
        or manifest["admission_scope"] != "raw_acquisition_and_coverage_only"
        or str(UUID(manifest["observation_id"])) != manifest["observation_id"]
    ):
        raise ValueError("invalid admission metadata or observation UUID")
    completed = datetime.fromisoformat(manifest["completed_at"])
    if completed.tzinfo is None or completed.utcoffset() is None or completed > datetime.now(UTC):
        raise ValueError("invalid completed observation time")
    expected = {name: source_url(revision, name) for name in NOTICES}
    expected.update(
        {
            f"datasets/{name}.tar.xz": source_url(revision, f"datasets/{name}.tar.xz")
            for name in archive_names()
        }
    )
    expected.update(
        {f"nba_schedule_{y + 1}.csv.gz": schedule_csv_url(y + 1) for y in STARTING_YEARS}
    )
    expected.update(
        {
            f"sportsdataverse/{name}": (
                "https://raw.githubusercontent.com/sportsdataverse/sportsdataverse-data/"
                f"{SDV_REVISION}/{name}"
            )
            for name in ("LICENSE", "README.md")
        }
    )
    assets = manifest["assets"]
    by_name = {a["name"]: a for a in assets}
    if len(assets) != len(expected) or set(by_name) != set(expected):
        raise ValueError("missing/duplicate/unexpected observation assets")
    for name, asset in by_name.items():
        digest = asset["sha256"]
        if not isinstance(digest, str) or not re.fullmatch(r"[0-9a-f]{64}", digest):
            raise ValueError("invalid source digest")
        relative = (Path("objects") / digest[:2] / digest).as_posix()
        if asset["object"] != relative or asset["url"] != expected[name]:
            raise ValueError("invalid asset locator or source URL")
        observed = datetime.fromisoformat(asset["observed_at"])
        if observed.tzinfo is None or observed.utcoffset() is None or observed > completed:
            raise ValueError("invalid source observation time")
        limit = MAX_COMPRESSED_BYTES if name.endswith(".tar.xz") else 2 * 1024 * 1024
        path = root / relative
        if not 0 < path.stat().st_size <= limit or hash_file(path) != (digest, asset["bytes"]):
            raise ValueError("observation bytes/hash mismatch")
        if asset["content_version_id"] != str(
            uuid5(NAMESPACE_URL, f"{asset['url']}#sha256={digest}")
        ):
            raise ValueError("source content version mismatch")
        observation_path = root / "asset-observations" / f"{asset['observation_id']}.json"
        if str(UUID(asset["observation_id"])) != asset["observation_id"]:
            raise ValueError("invalid asset observation UUID")
        if (
            not 0 < observation_path.stat().st_size <= 16 * 1024
            or json.loads(observation_path.read_text()) != asset
        ):
            raise ValueError("asset observation receipt mismatch")
    schedules = {
        y: schedule_membership(root / by_name[f"nba_schedule_{y + 1}.csv.gz"]["object"], y)
        for y in STARTING_YEARS
    }
    reports = []
    for name in archive_names():
        asset = by_name[f"datasets/{name}.tar.xz"]
        report = coverage(root / asset["object"], name, schedules[int(name.rsplit("_", 1)[1])])
        report["source_sha256"] = asset["sha256"]
        reports.append(report)
    denominators = {
        str(y): {p: {k: v for k, v in d.items() if k != "games"} for p, d in s.items()}
        for y, s in schedules.items()
    }
    content = {
        "version": VERSION,
        "revision": revision,
        "policy_sha256": manifest["policy_sha256"],
        "assets": [
            {k: a[k] for k in ("name", "url", "sha256", "bytes", "content_version_id")}
            for a in assets
        ],
        "coverage": reports,
    }
    if (
        reports != manifest["coverage"]
        or denominators != manifest["schedule_denominators"]
        or canonical_hash(content) != manifest["content_sha256"]
    ):
        raise ValueError("reproduced coverage/content differs from observation")
    return {
        "observation_id": manifest["observation_id"],
        "content_sha256": manifest["content_sha256"],
        "verified_assets": len(assets),
        "verified_coverage_reports": len(reports),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path("data/raw/impact-archive"))
    parser.add_argument("--revision", help="full shufinskiy/nba_data commit SHA")
    parser.add_argument("--verify", type=Path, help="offline rehash and rescan of an observation")
    args = parser.parse_args()
    if args.verify:
        print(json.dumps(verify_observation(args.root, args.verify), sort_keys=True))
    elif args.revision:
        print(acquire_impact_archive(args.root, revision=args.revision))
    else:
        parser.error(
            "--revision is required for acquisition; use --verify for offline verification"
        )


if __name__ == "__main__":
    main()
