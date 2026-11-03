"""Persisted Stats cohorts: each scope's whole-league rows and table ranks, computed once.

A Stats scope's rows and the table ranks shown with them are the most expensive part of a Stats
request (aggregating every player of a season, about 0.8 s) and depend only on immutable inputs.
The in-memory cache (stats_cohort_cache) keeps a few of them per process; this store keeps every
computed scope in PostgreSQL so a restart, another worker or a different player's page reuses
it, and a player's career reads one row per season instead of ranking each season again.

An entry's key binds the scope (release, dataset, semantic signature, season, phase, cutoff,
query and joined artifacts, as the in-memory key does), the source rows it reads (dataset row
fingerprint, player names and the tracking feed observations of its season) and the serving
code itself, so a changed input or formula produces a new key and is never served stale. Only
ready workbench datasets persist: their rows are immutable once published.

Entries are recomputable serving rows, not evidence: a failed write is logged and the request
is served from the computed rows.
"""

from __future__ import annotations

import importlib
import json
import logging
import time
from functools import lru_cache
from hashlib import sha256
from threading import Lock
from typing import Any, cast

from sqlalchemy import Connection, CursorResult, delete, select, text
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from courtlens.domain.query_spec import QuerySpec, SampleFilter, TeamScope, WindowKind
from courtlens.models import utc_now
from courtlens.services.workbench_analytics import ResolvedContext, canonical_hash
from courtlens.stats_cohort_models import StatsCohortEntry, StatsCohortRow
from courtlens.workbench_models import WorkbenchDataset

logger = logging.getLogger(__name__)

STORE_VERSION = "courtlens-stats-cohort-store-v1"
# Modules whose source defines a cohort row or its ranks; editing any of them changes every key.
ENGINE_MODULES = (
    "courtlens.services.stats_engine",
    "courtlens.services.stats_cohort_cache",
    "courtlens.services.stats_cohort_store",
    "courtlens.services.table_percentiles",
    "courtlens.services.impact_serving",
    "courtlens.services.darko",
    "courtlens.domain.metrics",
    "courtlens.domain.impact_catalog",
    "courtlens.domain.stats_v4_catalog",
    "courtlens.domain.query_spec",
    "courtlens.domain.stats_presentation",
)
# Source fingerprints are re-read at most this often per dataset (three small queries).
SOURCE_TTL_SECONDS = 30.0
TRACKING_MART = "analytics_marts.mart_stats_player_tracking"

_sources: dict[str, tuple[float, dict[str, Any] | None]] = {}
_lock = Lock()


def clear() -> None:
    with _lock:
        _sources.clear()


@lru_cache(maxsize=1)
def engine_fingerprint() -> str:
    digest = sha256(STORE_VERSION.encode())
    for name in ENGINE_MODULES:
        path = importlib.import_module(name).__file__
        assert path is not None
        with open(path, "rb") as source:
            digest.update(name.encode() + b"\0" + source.read())
    return digest.hexdigest()


def source_facts(session: Session, context: ResolvedContext) -> dict[str, Any] | None:
    """Fingerprints of every source table a cohort reads, or None when it must not persist."""
    now = time.monotonic()
    with _lock:
        hit = _sources.get(context.dataset_id)
        if hit and now - hit[0] < SOURCE_TTL_SECONDS:
            return hit[1]
    facts = _read_source_facts(session, context)
    with _lock:
        _sources[context.dataset_id] = (now, facts)
    return facts


def _read_source_facts(session: Session, context: ResolvedContext) -> dict[str, Any] | None:
    from courtlens.services.workbench_analytics import dataset_fingerprint

    bind = session.get_bind()
    if bind.dialect.name != "postgresql" or context.dataset_type != "workbench":
        return None
    dataset = session.get(WorkbenchDataset, context.dataset_id)
    if dataset is None or dataset.status != "ready":
        return None
    count, latest = dataset_fingerprint(session, context.dataset_id)
    names = session.execute(
        text(
            "SELECT count(*), md5(string_agg(external_id || '=' || display_name, ',' "
            "ORDER BY external_id, display_name)) FROM workbench_identities WHERE kind = 'player'"
        )
    ).one()
    tracking: dict[str, str] = {}
    if session.execute(text(f"SELECT to_regclass('{TRACKING_MART}')")).scalar() is not None:
        # Feed datasets are immutable observations: their ids and row counts identify the values.
        tracking = {
            f"{season}:{phase}": f"{rows}:{datasets}"
            for season, phase, rows, datasets in session.execute(
                text(
                    f"SELECT season, season_type, count(*), "
                    f"md5(string_agg(DISTINCT dataset_id::text, ',')) FROM {TRACKING_MART} "
                    "GROUP BY season, season_type"
                )
            )
        }
    return {
        "dataset": [count, latest.isoformat() if latest else None],
        "names": [int(names[0]), names[1]],
        "tracking": tracking,
    }


def entry_key(
    facts: dict[str, Any], context: ResolvedContext, scope: QuerySpec, scope_key: str
) -> str:
    from courtlens.services.stats_engine import tracking_applies, tracking_query_fields

    season = scope.season or context.season
    phase = scope.phase or context.phase
    joins_tracking = bool(tracking_query_fields(scope)) and tracking_applies(context, scope)
    return canonical_hash(
        {
            "version": STORE_VERSION,
            "engine": engine_fingerprint(),
            "scope": scope_key,
            "dataset": facts["dataset"],
            "names": facts["names"],
            "tracking": facts["tracking"].get(f"{season}:{phase}") if joins_tracking else None,
        }
    )


