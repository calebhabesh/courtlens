"""Shot tables for `courtlens-expected-shot-v2` (Research R05).

Joins every regular-season NBA ShotChartDetail attempt (retained shufinskiy archives, the same
pinned bytes R03 read) to its NBA PlayByPlayV3 event by (game, event number) and writes one
content-hashed table per season with the join receipt. Context comes from
`domain.expected_shot_v2.game_context` and describes the moment before the shot. An unjoined shot
keeps its shot-chart fields and gets unknown context; it is never dropped silently.

    python -m courtlens.evaluation.expected_shot_v2_data --season 2023-24
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
import lzma
import tarfile
import time
from collections import Counter, defaultdict
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import numpy as np

from courtlens.domain import expected_shot_v2 as es

ROOT = Path("data/raw/impact-archive/objects")
OUTPUT = Path("data/derived/expected-shot-v2/tables")
SEASONS = tuple(f"{y}-{(y + 1) % 100:02d}" for y in range(2014, 2026))
REVISION = "e829d4678be1e075f99e5d41a1c5f97089be446b"
# Retained regular-season archives, shufinskiy/nba_data@REVISION; SHA-256 from the R01/IM01
# observations (shot detail identical to R03's pins).
SHOT_ARCHIVES = {
    "2014-15": "e2bf753050854e1eb99f6d5c5d690cdcfed4adae216726d330ef6adb3cd21513",
    "2015-16": "ac48fad67cabf79f8a5a726aa55ea4a8c793a85eaa3835d38b46f2d0e37495a3",
    "2016-17": "0681285a0bf08a1ef84b24895d2a4bb709f2d192ba9134e3600567c593dacd96",
    "2017-18": "a62d25aa9c9190477f350f06a9a2d808c7908a6720786970319a3b28af184e81",
    "2018-19": "c658890976559b69dff44ed08352baf64b935514506e726d21f34950ad5bfe9d",
    "2019-20": "0c6002cbc8bc379ecc0a2e0f57defb2e9804be8240aa0234242002ec5dd124fe",
    "2020-21": "02916ac0a4a0c8dcb1e115ed08ddb49b360305f98f4882c8933a2998b747487d",
    "2021-22": "5b56b6833d179fdef9c76223064c7923717b1add83570becf494a3f1d0a785f2",
    "2022-23": "62533f4e444ef0fc3354cdf6bbc04e249eb14ba9f444e6cd247c3e95d235e46d",
    "2023-24": "303e71f967c199568b345cd73a75e595f1f99532cca3e6ce59afb286b63f840d",
    "2024-25": "950100f9c84fe750ae2ac8eaeb82d24cdfb9f60a9ed04ceaa66f64789d7c216e",
    "2025-26": "dcb6c29edda8463132ab62f63118b5cee80d751bcbee9ad98fa38ebe12e6d33c",
}
OBSERVATIONS = (
    Path("data/raw/impact-archive/history-observations/31544bdf-7fbe-4122-9fd6-c84f88eca49b.json"),
    Path("data/raw/impact-archive/observations/068decb9-4599-4385-91dc-a541f1302ff3.json"),
)
MAX_EXPANDED = 2 * 1024 * 1024 * 1024
STRING_COLUMNS = (
    "game_id",
    "player_id",
    "team_id",
    "action_type",
    "zone_basic",
    "zone_area",
    "zone_range",
    "unjoined_reason",
    "possession_reason",
)


class _Raw(io.RawIOBase):
    def __init__(self, source: Any) -> None:
        self.source = source
        self.read_bytes = 0

    def readable(self) -> bool:
        return True

    def readinto(self, buffer: Any) -> int:
        data = self.source.read(len(buffer))
        self.read_bytes += len(data)
        if self.read_bytes > MAX_EXPANDED:
            raise ValueError("expanded byte budget exceeded")
        buffer[: len(data)] = data
        return len(data)


def pbp_pins() -> dict[str, str]:
    pins: dict[str, str] = {}
    for path in OBSERVATIONS:
        for asset in json.loads(path.read_text())["assets"]:
            name = asset["name"]
            if name.startswith("datasets/nbastatsv3_") and "_po_" not in name:
                year = int(name.removeprefix("datasets/nbastatsv3_").removesuffix(".tar.xz"))
                pins[f"{year}-{(year + 1) % 100:02d}"] = asset["sha256"]
    return {s: pins[s] for s in SEASONS}


def archive_csv(sha: str, member: str) -> Iterator[dict[str, str]]:
    """Stream the single CSV member of a retained archive after checking its SHA-256."""
    path = ROOT / sha[:2] / sha
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1 << 20), b""):
            digest.update(block)
    if digest.hexdigest() != sha:
        raise ValueError(f"retained archive bytes changed: {path}")
    with lzma.LZMAFile(path) as expanded, tarfile.open(fileobj=expanded, mode="r|") as tar:
        for count, entry in enumerate(tar, start=1):
            if count != 1 or not entry.isfile() or entry.name != f"{member}.csv":
                raise ValueError(f"expected exactly one {member}.csv")
            extracted = tar.extractfile(entry)
            if extracted is None:
                raise ValueError("unreadable archive member")
            text = io.TextIOWrapper(
                io.BufferedReader(_Raw(extracted)), encoding="utf-8-sig", newline=""
            )
            yield from csv.DictReader(text, strict=True)


def games_in_order(rows: Iterator[dict[str, str]]) -> Iterator[tuple[str, list[dict[str, str]]]]:
    current: str | None = None
    block: list[dict[str, str]] = []
    seen: set[str] = set()
    for row in rows:
        game = row["gameId"].zfill(10)
        if game != current:
            if current is not None:
                yield current, block
            if game in seen:
                raise ValueError(f"play-by-play rows for {game} are not contiguous")
            seen.add(game)
            current, block = game, []
        block.append(row)
    if current is not None:
        yield current, block


def and_ones(rows: list[dict[str, str]]) -> int:
    """Made field goals followed, at the same clock, by the shooter's free throw 1 of 1."""
    count = 0
    last_made: tuple[str, str, str] | None = None
    for row in rows:
        kind = row.get("actionType", "").strip()
        if kind == "Made Shot":
            last_made = (row.get("personId", ""), row.get("period", ""), row.get("clock", ""))
        elif kind == "Free Throw" and row.get("subType", "").strip() == "Free Throw 1 of 1":
            key = (row.get("personId", ""), row.get("period", ""), row.get("clock", ""))
            if key == last_made:
                count += 1
            last_made = None
    return count


