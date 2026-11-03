"""Basketball-Reference player profiles: biography, honours and season awards.

Append-only rows parsed from retained player pages, each tied to its acquisition receipt and
content hash; see services/bbref_bio.py and ingestion/bbref_players.py.
"""

import sqlalchemy as sa
from alembic import op

revision = "16b810a4f014"
down_revision = "15b810a4f013"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "bbref_player_profiles",
        sa.Column("id", sa.String(36), primary_key=True, nullable=False),
        sa.Column("player_id", sa.String(100), nullable=False),
        sa.Column("bbref_id", sa.String(20), nullable=False),
        sa.Column("match_basis", sa.String(40), nullable=False),
        sa.Column(
            "acquisition_id",
            sa.String(36),
            sa.ForeignKey("workbench_acquisitions.id"),
            nullable=False,
        ),
        sa.Column("content_sha256", sa.String(64), nullable=False),
        sa.Column("parser_version", sa.String(40), nullable=False),
        sa.Column("profile", sa.JSON(), nullable=False),
        sa.Column("observed_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("content_sha256", "parser_version", "player_id"),
    )
    op.create_index(
        "ix_bbref_player_profiles_player", "bbref_player_profiles", ["player_id", "observed_at"]
    )


def downgrade() -> None:
    op.drop_index("ix_bbref_player_profiles_player", table_name="bbref_player_profiles")
    op.drop_table("bbref_player_profiles")
