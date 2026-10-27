"""Live reads ESPN on demand (alignment row 7): a mutable current cache replaces leases.

`live_leases` and `live_feeds` held demand and worker state only, never evidence. The append-only
`live_contents`, `live_observations` and `live_reconciliations` tables are kept unchanged.
"""

import sqlalchemy as sa
from alembic import op

revision = "19b810a4f017"
down_revision = "18b810a4f016"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "live_current",
        sa.Column("resource", sa.String(80), primary_key=True),
        sa.Column("normalized_json", sa.JSON()),
        sa.Column("final", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("acquired_at", sa.DateTime(timezone=True)),
        sa.Column("source_time", sa.String(80)),
        sa.Column("http_date", sa.String(80)),
        sa.Column("observation_id", sa.String(36)),
        sa.Column("content_sha256", sa.String(64)),
        sa.Column("attempted_at", sa.DateTime(timezone=True)),
        sa.Column("failures", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("error", sa.String(100)),
    )
    op.drop_index("ix_live_leases_slate_date", table_name="live_leases")
    op.drop_index("ix_live_leases_expires_at", table_name="live_leases")
    op.drop_table("live_leases")
    op.drop_table("live_feeds")


def downgrade() -> None:
    op.create_table(
        "live_feeds",
        sa.Column("namespace", sa.String(30), primary_key=True),
        sa.Column("next_poll_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_poll_at", sa.DateTime(timezone=True)),
        sa.Column("last_success_at", sa.DateTime(timezone=True)),
        sa.Column("status", sa.String(40), nullable=False),
        sa.Column("failures", sa.Integer(), nullable=False),
        sa.Column("requests", sa.Integer(), nullable=False),
        sa.Column("bytes_received", sa.Integer(), nullable=False),
        sa.Column("cycles", sa.Integer(), nullable=False),
        sa.Column("error", sa.String(100)),
    )
    op.create_table(
        "live_leases",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("slate_date", sa.String(10), nullable=False),
        sa.Column("game_id", sa.String(30)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_live_leases_slate_date", "live_leases", ["slate_date"])
    op.create_index("ix_live_leases_expires_at", "live_leases", ["expires_at"])
    op.drop_table("live_current")
