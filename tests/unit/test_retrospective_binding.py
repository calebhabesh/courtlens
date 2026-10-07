"""Exact chronological halves and honest exposure survive schema/recipe changes."""

import json
from datetime import date, timedelta
from pathlib import Path

import pytest

from courtlens.domain.research_registration import ResearchProtocol, RetrospectiveShotBinding
from courtlens.domain.rich_sources import compute_payload_hash
from courtlens.evaluation.research_registration import load_document
from courtlens.evaluation.research_runner import launch


def binding_payload() -> dict:
    games = []
    for year, role in [(2023, "training"), (2024, "validation"), (2025, "final_test")]:
        for i in range(62):
            games.append(
                {
                    "game_id": f"002{year % 100:02d}{i + 1:05d}",
                    "season": f"{year}-{(year + 1) % 100:02d}",
                    "game_date": (date(year, 10, 1) + timedelta(days=i)).isoformat(),
                    "role": role,
                    "rows": 1000,
                    "row_membership_sha256": "a" * 64,
                }
            )
    protocol = load_document(
        Path("evaluation/research/protocols/courtload-expected-shot-retrospective-v2.json")
    )
    assert isinstance(protocol, ResearchProtocol)
    validation = [g for g in games if g["role"] == "validation"]
    selection = validation[:31]
    calibration = validation[31:]
    return {
        "schema_version": "courtload-retrospective-shot-binding-v2",
        "experiment": protocol.experiment,
        "protocol_sha256": protocol.content_hash(),
        "dataset_id": "synthetic",
        "dataset_content_sha256": "b" * 64,
        "source_membership_sha256": "c" * 64,
        "transform_sha256": "d" * 64,
        "coverage_report_sha256": "e" * 64,
        "final_exposure_audit_sha256": "f" * 64,
        "chronology_amendment_sha256": "a" * 64,
        "final_previously_exposed": True,
        "classification": "retrospective_research",
        "complete_seasons": ["2023-24", "2024-25", "2025-26"],
        "games": games,
        "selection_games": [g["game_id"] for g in selection],
        "calibration_games": [g["game_id"] for g in calibration],
        "selection_membership_sha256": compute_payload_hash(selection),
        "calibration_membership_sha256": compute_payload_hash(calibration),
    }


def test_new_registration_keeps_exposure_and_frozen_date_halves() -> None:
    payload = binding_payload()
    binding = RetrospectiveShotBinding.model_validate(payload)
    protocol = load_document(
        Path("evaluation/research/protocols/courtload-expected-shot-retrospective-v2.json")
    )
    assert isinstance(protocol, ResearchProtocol)
    binding.validate_protocol(protocol)
    assert binding.final_previously_exposed
    payload["selection_games"], payload["calibration_games"] = (
        payload["calibration_games"],
        payload["selection_games"],
    )
    with pytest.raises(ValueError, match="date boundary"):
        RetrospectiveShotBinding.model_validate(payload)


@pytest.mark.parametrize(
    "field,value",
    [
        ("final_previously_exposed", False),
        ("selection_membership_sha256", "f" * 64),
        ("protocol_sha256", "f" * 64),
    ],
)
def test_binding_cannot_hide_exposure_or_change_recipe(field: str, value: object) -> None:
    payload = binding_payload()
    payload[field] = value
    with pytest.raises(ValueError):
        binding = RetrospectiveShotBinding.model_validate(payload)
        protocol = load_document(
            Path("evaluation/research/protocols/courtload-expected-shot-retrospective-v2.json")
        )
        assert isinstance(protocol, ResearchProtocol)
        binding.validate_protocol(protocol)


def test_changing_binding_cannot_reset_the_registered_protocol_fit_budget(tmp_path: Path):
    protocol_path = Path(
        "evaluation/research/protocols/courtload-expected-shot-retrospective-v2.json"
    )
    original = RetrospectiveShotBinding.model_validate(binding_payload())
    modified = binding_payload()
    modified["dataset_content_sha256"] = "a" * 64
    binding_path = tmp_path / "binding.json"
    binding_path.write_text(json.dumps(modified))
    registry = tmp_path / "registry"
    (registry / "protocols").mkdir(parents=True)
    (registry / "protocols" / f"{original.protocol_sha256}.json").write_text(
        json.dumps({"binding_sha256": original.content_hash()})
    )
    with pytest.raises(ValueError, match="cannot reset its fit budget"):
        launch(protocol_path, binding_path, registry)
    assert not list(registry.glob("*/manifest.json"))
