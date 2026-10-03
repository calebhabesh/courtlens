"""personal_workspace_state

Revision ID: 1b66214e7c08
Revises: 882c8b450cb3
Create Date: 2026-10-02 02:10:31.958813
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "1b66214e7c08"
down_revision: str | None = "882c8b450cb3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    columns = (
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("views_json", sa.JSON(), nullable=False),
        sa.Column("favorites_json", sa.JSON(), nullable=False),
        sa.Column("compare_tray_json", sa.JSON(), nullable=False),
        sa.Column("ranking_boards_json", sa.JSON(), nullable=False),
        sa.Column("tier_lists_json", sa.JSON(), nullable=False),
        sa.Column("preferences_json", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    table_name = "workbench_personal_workspaces"
    # Local setup and older verification tests used metadata.create_all(), which
    # creates ORM tables without advancing Alembic's revision marker. Adopt only
    # the recognized schema; never hide arbitrary drift with IF NOT EXISTS.
    if not op.get_context().as_sql:
        bind = op.get_bind()
        inspector = sa.inspect(bind)
        if inspector.has_table(table_name):
            actual = {column["name"]: column for column in inspector.get_columns(table_name)}
            compatible = set(actual) == {column.name for column in columns}
            for column in columns:
                existing = actual.get(column.name)
                if existing is None:
                    compatible = False
                    continue
                compatible = compatible and (
                    existing["type"].compile(dialect=bind.dialect)
                    == column.type.compile(dialect=bind.dialect)
                    and existing["nullable"] == column.nullable
                )
                default = existing["default"]
                if column.name == "version":
                    compatible = compatible and default in (None, "1", "'1'::integer")
                else:
                    compatible = compatible and default is None
            compatible = compatible and (
                inspector.get_pk_constraint(table_name)["constrained_columns"] == ["id"]
                and not inspector.get_foreign_keys(table_name)
                and not inspector.get_unique_constraints(table_name)
                and not inspector.get_check_constraints(table_name)
                and not inspector.get_indexes(table_name)
            )
            if not compatible:
                raise RuntimeError(
                    f"{table_name} already exists with an incompatible schema; "
                    "refusing to adopt it. Inspect the table before repairing migration state."
                )
            if actual["version"]["default"] is None:
                op.alter_column(
                    table_name, "version", existing_type=sa.Integer(), server_default="1"
                )
            return
    op.create_table(table_name, *columns)


def downgrade() -> None:
    op.drop_table("workbench_personal_workspaces")
