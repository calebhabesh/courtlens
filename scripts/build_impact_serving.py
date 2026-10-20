"""Install a reproducible, exclusively-created projection of sealed IM04/IM05 outputs."""

from __future__ import annotations

import argparse
import gzip
import json
from pathlib import Path

from courtlens.evaluation.impact_rating_inputs import checked, write_artifact
from courtlens.evaluation.impact_serving_build import project_extras, project_rating
from courtlens.ingestion.native_reconstruction import content_hash
from courtlens.ingestion.sportsdataverse import hash_file
from courtlens.services.impact_serving import VERSION

ACCEPTED = {
    "im04": "56fbcb4eaf70b3ffc51f7c62d5d0368ad605e79380949bd89a627291024729ce",
    "im05": "1de8b0fbac6e8bea6f6db7aaf9dbf9f826c20327aed02647a59989665b4ebd62",
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
                entries.append(project_extras(body, digest, receipt["im03_provenance"]))
    body = {"version": VERSION, "acceptances": ACCEPTED, "entries": entries}
    return write_artifact(output, body)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--evidence-root", type=Path, default=Path("docs/evidence"))
    parser.add_argument("--output", type=Path, default=Path("data/derived/impact-serving-v1"))
    args = parser.parse_args()
    path, digest = build(args.evidence_root, args.output)
    print(json.dumps({"path": str(path), "sha256": digest}))
