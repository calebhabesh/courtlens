"""Append-only protocol artifact packaging derived from an already completed run."""

from __future__ import annotations

import argparse
import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from courtload.database import build_engine
from courtload.domain.research_registration import ResearchProtocol, RetrospectiveShotBinding
from courtload.evaluation.research_binding import bind_shots
from courtload.evaluation.research_inputs import read_json
from courtload.evaluation.research_registration import load_document
from courtload.ingestion.sportsdataverse import hash_file
from courtload.research_models import ResearchDataset, ResearchShotMember


def _write(path: Path, value: Any) -> None:
    with path.open("x") as stream:
        json.dump(value, stream, sort_keys=True, indent=2, allow_nan=False)
        stream.write("\n")


def package_run(root: Path, output: Path) -> dict[str, Any]:
    manifest = read_json(root / "manifest.json", maximum=64 * 1024)
    if manifest["status"] == "failed_or_limited":
        raise ValueError("cannot package an incomplete run")
    for name, expected in manifest["artifacts"].items():
        path = root / name
        if not path.resolve().is_relative_to(root.resolve()) or path.is_symlink():
            raise ValueError("unsafe run artifact")
        digest, size = hash_file(path)
        if expected != {"sha256": digest, "bytes": size}:
            raise ValueError("run artifact changed")
    binding = RetrospectiveShotBinding.model_validate(
        read_json(root / "run/binding.json", maximum=8 * 1024 * 1024)
    )
    protocol = load_document(root / "run/protocol.json")
    assert isinstance(protocol, ResearchProtocol)
    binding.validate_protocol(protocol)
    if binding.content_hash() != manifest["binding_sha256"]:
        raise ValueError("run binding identity mismatch")
    with Session(build_engine()) as session:
        if (
            bind_shots(session, binding.dataset_id, protocol).content_hash()
            != binding.content_hash()
        ):
            raise ValueError("admitted memberships changed")
        exclusions = list(
            session.scalars(
                select(ResearchShotMember.payload_json)
                .where(
                    ResearchShotMember.dataset_id == binding.dataset_id,
                    ResearchShotMember.eligible.is_(False),
                )
                .order_by(ResearchShotMember.game_id, ResearchShotMember.event_id)
            )
        )
        dataset = session.get(ResearchDataset, binding.dataset_id)
        assert dataset is not None
        corrections: list[dict[str, Any]] = []
        rejected: list[dict[str, Any]] = []
        for bundle in dataset.manifest_json["bundles"]:
            path = Path(bundle["root"])
            if hash_file(path / "manifest.json")[0] != bundle["manifest_sha256"]:
                raise ValueError("admitted bundle changed")
            audit = read_json(path / "manifest.json", maximum=64 * 1024)
            for name in ("games.json", "correction-ledger.json"):
                digest, size = hash_file(path / name)
                if audit["artifacts"][name] != {"sha256": digest, "bytes": size}:
                    raise ValueError("admitted exclusion/correction evidence changed")
            rejected.extend(
                g for g in read_json(path / "games.json") if g["status"] != "reconciled"
            )
            corrections.extend(read_json(path / "correction-ledger.json")["entries"])
    output.mkdir(parents=True, exist_ok=False)
    _write(
        output / "exclusions.json",
        {
            "rejected_games": rejected,
            "geometry_excluded_shots": exclusions,
            "reviewed_source_corrections": corrections,
            "reconciliation_precedes_geometry": True,
            "dataset_content_sha256": binding.dataset_content_sha256,
        },
    )
    counts: dict[str, int] = {}
    with (
        (root / "run/predictions.jsonl").open() as source,
        (output / "baseline-predictions.jsonl").open("x") as baseline,
        (output / "candidate-predictions.jsonl").open("x") as candidate,
    ):
        for line in source:
            if len(line) > 4096:
                raise ValueError("oversized saved prediction")
            row = json.loads(line)
            identity = {k: row[k] for k in ("game_id", "event_id", "role", "actual")}
            counts[row["role"]] = counts.get(row["role"], 0) + 1
            for stream, key in ((baseline, "baseline"), (candidate, "candidate")):
                stream.write(
                    json.dumps({**identity, "probability": row[key]}, sort_keys=True) + "\n"
                )
    report = read_json(root / "run/evaluation.json")
    expected = {"selection": report["selection"]["candidate"]["rows"]}
    if report["final_report_opened"]:
        attempts = read_json(root / "run/attempts.json")
        expected.update(
            calibration=attempts["role_rows"]["calibration"],
            final_test=report["final"]["candidate"]["rows"],
        )
    if counts != expected:
        raise ValueError("prediction role membership differs from completed evaluation")
    attempts = read_json(root / "run/attempts.json")
    _write(
        output / "attempts.json",
        {
            **attempts,
            "stop_reason": report["status"],
            "candidate_configurations": list(protocol.candidate_recipes),
            "baseline_configurations": list(protocol.baseline_recipes),
            "calibration_configuration": protocol.calibration_recipe,
            "preprocessing_configuration": protocol.preprocessing_recipe,
            "packaging_fits": 0,
            "parent_manifest_sha256": hash_file(root / "manifest.json")[0],
        },
    )
    gain = 1 - report["selection"]["candidate"]["brier"] / report["selection"]["baseline"]["brier"]
    with (output / "model-card.md").open("x") as stream:
        stream.write((root / "run/model-card.md").read_text())
        stream.write(
            f"\n\nSelection Brier improvement: {100 * gain:.8f}%. Registered minimum: 1%. "
            f"Fit through: {manifest['horizons']['training']}; "
            f"report through: {manifest['report_through_date']}. "
            f"Calibration fit performed: {attempts['candidate_fits'] == 2}.\n\n"
            f"Protocol: `{manifest['protocol_sha256']}`. Binding: `{binding.content_hash()}`. "
            f"Dataset: `{binding.dataset_id}` / `{binding.dataset_content_sha256}`. "
            "Sources: NBA Stats via the pinned shufinskiy/nba_data archive "
            "(Apache 2.0 notices retained); "
            "independent SportsDataverse schedule/boxes (CC BY 4.0 attribution retained); "
            "retained official NBA observations for reviewed corrections. "
            "Local noncommercial research; "
            "raw-source redistribution is independently gated.\n\n"
            "This append-only package derives separate predictions, exclusion records "
            "and configuration "
            "metadata from the sealed run and admitted inputs. No new fit or error evaluation.\n"
        )
    result = {
        "schema_version": "courtload-research-package-v1",
        "run_id": manifest["run_id"],
        "parent_manifest_sha256": hash_file(root / "manifest.json")[0],
        "binding_sha256": binding.content_hash(),
        "packaged_at": datetime.now(UTC).isoformat(),
        "candidate_fits": 0,
        "new_error_evaluations": 0,
        "prediction_role_counts": counts,
        "implementation_sha256": hash_file(Path(__file__))[0],
        "artifacts": {
            str(p.relative_to(output)): {"sha256": hash_file(p)[0], "bytes": p.stat().st_size}
            for p in sorted(output.iterdir())
        },
    }
    _write(output / "manifest.json", result)
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--run", type=Path, required=True)
    args = parser.parse_args()
    output = args.run.parent.parent / "research-run-packages" / args.run.name
    result = package_run(args.run, output)
    print(
        json.dumps(
            {"run_id": result["run_id"], "prediction_role_counts": result["prediction_role_counts"]}
        )
    )


if __name__ == "__main__":
    main()
