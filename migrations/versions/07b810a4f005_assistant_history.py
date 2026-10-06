"""PF07b durable local assistant history, isolated from saved findings."""

import sqlalchemy as sa
from alembic import op

revision = "07b810a4f005"
down_revision = "19b810a4f004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "assistant_threads",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
    )
    op.create_table(
        "assistant_turns",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "thread_id",
            sa.String(36),
            sa.ForeignKey("assistant_threads.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("sequence", sa.Integer(), nullable=False),
        sa.Column("request_id", sa.String(36), nullable=False, unique=True),
        sa.Column("retry_of", sa.String(36), sa.ForeignKey("assistant_turns.id")),
        sa.Column("request_sha256", sa.String(64), nullable=False),
        sa.Column("request_json", sa.JSON(), nullable=False),
        sa.Column("accepted_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("lease_until", sa.DateTime(timezone=True), nullable=False),
        sa.Column("state", sa.String(12), nullable=False),
        sa.Column("response_json", sa.JSON(none_as_null=True)),
        sa.Column("response_sha256", sa.String(64)),
        sa.Column("context_json", sa.JSON()),
        sa.Column("plan_json", sa.JSON()),
        sa.CheckConstraint("state IN ('pending','running','completed','failed','cancelled')"),
        sa.CheckConstraint(
            "(state IN ('pending','running') AND response_json IS NULL AND response_sha256 IS NULL) OR (state IN ('completed','failed','cancelled') AND response_json IS NOT NULL AND response_sha256 IS NOT NULL)",
            name="assistant_turn_terminal_payload",
        ),
    )
    op.create_index(
        "ix_assistant_turns_thread_sequence",
        "assistant_turns",
        ["thread_id", "sequence"],
        unique=True,
    )
    op.create_index("ix_assistant_turns_lease", "assistant_turns", ["state", "lease_until"])
    op.create_table(
        "assistant_turn_inputs",
        sa.Column(
            "turn_id",
            sa.String(36),
            sa.ForeignKey("assistant_turns.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("step_id", sa.String(32), primary_key=True),
        sa.Column("workbench_dataset_id", sa.String(36), sa.ForeignKey("workbench_datasets.id")),
        sa.Column("archive_dataset_id", sa.String(36), sa.ForeignKey("archive_datasets.id")),
        sa.Column("finance_release_id", sa.String(36), sa.ForeignKey("finance_releases.id")),
        sa.Column("issuance_id", sa.String(36), sa.ForeignKey("forecast_issuances.id")),
    )


def downgrade() -> None:
    op.drop_table("assistant_turn_inputs")
    op.drop_table("assistant_turns")
    op.drop_table("assistant_threads")
