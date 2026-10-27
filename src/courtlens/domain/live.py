"""Bounded provider facts and explicit provisional/missingness semantics."""

import re
from datetime import date, datetime
from typing import Any, Literal
from zoneinfo import ZoneInfo

from pydantic import BaseModel

LIVE_PARSER_VERSION = "espn-live-v4"
# ESPN shot coordinates are feet from the basket (x 0-50 across, basket at x=25); free throws
# and unknown spots carry a large sentinel instead.
MAX_COORDINATE = 100
MAX_PLAYS = 2000


class LiveTeam(BaseModel):
    source_id: str
    canonical_id: str | None = None
    identity_status: str = "unmapped"
    name: str
    side: Literal["home", "away"]
    score: int | None
    abbreviation: str | None = None
    record: str | None = None
    # Points per period as the source reports them; None where a period is unknown.
    linescores: list[int | None] | None = None
    winner: bool | None = None


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
    status_detail: str | None = None
    odds: dict[str, Any] | None = None


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
        played = normalized in {"in_progress", "final"}
        teams.append(
            LiveTeam(
                source_id=str(c["team"]["id"]),
                name=c["team"].get("displayName", "Unknown"),
                side=c["homeAway"],
                score=score,
                abbreviation=c["team"].get("abbreviation"),
                record=_record(c),
                linescores=[_int(x.get("displayValue", x.get("value"))) for x in c["linescores"]]
                if played and isinstance(c.get("linescores"), list)
                else None,
                winner=c["winner"]
                if normalized == "final" and isinstance(c.get("winner"), bool)
                else None,
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
        status_detail=typ.get("shortDetail") or typ.get("detail"),
        odds=_odds(comp.get("odds"), teams) if normalized == "scheduled" else None,
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


def _int(value: Any) -> int | None:
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return None


def _num(value: Any) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if number == number else None


def _record(competitor: dict[str, Any]) -> str | None:
    records = competitor.get("records") or competitor.get("record")
    if not isinstance(records, list):
        return None
    total = next((r for r in records if r.get("type") == "total"), records[0] if records else None)
    value = (total or {}).get("summary") or (total or {}).get("displayValue")
    return value if isinstance(value, str) else None


def _odds(entries: Any, teams: list["LiveTeam"]) -> dict[str, Any] | None:
    """The first listed book's line (ESPN lists one free book). Market prices, not ours."""
    if not isinstance(entries, list) or not entries or not isinstance(entries[0], dict):
        return None
    line = entries[0]
    home = line.get("homeTeamOdds") or {}
    away = line.get("awayTeamOdds") or {}
    provider = (line.get("provider") or {}).get("name")
    result = {
        "provider": provider if isinstance(provider, str) else None,
        "details": line.get("details") if isinstance(line.get("details"), str) else None,
        "spread": _num(line.get("spread")),
        "over_under": _num(line.get("overUnder")),
        "over_odds": _num(line.get("overOdds")),
        "under_odds": _num(line.get("underOdds")),
        "home_moneyline": _num(home.get("moneyLine")),
        "away_moneyline": _num(away.get("moneyLine")),
        "home_spread_odds": _num(home.get("spreadOdds")),
        "away_spread_odds": _num(away.get("spreadOdds")),
    }
    return result if any(v is not None for k, v in result.items() if k != "provider") else None


def _athlete(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _position(athlete: dict[str, Any]) -> str | None:
    position = _athlete(athlete.get("position")).get("abbreviation")
    return position if isinstance(position, str) else None


def parse_plays(plays: Any, sides: dict[str, str]) -> list[dict[str, Any]] | None:
    """Every play in source order, with the shot spot on field-goal attempts.

    The running score is the sum of scoring plays' values, not the source's per-play score,
    which can lag (MIN-CLE 2026-10-26: one free throw moved it 120 -> 123). `running_score`
    on the rows says which one is used; see `score_running`.
    """
    team_ids = set(sides)
    if not isinstance(plays, list):
        return None
    if len(plays) > MAX_PLAYS:
        raise ValueError("too many plays")
    rows: list[dict[str, Any]] = []
    for play in plays:
        team = str(_athlete(play.get("team")).get("id")) if play.get("team") else None
        if team is not None and team not in team_ids:
            raise ValueError("play team identity mismatch")
        kind = _athlete(play.get("type")).get("text") or ""
        shooting = play.get("shootingPlay") is True
        free_throw = shooting and "free throw" in f"{kind} {play.get('text', '')}".lower()
        coordinate = _athlete(play.get("coordinate"))
        x, y = _num(coordinate.get("x")), _num(coordinate.get("y"))
        spot = (
            shooting
            and not free_throw
            and x is not None
            and y is not None
            and abs(x) <= MAX_COORDINATE
            and abs(y) <= MAX_COORDINATE
        )
        participants = [
            str(_athlete(p.get("athlete")).get("id"))
            for p in play.get("participants") or []
            if _athlete(p.get("athlete")).get("id") is not None
        ]
        rows.append(
            {
                "id": str(play.get("id", len(rows))),
                "period": _int(_athlete(play.get("period")).get("number")),
                "clock": _athlete(play.get("clock")).get("displayValue"),
                "text": str(play.get("text") or kind),
                "type": kind,
                "team_source_id": team,
                "away_score": _int(play.get("awayScore")),
                "home_score": _int(play.get("homeScore")),
                "side": sides.get(team) if team else None,
                "scoring": play.get("scoringPlay") is True,
                "score_value": _int(play.get("scoreValue")),
                "shot": "free_throw" if free_throw else "field_goal" if shooting else None,
                "points_attempted": _int(play.get("pointsAttempted")) if shooting else None,
                "x": x if spot else None,
                "y": y if spot else None,
                "player_source_id": participants[0] if participants else None,
            }
        )
    return rows


def score_running(rows: list[dict[str, Any]], finals: dict[str, int | None]) -> str:
    """Replace per-play scores with the scoring-play sums when those reach the final score."""
    totals = {"home": 0, "away": 0}
    running = []
    for row in rows:
        if row["scoring"] and row["side"] in totals and row["score_value"] is not None:
            totals[row["side"]] += row["score_value"]
        running.append(dict(totals))
    if any(finals.get(side) is not None and finals[side] != totals[side] for side in totals):
        return "source"
    for row, score in zip(rows, running, strict=True):
        row["away_score"], row["home_score"] = score["away"], score["home"]
    return "scoring_plays"


def parse_leaders(groups: Any, team_ids: set[str]) -> list[dict[str, Any]] | None:
    if not isinstance(groups, list):
        return None
    leaders: list[dict[str, Any]] = []
    for group in groups:
        team = str(_athlete(group.get("team")).get("id"))
        if team not in team_ids:
            continue
        for category in group.get("leaders") or []:
            top = (category.get("leaders") or [None])[0]
            if not isinstance(top, dict):
                continue
            athlete = _athlete(top.get("athlete"))
            leaders.append(
                {
                    "team_source_id": team,
                    "category": category.get("name"),
                    "label": category.get("displayName"),
                    "value": top.get("displayValue"),
                    "source_id": str(athlete.get("id")),
                    "name": athlete.get("displayName", "Unknown"),
                    "position": _position(athlete),
                    "canonical_id": None,
                    "identity_status": "unmapped",
                }
            )
    return leaders


def parse_injuries(groups: Any, team_ids: set[str]) -> list[dict[str, Any]] | None:
    """Reported injuries per team; an empty list is the source's "none reported"."""
    if not isinstance(groups, list):
        return None
    teams: list[dict[str, Any]] = []
    for group in groups:
        team = str(_athlete(group.get("team")).get("id"))
        if team not in team_ids:
            continue
        players = []
        for row in group.get("injuries") or []:
            athlete = _athlete(row.get("athlete"))
            detail = _athlete(row.get("details"))
            players.append(
                {
                    "source_id": str(athlete.get("id")),
                    "name": athlete.get("displayName", "Unknown"),
                    "position": _position(athlete),
                    "status": row.get("status"),
                    "detail": detail.get("type") or detail.get("detail"),
                    "canonical_id": None,
                    "identity_status": "unmapped",
                }
            )
        teams.append({"team_source_id": team, "players": players})
    return teams


def parse_info(payload: dict[str, Any]) -> dict[str, Any]:
    info = _athlete(payload.get("gameInfo"))
    venue = _athlete(info.get("venue"))
    address = _athlete(venue.get("address"))
    broadcasts = []
    for row in payload.get("broadcasts") or []:
        name = _athlete(row.get("media")).get("shortName") or row.get("station")
        if isinstance(name, str) and name not in broadcasts:
            broadcasts.append(name)
    return {
        "venue": venue.get("fullName"),
        "city": address.get("city"),
        "state": address.get("state"),
        "attendance": _int(info.get("attendance")) or None,
        "officials": [
            o["displayName"]
            for o in info.get("officials") or []
            if isinstance(o, dict) and o.get("displayName")
        ],
        "broadcasts": broadcasts,
    }


def parse_injury_feed(payload: dict[str, Any]) -> dict[str, Any]:
    """ESPN's league injury report by ESPN team id (status as reported, e.g. Out)."""
    groups = payload.get("injuries")
    if not isinstance(groups, list) or len(groups) > 40:
        raise ValueError("invalid injury report")
    teams: dict[str, list[dict[str, Any]]] = {}
    for group in groups:
        players = []
        for row in group.get("injuries") or []:
            athlete = _athlete(row.get("athlete"))
            players.append(
                {
                    "source_id": str(row.get("id", "")),
                    "name": athlete.get("displayName", "Unknown"),
                    "position": _position(athlete),
                    "status": row.get("status"),
                }
            )
        teams[str(group.get("id"))] = players
    return {"teams": teams}


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
        "calendar": _calendar(payload),
    }


def _calendar(payload: dict[str, Any]) -> list[str] | None:
    """The season phase's game dates (Eastern), as the scoreboard lists them."""
    leagues = payload.get("leagues")
    if not isinstance(leagues, list) or not leagues or not isinstance(leagues[0], dict):
        return None
    days = leagues[0].get("calendar")
    if not isinstance(days, list) or leagues[0].get("calendarType") != "day":
        return None
    eastern = ZoneInfo("America/New_York")
    out = set()
    for day in days[:400]:
        try:
            out.add(
                datetime.fromisoformat(str(day).replace("Z", "+00:00"))
                .astimezone(eastern)
                .date()
                .isoformat()
            )
        except ValueError:
            continue
    return sorted(out)


def parse_summary(payload: dict[str, Any], slate: date, game_id: str) -> dict[str, Any]:
    header = payload["header"]
    if str(header["id"]) != game_id:
        raise ValueError("summary identity mismatch")
    game = parse_game(header, slate)
    team_ids = {t.source_id for t in game.teams}
    played = game.status in {"in_progress", "final"}
    plays = (
        parse_plays(payload.get("plays"), {t.source_id: t.side for t in game.teams})
        if played
        else None
    )
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
                    nonappearance = row.get("didNotPlay")
                    # Active ESPN summaries report DNP rows without any stat values.
                    # Only that explicit source form can supply null columns.
                    if nonappearance is True and values == []:
                        values = [None] * len(keys)
                    if len(values) != len(keys) or len(set(keys)) != len(keys):
                        raise ValueError("box statistic columns mismatch")
                    players.append(
                        {
                            "source_id": str(row["athlete"]["id"]),
                            "namespace": "espn",
                            "team_source_id": team_id,
                            "name": row["athlete"].get("displayName", "Unknown"),
                            "short_name": row["athlete"].get("shortName"),
                            "position": _position(row["athlete"]),
                            "jersey": row["athlete"].get("jersey"),
                            "starter": row.get("starter")
                            if isinstance(row.get("starter"), bool)
                            else None,
                            "dnp_reason": row.get("reason") if nonappearance is True else None,
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
        "team_totals": _team_totals(sections) if sections else None,
        "plays": plays,
        "play_scores": score_running(plays, {t.side: t.score for t in game.teams})
        if plays
        else None,
        "leaders": parse_leaders(payload.get("leaders"), team_ids) if played else None,
        "injuries": parse_injuries(payload.get("injuries"), team_ids),
        "odds": _odds(payload.get("pickcenter"), game.teams),
        "info": parse_info(payload),
    }


def _team_totals(sections: list[dict[str, Any]]) -> dict[str, dict[str, str | None]]:
    totals: dict[str, dict[str, str | None]] = {}
    for section in sections:
        group = (section.get("statistics") or [{}])[0]
        keys, values = group.get("keys") or [], group.get("totals") or []
        if len(keys) == len(values):
            totals[str(section["team"]["id"])] = {
                k: (None if v in {"", "--", None} else str(v))
                for k, v in zip(keys, values, strict=True)
            }
    return totals


class LiveCache(BaseModel):
    """One cached ESPN read: a date's slate or one game's summary.

    `final` means every game in it was final when read; a final read is kept as hashed,
    append-only evidence (`observation_id`, `content_sha256`). Earlier reads live only in the
    mutable current cache. `refresh_seconds` tells a visible client when to read again (None:
    nothing left to change).
    """

    namespace: Literal["espn"]
    resource: str
    status: Literal["observed", "source_error", "unavailable"]
    final: bool
    stale: bool
    age_seconds: float | None
    acquired_at: datetime | None
    source_time: str | None
    http_date: str | None
    refresh_seconds: int | None
    error: str | None
    observation_id: str | None
    content_sha256: str | None
    data: dict[str, Any] | None
