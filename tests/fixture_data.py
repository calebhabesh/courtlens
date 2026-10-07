"""Small, complete provenance fixtures; never borrow rows from a published database."""

from datetime import datetime
from hashlib import sha256
from uuid import uuid4

from sqlalchemy.orm import Session

from courtlens.workbench_models import (
    WorkbenchAcquisition,
    WorkbenchArtifact,
    WorkbenchIdentity,
    WorkbenchObservation,
    WorkbenchVersion,
)


def add_provenance(session: Session) -> tuple[WorkbenchVersion, WorkbenchObservation]:
    namespace = uuid4().hex
    artifact = WorkbenchArtifact(
        sha256=sha256(namespace.encode()).hexdigest(),
        resource="qa-fixture",
        bytes=2,
        storage_path="fixture://synthetic",
        mime_type="application/json",
        source_attribution="CourtLens synthetic test fixture",
    )
    identity = WorkbenchIdentity(
        namespace="qa-fixture", kind="game", external_id=namespace, display_name="Fixture game"
    )
    session.add_all([artifact, identity])
    session.flush()
    acquisition = WorkbenchAcquisition(
        source_name="qa-fixture",
        resource="game",
        source_url="fixture://synthetic",
        status="success",
        artifact_id=artifact.id,
    )
    version = WorkbenchVersion(
        identity_id=identity.id,
        content_sha256=sha256(b"synthetic payload").hexdigest(),
        parser_version="qa-fixture",
        payload_json={},
    )
    session.add_all([acquisition, version])
    session.flush()
    observation = WorkbenchObservation(
        acquisition_id=acquisition.id,
        artifact_id=artifact.id,
        row_identifier="fixture-row",
        identity_id=identity.id,
        version_id=version.id,
        observation_order=1,
    )
    session.add(observation)
    session.flush()
    return version, observation


