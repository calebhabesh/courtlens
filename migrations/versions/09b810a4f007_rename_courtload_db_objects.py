"""RN02 rename PostgreSQL functions and the administrative mutation namespace."""

import sqlalchemy as sa
from alembic import op

revision = "09b810a4f007"
down_revision = "08b810a4f006"
branch_labels = None
depends_on = None

FUNCTIONS = ("live_append_only", "saved_conversation_append_only")


def _rename(old: str, new: str) -> None:
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return
    # ALTER retains function OIDs, trigger bindings and the original exception bodies.
    # No existing trigger name contains the legacy brand.
    for suffix in FUNCTIONS:
        op.execute(f"ALTER FUNCTION {old}_{suffix}() RENAME TO {new}_{suffix}")
    definition = bind.execute(
        sa.text("SELECT pg_get_functiondef('prevent_sealed_row_mutation()'::regprocedure)")
    ).scalar_one()
    old_setting = f"{old}.allow_admin_mutation"
    if definition.count(old_setting) != 1:
        raise RuntimeError("Unexpected sealed-row guard definition; refusing to rewrite it")
    # Preserve the complete deployed definition, changing only the setting read by the guard.
    op.execute(sa.text(definition.replace(old_setting, f"{new}.allow_admin_mutation")))


def upgrade() -> None:
    _rename("courtload", "courtlens")


def downgrade() -> None:
    _rename("courtlens", "courtload")
