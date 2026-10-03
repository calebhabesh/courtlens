"""Unit tests for player physical measurements and draft metadata service."""

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from courtload.database import Base
from courtload.services.measurements import (
    MEASUREMENT_DISCLOSURE,
    get_player_measurements_detail_service,
    query_measurements_service,
    seed_flagship_measurements,
)
from courtload.workbench_models import WorkbenchIdentity


@pytest.fixture
def memory_session() -> Session:
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    with Session(engine) as session:
        # Seed test player identities
        session.add_all(
            [
                WorkbenchIdentity(
                    namespace="nba",
                    external_id="1628389",
                    kind="player",
                    display_name="Bam Adebayo",
                ),
                WorkbenchIdentity(
                    namespace="nba",
                    external_id="1630567",
                    kind="player",
                    display_name="Scottie Barnes",
                ),
                WorkbenchIdentity(
                    namespace="nba",
                    external_id="1627783",
                    kind="player",
                    display_name="Pascal Siakam",
                ),
                WorkbenchIdentity(
                    namespace="nba",
                    external_id="1628424",
                    kind="player",
                    display_name="Kobi Simmons",
                ),
            ]
        )
        session.commit()
        seed_flagship_measurements(session)
        yield session


def test_combine_vs_listed_distinction(memory_session: Session) -> None:
    # Scottie Barnes (1630567)
    detail = get_player_measurements_detail_service(memory_session, "1630567")
    assert detail["has_measurements"] is True
    assert detail["display_name"] == "Scottie Barnes"

    # Combine record
    combine = detail["combine"]
    assert combine is not None
    assert combine["height_no_shoes_inches"] == 79.0
    assert combine["height_shoes_inches"] == 80.0
    assert combine["wingspan_inches"] == 86.75
    assert combine["standing_reach_inches"] == 108.0
    assert combine["wingspan_to_height_ratio"] == 1.08
    assert combine["source_attribution"] == "draft_combine"

    # Listed record
    listed = detail["listed"]
    assert listed is not None
    assert listed["height_shoes_inches"] == 80.0
    assert listed["weight_lbs"] == 237.0
    assert listed["source_attribution"] == "official_roster"

    # Draft record
    draft = detail["draft"]
    assert draft is not None
    assert draft["draft_year"] == 2021
    assert draft["round_number"] == 1
    assert draft["pick_overall"] == 4
    assert draft["drafting_team_id"] == "TOR"
    assert draft["draft_type"] == "draft"

    # Disclaimer is present
    assert detail["disclaimer"] == MEASUREMENT_DISCLOSURE


def test_undrafted_player_handling(memory_session: Session) -> None:
    # Kobi Simmons (1628424)
    detail = get_player_measurements_detail_service(memory_session, "1628424")
    assert detail["has_measurements"] is True

    draft = detail["draft"]
    assert draft is not None
    assert draft["draft_type"] == "undrafted"
    assert draft["pick_overall"] is None
    assert draft["college_or_prior_team"] == "Arizona"

    # Combine measurements
    combine = detail["combine"]
    assert combine is not None
    assert combine["wingspan_inches"] == 78.0
    assert combine["wingspan_to_height_ratio"] == 1.01


def test_measurements_cohort_query_filtering(memory_session: Session) -> None:
    # Query with min_wingspan >= 85 inches (should return Siakam 87.25, Adebayo 86.75, Barnes 86.75)
    wingspan_res = query_measurements_service(
        memory_session,
        min_wingspan=85.0,
        measurement_type="combine",
    )
    assert wingspan_res["count"] == 3
    player_names = [item["display_name"] for item in wingspan_res["items"]]
    assert "Pascal Siakam" in player_names
    assert "Bam Adebayo" in player_names
    assert "Scottie Barnes" in player_names
    assert "Kobi Simmons" not in player_names

    # Check sort order: Siakam (87.25) should be first
    assert wingspan_res["items"][0]["wingspan_inches"] == 87.25
    assert wingspan_res["items"][0]["display_name"] == "Pascal Siakam"

    # Query only listed measurements
    listed_res = query_measurements_service(
        memory_session,
        measurement_type="listed",
    )
    assert listed_res["count"] == 4
    assert all(item["measurement_type"] == "listed" for item in listed_res["items"])
    # Missing wingspan on listed record must be None, not 0.0!
    assert all(item["wingspan_inches"] is None for item in listed_res["items"])
