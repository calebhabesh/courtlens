"""assistant_thread_visitor

Public Ask on the hosted demo: each thread records the browser that started it, so a visitor
lists and reads only their own conversations. Threads without a visitor (local use) are never
listed in public mode.

Revision ID: 2a7c41d0e518
Revises: 19b810a4f017
Create Date: 2026-11-10 23:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "2a7c41d0e518"
down_revision: str | None = "19b810a4f017"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("assistant_threads", sa.Column("visitor", sa.String(length=64), nullable=True))
    op.create_index("ix_assistant_threads_visitor", "assistant_threads", ["visitor", "id"])


def downgrade() -> None:
    op.drop_index("ix_assistant_threads_visitor", table_name="assistant_threads")
    op.drop_column("assistant_threads", "visitor")
