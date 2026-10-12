"""PC05 PostgreSQL membership guards, API pinning and projected reference arithmetic."""

import json
from collections.abc import Generator
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select, text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.orm import Session

from courtlens.api.app import create_app
from courtlens.database import get_db
from courtlens.domain.query_spec import QuerySpec
from courtlens.domain.rich_sources import compute_payload_hash
from courtlens.player_context_models import (
    PlayerContextDataset,
    PlayerContextMember,
    PlayerContextVersion,
)
from courtlens.services.player_context import dataset_rows, listed_position_player_ids
from courtlens.services.player_context_ingestion import (
    PLAYER_INDEX_URL,
    admit_context,
    capture_local,
)
from courtlens.services.stats_engine import execute_stats_query
from courtlens.services.workbench_analytics import resolve_workbench_context
from courtlens.warehouse_models import PublishedSnapshot
from courtlens.workbench_models import WorkbenchAcquisition, WorkbenchIdentityCrosswalk

pytestmark = pytest.mark.postgres


def capture(
    session: Session, root: Path, tricode: str = "TOR", team: int = 1610612761
) -> PlayerContextDataset:
    body = {
        "parameters": {"Season": "2026-27"},
        "resultSets": [
            {
                "name": "PlayerIndex",
                "headers": [
                    "PERSON_ID",
                    "PLAYER_FIRST_NAME",
                    "PLAYER_LAST_NAME",
                    "TEAM_ID",
                    "TEAM_ABBREVIATION",
                    "POSITION",
                    "HEIGHT",
                    "WEIGHT",
                    "ROSTER_STATUS",
                ],
                "rowSet": [
                    [1630567, "Scottie", "Barnes", team, tricode, "F", "6-8", "227", 1],
                    [9999999, "Fixture", "Rookie", team, tricode, "G", None, None, 1],
                ],
            }
        ],
    }
    path = root / "test-index.json"
    path.write_text(json.dumps(body))
    receipt = capture_local(
        session, root / "store", path, "nba_player_index", PLAYER_INDEX_URL, "2026-27"
    )
    session.commit()
    ds = admit_context(session, receipt.id, root / "store")
    session.commit()
    return ds


@pytest.fixture
def context_client(workbench_db: Session) -> Generator[TestClient, None, None]:
    app = create_app()

    def database() -> Generator[Session, None, None]:
        yield workbench_db

    app.dependency_overrides[get_db] = database
    with TestClient(app) as client:
        yield client


def test_projected_roster_joins_all_team_reference_not_current_team_participation(
    workbench_db: Session,
    tmp_path: Path,
    context_client: TestClient,
) -> None:
    pointer = workbench_db.get(PublishedSnapshot, "public")
    assert pointer is not None
    release = pointer.snapshot_id
    dataset = capture(workbench_db, tmp_path, "BOS", 1610612738)
    response = context_client.get(
        "/api/workbench/player-context/rosters",
        params={"datasetId": dataset.id, "teamId": "BOS", "statisticsReleaseId": release},
    )
    assert response.status_code == 200, response.text
    data = response.json()
    player, rookie = data["players"]
    assert player["player_id"] == "1630567" and player["team_tricode"] == "BOS"
    assert player["reference"]["season"] == "2025-26"
    assert player["reference"]["metrics"]["pts_per_game"] == 19
    assert player["reference"]["sample_sizes"]["pts_per_game"] == 30
    assert rookie["reference"] is None and rookie["height_inches"] is None
    assert data["current_season_appearances_in_release"] == 0
    assert data["statistics_release_id"] == release
    assert workbench_db.get(PublishedSnapshot, "public").snapshot_id == release
    bad = context_client.get(
        "/api/workbench/player-context/rosters",
        params={"datasetId": dataset.id, "teamId": "NOTNBA"},
    )
    assert bad.status_code == 422


def test_a_b_a_api_cutoff_and_paging_pin_real_observation(
    workbench_db: Session,
    tmp_path: Path,
    context_client: TestClient,
) -> None:
    a = capture(workbench_db, tmp_path)
    b = capture(workbench_db, tmp_path, "BOS", 1610612738)
    last = capture(workbench_db, tmp_path)
    assert a.content_sha256 == last.content_sha256 != b.content_sha256
    assert workbench_db.scalar(select(func.count()).select_from(PlayerContextVersion)) == 4
    assert workbench_db.scalar(select(func.count()).select_from(PlayerContextDataset)) == 3
    data = context_client.get(
        "/api/workbench/player-context/catalog", params={"knownAt": b.observed_at.isoformat()}
    ).json()
    assert data["capabilities"][0]["dataset"]["dataset_id"] == b.id
    page = context_client.get(f"/api/workbench/player-context/datasets/{a.id}", params={"limit": 1})
    assert page.status_code == 200 and page.json()["next_offset"] == 1
    second = context_client.get(
        f"/api/workbench/player-context/datasets/{a.id}", params={"offset": 1}
    )
    assert second.json()["rows"][0]["entity_key"] != page.json()["rows"][0]["entity_key"]
    assert second.json()["next_offset"] is None
    assert "storage_path" not in page.text
    response = context_client.get(
        f"/api/workbench/player-context/datasets/{last.id}",
        params={"knownAt": (datetime.now(UTC) - timedelta(days=1)).isoformat()},
    )
    assert response.status_code == 422


@pytest.mark.parametrize(
    "statement",
    [
        "UPDATE player_context_datasets SET content_sha256='wrong' WHERE id=:id",
        "DELETE FROM player_context_members WHERE dataset_id=:id",
        "TRUNCATE player_context_members",
    ],
)
def test_raw_sql_mutation_is_rejected(
    workbench_db: Session, tmp_path: Path, statement: str
) -> None:
    dataset = capture(workbench_db, tmp_path)
    with pytest.raises(DBAPIError, match="append-only"):
        workbench_db.execute(text(statement), {"id": dataset.id})
    workbench_db.rollback()
    assert len(dataset_rows(workbench_db, dataset)) == 2