def carries_table_ranks(scope: QuerySpec) -> bool:
    """Whole-season league scopes: their own rows are the table-rank reference."""
    return (
        scope.window.kind == WindowKind.SEASON
        and scope.team_scope == TeamScope()
        and scope.sample_filters == SampleFilter()
        and scope.predicates is None
        and not scope.name
    )


def load_cohort(session: Session, key: str) -> tuple[list[dict[str, Any]], int] | None:
    eligible = session.scalar(select(StatsCohortEntry.eligible).where(StatsCohortEntry.key == key))
    if eligible is None:
        return None
    rows = session.scalars(
        select(StatsCohortRow.payload)
        .where(StatsCohortRow.entry_key == key)
        .order_by(StatsCohortRow.ordinal)
    ).all()
    return list(rows), eligible


def stored_keys(session: Session, keys: list[str]) -> set[str]:
    return set(session.scalars(select(StatsCohortEntry.key).where(StatsCohortEntry.key.in_(keys))))


def load_player(
    session: Session, keys: list[str], player_id: str
) -> dict[str, dict[str, Any] | None]:
    """One player's row in each stored entry, with table ranks; None when not in that cohort.

    Keys without a stored entry are absent from the result.
    """
    if not keys:
        return {}
    entries: dict[str, dict[str, int] | None] = {
        key: sizes
        for key, sizes in session.execute(
            select(StatsCohortEntry.key, StatsCohortEntry.table_sample_sizes).where(
                StatsCohortEntry.key.in_(keys)
            )
        )
    }
    found: dict[str, dict[str, Any] | None] = {key: None for key in entries}
    for key, row, ranks in session.execute(
        select(StatsCohortRow.entry_key, StatsCohortRow.payload, StatsCohortRow.ranks).where(
            StatsCohortRow.entry_key.in_(list(entries)), StatsCohortRow.player_id == player_id
        )
    ):
        item = dict(row)
        sizes = entries[key]
        if sizes is not None and ranks is not None:
            item["table_qualified"] = ranks["qualified"]
            item["table_percentiles"] = ranks["percentiles"]
            item["table_cohort_sample_sizes"] = dict(sizes)
        found[key] = item
    return found


def save_cohort(
    session: Session,
    context: ResolvedContext,
    scope: QuerySpec,
    scope_key: str,
    key: str,
    rows: list[dict[str, Any]],
    eligible: int,
) -> None:
    """Persist a complete cohort, with table ranks when it is their reference; never raises."""
    from courtlens.services.table_percentiles import rank_items, table_reference

    if eligible > len(rows):
        return  # A truncated cohort is neither a complete page source nor a rank reference.
    stored = json.loads(json.dumps(rows, separators=(",", ":"), default=str))
    ranks: list[dict[str, Any] | None] = [None] * len(stored)
    sizes: dict[str, int] | None = None
    if carries_table_ranks(scope):
        items = [
            {key: row.get(key) for key in ("player_id", "metrics", "impact_support")}
            for row in stored
        ]
        qualified, distributions = table_reference(stored, stored, items)
        rank_items(items, qualified, distributions)
        sizes = {column: len(values) for column, values in distributions.items()}
        ranks = [
            {"qualified": item["table_qualified"], "percentiles": item["table_percentiles"]}
            for item in items
        ]
    try:
        # Its own connection and transaction: the request's REPEATABLE READ snapshot stays
        # read-only, and the entry becomes visible to every worker once complete.
        bind = session.get_bind()
        engine = bind.engine if isinstance(bind, Connection) else bind
        # READ COMMITTED: a writer that waited on the scope lock must see the entry the
        # previous writer committed (REPEATABLE READ would raise a serialization error).
        with (
            engine.connect().execution_options(isolation_level="READ COMMITTED") as connection,
            connection.begin(),
        ):
            # Writers of one scope run one at a time: two concurrent writers each superseding
            # the other's entries would otherwise deadlock.
            connection.execute(
                text("SELECT pg_advisory_xact_lock(hashtextextended(:scope, 0))"),
                {"scope": scope_key},
            )
            created = connection.execute(
                pg_insert(StatsCohortEntry)
                .values(
                    key=key,
                    scope_key=scope_key,
                    release_id=context.release_id,
                    season=scope.season or context.season,
                    phase=scope.phase or context.phase,
                    row_count=len(stored),
                    eligible=eligible,
                    table_sample_sizes=sizes,
                    created_at=utc_now(),
                )
                .on_conflict_do_nothing()
                .returning(StatsCohortEntry.key)
            ).scalar_one_or_none()
            if created is None:
                return  # Another request stored the same entry.
            if stored:
                connection.execute(
                    pg_insert(StatsCohortRow),
                    [
                        {
                            "entry_key": key,
                            "player_id": row["player_id"],
                            "ordinal": ordinal,
                            "payload": row,
                            "ranks": rank,
                        }
                        for ordinal, (row, rank) in enumerate(zip(stored, ranks, strict=True))
                    ],
                )
            # Older entries of this scope were built from superseded sources or code.
            connection.execute(
                delete(StatsCohortEntry).where(
                    StatsCohortEntry.scope_key == scope_key, StatsCohortEntry.key != key
                )
            )
    except SQLAlchemyError:
        logger.warning("Stats cohort %s was not persisted", key, exc_info=True)


def prune(session: Session, keep_release_ids: set[str]) -> int:
    """Delete entries of releases no longer served; returns the number removed."""
    result = session.execute(
        delete(StatsCohortEntry).where(StatsCohortEntry.release_id.not_in(keep_release_ids))
    )
    session.commit()
    return int(cast(CursorResult[Any], result).rowcount or 0)
