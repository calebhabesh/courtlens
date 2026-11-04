"""IM05 Defense/Advanced extras and stint boxes for the R01 history seasons (2014-15 to 2022-23).

`evaluation/impact_extras_runner.py` (pinned) reads only the sealed seasons' archives. This
module feeds `domain/impact_extras.game_facts` and `aggregate` (unchanged) the same inputs for
each `courtlens-impact-history-v2` bundle: the selected event source's rows (v3 rows after rule
R01-H5, as the candidate was built), CDN rows where they exist (2020-21 onward), shot detail,
and matchups where they exist (2017-18 onward). A missing source leaves its columns unknown;
nothing is filled. The cutoff is rule H3 (the day after the season's last admitted game).

Stint boxes (`domain/stint_box.stint_box`, unchanged) are built the same way as
`evaluation/stint_box_runner.py` builds the sealed seasons'; WOWY and on/off read them for
focal-player stats beyond points.
"""

from __future__ import annotations

import argparse
import json
import tempfile
import time
from collections import Counter, defaultdict
from datetime import date, timedelta
from pathlib import Path
from typing import Any

from courtlens.domain.impact_extras import aggregate, game_facts
from courtlens.domain.research_registry import registration_receipt
from courtlens.domain.stint_box import FIELDS as STINT_BOX_FIELDS
from courtlens.domain.stint_box import VERSION as STINT_BOX_VERSION
from courtlens.domain.stint_box import stint_box
from courtlens.evaluation.impact_rating_inputs import checked, write_artifact
from courtlens.ingestion.impact_history import (
    ATTRIBUTION,
    REGISTRATION,
    HistoryGames,
    _assets,
    _load_store,
    families,
    history_rows,
    v3_rows,
)
from courtlens.ingestion.impact_repair_audit import retained_boxes
from courtlens.ingestion.sportsdataverse import hash_file
from courtlens.ingestion.workbench_normalization import normalize_game_id

VERSION = "courtlens-impact-history-extras-v1"
CODE = (
    "src/courtlens/domain/impact_extras.py",
    "src/courtlens/domain/impact_extras_catalog.py",
    "src/courtlens/ingestion/impact_history_extras.py",
)


def extra_rows(path: Path, name: str, column: str) -> dict[str, list[dict[str, str]]]:
    grouped: dict[str, list[dict[str, str]]] = defaultdict(list)
    for index, row in enumerate(history_rows(path, name)):
        grouped[normalize_game_id(row[column])].append({**row, "_row_index": str(index)})
    return dict(grouped)


def build_extras(
    *, bundle_path: Path, observation: Path, raw_root: Path, output_root: Path
) -> dict[str, Any]:
    started = time.monotonic()
    bundle = checked(bundle_path, bundle_path.name.removesuffix(".json.gz"))
    season = bundle["season"]
    year = int(season[:4])
    last = max(m["schedule"]["game_date"] for m in bundle["members"].values())
    before = (date.fromisoformat(last) + timedelta(days=1)).isoformat()
    root = raw_root / "impact-archive"
    assets = _assets(observation)
    players, _, box_receipts = retained_boxes(raw_root, year + 1)
    shots_asset = assets[f"datasets/shotdetail_{year}.tar.xz"]
    shots = extra_rows(root / shots_asset["object"], f"shotdetail_{year}", "GAME_ID")
    matchups_asset = assets.get(f"datasets/matchups_{year}.tar.xz")
    matchups = (
        extra_rows(root / matchups_asset["object"], f"matchups_{year}", "game_id")
        if "matchups" in families(year) and matchups_asset
        else {}
    )
    facts = {}
    sources: Counter[str] = Counter()
    missing_matchups = []
    with tempfile.TemporaryDirectory(prefix="courtlens-r01-im05-") as temporary:
        store = HistoryGames(Path(temporary) / "events.sqlite")
        try:
            hashes = _load_store(store, root, assets, year)
            for gid, member in sorted(bundle["members"].items()):
                game = checked(Path(member["path"]), member["content_sha256"])
                candidate = checked(Path(member["candidate_path"]), member["candidate_sha256"])
                source = candidate["arbitration"]["selected"]
                if candidate["input_sha256"][source] != hashes[source]:
                    raise ValueError("selected source differs from the accepted candidate")
                rows = (
                    v3_rows(store, gid, players[gid])[0]
                    if source == "v3"
                    else store.get("cdn", gid)
                )
                sources[source] += 1
                if not matchups.get(gid):
                    missing_matchups.append(gid)
                facts[gid] = {
                    "day": member["schedule"]["game_date"],
                    "quality": game["quality"],
                    "game_sha256": game["content_sha256"],
                    "facts": game_facts(
                        game,
                        candidate,
                        players[gid],
                        rows,
                        store.get("cdn", gid),
                        shots.get(gid, []),
                        matchups.get(gid, []),
                    ),
                }
        finally:
            store.close()
    body = {
        **aggregate(facts, before),
        "season": season,
        "phase": bundle["phase"],
        "method": {
            "contract_sha256": hash_file(Path("docs/design/impact-extras-v1.md"))[0],
            "code_sha256": {p: hash_file(Path(p))[0] for p in CODE},
        },
        "registration": registration_receipt(REGISTRATION),
        "attribution": ATTRIBUTION,
        "disclosures": [
            "Descriptive, not causal; no forecast features.",
            "History season: one event source before 2020-21; matchup columns unknown before "
            "2017-18; unknowns and source gaps remain explicit.",
        ],
    }
    path, digest = write_artifact(output_root / "extras", body)
    fact_path, fact_digest = write_artifact(output_root / "extras-facts", facts)
    receipt = {
        "version": VERSION,
        "season": season,
        "phase": bundle["phase"],
        "cutoff": before,
        "sha256": digest,
        "path": str(path),
        "fact_sha256": fact_digest,
        "fact_path": str(fact_path),
        "bundle_sha256": bundle["content_sha256"],
        "games": len(facts),
        "players": len(body["players"]),
        "columns": len(body["catalog"]),
        "selected_sources": dict(sources),
        "missing_matchup_games": len(missing_matchups),
        "metric_coverage": {
            k: sum(r["metrics"][k]["value"] is not None for r in body["players"].values())
            for k in body["catalog"]
        },
        "sources": {
            "shots": shots_asset["sha256"],
            "matchups": matchups_asset["sha256"] if matchups_asset else None,
            "boxes": box_receipts,
        },
        "elapsed_seconds": round(time.monotonic() - started, 3),
    }
    print(json.dumps({k: receipt[k] for k in ("season", "sha256", "games", "players")}), flush=True)
    return receipt