def add_workbench_dataset(
    session: Session,
    *,
    dataset_id: str | None = None,
    snapshot_id: str | None = None,
    published_at: datetime | None = None,
) -> str:
    """Synthetic multi-season cohort for query arithmetic, pagination, and HTTP tests."""
    from datetime import date

    from courtlens.archive_models import ArchiveDataset
    from courtlens.warehouse_models import PublishedSnapshot, ServingSnapshot, WarehouseBuild
    from courtlens.workbench_models import (
        WorkbenchDataset,
        WorkbenchPlayerGame,
        WorkbenchReleaseBinding,
        WorkbenchSchedule,
        WorkbenchTeamGame,
    )

    version, observation = add_provenance(session)
    dataset = WorkbenchDataset(
        content_sha256="c" * 64,
        membership_sha256="d" * 64,
        semantic_signature="e" * 64,
        source_namespace="qa-synthetic",
        parser_version="qa-fixture",
        quality_version="qa-fixture",
        seasons_json=["2023-24", "2024-25", "2025-26"],
        phases_json=["regular_season"],
        manifest_json={},
        coverage_json={},
        exclusions_json={},
        status="ready",
    )
    if dataset_id:
        dataset.id = dataset_id
    session.add(dataset)
    session.flush()
    players = {
        "1630567": "Scottie Barnes",
        "2544": "LeBron James",
        "203999": "Nikola Jokić",
        "1627783": "Pascal Siakam",
        "1629628": "RJ Barrett",
        "1629029": "Luka Dončić",
        "1626153": "Delon Wright",
        "1628389": "Bam Adebayo",
        "1628424": "Kobi Simmons",
    }
    players.update({f"qa-{i:03d}": f"Fixture Player {i}" for i in range(105)})
    for player_id, name in players.items():
        session.add(
            WorkbenchIdentity(
                namespace="nba", kind="player", external_id=player_id, display_name=name
            )
        )
    for ending_year in (2024, 2025, 2026):
        season = f"{ending_year - 1}-{str(ending_year)[-2:]}"
        for index, player_id in enumerate(players):
            games = 4 if player_id == "1628424" else 30 if index < 9 else 1
            for day in range(1, games + 1):
                team = "LAL" if player_id == "2544" else "TOR"
                appeared = player_id != "1626153" or day % 5 != 0
                points = (18 + index % 8 + day % 3) if appeared else 0
                session.add(
                    WorkbenchPlayerGame(
                        dataset_id=dataset.id,
                        game_id=f"002{ending_year % 100:02d}{day:05d}",
                        player_id=player_id,
                        team_id=team,
                        opponent_id="BOS",
                        game_date=date(ending_year, 1, day),
                        season=season,
                        phase="regular_season",
                        appearance="appeared" if appeared else "reported_nonappearance",
                        minutes_original="30:00" if appeared else "0:00",
                        minutes_seconds=1800 if appeared else 0,
                        points=points,
                        stats_json={
                            "points": points,
                            "rebounds_total": 4 + index % 5,
                            "assists": 2 + index % 7,
                            "steals": index % 3,
                            "blocks": index % 4,
                            "turnovers": 1 + index % 3,
                            "field_goals_attempted": 15 + index % 4,
                            "field_goals_made": 7 + index % 4,
                            "three_pointers_attempted": 3 + index % 4,
                            "three_pointers_made": 2,
                            "free_throws_attempted": 3 + index % 3,
                            "free_throws_made": 3,
                        },
                        source_version_id=version.id,
                        source_observation_id=observation.id,
                    )
                )
        for day in range(1, 31):
            game_id = f"002{ending_year % 100:02d}{day:05d}"
            session.add(
                WorkbenchSchedule(
                    dataset_id=dataset.id,
                    game_id=game_id,
                    game_date=date(ending_year, 1, day),
                    season=season,
                    phase="regular_season",
                    home_team_id="TOR" if day % 2 else "BOS",
                    away_team_id="BOS" if day % 2 else "TOR",
                    game_status=3,
                    source_version_id=version.id,
                    source_observation_id=observation.id,
                )
            )
            for team, opponent, side, points, allowed in (
                ("TOR", "BOS", "home", 110, 100),
                ("BOS", "TOR", "away", 100, 110),
            ):
                session.add(
                    WorkbenchTeamGame(
                        dataset_id=dataset.id,
                        game_id=game_id,
                        team_id=team,
                        opponent_id=opponent,
                        game_date=date(ending_year, 1, day),
                        season=season,
                        phase="regular_season",
                        side=side if day % 2 else ("away" if side == "home" else "home"),
                        points=points,
                        opponent_points=allowed,
                        is_final=True,
                        stats_json={
                            "field_goals_attempted": 80,
                            "field_goals_made": 40,
                            "three_pointers_attempted": 30,
                            "three_pointers_made": 10,
                            "free_throws_attempted": 25,
                            "free_throws_made": 20,
                            "rebounds_offensive": 10,
                            "rebounds_defensive": 30,
                            "turnovers": 12,
                        },
                        source_version_id=version.id,
                        source_observation_id=observation.id,
                    )
                )
    from courtlens.domain.teams import NBA_TEAMS

    others = [team.tricode for team in NBA_TEAMS.values() if team.tricode not in {"TOR", "BOS"}]
    for index in range(0, len(others), 2):
        for side, team, opponent in (
            ("home", others[index], others[index + 1]),
            ("away", others[index + 1], others[index]),
        ):
            session.add(
                WorkbenchTeamGame(
                    dataset_id=dataset.id,
                    game_id=f"002239{index:04d}",
                    team_id=team,
                    opponent_id=opponent,
                    game_date=date(2024, 1, 1),
                    season="2023-24",
                    phase="regular_season",
                    side=side,
                    points=100 + index,
                    opponent_points=100 + index,
                    is_final=True,
                    stats_json={
                        "field_goals_attempted": 80,
                        "field_goals_made": 32 + index % 8,
                        "three_pointers_attempted": 30,
                        "three_pointers_made": 10,
                        "free_throws_attempted": 25,
                        "free_throws_made": 20,
                        "rebounds_offensive": 10,
                        "rebounds_defensive": 30,
                        "turnovers": 8 + index % 6,
                    },
                    source_version_id=version.id,
                    source_observation_id=observation.id,
                )
            )
    archive = ArchiveDataset(
        content_sha256="f" * 64,
        observation_sha256="a" * 64,
        source_namespace="qa-synthetic",
        parser_version="qa-fixture",
        manifest_json={},
        status="accepted",
    )
    session.add(archive)
    session.flush()
    build = WarehouseBuild(
        dataset_id=archive.id,
        status="ready",
        candidate_schema="qa_fixture",
        code_version="qa-fixture",
        metric_version="v1",
        feature_version="prior-day-v1",
        scoring_version="points-v1",
    )
    session.add(build)
    session.flush()
    snapshot = ServingSnapshot(
        build_id=build.id,
        dataset_id=archive.id,
        status="ready",
        mode="workbench_recent",
        source="qa-synthetic",
        coverage_start=date(2024, 1, 1),
        coverage_end=date(2026, 1, 30),
        default_replay_date=date(2026, 1, 31),
        supported_replay_dates_json=["2026-01-31"],
        code_version="qa-fixture",
        metric_version="v1",
        feature_version="prior-day-v1",
        scoring_version="points-v1",
        quality_report_json={},
    )
    if snapshot_id:
        snapshot.id = snapshot_id
    if published_at:
        snapshot.created_at = published_at
    session.add(snapshot)
    session.flush()
    session.add(
        WorkbenchReleaseBinding(
            snapshot_id=snapshot.id,
            dataset_id=dataset.id,
            semantic_signature=dataset.semantic_signature,
            capability_bindings_json={
                "player_facts": True,
                "team_facts": True,
                "schedules": True,
                "forecasting": "no_policy_registered",
            },
        )
    )
    from datetime import UTC, datetime

    from courtlens.archive_models import (
        ArchiveArtifact,
        ArchiveIdentity,
        ArchiveImport,
        ArchiveObservation,
        ArchivePlayerGame,
        ArchiveVersion,
    )

    archive_artifact = ArchiveArtifact(
        resource="players",
        sha256="b" * 64,
        bytes=2,
        storage_uri="fixture://archive",
        source_url="fixture://archive",
        source_revision="qa-fixture",
        acquired_at=datetime.now(UTC),
    )
    imported = ArchiveImport(status="success", dataset_id=archive.id)
    identity = ArchiveIdentity(namespace="qa-fixture", kind="player", external_id="archived-1")
    session.add_all([archive_artifact, imported, identity])
    session.flush()
    archived_version = ArchiveVersion(
        identity_id=identity.id,
        content_sha256="a" * 64,
        parser_version="qa-fixture",
        payload_json={"player": "Archived Fixture"},
    )
    session.add(archived_version)
    session.flush()
    archived_observation = ArchiveObservation(
        import_id=imported.id,
        artifact_id=archive_artifact.id,
        row_number=1,
        identity_id=identity.id,
        version_id=archived_version.id,
        observed_at=datetime.now(UTC),
    )
    session.add(archived_observation)
    session.flush()
    for day, appearance in ((1, "appeared"), (2, "reported_nonappearance")):
        session.add(
            ArchivePlayerGame(
                dataset_id=archive.id,
                game_id=f"002230000{day}",
                player_id="archived-1",
                team_id="TOR",
                opponent_id="BOS",
                game_date=date(2024, 1, day),
                date_precision="date",
                season="2023-24",
                appearance=appearance,
                minutes_original="30:00" if day == 1 else "",
                minutes_seconds=1800 if day == 1 else None,
                stats_json={
                    "points": 20 if day == 1 else None,
                    "reboundsTotal": 5,
                    "assists": 3,
                    "steals": 1,
                    "blocks": 1,
                    "turnovers": 2,
                    "fieldGoalsAttempted": 15,
                    "fieldGoalsMade": 7,
                    "threePointersAttempted": 3,
                    "threePointersMade": 2,
                    "freeThrowsAttempted": 4,
                    "freeThrowsMade": 4,
                },
                source_version_id=archived_version.id,
                source_observation_id=archived_observation.id,
            )
        )
    session.add(
        PublishedSnapshot(
            channel="public", snapshot_id=snapshot.id, published_at=snapshot.created_at
        )
    )
    session.commit()
    return dataset.id
