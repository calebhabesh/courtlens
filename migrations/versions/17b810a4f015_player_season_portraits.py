"""Team-season player headshots from the NBA CDN (2015-16 on), with recorded misses.

Images share the content-addressed portrait cache; see services/season_portraits.py.
"""

import sqlalchemy as sa
from alembic import op

revision = "17b810a4f015"
down_revision = "16b810a4f014"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "player_season_portraits",
        sa.Column("id", sa.String(36), primary_key=True, nullable=False),
        sa.Column("player_id", sa.String(100), nullable=False),
        sa.Column("team_id", sa.String(20), nullable=False),
        sa.Column("team_tricode", sa.String(5), nullable=False),
        sa.Column("season", sa.String(10), nullable=False),
        sa.Column("source_name", sa.String(50), nullable=False),
        sa.Column("source_url", sa.Text(), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("content_sha256", sa.String(64), nullable=True),
        sa.Column("storage_path", sa.Text(), nullable=True),
        sa.Column("mime_type", sa.String(50), nullable=True),
        sa.Column("width", sa.Integer(), nullable=True),
        sa.Column("height", sa.Integer(), nullable=True),
        sa.Column("bytes", sa.Integer(), nullable=True),
        sa.Column("attribution", sa.Text(), nullable=False),
        sa.Column("acquired_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("player_id", "team_id", "season", "source_name"),
    )
    op.create_index(
        "ix_player_season_portraits_lookup",
        "player_season_portraits",
        ["player_id", "season", "status"],
    )


def downgrade() -> None:
    op.drop_index("ix_player_season_portraits_lookup", table_name="player_season_portraits")
    op.drop_table("player_season_portraits")
