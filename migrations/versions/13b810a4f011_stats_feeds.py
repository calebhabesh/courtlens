"""Independent season-level stats feeds (PC07), isolated from sealed analytical releases."""

import sqlalchemy as sa
from alembic import op

revision = "13b810a4f011"
down_revision = "12b810a4f010"
branch_labels = None
depends_on = None

SCOPE = ("source_name", "feed", "season")


def upgrade() -> None:
    op.create_table(
        "stats_feed_datasets",
        sa.Column("id", sa.String(36), primary_key=True, nullable=False),
        sa.Column("acquisition_id", sa.String(36), nullable=False),
        sa.Column("source_name", sa.String(50), nullable=False),
        sa.Column("feed", sa.String(40), nullable=False),
        sa.Column("capability", sa.String(40), nullable=False),
        sa.Column("season", sa.String(10), nullable=False),
        sa.Column("season_type", sa.String(20), nullable=False),
        sa.Column("variant", sa.String(40), nullable=False),
        sa.Column("upstream_revision", sa.String(40), nullable=True),
        sa.Column("content_sha256", sa.String(64), nullable=False),
        sa.Column("membership_sha256", sa.String(64), nullable=False),
        sa.Column("parser_version", sa.String(40), nullable=False),
        sa.Column("observation_order", sa.Integer(), nullable=False),
        sa.Column("observed_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("admission_transaction", sa.String(32), nullable=False),
        sa.Column("coverage_json", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["acquisition_id"], ["workbench_acquisitions.id"]),
        sa.UniqueConstraint("acquisition_id"),
        sa.UniqueConstraint("id", *SCOPE),
        sa.UniqueConstraint("observation_order"),
    )
    op.create_index(
        "ix_stats_feed_scope",
        "stats_feed_datasets",
        [*SCOPE, "season_type", "variant", "observed_at"],
    )
    op.create_table(
        "stats_feed_versions",
        sa.Column("id", sa.String(36), primary_key=True, nullable=False),
        sa.Column("source_name", sa.String(50), nullable=False),
        sa.Column("feed", sa.String(40), nullable=False),
        sa.Column("season", sa.String(10), nullable=False),
        sa.Column("entity_key", sa.String(200), nullable=False),
        sa.Column("content_sha256", sa.String(64), nullable=False),
        sa.Column("payload_json", sa.JSON(), nullable=False),
        sa.UniqueConstraint("id", "entity_key", *SCOPE),
        sa.UniqueConstraint(*SCOPE, "entity_key", "content_sha256"),
    )
    op.create_table(
        "stats_feed_members",
        sa.Column("dataset_id", sa.String(36), primary_key=True, nullable=False),
        sa.Column("entity_key", sa.String(200), primary_key=True, nullable=False),
        sa.Column("source_name", sa.String(50), nullable=False),
        sa.Column("feed", sa.String(40), nullable=False),
        sa.Column("season", sa.String(10), nullable=False),
        sa.Column("version_id", sa.String(36), nullable=False),
        sa.Column("row_locator", sa.String(100), nullable=False),
        sa.ForeignKeyConstraint(
            ["version_id", "entity_key", *SCOPE],
            [f"stats_feed_versions.{c}" for c in ("id", "entity_key", *SCOPE)],
        ),
        sa.ForeignKeyConstraint(
            ["dataset_id", *SCOPE],
            [f"stats_feed_datasets.{c}" for c in ("id", *SCOPE)],
        ),
    )
    if op.get_bind().dialect.name != "postgresql":
        return
    op.execute(
        """CREATE OR REPLACE FUNCTION seal_stats_feed()
    RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
    RAISE EXCEPTION 'stats feeds are append-only'; END; $$"""
    )
    for table in ("stats_feed_datasets", "stats_feed_versions", "stats_feed_members"):
        op.execute(
            f"CREATE TRIGGER seal_{table} BEFORE UPDATE OR DELETE OR TRUNCATE ON {table} "
            "FOR EACH STATEMENT EXECUTE FUNCTION seal_stats_feed()"
        )
    op.execute(
        """CREATE OR REPLACE FUNCTION seal_stats_feed_member()
    RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM stats_feed_datasets WHERE id=NEW.dataset_id
    AND admission_transaction=txid_current()::text) THEN
    RAISE EXCEPTION 'stats feed membership is sealed'; END IF;
    RETURN NEW; END; $$"""
    )
    op.execute(
        "CREATE TRIGGER seal_stats_feed_insert BEFORE INSERT ON stats_feed_members "
        "FOR EACH ROW EXECUTE FUNCTION seal_stats_feed_member()"
    )
    op.execute(
        """CREATE OR REPLACE FUNCTION seal_stats_feed_source()
    RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
    IF TG_TABLE_NAME='workbench_acquisitions' AND EXISTS (
      SELECT 1 FROM stats_feed_datasets WHERE acquisition_id=OLD.id) THEN
      RAISE EXCEPTION 'stats feed provenance is append-only';
    END IF;
    IF TG_TABLE_NAME='workbench_artifacts' AND EXISTS (
      SELECT 1 FROM stats_feed_datasets d JOIN workbench_acquisitions a
      ON a.id=d.acquisition_id WHERE a.artifact_id=OLD.id) THEN
      RAISE EXCEPTION 'stats feed provenance is append-only';
    END IF;
    RETURN COALESCE(NEW, OLD); END; $$"""
    )
    for table in ("workbench_acquisitions", "workbench_artifacts"):
        op.execute(
            f"CREATE TRIGGER seal_stats_feed_source BEFORE UPDATE OR DELETE ON {table} "
            "FOR EACH ROW EXECUTE FUNCTION seal_stats_feed_source()"
        )


def downgrade() -> None:
    postgres = op.get_bind().dialect.name == "postgresql"
    if postgres:
        for table in ("workbench_acquisitions", "workbench_artifacts"):
            op.execute(f"DROP TRIGGER seal_stats_feed_source ON {table}")
        op.execute("DROP FUNCTION seal_stats_feed_source()")
    op.drop_table("stats_feed_members")
    op.drop_table("stats_feed_versions")
    op.drop_table("stats_feed_datasets")
    if postgres:
        op.execute("DROP FUNCTION seal_stats_feed_member()")
        op.execute("DROP FUNCTION seal_stats_feed()")
