"""Index workbench player games by dataset, season, phase and date.

Stats filters one season-phase of a 26-season dataset (about 26k of 880k rows); without this index
each Stats query and its DARKO/tracking coverage checks scanned the whole table (owner report,
2026-10-13: phase and season changes were slow after the 2000-01 backfill).
"""

from alembic import op

revision = "14b810a4f012"
down_revision = "13b810a4f011"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index(
        "ix_wb_player_dataset_season_phase_date",
        "workbench_player_games",
        ["dataset_id", "season", "phase", "game_date"],
    )


def downgrade() -> None:
    op.drop_index("ix_wb_player_dataset_season_phase_date", table_name="workbench_player_games")
