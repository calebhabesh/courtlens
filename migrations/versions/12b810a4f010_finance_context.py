"""Independent finance refreshes and manual threshold observations."""

import sqlalchemy as sa
from alembic import op

revision = "12b810a4f010"
down_revision = "11b810a4f009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "finance_thresholds",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("season", sa.String(10), nullable=False),
        sa.Column("content_sha256", sa.String(64), unique=True, nullable=False),
        sa.Column("observed_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("source_bytes", sa.LargeBinary(), nullable=False),
        sa.Column("payload_json", sa.JSON(), nullable=False),
    )
    op.create_index("ix_finance_thresholds_season", "finance_thresholds", ["season"])
    op.create_table(
        "finance_refreshes",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("input_sha256", sa.String(64), unique=True, nullable=False),
        sa.Column("content_sha256", sa.String(64), nullable=False),
        sa.Column("season", sa.String(10), nullable=False),
        sa.Column(
            "roster_dataset_id",
            sa.String(36),
            sa.ForeignKey("player_context_datasets.id"),
            nullable=False,
        ),
        sa.Column("threshold_id", sa.String(36), sa.ForeignKey("finance_thresholds.id")),
        sa.Column("book_id", sa.String(36), sa.ForeignKey("finance_releases.id")),
        sa.Column("observed_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("parser_version", sa.String(40), nullable=False),
        sa.Column("admission_transaction", sa.String(32), nullable=False),
        sa.Column("payload_json", sa.JSON(), nullable=False),
    )
    op.create_index("ix_finance_refreshes_season", "finance_refreshes", ["season"])
    op.create_table(
        "finance_refresh_sources",
        sa.Column(
            "refresh_id", sa.String(36), sa.ForeignKey("finance_refreshes.id"), primary_key=True
        ),
        sa.Column(
            "acquisition_id",
            sa.String(36),
            sa.ForeignKey("workbench_acquisitions.id"),
            primary_key=True,
        ),
    )
    if op.get_bind().dialect.name == "postgresql":
        op.execute(
            "CREATE FUNCTION seal_finance_context() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN\n    RAISE EXCEPTION 'finance context is append-only'; END; $$"
        )
        op.execute(
            "CREATE TRIGGER seal_finance_thresholds BEFORE UPDATE OR DELETE OR TRUNCATE ON finance_thresholds FOR EACH STATEMENT EXECUTE FUNCTION seal_finance_context()"
        )
        op.execute(
            "CREATE TRIGGER seal_finance_refreshes BEFORE UPDATE OR DELETE OR TRUNCATE ON finance_refreshes FOR EACH STATEMENT EXECUTE FUNCTION seal_finance_context()"
        )
        op.execute(
            "CREATE TRIGGER seal_finance_refresh_sources BEFORE UPDATE OR DELETE OR TRUNCATE ON finance_refresh_sources FOR EACH STATEMENT EXECUTE FUNCTION seal_finance_context()"
        )
        op.execute(
            "CREATE FUNCTION seal_finance_refresh_member() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN\n    IF NOT EXISTS (SELECT 1 FROM finance_refreshes WHERE id=NEW.refresh_id\n      AND admission_transaction=txid_current()::text) THEN\n      RAISE EXCEPTION 'finance refresh membership is sealed'; END IF;\n    RETURN NEW; END; $$"
        )
        op.execute(
            "CREATE TRIGGER seal_finance_refresh_insert BEFORE INSERT ON finance_refresh_sources FOR EACH ROW EXECUTE FUNCTION seal_finance_refresh_member()"
        )
        op.execute(
            "CREATE FUNCTION validate_finance_refresh_scope() RETURNS trigger\n    LANGUAGE plpgsql AS $$ BEGIN\n    IF TG_TABLE_NAME='finance_refreshes' THEN\n      IF NOT EXISTS (SELECT 1 FROM player_context_datasets\n        WHERE id=NEW.roster_dataset_id AND kind='player_index' AND season=NEW.season) THEN\n        RAISE EXCEPTION 'finance refresh roster scope mismatch'; END IF;\n      IF NEW.threshold_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM finance_thresholds\n        WHERE id=NEW.threshold_id AND season=NEW.season) THEN\n        RAISE EXCEPTION 'finance refresh threshold scope mismatch'; END IF;\n    ELSE\n      IF NOT EXISTS (SELECT 1 FROM finance_refreshes r JOIN workbench_acquisitions a\n        ON a.id=NEW.acquisition_id WHERE r.id=NEW.refresh_id AND a.resource='finance'\n        AND a.metadata_json->>'season'=r.season AND a.finished_at IS NOT NULL\n        AND a.finished_at<=r.observed_at AND a.status IN ('success','failed')) THEN\n        RAISE EXCEPTION 'finance refresh acquisition scope mismatch'; END IF;\n    END IF;\n    RETURN NEW; END; $$"
        )
        op.execute(
            "CREATE TRIGGER validate_finance_refresh_scope BEFORE INSERT ON finance_refreshes FOR EACH ROW EXECUTE FUNCTION validate_finance_refresh_scope()"
        )
        op.execute(
            "CREATE TRIGGER validate_finance_refresh_scope BEFORE INSERT ON finance_refresh_sources FOR EACH ROW EXECUTE FUNCTION validate_finance_refresh_scope()"
        )
        op.execute(
            "CREATE FUNCTION seal_finance_refresh_provenance() RETURNS trigger\n    LANGUAGE plpgsql AS $$ BEGIN\n    IF TG_TABLE_NAME='workbench_acquisitions' AND EXISTS (\n      SELECT 1 FROM finance_refresh_sources WHERE acquisition_id=OLD.id) THEN\n      RAISE EXCEPTION 'finance refresh provenance is append-only'; END IF;\n    IF TG_TABLE_NAME='workbench_artifacts' THEN\n      IF EXISTS (SELECT 1 FROM finance_refresh_sources s JOIN workbench_acquisitions a\n        ON a.id=s.acquisition_id WHERE a.artifact_id=OLD.id\n          OR a.metadata_json->>'robots_sha256'=OLD.sha256) THEN\n        RAISE EXCEPTION 'finance refresh provenance is append-only'; END IF;\n    END IF;\n    RETURN COALESCE(NEW, OLD); END; $$"
        )
        op.execute(
            "CREATE TRIGGER seal_finance_refresh_source BEFORE UPDATE OR DELETE ON workbench_acquisitions FOR EACH ROW EXECUTE FUNCTION seal_finance_refresh_provenance()"
        )
        op.execute(
            "CREATE TRIGGER seal_finance_refresh_source BEFORE UPDATE OR DELETE ON workbench_artifacts FOR EACH ROW EXECUTE FUNCTION seal_finance_refresh_provenance()"
        )


def downgrade() -> None:
    if op.get_bind().dialect.name == "postgresql":
        for table in ("workbench_acquisitions", "workbench_artifacts"):
            op.execute(f"DROP TRIGGER seal_finance_refresh_source ON {table}")
        op.execute("DROP FUNCTION seal_finance_refresh_provenance()")
    op.drop_table("finance_refresh_sources")
    op.drop_table("finance_refreshes")
    op.drop_table("finance_thresholds")
    if op.get_bind().dialect.name == "postgresql":
        op.execute("DROP FUNCTION seal_finance_refresh_member()")
        op.execute("DROP FUNCTION seal_finance_context()")
        op.execute("DROP FUNCTION validate_finance_refresh_scope()")
