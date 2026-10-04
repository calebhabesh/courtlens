"""B31 bounded Live demand, provisional observations and reconciliation evidence."""

import sqlalchemy as sa
from alembic import op

revision = "31b810a4f002"
down_revision = "27b810a4f001"
branch_labels = None
depends_on = None


def upgrade() -> None:
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
    op.create_table(
        "live_contents",
        sa.Column("sha256", sa.String(64), primary_key=True),
        sa.Column("raw_bytes", sa.LargeBinary(), nullable=False),
        sa.Column("normalized_json", sa.JSON(), nullable=False),
        sa.Column("parser_version", sa.String(30), nullable=False),
    )
    op.create_table(
        "live_observations",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("namespace", sa.String(30), nullable=False),
        sa.Column("resource", sa.String(80), nullable=False),
        sa.Column(
            "content_sha256", sa.String(64), sa.ForeignKey("live_contents.sha256"), nullable=False
        ),
        sa.Column("acquired_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("source_time", sa.String(80)),
        sa.Column("http_date", sa.String(80)),
    )
    op.create_index("ix_live_observations_resource", "live_observations", ["resource"])
    op.create_index("ix_live_observations_acquired_at", "live_observations", ["acquired_at"])
    op.create_table(
        "live_reconciliations",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "observation_id", sa.String(36), sa.ForeignKey("live_observations.id"), nullable=False
        ),
        sa.Column(
            "dataset_id", sa.String(36), sa.ForeignKey("workbench_datasets.id"), nullable=False
        ),
        sa.Column("result_json", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    if op.get_bind().dialect.name == "postgresql":
        op.execute(
            """CREATE FUNCTION courtload_live_append_only() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Live evidence is append-only'; END $$"""
        )
        for table in ("live_contents", "live_observations", "live_reconciliations"):
            op.execute(
                f"CREATE TRIGGER {table}_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON {table} FOR EACH STATEMENT EXECUTE FUNCTION courtload_live_append_only()"
            )


def downgrade() -> None:
    for table in (
        "live_reconciliations",
        "live_observations",
        "live_contents",
        "live_leases",
        "live_feeds",
    ):
        op.drop_table(table)
    if op.get_bind().dialect.name == "postgresql":
        op.execute("DROP FUNCTION courtload_live_append_only()")
