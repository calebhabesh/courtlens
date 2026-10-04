"""B35a explicit retained conversational analytical manifests."""

import sqlalchemy as sa
from alembic import op

revision = "35b810a4f003"
down_revision = "31b810a4f002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "saved_conversation_analyses",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("request_id", sa.String(36), nullable=False, unique=True),
        sa.Column("request_sha256", sa.String(64), nullable=False),
        sa.Column("workbench_dataset_id", sa.String(36), sa.ForeignKey("workbench_datasets.id")),
        sa.Column("archive_dataset_id", sa.String(36), sa.ForeignKey("archive_datasets.id")),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("manifest_sha256", sa.String(64), nullable=False),
        sa.Column("manifest_json", sa.JSON(), nullable=False),
        sa.Column("metadata_json", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "(workbench_dataset_id IS NOT NULL AND archive_dataset_id IS NULL) OR "
            "(workbench_dataset_id IS NULL AND archive_dataset_id IS NOT NULL)",
            name="saved_conversation_one_dataset",
        ),
    )
    op.create_index(
        "ix_saved_conversation_analyses_manifest_sha256",
        "saved_conversation_analyses",
        ["manifest_sha256"],
    )
    op.create_table(
        "saved_conversation_inputs",
        sa.Column(
            "analysis_id",
            sa.String(36),
            sa.ForeignKey("saved_conversation_analyses.id"),
            primary_key=True,
        ),
        sa.Column("step_id", sa.String(32), primary_key=True),
        sa.Column("finance_release_id", sa.String(36), sa.ForeignKey("finance_releases.id")),
        sa.Column("issuance_id", sa.String(36), sa.ForeignKey("forecast_issuances.id")),
    )
    if op.get_bind().dialect.name == "postgresql":
        op.execute("""CREATE FUNCTION courtload_saved_conversation_append_only()
            RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
            RAISE EXCEPTION 'saved conversational evidence is append-only'; END $$""")
        op.execute("""CREATE TRIGGER saved_conversation_analyses_immutable
            BEFORE UPDATE OR DELETE OR TRUNCATE ON saved_conversation_analyses
            FOR EACH STATEMENT EXECUTE FUNCTION courtload_saved_conversation_append_only()""")
        op.execute("""CREATE TRIGGER saved_conversation_inputs_immutable
            BEFORE UPDATE OR DELETE OR TRUNCATE ON saved_conversation_inputs
            FOR EACH STATEMENT EXECUTE FUNCTION courtload_saved_conversation_append_only()""")


def downgrade() -> None:
    op.drop_table("saved_conversation_inputs")
    op.drop_table("saved_conversation_analyses")
    if op.get_bind().dialect.name == "postgresql":
        op.execute("DROP FUNCTION courtload_saved_conversation_append_only()")
