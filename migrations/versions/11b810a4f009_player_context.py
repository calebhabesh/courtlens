"""Dated player context inputs, isolated from sealed analytical releases."""

import sqlalchemy as sa
from alembic import op

revision = "11b810a4f009"
down_revision = "10b810a4f008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "player_context_datasets",
        sa.Column("id", sa.String(36), primary_key=True, nullable=False),
        sa.Column("acquisition_id", sa.String(36), nullable=False),
        sa.Column("source_name", sa.String(50), nullable=False),
        sa.Column("kind", sa.String(30), nullable=False),
        sa.Column("season", sa.String(10), nullable=False),
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
        sa.UniqueConstraint("id", "source_name", "kind", "season"),
        sa.UniqueConstraint("observation_order"),
    )
    op.create_index(
        "ix_player_context_scope", "player_context_datasets", ["season", "kind", "observed_at"]
    )
    op.create_table(
        "player_context_versions",
        sa.Column("id", sa.String(36), primary_key=True, nullable=False),
        sa.Column("source_name", sa.String(50), nullable=False),
        sa.Column("kind", sa.String(30), nullable=False),
        sa.Column("season", sa.String(10), nullable=False),
        sa.Column("entity_key", sa.String(200), nullable=False),
        sa.Column("content_sha256", sa.String(64), nullable=False),
        sa.Column("payload_json", sa.JSON(), nullable=False),
        sa.UniqueConstraint("id", "entity_key", "source_name", "kind", "season"),
        sa.UniqueConstraint("source_name", "kind", "season", "entity_key", "content_sha256"),
    )
    op.create_table(
        "player_context_members",
        sa.Column("dataset_id", sa.String(36), primary_key=True, nullable=False),
        sa.Column("entity_key", sa.String(200), primary_key=True, nullable=False),
        sa.Column("source_name", sa.String(50), nullable=False),
        sa.Column("kind", sa.String(30), nullable=False),
        sa.Column("season", sa.String(10), nullable=False),
        sa.Column("version_id", sa.String(36), nullable=False),
        sa.Column("row_locator", sa.String(100), nullable=False),
        sa.ForeignKeyConstraint(
            ["version_id", "entity_key", "source_name", "kind", "season"],
            [
                "player_context_versions.id",
                "player_context_versions.entity_key",
                "player_context_versions.source_name",
                "player_context_versions.kind",
                "player_context_versions.season",
            ],
        ),
        sa.ForeignKeyConstraint(
            ["dataset_id", "source_name", "kind", "season"],
            [
                "player_context_datasets.id",
                "player_context_datasets.source_name",
                "player_context_datasets.kind",
                "player_context_datasets.season",
            ],
        ),
    )
    if op.get_bind().dialect.name == "postgresql":
        op.execute(
            """CREATE OR REPLACE FUNCTION seal_player_context()
    RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
    RAISE EXCEPTION 'player context is append-only'; END; $$"""
        )
        op.execute(
            "CREATE TRIGGER seal_player_context_datasets BEFORE UPDATE OR DELETE OR TRUNCATE ON player_context_datasets FOR EACH STATEMENT EXECUTE FUNCTION seal_player_context()"
        )
        op.execute(
            "CREATE TRIGGER seal_player_context_versions BEFORE UPDATE OR DELETE OR TRUNCATE ON player_context_versions FOR EACH STATEMENT EXECUTE FUNCTION seal_player_context()"
        )
        op.execute(
            "CREATE TRIGGER seal_player_context_members BEFORE UPDATE OR DELETE OR TRUNCATE ON player_context_members FOR EACH STATEMENT EXECUTE FUNCTION seal_player_context()"
        )
        op.execute(
            """CREATE OR REPLACE FUNCTION seal_player_context_member()
    RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM player_context_datasets WHERE id=NEW.dataset_id
    AND admission_transaction=txid_current()::text) THEN
    RAISE EXCEPTION 'player context membership is sealed'; END IF;
    RETURN NEW; END; $$"""
        )
        op.execute(
            "CREATE TRIGGER seal_player_context_insert BEFORE INSERT ON player_context_members FOR EACH ROW EXECUTE FUNCTION seal_player_context_member()"
        )
        op.execute(
            """CREATE OR REPLACE FUNCTION seal_player_context_source()
    RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
    IF TG_TABLE_NAME='workbench_acquisitions' AND EXISTS (
      SELECT 1 FROM player_context_datasets WHERE acquisition_id=OLD.id) THEN
      RAISE EXCEPTION 'player context provenance is append-only';
    END IF;
    IF TG_TABLE_NAME='workbench_artifacts' AND EXISTS (
      SELECT 1 FROM player_context_datasets d JOIN workbench_acquisitions a
      ON a.id=d.acquisition_id WHERE a.artifact_id=OLD.id) THEN
      RAISE EXCEPTION 'player context provenance is append-only';
    END IF;
    RETURN COALESCE(NEW, OLD); END; $$"""
        )
        op.execute(
            "CREATE TRIGGER seal_player_context_source BEFORE UPDATE OR DELETE ON workbench_acquisitions FOR EACH ROW EXECUTE FUNCTION seal_player_context_source()"
        )
        op.execute(
            "CREATE TRIGGER seal_player_context_source BEFORE UPDATE OR DELETE ON workbench_artifacts FOR EACH ROW EXECUTE FUNCTION seal_player_context_source()"
        )


def downgrade() -> None:
    if op.get_bind().dialect.name == "postgresql":
        for table in ("workbench_acquisitions", "workbench_artifacts"):
            op.execute(f"DROP TRIGGER seal_player_context_source ON {table}")
        op.execute("DROP FUNCTION seal_player_context_source()")
    op.drop_table("player_context_members")
    op.drop_table("player_context_versions")
    op.drop_table("player_context_datasets")
    if op.get_bind().dialect.name == "postgresql":
        op.execute("DROP FUNCTION seal_player_context_member()")
        op.execute("DROP FUNCTION seal_player_context()")
