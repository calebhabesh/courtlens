"""warehouse publication state and immutable serving rows

Revision ID: 4b19f0a2c7de
Revises: 8ffd4c5912e2
Create Date: 2026-09-21 12:00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "4b19f0a2c7de"
down_revision: str | None = "8ffd4c5912e2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "warehouse_builds",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("dataset_id", sa.String(length=36), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("candidate_schema", sa.String(length=48), nullable=False),
        sa.Column("code_version", sa.String(length=64), nullable=False),
        sa.Column("metric_version", sa.String(length=30), nullable=False),
        sa.Column("feature_version", sa.String(length=30), nullable=False),
        sa.Column("scoring_version", sa.String(length=64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("validation_report_json", sa.JSON(), nullable=False),
        sa.ForeignKeyConstraint(["dataset_id"], ["archive_datasets.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("candidate_schema"),
    )
    op.create_table(
        "serving_snapshots",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("build_id", sa.String(length=36), nullable=False),
        sa.Column("dataset_id", sa.String(length=36), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("mode", sa.String(length=40), nullable=False),
        sa.Column("source", sa.String(length=100), nullable=False),
        sa.Column("coverage_start", sa.Date(), nullable=False),
        sa.Column("coverage_end", sa.Date(), nullable=False),
        sa.Column("default_replay_date", sa.Date(), nullable=False),
        sa.Column("supported_replay_dates_json", sa.JSON(), nullable=False),
        sa.Column("code_version", sa.String(length=64), nullable=False),
        sa.Column("metric_version", sa.String(length=30), nullable=False),
        sa.Column("feature_version", sa.String(length=30), nullable=False),
        sa.Column("scoring_version", sa.String(length=64), nullable=False),
        sa.Column("quality_report_json", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["build_id"], ["warehouse_builds.id"]),
        sa.ForeignKeyConstraint(["dataset_id"], ["archive_datasets.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("build_id"),
    )
    op.create_table(
        "published_snapshots",
        sa.Column("channel", sa.String(length=30), nullable=False),
        sa.Column("snapshot_id", sa.String(length=36), nullable=False),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["snapshot_id"], ["serving_snapshots.id"]),
        sa.PrimaryKeyConstraint("channel"),
    )
    op.create_table(
        "serving_player_games",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("snapshot_id", sa.String(length=36), nullable=False),
        sa.Column("dataset_id", sa.String(length=36), nullable=False),
        sa.Column("game_id", sa.String(length=10), nullable=False),
        sa.Column("player_id", sa.String(length=100), nullable=False),
        sa.Column("player_name", sa.String(length=200), nullable=False),
        sa.Column("team_id", sa.String(length=100), nullable=False),
        sa.Column("opponent_id", sa.String(length=100), nullable=False),
        sa.Column("game_date", sa.Date(), nullable=False),
        sa.Column("season", sa.String(length=10), nullable=False),
        sa.Column("appearance", sa.String(length=30), nullable=False),
        sa.Column("minutes_seconds", sa.Integer(), nullable=True),
        sa.Column("stats_json", sa.JSON(), nullable=False),
        sa.Column("reference_points", sa.Numeric(precision=12, scale=4), nullable=True),
        sa.Column("source_version_id", sa.String(length=36), nullable=False),
        sa.Column("source_observation_id", sa.String(length=36), nullable=False),
        sa.ForeignKeyConstraint(["dataset_id"], ["archive_datasets.id"]),
        sa.ForeignKeyConstraint(["snapshot_id"], ["serving_snapshots.id"]),
        sa.ForeignKeyConstraint(["source_observation_id"], ["archive_observations.id"]),
        sa.ForeignKeyConstraint(["source_version_id"], ["archive_versions.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("snapshot_id", "game_id", "player_id"),
    )
    op.create_index(
        "ix_serving_player_games_snapshot_player_date",
        "serving_player_games",
        ["snapshot_id", "player_id", "game_date"],
    )
    op.create_table(
        "serving_player_profiles",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("snapshot_id", sa.String(length=36), nullable=False),
        sa.Column("dataset_id", sa.String(length=36), nullable=False),
        sa.Column("player_id", sa.String(length=100), nullable=False),
        sa.Column("player_name", sa.String(length=200), nullable=False),
        sa.Column("season", sa.String(length=10), nullable=False),
        sa.Column("replay_date", sa.Date(), nullable=False),
        sa.Column("cutoff_utc", sa.DateTime(timezone=True), nullable=False),
        sa.Column("inferred_team_id", sa.String(length=100), nullable=False),
        sa.Column("last_observed_date", sa.Date(), nullable=False),
        sa.Column("target_game_id", sa.String(length=10), nullable=False),
        sa.Column("target_game_date", sa.Date(), nullable=False),
        sa.Column("target_opponent_id", sa.String(length=100), nullable=False),
        sa.Column("lead_days", sa.Integer(), nullable=False),
        sa.Column("last_5_json", sa.JSON(), nullable=False),
        sa.Column("last_10_json", sa.JSON(), nullable=False),
        sa.Column("season_json", sa.JSON(), nullable=False),
        sa.Column("max_history_date", sa.Date(), nullable=False),
        sa.ForeignKeyConstraint(["dataset_id"], ["archive_datasets.id"]),
        sa.ForeignKeyConstraint(["snapshot_id"], ["serving_snapshots.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("snapshot_id", "player_id", "replay_date"),
    )
    op.create_index(
        "ix_serving_profiles_snapshot_player_date",
        "serving_player_profiles",
        ["snapshot_id", "player_id", "replay_date"],
    )
    op.create_table(
        "serving_opponent_contexts",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("snapshot_id", sa.String(length=36), nullable=False),
        sa.Column("dataset_id", sa.String(length=36), nullable=False),
        sa.Column("team_id", sa.String(length=100), nullable=False),
        sa.Column("season", sa.String(length=10), nullable=False),
        sa.Column("replay_date", sa.Date(), nullable=False),
        sa.Column("eligible_games", sa.Integer(), nullable=False),
        sa.Column("context_json", sa.JSON(), nullable=False),
        sa.Column("max_history_date", sa.Date(), nullable=True),
        sa.ForeignKeyConstraint(["dataset_id"], ["archive_datasets.id"]),
        sa.ForeignKeyConstraint(["snapshot_id"], ["serving_snapshots.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("snapshot_id", "team_id", "replay_date"),
    )
    op.create_index(
        "ix_serving_opponents_snapshot_team_date",
        "serving_opponent_contexts",
        ["snapshot_id", "team_id", "replay_date"],
    )


def downgrade() -> None:
    op.drop_index("ix_serving_opponents_snapshot_team_date", table_name="serving_opponent_contexts")
    op.drop_table("serving_opponent_contexts")
    op.drop_index("ix_serving_profiles_snapshot_player_date", table_name="serving_player_profiles")
    op.drop_table("serving_player_profiles")
    op.drop_index("ix_serving_player_games_snapshot_player_date", table_name="serving_player_games")
    op.drop_table("serving_player_games")
    op.drop_table("published_snapshots")
    op.drop_table("serving_snapshots")
    op.drop_table("warehouse_builds")
