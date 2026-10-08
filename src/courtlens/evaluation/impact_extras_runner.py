"""Explicit offline IM05 build/replay; no API, publication or forecast side effects."""

from __future__ import annotations

import argparse
import json
import tempfile
import time
from collections import Counter, defaultdict
from datetime import date
from pathlib import Path
from typing import Any

from sqlalchemy import Engine, create_engine

from courtlens.domain.impact_extras import aggregate, game_facts
from courtlens.domain.impact_extras_catalog import VERSION
from courtlens.evaluation.impact_rating_inputs import checked, read_accepted_inputs, write_artifact
from courtlens.ingestion.impact_archive import (
    ATTRIBUTION,
    archive_rows,
    verify_observation,
    write_json,
)
from courtlens.ingestion.impact_repair_audit import ArchiveGames, retained_boxes
from courtlens.ingestion.native_reconstruction import content_hash
from courtlens.ingestion.sportsdataverse import hash_file
from courtlens.ingestion.workbench_normalization import normalize_game_id


def extra_rows(path: Path, name: str, column: str) -> dict[str, list[dict[str, str]]]:
    grouped: dict[str, list[dict[str, str]]] = defaultdict(list)
    for index, row in enumerate(archive_rows(path, name)):
        grouped[normalize_game_id(row[column])].append({**row, "_row_index": str(index)})
    return dict(grouped)


