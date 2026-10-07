"""Read-only B26 input inventory; counts never authorize admission or model fitting."""

from __future__ import annotations

import argparse
import hashlib
import json
from datetime import UTC, date, datetime
from pathlib import Path
from typing import Any

from sqlalchemy import and_, create_engine, func, select, text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session, aliased

from courtlens.config import get_settings
from courtlens.domain.research_registration import ResearchProtocol
from courtlens.evaluation.research_registration import MAX_DOCUMENT_BYTES, load_document
from courtlens.workbench_models import (
    WorkbenchDataset,
    WorkbenchLineup,
    WorkbenchLineupStint,
    WorkbenchMatchup,
    WorkbenchPbpEvent,
    WorkbenchPossession,
    WorkbenchReleaseBinding,
    WorkbenchRichAdmission,
    WorkbenchSchedule,
    WorkbenchShot,
    WorkbenchTeamGame,
)

FAMILIES: dict[str, Any] = {
    "pbp": WorkbenchPbpEvent,
    "possessions": WorkbenchPossession,
    "lineups": WorkbenchLineup,
    "stints": WorkbenchLineupStint,
    "shots": WorkbenchShot,
    "matchups": WorkbenchMatchup,
}
REQUIREMENTS = {
    "courtload-rapm-v1": ("stints", "possessions"),
    "courtload-six-factor-v1": ("stints", "possessions", "pbp"),
    "courtload-expected-shot-v1": ("shots",),
    "courtload-adjusted-shooting-v1": ("possessions", "pbp"),
}


def _metadata_bytes(path: Path) -> bytes:
    with path.open("rb") as stream:
        payload = stream.read(MAX_DOCUMENT_BYTES + 1)
    if len(payload) > MAX_DOCUMENT_BYTES:
        raise ValueError("evaluation metadata exceeds 8 MiB")
    return payload


def retained_exposure_inventory(root: Path) -> list[dict[str, Any]]:
    """Inspect run/registration metadata only; never open predictions or final errors.

    This is positive evidence of exposure, not proof that other seasons are untouched.
    """
    records = []
    for manifest_path in sorted(root.glob("*/run-manifest.json")):
        manifest_bytes = _metadata_bytes(manifest_path)
        manifest = json.loads(manifest_bytes)
        registration_path = manifest_path.parent / "preopen-registration.json"
        registration_bytes = (
            _metadata_bytes(registration_path) if registration_path.exists() else None
        )
        registration = json.loads(registration_bytes) if registration_bytes is not None else {}
        boundary = registration.get("final_split_boundary", registration.get("s3_boundary"))
        declared_hash = manifest.get(
            "preopen_registration_sha256", manifest.get("s3_opened_after_registration_sha256")
        )
        actual_hash = (
            hashlib.sha256(registration_bytes).hexdigest()
            if registration_bytes is not None
            else None
        )
        records.append(
            {
                "run_id": manifest.get("run_id"),
                "manifest": manifest_path.relative_to(root).as_posix(),
                "manifest_sha256": hashlib.sha256(manifest_bytes).hexdigest(),
                "final_test_opened": manifest.get("final_test_opened"),
                "final_boundary": boundary,
                "registration_sha256": actual_hash,
                "registration_hash_matches_manifest": (
                    actual_hash == declared_hash if declared_hash is not None else None
                ),
            }
        )
    return records


