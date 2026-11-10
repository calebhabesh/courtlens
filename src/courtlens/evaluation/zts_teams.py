"""Write the zTS page's team playtype difficulty file (RD03; owner-approved, descriptive only).

Usage:
    python -m courtlens.evaluation.zts_teams \
        --output evaluation/research/derived/courtlens-zts-teams-v1.json

Reads the same Synergy play-type mart rows as courtlens-zts-validation-v1 and refuses to run
unless every season's row digest equals the frozen run's `play_types_sha256`; the league
references are the frozen file's, unchanged. Fits nothing and touches no frozen result.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Any

from courtlens.database import SessionLocal
from courtlens.domain import zts_teams
from courtlens.evaluation import zts_runner as runner
from courtlens.services.zts import RESULTS_PATH

IDENTITY = "courtlens-zts-teams-v1"


def build(frozen: dict[str, Any], synergy: dict[str, Any]) -> dict[str, Any]:
    seasons = sorted(frozen["references"])
    expected = frozen["inputs"]["play_types_sha256"]
    for season in seasons:
        if synergy["sha256"].get(season) != expected[season]:
            raise SystemExit(f"play-type rows for {season} differ from the frozen zTS run")
    out: dict[str, Any] = {}
    for season in seasons:
        teams = zts_teams.team_season(synergy["rows"][season], frozen["references"][season])
        out[season] = {"league_difficulty": zts_teams.league_difficulty(teams), "teams": teams}
    payload = {
        "identity": IDENTITY,
        "inputs": {
            "zts_results_sha256": frozen["results_sha256"],
            "play_types_sha256": {s: expected[s] for s in seasons},
        },
        "seasons": out,
    }
    rounded: dict[str, Any] = runner._rounded(payload)
    rounded["teams_sha256"] = hashlib.sha256(runner.canonical(rounded)).hexdigest()
    return rounded


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    frozen = json.loads(RESULTS_PATH.read_text())
    with SessionLocal() as session:
        synergy = runner.load_play_types(session, sorted(frozen["references"]))
    result = build(frozen, synergy)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_bytes(runner.canonical(result))
    print(json.dumps({"output": str(args.output), "teams_sha256": result["teams_sha256"]}))


if __name__ == "__main__":
    main()
