"""Live reads ESPN on demand, like Databallr's backend live cache (alignment row 7).

A GET reads the cached copy of a resource (a date's slate, one game's summary, the league injury
report) and fetches ESPN first when that copy is stale. Concurrent readers of one resource share
a single fetch through a session advisory lock; a reader that finds the lock taken serves the
cached copy. Failures back off per resource and keep the last good copy.

Freshness follows what can still change: games in progress refresh every 20 seconds, upcoming
games every few minutes, and a final read is never fetched again. Final reads are also appended,
content-hashed, to the append-only `live_contents` / `live_observations` evidence that
`reconcile-live-final` compares with admitted facts. Earlier reads only replace the mutable
`live_current` row, so in-progress refreshes don't grow storage.
"""

from __future__ import annotations

import hashlib
import json
import zlib
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import UTC, date, datetime, timedelta
from typing import Any, Protocol
from zoneinfo import ZoneInfo

from sqlalchemy import Engine, String, cast, func, select, text
from sqlalchemy.orm import Session

from courtlens.domain.live import LIVE_PARSER_VERSION
from courtlens.live_models import LiveContent, LiveCurrent, LiveObservation
from courtlens.services.live_identity import bind_identities
from courtlens.services.live_provider import LiveFetch, LiveProviderError

LOCK_NAMESPACE = 313104219
# Logical raw + normalized bytes of retained finals (about 0.7 MB per game summary).
MAX_CONTENT_BYTES = 4 * 1024 * 1024 * 1024
IN_PROGRESS_SECONDS = 20
SOON_SECONDS = 60
UPCOMING_SECONDS = 600
INJURY_SECONDS = 600
RETRY_SECONDS = (30, 60, 120, 300)
EASTERN = ZoneInfo("America/New_York")
SETTLED = {"final", "postponed", "cancelled"}


class Provider(Protocol):
    def fetch(self, slate: date, game_id: str | None = None) -> LiveFetch: ...

    def fetch_injuries(self) -> LiveFetch: ...


def aware(value: datetime) -> datetime:
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value


def resource_name(slate: date | None, game_id: str | None = None) -> str:
    if game_id:
        return f"game:{game_id}"
    return f"slate:{slate}" if slate else "injuries"


def _games(data: dict[str, Any] | None) -> list[dict[str, Any]]:
    if not data:
        return []
    return [g for g in data.get("games") or [data.get("game")] if g]


def is_final(resource: str, data: dict[str, Any] | None, today: date) -> bool:
    """Nothing left to change: every game settled, or an empty date that has passed."""
    if resource == "injuries" or data is None:
        return False
    games = _games(data)
    if not games:
        return resource.startswith("slate:") and date.fromisoformat(
            resource[6:]
        ) < today - timedelta(days=1)
    return all(g["status"] in SETTLED for g in games)


def refresh_seconds(resource: str, data: dict[str, Any] | None, now: datetime) -> int | None:
    """How soon this read can change; None when it can't."""
    today = now.astimezone(EASTERN).date()
    if resource == "injuries":
        return INJURY_SECONDS
    if data is None:
        return SOON_SECONDS
    if is_final(resource, data, today):
        return None
    games = _games(data)
    if any(g["status"] == "in_progress" for g in games):
        return IN_PROGRESS_SECONDS
    starts = [
        aware(datetime.fromisoformat(g["event_time"]))
        for g in games
        if g["status"] in {"scheduled", "unknown"} and g.get("event_time")
    ]
    if any(start - now < timedelta(hours=1) for start in starts):
        return SOON_SECONDS
    return UPCOMING_SECONDS


def _due(current: LiveCurrent | None, now: datetime) -> bool:
    if current is None:
        return True
    if (current.normalized_json or {}).get("parser_version") not in {None, LIVE_PARSER_VERSION}:
        return True  # A newer parser reads the source again, finals included.
    if current.final:
        return False
    if current.failures and current.attempted_at:
        wait = RETRY_SECONDS[min(current.failures, len(RETRY_SECONDS)) - 1]
        if now - aware(current.attempted_at) < timedelta(seconds=wait):
            return False
    if current.acquired_at is None:
        return True
    ttl = refresh_seconds(current.resource, current.normalized_json, now) or 0
    return now - aware(current.acquired_at) >= timedelta(seconds=ttl)


@contextmanager
def resource_lock(engine: Engine, resource: str) -> Iterator[bool]:
    """One fetch per resource at a time across API processes; never waits."""
    if engine.dialect.name != "postgresql":
        yield True
        return
    key = zlib.crc32(resource.encode())
    with engine.connect() as conn:
        locked = bool(
            conn.scalar(
                text("SELECT pg_try_advisory_lock(:ns, :key)"),
                {"ns": LOCK_NAMESPACE, "key": key - 2**31},
            )
        )
        conn.commit()
        try:
            yield locked
        finally:
            if locked:
                conn.execute(
                    text("SELECT pg_advisory_unlock(:ns, :key)"),
                    {"ns": LOCK_NAMESPACE, "key": key - 2**31},
                )
                conn.commit()


