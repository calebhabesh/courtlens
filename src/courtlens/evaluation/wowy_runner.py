"""Explicit offline PC11 run: WOWY pair splits from the sealed, event-accepted IM03 stints.

    .venv/bin/python -m courtlens.evaluation.wowy_runner [--output data/derived/wowy-v1]

Reads only hash-checked inputs (the IM04 binding) and writes one content-addressed artifact.
"""

from __future__ import annotations

import argparse
import time
from pathlib import Path
from typing import Any

from courtlens.domain.wowy import MIN_POSSESSIONS, TOP_PLAYERS, VERSION, cohort_splits, team_stints
from courtlens.evaluation.impact_rating_inputs import read_accepted_inputs, write_artifact
from courtlens.ingestion.sportsdataverse import hash_file

CONTRACT = "docs/design/gated-pages-v1.md"
CODE = ("src/courtlens/domain/wowy.py", "src/courtlens/evaluation/wowy_runner.py")


def build(acceptance: Path, bundles: Path) -> dict[str, Any]:
    cohorts, provenance = read_accepted_inputs(acceptance, bundles)
    return {
        "version": VERSION,
        "parameters": {"top_players": TOP_PLAYERS, "min_possessions": MIN_POSSESSIONS},
        "inputs": {
            "acceptance_sha256": provenance["acceptance_sha256"],
            "datasets": {
                key: cohort["dataset"]["content_sha256"]
                for key, cohort in sorted(provenance["cohorts"].items())
            },
        },
        "code_sha256": {name: hash_file(Path(name))[0] for name in CODE},
        "cohorts": {
            key: {
                "season": cohort["season"],
                "phase": cohort["phase"],
                "games": len(cohort["games"]),
                "last_game_date": max(g["day"] for g in cohort["games"].values()),
                "teams": cohort_splits(team_stints(cohort["stints"])),
            }
            for key, cohort in sorted(cohorts.items())
        },
    }


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
    parser.add_argument("--output", type=Path, default=Path("data/derived/wowy-v1"))
    args = parser.parse_args()
    started = time.perf_counter()
    path, digest = write_artifact(args.output, build(args.acceptance, args.bundles))
    print(f"{path} {digest} {time.perf_counter() - started:.1f}s")


if __name__ == "__main__":
    main()
