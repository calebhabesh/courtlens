"""Explicit offline experiment launcher and immutable terminal-artifact registry."""

from __future__ import annotations

import argparse
import fcntl
import json
import shlex
import sys
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from uuid import uuid4

from courtload.domain.research_registration import ResearchProtocol, RetrospectiveShotBinding
from courtload.evaluation.research_inputs import read_json
from courtload.evaluation.research_limits import run_limited
from courtload.evaluation.research_package import package_run
from courtload.evaluation.research_registration import load_document
from courtload.ingestion.sportsdataverse import hash_file


def launch(protocol_path: Path, binding_path: Path, registry: Path) -> dict[str, Any]:
    protocol = load_document(protocol_path)
    if not isinstance(protocol, ResearchProtocol):
        raise ValueError("registered research protocol required")
    binding = RetrospectiveShotBinding.model_validate(
        read_json(binding_path, maximum=8 * 1024 * 1024)
    )
    binding.validate_protocol(protocol)
    claims = registry / "bindings"
    claims.mkdir(parents=True, exist_ok=True)
    protocols = registry / "protocols"
    protocols.mkdir(parents=True, exist_ok=True)
    with (protocols / f"{protocol.content_hash()}.lock").open("a") as protocol_lock:
        fcntl.flock(protocol_lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        protocol_claim = protocols / f"{protocol.content_hash()}.json"
        if protocol_claim.exists():
            if read_json(protocol_claim)["binding_sha256"] != binding.content_hash():
                raise ValueError(
                    "protocol already bound; changing inputs cannot reset its fit budget"
                )
        else:
            for index, prior in enumerate(registry.iterdir()):
                if index >= 2000:
                    raise ValueError("registry directory budget exceeded")
                if (prior / "manifest.json").is_file():
                    previous = read_json(prior / "manifest.json", maximum=64 * 1024)
                    if (
                        previous["protocol_sha256"] == protocol.content_hash()
                        and previous["binding_sha256"] != binding.content_hash()
                    ):
                        raise ValueError(
                            "protocol already bound; changing inputs cannot reset its fit budget"
                        )
            with protocol_claim.open("x") as stream:
                json.dump(
                    {
                        "protocol_sha256": protocol.content_hash(),
                        "binding_sha256": binding.content_hash(),
                    },
                    stream,
                )
        with (claims / f"{binding.content_hash()}.lock").open("a") as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            return _launch_locked(protocol_path, binding_path, registry)


def _launch_locked(protocol_path: Path, binding_path: Path, registry: Path) -> dict[str, Any]:
    protocol = load_document(protocol_path)
    if (
        not isinstance(protocol, ResearchProtocol)
        or protocol.experiment != "courtload-expected-shot-retrospective-v2"
    ):
        raise ValueError("this runner requires the admitted retrospective expected-shot protocol")
    binding = RetrospectiveShotBinding.model_validate(
        read_json(binding_path, maximum=8 * 1024 * 1024)
    )
    binding.validate_protocol(protocol)
    run_id = str(uuid4())
    claims = registry / "bindings"
    claims.mkdir(parents=True, exist_ok=True)
    prior_claims = list(claims.glob(f"{binding.content_hash()}*.json"))
    for claim_path in prior_claims:
        claim = read_json(claim_path)
        prior = registry / str(claim["run_id"])
        if prior.parent != registry or not (prior / "manifest.json").is_file():
            raise ValueError("binding has an incomplete or unverified attempt")
        manifest = read_json(prior / "manifest.json")
        for name, expected in manifest["artifacts"].items():
            path = prior / name
            if (
                path.resolve().is_relative_to(prior.resolve()) is False
                or hash_file(path)[0] != expected["sha256"]
            ):
                raise ValueError("previous attempt evidence changed")
        log = (prior / "supervisor/supervisor.log").read_text()
        if (
            manifest["binding_sha256"] != binding.content_hash()
            or manifest["status"] != "failed_or_limited"
            or not (prior / "run").is_dir()
            or any((prior / "run").iterdir())
            or "ValueError: preregistered process-tree resource caps are not enforced" not in log
        ):
            raise ValueError("binding already attempted fitting or evaluation; rerun refused")
    claim_name = (
        f"{binding.content_hash()}-{run_id}.json"
        if prior_claims
        else f"{binding.content_hash()}.json"
    )
    with (claims / claim_name).open("x") as stream:
        json.dump({"run_id": run_id, "binding_sha256": binding.content_hash()}, stream)
    root = registry / run_id
    root.mkdir(parents=True, exist_ok=False)
    implementation = root / "implementation"
    implementation.mkdir()
    for name in (
        "expected_shot.py",
        "research_limits.py",
        "research_inputs.py",
        "research_binding.py",
        "research_runner.py",
    ):
        (implementation / name).write_bytes(Path(__file__).with_name(name).read_bytes())
    command = [
        sys.executable,
        "-m",
        "courtload.evaluation.expected_shot",
        "--protocol",
        str(protocol_path.resolve()),
        "--binding",
        str(binding_path.resolve()),
        "--output",
        str((root / "run").resolve()),
    ]
    limits = run_limited(
        command, budget=protocol.budget, output=root / "supervisor", working_directory=Path.cwd()
    )
    report = read_json(root / "run/evaluation.json") if limits["status"] == "completed" else None
    if report is None:
        with (root / "model-card.md").open("x") as stream:
            stream.write(
                "# CourtLoad expected shots: failed or resource-limited attempt\n\n"
                "The bounded worker failed before producing a complete result. "
                "Consult retained limits and supervisor logs. "
                "No completed evaluation or promotion.\n"
            )
    files = {
        str(p.relative_to(root)): {"sha256": hash_file(p)[0], "bytes": p.stat().st_size}
        for p in sorted(root.rglob("*"))
        if p.is_file()
    }
    horizons = {
        role: max(g.game_date for g in binding.games if g.role == role).isoformat()
        for role in ("training", "validation", "final_test")
    }
    manifest = {
        "schema_version": "courtload-research-run-v1",
        "run_id": run_id,
        "experiment": protocol.experiment,
        "protocol_sha256": protocol.content_hash(),
        "binding_sha256": binding.content_hash(),
        "dataset_id": binding.dataset_id,
        "dataset_content_sha256": binding.dataset_content_sha256,
        "classification": "retrospective_research",
        "final_previously_exposed": True,
        "status": report["status"] if report is not None else "failed_or_limited",
        "final_report_opened": report["final_report_opened"] if report is not None else None,
        "registered_at": datetime.now(UTC).isoformat(),
        "horizons": horizons,
        "report_through_date": max(
            g.game_date
            for g in binding.games
            if (
                g.role == "final_test"
                if report is not None and report["final_report_opened"]
                else g.game_id in set(binding.selection_games)
            )
        ).isoformat(),
        "limits": limits,
        "prospective_promotion_authorized": False,
        "artifacts": files,
        "implementation_sha256": {
            name: hash_file(Path(__file__).with_name(name))[0]
            for name in (
                "expected_shot.py",
                "research_limits.py",
                "research_inputs.py",
                "research_binding.py",
                "research_runner.py",
            )
        },
        "reproduction_command": shlex.join(
            ["python", "-m", "courtload.evaluation.research_reproduce", "--run", str(root)]
        ),
    }
    with (root / "manifest.json").open("x") as stream:
        json.dump(manifest, stream, sort_keys=True, indent=2, allow_nan=False)
        stream.write("\n")
    if report is not None:
        package_run(root, registry.parent / "research-run-packages" / run_id)
    return manifest


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--protocol", type=Path, required=True)
    parser.add_argument("--binding", type=Path, required=True)
    parser.add_argument("--registry", type=Path, required=True)
    args = parser.parse_args()
    result = launch(args.protocol, args.binding, args.registry)
    print(json.dumps({"run_id": result["run_id"], "status": result["status"]}))
    if result["status"] == "failed_or_limited":
        raise SystemExit(2)


if __name__ == "__main__":
    main()
