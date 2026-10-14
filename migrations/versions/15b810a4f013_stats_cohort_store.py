"""Persisted Stats cohorts: whole-league season rows and table ranks, computed once.

Each player page's career table ranked every season's whole league on every visit (about
0.8 s a season, 4-5 s for a long career; owner report, 2026-10-14). Entries are derived,
content-addressed serving rows; see services/stats_cohort_store.py.

Also indexes player identities by kind and external ID: every Stats query joins each game row
to its player's name on those columns, and a one-player career aggregate re-scanned the whole
identity table per game (114 ms, now 7 ms).
"""

import sqlalchemy as sa
from alembic import op

revision = "15b810a4f013"
down_revision = "14b810a4f012"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # IF NOT EXISTS: the index was first created by hand on the development database.
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_workbench_identities_kind_external "
        "ON workbench_identities (kind, external_id)"
    )
    op.create_table(
        "stats_cohort_entries",
        sa.Column("key", sa.String(64), primary_key=True, nullable=False),
        sa.Column("scope_key", sa.String(64), nullable=False),
        sa.Column("release_id", sa.String(64), nullable=False),
        sa.Column("season", sa.String(10), nullable=False),
        sa.Column("phase", sa.String(20), nullable=False),
        sa.Column("row_count", sa.Integer(), nullable=False),
        sa.Column("eligible", sa.Integer(), nullable=False),
        sa.Column("table_sample_sizes", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_stats_cohort_entries_scope", "stats_cohort_entries", ["scope_key"])
    op.create_table(
        "stats_cohort_rows",
        sa.Column(
            "entry_key",
            sa.String(64),
            sa.ForeignKey("stats_cohort_entries.key", ondelete="CASCADE"),
            primary_key=True,
            nullable=False,
        ),
        sa.Column("player_id", sa.String(100), primary_key=True, nullable=False),
        sa.Column("ordinal", sa.Integer(), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.Column("ranks", sa.JSON(), nullable=True),
    )


def downgrade() -> None:
    op.drop_table("stats_cohort_rows")
    op.drop_index("ix_stats_cohort_entries_scope", table_name="stats_cohort_entries")
    op.drop_table("stats_cohort_entries")
    op.drop_index("ix_workbench_identities_kind_external", table_name="workbench_identities")