def content_sha(arrays: dict[str, np.ndarray]) -> str:
    digest = hashlib.sha256()
    for name in sorted(arrays):
        value = arrays[name]
        digest.update(f"{name}|{value.dtype.str}|{value.shape}\n".encode())
        digest.update(np.ascontiguousarray(value).tobytes())
    return digest.hexdigest()


def build(season: str, output: Path = OUTPUT) -> dict[str, Any]:
    started = time.monotonic()
    year = int(season[:4])
    pbp_sha = pbp_pins()[season]
    shots: dict[tuple[str, int], dict[str, str]] = {}
    duplicate_keys: set[tuple[str, int]] = set()
    chart_rows = 0
    for row in archive_csv(SHOT_ARCHIVES[season], f"shotdetail_{year}"):
        if row["SHOT_ATTEMPTED_FLAG"] != "1":
            continue
        chart_rows += 1
        key = (row["GAME_ID"].zfill(10), int(row["GAME_EVENT_ID"]))
        if key in shots:
            duplicate_keys.add(key)
        shots[key] = row
    by_game: dict[str, list[int]] = defaultdict(list)
    for game, event in shots:
        by_game[game].append(event)

    contexts: dict[tuple[str, int], es.ShotContext] = {}
    pbp_duplicates: set[tuple[str, int]] = set()
    pbp_games: set[str] = set()
    pbp_shots = 0
    and_one_count = 0
    for game, rows in games_in_order(archive_csv(pbp_sha, f"nbastatsv3_{year}")):
        if game not in by_game:
            continue
        pbp_games.add(game)
        result = es.game_context(rows)
        pbp_shots += len(result.shots)
        and_one_count += and_ones(rows)
        for number, shot in result.shots.items():
            contexts[(game, number)] = shot
        pbp_duplicates.update((game, n) for n in result.duplicate_actions)

    keys = sorted(shots)
    n = len(keys)
    col: dict[str, list[Any]] = defaultdict(list)
    reasons: Counter[str] = Counter()
    possession_reasons: Counter[str] = Counter()
    assisted = Counter[str]()
    for key in keys:
        row = shots[key]
        made = int(row["SHOT_MADE_FLAG"] == "1")
        context = contexts.get(key)
        reason = ""
        if key in duplicate_keys:
            reason = "duplicate_chart_event"
        elif key[0] not in pbp_games:
            reason = "no_pbp_game"
        elif context is None:
            reason = "no_pbp_event"
        elif key in pbp_duplicates:
            reason = "duplicate_pbp_event"
        elif context.person_id != row["PLAYER_ID"]:
            reason = "player_differs"
        elif int(context.made) != made:
            reason = "result_differs"
        elif context.period != int(row["PERIOD"]):
            reason = "period_differs"
        reasons[reason or "joined"] += 1
        joined = not reason
        col["game_id"].append(key[0])
        col["event_id"].append(key[1])
        col["player_id"].append(row["PLAYER_ID"])
        col["team_id"].append(row["TEAM_ID"])
        col["date"].append(int(row["GAME_DATE"]))
        col["made"].append(made)
        col["value"].append(3 if row["SHOT_TYPE"].startswith("3PT") else 2)
        col["loc_x"].append(float(row["LOC_X"]))
        col["loc_y"].append(float(row["LOC_Y"]))
        col["distance"].append(float(row["SHOT_DISTANCE"]))
        col["action_type"].append(row["ACTION_TYPE"].strip())
        col["zone_basic"].append(row["SHOT_ZONE_BASIC"].strip())
        col["zone_area"].append(row["SHOT_ZONE_AREA"].strip())
        col["zone_range"].append(row["SHOT_ZONE_RANGE"].strip())
        col["period"].append(int(row["PERIOD"]))
        col["remaining"].append(
            60.0 * int(row["MINUTES_REMAINING"]) + int(row["SECONDS_REMAINING"])
        )
        col["unjoined_reason"].append(reason)
        if joined and context is not None:
            col["margin"].append(context.margin)
            col["possession_seconds"].append(context.possession_seconds)
            col["after_oreb"].append(context.after_offensive_rebound)
            col["since_oreb"].append(context.since_offensive_rebound)
            col["possession_reason"].append(context.possession_unknown_reason)
            possession_reasons[context.possession_unknown_reason or "known"] += 1
            assisted[f"{'made' if made else 'missed'}_{context.assisted_in_description}"] += 1
        else:
            col["margin"].append(es.UNKNOWN)
            col["possession_seconds"].append(es.UNKNOWN)
            col["after_oreb"].append(-1)
            col["since_oreb"].append(es.UNKNOWN)
            col["possession_reason"].append("unjoined")
            possession_reasons["unjoined"] += 1

    arrays: dict[str, np.ndarray] = {}
    for name, values in col.items():
        if name in STRING_COLUMNS:
            arrays[name] = np.array(values, dtype=np.str_)
        elif name in {"event_id", "date"}:
            arrays[name] = np.array(values, dtype=np.int64)
        elif name in {"made", "value", "period", "after_oreb"}:
            arrays[name] = np.array(values, dtype=np.int8)
        else:
            arrays[name] = np.array(values, dtype=np.float64)
    digest = content_sha(arrays)
    output.mkdir(parents=True, exist_ok=True)
    path = output / f"{season}.{digest[:16]}.npz"
    np.savez(path, **arrays)  # type: ignore[arg-type]
    seconds = arrays["possession_seconds"]
    known = seconds[np.isfinite(seconds)]
    receipt = {
        "season": season,
        "table": str(path),
        "content_sha256": digest,
        "shot_archive_sha256": SHOT_ARCHIVES[season],
        "pbp_archive_sha256": pbp_sha,
        "chart_attempts": chart_rows,
        "rows": n,
        "games": len(by_game),
        "pbp_games_matched": len(pbp_games),
        "pbp_field_goal_events": pbp_shots,
        "join": dict(sorted(reasons.items())),
        "join_rate": reasons["joined"] / n,
        "possession": dict(sorted(possession_reasons.items())),
        "possession_known_rate": possession_reasons["known"] / n,
        "possession_seconds_quantiles": (
            [float(q) for q in np.quantile(known, [0.05, 0.25, 0.5, 0.75, 0.95])]
            if len(known)
            else []
        ),
        "possession_seconds_over_24": int((known > 24).sum()),
        "after_oreb_share_known": float((arrays["after_oreb"] == 1).sum() / max(len(known), 1)),
        "assist_in_description": dict(sorted(assisted.items())),
        "and_ones": and_one_count,
        "action_types": len(set(col["action_type"])),
        "elapsed_seconds": round(time.monotonic() - started, 1),
    }
    (output / f"{season}.receipt.json").write_text(json.dumps(receipt, indent=1, sort_keys=True))
    print(json.dumps(receipt, sort_keys=True), flush=True)
    return receipt


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--season", action="append", choices=SEASONS)
    parser.add_argument("--output", type=Path, default=OUTPUT)
    args = parser.parse_args()
    for season in args.season or SEASONS:
        build(season, args.output)


if __name__ == "__main__":
    main()