def run(
    *,
    acceptance: Path,
    bundle_root: Path,
    observation: Path,
    raw_root: Path,
    output_root: Path,
    receipt_path: Path,
    cutoff: str | None = None,
    database: Engine | None = None,
) -> dict[str, Any]:
    started = time.monotonic()
    if cutoff is not None:
        date.fromisoformat(cutoff)
    cohorts, provenance = read_accepted_inputs(acceptance, bundle_root, database)
    # Full-season source validation is provenance; only selected facts enter output hashes.
    archive_root = raw_root / "impact-archive"
    verified = verify_observation(archive_root, observation)
    if (
        verified["content_sha256"]
        != "8952f9f6f8aeea4315f865c3efaefe486c0e4bcee581f5d4bf0312707235ca94"
    ):
        raise ValueError("IM01 source observation differs from accepted population")
    manifest = json.loads(observation.read_text())
    assets = {a["name"]: a for a in manifest["assets"]}
    code_paths = (
        "src/courtlens/domain/impact_extras.py",
        "src/courtlens/domain/impact_extras_catalog.py",
        "src/courtlens/evaluation/impact_extras_runner.py",
    )
    method = {
        "contract_sha256": hash_file(Path("docs/design/impact-extras-v1.md"))[0],
        "code_sha256": {p: hash_file(Path(p))[0] for p in code_paths},
    }
    receipts = []
    for bundle_path in sorted(bundle_root.glob("*.json.gz")):
        bundle = checked(bundle_path)
        season, phase = bundle["season"], bundle["phase"]
        year = int(season[:4])
        suffix = "_po" if phase == "playoffs" else ""
        before = cutoff or f"{year + 1}-07-01"
        players, _, box_receipts = retained_boxes(raw_root, year + 1)
        shots_asset = assets[f"datasets/shotdetail{suffix}_{year}.tar.xz"]
        matchups_asset = assets[f"datasets/matchups{suffix}_{year}.tar.xz"]
        shots = extra_rows(
            archive_root / shots_asset["object"], f"shotdetail{suffix}_{year}", "GAME_ID"
        )
        matchups = extra_rows(
            archive_root / matchups_asset["object"], f"matchups{suffix}_{year}", "game_id"
        )
        facts = {}
        selected_sources: Counter[str] = Counter()
        missing_matchup_games = []
        with tempfile.TemporaryDirectory(prefix="courtlens-im05-") as temporary:
            store = ArchiveGames(Path(temporary) / "events.sqlite")
            try:
                for source, family in (("v3", "nbastatsv3"), ("cdn", "cdnnba")):
                    name = f"{family}{suffix}_{year}"
                    asset = assets[f"datasets/{name}.tar.xz"]
                    store.load(source, archive_root / asset["object"], name)
                for gid, member in sorted(bundle["members"].items()):
                    if member["schedule"]["game_date"] >= before:
                        continue
                    game = checked(Path(member["path"]), member["content_sha256"])
                    candidate = checked(Path(member["candidate_path"]), member["candidate_sha256"])
                    source = candidate["arbitration"]["selected"]
                    if any(
                        candidate["input_sha256"][family] != box_receipts[family]
                        for family in ("player_box", "team_box")
                    ):
                        raise ValueError("box bytes differ from accepted candidate")
                    selected_sources[source] += 1
                    if any(
                        candidate["input_sha256"][s]
                        != assets[f"datasets/{family}{suffix}_{year}.tar.xz"]["sha256"]
                        for s, family in (("v3", "nbastatsv3"), ("cdn", "cdnnba"))
                    ):
                        raise ValueError("selected source archive differs from candidate")
                    if not matchups.get(gid):
                        missing_matchup_games.append(gid)
                    f = game_facts(
                        game,
                        candidate,
                        players[gid],
                        store.get(source, gid),
                        store.get("cdn", gid),
                        shots.get(gid, []),
                        matchups.get(gid, []),
                    )
                    facts[gid] = {
                        "day": member["schedule"]["game_date"],
                        "quality": game["quality"],
                        "game_sha256": game["content_sha256"],
                        "facts": f,
                    }
            finally:
                store.close()
        if not facts:
            continue
        body = {
            **aggregate(facts, before),
            "season": season,
            "phase": phase,
            "method": method,
            "attribution": ATTRIBUTION,
            "disclosures": [
                "Descriptive, not causal; no forecast features.",
                "IM03 repair/minute/plus-minus and estimate diagnostics retained "
                "in input provenance; unknowns and source gaps remain explicit.",
            ],
        }
        path, digest = write_artifact(output_root / "artifacts", body)
        fact_path, fact_hash = write_artifact(output_root / "facts", facts)
        coverage = Counter[str]()
        for g in facts.values():
            coverage.update(g["facts"]["coverage"])
        item = {
            "season": season,
            "phase": phase,
            "cutoff": before,
            "sha256": digest,
            "path": str(path),
            "fact_sha256": fact_hash,
            "fact_path": str(fact_path),
            "games": len(facts),
            "players": len(body["players"]),
            "columns": len(body["catalog"]),
            "quality": dict(Counter(g["quality"] for g in facts.values())),
            "coverage": dict(coverage),
            "missing_matchup_games": missing_matchup_games,
            "metric_coverage": {
                k: {
                    "available_players": sum(
                        r["metrics"][k]["value"] is not None for r in body["players"].values()
                    ),
                    "qualified_players": sum(
                        r["metrics"][k]["qualified"] for r in body["players"].values()
                    ),
                    "covered_player_games": sum(
                        r["metrics"][k]["covered_games"] for r in body["players"].values()
                    ),
                }
                for k in body["catalog"]
            },
            "selected_sources": dict(selected_sources),
            "sources": {
                "shots": shots_asset["sha256"],
                "matchups": matchups_asset["sha256"],
                "boxes": box_receipts,
            },
            "im03_provenance": provenance["cohorts"][f"{season}:{phase}"],
            "stints": len(cohorts[f"{season}:{phase}"]["stints"]),
        }
        receipts.append(item)
        print(
            json.dumps({k: item[k] for k in ("season", "phase", "sha256", "games", "players")}),
            flush=True,
        )
    if not receipts:
        raise ValueError("no cohort before cutoff")
    receipt = {
        "version": VERSION,
        "artifacts": receipts,
        "method": method,
        "archive_verification": verified,
        "archive_receipt_sha256": hash_file(observation)[0],
        "im03_acceptance_sha256": provenance["acceptance_sha256"],
        "database_readback": database is not None,
        "elapsed_seconds": round(time.monotonic() - started, 3),
    }
    receipt["content_sha256"] = content_hash(receipt)
    write_json(receipt_path, receipt)
    return receipt


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--acceptance",
        type=Path,
        default=Path("docs/evidence/im03-event-gate/acceptance-v2.json.gz"),
    )
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
    parser.add_argument("--output", type=Path, default=Path("data/derived/impact-extras-v1"))
    parser.add_argument("--receipt", type=Path, required=True)
    parser.add_argument("--cutoff")
    parser.add_argument("--database-url")
    args = parser.parse_args()
    database = create_engine(args.database_url) if args.database_url else None
    try:
        run(
            acceptance=args.acceptance,
            bundle_root=args.bundles,
            observation=args.observation,
            raw_root=args.raw_root,
            output_root=args.output,
            receipt_path=args.receipt,
            cutoff=args.cutoff,
            database=database,
        )
    finally:
        if database is not None:
            database.dispose()


if __name__ == "__main__":
    main()
