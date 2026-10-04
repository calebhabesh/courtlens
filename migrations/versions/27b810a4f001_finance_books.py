"""B28 immutable financial source books and correction lineage."""

import sqlalchemy as sa
from alembic import op

revision = "27b810a4f001"
down_revision = "0af4286cb194"
branch_labels = None
depends_on = None

TABLES = ("finance_releases", "finance_sources", "finance_observations", "finance_members")


def upgrade() -> None:
    op.create_table(
        "finance_releases",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("content_sha256", sa.String(64), nullable=False, unique=True),
        sa.Column("parent_release_id", sa.String(36), sa.ForeignKey("finance_releases.id")),
        sa.Column("manifest_json", sa.JSON(), nullable=False),
        sa.Column("csv_bytes", sa.LargeBinary(), nullable=False),
        sa.Column("admission_transaction", sa.String(30), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "finance_sources",
        sa.Column(
            "release_id", sa.String(36), sa.ForeignKey("finance_releases.id"), primary_key=True
        ),
        sa.Column("sha256", sa.String(64), primary_key=True),
        sa.Column("evidence_bytes", sa.LargeBinary(), nullable=False),
        sa.Column("metadata_json", sa.JSON(), nullable=False),
    )
    op.create_table(
        "finance_observations",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "release_id", sa.String(36), sa.ForeignKey("finance_releases.id"), nullable=False
        ),
        sa.Column("content_sha256", sa.String(64), nullable=False),
        sa.Column(
            "player_identity_id",
            sa.String(36),
            sa.ForeignKey("workbench_identities.id"),
            nullable=False,
        ),
        sa.Column("kind", sa.String(20), nullable=False),
        sa.Column("amount_cents", sa.BigInteger()),
        sa.Column("supersedes_id", sa.String(36), sa.ForeignKey("finance_observations.id")),
        sa.Column("correction_reason", sa.Text()),
        sa.Column("payload_json", sa.JSON(), nullable=False),
    )
    op.create_index("ix_finance_observations_release_id", "finance_observations", ["release_id"])
    op.create_table(
        "finance_members",
        sa.Column(
            "release_id", sa.String(36), sa.ForeignKey("finance_releases.id"), primary_key=True
        ),
        sa.Column(
            "observation_id",
            sa.String(36),
            sa.ForeignKey("finance_observations.id"),
            primary_key=True,
        ),
        sa.Column("grain_sha256", sa.String(64), nullable=False),
        sa.UniqueConstraint("release_id", "grain_sha256", name="uq_finance_grain"),
    )
    if op.get_bind().dialect.name == "postgresql":
        op.execute("""CREATE FUNCTION prevent_finance_mutation() RETURNS trigger
        LANGUAGE plpgsql AS $$ BEGIN
        RAISE EXCEPTION 'finance books are append-only'; END; $$""")
        for table in TABLES:
            op.execute(
                f"CREATE TRIGGER seal_{table} BEFORE UPDATE OR DELETE OR TRUNCATE ON {table} FOR EACH STATEMENT EXECUTE FUNCTION prevent_finance_mutation()"
            )
        op.execute("""CREATE FUNCTION prevent_finance_extension() RETURNS trigger
        LANGUAGE plpgsql AS $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM finance_releases WHERE id=NEW.release_id
        AND admission_transaction=txid_current()::text) THEN
        RAISE EXCEPTION 'finance release already sealed'; END IF;
        RETURN NEW; END; $$""")
        for table in TABLES[1:]:
            op.execute(
                f"CREATE TRIGGER seal_insert_{table} BEFORE INSERT ON {table} FOR EACH ROW EXECUTE FUNCTION prevent_finance_extension()"
            )


def downgrade() -> None:
    for table in reversed(TABLES):
        op.drop_table(table)
    if op.get_bind().dialect.name == "postgresql":
        op.execute("DROP FUNCTION prevent_finance_mutation()")
        op.execute("DROP FUNCTION prevent_finance_extension()")
