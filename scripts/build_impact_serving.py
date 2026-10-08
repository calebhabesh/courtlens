"""Install a reproducible, exclusively-created projection of sealed IM04/IM05 outputs."""

from __future__ import annotations

import argparse
import gzip
import json
from pathlib import Path
from typing import Any

from courtlens.evaluation.impact_rating_inputs import checked, write_artifact
from courtlens.ingestion.native_reconstruction import content_hash
from courtlens.ingestion.sportsdataverse import hash_file
from courtlens.services.impact_serving import VERSION

ACCEPTED = {
    "im04": "56fbcb4eaf70b3ffc51f7c62d5d0368ad605e79380949bd89a627291024729ce",
    "im05": "1de8b0fbac6e8bea6f6db7aaf9dbf9f826c20327aed02647a59989665b4ebd62",
}


def coverage(provenance: dict[str, Any], season: str, phase: str) -> dict[str, Any]:
    summary = provenance["im02_summary"]
    counts = summary["quality_counts"]
    return {
        "season": season,
        "phase": phase,
        "scheduled_games": summary["scheduled_games"],
        "admitted_games": counts.get("clean", 0) + counts.get("patched", 0),
        "clean_games": counts.get("clean", 0),
        "patched_games": counts.get("patched", 0),
        "excluded_games": counts.get("excluded", 0),
        "patch_rate": counts.get("patched", 0)
        / max(1, counts.get("clean", 0) + counts.get("patched", 0)),
        "dataset": provenance["dataset"],
        "minute_diagnostic": summary["minutes_nonexcluded"],
        "plus_minus_diagnostic": summary["plus_minus_nonexcluded"],
        "estimate_within_two_percent": 100
        * provenance["box_estimate"]["within_two"]
        / provenance["box_estimate"]["comparisons"],
    }


def project_rating(body: dict[str, Any], digest: str, provenance: dict[str, Any]) -> dict[str, Any]:
    inp = body["input"]
    years = len(inp["seasons"])
    suffix = "" if years == 1 else f"_{years}y"
    players: dict[str, Any] = {}
    for pid, sample in body["rapm"]["players"].items():
        row: dict[str, Any] = {"metrics": {}, "support": {}, "on_off": {}}
        for family, names in (
            ("rapm", ("orapm", "drapm", "rapm")),
            ("bpr", ("obpr", "dbpr", "bpr")),
        ):
            fit = body[family]
            for name, field in zip(names, ("offense", "defense", "total"), strict=True):
                metric = name + suffix
                support = (
                    fit["players"][pid]
                    if fit
                    else {"qualified": False, "reason": body["bpr_prior"]["reason"]}
                )
                row["metrics"][metric] = support[field] if support.get("qualified") else None
                row["support"][metric] = {
                    **support,
                    "artifact_sha256": digest,
                    "years": years,
                    "cutoff": inp["cutoff"],
                    "covered_games": sample["games"],
                }
        if years == 1:
            for target in ("ts", "tov", "reb"):
                support = body["six_factor"][target]["players"][pid]
                for prefix, field in (("o", "offense"), ("d", "defense")):
                    metric = f"{prefix}_{target}"
                    row["metrics"][metric] = support[field] if support["qualified"] else None
                    row["support"][metric] = {
                        **support,
                        "artifact_sha256": digest,
                        "years": 1,
                        "cutoff": inp["cutoff"],
                        "covered_games": support["games"],
                    }
            row["on_off"] = {
                key.split(":")[1]: value
                for key, value in body["on_off"].items()
                if key.split(":")[0] == pid
            }
        players[pid] = row
    return {
        "kind": "ratings",
        "sha256": digest,
        "scope": {
            "season": inp["seasons"][-1],
            "seasons": inp["seasons"],
            "phase": inp["phase"],
            "years": years,
            "cutoff": inp["cutoff"],
            "last_included_date": max(g["day"] for g in inp["games"].values()),
        },
        "coverage": [
            coverage(provenance[f"{s}:{inp['phase']}"], s, inp["phase"]) for s in inp["seasons"]
        ],
        "players": players,
    }


def build(evidence_root: Path, output: Path) -> tuple[Path, str]:
    accepted = {}
    for block, digest in ACCEPTED.items():
        base = evidence_root / block
        seal = checked(base / "acceptance.json.gz", digest)
        for name, expected in seal.get(
            "evidence_file_sha256", seal.get("evidence_sha256", {})
        ).items():
            if hash_file(base / name)[0] != expected:
                raise ValueError(f"changed sealed evidence: {block}/{name}")
        accepted[block] = seal
    ratings_receipt = json.loads(
        gzip.decompress((evidence_root / "im04/fit-receipt.json.gz").read_bytes())
    )
    extras_receipt = checked(evidence_root / "im05/build-receipt.json.gz")
    entries = []
    for block in ACCEPTED:
        for digest in sorted(accepted[block]["artifact_hashes"]):
            path = evidence_root / block / "artifacts" / f"{digest}.json.gz"
            body = json.loads(gzip.decompress(path.read_bytes()))
            if content_hash(body) != digest:
                raise ValueError("changed accepted artifact")
            if block == "im04":
                entries.append(
                    project_rating(body, digest, ratings_receipt["provenance"]["cohorts"])
                )
            else:
                receipt = next(r for r in extras_receipt["artifacts"] if r["sha256"] == digest)
                entries.append(
                    {
                        "kind": "extras",
                        "sha256": digest,
                        "scope": {
                            "season": body["season"],
                            "seasons": [body["season"]],
                            "phase": body["phase"],
                            "years": 1,
                            "cutoff": body["cutoff"],
                            "last_included_date": max(g["day"] for g in body["input"].values()),
                        },
                        "coverage": [
                            coverage(receipt["im03_provenance"], body["season"], body["phase"])
                        ],
                        "players": {
                            pid: {
                                "metrics": {k: s["value"] for k, s in r["metrics"].items()},
                                "support": {
                                    k: {**s, "artifact_sha256": digest, "cutoff": body["cutoff"]}
                                    for k, s in r["metrics"].items()
                                },
                                "on_off": {},
                            }
                            for pid, r in body["players"].items()
                        },
                    }
                )
    body = {"version": VERSION, "acceptances": ACCEPTED, "entries": entries}
    return write_artifact(output, body)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--evidence-root", type=Path, default=Path("docs/evidence"))
    parser.add_argument("--output", type=Path, default=Path("data/derived/impact-serving-v1"))
    args = parser.parse_args()
    path, digest = build(args.evidence_root, args.output)
    print(json.dumps({"path": str(path), "sha256": digest}))
