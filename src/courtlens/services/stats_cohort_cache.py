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

from courtlens.domain.impact_catalog import IMPACT_COLUMNS
from courtlens.domain.metrics import resolve_metric_alias
from courtlens.domain.query_spec import MAX_PAGE_SIZE, PagingSpec, QuerySpec, SortSpec, ViewState
from courtlens.domain.stats_presentation import StatsPresentation
from courtlens.domain.stats_v4_catalog import TRACKING_METRICS
from courtlens.services.impact_serving import query_fields
from courtlens.services.workbench_analytics import ResolvedContext, canonical_hash

TTL_SECONDS = 600.0
MAX_ENTRIES = 8
MAX_COHORT = 2000

_entries: OrderedDict[str, tuple[float, bytes]] = OrderedDict()
# Decoded copies of the most recently used entries (about one season cohort plus its reference).
DECODED_ENTRIES = 2
_decoded: OrderedDict[str, tuple[bytes, list[dict[str, Any]], int]] = OrderedDict()
_lock = Lock()


def clear() -> None:
    with _lock:
        _entries.clear()
        _decoded.clear()


def cohort_key(kind: str, scope_hash: str, query: QuerySpec) -> str:
    """Scope hash plus the joined columns (view_state binds impact and tracking joins)."""
    fields = sorted(query_fields(query))
    return canonical_hash({"kind": kind, "scope": scope_hash, "fields": fields})


def cached_rows(
    key: str, compute: Callable[[], tuple[list[dict[str, Any]], int]], *, shared: bool = False
) -> tuple[list[dict[str, Any]], int]:
    """Cached rows for a key, computing them once per TTL.

    shared=True returns read-only rows from a small decoded working set (the cohort and league
    reference a user is currently paging, sorting and filtering); callers copy what they mutate.
    """
    now = time.monotonic()
    with _lock:
        hit = _entries.get(key)
        if hit and now - hit[0] < TTL_SECONDS:
            _entries.move_to_end(key)
            payload = hit[1]
            decoded = _decoded.get(key) if shared else None
            if decoded and decoded[0] is payload:
                _decoded.move_to_end(key)
                return decoded[1], decoded[2]
        else:
            payload = None
    if payload is not None:
        body = json.loads(payload)
        if shared:
            with _lock:
                _decoded[key] = (payload, body["rows"], body["count"])
                _decoded.move_to_end(key)
                while len(_decoded) > DECODED_ENTRIES:
                    _decoded.popitem(last=False)
        return body["rows"], body["count"]
    rows, count = compute()
    encoded = json.dumps({"rows": rows, "count": count}, separators=(",", ":"), default=str)
    with _lock:
        _entries[key] = (now, encoded.encode())
        _entries.move_to_end(key)
        while len(_entries) > MAX_ENTRIES:
            _entries.popitem(last=False)
    return json.loads(encoded)["rows"], count


def cohort_query(query: QuerySpec) -> QuerySpec:
    """The query whose rows every sort, view and display filter of one scope can share.

    Sort, name and paging run in memory. Views that join impact or tracking values share one
    cohort carrying every joined column; plain box-score views share a lighter one.
    """
    joined = bool(query_fields(query) & (IMPACT_COLUMNS.keys() | TRACKING_METRICS.keys()))
    view = ViewState(columns=sorted(IMPACT_COLUMNS) + sorted(TRACKING_METRICS)) if joined else None
    return query.model_copy(
        update={
            "name": None,
            "page": PagingSpec(limit=MAX_PAGE_SIZE),
            "sort": [SortSpec(field="player_id", direction="asc")],
            "view_state": view,
        }
    )


def sort_value(row: dict[str, Any], field: str) -> Any:
    """The value SQL would order by: unqualified impact values sort as unknown."""
    from courtlens.services.stats_engine import map_field_to_sql_column

    if field in IMPACT_COLUMNS:
        support = (row.get("impact_support") or {}).get(field) or {}
        if support.get("qualified") is not True:
            return None
    if field in ("player_name", "name"):
        # Code-point order, as the database's C collation orders names (AJ before Aaron).
        return str(row["player_name"])
    metrics = row["metrics"]
    for key in (field, resolve_metric_alias(field), map_field_to_sql_column(field)):
        if key in metrics:
            return metrics[key]
    return row.get(map_field_to_sql_column(field))


def sort_rows(rows: list[dict[str, Any]], sort: list[SortSpec]) -> list[dict[str, Any]]:
    """ORDER BY each sort key (nulls first or last as declared), then player_id ascending."""
    ordered = sorted(rows, key=lambda row: str(row["player_id"]))
    for spec in reversed(sort):
        known = [row for row in ordered if sort_value(row, spec.field) is not None]
        unknown = [row for row in ordered if sort_value(row, spec.field) is None]
        known.sort(key=lambda row: sort_value(row, spec.field), reverse=spec.direction == "desc")
        ordered = known + unknown if spec.nulls_last else unknown + known
    return ordered


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

    base = cohort_query(query)
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

    rows, eligible = cached_rows(key, compute, shared=True)
    if eligible > len(rows):
        return None
    ids = set(presentation.player_ids) if presentation.player_ids is not None else None
    name = (query.name or "").strip().lower()
    shown = sort_rows(
        [
            row
            for row in rows
            if (ids is None or row["player_id"] in ids)
            and (not name or name in str(row["player_name"]).lower())
        ],
        query.sort,
    )
    context_hash = stats_presentation_hash(context, query, presentation)
    offset = decode_cursor(query.page.cursor, [context_hash]) if query.page.cursor else 0
    limit = min(max(1, query.page.limit), MAX_PAGE_SIZE)
    # Shared rows are read-only; the page is copied because callers annotate it.
    page = json.loads(json.dumps(shown[offset : offset + limit]))
    has_more = offset + len(page) < len(shown)
    next_cursor = encode_cursor(context_hash, offset + len(page)) if has_more else None
    return page, len(shown), next_cursor, has_more, eligible
