"""Player physical measurements and draft metadata service."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from courtlens.models import new_uuid
from courtlens.workbench_models import (
    WorkbenchIdentity,
    WorkbenchPlayerDraft,
    WorkbenchPlayerMeasurement,
    allow_admin_mutation,
)

MEASUREMENT_DISCLOSURE = (
    "Listed measurements (roster cards) reflect unverified team-reported values and are not "
    "interchangeable with official NBA Draft Combine anthropometric measurements. "
    "Missing measurements are reported as null and never scored as zero."
)

# Seed dataset of verified combine, listed, and draft records
FLAGSHIP_MEASUREMENTS_DATA = [
    # Bam Adebayo (NBA ID: 1628389)
    {
        "player_id": "1628389",
        "source_name": "draft_combine",
        "measurement_type": "combine",
        "draft_year": 2017,
        "season": None,
        "height_no_shoes_inches": 80.75,
        "height_shoes_inches": 81.75,
        "wingspan_inches": 86.75,
        "standing_reach_inches": 108.0,
        "weight_lbs": 243.0,
        "body_fat_pct": 5.2,
        "hand_length_inches": 9.5,
        "hand_width_inches": 10.25,
        "standing_vertical_inches": 33.5,
        "max_vertical_inches": 38.5,
        "lane_agility_seconds": 11.94,
        "three_quarter_sprint_seconds": 3.23,
        "wingspan_to_height_ratio": 1.06,
        "notes": "Official 2017 NBA Draft Combine",
        "data_source_evidence_json": {"source": "NBA Draft Combine 2017", "verified": True},
    },
    {
        "player_id": "1628389",
        "source_name": "official_roster",
        "measurement_type": "listed",
        "draft_year": 2017,
        "season": "2025-26",
        "height_no_shoes_inches": None,
        "height_shoes_inches": 81.0,
        "wingspan_inches": None,
        "standing_reach_inches": None,
        "weight_lbs": 255.0,
        "body_fat_pct": None,
        "hand_length_inches": None,
        "hand_width_inches": None,
        "standing_vertical_inches": None,
        "max_vertical_inches": None,
        "lane_agility_seconds": None,
        "three_quarter_sprint_seconds": None,
        "wingspan_to_height_ratio": None,
        "notes": "Miami Heat 2025-26 Listed Roster",
        "data_source_evidence_json": {"source": "NBA Roster 2025-26", "listed_position": "C-F"},
    },
    # Scottie Barnes (NBA ID: 1630567)
    {
        "player_id": "1630567",
        "source_name": "draft_combine",
        "measurement_type": "combine",
        "draft_year": 2021,
        "season": None,
        "height_no_shoes_inches": 79.0,
        "height_shoes_inches": 80.0,
        "wingspan_inches": 86.75,
        "standing_reach_inches": 108.0,
        "weight_lbs": 225.4,
        "body_fat_pct": 6.1,
        "hand_length_inches": 9.25,
        "hand_width_inches": 10.25,
        "standing_vertical_inches": 36.0,
        "max_vertical_inches": 39.5,
        "lane_agility_seconds": 10.88,
        "three_quarter_sprint_seconds": 3.15,
        "wingspan_to_height_ratio": 1.08,
        "notes": "Official 2021 NBA Draft Combine",
        "data_source_evidence_json": {"source": "NBA Draft Combine 2021", "verified": True},
    },
    {
        "player_id": "1630567",
        "source_name": "official_roster",
        "measurement_type": "listed",
        "draft_year": 2021,
        "season": "2025-26",
        "height_no_shoes_inches": None,
        "height_shoes_inches": 80.0,
        "wingspan_inches": None,
        "standing_reach_inches": None,
        "weight_lbs": 237.0,
        "body_fat_pct": None,
        "hand_length_inches": None,
        "hand_width_inches": None,
        "standing_vertical_inches": None,
        "max_vertical_inches": None,
        "lane_agility_seconds": None,
        "three_quarter_sprint_seconds": None,
        "wingspan_to_height_ratio": None,
        "notes": "Toronto Raptors 2025-26 Listed Roster",
        "data_source_evidence_json": {"source": "NBA Roster 2025-26", "listed_position": "F-G"},
    },
    # Pascal Siakam (NBA ID: 1627783)
    {
        "player_id": "1627783",
        "source_name": "draft_combine",
        "measurement_type": "combine",
        "draft_year": 2016,
        "season": None,
        "height_no_shoes_inches": 80.25,
        "height_shoes_inches": 81.5,
        "wingspan_inches": 87.25,
        "standing_reach_inches": 107.5,
        "weight_lbs": 227.0,
        "body_fat_pct": 5.0,
        "hand_length_inches": 9.25,
        "hand_width_inches": 10.0,
        "standing_vertical_inches": 30.5,
        "max_vertical_inches": 36.5,
        "lane_agility_seconds": 11.72,
        "three_quarter_sprint_seconds": 3.28,
        "wingspan_to_height_ratio": 1.07,
        "notes": "Official 2016 NBA Draft Combine",
        "data_source_evidence_json": {"source": "NBA Draft Combine 2016", "verified": True},
    },
    {
        "player_id": "1627783",
        "source_name": "official_roster",
        "measurement_type": "listed",
        "draft_year": 2016,
        "season": "2025-26",
        "height_no_shoes_inches": None,
        "height_shoes_inches": 80.0,
        "wingspan_inches": None,
        "standing_reach_inches": None,
        "weight_lbs": 245.0,
        "body_fat_pct": None,
        "hand_length_inches": None,
        "hand_width_inches": None,
        "standing_vertical_inches": None,
        "max_vertical_inches": None,
        "lane_agility_seconds": None,
        "three_quarter_sprint_seconds": None,
        "wingspan_to_height_ratio": None,
        "notes": "Indiana Pacers 2025-26 Listed Roster",
        "data_source_evidence_json": {"source": "NBA Roster 2025-26", "listed_position": "F"},
    },
    # Kobi Simmons (NBA ID: 1628424)
    {
        "player_id": "1628424",
        "source_name": "draft_combine",
        "measurement_type": "combine",
        "draft_year": 2017,
        "season": None,
        "height_no_shoes_inches": 75.75,
        "height_shoes_inches": 77.0,
        "wingspan_inches": 78.0,
        "standing_reach_inches": 98.0,
        "weight_lbs": 166.4,
        "body_fat_pct": 4.8,
        "hand_length_inches": 8.25,
        "hand_width_inches": 8.75,
        "standing_vertical_inches": 31.0,
        "max_vertical_inches": 38.5,
        "lane_agility_seconds": 11.23,
        "three_quarter_sprint_seconds": 3.14,
        "wingspan_to_height_ratio": 1.01,
        "notes": "Official 2017 NBA Draft Combine",
        "data_source_evidence_json": {"source": "NBA Draft Combine 2017", "verified": True},
    },
    {
        "player_id": "1628424",
        "source_name": "official_roster",
        "measurement_type": "listed",
        "draft_year": 2017,
        "season": "2025-26",
        "height_no_shoes_inches": None,
        "height_shoes_inches": 77.0,
        "wingspan_inches": None,
        "standing_reach_inches": None,
        "weight_lbs": 180.0,
        "body_fat_pct": None,
        "hand_length_inches": None,
        "hand_width_inches": None,
        "standing_vertical_inches": None,
        "max_vertical_inches": None,
        "lane_agility_seconds": None,
        "three_quarter_sprint_seconds": None,
        "wingspan_to_height_ratio": None,
        "notes": "Listed Roster 2025-26",
        "data_source_evidence_json": {"source": "NBA Roster 2025-26", "listed_position": "G"},
    },
]

FLAGSHIP_DRAFT_DATA = [
    # Bam Adebayo
    {
        "player_id": "1628389",
        "draft_year": 2017,
        "round_number": 1,
        "pick_overall": 14,
        "drafting_team_id": "MIA",
        "drafting_team_name": "Miami Heat",
        "draft_type": "draft",
        "college_or_prior_team": "Kentucky",
        "data_source_evidence_json": {"verified": True},
    },
    # Scottie Barnes
    {
        "player_id": "1630567",
        "draft_year": 2021,
        "round_number": 1,
        "pick_overall": 4,
        "drafting_team_id": "TOR",
        "drafting_team_name": "Toronto Raptors",
        "draft_type": "draft",
        "college_or_prior_team": "Florida State",
        "data_source_evidence_json": {"verified": True},
    },
    # Pascal Siakam
    {
        "player_id": "1627783",
        "draft_year": 2016,
        "round_number": 1,
        "pick_overall": 27,
        "drafting_team_id": "TOR",
        "drafting_team_name": "Toronto Raptors",
        "draft_type": "draft",
        "college_or_prior_team": "New Mexico State",
        "data_source_evidence_json": {"verified": True},
    },
    # Kobi Simmons
    {
        "player_id": "1628424",
        "draft_year": 2017,
        "round_number": None,
        "pick_overall": None,
        "drafting_team_id": None,
        "drafting_team_name": None,
        "draft_type": "undrafted",
        "college_or_prior_team": "Arizona",
        "data_source_evidence_json": {"verified": True},
    },
]


def seed_flagship_measurements(session: Session) -> dict[str, int]:
    """Seed flagship verified combine, listed, and draft records."""
    now = datetime.now(UTC)
    m_count = 0
    d_count = 0

    with allow_admin_mutation(session):
        for item in FLAGSHIP_MEASUREMENTS_DATA:
            stmt = (
                pg_insert(WorkbenchPlayerMeasurement)
                .values(
                    id=new_uuid(),
                    player_id=item["player_id"],
                    source_name=item["source_name"],
                    measurement_type=item["measurement_type"],
                    season=item.get("season"),
                    draft_year=item.get("draft_year"),
                    height_no_shoes_inches=item.get("height_no_shoes_inches"),
                    height_shoes_inches=item.get("height_shoes_inches"),
                    wingspan_inches=item.get("wingspan_inches"),
                    standing_reach_inches=item.get("standing_reach_inches"),
                    weight_lbs=item.get("weight_lbs"),
                    body_fat_pct=item.get("body_fat_pct"),
                    hand_length_inches=item.get("hand_length_inches"),
                    hand_width_inches=item.get("hand_width_inches"),
                    standing_vertical_inches=item.get("standing_vertical_inches"),
                    max_vertical_inches=item.get("max_vertical_inches"),
                    lane_agility_seconds=item.get("lane_agility_seconds"),
                    three_quarter_sprint_seconds=item.get("three_quarter_sprint_seconds"),
                    wingspan_to_height_ratio=item.get("wingspan_to_height_ratio"),
                    notes=item.get("notes"),
                    data_source_evidence_json=item.get("data_source_evidence_json", {}),
                    created_at=now,
                )
                .on_conflict_do_update(
                    constraint="uq_wb_measurements_player_source_type",
                    set_={
                        "height_no_shoes_inches": item.get("height_no_shoes_inches"),
                        "height_shoes_inches": item.get("height_shoes_inches"),
                        "wingspan_inches": item.get("wingspan_inches"),
                        "standing_reach_inches": item.get("standing_reach_inches"),
                        "weight_lbs": item.get("weight_lbs"),
                        "wingspan_to_height_ratio": item.get("wingspan_to_height_ratio"),
                        "data_source_evidence_json": item.get("data_source_evidence_json", {}),
                    },
                )
            )
            session.execute(stmt)
            m_count += 1

        for item in FLAGSHIP_DRAFT_DATA:
            stmt = (
                pg_insert(WorkbenchPlayerDraft)
                .values(
                    id=new_uuid(),
                    player_id=item["player_id"],
                    draft_year=item["draft_year"],
                    round_number=item.get("round_number"),
                    pick_overall=item.get("pick_overall"),
                    drafting_team_id=item.get("drafting_team_id"),
                    drafting_team_name=item.get("drafting_team_name"),
                    draft_type=item.get("draft_type", "draft"),
                    college_or_prior_team=item.get("college_or_prior_team"),
                    data_source_evidence_json=item.get("data_source_evidence_json", {}),
                    created_at=now,
                )
                .on_conflict_do_update(
                    constraint="uq_wb_draft_player_year",
                    set_={
                        "round_number": item.get("round_number"),
                        "pick_overall": item.get("pick_overall"),
                        "drafting_team_id": item.get("drafting_team_id"),
                        "drafting_team_name": item.get("drafting_team_name"),
                        "draft_type": item.get("draft_type", "draft"),
                        "college_or_prior_team": item.get("college_or_prior_team"),
                    },
                )
            )
            session.execute(stmt)
            d_count += 1

        session.commit()

    return {"measurements_seeded": m_count, "drafts_seeded": d_count}


def get_player_measurements_detail_service(
    session: Session,
    player_id: str,
) -> dict[str, Any]:
    """Retrieve full physical measurements and draft profile for a player."""
    ident = session.scalar(
        select(WorkbenchIdentity).where(
            WorkbenchIdentity.external_id == player_id,
            WorkbenchIdentity.kind == "player",
        )
    )
    display_name = ident.display_name if ident else player_id

    measurements = list(
        session.scalars(
            select(WorkbenchPlayerMeasurement)
            .where(WorkbenchPlayerMeasurement.player_id == player_id)
            .order_by(WorkbenchPlayerMeasurement.measurement_type.asc())
        ).all()
    )

    draft = session.scalar(
        select(WorkbenchPlayerDraft).where(WorkbenchPlayerDraft.player_id == player_id)
    )

    combine_record = next((m for m in measurements if m.measurement_type == "combine"), None)
    listed_record = next((m for m in measurements if m.measurement_type == "listed"), None)

    return {
        "player_id": player_id,
        "display_name": display_name,
        "has_measurements": len(measurements) > 0,
        "combine": (
            {
                "draft_year": combine_record.draft_year,
                "height_no_shoes_inches": combine_record.height_no_shoes_inches,
                "height_shoes_inches": combine_record.height_shoes_inches,
                "wingspan_inches": combine_record.wingspan_inches,
                "standing_reach_inches": combine_record.standing_reach_inches,
                "weight_lbs": combine_record.weight_lbs,
                "body_fat_pct": combine_record.body_fat_pct,
                "standing_vertical_inches": combine_record.standing_vertical_inches,
                "max_vertical_inches": combine_record.max_vertical_inches,
                "lane_agility_seconds": combine_record.lane_agility_seconds,
                "three_quarter_sprint_seconds": combine_record.three_quarter_sprint_seconds,
                "wingspan_to_height_ratio": combine_record.wingspan_to_height_ratio,
                "source_attribution": combine_record.source_name,
            }
            if combine_record
            else None
        ),
        "listed": (
            {
                "season": listed_record.season,
                "height_shoes_inches": listed_record.height_shoes_inches,
                "weight_lbs": listed_record.weight_lbs,
                "source_attribution": listed_record.source_name,
            }
            if listed_record
            else None
        ),
        "draft": (
            {
                "draft_year": draft.draft_year,
                "round_number": draft.round_number,
                "pick_overall": draft.pick_overall,
                "drafting_team_id": draft.drafting_team_id,
                "drafting_team_name": draft.drafting_team_name,
                "draft_type": draft.draft_type,
                "college_or_prior_team": draft.college_or_prior_team,
            }
            if draft
            else None
        ),
        "disclaimer": MEASUREMENT_DISCLOSURE,
    }


def query_measurements_service(
    session: Session,
    player_id: str | None = None,
    draft_year: int | None = None,
    min_wingspan: float | None = None,
    max_wingspan: float | None = None,
    min_height: float | None = None,
    max_height: float | None = None,
    measurement_type: str = "all",
    limit: int = 50,
) -> dict[str, Any]:
    """Query physical measurements across cohort with filtering."""
    query = (
        select(
            WorkbenchPlayerMeasurement,
            WorkbenchIdentity.display_name,
            WorkbenchPlayerDraft.draft_year.label("p_draft_year"),
            WorkbenchPlayerDraft.pick_overall,
            WorkbenchPlayerDraft.drafting_team_id,
        )
        .outerjoin(
            WorkbenchIdentity,
            (WorkbenchIdentity.external_id == WorkbenchPlayerMeasurement.player_id)
            & (WorkbenchIdentity.kind == "player"),
        )
        .outerjoin(
            WorkbenchPlayerDraft,
            WorkbenchPlayerDraft.player_id == WorkbenchPlayerMeasurement.player_id,
        )
    )

    if player_id:
        query = query.where(WorkbenchPlayerMeasurement.player_id == player_id)
    if draft_year:
        query = query.where(
            (WorkbenchPlayerMeasurement.draft_year == draft_year)
            | (WorkbenchPlayerDraft.draft_year == draft_year)
        )
    if measurement_type != "all":
        query = query.where(WorkbenchPlayerMeasurement.measurement_type == measurement_type)
    if min_wingspan is not None:
        query = query.where(WorkbenchPlayerMeasurement.wingspan_inches >= min_wingspan)
    if max_wingspan is not None:
        query = query.where(WorkbenchPlayerMeasurement.wingspan_inches <= max_wingspan)
    if min_height is not None:
        query = query.where(
            (WorkbenchPlayerMeasurement.height_shoes_inches >= min_height)
            | (WorkbenchPlayerMeasurement.height_no_shoes_inches >= min_height)
        )
    if max_height is not None:
        query = query.where(
            (WorkbenchPlayerMeasurement.height_shoes_inches <= max_height)
            | (WorkbenchPlayerMeasurement.height_no_shoes_inches <= max_height)
        )

    query = query.order_by(
        WorkbenchPlayerMeasurement.wingspan_inches.desc().nulls_last(),
        WorkbenchPlayerMeasurement.player_id.asc(),
    ).limit(limit)

    results = session.execute(query).all()
    items = []
    for m, name, d_year, pick, team_id in results:
        items.append(
            {
                "player_id": m.player_id,
                "display_name": name or m.player_id,
                "measurement_type": m.measurement_type,
                "source_name": m.source_name,
                "draft_year": m.draft_year or d_year,
                "pick_overall": pick,
                "drafting_team_id": team_id,
                "height_no_shoes_inches": m.height_no_shoes_inches,
                "height_shoes_inches": m.height_shoes_inches,
                "wingspan_inches": m.wingspan_inches,
                "standing_reach_inches": m.standing_reach_inches,
                "weight_lbs": m.weight_lbs,
                "body_fat_pct": m.body_fat_pct,
                "wingspan_to_height_ratio": m.wingspan_to_height_ratio,
            }
        )

    return {
        "items": items,
        "count": len(items),
        "disclaimer": MEASUREMENT_DISCLOSURE,
    }
