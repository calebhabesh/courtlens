"""Verify two independent IM04 runs and retain readable model diagnostics."""

from __future__ import annotations

import argparse
import gzip
import json
from pathlib import Path

import numpy as np

from courtlens.ingestion.native_reconstruction import content_hash
from courtlens.ingestion.sportsdataverse import hash_file


def verify(first: Path, second: Path, output: Path) -> dict:
    left, right = (json.loads(p.read_text()) for p in (first, second))
    if left["artifacts"] != right["artifacts"]:
        raise ValueError("independent fit replay changed rating hashes")
    if left["correlations"] != right["correlations"] or left["provenance"] != right["provenance"]:
        raise ValueError("changed correlations or input provenance")
    summaries = []
    for receipt in left["artifacts"]:
        path = Path(receipt["path"])
        body = json.loads(path.read_text())
        digest = content_hash(body)
        if digest != receipt["sha256"] or hash_file(path)[0] != digest:
            raise ValueError("changed rating artifact")
        top = {}
        for label, fit in [
            ("rapm", body["rapm"]),
            *body["six_factor"].items(),
            *([("bpr", body["bpr"])] if body["bpr"] else []),
        ]:
            players = fit["players"]
            seconds = [r["seconds"] for r in players.values()]
            for side in ("offense", "defense"):
                if (
                    abs(float(np.average([r[side] for r in players.values()], weights=seconds)))
                    > 1e-9
                ):
                    raise ValueError("nonzero centered weighted mean")
            for metric, ids in fit["top20"].items():
                if any(not players[p]["qualified"] for p in ids):
                    raise ValueError("unqualified top-list entry")
                if (
                    ids
                    != sorted(
                        (p for p, r in players.items() if r["qualified"]),
                        key=lambda p: (-players[p][metric], p),
                    )[:20]
                ):
                    raise ValueError("misordered top list")
            top[label] = {
                metric: [
                    {
                        "player_id": p,
                        "value": players[p][metric],
                        "games": players[p]["games"],
                        "minutes": players[p]["seconds"] / 60,
                    }
                    for p in ids
                ]
                for metric, ids in fit["top20"].items()
            }
        summaries.append(
            {
                **receipt,
                "games": len(body["input"]["games"]),
                "quality": body["input"]["quality_counts"],
                "rapm_cv": body["rapm_cv"],
                "six_factor_cv": body["six_factor_cv"],
                "qualified_players": sum(r["qualified"] for r in body["rapm"]["players"].values()),
                "rapm_weighted_means": [
                    body["rapm"]["weighted_offense_mean"],
                    body["rapm"]["weighted_defense_mean"],
                ],
                "zero_control_observations": body["rapm"]["zero_denominator_rows"],
                "omitted_rapm_points": body["rapm"]["omitted_numerator"] / 100,
                "bpr_status": body["bpr_prior"]["status"],
                "bpr_reason": body["bpr_prior"].get("reason"),
                "margin_diagnostic": body["margin_diagnostic"],
                "top20": top,
            }
        )
        # Portable retained evidence includes complete coefficients and input/support metadata.
        destination = output.parent / "artifacts" / f"{digest}.json.gz"
        destination.parent.mkdir(exist_ok=True)
        packed = gzip.compress(path.read_bytes(), mtime=0)
        if destination.exists() and destination.read_bytes() != packed:
            raise ValueError("retained evidence changed")
        if not destination.exists():
            with destination.open("xb") as stream:
                stream.write(packed)
    result = {
        "run_receipts_sha256": [hash_file(first)[0], hash_file(second)[0]],
        "fit_seconds": [left["elapsed_seconds"], right["elapsed_seconds"]],
        "reproduced_artifacts": len(summaries),
        "artifacts": summaries,
        "correlations": left["correlations"],
        "provenance": left["provenance"],
    }
    result["content_sha256"] = content_hash(result)
    payload = gzip.compress(
        json.dumps(result, sort_keys=True, separators=(",", ":")).encode(), mtime=0
    )
    with output.open("xb") as stream:
        stream.write(payload)
    for source, name in ((first, "fit-receipt.json.gz"), (second, "replay-receipt.json.gz")):
        with (output.parent / name).open("xb") as stream:
            stream.write(gzip.compress(source.read_bytes(), mtime=0))
    print(json.dumps({"verified_artifacts": len(summaries), "evidence": str(output)}))
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--first", type=Path, required=True)
    parser.add_argument("--second", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    verify(args.first, args.second, args.output)
