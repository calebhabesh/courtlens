"""Assistant package for CourtLens research workbench."""

from courtlens.services.assistant.service import (
    get_assistant_status,
    run_assistant_query,
)

__all__ = [
    "get_assistant_status",
    "run_assistant_query",
]
