from __future__ import annotations

import json
from datetime import UTC, date, datetime
from pathlib import Path

import pytest
from pydantic import ValidationError

from courtlens.domain.research_registration import ExternalOutput, ResearchBinding, ResearchProtocol
from courtlens.evaluation.research_registration import load_document, retain_document

ROOT = Path(__file__).resolve().parents[2]
DIGEST = "a" * 64


def external(**changes: object) -> ExternalOutput:
    payload = {
        "schema_version": "courtload-external-output-v1",
        "classification": "external_forecast",
        "provider": "fixture-only",
        "model": "fixture-dpm",
        "model_version": "v1",
        "model_version_evidence_sha256": DIGEST,
        "output_version": "fixture-2024-01-01",
        "source_url": "https://example.com/fixture",
        "source_sha256": DIGEST,
        "access_evidence_sha256": DIGEST,
        "reuse_evidence_sha256": DIGEST,
        "attribution": "Fixture, not admitted provider data",
        "effective_date": "2024-01-01",
        "input_through_date": "2023-12-31",
        "published_at": "2024-01-01T00:00:00Z",
        "observed_at": "2024-01-01T12:00:00Z",
        "identities": [
            {
                "provider_player_id": "fixture-1",
                "nba_player_id": "1627751",
                "method": "verified_crosswalk",
                "evidence_sha256": DIGEST,
                "observed_at": "2024-01-01T11:00:00Z",
            }
        ],
        "values": [
            {
                "provider_player_id": "fixture-1",
                "metric": "fixture-dpm",
                "value": 0,
                "unit": "points/100 possessions",
            }
        ],
    }
    return ExternalOutput.model_validate(payload | changes)


def reasons(output: ExternalOutput) -> tuple[str, ...]:
    return output.gate_reasons(
        known_before=datetime(2024, 1, 2, tzinfo=UTC), before_date=date(2024, 1, 2)
    )


def protocol() -> ResearchProtocol:
    document = load_document(ROOT / "evaluation/research/protocols/courtload-rapm-v1.json")
    assert isinstance(document, ResearchProtocol)
    return document


def binding(**changes: object) -> ResearchBinding:
    payload = {
        "schema_version": "courtload-research-binding-v1",
        "experiment": "courtload-rapm-v1",
        "protocol_sha256": protocol().content_hash(),
        "dataset_content_sha256": DIGEST,
        "source_membership_sha256": DIGEST,
        "transform_sha256": DIGEST,
        "coverage_report_sha256": DIGEST,
        "final_exposure_audit_sha256": DIGEST,
        "final_previously_exposed": False,
        "source_gates_verified": True,
        "complete_seasons": ["2021-22", "2022-23", "2023-24"],
        "games": [
            {
                "game_id": f"002{i}00001",
                "season": season,
                "game_date": f"{year}-11-01",
                "role": role,
                "rows": 500,
                "row_membership_sha256": DIGEST,
            }
            for i, season, year, role in [
                (21, "2021-22", 2021, "training"),
                (22, "2022-23", 2022, "validation"),
                (23, "2023-24", 2023, "final_test"),
            ]
        ],
    }
    return ResearchBinding.model_validate(payload | changes)


def test_all_frozen_designs_validate_and_have_distinct_hashes() -> None:
    documents = [
        load_document(path)
        for path in sorted((ROOT / "evaluation/research/protocols").glob("*-v1.json"))
    ]
    assert len(documents) == 4
    assert len({document.content_hash() for document in documents}) == 4
    for document in documents:
        assert isinstance(document, ResearchProtocol)
        assert document.membership_binding == "required_before_any_candidate_comparison"
        assert document.budget.cpu_threads <= 2


@pytest.mark.parametrize(
    "field",
    [
        "model_version",
        "model_version_evidence_sha256",
        "access_evidence_sha256",
        "reuse_evidence_sha256",
        "input_through_date",
    ],
)
def test_missing_external_evidence_blocks_metadata(field: str) -> None:
    assert f"missing_{field}" in reasons(external(**{field: None}))


def test_observed_time_cannot_be_replaced_by_historical_effective_date() -> None:
    output = external(observed_at="2026-10-03T00:00:00Z")
    assert "not_observed_before_knowledge_boundary" in reasons(output)


def test_boundaries_are_exclusive() -> None:
    output = external(
        effective_date="2024-01-02",
        input_through_date="2024-01-02",
        observed_at="2024-01-02T00:00:00Z",
    )
    assert set(reasons(output)) == {
        "not_observed_before_knowledge_boundary",
        "effective_date_outside_research_cutoff",
        "input_horizon_outside_research_cutoff",
    }


def test_zero_unknown_and_unmapped_identity_are_distinct() -> None:
    assert reasons(external()) == ()
    assert external().values[0].value == 0
    assert "unmapped_player_identity" in reasons(external(identities=[]))
    unknown = external(
        values=[
            {
                "provider_player_id": "fixture-1",
                "metric": "fixture-dpm",
                "value": None,
                "unit": "points/100",
                "missing_reason": "unobserved",
            }
        ]
    )
    assert unknown.values[0].value is None
    assert unknown.content_hash() != external().content_hash()


