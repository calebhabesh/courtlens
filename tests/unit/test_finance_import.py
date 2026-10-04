"""Manual finance admission: independent families, exact cents and preserved corrections."""

import hashlib
import json
from datetime import UTC, datetime

import pytest
from sqlalchemy import func, select

from courtload.domain.finance import FinanceManifest, FinanceRow, export_csv, parse_csv
from courtload.finance_models import FinanceObservation, FinanceRelease
from courtload.services.finance_import import (
    admit_bundle,
    preview_bundle,
    release_rows,
    stage_bundle,
)
from courtload.workbench_models import WorkbenchIdentity

NOW = datetime(2026, 10, 3, tzinfo=UTC)
SOURCE = b"synthetic source document for finance checks"
SHA = hashlib.sha256(SOURCE).hexdigest()


def row(**changes):
    data = dict(
        row_id="amount",
        kind="amount",
        source_namespace="test",
        source_entity_id="p1",
        nba_player_id="1627742",
        contract_id="test-contract",
        financial_season="2025-26",
        observed_at=NOW,
        source_sha256=SHA,
        source_locator="test document section 1",
        original_label="synthetic salary",
        amount_kind="base_salary",
        currency="USD",
        value="100.01",
    )
    data.update(changes)
    return FinanceRow.model_validate(data)


def bundle(path, rows, **changes):
    path.mkdir(parents=True, exist_ok=True)
    raw = export_csv(tuple(rows))
    manifest = dict(
        csv_sha256=hashlib.sha256(raw).hexdigest(),
        sources=[
            dict(
                sha256=SHA,
                url="https://example.com/source",
                observed_at=NOW.isoformat(),
                attribution="fixture",
                use_basis="synthetic tests",
            )
        ],
        mappings=[
            dict(
                source_namespace="test",
                source_entity_id="p1",
                nba_player_id="1627742",
                evidence_sha256=SHA,
                method="reviewed_crosswalk",
            )
        ],
        coverage_note="one synthetic player; incomplete coverage",
    )
    manifest.update(changes)
    (path / "observations.csv").write_bytes(raw)
    (path / "manifest.json").write_text(json.dumps(manifest))
    (path / "sources").mkdir(exist_ok=True)
    (path / "sources" / SHA).write_bytes(SOURCE)
    return path


def identity(session):
    session.add(
        WorkbenchIdentity(
            namespace="nba", kind="player", external_id="1627742", display_name="Brandon Ingram"
        )
    )
    session.commit()


@pytest.mark.parametrize(
    "value,cents", [(None, None), ("0", 0), ("100.01", 10001), ("999999999999.99", 99999999999999)]
)
def test_exact_money_and_unknowns(value, cents):
    assert row(value=value).cents == cents


@pytest.mark.parametrize(
    "changes",
    [
        {"value": "NaN"},
        {"value": "1.001"},
        {"value": "-1"},
        {"value": "1e6"},
        {"currency": "EUR"},
        {"observed_at": "2026-10-03"},
        {"original_label": " =SUM(A1)"},
        {"financial_season": "2025-27"},
        {"financial_season": None},
        {"status": "signed"},
        {"supersedes_id": "old"},
        {"option_state": "exercised"},
    ],
)
def test_invalid_financial_claims(changes):
    with pytest.raises(ValueError):
        row(**changes)


def test_duplicate_and_mapping_rejection(tmp_path):
    path = bundle(tmp_path / "book", [row(), row(row_id="duplicate")])
    manifest = FinanceManifest.model_validate_json((path / "manifest.json").read_bytes())
    with pytest.raises(ValueError, match="duplicate"):
        parse_csv((path / "observations.csv").read_bytes(), manifest)
    with pytest.raises(ValueError):
        FinanceManifest.model_validate(
            {
                **manifest.model_dump(),
                "mappings": [{**manifest.mappings[0].model_dump(), "method": "direct_nba_id"}],
            }
        )


def test_raw_bytes_hash_and_unknown_identity(session, tmp_path):
    path = bundle(tmp_path / "book", [row()])
    with pytest.raises(ValueError, match="unknown canonical"):
        preview_bundle(session, path)
    (path / "sources" / SHA).write_bytes(b"tampered")
    with pytest.raises(ValueError, match="hash mismatch"):
        preview_bundle(session, path)


def test_append_only_correction_and_no_duplicate_sum(session, tmp_path):
    identity(session)
    path = bundle(
        tmp_path / "initial",
        [
            row(value=None),
            row(
                row_id="option",
                kind="option",
                amount_kind=None,
                currency=None,
                value=None,
                option="player",
                option_state="unexercised",
            ),
        ],
    )
    preview = preview_bundle(session, path)
    assert preview["unknown_amount_rows"] == 1
    assert session.scalar(select(func.count()).select_from(FinanceRelease)) == 0
    first = admit_bundle(session, path)
    session.commit()
    original = next(o for o, r in release_rows(session, first.id) if r.kind == "amount")
    corrected = bundle(
        tmp_path / "correction",
        [row(supersedes_id=original.id, correction_reason="new documented synthetic terms")],
        parent_release_id=first.id,
    )
    second = admit_bundle(session, corrected)
    session.commit()
    selected = release_rows(session, second.id)
    assert sum(r.cents or 0 for _, r in selected) == 10001
    assert len(selected) == 2
    assert len(release_rows(session, first.id)) == 2
    assert session.get(FinanceObservation, original.id).amount_cents is None
    assert admit_bundle(session, corrected).id == second.id
    assert session.scalar(select(func.count()).select_from(FinanceRelease)) == 2


def test_conflicts_require_parent_review(session, tmp_path):
    identity(session)
    first = admit_bundle(session, bundle(tmp_path / "initial", [row()]))
    session.commit()
    with pytest.raises(ValueError, match="explicit correction"):
        preview_bundle(
            session, bundle(tmp_path / "conflict", [row(value="200")], parent_release_id=first.id)
        )
    with pytest.raises(ValueError, match="not selected"):
        preview_bundle(
            session,
            bundle(tmp_path / "orphan", [row(supersedes_id="missing", correction_reason="reason")]),
        )


def test_stage_is_bounded_and_refuses_changed_bytes(tmp_path):
    root = bundle(tmp_path / "book", [row()])
    key = stage_bundle(root, tmp_path / "artifacts")
    assert stage_bundle(root, tmp_path / "artifacts") == key
    (tmp_path / "artifacts" / "finance-import" / key / "observations.csv").write_bytes(b"tamper")
    with pytest.raises(ValueError, match="differ"):
        stage_bundle(root, tmp_path / "artifacts")


def test_integrity_replay_and_orm_guard(session, tmp_path):
    from courtload.services.finance_import import verify_release

    identity(session)
    release = admit_bundle(session, bundle(tmp_path / "book", [row()]))
    session.commit()
    assert verify_release(session, release.id)["selected_rows"] == 1
    release.csv_bytes = b"changed"
    with pytest.raises(ValueError, match="append-only"):
        session.flush()
    session.rollback()


def test_finance_jobs_coalesce_only_matching_staged_bytes(session):
    from courtload.services.workbench_jobs import enqueue_job

    a = enqueue_job(session, "finance_import", {"bundle_hash": "a" * 64})
    b = enqueue_job(session, "finance_import", {"bundle_hash": "b" * 64})
    assert a.id != b.id
    assert enqueue_job(session, "finance_import", {"bundle_hash": "b" * 64}).id == b.id
    with pytest.raises(ValueError, match="staged bundle"):
        enqueue_job(session, "finance_import", {"bundle_hash": "../arbitrary"})
