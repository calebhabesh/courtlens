"""B19b independent assignment datasets and transaction-sealed memberships."""

import sqlalchemy as sa
from alembic import op

revision = "19b810a4f004"
down_revision = "35b810a4f003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "assignment_datasets",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("content_sha256", sa.String(64), nullable=False, unique=True),
        sa.Column("source_sha256", sa.String(64), nullable=False),
        sa.Column("membership_sha256", sa.String(64), nullable=False),
        sa.Column("admission_transaction", sa.String(30), nullable=False),
        sa.Column("manifest_json", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "assignment_games",
        sa.Column(
            "dataset_id", sa.String(36), sa.ForeignKey("assignment_datasets.id"), primary_key=True
        ),
        sa.Column("game_id", sa.String(10), primary_key=True),
        sa.Column("game_date", sa.String(10), nullable=False),
        sa.Column("row_count", sa.Integer(), nullable=False),
        sa.Column("membership_sha256", sa.String(64), nullable=False),
    )
    op.create_table(
        "assignment_members",
        sa.Column("dataset_id", sa.String(36), primary_key=True),
        sa.Column("source_row", sa.Integer(), primary_key=True),
        sa.Column("game_id", sa.String(10), nullable=False),
        sa.Column("off_person_id", sa.String(100), nullable=False),
        sa.Column("def_person_id", sa.String(100), nullable=False),
        sa.Column("off_team_id", sa.String(100), nullable=False),
        sa.Column("def_team_id", sa.String(100), nullable=False),
        sa.Column("matchup_seconds", sa.Numeric(), nullable=False),
        sa.Column("partial_possessions", sa.Numeric(), nullable=False),
        sa.Column("row_sha256", sa.String(64), nullable=False),
        sa.Column("payload_json", sa.JSON(), nullable=False),
        sa.ForeignKeyConstraint(
            ["dataset_id", "game_id"], ["assignment_games.dataset_id", "assignment_games.game_id"]
        ),
        sa.UniqueConstraint("dataset_id", "game_id", "off_person_id", "def_person_id"),
        sa.CheckConstraint("matchup_seconds >= 0 AND matchup_seconds < 'Infinity'::numeric"),
        sa.CheckConstraint(
            "partial_possessions >= 0 AND partial_possessions < 'Infinity'::numeric"
        ),
        sa.CheckConstraint("source_row > 0"),
        sa.CheckConstraint("off_person_id <> def_person_id AND off_team_id <> def_team_id"),
    )
    op.create_index("ix_assignment_members_game", "assignment_members", ["dataset_id", "game_id"])
    op.create_table(
        "assignment_observations",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "dataset_id", sa.String(36), sa.ForeignKey("assignment_datasets.id"), nullable=False
        ),
        sa.Column("observed_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.execute("""CREATE FUNCTION prevent_assignment_mutation() RETURNS trigger
    LANGUAGE plpgsql AS $$ BEGIN
    RAISE EXCEPTION 'assignment inputs are append-only'; END; $$""")
    for table in (
        "assignment_datasets",
        "assignment_games",
        "assignment_members",
        "assignment_observations",
    ):
        op.execute(
            f"CREATE TRIGGER seal_{table} BEFORE UPDATE OR DELETE OR TRUNCATE ON {table} "
            "FOR EACH STATEMENT EXECUTE FUNCTION prevent_assignment_mutation()"
        )
    op.execute("""CREATE FUNCTION prevent_assignment_extension() RETURNS trigger
    LANGUAGE plpgsql AS $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM assignment_datasets WHERE id=NEW.dataset_id
    AND admission_transaction=txid_current()::text) THEN
    RAISE EXCEPTION 'assignment dataset membership is already sealed'; END IF;
    RETURN NEW; END; $$""")
    for table in ("assignment_games", "assignment_members"):
        op.execute(
            f"CREATE TRIGGER seal_insert_{table} BEFORE INSERT ON {table} "
            "FOR EACH ROW EXECUTE FUNCTION prevent_assignment_extension()"
        )


def downgrade() -> None:
    for table in (
        "assignment_observations",
        "assignment_members",
        "assignment_games",
        "assignment_datasets",
    ):
        op.drop_table(table)
    op.execute("DROP FUNCTION prevent_assignment_extension()")
    op.execute("DROP FUNCTION prevent_assignment_mutation()")
