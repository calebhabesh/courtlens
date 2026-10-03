"""rich_source_admission_tables

Revision ID: e8b19a084f92
Revises: c7e21a084f91
Create Date: 2026-10-03 04:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "e8b19a084f92"
down_revision: str | None = "c7e21a084f91"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind) if not op.get_context().as_sql else None

    # 1. workbench_pbp_events
    if inspector is None or not inspector.has_table("workbench_pbp_events"):
        op.create_table(
            "workbench_pbp_events",
            sa.Column("id", sa.String(length=36), primary_key=True),
            sa.Column(
                "dataset_id",
                sa.String(length=36),
                sa.ForeignKey("workbench_datasets.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("game_id", sa.String(length=10), nullable=False),
            sa.Column("order_index", sa.Integer(), nullable=False),
            sa.Column("action_number", sa.Integer(), nullable=False),
            sa.Column("period", sa.Integer(), nullable=False),
            sa.Column("clock", sa.String(length=20), nullable=False),
            sa.Column("seconds_remaining", sa.Float(), nullable=False),
            sa.Column("event_type", sa.String(length=50), nullable=False),
            sa.Column("action_type", sa.String(length=100), nullable=True),
            sa.Column("sub_type", sa.String(length=100), nullable=True),
            sa.Column("team_id", sa.String(length=100), nullable=True),
            sa.Column("person_id", sa.String(length=100), nullable=True),
            sa.Column("score_home", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("score_away", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("points_total", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("shot_value", sa.Integer(), nullable=True),
            sa.Column("shot_distance", sa.Float(), nullable=True),
            sa.Column("x_legacy", sa.Float(), nullable=True),
            sa.Column("y_legacy", sa.Float(), nullable=True),
            sa.Column("possession_number", sa.Integer(), nullable=True),
            sa.Column("off_lineup_json", sa.JSON(), nullable=False, server_default="[]"),
            sa.Column("def_lineup_json", sa.JSON(), nullable=False, server_default="[]"),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("video_available", sa.Boolean(), nullable=False, server_default="false"),
            sa.Column("source_hash", sa.String(length=64), nullable=False),
            sa.Column("status", sa.String(length=20), nullable=False, server_default="valid"),
            sa.UniqueConstraint("dataset_id", "game_id", "order_index", name="uq_wb_pbp_order"),
        )
        op.create_index("ix_wb_pbp_dataset_game", "workbench_pbp_events", ["dataset_id", "game_id"])
        op.create_index("ix_wb_pbp_person", "workbench_pbp_events", ["person_id"])

    # 2. workbench_possessions
    if inspector is None or not inspector.has_table("workbench_possessions"):
        op.create_table(
            "workbench_possessions",
            sa.Column("id", sa.String(length=36), primary_key=True),
            sa.Column(
                "dataset_id",
                sa.String(length=36),
                sa.ForeignKey("workbench_datasets.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("game_id", sa.String(length=10), nullable=False),
            sa.Column("possession_number", sa.Integer(), nullable=False),
            sa.Column("period", sa.Integer(), nullable=False),
            sa.Column("number_in_period", sa.Integer(), nullable=False),
            sa.Column("offense_team_id", sa.String(length=100), nullable=False),
            sa.Column("defense_team_id", sa.String(length=100), nullable=False),
            sa.Column("start_order_index", sa.Integer(), nullable=False),
            sa.Column("end_order_index", sa.Integer(), nullable=False),
            sa.Column("start_seconds_remaining", sa.Float(), nullable=False),
            sa.Column("end_seconds_remaining", sa.Float(), nullable=False),
            sa.Column("points", sa.Integer(), nullable=False),
            sa.Column("is_second_chance", sa.Boolean(), nullable=False, server_default="false"),
            sa.Column(
                "possession_start_type",
                sa.String(length=50),
                nullable=False,
                server_default="OffDeadball",
            ),
            sa.Column("count_as_possession", sa.Boolean(), nullable=False, server_default="true"),
            sa.Column("stats_json", sa.JSON(), nullable=False, server_default="{}"),
            sa.Column("off_lineup_json", sa.JSON(), nullable=False, server_default="[]"),
            sa.Column("def_lineup_json", sa.JSON(), nullable=False, server_default="[]"),
            sa.Column(
                "lineup_source",
                sa.String(length=50),
                nullable=False,
                server_default="quarter_box",
            ),
            sa.Column(
                "policy_version",
                sa.String(length=50),
                nullable=False,
                server_default="possession-policy-v1",
            ),
            sa.Column("source_hash", sa.String(length=64), nullable=False),
            sa.Column("status", sa.String(length=20), nullable=False, server_default="valid"),
            sa.UniqueConstraint(
                "dataset_id", "game_id", "possession_number", name="uq_wb_poss_num"
            ),
        )
        op.create_index(
            "ix_wb_poss_dataset_game", "workbench_possessions", ["dataset_id", "game_id"]
        )
        op.create_index("ix_wb_poss_offense", "workbench_possessions", ["offense_team_id"])
        op.create_index("ix_wb_poss_defense", "workbench_possessions", ["defense_team_id"])

    # 3. workbench_lineups
    if inspector is None or not inspector.has_table("workbench_lineups"):
        op.create_table(
            "workbench_lineups",
            sa.Column("id", sa.String(length=36), primary_key=True),
            sa.Column(
                "dataset_id",
                sa.String(length=36),
                sa.ForeignKey("workbench_datasets.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("game_id", sa.String(length=10), nullable=False),
            sa.Column("action_number", sa.Integer(), nullable=False),
            sa.Column("period", sa.Integer(), nullable=False),
            sa.Column("home_lineup_json", sa.JSON(), nullable=False, server_default="[]"),
            sa.Column("away_lineup_json", sa.JSON(), nullable=False, server_default="[]"),
            sa.Column("source_hash", sa.String(length=64), nullable=False),
            sa.Column("status", sa.String(length=20), nullable=False, server_default="valid"),
            sa.UniqueConstraint("dataset_id", "game_id", "action_number", name="uq_wb_lineups_act"),
        )
        op.create_index(
            "ix_wb_lineups_dataset_game", "workbench_lineups", ["dataset_id", "game_id"]
        )

    # 4. workbench_shots
    if inspector is None or not inspector.has_table("workbench_shots"):
        op.create_table(
            "workbench_shots",
            sa.Column("id", sa.String(length=36), primary_key=True),
            sa.Column(
                "dataset_id",
                sa.String(length=36),
                sa.ForeignKey("workbench_datasets.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("game_id", sa.String(length=10), nullable=False),
            sa.Column("period", sa.Integer(), nullable=False),
            sa.Column("clock", sa.String(length=20), nullable=False),
            sa.Column("seconds_remaining", sa.Float(), nullable=True),
            sa.Column("team_id", sa.String(length=100), nullable=False),
            sa.Column("person_id", sa.String(length=100), nullable=False),
            sa.Column("player_name", sa.String(length=200), nullable=True),
            sa.Column("action_type", sa.String(length=100), nullable=True),
            sa.Column("sub_type", sa.String(length=100), nullable=True),
            sa.Column("shot_result", sa.String(length=20), nullable=False),
            sa.Column("is_made", sa.Boolean(), nullable=False),
            sa.Column("shot_value", sa.Integer(), nullable=False),
            sa.Column("points", sa.Integer(), nullable=False),
            sa.Column("shot_distance", sa.Float(), nullable=False),
            sa.Column("x_legacy", sa.Float(), nullable=True),
            sa.Column("y_legacy", sa.Float(), nullable=True),
            sa.Column("coord_x_feet", sa.Float(), nullable=True),
            sa.Column("coord_y_feet", sa.Float(), nullable=True),
            sa.Column("coordinates_present", sa.Boolean(), nullable=False, server_default="true"),
            sa.Column("zone_basic", sa.String(length=50), nullable=False),
            sa.Column("zone_range", sa.String(length=50), nullable=False),
            sa.Column("score_home", sa.Integer(), nullable=True),
            sa.Column("score_away", sa.Integer(), nullable=True),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("source_hash", sa.String(length=64), nullable=False),
            sa.Column("status", sa.String(length=20), nullable=False, server_default="valid"),
        )
        op.create_index("ix_wb_shots_dataset_game", "workbench_shots", ["dataset_id", "game_id"])
        op.create_index("ix_wb_shots_person", "workbench_shots", ["person_id"])
        op.create_index("ix_wb_shots_zone", "workbench_shots", ["zone_basic"])

    # 5. workbench_matchups
    if inspector is None or not inspector.has_table("workbench_matchups"):
        op.create_table(
            "workbench_matchups",
            sa.Column("id", sa.String(length=36), primary_key=True),
            sa.Column(
                "dataset_id",
                sa.String(length=36),
                sa.ForeignKey("workbench_datasets.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("game_id", sa.String(length=10), nullable=False),
            sa.Column("off_team_id", sa.String(length=100), nullable=False),
            sa.Column("def_team_id", sa.String(length=100), nullable=False),
            sa.Column("side", sa.String(length=10), nullable=False),
            sa.Column("off_person_id", sa.String(length=100), nullable=False),
            sa.Column("off_player_name", sa.String(length=200), nullable=True),
            sa.Column("def_person_id", sa.String(length=100), nullable=False),
            sa.Column("def_player_name", sa.String(length=200), nullable=True),
            sa.Column("matchup_minutes", sa.String(length=20), nullable=False),
            sa.Column("matchup_seconds", sa.Float(), nullable=False),
            sa.Column("partial_possessions", sa.Float(), nullable=False),
            sa.Column("pct_defender_total_time", sa.Float(), nullable=True),
            sa.Column("pct_offensive_total_time", sa.Float(), nullable=True),
            sa.Column("pct_total_time_both_on", sa.Float(), nullable=True),
            sa.Column("switches_on", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("player_points", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("team_points", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("matchup_assists", sa.Integer(), nullable=False, server_default="0"),
            sa.Column(
                "matchup_potential_assists", sa.Integer(), nullable=False, server_default="0"
            ),
            sa.Column("matchup_turnovers", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("matchup_blocks", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("matchup_fgm", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("matchup_fga", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("matchup_fg_pct", sa.Float(), nullable=True),
            sa.Column("matchup_fg3m", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("matchup_fg3a", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("matchup_fg3_pct", sa.Float(), nullable=True),
            sa.Column("help_blocks", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("help_fgm", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("help_fga", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("help_fg_pct", sa.Float(), nullable=True),
            sa.Column("matchup_ftm", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("matchup_fta", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("shooting_fouls", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("source_hash", sa.String(length=64), nullable=False),
            sa.Column("status", sa.String(length=20), nullable=False, server_default="valid"),
            sa.UniqueConstraint(
                "dataset_id",
                "game_id",
                "off_person_id",
                "def_person_id",
                name="uq_wb_matchup_pair",
            ),
        )
        op.create_index(
            "ix_wb_matchups_dataset_game", "workbench_matchups", ["dataset_id", "game_id"]
        )
        op.create_index("ix_wb_matchups_off_person", "workbench_matchups", ["off_person_id"])
        op.create_index("ix_wb_matchups_def_person", "workbench_matchups", ["def_person_id"])

    # 6. workbench_rich_admissions
    if inspector is None or not inspector.has_table("workbench_rich_admissions"):
        op.create_table(
            "workbench_rich_admissions",
            sa.Column("id", sa.String(length=36), primary_key=True),
            sa.Column(
                "dataset_id",
                sa.String(length=36),
                sa.ForeignKey("workbench_datasets.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("season", sa.String(length=10), nullable=False),
            sa.Column("source_family", sa.String(length=50), nullable=False),
            sa.Column("source_url", sa.Text(), nullable=True),
            sa.Column("source_bytes", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("source_sha256", sa.String(length=64), nullable=False),
            sa.Column("parser_signature", sa.String(length=64), nullable=False),
            sa.Column("policy_version", sa.String(length=50), nullable=False),
            sa.Column("status", sa.String(length=20), nullable=False, server_default="admitted"),
            sa.Column("total_games_expected", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("total_games_observed", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("total_games_admitted", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("total_games_rejected", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("rejected_games_json", sa.JSON(), nullable=False, server_default="[]"),
            sa.Column("coverage_report_json", sa.JSON(), nullable=False, server_default="{}"),
            sa.Column("reconciliation_report_json", sa.JSON(), nullable=False, server_default="{}"),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.func.now(),
            ),
            sa.UniqueConstraint(
                "dataset_id",
                "season",
                "source_family",
                name="uq_wb_rich_admission_family",
            ),
        )


def downgrade() -> None:
    op.drop_table("workbench_rich_admissions")
    op.drop_table("workbench_matchups")
    op.drop_table("workbench_shots")
    op.drop_table("workbench_lineups")
    op.drop_table("workbench_possessions")
    op.drop_table("workbench_pbp_events")