def build_stint_box(
    *, bundle_path: Path, observation: Path, raw_root: Path, output_root: Path
) -> dict[str, Any]:
    bundle = checked(bundle_path, bundle_path.name.removesuffix(".json.gz"))
    season, year = bundle["season"], int(bundle["season"][:4])
    root = raw_root / "impact-archive"
    assets = _assets(observation)
    players, _, box_receipts = retained_boxes(raw_root, year + 1)
    games: dict[str, Any] = {}
    known: Counter[str] = Counter()
    unresolved: Counter[str] = Counter()
    with tempfile.TemporaryDirectory(prefix="courtlens-r01-stint-box-") as temporary:
        store = HistoryGames(Path(temporary) / "events.sqlite")
        try:
            hashes = _load_store(store, root, assets, year)
            for gid, member in sorted(bundle["members"].items()):
                game = checked(Path(member["path"]), member["content_sha256"])
                candidate = checked(Path(member["candidate_path"]), member["candidate_sha256"])
                source = candidate["arbitration"]["selected"]
                if candidate["input_sha256"][source] != hashes[source] or any(
                    candidate["input_sha256"][f] != box_receipts[f]
                    for f in ("player_box", "team_box")
                ):
                    raise ValueError("inputs differ from the accepted candidate")
                rows = (
                    v3_rows(store, gid, players[gid])[0]
                    if source == "v3"
                    else store.get("cdn", gid)
                )
                box = stint_box(game, candidate, players[gid], rows, store.get("cdn", gid))
                games[gid] = box
                for fields in box["known_fields"].values():
                    known.update(fields)
                unresolved.update(box["unresolved"])
        finally:
            store.close()
    body = {
        "version": STINT_BOX_VERSION,
        "season": season,
        "phase": bundle["phase"],
        "bundle_content_sha256": bundle["content_sha256"],
        "method": {
            "version": STINT_BOX_VERSION,
            "contract_sha256": hash_file(Path("docs/design/stint-box-v1.md"))[0],
            "code_sha256": {
                p: hash_file(Path(p))[0]
                for p in (
                    "src/courtlens/domain/stint_box.py",
                    "src/courtlens/ingestion/impact_history_extras.py",
                )
            },
        },
        "attribution": ATTRIBUTION,
        "games": games,
    }
    path, digest = write_artifact(output_root / "stint-box", body)
    receipt = {
        "kind": "stint-box",
        "season": season,
        "phase": bundle["phase"],
        "sha256": digest,
        "path": str(path),
        "bundle_content_sha256": bundle["content_sha256"],
        "games": len(games),
        "known_team_games": {f: known[f] for f in STINT_BOX_FIELDS},
        "team_games": 2 * len(games),
        "unresolved_events": dict(unresolved),
        "box_mismatches": sum(len(g["mismatches"]) for g in games.values()),
    }
    print(json.dumps({k: receipt[k] for k in ("season", "sha256", "games")}), flush=True)
    return receipt


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("extras", "stint-box"))
    parser.add_argument("--bundle", type=Path, action="append", required=True)
    parser.add_argument("--observation", type=Path, required=True)
    parser.add_argument("--raw-root", type=Path, default=Path("data/raw"))
    parser.add_argument("--output-root", type=Path, default=Path("data/derived/impact-history-v2"))
    args = parser.parse_args()
    build = build_extras if args.command == "extras" else build_stint_box
    for path in args.bundle:
        receipt = build(
            bundle_path=path,
            observation=args.observation,
            raw_root=args.raw_root,
            output_root=args.output_root,
        )
        write_artifact(args.output_root / f"{args.command}-receipts", receipt)


if __name__ == "__main__":
    main()
