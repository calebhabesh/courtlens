"""Bounded provider facts and explicit provisional/missingness semantics."""

import re
from datetime import date, datetime
from typing import Any, Literal
from zoneinfo import ZoneInfo

from pydantic import BaseModel, ConfigDict, Field


class LiveSubscription(BaseModel):
    model_config = ConfigDict(extra="forbid")
    slate_date: date
    game_id: str | None = Field(default=None, pattern=r"^[0-9]{1,20}$")


class LiveTeam(BaseModel):
    source_id: str
    canonical_id: str | None = None
    identity_status: str = "unmapped"
    name: str
    side: Literal["home", "away"]
    score: int | None


class LiveGame(BaseModel):
    source_id: str
    canonical_id: str | None = None
    identity_status: str = "unmapped"
    namespace: str = "espn"
    slate_date: date
    event_time: datetime
    status: Literal["scheduled", "in_progress", "final", "postponed", "cancelled", "unknown"]
    period: int | None
    clock: str | None
    teams: list[LiveTeam]
    provisional: bool = True


def parse_game(event: dict[str, Any], slate: date) -> LiveGame:
    comp = event.get("competitions", [event])[0]
    status = comp.get("status", event.get("status", {}))
    typ = status.get("type", {})
    name = typ.get("name", "")
    normalized = (
        "postponed"
        if name == "STATUS_POSTPONED"
        else "cancelled"
        if name in {"STATUS_CANCELED", "STATUS_CANCELLED"}
        else "final"
        if typ.get("completed") is True
        else "in_progress"
        if typ.get("state") == "in"
        else "scheduled"
        if name == "STATUS_SCHEDULED"
        else "unknown"
    )
    teams = []
    for c in comp.get("competitors", []):
        raw_score = c.get("score")
        score = (
            int(raw_score)
            if normalized in {"in_progress", "final"} and raw_score is not None
            else None
        )
        teams.append(
            LiveTeam(
                source_id=str(c["team"]["id"]),
                name=c["team"].get("displayName", "Unknown"),
                side=c["homeAway"],
                score=score,
            )
        )
    if (
        len(teams) != 2
        or {t.side for t in teams} != {"home", "away"}
        or len({t.source_id for t in teams}) != 2
    ):
        raise ValueError("invalid competitor identities")
    period = status.get("period")
    if period is not None and (not isinstance(period, int) or period < 0 or period > 20):
        raise ValueError("invalid period")
    if any(t.score is not None and t.score < 0 for t in teams):
        raise ValueError("invalid score")
    game = LiveGame(
        source_id=str(event["id"]),
        slate_date=slate,
        event_time=comp.get("date", event.get("date")),
        status=normalized,
        period=period if normalized in {"in_progress", "final"} else None,
        clock=status.get("displayClock") if normalized == "in_progress" else None,
        teams=teams,
    )

    if (
        game.event_time.tzinfo is None
        or game.event_time.astimezone(ZoneInfo("America/New_York")).date() != slate
    ):
        raise ValueError("event/slate date mismatch")
    if game.clock is not None and not re.fullmatch(
        r"(?:[0-9]{1,2}:)?[0-9]{1,2}(?:\.[0-9]{1,2})?", game.clock
    ):
        raise ValueError("invalid clock")
    if not game.source_id.isdigit() or len(game.source_id) > 20:
        raise ValueError("invalid game ID")
    return game


def parse_scoreboard(payload: dict[str, Any], slate: date) -> dict[str, Any]:
    events = payload.get("events")
    if not isinstance(events, list) or len(events) > 30:
        raise ValueError("invalid scoreboard")
    games = [parse_game(e, slate) for e in events]
    if len({g.source_id for g in games}) != len(games):
        raise ValueError("duplicate game identities")
    return {
        "slate_date": slate.isoformat(),
        "games": [g.model_dump(mode="json") for g in games],
        "source_state": "observed" if games else "empty_slate",
    }


def parse_summary(payload: dict[str, Any], slate: date, game_id: str) -> dict[str, Any]:
    header = payload["header"]
    if str(header["id"]) != game_id:
        raise ValueError("summary identity mismatch")
    game = parse_game(header, slate)
    sections = payload.get("boxscore", {}).get("players")
    # Preserve provider-labelled display values; absent rows/sections never become zeros.
    if game.status not in {"in_progress", "final"}:
        sections = None
    players: list[dict[str, Any]] = []
    if sections:
        if not isinstance(sections, list) or len(sections) > 2:
            raise ValueError("invalid player sections")
        for section in sections:
            team_id = str(section["team"]["id"])
            if team_id not in {t.source_id for t in game.teams}:
                raise ValueError("player team identity mismatch")
            groups = section.get("statistics", [])
            if len(groups) > 20:
                raise ValueError("too many statistical groups")
            for group in groups:
                keys = group.get("keys") or group.get("labels")
                athletes = group.get("athletes", [])
                if not isinstance(keys, list) or len(athletes) > 40 or len(keys) > 100:
                    raise ValueError("invalid box statistic columns")
                for row in athletes:
                    values = row.get("stats", [])
                    if len(values) != len(keys) or len(set(keys)) != len(keys):
                        raise ValueError("box statistic columns mismatch")
                    nonappearance = row.get("didNotPlay")
                    players.append(
                        {
                            "source_id": str(row["athlete"]["id"]),
                            "namespace": "espn",
                            "team_source_id": team_id,
                            "name": row["athlete"].get("displayName", "Unknown"),
                            "canonical_id": None,
                            "identity_status": "unmapped",
                            "reported_nonappearance": nonappearance
                            if isinstance(nonappearance, bool)
                            else None,
                            "statistics": {
                                key: None
                                if nonappearance is True or value in {"", "--", None}
                                else str(value)
                                for key, value in zip(keys, values, strict=True)
                            },
                            "provisional": True,
                        }
                    )
    return {
        "game": game.model_dump(mode="json"),
        "players": players or None,
        "player_sections": sections if isinstance(sections, list) and sections else None,
        "team_sections": (payload.get("boxscore", {}).get("teams") or None)
        if game.status in {"in_progress", "final"}
        else None,
        "boxes_status": "observed" if sections else "unknown",
    }


class LiveCache(BaseModel):
    namespace: Literal["espn"]
    provisional: Literal[True]
    client_poll_seconds: Literal[60]
    capability: Literal["not_yet_observed", "not_configured"]
    status: Literal[
        "not_configured",
        "awaiting_first_observation",
        "observed",
        "source_error",
        "access_denied",
        "storage_limit",
    ]
    paused: bool
    active_leases: int
    stale: bool
    age_seconds: float | None
    last_success_at: datetime | None
    last_poll_at: datetime | None
    next_poll_at: datetime | None
    error: str | None
    requests: int
    bytes_received: int
    observation_id: str | None
    acquired_at: datetime | None
    source_time: str | None
    http_date: str | None
    content_sha256: str | None
    data: dict[str, Any] | None


class LiveLeaseResult(BaseModel):
    id: str
    expires_at: datetime
    heartbeat_seconds: Literal[60]
