"""Offline stint box build: one sealed artifact per accepted IM03 season/phase bundle."""

from __future__ import annotations

import argparse
import json
import tempfile
import time
from collections import Counter
from pathlib import Path
from typing import Any

from courtlens.domain.stint_box import FIELDS, VERSION, stint_box
from courtlens.evaluation.impact_rating_inputs import checked, write_artifact
from courtlens.ingestion.impact_archive import ATTRIBUTION, verify_observation, write_json
from courtlens.ingestion.impact_repair_audit import ArchiveGames, retained_boxes
from courtlens.ingestion.native_reconstruction import content_hash
from courtlens.ingestion.sportsdataverse import hash_file

ARCHIVE_OBSERVATION_SHA256 = "8952f9f6f8aeea4315f865c3efaefe486c0e4bcee581f5d4bf0312707235ca94"
CODE_PATHS = ("src/courtlens/domain/stint_box.py", "src/courtlens/evaluation/stint_box_runner.py")


def run(
    *,
    bundle_root: Path,
    observation: Path,
    raw_root: Path,
    output_root: Path,
    receipt_path: Path,
    limit: int | None = None,
) -> dict[str, Any]:
    started = time.monotonic()
    archive_root = raw_root / "impact-archive"
    verified = verify_observation(archive_root, observation)
    if verified["content_sha256"] != ARCHIVE_OBSERVATION_SHA256:
        raise ValueError("IM01 source observation differs from accepted population")
    assets = {a["name"]: a for a in json.loads(observation.read_text())["assets"]}
    method = {
        "version": VERSION,
        "contract_sha256": hash_file(Path("docs/design/stint-box-v1.md"))[0],
        "code_sha256": {p: hash_file(Path(p))[0] for p in CODE_PATHS},
    }
    receipts = []
    for bundle_path in sorted(bundle_root.glob("*.json.gz")):
        bundle = checked(bundle_path)
        season, phase = bundle["season"], bundle["phase"]
        year = int(season[:4])
        suffix = "_po" if phase == "playoffs" else ""
        players, _, box_receipts = retained_boxes(raw_root, year + 1)
        games: dict[str, Any] = {}
        known: Counter[str] = Counter()
        unresolved: Counter[str] = Counter()
        with tempfile.TemporaryDirectory(prefix="courtlens-stint-box-") as temporary:
            store = ArchiveGames(Path(temporary) / "events.sqlite")
            try:
                for source, family in (("v3", "nbastatsv3"), ("cdn", "cdnnba")):
                    name = f"{family}{suffix}_{year}"
                    store.load(
                        source, archive_root / assets[f"datasets/{name}.tar.xz"]["object"], name
                    )
                for gid, member in sorted(bundle["members"].items())[:limit]:
                    game = checked(Path(member["path"]), member["content_sha256"])
                    candidate = checked(Path(member["candidate_path"]), member["candidate_sha256"])
                    if any(
                        candidate["input_sha256"][family] != box_receipts[family]
                        for family in ("player_box", "team_box")
                    ):
                        raise ValueError("box bytes differ from accepted candidate")
                    source = candidate["arbitration"]["selected"]
                    box = stint_box(
                        game, candidate, players[gid], store.get(source, gid), store.get("cdn", gid)
                    )
                    games[gid] = box
                    for fields in box["known_fields"].values():
                        known.update(fields)
                    unresolved.update(box["unresolved"])
            finally:
                store.close()
        body = {
            "version": VERSION,
            "season": season,
            "phase": phase,
            "bundle_content_sha256": bundle["content_sha256"],
            "method": method,
            "attribution": ATTRIBUTION,
            "games": games,
        }
        path, digest = write_artifact(output_root, body)
        team_games = 2 * len(games)
        item = {
            "season": season,
            "phase": phase,
            "sha256": digest,
            "path": str(path),
            "bundle_content_sha256": bundle["content_sha256"],
            "games": len(games),
            "known_team_games": {f: known[f] for f in FIELDS},
            "team_games": team_games,
            "unresolved_events": dict(unresolved),
            "box_mismatches": sum(len(g["mismatches"]) for g in games.values()),
        }
        receipts.append(item)
        print(json.dumps({k: v for k, v in item.items() if k != "path"}), flush=True)
    receipt = {
        "version": VERSION,
        "artifacts": receipts,
        "method": method,
        "archive_verification": verified,
        "archive_receipt_sha256": hash_file(observation)[0],
        "limit": limit,
        "elapsed_seconds": round(time.monotonic() - started, 3),
    }
    receipt["content_sha256"] = content_hash(receipt)
    write_json(receipt_path, receipt)
    return receipt


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--bundles", type=Path, default=Path("data/derived/impact-event-gate/bundles")
    )
    parser.add_argument(
        "--observation",
        type=Path,
        default=Path(
            "data/raw/impact-archive/observations/068decb9-4599-4385-91dc-a541f1302ff3.json"
        ),
    )
    parser.add_argument("--raw-root", type=Path, default=Path("data/raw"))
    parser.add_argument("--output", type=Path, default=Path("data/derived/stint-box-v1"))
    parser.add_argument("--receipt", type=Path, required=True)
    parser.add_argument("--limit", type=int)
    args = parser.parse_args()
    run(
        bundle_root=args.bundles,
        observation=args.observation,
        raw_root=args.raw_root,
        output_root=args.output,
        receipt_path=args.receipt,
        limit=args.limit,
    )


if __name__ == "__main__":
    main()