@pytest.mark.parametrize(
    "changes",
    [
        {"observed_at": "2024-01-01T12:00:00"},
        {"published_at": "2025-01-01T00:00:00Z"},
        {"input_through_date": "2024-01-03"},
        {"classification": "locally_trained"},
        {"unregistered_field": True},
        {
            "identities": [
                {
                    "provider_player_id": "fixture-1",
                    "nba_player_id": "Name Match",
                    "method": "name_match",
                    "evidence_sha256": DIGEST,
                    "observed_at": "2024-01-01T00:00:00Z",
                }
            ]
        },
        {
            "values": [
                {
                    "provider_player_id": "fixture-1",
                    "metric": "fixture-dpm",
                    "value": float("nan"),
                    "unit": "points/100",
                }
            ]
        },
        {
            "values": [
                {
                    "provider_player_id": "fixture-1",
                    "metric": "fixture-dpm",
                    "value": None,
                    "unit": "points/100",
                }
            ]
        },
    ],
)
def test_incoherent_external_contract_rejected(changes: dict[str, object]) -> None:
    with pytest.raises(ValidationError):
        external(**changes)


def test_duplicate_external_rows_and_identity_rejected() -> None:
    payload = external().model_dump(mode="json")
    for field in ("identities", "values"):
        with pytest.raises(ValidationError):
            external(**{field: payload[field] * 2})


def test_binding_chronology_and_exact_protocol() -> None:
    value = binding()
    value.validate_protocol(protocol())
    games = value.model_dump(mode="json")["games"]
    assert binding(games=list(reversed(games))).membership_hash() == value.membership_hash()
    games[0]["row_membership_sha256"] = "b" * 64
    assert binding(games=games).membership_hash() != value.membership_hash()
    with pytest.raises(ValueError, match="exact protocol"):
        binding(protocol_sha256="b" * 64).validate_protocol(protocol())


@pytest.mark.parametrize(
    "changes",
    [
        {"final_previously_exposed": True},
        {"source_gates_verified": False},
        {"complete_seasons": ["2021-22", "2022-23"]},
    ],
)
def test_binding_fails_closed_for_missing_gates(changes: dict[str, object]) -> None:
    with pytest.raises(ValidationError):
        binding(**changes)


def test_games_cannot_cross_roles_or_dates() -> None:
    games = binding().model_dump(mode="json")["games"]
    with pytest.raises(ValidationError, match="appear twice"):
        binding(games=[*games, games[0]])
    games[1]["game_date"] = games[0]["game_date"]
    with pytest.raises(ValidationError, match="overlap"):
        binding(games=games)


def test_fit_budget_and_unknown_fields_rejected() -> None:
    payload = protocol().model_dump(mode="json")
    payload["budget"]["cpu_threads"] = 3
    with pytest.raises(ValidationError):
        ResearchProtocol.model_validate(payload)
    payload = protocol().model_dump(mode="json")
    payload["budget"]["max_candidate_fits"] = 2
    with pytest.raises(ValidationError, match="fit budget"):
        ResearchProtocol.model_validate(payload)


def test_registration_retention_is_content_addressed_and_no_overwrite(tmp_path: Path) -> None:
    document = protocol()
    path = retain_document(document, tmp_path)
    assert retain_document(document, tmp_path) == path
    assert path.stem == document.content_hash()
    path.write_text("corrupt")
    with pytest.raises(ValueError, match="refusing overwrite"):
        retain_document(document, tmp_path)
    assert path.read_text() == "corrupt"


def test_document_size_is_bounded(tmp_path: Path) -> None:
    path = tmp_path / "oversize.json"
    path.write_bytes(b" " * (8 * 1024 * 1024 + 1))
    with pytest.raises(ValueError, match="8 MiB"):
        load_document(path)
    path.write_text(json.dumps(protocol().model_dump(mode="json")))
    assert load_document(path).content_hash() == protocol().content_hash()


def test_cli_source_blocked_never_retains(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    from courtlens.evaluation.research_registration import main

    document = tmp_path / "output.json"
    document.write_text(external(reuse_evidence_sha256=None).model_dump_json())
    destination = tmp_path / "retained"
    monkeypatch.setattr(
        "sys.argv",
        [
            "registration",
            str(document),
            "--external",
            "--known-before",
            "2024-01-02T00:00:00Z",
            "--before-date",
            "2024-01-02",
            "--retain-under",
            str(destination),
        ],
    )
    with pytest.raises(SystemExit) as failure:
        main()
    assert failure.value.code == 2
    assert json.loads(capsys.readouterr().out)["status"] == "source_blocked"
    assert not destination.exists()


def test_cli_design_cannot_claim_fit_readiness(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    from courtlens.evaluation.research_registration import main

    path = tmp_path / "protocol.json"
    path.write_text(protocol().model_dump_json())
    monkeypatch.setattr("sys.argv", ["registration", str(path)])
    main()
    assert json.loads(capsys.readouterr().out)["status"] == (
        "design_registered_input_memberships_unbound_no_fit_authorized"
    )


def test_binding_budget_and_season_integrity() -> None:
    games = binding().model_dump(mode="json")["games"]
    games[0]["rows"] = 1000001
    with pytest.raises(ValueError, match="compute budget"):
        binding(games=games).validate_protocol(protocol())
    games = binding().model_dump(mode="json")["games"]
    games[1]["season"] = "2021-22"
    with pytest.raises(ValidationError, match="complete-season policy"):
        binding(games=games)
    games = binding().model_dump(mode="json")["games"]
    games[2]["game_date"] = "2025-01-01"
    with pytest.raises(ValidationError, match="outside bound NBA season"):
        binding(games=games)


def test_identity_evidence_cannot_arrive_later_than_bound_output() -> None:
    identity = external().model_dump(mode="json")["identities"][0]
    identity["observed_at"] = "2024-01-02T00:00:00Z"
    with pytest.raises(ValidationError, match="identity evidence postdates"):
        external(identities=[identity])
