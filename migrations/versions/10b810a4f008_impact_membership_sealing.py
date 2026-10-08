"""Seal IM03 memberships at the admitting transaction, including ordinary inserts."""

import sqlalchemy as sa
from alembic import op

revision = "10b810a4f008"
down_revision = "09b810a4f007"
branch_labels = None
depends_on = None

TABLES = (
    "workbench_dataset_members",
    "workbench_schedules",
    "workbench_possessions",
    "workbench_lineup_stints",
    "workbench_stint_players",
    "workbench_reconstruction_overrides",
    "workbench_pbp_events",
    "workbench_lineups",
    "workbench_player_games",
    "workbench_team_games",
)


def upgrade() -> None:
    op.add_column("workbench_datasets", sa.Column("admission_transaction", sa.String(32)))
    op.execute("""CREATE FUNCTION protect_impact_dataset() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF TG_OP = 'INSERT' THEN
        IF NEW.source_namespace = 'courtlens-impact' THEN
          NEW.admission_transaction = txid_current()::text;
        END IF;
        RETURN NEW;
      END IF;
      IF OLD.source_namespace = 'courtlens-impact' THEN
        RAISE EXCEPTION 'impact dataset is append-only';
      END IF;
      IF TG_OP = 'UPDATE' AND NEW.source_namespace = 'courtlens-impact' THEN
        RAISE EXCEPTION 'cannot convert an existing dataset to impact';
      END IF;
      RETURN COALESCE(NEW, OLD);
    END; $$""")
    op.execute(
        "CREATE TRIGGER protect_impact_dataset BEFORE INSERT OR UPDATE OR DELETE ON workbench_datasets FOR EACH ROW EXECUTE FUNCTION protect_impact_dataset()"
    )
    op.execute("""CREATE FUNCTION protect_impact_member() RETURNS trigger LANGUAGE plpgsql AS $$
    DECLARE ds record;
    BEGIN
      IF TG_OP = 'INSERT' THEN
        SELECT source_namespace, admission_transaction INTO ds FROM workbench_datasets WHERE id=NEW.dataset_id;
        IF ds.source_namespace = 'courtlens-impact' AND ds.admission_transaction IS DISTINCT FROM txid_current()::text THEN
          RAISE EXCEPTION 'impact dataset membership is sealed';
        END IF;
        RETURN NEW;
      END IF;
      IF EXISTS (SELECT 1 FROM workbench_datasets WHERE id=OLD.dataset_id AND source_namespace='courtlens-impact') THEN
        RAISE EXCEPTION 'impact rows are append-only';
      END IF;
      IF TG_OP = 'UPDATE' AND EXISTS (SELECT 1 FROM workbench_datasets WHERE id=NEW.dataset_id AND source_namespace='courtlens-impact') THEN
        RAISE EXCEPTION 'cannot move rows into impact membership';
      END IF;
      RETURN COALESCE(NEW, OLD);
    END; $$""")
    op.execute("""CREATE FUNCTION protect_impact_truncate() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF EXISTS (SELECT 1 FROM workbench_datasets WHERE source_namespace='courtlens-impact') THEN
        RAISE EXCEPTION 'impact tables cannot be truncated';
      END IF;
      RETURN NULL;
    END; $$""")
    for table in (*TABLES, "workbench_datasets"):
        op.execute(
            f"CREATE TRIGGER protect_impact_truncate BEFORE TRUNCATE ON {table} FOR EACH STATEMENT EXECUTE FUNCTION protect_impact_truncate()"
        )
    for table in TABLES:
        op.execute(
            f"CREATE TRIGGER protect_impact_member BEFORE INSERT OR UPDATE OR DELETE ON {table} FOR EACH ROW EXECUTE FUNCTION protect_impact_member()"
        )


def downgrade() -> None:
    for table in (*TABLES, "workbench_datasets"):
        op.execute(f"DROP TRIGGER protect_impact_truncate ON {table}")
    op.execute("DROP FUNCTION protect_impact_truncate()")
    for table in TABLES:
        op.execute(f"DROP TRIGGER protect_impact_member ON {table}")
    op.execute("DROP TRIGGER protect_impact_dataset ON workbench_datasets")
    op.execute("DROP FUNCTION protect_impact_member()")
    op.execute("DROP FUNCTION protect_impact_dataset()")
    op.drop_column("workbench_datasets", "admission_transaction")