def test_post_commit_membership_extensions_are_rejected(
    workbench_db: Session,
    tmp_path: Path,
) -> None:
    dataset = capture(workbench_db, tmp_path)
    member = workbench_db.scalar(
        select(PlayerContextMember).where(PlayerContextMember.dataset_id == dataset.id)
    )
    assert member is not None
    with pytest.raises(DBAPIError, match="membership is sealed"):
        workbench_db.execute(
            PlayerContextMember.__table__.insert().values(
                dataset_id=dataset.id,
                entity_key="late",
                source_name=member.source_name,
                kind=member.kind,
                season=member.season,
                version_id=member.version_id,
                row_locator="late",
            )
        )
    workbench_db.rollback()


def test_bound_raw_provenance_is_sealed(workbench_db: Session, tmp_path: Path) -> None:
    dataset = capture(workbench_db, tmp_path)
    with pytest.raises(DBAPIError, match="provenance is append-only"):
        workbench_db.execute(
            text("UPDATE workbench_acquisitions SET source_url='changed' WHERE id=:id"),
            {"id": dataset.acquisition_id},
        )
    workbench_db.rollback()
    receipt = workbench_db.get(WorkbenchAcquisition, dataset.acquisition_id)
    with pytest.raises(DBAPIError, match="provenance is append-only"):
        workbench_db.execute(
            text("UPDATE workbench_artifacts SET sha256='changed' WHERE id=:id"),
            {"id": receipt.artifact_id},
        )
    workbench_db.rollback()


def test_new_roster_cannot_change_prior_statistical_result(
    workbench_db: Session, tmp_path: Path
) -> None:
    context = resolve_workbench_context(workbench_db, requested_season="2025-26")
    spec = QuerySpec(season="2025-26", before_date=context.before_date)
    before = compute_payload_hash(execute_stats_query(workbench_db, context, spec)[0])
    capture(workbench_db, tmp_path, "BOS", 1610612738)
    capture(workbench_db, tmp_path)
    assert compute_payload_hash(execute_stats_query(workbench_db, context, spec)[0]) == before


def test_injury_crosswalk_is_frozen_not_recomputed_on_read(
    workbench_db: Session, tmp_path: Path
) -> None:
    mapping = WorkbenchIdentityCrosswalk(
        source_namespace="espn",
        source_id="123456789",
        target_namespace="nba",
        target_id="1630567",
        kind="player",
        confidence="verified",
        mapping_method="verified_manual_crosswalk",
        evidence_json={"source": "fictional fixture"},
    )
    workbench_db.add(mapping)
    workbench_db.commit()
    body = {
        "injuries": [
            {
                "id": "28",
                "injuries": [
                    {
                        "athlete": {"id": "123456789", "displayName": "Fixture Player"},
                        "status": "Out",
                        "date": "2026-10-11T18:00:00Z",
                    }
                ],
            }
        ]
    }
    path = tmp_path / "espn.json"
    path.write_text(json.dumps(body))
    receipt = capture_local(
        workbench_db,
        tmp_path / "store",
        path,
        "espn_injuries",
        "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/injuries",
        "2026-27",
    )
    workbench_db.commit()
    dataset = admit_context(workbench_db, receipt.id, tmp_path / "store")
    workbench_db.commit()
    assert dataset_rows(workbench_db, dataset)[0]["player_id"] == "1630567"
    mapping.target_id = "2544"
    workbench_db.commit()
    assert dataset_rows(workbench_db, dataset)[0]["player_id"] == "1630567"


def test_crosswired_member_version_fails_composite_foreign_key(
    workbench_db: Session,
    tmp_path: Path,
) -> None:
    dataset = capture(workbench_db, tmp_path)
    member = workbench_db.scalar(
        select(PlayerContextMember).where(PlayerContextMember.dataset_id == dataset.id)
    )
    assert member is not None
    # New candidate can accept members, but a version of a different entity cannot be joined.
    path = tmp_path / "test-index.json"
    receipt = capture_local(
        workbench_db, tmp_path / "store", path, "nba_player_index", PLAYER_INDEX_URL, "2026-27"
    )
    workbench_db.commit()
    candidate = PlayerContextDataset(
        acquisition_id=receipt.id,
        source_name=dataset.source_name,
        kind=dataset.kind,
        season=dataset.season,
        content_sha256="f" * 64,
        membership_sha256="f" * 64,
        parser_version=dataset.parser_version,
        observation_order=2,
        observed_at=datetime.now(UTC),
        admission_transaction=str(workbench_db.scalar(text("SELECT txid_current()"))),
        coverage_json={},
    )
    workbench_db.add(candidate)
    workbench_db.flush()
    with pytest.raises(DBAPIError, match="foreign key"):
        workbench_db.execute(
            PlayerContextMember.__table__.insert().values(
                dataset_id=candidate.id,
                entity_key="different-entity",
                source_name=member.source_name,
                kind=member.kind,
                season=member.season,
                version_id=member.version_id,
                row_locator="bad",
            )
        )
    workbench_db.rollback()


def test_listed_positions_resolve_to_player_ids_from_latest_index(
    workbench_db: Session, tmp_path: Path
) -> None:
    capture(workbench_db, tmp_path)
    assert listed_position_player_ids(workbench_db, ["F"]) == {"1630567"}
    assert listed_position_player_ids(workbench_db, ["G", "C"]) == {"9999999"}
    assert listed_position_player_ids(workbench_db, ["C"]) == set()
