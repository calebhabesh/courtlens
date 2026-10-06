"""Shared demand/cache service. Only worker ticks acquire source observations."""

from __future__ import annotations

import hashlib
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import UTC, date, datetime, timedelta
from typing import Any, Protocol

from fastapi import HTTPException
from sqlalchemy import Engine, String, cast, func, select, text
from sqlalchemy.orm import Session

from courtload.domain.live import LIVE_PARSER_VERSION, LiveSubscription
from courtload.live_models import LiveContent, LiveFeed, LiveLease, LiveObservation
from courtload.services.live_provider import LiveFetch, LiveProviderError
from courtload.workbench_models import WorkbenchIdentityCrosswalk

FEED_LOCK = 313104219
MAX_LEASES = 64
MAX_CONTENT_BYTES = 128 * 1024 * 1024
MAX_OBSERVATIONS = 100_000


def aware(value: datetime) -> datetime:
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value


@contextmanager
def feed_lock(engine: Engine) -> Iterator[bool]:
    """Session lock on a dedicated connection; never obtains a publication lock."""
    with engine.connect() as conn:
        postgres = engine.dialect.name == "postgresql"
        locked = (
            bool(conn.scalar(text("SELECT pg_try_advisory_lock(:key)"), {"key": FEED_LOCK}))
            if postgres
            else True
        )
        conn.commit()
        try:
            yield locked
        finally:
            if postgres and locked:
                conn.execute(text("SELECT pg_advisory_unlock(:key)"), {"key": FEED_LOCK})
                conn.commit()


def subscribe(
    session: Session,
    payload: LiveSubscription,
    lease_id: str | None = None,
    *,
    now: datetime | None = None,
) -> dict[str, Any]:
    now = now or datetime.now(UTC)
    bind = session.get_bind()
    # Serialize admission/counts across API processes; never held during provider I/O.
    if bind.dialect.name == "postgresql":
        if not session.in_transaction():
            session.connection(execution_options={"isolation_level": "READ COMMITTED"})
        elif session.connection().get_isolation_level() != "READ COMMITTED":
            raise RuntimeError("Live demand requires a fresh READ COMMITTED session")
        session.execute(text("SELECT pg_advisory_xact_lock(:key)"), {"key": FEED_LOCK + 1})
    session.query(LiveLease).filter(LiveLease.expires_at <= now).delete(synchronize_session=False)
    if abs((payload.slate_date - now.date()).days) > 7:
        raise HTTPException(
            422, "Live demand supports dates within seven days; use finalized research for history"
        )
    if lease_id:
        lease = session.get(LiveLease, lease_id)
        if lease is None:
            raise HTTPException(404, "Lease expired or missing")
    else:
        if (session.scalar(select(func.count()).select_from(LiveLease)) or 0) >= MAX_LEASES:
            raise HTTPException(429, "Live demand capacity reached")
        lease = LiveLease(created_at=now)
        session.add(lease)
    lease.slate_date = payload.slate_date.isoformat()
    lease.game_id = payload.game_id
    lease.expires_at = now + timedelta(seconds=150)
    session.commit()
    return {"id": lease.id, "expires_at": lease.expires_at, "heartbeat_seconds": 60}


def release(session: Session, lease_id: str) -> None:
    lease = session.get(LiveLease, lease_id)
    if lease:
        session.delete(lease)
        session.commit()


def latest(session: Session, resource: str) -> LiveObservation | None:
    return session.scalar(
        select(LiveObservation)
        .where(LiveObservation.resource == resource)
        .order_by(LiveObservation.acquired_at.desc(), LiveObservation.id.desc())
        .limit(1)
    )


