"""Readiness audits never manufacture an untouched final from missing metadata."""

import hashlib
import json
from pathlib import Path

import pytest

from courtlens.evaluation.research_readiness import retained_exposure_inventory


def test_exposure_boundary_and_exact_registration_hash(tmp_path: Path) -> None:
    run = tmp_path / "run-a"
    run.mkdir()
    registration = run / "preopen-registration.json"
    registration.write_text(json.dumps({"final_split_boundary": {"season": "2025-26"}}))
    manifest = {
        "run_id": "run-a",
        "final_test_opened": True,
        "preopen_registration_sha256": hashlib.sha256(registration.read_bytes()).hexdigest(),
    }
    (run / "run-manifest.json").write_text(json.dumps(manifest))
    # Malformed final results must never be parsed by a metadata audit.
    (run / "final-predictions.jsonl").write_text("DO NOT OPEN")
    (run / "evaluation-report.json").write_text("DO NOT OPEN")
    result = retained_exposure_inventory(tmp_path)[0]
    assert result["final_test_opened"] is True
    assert result["final_boundary"] == {"season": "2025-26"}
    assert result["registration_hash_matches_manifest"] is True
    registration.write_text(json.dumps({"final_split_boundary": {"season": "2024-25"}}))
    assert retained_exposure_inventory(tmp_path)[0]["registration_hash_matches_manifest"] is False


def test_missing_exposure_metadata_remains_unknown(tmp_path: Path) -> None:
    run = tmp_path / "run-b"
    run.mkdir()
    (run / "run-manifest.json").write_text("{}")
    record = retained_exposure_inventory(tmp_path)[0]
    assert record["final_test_opened"] is None
    assert record["final_boundary"] is None
    assert record["registration_hash_matches_manifest"] is None
    assert retained_exposure_inventory(tmp_path / "absent") == []


def test_legacy_boundary_is_preserved(tmp_path: Path) -> None:
    run = tmp_path / "legacy"
    run.mkdir()
    (run / "run-manifest.json").write_text('{"final_test_opened": true}')
    (run / "preopen-registration.json").write_text(
        '{"s3_boundary": {"season": "2023-24", "role": "final_test"}}'
    )
    record = retained_exposure_inventory(tmp_path)[0]
    assert record["final_boundary"]["season"] == "2023-24"
    assert record["registration_hash_matches_manifest"] is None


def test_oversized_metadata_is_rejected(tmp_path: Path) -> None:
    run = tmp_path / "oversized"
    run.mkdir()
    with (run / "run-manifest.json").open("wb") as stream:
        stream.truncate(8 * 1024 * 1024 + 1)
    with pytest.raises(ValueError, match="exceeds 8 MiB"):
        retained_exposure_inventory(tmp_path)
