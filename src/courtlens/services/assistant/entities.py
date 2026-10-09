"""Canonical entity helpers shared by agent tools and compatibility APIs."""

from sqlalchemy import select
from sqlalchemy.orm import Session

from courtlens.workbench_models import WorkbenchIdentity


def resolve_player_identifier(
    session: Session, identifier: str, *, max_typo_distance: int | None = None
) -> tuple[str, str]:
    """Resolve an identifier (numeric ID or player name) to (player_id, player_name)."""
    from courtlens.services.assistant.operations import resolve_entity

    player_id = resolve_entity(
        session, None, identifier.strip(), "player_id", max_typo_distance=max_typo_distance
    )
    identity = session.scalar(
        select(WorkbenchIdentity).where(
            WorkbenchIdentity.namespace == "nba",
            WorkbenchIdentity.kind == "player",
            WorkbenchIdentity.external_id == player_id,
        )
    )
    if identity is None:
        raise ValueError("canonical NBA player not found")
    return player_id, identity.display_name
