"""Load at API start what the first reads would otherwise load (speed plan SP04).

On a fresh API process every page waited about 3.4 s on the PC (live: more): the catalog decodes
the impact and DARKO bundles on its first call (about 2 s), the first Stats or career read
fingerprints the tracking feed (about 1 s before SP04's query change) and the first player bio
parses the finance book. Each of these is memoised for the life of the process (or until its
input changes), so the first visitor after a deploy paid for all of them.

`COURTLENS_WARM_START` (off by default, so tests and the PC are untouched; on in
`deploy/compose.prod.yml`) runs the same calls once, in a background thread, as the API starts:
the API answers at once, and a request that arrives before the warm-up ends computes what it
needs itself, as before. The warm-up only fills memos the reads fill anyway; it stores no
response and never changes one. Its timings are reported in `GET /api/cache/status`.
"""

from __future__ import annotations

import logging
import threading
import time
from collections.abc import Callable
from typing import Any

from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)


def _catalog(session: Session) -> None:
    from courtlens.api.routers.workbench import get_catalog

    get_catalog(release_id=None, session=session)


def _source_facts(session: Session) -> None:
    from courtlens.services import stats_cohort_store
    from courtlens.services.workbench_analytics import resolve_workbench_context

    stats_cohort_store.source_facts(session, resolve_workbench_context(session))


def _finance_book(session: Session) -> None:
    from sqlalchemy import select

    from courtlens.finance_context_models import FinanceRefresh
    from courtlens.services.player_contracts import book_rows

    refresh = session.scalar(
        select(FinanceRefresh)
        .where(FinanceRefresh.book_id.is_not(None))
        .order_by(FinanceRefresh.observed_at.desc(), FinanceRefresh.id.desc())
        .limit(1)
    )
    if refresh is not None and refresh.book_id is not None:
        book_rows(session, refresh.book_id)


def _lookup_index(session: Session) -> None:
    """The published dataset's search index (about 20 s live), before the first keystroke."""
    from courtlens.services.entity_lookup import get_or_build_entity_index, resolve_lookup_binding

    _, dataset_id = resolve_lookup_binding(session, None)
    get_or_build_entity_index(session, dataset_id)


STEPS: tuple[tuple[str, Callable[[Session], None]], ...] = (
    ("catalog", _catalog),
    ("source_facts", _source_facts),
    ("finance_book", _finance_book),
    ("lookup_index", _lookup_index),
)


def warm(
    session_factory: Callable[[], Session],
    steps: tuple[tuple[str, Callable[[Session], None]], ...] = STEPS,
) -> dict[str, Any]:
    """Run each step in its own session; a failed step is logged and the others still run."""
    report: dict[str, Any] = {"state": "running", "steps": {}}
    started = time.perf_counter()
    for name, step in steps:
        began = time.perf_counter()
        try:
            with session_factory() as session:
                step(session)
            report["steps"][name] = {"seconds": round(time.perf_counter() - began, 3)}
        except Exception as error:  # a warm-up must never stop the API
            logger.exception("warm start: %s failed", name)
            report["steps"][name] = {
                "seconds": round(time.perf_counter() - began, 3),
                "error": type(error).__name__,
            }
    report["seconds"] = round(time.perf_counter() - started, 3)
    report["state"] = "done"
    logger.info("warm start finished in %.2f s: %s", report["seconds"], report["steps"])
    return report


def start(state: Any, session_factory: Callable[[], Session]) -> threading.Thread:
    """Warm in a daemon thread; `state.warm_start` holds the report as it fills."""
    state.warm_start = {"state": "running", "steps": {}}

    def run() -> None:
        state.warm_start = warm(session_factory)

    thread = threading.Thread(target=run, name="courtlens-warm-start", daemon=True)
    thread.start()
    return thread
