"""Freeze exact admitted memberships for the separately registered retrospective shot experiment."""

from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from courtload.domain.research_registration import (
    ResearchProtocol,
    RetrospectiveShotBinding,
    SplitGame,
)
from courtload.domain.rich_sources import compute_payload_hash
from courtload.ingestion.sportsdataverse import hash_file
from courtload.research_models import ResearchDataset, ResearchGame


def bind_shots(
    session: Session, dataset_id: str, protocol: ResearchProtocol
) -> RetrospectiveShotBinding:
    if protocol.experiment != "courtload-expected-shot-retrospective-v2":
        raise ValueError("this binding builder requires the registered retrospective amendment")
    dataset = session.get(ResearchDataset, dataset_id)
    if dataset is None:
        raise ValueError("unknown admitted research dataset")
    rows = session.scalars(
        select(ResearchGame)
        .where(ResearchGame.dataset_id == dataset_id)
        .order_by(ResearchGame.game_id)
    ).all()
    seasons = sorted({r.season for r in rows})
    if len(seasons) < 3 or any(sum(r.season == s for r in rows) != 1230 for s in seasons):
        raise ValueError("binding requires exactly complete admitted season memberships")
    games = [
        SplitGame(
            game_id=r.game_id,
            season=r.season,
            game_date=r.game_date,
            role="final_test"
            if r.season == seasons[-1]
            else "validation"
            if r.season == seasons[-2]
            else "training",
            rows=r.eligible_rows,
            row_membership_sha256=r.eligible_membership_sha256,
        )
        for r in rows
    ]
    validation = [g for g in games if g.role == "validation"]
    dates = sorted({g.game_date for g in validation})
    boundary = dates[len(dates) // 2]
    selection = [g for g in validation if g.game_date < boundary]
    calibration = [g for g in validation if g.game_date >= boundary]
    for group, minimum in [
        ([g for g in games if g.role == "training"], 10000),
        (selection, 1000),
        (calibration, 1000),
        ([g for g in games if g.role == "final_test"], 1000),
    ]:
        if len(group) < 30 or sum(g.rows for g in group) < minimum:
            raise ValueError("preregistered role/half sample gate not met")
    binding = RetrospectiveShotBinding.model_validate(
        {
            "schema_version": "courtload-retrospective-shot-binding-v2",
            "experiment": protocol.experiment,
            "protocol_sha256": protocol.content_hash(),
            "dataset_id": dataset_id,
            "dataset_content_sha256": dataset.content_sha256,
            "source_membership_sha256": dataset.source_membership_sha256,
            "transform_sha256": dataset.transform_sha256,
            "coverage_report_sha256": dataset.coverage_report_sha256,
            "final_exposure_audit_sha256": hash_file(
                Path("docs/evidence/b26-input-readiness.json")
            )[0],
            "chronology_amendment_sha256": hash_file(
                Path("docs/design/expected-shot-retrospective-v2.md")
            )[0],
            "final_previously_exposed": True,
            "classification": "retrospective_research",
            "complete_seasons": seasons,
            "games": games,
            "selection_games": [g.game_id for g in selection],
            "calibration_games": [g.game_id for g in calibration],
            "selection_membership_sha256": compute_payload_hash(
                [g.model_dump(mode="json") for g in selection]
            ),
            "calibration_membership_sha256": compute_payload_hash(
                [g.model_dump(mode="json") for g in calibration]
            ),
        }
    )
    binding.validate_protocol(protocol)
    return binding
