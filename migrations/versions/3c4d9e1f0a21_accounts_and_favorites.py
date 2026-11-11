"""accounts_and_favorites

Finish plan F04: invite-only accounts and favourite players per account. Existing users rows
(fantasy-league seed users with public fixture passwords) get account_enabled = false, so they
cannot use the new sign-in; the operator enables accounts from the CLI.

Revision ID: 3c4d9e1f0a21
Revises: 2a7c41d0e518
Create Date: 2026-11-11 18:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "3c4d9e1f0a21"
down_revision: str | None = "2a7c41d0e518"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("users", sa.Column("display_name", sa.String(length=80), nullable=True))
    op.add_column(
        "users",
        sa.Column("account_enabled", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column(
        "users", sa.Column("is_demo", sa.Boolean(), nullable=False, server_default=sa.false())
    )
    op.add_column(
        "users",
        sa.Column("session_version", sa.Integer(), nullable=False, server_default="1"),
    )
    op.create_table(
        "user_favorite_players",
        sa.Column(
            "user_id",
            sa.String(length=36),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("player_id", sa.String(length=32), primary_key=True),
        sa.Column("added_at", sa.DateTime(timezone=True), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("user_favorite_players")
    op.drop_column("users", "session_version")
    op.drop_column("users", "is_demo")
    op.drop_column("users", "account_enabled")
    op.drop_column("users", "display_name")
