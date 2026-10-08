"""Offline IM02 audit of retained archive inputs; no fetching or database mutation."""

from __future__ import annotations

import argparse
import csv
import gzip
import itertools
import json
import sqlite3
import tempfile
import time
import zlib
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

from courtlens.domain.possession_repair import POLICY_VERSION, RULE_IDS, reconstruct_repaired_game
from courtlens.ingestion.impact_archive import archive_rows, schedule_membership, verify_observation
from courtlens.ingestion.native_reconstruction import content_hash, reconstruct_native_game
from courtlens.ingestion.sportsdataverse import hash_file
from courtlens.ingestion.workbench_normalization import normalize_game_id


class ArchiveGames:
    """Bound memory to a game by spooling compressed groups into a temporary SQLite file."""

    def __init__(self, path: Path) -> None:
        self.connection = sqlite3.connect(path)
        self.connection.execute(
            "CREATE TABLE games (source TEXT, gid TEXT, rows BLOB, PRIMARY KEY(source, gid))"
        )

    def load(self, source: str, path: Path, name: str) -> None:
        rows = archive_rows(path, name)
        located = ({**row, "_row_index": str(index)} for index, row in enumerate(rows))
        for gid, group in itertools.groupby(
            located, key=lambda row: normalize_game_id(row["gameId"])
        ):
            batch = list(group)
            old = self.get(source, gid)
            packed = zlib.compress(json.dumps([*old, *batch], separators=(",", ":")).encode())
            self.connection.execute(
                "INSERT OR REPLACE INTO games VALUES (?, ?, ?)", (source, gid, packed)
            )
        self.connection.commit()

    def get(self, source: str, gid: str) -> list[dict[str, str]]:
        record = self.connection.execute(
            "SELECT rows FROM games WHERE source=? AND gid=?", (source, gid)
        ).fetchone()
        if record is None:
            return []
        rows: list[dict[str, str]] = json.loads(zlib.decompress(record[0]))
        return rows

    def close(self) -> None:
        self.connection.close()


def retained_boxes(
    root: Path, ending_year: int
) -> tuple[dict[str, list[dict[str, str]]], dict[str, list[dict[str, str]]], dict[str, Any]]:
    """Bind actual box bytes to their retained receipt before using any values."""
    manifest_path = root / f"sportsdataverse_{ending_year}" / "retrieval-manifest.json"
    manifest = json.loads(manifest_path.read_text())
    hashes: dict[str, Any] = {"receipt_sha256": hash_file(manifest_path)[0], "receipt": manifest}
    groups: list[dict[str, list[dict[str, str]]]] = []
    for family, name in (("player_boxscores", "player"), ("team_boxscores", "team")):
        asset = manifest["files"][family]
        path = manifest_path.parent / Path(asset["path"]).name
        if hash_file(path) != (asset["sha256"], asset["bytes"]):
            raise ValueError(f"retained {family} bytes do not match receipt")
        grouped: dict[str, list[dict[str, str]]] = defaultdict(list)
        with path.open(newline="", encoding="utf-8-sig") as stream:
            reader = csv.DictReader(stream, strict=True)
            for index, row in enumerate(reader):
                if None in row or any(v is None for v in row.values()):
                    raise ValueError("malformed box CSV")
                gid = normalize_game_id(row["game_id"])
                if row["season"] != str(ending_year):
                    raise ValueError("box season mismatch")
                grouped[gid].append({**row, "_row_index": str(index)})
        groups.append(dict(grouped))
        hashes[f"{name}_box"] = asset["sha256"]
    return groups[0], groups[1], hashes