def input_inventory(
    session: Session,
    *,
    dataset_id: str,
    before_date: date,
    protocols: list[ResearchProtocol],
) -> dict[str, Any]:
    """Aggregate one dataset without conflating fixture rows, phases or future dates."""
    dataset = session.get(WorkbenchDataset, dataset_id)
    if dataset is None:
        raise ValueError("unknown dataset")
    schedule = WorkbenchSchedule
    scope = (
        schedule.dataset_id == dataset_id,
        schedule.phase == "regular_season",
        schedule.game_status == 3,
        schedule.game_date < before_date,
    )
    seasons = [
        {
            "season": season,
            "finalized_schedule_games": count,
            "first_date": first.isoformat(),
            "last_date": last.isoformat(),
        }
        for season, count, first, last in session.execute(
            select(
                schedule.season,
                func.count(),
                func.min(schedule.game_date),
                func.max(schedule.game_date),
            )
            .where(*scope)
            .group_by(schedule.season)
            .order_by(schedule.season)
        )
    ]
    family_counts = {}
    for name, model in FAMILIES.items():
        retained = session.scalar(
            select(func.count()).select_from(model).where(model.dataset_id == dataset_id)
        )
        valid = session.scalar(
            select(func.count())
            .select_from(model)
            .where(model.dataset_id == dataset_id, model.status == "valid")
        )
        grouped = list(
            session.execute(
                select(schedule.season, func.count(), func.count(func.distinct(model.game_id)))
                .select_from(model)
                .join(
                    schedule,
                    and_(
                        model.dataset_id == schedule.dataset_id, model.game_id == schedule.game_id
                    ),
                )
                .where(*scope, model.status == "valid")
                .group_by(schedule.season)
                .order_by(schedule.season)
            )
        )
        family_counts[name] = {
            "retained_rows": retained,
            "valid_rows": valid,
            "valid_rows_outside_scope": int(valid or 0) - sum(row[1] for row in grouped),
            "by_season": [
                {"season": season, "rows": rows, "games_with_rows": games}
                for season, rows, games in grouped
            ],
        }

    home = aliased(WorkbenchTeamGame)
    away = aliased(WorkbenchTeamGame)
    team_counts = [
        {"season": season, "games_with_reciprocal_final_team_boxes": count}
        for season, count in session.execute(
            select(schedule.season, func.count())
            .select_from(schedule)
            .join(
                home,
                and_(
                    home.dataset_id == schedule.dataset_id,
                    home.game_id == schedule.game_id,
                    home.team_id == schedule.home_team_id,
                ),
            )
            .join(
                away,
                and_(
                    away.dataset_id == schedule.dataset_id,
                    away.game_id == schedule.game_id,
                    away.team_id == schedule.away_team_id,
                ),
            )
            .where(
                *scope,
                home.is_final.is_(True),
                away.is_final.is_(True),
                home.side == "home",
                away.side == "away",
                home.opponent_id == away.team_id,
                away.opponent_id == home.team_id,
                home.points == away.opponent_points,
                away.points == home.opponent_points,
                home.game_date == schedule.game_date,
                away.game_date == schedule.game_date,
                home.phase == schedule.phase,
                away.phase == schedule.phase,
                home.season == schedule.season,
                away.season == schedule.season,
            )
            .group_by(schedule.season)
            .order_by(schedule.season)
        )
    ]
    admissions = [
        {
            "season": row.season,
            "family": row.source_family,
            "status": row.status,
            "expected_games": row.total_games_expected,
            "observed_games": row.total_games_observed,
            "admitted_games": row.total_games_admitted,
            "source_sha256": row.source_sha256,
            "source_bytes": row.source_bytes,
            "parser_signature": row.parser_signature,
            "policy_version": row.policy_version,
        }
        for row in session.scalars(
            select(WorkbenchRichAdmission)
            .where(WorkbenchRichAdmission.dataset_id == dataset_id)
            .order_by(WorkbenchRichAdmission.season, WorkbenchRichAdmission.source_family)
        )
    ]
    return {
        "status": "source_blocked",
        "fit_authorized": False,
        "scope": {
            "dataset_id": dataset_id,
            "phase": "regular_season",
            "before_date": before_date.isoformat(),
        },
        "dataset": {
            "status": dataset.status,
            "content_sha256": dataset.content_sha256,
            "membership_sha256": dataset.membership_sha256,
            "semantic_signature": dataset.semantic_signature,
            "declared_seasons": dataset.seasons_json,
            "release_ids": sorted(
                session.scalars(
                    select(WorkbenchReleaseBinding.snapshot_id).where(
                        WorkbenchReleaseBinding.dataset_id == dataset_id
                    )
                )
            ),
        },
        "schedule_inventory": seasons,
        "team_box_inventory": team_counts,
        "family_inventory": family_counts,
        "admission_metadata_not_independently_verified": admissions,
        "experiments": [
            {
                "experiment": protocol.experiment,
                "protocol_sha256": protocol.content_hash(),
                "status": "source_blocked",
                "fit_authorized": False,
                "minimum_complete_seasons": protocol.minimum_complete_seasons,
                "required_families": REQUIREMENTS[protocol.experiment],
                "input_gates": protocol.input_gates,
                "sample_policy": protocol.sample_policy,
                "additional_evidence_required": [
                    "Independent source-byte, identity, field, game and season reconciliation",
                    "Final-exposure audit and an honest chronology amendment when exposed",
                    "Exact game/row splits; expected-shot selection/calibration sub-memberships",
                ],
            }
            for protocol in sorted(protocols, key=lambda p: p.experiment)
        ],
        "limitations": [
            "Schedule counts do not certify complete seasons; row counts do not certify games.",
            "Admission metadata and valid/ready labels require independent evidence.",
            "Existing shots do not retain provider event IDs; event uniqueness is not established.",
            "Six-factor denominators and adjusted-shooting opportunity marts are unverified.",
            "Inventory does not validate bindings, reconstruct stints, fit models or publish.",
        ],
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dataset-id", required=True)
    parser.add_argument("--before-date", required=True, type=date.fromisoformat)
    parser.add_argument("--protocol-root", type=Path, default=Path("evaluation/research/protocols"))
    parser.add_argument("--evaluation-root", type=Path, default=Path("data/artifacts/evaluation"))
    parser.add_argument(
        "--output", type=Path, help="Exclusive JSON creation; never overwrite evidence"
    )
    args = parser.parse_args()
    try:
        protocols = []
        for experiment in REQUIREMENTS:
            protocol = load_document(args.protocol_root / f"{experiment}.json")
            if not isinstance(protocol, ResearchProtocol) or protocol.experiment != experiment:
                raise ValueError("protocol filename and experiment identity differ")
            protocols.append(protocol)
        settings = get_settings()
        engine = create_engine(settings.database_url, isolation_level="REPEATABLE READ")
        try:
            if engine.dialect.name != "postgresql":
                raise ValueError("read-only readiness requires PostgreSQL")
            with engine.connect() as connection, connection.begin() as transaction:
                connection.execute(text("SET TRANSACTION READ ONLY"))
                connection.execute(text("SET LOCAL statement_timeout = '20s'"))
                with Session(connection, autoflush=False) as session:
                    inventory = input_inventory(
                        session,
                        dataset_id=args.dataset_id,
                        before_date=args.before_date,
                        protocols=protocols,
                    )
                transaction.rollback()
        finally:
            engine.dispose()
        inventory["retained_exposure_metadata"] = retained_exposure_inventory(args.evaluation_root)
        inventory["exposure_audit_limit"] = (
            "Positive retained exposure evidence only; "
            "absence of a run is not evidence of an untouched final."
        )
        inventory["observed_at"] = datetime.now(UTC).isoformat()
        payload = json.dumps(inventory, indent=2, sort_keys=True) + "\n"
        if args.output:
            with args.output.open("x") as stream:
                stream.write(payload)
        print(payload, end="")
    except SQLAlchemyError:
        # Database exceptions can embed connection details; keep operator output bounded.
        parser.error("database inventory failed; no fitting or database mutation performed")
    except (ValueError, OSError) as exc:
        parser.error(str(exc))


if __name__ == "__main__":
    main()
