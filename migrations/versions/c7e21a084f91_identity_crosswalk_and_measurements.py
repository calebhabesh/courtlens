"""identity_crosswalk_and_measurements

Revision ID: c7e21a084f91
Revises: 1b66214e7c08
Create Date: 2026-10-02 11:15:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "c7e21a084f91"
down_revision: str | None = "1b66214e7c08"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind) if not op.get_context().as_sql else None

    # 1. workbench_identity_crosswalks
    if inspector is None or not inspector.has_table("workbench_identity_crosswalks"):
        op.create_table(
            "workbench_identity_crosswalks",
            sa.Column("id", sa.String(length=36), primary_key=True),
            sa.Column("source_namespace", sa.String(length=50), nullable=False),
            sa.Column("source_id", sa.String(length=100), nullable=False),
            sa.Column(
                "target_namespace", sa.String(length=50), nullable=False, server_default="nba"
            ),
            sa.Column("target_id", sa.String(length=100), nullable=False),
            sa.Column("kind", sa.String(length=20), nullable=False, server_default="player"),
            sa.Column(
                "confidence", sa.String(length=20), nullable=False, server_default="verified"
            ),
            sa.Column(
                "mapping_method", sa.String(length=50), nullable=False, server_default="exact_match"
            ),
            sa.Column("evidence_json", sa.JSON(), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
            sa.UniqueConstraint(
                "source_namespace",
                "source_id",
                "target_namespace",
                "target_id",
                "kind",
                name="uq_wb_crosswalk_src_tgt",
            ),
        )
        op.create_index(
            "ix_wb_crosswalk_source",
            "workbench_identity_crosswalks",
            ["source_namespace", "source_id"],
        )
        op.create_index(
            "ix_wb_crosswalk_target",
            "workbench_identity_crosswalks",
            ["target_namespace", "target_id"],
        )

    # 2. workbench_dated_metadata
    if inspector is None or not inspector.has_table("workbench_dated_metadata"):
        op.create_table(
            "workbench_dated_metadata",
            sa.Column("id", sa.String(length=36), primary_key=True),
            sa.Column("identity_id", sa.String(length=100), nullable=False),
            sa.Column("namespace", sa.String(length=50), nullable=False, server_default="nba"),
            sa.Column("kind", sa.String(length=20), nullable=False, server_default="player"),
            sa.Column("category", sa.String(length=50), nullable=False),
            sa.Column("effective_season", sa.String(length=10), nullable=True),
            sa.Column("effective_date", sa.Date(), nullable=True),
            sa.Column("observed_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("source_name", sa.String(length=50), nullable=False),
            sa.Column("data_json", sa.JSON(), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        )
        op.create_index(
            "ix_wb_dated_meta_ident_cat_date",
            "workbench_dated_metadata",
            ["identity_id", "category", "effective_date"],
        )
        op.create_index(
            "ix_workbench_dated_metadata_identity_id",
            "workbench_dated_metadata",
            ["identity_id"],
        )

    # 3. workbench_player_measurements
    if inspector is None or not inspector.has_table("workbench_player_measurements"):
        op.create_table(
            "workbench_player_measurements",
            sa.Column("id", sa.String(length=36), primary_key=True),
            sa.Column("player_id", sa.String(length=100), nullable=False),
            sa.Column("source_name", sa.String(length=50), nullable=False),
            sa.Column("measurement_type", sa.String(length=20), nullable=False),
            sa.Column("season", sa.String(length=10), nullable=True),
            sa.Column("draft_year", sa.Integer(), nullable=True),
            sa.Column("height_no_shoes_inches", sa.Float(), nullable=True),
            sa.Column("height_shoes_inches", sa.Float(), nullable=True),
            sa.Column("wingspan_inches", sa.Float(), nullable=True),
            sa.Column("standing_reach_inches", sa.Float(), nullable=True),
            sa.Column("weight_lbs", sa.Float(), nullable=True),
            sa.Column("body_fat_pct", sa.Float(), nullable=True),
            sa.Column("hand_length_inches", sa.Float(), nullable=True),
            sa.Column("hand_width_inches", sa.Float(), nullable=True),
            sa.Column("standing_vertical_inches", sa.Float(), nullable=True),
            sa.Column("max_vertical_inches", sa.Float(), nullable=True),
            sa.Column("lane_agility_seconds", sa.Float(), nullable=True),
            sa.Column("three_quarter_sprint_seconds", sa.Float(), nullable=True),
            sa.Column("wingspan_to_height_ratio", sa.Float(), nullable=True),
            sa.Column("notes", sa.Text(), nullable=True),
            sa.Column("data_source_evidence_json", sa.JSON(), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.UniqueConstraint(
                "player_id",
                "source_name",
                "measurement_type",
                "draft_year",
                "season",
                name="uq_wb_measurements_player_source_type",
            ),
        )
        op.create_index(
            "ix_workbench_player_measurements_player_id",
            "workbench_player_measurements",
            ["player_id"],
        )
        op.create_index(
            "ix_wb_measurements_wingspan",
            "workbench_player_measurements",
            ["wingspan_inches"],
        )
        op.create_index(
            "ix_wb_measurements_draft_year",
            "workbench_player_measurements",
            ["draft_year"],
        )

    # 4. workbench_player_drafts
    if inspector is None or not inspector.has_table("workbench_player_drafts"):
        op.create_table(
            "workbench_player_drafts",
            sa.Column("id", sa.String(length=36), primary_key=True),
            sa.Column("player_id", sa.String(length=100), nullable=False),
            sa.Column("draft_year", sa.Integer(), nullable=False),
            sa.Column("round_number", sa.Integer(), nullable=True),
            sa.Column("pick_overall", sa.Integer(), nullable=True),
            sa.Column("drafting_team_id", sa.String(length=100), nullable=True),
            sa.Column("drafting_team_name", sa.String(length=100), nullable=True),
            sa.Column("draft_type", sa.String(length=30), nullable=False, server_default="draft"),
            sa.Column("college_or_prior_team", sa.String(length=150), nullable=True),
            sa.Column("data_source_evidence_json", sa.JSON(), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.UniqueConstraint(
                "player_id",
                "draft_year",
                name="uq_wb_draft_player_year",
            ),
        )
        op.create_index(
            "ix_workbench_player_drafts_player_id",
            "workbench_player_drafts",
            ["player_id"],
        )
        op.create_index(
            "ix_wb_draft_year_pick",
            "workbench_player_drafts",
            ["draft_year", "pick_overall"],
        )


def downgrade() -> None:
    op.drop_table("workbench_player_drafts")
    op.drop_table("workbench_player_measurements")
    op.drop_table("workbench_dated_metadata")
    op.drop_table("workbench_identity_crosswalks")