def summarize(games: dict[str, dict[str, Any]]) -> dict[str, Any]:
    counts = Counter(g["quality"] for g in games.values())
    rules: Counter[str] = Counter()
    minute_deltas: list[float] = []
    plus_deltas: list[int] = []
    admitted_minute_deltas: list[float] = []
    admitted_plus_deltas: list[int] = []
    for game in games.values():
        rules.update(game["rule_counts"])
        for value in game["player_comparisons"].values():
            if value["minutes_delta_seconds"] is not None:
                delta = float(value["minutes_delta_seconds"])
                minute_deltas.append(delta)
                if game["quality"] != "excluded":
                    admitted_minute_deltas.append(delta)
            if value["plus_minus_delta"] is not None:
                plus_deltas.append(value["plus_minus_delta"])
                if game["quality"] != "excluded":
                    admitted_plus_deltas.append(value["plus_minus_delta"])

    def distribution(values: list[float] | list[int]) -> dict[str, Any]:
        absolute = sorted(abs(x) for x in values)
        return {
            "comparisons": len(values),
            "exact": sum(x == 0 for x in values),
            "within_one": sum(abs(x) <= 1 for x in values),
            "within_thirty": sum(abs(x) <= 30 for x in values),
            "exact_percent": round(100 * sum(x == 0 for x in values) / len(values), 4)
            if values
            else None,
            "median_absolute_error": absolute[len(absolute) // 2] if absolute else None,
            "p95_absolute_error": absolute[min(int(len(absolute) * 0.95), len(absolute) - 1)]
            if absolute
            else None,
            "max_absolute_error": max(absolute, default=None),
        }

    return {
        "scheduled_games": len(games),
        "quality_counts": {q: counts[q] for q in ("clean", "patched", "excluded")},
        "quality_percent": {
            q: round(100 * counts[q] / len(games), 4) if games else None
            for q in ("clean", "patched", "excluded")
        },
        "rule_counts": {rule: rules[rule] for rule in RULE_IDS},
        "unknown_player_minutes": sum(len(g["unknown_minutes"]) for g in games.values()),
        "cdn_unavailable_games": sum(
            g["arbitration"]["cdn_status"] == "unavailable" for g in games.values()
        ),
        "minutes_all_candidates": distribution(minute_deltas),
        "plus_minus_all_candidates": distribution(plus_deltas),
        "minutes_nonexcluded": distribution(admitted_minute_deltas),
        "plus_minus_nonexcluded": distribution(admitted_plus_deltas),
        "excluded_games": {
            gid: g["errors"] for gid, g in games.items() if g["quality"] == "excluded"
        },
    }


def audit_archives(
    *,
    observation: Path,
    raw_root: Path,
    output: Path,
    candidate_root: Path,
    years: tuple[int, ...] = (2025, 2023, 2024),
) -> dict[str, Any]:
    """Rehash receipts, audit every scheduled game and retain content-addressed candidates."""
    started = time.monotonic()
    verified = verify_observation(raw_root / "impact-archive", observation)
    receipt = json.loads(observation.read_text())
    assets = {a["name"]: a for a in receipt["assets"]}
    report: dict[str, Any] = {
        "policy_version": POLICY_VERSION,
        "archive_observation_sha256": hash_file(observation)[0],
        "archive_content_sha256": verified["content_sha256"],
        "policy_sha256": hash_file(Path("docs/design/possession-policy-v2.md"))[0],
        "code_sha256": {
            p: hash_file(Path(p))[0]
            for p in (
                "src/courtlens/domain/possession_repair.py",
                "src/courtlens/ingestion/impact_repair_audit.py",
                "src/courtlens/services/possession_warehouse.py",
                "src/courtlens/ingestion/native_reconstruction.py",
                "src/courtlens/ingestion/impact_archive.py",
                "src/courtlens/ingestion/sportsdataverse.py",
                "src/courtlens/ingestion/workbench_normalization.py",
            )
        },
        "seasons": {},
        "database_admission": False,
    }
    for year in years:
        schedules_asset = assets[f"nba_schedule_{year + 1}.csv.gz"]
        schedule = schedule_membership(
            raw_root / "impact-archive" / schedules_asset["object"], year
        )
        players, teams, box_receipts = retained_boxes(raw_root, year + 1)
        for phase, suffix in (("regular_season", ""), ("playoffs", "_po")):
            key = f"{year}-{str(year + 1)[-2:]}:{phase}"
            with tempfile.TemporaryDirectory(prefix="courtlens-im02-") as temporary:
                store = ArchiveGames(Path(temporary) / "games.sqlite")
                hashes = {
                    "schedule": schedules_asset["sha256"],
                    "player_box": box_receipts["player_box"],
                    "team_box": box_receipts["team_box"],
                }
                try:
                    for source, family in (("v3", "nbastatsv3"), ("cdn", "cdnnba")):
                        name = f"{family}{suffix}_{year}"
                        asset = assets[f"datasets/{name}.tar.xz"]
                        hashes[source] = asset["sha256"]
                        store.load(source, raw_root / "impact-archive" / asset["object"], name)
                    games: dict[str, dict[str, Any]] = {}
                    for index, (gid, scheduled) in enumerate(
                        sorted(schedule[phase]["games"].items())
                    ):
                        boxes = players.get(gid, [])
                        team_rows = teams.get(gid, [])
                        points = {
                            scheduled["home_team_id"]: int(scheduled["home_pts"]),
                            scheduled["away_team_id"]: int(scheduled["away_pts"]),
                        }
                        result = reconstruct_repaired_game(
                            game_id=gid,
                            v3_rows=store.get("v3", gid),
                            cdn_rows=store.get("cdn", gid) or None,
                            boxes=boxes,
                            team_points=points,
                            input_hashes=hashes,
                        )
                        observed_points = {b["team_id"]: int(b["points"]) for b in team_rows}
                        if len(team_rows) != 2 or observed_points != points:
                            reason = "independent team box/schedule totals disagree or missing"
                            result["quality"] = "excluded"
                            result["errors"] = sorted(set([*result["errors"], reason]))
                            from courtlens.domain.possession_repair import Repair

                            envelope = Repair(
                                "IM02-R7",
                                gid,
                                None,
                                None,
                                None,
                                {"sha256": hashes["team_box"]},
                                observed_points,
                                points,
                                reason,
                            ).envelope(hashes)
                            result["repairs"].append(envelope)
                            result["rule_counts"]["IM02-R7"] += 1
                            result["content_sha256"] = content_hash(
                                {k: v for k, v in result.items() if k != "content_sha256"}
                            )
                        digest = result["content_sha256"]
                        target = candidate_root / digest[:2] / f"{digest}.json.gz"
                        retain_candidate(target, result)
                        games[gid] = {
                            k: v
                            for k, v in result.items()
                            if k not in ("team_stints", "event_lineups", "repairs")
                        }
                        games[gid]["candidate_path"] = str(target)
                        if (index + 1) % 200 == 0:
                            print(
                                key,
                                index + 1,
                                dict(Counter(g["quality"] for g in games.values())),
                                flush=True,
                            )
                finally:
                    store.close()
            report["seasons"][key] = {
                "schedule_membership_sha256": schedule[phase]["membership_sha256"],
                "box_receipts": box_receipts,
                "input_sha256": hashes,
                "summary": summarize(games),
                "games": games,
            }
            print(key, json.dumps(report["seasons"][key]["summary"]["quality_counts"]), flush=True)
    report["content_sha256"] = content_hash(report)
    # Runtime is observation metadata, not part of the reproducible content hash.
    report["elapsed_seconds"] = round(time.monotonic() - started, 3)
    with output.open("xb") as stream:
        stream.write(
            gzip.compress((json.dumps(report, sort_keys=True, indent=2) + "\n").encode(), mtime=0)
        )
    return report


def retain_candidate(path: Path, result: dict[str, Any]) -> None:
    payload = (json.dumps(result, sort_keys=True, separators=(",", ":")) + "\n").encode()
    path.parent.mkdir(parents=True, exist_ok=True)
    try:
        with path.open("xb") as stream:
            stream.write(gzip.compress(payload, mtime=0))
    except FileExistsError:
        if gzip.decompress(path.read_bytes()) != payload:
            raise ValueError("retained v2 candidate bytes changed") from None


def audit_native_baseline(*, native_root: Path, raw_root: Path, output: Path) -> dict[str, Any]:
    """Rehash and replay the actual four B19d bundles, preserving all old evidence."""
    manifest_path = native_root / "manifest.json"
    manifest = json.loads(manifest_path.read_text())
    for observation in manifest["observations"]:
        if "path" in observation and hash_file(native_root / observation["path"]) != (
            observation["sha256"],
            observation["bytes"],
        ):
            raise ValueError("native B19d observation hash mismatch")
    players, teams, box_receipts = retained_boxes(raw_root, 2026)
    schedule_asset = box_receipts["receipt"]["files"]["schedule"]
    schedule_path = raw_root / "sportsdataverse_2026" / Path(schedule_asset["path"]).name
    if hash_file(schedule_path) != (schedule_asset["sha256"], schedule_asset["bytes"]):
        raise ValueError("native baseline independent schedule hash mismatch")
    scheduled = schedule_membership(schedule_path, 2025)["regular_season"]["games"]
    families = (
        "playbyplayv3",
        "gamerotation",
        "boxscoretraditionalv3",
        "boxscoretraditionalv3_period",
    )
    report: dict[str, Any] = {
        "policy_version": POLICY_VERSION,
        "native_manifest_sha256": hash_file(manifest_path)[0],
        "box_receipts": box_receipts,
        "games": {},
        "database_admission": False,
        "policy_sha256": hash_file(Path("docs/design/possession-policy-v2.md"))[0],
        "code_sha256": {
            p: hash_file(Path(p))[0]
            for p in (
                "src/courtlens/domain/possession_repair.py",
                "src/courtlens/ingestion/impact_repair_audit.py",
                "src/courtlens/ingestion/native_reconstruction.py",
            )
        },
    }
    for gid in ("0022500007", "0022500013", "0022500025", "0022501045"):
        assets = {o["family"]: o for o in manifest["observations"] if o.get("game_id") == gid}
        documents = [json.loads((native_root / assets[f]["path"]).read_text()) for f in families]
        native_hashes = {f: assets[f]["sha256"] for f in families}
        native = reconstruct_native_game(
            documents[0], documents[1], documents[2], documents[3], native_hashes
        )
        original_path = Path("docs/evidence/b19d-native-baseline-probe") / f"{gid}.json"
        original = json.loads(original_path.read_text())
        if native["content_sha256"] != original["content_sha256"]:
            raise ValueError("retained v1 native reconstruction no longer reproduces")
        evidence = {
            (e["period"], e["team"]): {
                "players": e["opening"],
                "sha256": assets["boxscoretraditionalv3_period"]["sha256"],
                "source": "native_period_box",
                "locator": f"/{e['period']}/boxScoreTraditional",
            }
            for e in native["errors"]
            if e["reason"] == "starter_evidence_disagreement"
        }
        rows = [
            {k: str(int(v)) if isinstance(v, bool) else str(v) for k, v in a.items()}
            for a in documents[0]["game"]["actions"]
        ]
        points = {b["team_id"]: int(b["points"]) for b in teams[gid]}
        schedule_points = {
            scheduled[gid]["home_team_id"]: int(scheduled[gid]["home_pts"]),
            scheduled[gid]["away_team_id"]: int(scheduled[gid]["away_pts"]),
        }
        if points != schedule_points:
            raise ValueError("native baseline team box/schedule totals mismatch")
        hashes = {
            "v3": native_hashes["playbyplayv3"],
            "player_box": box_receipts["player_box"],
            "team_box": box_receipts["team_box"],
            "schedule": schedule_asset["sha256"],
            **native_hashes,
        }
        result = reconstruct_repaired_game(
            game_id=gid,
            v3_rows=rows,
            cdn_rows=None,
            boxes=players[gid],
            team_points=points,
            input_hashes=hashes,
            starter_evidence=evidence,
        )
        result["v1_baseline_sha256"] = original["content_sha256"]
        result["v1_starter_disagreements"] = len(evidence)
        result["rotation_starter_agreement"] = result["starters"] == native["starters"]
        result["content_sha256"] = content_hash(
            {k: v for k, v in result.items() if k != "content_sha256"}
        )
        report["games"][gid] = result
    report["summary"] = summarize(report["games"])
    report["content_sha256"] = content_hash(report)
    with output.open("xb") as stream:
        stream.write(
            gzip.compress((json.dumps(report, sort_keys=True, indent=2) + "\n").encode(), mtime=0)
        )
    print(json.dumps(report["summary"]["quality_counts"]), flush=True)
    return report


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--observation", type=Path)
    parser.add_argument("--native-b19-root", type=Path)
    parser.add_argument("--raw-root", type=Path, default=Path("data/raw"))
    parser.add_argument("--candidate-root", type=Path, default=Path("data/derived/impact-repair"))
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--year", action="append", type=int, choices=(2023, 2024, 2025))
    args = parser.parse_args()
    if args.native_b19_root:
        audit_native_baseline(
            native_root=args.native_b19_root, raw_root=args.raw_root, output=args.output
        )
        return
    if args.observation is None:
        parser.error("--observation or --native-b19-root is required")
    audit_archives(
        observation=args.observation,
        raw_root=args.raw_root,
        output=args.output,
        candidate_root=args.candidate_root,
        years=tuple(args.year or (2025, 2023, 2024)),
    )


if __name__ == "__main__":
    main()
