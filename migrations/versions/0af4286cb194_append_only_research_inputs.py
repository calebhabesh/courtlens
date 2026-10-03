"""Append-only independent research inputs; no release publication or retained-row changes."""

import sqlalchemy as sa
from alembic import op

revision = "0af4286cb194"
down_revision = "f9c31a084f93"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "research_datasets",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("content_sha256", sa.String(64), nullable=False, unique=True),
        sa.Column("source_membership_sha256", sa.String(64), nullable=False),
        sa.Column("transform_sha256", sa.String(64), nullable=False),
        sa.Column("coverage_report_sha256", sa.String(64), nullable=False),
        sa.Column("admission_transaction", sa.String(30), nullable=False),
        sa.Column("manifest_json", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "research_games",
        sa.Column("dataset_id", sa.String(36), primary_key=True),
        sa.Column("game_id", sa.String(10), primary_key=True),
        sa.Column("season", sa.String(10), nullable=False),
        sa.Column("game_date", sa.String(10), nullable=False),
        sa.Column("all_rows", sa.Integer(), nullable=False),
        sa.Column("eligible_rows", sa.Integer(), nullable=False),
        sa.Column("row_membership_sha256", sa.String(64), nullable=False),
        sa.Column("eligible_membership_sha256", sa.String(64), nullable=False),
        sa.ForeignKeyConstraint(["dataset_id"], ["research_datasets.id"]),
    )
    op.create_table(
        "research_shot_members",
        sa.Column("dataset_id", sa.String(36), primary_key=True),
        sa.Column("game_id", sa.String(10), primary_key=True),
        sa.Column("event_id", sa.Integer(), primary_key=True),
        sa.Column("eligible", sa.Boolean(), nullable=False),
        sa.Column("payload_json", sa.JSON(), nullable=False),
        sa.ForeignKeyConstraint(
            ["dataset_id", "game_id"], ["research_games.dataset_id", "research_games.game_id"]
        ),
    )
    if op.get_bind().dialect.name == "postgresql":
        op.execute("""CREATE FUNCTION prevent_research_input_mutation() RETURNS trigger
        LANGUAGE plpgsql AS $$ BEGIN
        RAISE EXCEPTION 'research input memberships are append-only'; END; $$""")
        for table in ("research_datasets", "research_games", "research_shot_members"):
            op.execute(
                f"CREATE TRIGGER seal_{table} BEFORE UPDATE OR DELETE OR TRUNCATE ON {table} "
                "FOR EACH STATEMENT EXECUTE FUNCTION prevent_research_input_mutation()"
            )
        op.execute("""CREATE FUNCTION prevent_research_membership_extension() RETURNS trigger
        LANGUAGE plpgsql AS $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM research_datasets WHERE id=NEW.dataset_id
        AND admission_transaction=txid_current()::text) THEN
        RAISE EXCEPTION 'research dataset membership is already sealed'; END IF;
        RETURN NEW; END; $$""")
        for table in ("research_games", "research_shot_members"):
            op.execute(
                f"CREATE TRIGGER seal_insert_{table} BEFORE INSERT ON {table} "
                "FOR EACH ROW EXECUTE FUNCTION prevent_research_membership_extension()"
            )


def downgrade() -> None:
    for table in ("research_shot_members", "research_games", "research_datasets"):
        op.drop_table(table)
    if op.get_bind().dialect.name == "postgresql":
        op.execute("DROP FUNCTION prevent_research_input_mutation()")
        op.execute("DROP FUNCTION prevent_research_membership_extension()")