def cached(
    session: Session,
    slate: date,
    game_id: str | None = None,
    *,
    enabled: bool = False,
    now: datetime | None = None,
) -> dict[str, Any]:
    now = now or datetime.now(UTC)
    feed = session.get(LiveFeed, "espn")
    observation = latest(session, f"game:{game_id}" if game_id else f"slate:{slate}")
    content = session.get(LiveContent, observation.content_sha256) if observation else None
    age = (now - aware(observation.acquired_at)).total_seconds() if observation else None
    demand = (
        session.scalar(
            select(func.count()).select_from(LiveLease).where(LiveLease.expires_at > now)
        )
        or 0
    )
    return {
        "namespace": "espn",
        "provisional": True,
        "client_poll_seconds": 60,
        "capability": "not_yet_observed" if enabled else "not_configured",
        "status": (feed.status if feed else "awaiting_first_observation")
        if enabled
        else "not_configured",
        "paused": demand == 0,
        "active_leases": demand,
        "stale": age is not None and age > 150,
        "age_seconds": age,
        "last_success_at": feed.last_success_at if feed else None,
        "last_poll_at": feed.last_poll_at if feed else None,
        "next_poll_at": feed.next_poll_at if feed else None,
        "error": feed.error if feed else None,
        "requests": feed.requests if feed else 0,
        "bytes_received": feed.bytes_received if feed else 0,
        "observation_id": observation.id if observation else None,
        "acquired_at": observation.acquired_at if observation else None,
        "source_time": observation.source_time if observation else None,
        "http_date": observation.http_date if observation else None,
        "content_sha256": observation.content_sha256 if observation else None,
        "data": content.normalized_json if content else None,
    }


def bind_identities(session: Session, normalized: dict[str, Any]) -> dict[str, Any]:
    """One bounded indexed crosswalk lookup; ambiguous mappings stay unresolved."""
    entities: list[tuple[str, str, dict[str, Any]]] = []
    for game in normalized.get("games", [normalized.get("game")]):
        if game:
            entities.append(("game", game["source_id"], game))
            entities.extend(("team", team["source_id"], team) for team in game["teams"])
    entities.extend(
        ("player", player["source_id"], player) for player in normalized.get("players") or []
    )
    for section in normalized.get("player_sections") or []:
        for group in section.get("statistics", []):
            for athlete in group.get("athletes", []):
                entities.append(("player", str(athlete["athlete"]["id"]), athlete))
    targets: dict[tuple[str, str], set[str]] = {}
    if entities:
        rows = session.scalars(
            select(WorkbenchIdentityCrosswalk).where(
                WorkbenchIdentityCrosswalk.source_namespace == "espn",
                WorkbenchIdentityCrosswalk.source_id.in_(
                    {source_id for _, source_id, _ in entities}
                ),
                WorkbenchIdentityCrosswalk.target_namespace == "nba",
                WorkbenchIdentityCrosswalk.confidence == "verified",
            )
        )
        for row in rows:
            targets.setdefault((row.kind, row.source_id), set()).add(row.target_id)
    for kind, source_id, entity in entities:
        choices = targets.get((kind, source_id), set())
        entity["canonical_id"] = next(iter(choices)) if len(choices) == 1 else None
        entity["identity_status"] = (
            "verified" if len(choices) == 1 else "ambiguous" if choices else "unmapped"
        )
    return normalized


class Provider(Protocol):
    def fetch(self, slate: date, game_id: str | None = None) -> LiveFetch: ...


