"""Replay sealed expected-shot predictions without fitting or altering the retained run."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any
from uuid import uuid4

import numpy as np
from scipy.special import expit  # type: ignore[import-untyped]
from sqlalchemy import select
from sqlalchemy.orm import Session

from courtload.database import build_engine
from courtload.domain.research_registration import ResearchProtocol, RetrospectiveShotBinding
from courtload.domain.rich_sources import compute_payload_hash
from courtload.evaluation.expected_shot import baseline_predictions, design
from courtload.evaluation.research_binding import bind_shots
from courtload.evaluation.research_inputs import read_json
from courtload.evaluation.research_limits import cgroup_usage, run_limited
from courtload.evaluation.research_registration import load_document
from courtload.ingestion.sportsdataverse import hash_file
from courtload.research_models import ResearchShotMember


def replay_probabilities(rows: list[dict[str, Any]], model: dict[str, Any], role: str) -> Any:
    if role not in ("selection", "calibration", "final_test"):
        raise ValueError("unregistered replay role")
    x = (design(rows) - np.array(model["mean"])) / np.array(model["scale"])
    delta = 0 if role == "selection" else model["calibration_intercept"]
    return expit(x @ np.array(model["coefficients"]) + model["intercept"] + delta)


def reproduce(root: Path) -> dict[str, Any]:
    manifest = read_json(root / "manifest.json", maximum=64 * 1024)
    if manifest["status"] == "failed_or_limited":
        raise ValueError("no completed model to replay")
    for name, expected in manifest["artifacts"].items():
        path = root / name
        if not path.resolve().is_relative_to(root.resolve()) or path.is_symlink():
            raise ValueError("unsafe retained artifact")
        digest, size = hash_file(path)
        if expected != {"sha256": digest, "bytes": size}:
            raise ValueError("retained run artifact changed")
    protocol = load_document(root / "run/protocol.json")
    assert isinstance(protocol, ResearchProtocol)
    binding = RetrospectiveShotBinding.model_validate(
        read_json(root / "run/binding.json", maximum=8 * 1024 * 1024)
    )
    binding.validate_protocol(protocol)
    if (
        binding.content_hash() != manifest["binding_sha256"]
        or protocol.content_hash() != manifest["protocol_sha256"]
    ):
        raise ValueError("run binding identity changed")
    limits = cgroup_usage()
    if (
        limits["memory_limit_bytes"] > protocol.budget.max_peak_rss_mib * 1024 * 1024
        or len(limits["cpu_affinity"]) > protocol.budget.cpu_threads
    ):
        raise ValueError("replay resource caps are not enforced")
    model = read_json(root / "run/model.json")
    report = read_json(root / "run/evaluation.json")
    roles = ["selection"] + (["calibration", "final_test"] if report["selection_passed"] else [])
    selection, calibration = set(binding.selection_games), set(binding.calibration_games)
    count = 0
    maximum_error = 0.0
    with Session(build_engine()) as session, (root / "run/predictions.jsonl").open() as stream:
        if (
            bind_shots(session, binding.dataset_id, protocol).content_hash()
            != binding.content_hash()
        ):
            raise ValueError("database differs from sealed binding")
        for role in roles:
            games = sorted(
                (
                    g
                    for g in binding.games
                    if (
                        g.game_id in selection
                        if role == "selection"
                        else g.game_id in calibration
                        if role == "calibration"
                        else g.role == "final_test"
                    )
                ),
                key=lambda g: g.game_id,
            )
            for game in games:
                rows = list(
                    session.scalars(
                        select(ResearchShotMember.payload_json)
                        .where(
                            ResearchShotMember.dataset_id == binding.dataset_id,
                            ResearchShotMember.game_id == game.game_id,
                            ResearchShotMember.eligible.is_(True),
                        )
                        .order_by(ResearchShotMember.event_id)
                    )
                )
                if (
                    len(rows) != game.rows
                    or compute_payload_hash(rows) != game.row_membership_sha256
                ):
                    raise ValueError("replay row membership changed")
                candidate = replay_probabilities(rows, model, role)
                baseline = baseline_predictions(rows, model["baseline"])
                for row, left, right in zip(rows, candidate, baseline, strict=True):
                    line = stream.readline(4097)
                    if len(line) > 4096 or not line.endswith("\n"):
                        raise ValueError("missing or oversized prediction")
                    saved = json.loads(line)
                    if any(
                        saved[k] != v
                        for k, v in {
                            "game_id": row["game_id"],
                            "event_id": row["event_id"],
                            "role": role,
                            "actual": int(row["made"]),
                        }.items()
                    ):
                        raise ValueError("prediction identity/outcome mismatch")
                    error = max(
                        abs(saved["candidate"] - float(left)), abs(saved["baseline"] - float(right))
                    )
                    if not np.isfinite(error) or error > 1e-12:
                        raise ValueError("saved-model prediction replay mismatch")
                    maximum_error = max(maximum_error, error)
                    count += 1
        if stream.read(1):
            raise ValueError("unexpected extra predictions")
    return {
        "run_id": manifest["run_id"],
        "manifest_sha256": hash_file(root / "manifest.json")[0],
        "status": "reproduced",
        "predictions": count,
        "maximum_absolute_error": maximum_error,
        "candidate_fits": 0,
        "process_tree": cgroup_usage(),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--run", type=Path, required=True)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--worker", action="store_true")
    args = parser.parse_args()
    output = (
        args.output
        or args.run.parent.parent / "research-reproductions" / f"{args.run.name}-{uuid4()}"
    )
    if args.worker:
        result = reproduce(args.run)
        with (output / "reproduction.json").open("x") as stream:
            json.dump(result, stream, sort_keys=True, indent=2, allow_nan=False)
        print(json.dumps(result))
        return
    protocol = load_document(args.run / "run/protocol.json")
    assert isinstance(protocol, ResearchProtocol)
    output.mkdir(parents=True, exist_ok=False)
    result = run_limited(
        [
            sys.executable,
            "-m",
            "courtload.evaluation.research_reproduce",
            "--run",
            str(args.run.resolve()),
            "--output",
            str(output.resolve()),
            "--worker",
        ],
        budget=protocol.budget,
        output=output / "supervisor",
        working_directory=Path.cwd(),
    )
    print(json.dumps({"status": result["status"], "output": str(output)}))
    if result["status"] != "completed":
        raise SystemExit(2)


if __name__ == "__main__":
    main()
