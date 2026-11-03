"""Basketball-Reference player and team season rows from sealed history files (full history FH02).

Append-only, keyed by the sealed file's SHA-256; a workbench dataset pins the file it serves.
"""

import sqlalchemy as sa
from alembic import op

revision = "18b810a4f016"
down_revision = "17b810a4f015"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "bbref_player_seasons",
        sa.Column("id", sa.String(36), primary_key=True, nullable=False),
        sa.Column("source_sha256", sa.String(64), nullable=False),
        sa.Column("parser_version", sa.String(40), nullable=False),
        sa.Column("season", sa.String(10), nullable=False),
        sa.Column("phase", sa.String(30), nullable=False),
        sa.Column("player_id", sa.String(100), nullable=False),
        sa.Column("bbref_id", sa.String(20), nullable=False),
        sa.Column("player_name", sa.String(200), nullable=False),
        sa.Column("team_id", sa.String(20), nullable=False),
        sa.Column("is_summary", sa.Boolean(), nullable=False),
        sa.Column("age", sa.Integer(), nullable=True),
        sa.Column("position", sa.String(20), nullable=True),
        sa.Column("games", sa.Integer(), nullable=True),
        sa.Column("games_started", sa.Integer(), nullable=True),
        sa.Column("minutes", sa.Integer(), nullable=True),
        sa.Column("points", sa.Integer(), nullable=True),
        sa.Column("stats_json", sa.JSON(), nullable=False),
        sa.Column("advanced_json", sa.JSON(), nullable=False),
        sa.UniqueConstraint("source_sha256", "season", "phase", "player_id", "team_id"),
    )
    op.create_index(
        "ix_bbref_player_seasons_scope",
        "bbref_player_seasons",
        ["source_sha256", "season", "phase"],
    )
    op.create_index(
        "ix_bbref_player_seasons_player", "bbref_player_seasons", ["source_sha256", "player_id"]
    )
    op.create_table(
        "bbref_team_seasons",
        sa.Column("id", sa.String(36), primary_key=True, nullable=False),
        sa.Column("source_sha256", sa.String(64), nullable=False),
        sa.Column("season", sa.String(10), nullable=False),
        sa.Column("phase", sa.String(30), nullable=False),
        sa.Column("team_id", sa.String(20), nullable=False),
        sa.Column("team_name", sa.String(100), nullable=False),
        sa.Column("stats_json", sa.JSON(), nullable=False),
        sa.Column("opponent_stats_json", sa.JSON(), nullable=False),
        sa.UniqueConstraint("source_sha256", "season", "phase", "team_id"),
    )


def downgrade() -> None:
    op.drop_table("bbref_team_seasons")
    op.drop_index("ix_bbref_player_seasons_player", table_name="bbref_player_seasons")
    op.drop_index("ix_bbref_player_seasons_scope", table_name="bbref_player_seasons")
    op.drop_table("bbref_player_seasons")
