"""accounts_sign_up_google

Accounts plan A01: password sign-up with email confirmation, Google sign-in, single-use email
links. Passwords become optional (Google-only accounts). Accounts the operator already enabled
count as confirmed; disabled rows (the fantasy-league seed users) stay unconfirmed and disabled.

Revision ID: 5e6f7a8b9c03
Revises: 4d5e6f7a8b92
Create Date: 2026-11-16 12:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "5e6f7a8b9c03"
down_revision: str | None = "4d5e6f7a8b92"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("users") as batch:
        batch.alter_column("password_hash", existing_type=sa.String(length=255), nullable=True)
        batch.add_column(sa.Column("email_verified_at", sa.DateTime(timezone=True), nullable=True))
    op.execute(
        "UPDATE users SET email_verified_at = CURRENT_TIMESTAMP "
        "WHERE account_enabled AND NOT is_demo"
    )
    op.create_table(
        "user_identities",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column(
            "user_id",
            sa.String(length=36),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("provider", sa.String(length=32), nullable=False),
        sa.Column("subject", sa.String(length=255), nullable=False),
        sa.Column("email", sa.String(length=320), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("provider", "subject", name="uq_user_identities_subject"),
    )
    op.create_index("ix_user_identities_user_id", "user_identities", ["user_id"])
    op.create_table(
        "account_tokens",
        sa.Column("token_hash", sa.String(length=64), primary_key=True),
        sa.Column(
            "user_id",
            sa.String(length=36),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("purpose", sa.String(length=16), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_account_tokens_user_id", "account_tokens", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_account_tokens_user_id", table_name="account_tokens")
    op.drop_table("account_tokens")
    op.drop_index("ix_user_identities_user_id", table_name="user_identities")
    op.drop_table("user_identities")
    # Google-only accounts get an unusable password so the column can be required again.
    op.execute("UPDATE users SET password_hash = '!' WHERE password_hash IS NULL")
    with op.batch_alter_table("users") as batch:
        batch.drop_column("email_verified_at")
        batch.alter_column("password_hash", existing_type=sa.String(length=255), nullable=False)
