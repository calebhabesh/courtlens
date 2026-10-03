"""possession_and_stint_warehouse_tables

Revision ID: f9c31a084f93
Revises: e8b19a084f92
Create Date: 2026-10-03 05:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "f9c31a084f93"
down_revision: str | None = "e8b19a084f92"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind) if not op.get_context().as_sql else None

    # 1. workbench_reconstruction_overrides
    if inspector is None or not inspector.has_table("workbench_reconstruction_overrides"):
        op.create_table(
            "workbench_reconstruction_overrides",
            sa.Column("id", sa.String(length=36), primary_key=True),
            sa.Column(
                "dataset_id",
                sa.String(length=36),
                sa.ForeignKey("workbench_datasets.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("game_id", sa.String(length=10), nullable=False),
            sa.Column("override_type", sa.String(length=50), nullable=False),
            sa.Column("period", sa.Integer(), nullable=True),
            sa.Column("action_number", sa.Integer(), nullable=True),
            sa.Column("order_index", sa.Integer(), nullable=True),
            sa.Column("team_id", sa.String(length=100), nullable=True),
            sa.Column("player_id", sa.String(length=100), nullable=True),
            sa.Column("original_value_json", sa.JSON(), nullable=True),
            sa.Column("override_value_json", sa.JSON(), nullable=False),
            sa.Column("reason", sa.Text(), nullable=False),
            sa.Column("author", sa.String(length=100), nullable=False),
            sa.Column("status", sa.String(length=20), nullable=False, server_default="active"),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.func.now(),
            ),
        )
        op.create_index(
            "ix_wb_overrides_dataset_game",
            "workbench_reconstruction_overrides",
            ["dataset_id", "game_id"],
        )
        op.create_index(
            "ix_wb_overrides_type",
            "workbench_reconstruction_overrides",
            ["override_type"],
        )

    # 2. workbench_lineup_stints
    if inspector is None or not inspector.has_table("workbench_lineup_stints"):
        op.create_table(
            "workbench_lineup_stints",
            sa.Column("id", sa.String(length=36), primary_key=True),
            sa.Column(
                "dataset_id",
                sa.String(length=36),
                sa.ForeignKey("workbench_datasets.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("game_id", sa.String(length=10), nullable=False),
            sa.Column("stint_index", sa.Integer(), nullable=False),
            sa.Column("period", sa.Integer(), nullable=False),
            sa.Column("start_clock", sa.String(length=20), nullable=False),
            sa.Column("end_clock", sa.String(length=20), nullable=False),
            sa.Column("start_seconds_remaining", sa.Float(), nullable=False),
            sa.Column("end_seconds_remaining", sa.Float(), nullable=False),
            sa.Column("duration_seconds", sa.Float(), nullable=False),
            sa.Column("home_team_id", sa.String(length=100), nullable=False),
            sa.Column("away_team_id", sa.String(length=100), nullable=False),
            sa.Column("home_lineup_json", sa.JSON(), nullable=False),
            sa.Column("away_lineup_json", sa.JSON(), nullable=False),
            sa.Column("home_lineup_key", sa.String(length=150), nullable=False),
            sa.Column("away_lineup_key", sa.String(length=150), nullable=False),
            sa.Column("start_home_score", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("start_away_score", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("end_home_score", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("end_away_score", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("home_points", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("away_points", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("home_possessions", sa.Float(), nullable=False, server_default="0.0"),
            sa.Column("away_possessions", sa.Float(), nullable=False, server_default="0.0"),
            sa.Column("total_possessions", sa.Float(), nullable=False, server_default="0.0"),
            sa.Column("stats_json", sa.JSON(), nullable=False, server_default="{}"),
            sa.Column("player_stats_json", sa.JSON(), nullable=False, server_default="{}"),
            sa.Column(
                "policy_version",
                sa.String(length=50),
                nullable=False,
                server_default="possession-policy-v1",
            ),
            sa.Column("source_hash", sa.String(length=64), nullable=False),
            sa.Column("status", sa.String(length=20), nullable=False, server_default="valid"),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.func.now(),
            ),
            sa.UniqueConstraint("dataset_id", "game_id", "stint_index", name="uq_wb_stint_index"),
        )
        op.create_index(
            "ix_wb_stints_dataset_game",
            "workbench_lineup_stints",
            ["dataset_id", "game_id"],
        )
        op.create_index(
            "ix_wb_stints_home_lineup",
            "workbench_lineup_stints",
            ["home_lineup_key"],
        )
        op.create_index(
            "ix_wb_stints_away_lineup",
            "workbench_lineup_stints",
            ["away_lineup_key"],
        )

    # 3. workbench_stint_players
    if inspector is None or not inspector.has_table("workbench_stint_players"):
        op.create_table(
            "workbench_stint_players",
            sa.Column("id", sa.String(length=36), primary_key=True),
            sa.Column(
                "dataset_id",
                sa.String(length=36),
                sa.ForeignKey("workbench_datasets.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column(
                "stint_id",
                sa.String(length=36),
                sa.ForeignKey("workbench_lineup_stints.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("game_id", sa.String(length=10), nullable=False),
            sa.Column("team_id", sa.String(length=100), nullable=False),
            sa.Column("opponent_team_id", sa.String(length=100), nullable=False),
            sa.Column("player_id", sa.String(length=100), nullable=False),
            sa.Column("side", sa.String(length=10), nullable=False),
            sa.Column("period", sa.Integer(), nullable=False),
            sa.Column("duration_seconds", sa.Float(), nullable=False),
            sa.Column("possessions", sa.Float(), nullable=False, server_default="0.0"),
            sa.Column("opponent_possessions", sa.Float(), nullable=False, server_default="0.0"),
            sa.Column("points", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("team_points", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("points_allowed", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("stats_json", sa.JSON(), nullable=False, server_default="{}"),
            sa.Column("source_hash", sa.String(length=64), nullable=False),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.func.now(),
            ),
            sa.UniqueConstraint("dataset_id", "stint_id", "player_id", name="uq_wb_stint_player"),
        )
        op.create_index(
            "ix_wb_stint_players_dataset_player",
            "workbench_stint_players",
            ["dataset_id", "player_id"],
        )
        op.create_index(
            "ix_wb_stint_players_dataset_game",
            "workbench_stint_players",
            ["dataset_id", "game_id"],
        )
        op.create_index(
            "ix_wb_stint_players_dataset_team",
            "workbench_stint_players",
            ["dataset_id", "team_id"],
        )


def downgrade() -> None:
    op.drop_table("workbench_stint_players")
    op.drop_table("workbench_lineup_stints")
    op.drop_table("workbench_reconstruction_overrides")
