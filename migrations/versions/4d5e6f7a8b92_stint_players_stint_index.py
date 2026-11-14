"""stint_players_stint_index

Index workbench_stint_players.stint_id. Deleting a lineup stint cascades to its player rows by
stint_id, and no index led with that column, so each cascaded delete scanned the table (7.5
million rows). Retiring one provisional season dataset, which the daily lineups job does, took
about an hour; with the index it takes seconds (Win Probability v4, W7c, measured on the VPS
2026-11-13). Built concurrently so serving keeps reading the table.

Revision ID: 4d5e6f7a8b92
Revises: 3c4d9e1f0a21
Create Date: 2026-11-13 23:00:00.000000
"""

from collections.abc import Sequence

from alembic import op

revision: str = "4d5e6f7a8b92"
down_revision: str | None = "3c4d9e1f0a21"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.get_context().autocommit_block():
        op.create_index(
            "ix_wb_stint_players_stint",
            "workbench_stint_players",
            ["stint_id"],
            postgresql_concurrently=True,
            if_not_exists=True,
        )


def downgrade() -> None:
    with op.get_context().autocommit_block():
        op.drop_index(
            "ix_wb_stint_players_stint",
            table_name="workbench_stint_players",
            postgresql_concurrently=True,
            if_exists=True,
        )
