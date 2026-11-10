"""Facts the Lineup Model page shows beside the frozen results (`courtlens-lineup-model-v1`, R14).

Counts and identities only, no model output: per-season stint coverage and cold-start counts
(`lineup_model_data.data_check`, the same function as the pre-registration data check), and,
for every player in the 2026-27 tool or map, his name and the team he last played for in the
window (the season-matched photo and logo), from the sealed shot-zones bundle. Committed as
`evaluation/research/frozen/courtlens-lineup-model-v1-facts.json`, hash-checked by the API.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

import numpy as np

from courtlens.domain.research_registry import load_registration
from courtlens.evaluation import lineup_model_data as data
from courtlens.ingestion.native_reconstruction import content_hash

FACTS_PATH = Path("evaluation/research/frozen/courtlens-lineup-model-v1-facts.json")
SHOT_ZONES = Path("data/derived/shot-zones-v1")


def identities(seasons: tuple[str, ...]) -> dict[str, dict[str, Any]]:
    """Player -> name and last team in the latest window season he played (newest first)."""
    bundle = json.loads(next(SHOT_ZONES.glob("*.json")).read_bytes())
    out: dict[str, dict[str, Any]] = {}
    for season in reversed(seasons):
        for p in bundle["seasons"][season]["players"]:
            if p["player_id"] in out or not p.get("teams"):
                continue
            last = p["teams"][-1]
            out[p["player_id"]] = {
                "name": p["name"],
                "season": season,
                "team_id": last["team_id"],
                "tricode": last["tricode"],
                "teams": [t["tricode"] for t in p["teams"]],
            }
    return out


def build(output: Path) -> dict[str, Any]:
    pinned = load_registration(data.REGISTRATION).parameters["dataset_sha256"]
    s, b = data.read_dataset(output, pinned)
    check = data.data_check(s, b, pinned)
    window = data.make_window(s, b, data.SERVING)
    possessions = data.on_court_possessions(s, window.train)
    known = identities(window.seasons)
    players = {}
    for p in np.flatnonzero(possessions > 0):
        pid = s.players[p]
        own = bool(np.isin(p, window.own))
        players[pid] = {
            **known.get(pid, {"name": None, "season": None, "team_id": None, "tricode": None}),
            "status": "own" if own else "box" if window.has_box[p] else "newcomer",
            "window_possessions": round(float(possessions[p]), 1),
        }
    body = {
        "version": data.REGISTRATION,
        "dataset": pinned,
        "seasons": check["seasons"],
        "totals": check["totals"],
        "cold_start": check["cold_start"],
        "threshold": check["threshold"],
        "leakage_plan": check["leakage_plan"],
        "excluded_games": check["excluded_games"],
        "serving_window": list(window.seasons),
        "players": players,
        "players_without_identity": sorted(p for p, v in players.items() if v["name"] is None),
    }
    body["facts_sha256"] = content_hash(body)
    return body


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=data.OUTPUT)
    args = parser.parse_args()
    body = build(args.output)
    FACTS_PATH.write_text(json.dumps(body, indent=1, sort_keys=True) + "\n")
    print(
        json.dumps(
            {
                "facts_sha256": body["facts_sha256"],
                "players": len(body["players"]),
                "without_identity": body["players_without_identity"],
            }
        )
    )


if __name__ == "__main__":
    main()
