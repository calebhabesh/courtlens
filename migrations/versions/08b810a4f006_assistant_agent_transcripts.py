"""AG03 server-owned provider transcripts; existing turn/history payloads stay valid."""

import sqlalchemy as sa
from alembic import op

revision = "08b810a4f006"
down_revision = "07b810a4f005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "assistant_agent_transcripts",
        sa.Column(
            "turn_id",
            sa.String(36),
            sa.ForeignKey("assistant_turns.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("sha256", sa.String(64), nullable=False),
        sa.Column("payload_json", sa.JSON(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("assistant_agent_transcripts")