def _retain(
    session: Session, resource: str, result: LiveFetch, normalized: dict[str, Any], now: datetime
) -> tuple[str | None, str | None]:
    """Append a final read as hashed evidence; identical content is stored once."""
    digest = hashlib.sha256(
        result.raw + LIVE_PARSER_VERSION.encode() + json.dumps(normalized, sort_keys=True).encode()
    ).hexdigest()
    if not session.get(LiveContent, digest):
        stored = (
            session.scalar(
                select(
                    func.sum(
                        func.length(LiveContent.raw_bytes)
                        + func.length(cast(LiveContent.normalized_json, String))
                    )
                )
            )
            or 0
        )
        if stored + len(result.raw) + len(json.dumps(normalized)) > MAX_CONTENT_BYTES:
            return None, None
        session.add(
            LiveContent(
                sha256=digest,
                raw_bytes=result.raw,
                normalized_json=normalized,
                parser_version=LIVE_PARSER_VERSION,
            )
        )
        session.flush()
    observation = LiveObservation(
        resource=resource,
        content_sha256=digest,
        acquired_at=now,
        source_time=result.source_time,
        http_date=result.http_date,
    )
    session.add(observation)
    session.flush()
    return observation.id, digest


def _refresh(
    session: Session,
    resource: str,
    slate: date | None,
    game_id: str | None,
    provider: Provider,
    now: datetime,
) -> LiveCurrent:
    current = session.get(LiveCurrent, resource) or LiveCurrent(resource=resource, failures=0)
    session.add(current)
    current.attempted_at = now
    try:
        result = provider.fetch_injuries() if slate is None else provider.fetch(slate, game_id)
    except LiveProviderError as exc:
        current.failures = (current.failures or 0) + 1
        current.error = str(exc)[:100]
        session.commit()
        return current
    normalized = {
        **bind_identities(session, result.normalized),
        "parser_version": LIVE_PARSER_VERSION,
    }
    today = now.astimezone(EASTERN).date()
    final = is_final(resource, normalized, today)
    if final:
        current.observation_id, current.content_sha256 = _retain(
            session, resource, result, normalized, now
        )
    current.normalized_json = normalized
    current.final = final
    current.acquired_at = now
    current.source_time = result.source_time
    current.http_date = result.http_date
    current.failures = 0
    current.error = None
    session.commit()
    return current


def read(
    session: Session,
    provider: Provider,
    slate: date | None,
    game_id: str | None = None,
    *,
    now: datetime | None = None,
) -> dict[str, Any]:
    """The cached read of one resource, fetched first when stale."""
    now = now or datetime.now(UTC)
    resource = resource_name(slate, game_id)
    current = session.get(LiveCurrent, resource)
    if _due(current, now):
        with resource_lock(session.get_bind().engine, resource) as locked:
            if locked:
                # End the read transaction so another process's refresh is visible.
                session.rollback()
                current = session.get(LiveCurrent, resource)
                if _due(current, now):
                    current = _refresh(session, resource, slate, game_id, provider, now)
    data = current.normalized_json if current else None
    age = (
        (now - aware(current.acquired_at)).total_seconds()
        if current and current.acquired_at
        else None
    )
    wait = refresh_seconds(resource, data, now)
    return {
        "namespace": "espn",
        "resource": resource,
        "status": "unavailable"
        if data is None and not (current and current.error)
        else "source_error"
        if current and current.error
        else "observed",
        "final": bool(current and current.final),
        "stale": age is not None and wait is not None and age > wait * 3,
        "age_seconds": age,
        "acquired_at": current.acquired_at if current else None,
        "source_time": current.source_time if current else None,
        "http_date": current.http_date if current else None,
        "refresh_seconds": wait,
        "error": current.error if current else None,
        "observation_id": current.observation_id if current else None,
        "content_sha256": current.content_sha256 if current else None,
        "data": data,
    }


def with_injury_counts(slate_read: dict[str, Any], injuries: dict[str, Any]) -> dict[str, Any]:
    """Upcoming games get each team's count of players reported Out (Databallr's "2 OUT")."""
    report = (injuries.get("data") or {}).get("teams")
    data = slate_read.get("data")
    if not report or not data:
        return slate_read
    games = []
    for game in data.get("games", []):
        if game["status"] == "scheduled":
            game = {
                **game,
                "teams": [
                    {
                        **team,
                        "out": sum(
                            1 for p in report.get(team["source_id"], []) if p.get("status") == "Out"
                        ),
                    }
                    for team in game["teams"]
                ],
            }
        games.append(game)
    return {**slate_read, "data": {**data, "games": games}}
