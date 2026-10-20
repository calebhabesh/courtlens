"""Install per-team play-by-play extras for team-filtered Stats rows (split seasons).

The sealed IM05 extras are one row per player-season. Their committed per-game facts already name
the player's team in each game, so this aggregates the same facts per (player, team) with the
same code. Nothing sealed changes: the output is a separate content-addressed sidecar keyed by
the extras artifact it splits. It is reproducible from docs/evidence alone.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

from courtlens.domain.impact_extras import aggregate, aggregate_by_team
from courtlens.evaluation.impact_rating_inputs import checked, write_artifact
from courtlens.evaluation.impact_serving_build import project_team_split as project
from courtlens.ingestion.impact_population import read_json
from courtlens.ingestion.native_reconstruction import content_hash
from courtlens.services.impact_team_splits import VERSION


def build(evidence_root: Path, output: Path) -> tuple[Path, str]:
    receipt = checked(evidence_root / "im05/build-receipt.json.gz")
    entries: dict[str, Any] = {}
    for item in sorted(receipt["artifacts"], key=lambda r: (r["season"], r["phase"])):
        digest, fact_digest = item["sha256"], item["fact_sha256"]
        artifact = read_json(evidence_root / "im05/artifacts" / f"{digest}.json.gz")
        facts = read_json(evidence_root / "im05/facts" / f"{fact_digest}.json.gz")
        if content_hash(artifact) != digest or content_hash(facts) != fact_digest:
            raise ValueError(f"changed sealed extras evidence: {item['season']} {item['phase']}")
        cutoff = artifact["cutoff"]
        # The facts must reproduce the sealed season result before they are split.
        season = aggregate(facts, cutoff)
        if season["players"] != artifact["players"] or season["league"] != artifact["league"]:
            raise ValueError(f"facts do not reproduce sealed extras: {digest}")
        split = aggregate_by_team(facts, cutoff)
        entries[digest] = {
            "season": artifact["season"],
            "phase": artifact["phase"],
            "cutoff": cutoff,
            "fact_sha256": fact_digest,
            "players": {
                pid: {team: project(row, digest, cutoff, team) for team, row in teams.items()}
                for pid, teams in sorted(split["players"].items())
            },
        }
    body = {
        "version": VERSION,
        "im05_receipt_sha256": receipt["content_sha256"],
        "entries": entries,
    }
    return write_artifact(output, body)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--evidence-root", type=Path, default=Path("docs/evidence"))
    parser.add_argument("--output", type=Path, default=Path("data/derived/impact-team-splits-v1"))
    args = parser.parse_args()
    path, digest = build(args.evidence_root, args.output)
    print(json.dumps({"path": str(path), "sha256": digest}))