def poll_once(engine: Engine, provider: Provider, *, now: datetime | None = None) -> int:
    """At most one scoreboard and three selected boxes; timing survives worker restarts."""
    supplied_time = now is not None
    now = now or datetime.now(UTC)
    with feed_lock(engine) as locked:
        if not locked:
            return 0
        with Session(engine) as session:
            leases = list(
                session.scalars(
                    select(LiveLease)
                    .where(LiveLease.expires_at > now)
                    .order_by(LiveLease.created_at, LiveLease.id)
                    .limit(MAX_LEASES)
                )
            )
            if not leases:
                return 0
            feed = session.get(LiveFeed, "espn")
            if feed and (
                feed.status in {"access_denied", "storage_limit"} or aware(feed.next_poll_at) > now
            ):
                return 0
            if not feed:
                feed = LiveFeed(
                    namespace="espn",
                    next_poll_at=now,
                    failures=0,
                    requests=0,
                    bytes_received=0,
                    cycles=0,
                )
                session.add(feed)
            storage = (
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
            count = session.scalar(select(func.count()).select_from(LiveObservation)) or 0
            # Reserve the maximum cycle before I/O, with append-only evidence retained.
            if storage + 14 * 1024 * 1024 > MAX_CONTENT_BYTES or count + 4 > MAX_OBSERVATIONS:
                feed.status = "storage_limit"
                session.commit()
                return 0
            dates = sorted({x.slate_date for x in leases})
            slate_str = dates[feed.cycles % len(dates)]
            slate = date.fromisoformat(slate_str)
            candidates = sorted(
                {x.game_id for x in leases if x.slate_date == slate_str and x.game_id}
            )
            feed.cycles += 1
            # Reserve a full cycle (including its bounded I/O) before acquisition.
            feed.next_poll_at = now + timedelta(seconds=100)
            feed.last_poll_at = now
            session.commit()
        calls = 0
        failure: LiveProviderError | None = None
        game_hashes: dict[str, str] = {}
        resources: list[str | None] = [None]
        for game_id in resources:
            resource = f"game:{game_id}" if game_id else f"slate:{slate}"
            with Session(engine) as session:
                feed = session.get(LiveFeed, "espn")
                assert feed
                feed.requests += 1  # Persist attempts before I/O, including failures.
                attempt_time = now if supplied_time else datetime.now(UTC)
                feed.next_poll_at = max(
                    aware(feed.next_poll_at), attempt_time + timedelta(seconds=60)
                )
                session.commit()
            calls += 1
            try:
                result = provider.fetch(slate, game_id)
                with Session(engine) as session:
                    normalized = bind_identities(session, result.normalized)
                    if game_id is not None:
                        normalized["scoreboard_game_sha256"] = game_hashes[game_id]
                    # Bind content to parser + resolved crosswalk as well as source bytes.
                    import json

                    digest = hashlib.sha256(
                        result.raw
                        + LIVE_PARSER_VERSION.encode()
                        + json.dumps(normalized, sort_keys=True).encode()
                    ).hexdigest()
                    if not session.get(LiveContent, digest):
                        new_size = len(result.raw) + len(json.dumps(normalized).encode())
                        stored_size = (
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
                        if stored_size + new_size > MAX_CONTENT_BYTES:
                            raise LiveProviderError("storage_limit", size=len(result.raw))
                        session.add(
                            LiveContent(
                                sha256=digest,
                                raw_bytes=result.raw,
                                normalized_json=normalized,
                                parser_version=LIVE_PARSER_VERSION,
                            )
                        )
                        session.flush()
                    session.add(
                        LiveObservation(
                            resource=resource,
                            content_sha256=digest,
                            acquired_at=now if supplied_time else datetime.now(UTC),
                            source_time=result.source_time,
                            http_date=result.http_date,
                        )
                    )
                    feed = session.get(LiveFeed, "espn")
                    assert feed
                    feed.bytes_received += len(result.raw)
                    feed.last_success_at = now if supplied_time else datetime.now(UTC)
                    session.commit()
                    if game_id is None:
                        observed = {g["source_id"]: g["status"] for g in normalized["games"]}
                        game_hashes = {
                            g["source_id"]: hashlib.sha256(
                                json.dumps(g, sort_keys=True).encode()
                            ).hexdigest()
                            for g in normalized["games"]
                        }
                        eligible = []
                        for candidate in candidates:
                            if observed.get(candidate) not in {"in_progress", "final"}:
                                continue
                            previous = latest(session, f"game:{candidate}")
                            previous_content = (
                                session.get(LiveContent, previous.content_sha256)
                                if previous
                                else None
                            )
                            # Finals refresh only when the scoreboard content changes.
                            if (
                                observed[candidate] == "final"
                                and previous_content
                                and previous_content.normalized_json.get("scoreboard_game_sha256")
                                == game_hashes[candidate]
                            ):
                                continue
                            eligible.append(candidate)
                        offset = (
                            ((feed.cycles - 1) // len(dates)) * 3 % len(eligible) if eligible else 0
                        )
                        resources.extend((eligible[offset:] + eligible[:offset])[:3])
            except LiveProviderError as exc:
                failure = exc
                with Session(engine) as session:
                    feed = session.get(LiveFeed, "espn")
                    assert feed
                    feed.bytes_received += exc.size
                    session.commit()
                break  # No immediate retry or further calls after a failure.
        with Session(engine) as session:
            feed = session.get(LiveFeed, "espn")
            assert feed
            if failure:
                feed.failures += 1
                delay = max((120, 240, 600)[min(feed.failures - 1, 2)], failure.retry_after)
                feed.next_poll_at = now + timedelta(seconds=delay)
                feed.status = (
                    "access_denied"
                    if failure.denied
                    else "storage_limit"
                    if str(failure) == "storage_limit"
                    else "source_error"
                )
                feed.error = str(failure)[:100]
            else:
                feed.failures = 0
                feed.status = "observed"
                feed.error = None
                feed.next_poll_at = (now if supplied_time else datetime.now(UTC)) + timedelta(
                    seconds=60
                )
            session.commit()
        return calls
