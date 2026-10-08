"""Read back the complete IM08 source matrix and independently check rate and scope hashes."""

from __future__ import annotations

import argparse
from collections import Counter
from datetime import datetime
from itertools import pairwise
from pathlib import Path

from courtlens.ingestion.impact_archive import write_json
from courtlens.ingestion.nba_browser import (
    ADMISSION_REASON,
    MIN_INTERVAL_SECONDS,
    reference_scope,
    targets,
    verify_receipt,
)
from courtlens.ingestion.sportsdataverse import hash_file


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path("data/raw/nba-direct"))
    parser.add_argument("--receipt", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--archive-root", type=Path, default=Path("data/raw/impact-archive"))
    parser.add_argument(
        "--archive-observation",
        type=Path,
        default=Path(
            "data/raw/impact-archive/observations/068decb9-4599-4385-91dc-a541f1302ff3.json"
        ),
    )
    parser.add_argument("--boxes-root", type=Path, default=Path("data/raw"))
    args = parser.parse_args()
    first = verify_receipt(args.root, args.receipt)
    second = verify_receipt(args.root, args.receipt)
    assert first == second
    actual = first["results"]
    game = next((r["game_id"] for r in actual if r["kind"] == "play_by_play"), None)
    expected = targets(first["scope"]["season"], first["scope"]["phase"], game)
    assert [r["key"] for r in actual] == [r["key"] for r in expected]
    assert all(
        r["status"] == "source_blocked" and r["admission_reason"] == ADMISSION_REASON
        for r in actual
    )
    starts = [datetime.fromisoformat(r["transport"]["started_at"]) for r in actual]
    gaps = [(b - a).total_seconds() for a, b in pairwise(starts)]
    assert all(gap >= MIN_INTERVAL_SECONDS for gap in gaps)
    assert first["browser"]["concurrency"] == 1 and first["browser"]["retries"] == 0
    # The denominator is regenerated from actual independent retained bytes, not report counts.
    fresh_scope = reference_scope(
        first["scope"]["season"],
        first["scope"]["phase"],
        args.archive_root,
        args.archive_observation,
        args.boxes_root,
    )
    assert fresh_scope == first["scope"]
    write_json(
        args.output,
        {
            "version": "courtlens-im08-source-verification-v1",
            "observation_id": first["observation_id"],
            "observation_content_sha256": first["content_sha256"],
            "receipt_sha256": hash_file(args.receipt)[0],
            "two_identical_readbacks": True,
            "complete_endpoint_matrix": len(actual),
            "source_blocked": len(actual),
            "technical_outcomes": dict(Counter(r["technical_status"] for r in actual)),
            "independent_scope_reproduced": True,
            "expected_games": len(fresh_scope["game_ids"])
            if fresh_scope["game_ids"] is not None
            else None,
            "expected_players": len(fresh_scope["player_ids"])
            if fresh_scope["player_ids"] is not None
            else None,
            "minimum_request_start_gap_seconds": min(gaps),
            "maximum_request_start_gap_seconds": max(gaps),
            "retained_assets": [r["asset"] for r in actual if r["asset"]],
            "database_admission": False,
            "boundary": "source diagnostics only; no analytical values or freshness established",
        },
    )
    print(f"{len(actual)} endpoints accounted for; two exact readbacks and independent scope pass")


if __name__ == "__main__":
    main()
