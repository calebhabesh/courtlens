"""Reproduce Atlanta's gate failure from hash-verified retained archive/box inputs."""

import argparse
from pathlib import Path

from courtlens.domain.impact_possessions import build_impact_game
from courtlens.domain.possession_repair import normalize_events, order_same_clock
from courtlens.ingestion.impact_archive import archive_rows, write_json
from courtlens.ingestion.impact_population import read_json, verified_report
from courtlens.ingestion.impact_repair_audit import retained_boxes
from courtlens.ingestion.native_reconstruction import content_hash
from courtlens.ingestion.sportsdataverse import hash_file
from courtlens.ingestion.workbench_normalization import normalize_game_id

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--output", type=Path, help="new append-only JSON evidence path")
args = parser.parse_args()
gid = "0022400001"
accepted = verified_report(Path("docs/evidence/im02/audit-accepted-first.json.gz"))
member = accepted["seasons"]["2024-25:regular_season"]["games"][gid]
candidate = read_json(Path(member["candidate_path"]))
source = candidate["arbitration"]["selected"]
digest = candidate["input_sha256"][source]
path = Path("data/raw/impact-archive/objects") / digest[:2] / digest
if hash_file(path)[0] != digest:
    raise ValueError("source bytes changed")
family = "nbastatsv3" if source == "v3" else "cdnnba"
rows = [
    {**row, "_row_index": str(index)}
    for index, row in enumerate(archive_rows(path, f"{family}_2024"))
    if normalize_game_id(row["gameId"]) == gid
]
players, boxes, box_receipts = retained_boxes(Path("data/raw"), 2025)
if box_receipts != accepted["seasons"]["2024-25:regular_season"]["box_receipts"]:
    raise ValueError("box receipts changed")
events, _ = order_same_clock(
    normalize_events(rows, source=source, source_sha256=digest, boxes=players[gid]), gid
)
lookup = {int(row["_row_index"]): row for row in rows}
retained = read_json(Path("docs/evidence/im03/coverage-and-conservation.json.gz"))
selected = retained["cohorts"]["2024-25:regular_season"]["games"][gid]
stored_digest = selected["content_sha256"]
stored = read_json(
    Path("data/derived/impact-population/games") / stored_digest[:2] / f"{stored_digest}.json.gz"
)
home, away = stored["stints"][0]["home_team_id"], stored["stints"][0]["away_team_id"]
game = build_impact_game(
    candidate=candidate,
    events=events,
    raw_rows=lookup,
    home_team=home,
    away_team=away,
    team_boxes=boxes[gid],
)
if game != stored or game["content_sha256"] != stored_digest:
    raise ValueError("source replay differs from sealed game")
examples = []
for possession in game["possessions"]:
    if possession["offense_team_id"] != "1610612737":
        continue
    stats = possession["stats_json"]
    if stats["fta"] or stats["fga"] - stats["orb"] + stats["turnovers"] <= 1:
        continue
    examples.append(
        {
            "period": possession["period"],
            "start_order_index": possession["start_order_index"],
            "end_order_index": possession["end_order_index"],
            "fga": stats["fga"],
            "player_orb": stats["orb"],
            "events": [
                {
                    "locator": event.locator(),
                    "kind": event.kind,
                    "team_id": event.team_id,
                    "player_id": event.player_id,
                    "description": lookup[event.row_index].get("description", ""),
                }
                for event in events[
                    possession["start_order_index"] : possession["end_order_index"] + 1
                ]
            ],
        }
    )
proof = {
    "game_id": gid,
    "game_sha256": game["content_sha256"],
    "candidate_sha256": member["content_sha256"],
    "source_sha256": digest,
    "script_sha256": hash_file(Path(__file__))[0],
    "box_receipts": box_receipts,
    "conservation": game["conservation"],
    "continuing_possessions": examples,
}
proof["content_sha256"] = content_hash(proof)
if args.output:
    write_json(args.output, proof)
print(f"Source replay exact: {gid}, {len(examples)} continuing Atlanta possessions")
