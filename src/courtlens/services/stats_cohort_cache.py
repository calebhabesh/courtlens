"""Whole-cohort cache for Stats presentation queries.

A Stats view's analytics (aggregation, impact and tracking joins, cohort percentiles) depend only
on the scope, sort and joined columns. Display filters (estimated positions, draft class,
favorites, name search) and paging only choose which already-ranked rows to show, so the cohort
is computed once and those filters run in memory. Releases are immutable; entries also expire
after a short TTL so a rebuilt mart or artifact is picked up without a restart. Entries are
stored as compact JSON (a few MB each), never shared mutable objects.
"""

from __future__ import annotations

import json
import time
from collections import OrderedDict
from collections.abc import Callable
from threading import Lock
from typing import Any

from sqlalchemy.orm import Session

from courtlens.domain.query_spec import MAX_PAGE_SIZE, PagingSpec, QuerySpec
from courtlens.domain.stats_presentation import StatsPresentation
from courtlens.services.impact_serving import query_fields
from courtlens.services.workbench_analytics import ResolvedContext, canonical_hash

TTL_SECONDS = 600.0
MAX_ENTRIES = 12
MAX_COHORT = 2000

_entries: OrderedDict[str, tuple[float, bytes]] = OrderedDict()
_lock = Lock()


def clear() -> None:
    with _lock:
        _entries.clear()


def cohort_key(kind: str, scope_hash: str, query: QuerySpec) -> str:
    """Scope hash plus the joined columns (view_state binds impact and tracking joins)."""
    fields = sorted(query_fields(query))
    return canonical_hash({"kind": kind, "scope": scope_hash, "fields": fields})


def cached_rows(
    key: str, compute: Callable[[], tuple[list[dict[str, Any]], int]]
) -> tuple[list[dict[str, Any]], int]:
    now = time.monotonic()
    with _lock:
        hit = _entries.get(key)
        if hit and now - hit[0] < TTL_SECONDS:
            _entries.move_to_end(key)
            payload = hit[1]
        else:
            payload = None
    if payload is not None:
        body = json.loads(payload)
        return body["rows"], body["count"]
    rows, count = compute()
    encoded = json.dumps({"rows": rows, "count": count}, separators=(",", ":"), default=str)
    with _lock:
        _entries[key] = (now, encoded.encode())
        _entries.move_to_end(key)
        while len(_entries) > MAX_ENTRIES:
            _entries.popitem(last=False)
    return json.loads(encoded)["rows"], count


def presentation_page(
    session: Session,
    context: ResolvedContext,
    query: QuerySpec,
    presentation: StatsPresentation,
) -> tuple[list[dict[str, Any]], int, str | None, bool, int] | None:
    """One page of a presentation query from the cached cohort.

    Returns (items, shown_count, next_cursor, has_more, eligible_count), or None when the cohort
    exceeds the in-memory bound and the SQL path must run instead.
    """
    from courtlens.services.stats_engine import (
        decode_cursor,
        encode_cursor,
        execute_stats_query,
        stats_presentation_hash,
    )

    base = query.model_copy(update={"name": None, "page": PagingSpec(limit=MAX_PAGE_SIZE)})
    scope_hash = stats_presentation_hash(context, base, StatsPresentation())
    key = cohort_key("presentation", scope_hash, base)

    def compute() -> tuple[list[dict[str, Any]], int]:
        rows, count, _, _ = execute_stats_query(
            session,
            context,
            base,
            is_export=True,
            max_export_rows=MAX_COHORT,
            presentation=StatsPresentation(),
        )
        return rows, count

    rows, eligible = cached_rows(key, compute)
    if eligible > len(rows):
        return None
    ids = set(presentation.player_ids) if presentation.player_ids is not None else None
    name = (query.name or "").strip().lower()
    shown = [
        row
        for row in rows
        if (ids is None or row["player_id"] in ids)
        and (not name or name in str(row["player_name"]).lower())
    ]
    context_hash = stats_presentation_hash(context, query, presentation)
    offset = decode_cursor(query.page.cursor, [context_hash]) if query.page.cursor else 0
    limit = min(max(1, query.page.limit), MAX_PAGE_SIZE)
    page = shown[offset : offset + limit]
    has_more = offset + len(page) < len(shown)
    next_cursor = encode_cursor(context_hash, offset + len(page)) if has_more else None
    return page, len(shown), next_cursor, has_more, eligible
