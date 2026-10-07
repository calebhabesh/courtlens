"""Integration tests for Block B14 API endpoints: measurements, crosswalk, backfill status."""

from __future__ import annotations

from datetime import UTC, datetime
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from courtlens.api.app import create_app
from courtlens.database import get_db
from courtlens.services.identity_crosswalk import seed_flagship_crosswalks
from courtlens.services.measurements import seed_flagship_measurements


@pytest.fixture
def client(workbench_db):
    app = create_app()
    app.dependency_overrides[get_db] = lambda: workbench_db
    with TestClient(app) as client:
        yield client


@pytest.fixture
def setup_b14_postgres(workbench_db) -> None:
    seed_flagship_crosswalks(workbench_db)
    seed_flagship_measurements(workbench_db)


@pytest.mark.postgres
def test_workbench_catalog_capabilities_b14(client: TestClient, setup_b14_postgres: None) -> None:
    """Catalog exposes schedules, measurements, draft_metadata, and identity_crosswalk."""
    response = client.get("/api/workbench/catalog")
    assert response.status_code == 200
    caps = response.json()["capabilities"]
    assert "core_stats" in caps
    assert "schedules" in caps
    assert "measurements" in caps
    assert "draft_metadata" in caps
    assert "identity_crosswalk" in caps
    assert caps["measurements"]["status"] == "available"
    assert len(caps["measurements"]["limitations"]) >= 1


@pytest.mark.postgres
def test_measurements_query_endpoint(client: TestClient, setup_b14_postgres: None) -> None:
    """Cohort query endpoint filters by wingspan, sorts descending, and preserves disclaimer."""
    response = client.get("/api/workbench/measurements?minWingspan=85.0&measurementType=combine")
    assert response.status_code == 200
    data = response.json()
    assert data["count"] >= 3
    items = data["items"]
    # Siakam (87.25) should be first
    assert items[0]["display_name"] == "Pascal Siakam"
    assert items[0]["wingspan_inches"] == 87.25
    assert "disclaimer" in data
    assert "interchangeable" in data["disclaimer"]


@pytest.mark.postgres
def test_player_measurements_detail_endpoint(client: TestClient, setup_b14_postgres: None) -> None:
    """Player detail endpoint distinguishes combine evaluations from listed roster cards."""
    # Scottie Barnes (1630567)
    response = client.get("/api/workbench/players/1630567/measurements")
    assert response.status_code == 200
    data = response.json()
    assert data["player_id"] == "1630567"
    assert data["display_name"] == "Scottie Barnes"
    assert data["has_measurements"] is True

    # Combine measurements
    combine = data["combine"]
    assert combine is not None
    assert combine["wingspan_inches"] == 86.75
    assert combine["height_no_shoes_inches"] == 79.0
    assert combine["wingspan_to_height_ratio"] == 1.08

    # Listed measurements
    listed = data["listed"]
    assert listed is not None
    assert listed["height_shoes_inches"] == 80.0
    assert listed["weight_lbs"] == 237.0

    # Draft metadata
    draft = data["draft"]
    assert draft is not None
    assert draft["draft_year"] == 2021
    assert draft["pick_overall"] == 4
    assert draft["drafting_team_id"] == "TOR"
    assert draft["draft_type"] == "draft"


@pytest.mark.postgres
def test_player_measurements_undrafted(client: TestClient, setup_b14_postgres: None) -> None:
    """Undrafted players have draft_type='undrafted' and null round/pick."""
    response = client.get("/api/workbench/players/1628424/measurements")
    assert response.status_code == 200
    data = response.json()
    assert data["player_id"] == "1628424"
    draft = data["draft"]
    assert draft is not None
    assert draft["draft_type"] == "undrafted"
    assert draft["pick_overall"] is None
    assert draft["college_or_prior_team"] == "Arizona"


@pytest.mark.postgres
def test_crosswalk_endpoint(client: TestClient, setup_b14_postgres: None) -> None:
    """Crosswalk resolves external ESPN/BRef IDs to canonical NBA IDs."""
    # Scottie Barnes ESPN ID 4433134 -> NBA 1630567
    resp = client.get("/api/workbench/crosswalk?sourceNamespace=espn&sourceId=4433134")
    assert resp.status_code == 200
    body = resp.json()
    assert body["resolved"] is True
    assert body["item"]["target_id"] == "1630567"
    assert body["item"]["target_namespace"] == "nba"
    assert body["item"]["confidence"] == "verified"

    # Unknown ID -> resolved=False
    resp_unknown = client.get("/api/workbench/crosswalk?sourceNamespace=espn&sourceId=999999999")
    assert resp_unknown.status_code == 200
    assert resp_unknown.json()["resolved"] is False


@pytest.mark.postgres
def test_backfill_status_endpoint(client: TestClient, setup_b14_postgres: None) -> None:
    """Backfill status endpoint reports historical range toward 2000-01."""
    resp = client.get("/api/workbench/backfill/status?startYear=2001&endYear=2023")
    assert resp.status_code == 200
    data = resp.json()
    assert data["range"] == [2001, 2023]
    assert data["total_seasons"] == 23
    assert "imported_count" in data
    assert "acquired_count" in data
    assert "pending_count" in data


def test_worker_refresh_due_logic() -> None:
    """Verify worker _is_refresh_due respects scheduled time and past executions."""
    from courtlens.worker import CourtLensWorker

    worker = CourtLensWorker(worker_id="test-worker")

    # If before scheduled 09:00 UTC (e.g. 08:30 UTC), refresh is not due
    with patch("courtlens.worker.datetime") as mock_dt:
        mock_dt.now.return_value = datetime(2026, 10, 2, 8, 30, tzinfo=UTC)
        mock_dt.combine = datetime.combine
        mock_dt.strptime = datetime.strptime
        assert worker._is_refresh_due() is False

    # If after 09:00 UTC (e.g. 10:00 UTC) and never ran today, refresh is due
    with (
        patch("courtlens.worker.datetime") as mock_dt,
        patch("courtlens.worker.SessionLocal") as mock_session_cls,
    ):
        mock_dt.now.return_value = datetime(2026, 10, 2, 10, 0, tzinfo=UTC)
        mock_dt.combine = datetime.combine
        mock_dt.strptime = datetime.strptime
        mock_session = mock_session_cls.return_value.__enter__.return_value
        mock_session.scalar.return_value = None  # No recent refresh in db

        worker._last_refresh_date = None
        assert worker._is_refresh_due() is True

        # If already ran today in this worker, not due
        worker._last_refresh_date = "2026-10-02"
        assert worker._is_refresh_due() is False
