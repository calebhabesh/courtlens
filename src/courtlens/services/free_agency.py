"""Operator-acquired, sealed NBA.com free-agent tracker snapshots. Visitor requests never fetch.

`courtlens refresh-free-agency` retains the tracker page (receipt, robots and raw bytes) and seals
one content-addressed bundle per observation. Status is NBA.com's as observed; deal terms are not
on the source and stay unknown.
"""

from __future__ import annotations

import hashlib
import json
import re
from dataclasses import dataclass, field
from datetime import UTC, date, datetime, timedelta
from pathlib import Path
from typing import Any

import httpx
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from courtlens.config import get_settings
from courtlens.domain.teams import get_team_info
from courtlens.evaluation.impact_rating_inputs import write_artifact
from courtlens.ingestion.free_agency import URL_PATTERN, parse_tracker, tracker_url
from courtlens.player_context_models import PlayerContextDataset
from courtlens.services.bref_identity import normalize_name
from courtlens.services.espn_rosters import ATTRIBUTION as ATTRIBUTION_ROSTERS
from courtlens.services.espn_rosters import last_checked
from courtlens.services.espn_rosters import load_latest as load_latest_rosters
from courtlens.services.player_context import dataset_rows
from courtlens.services.source_acquisition import ScheduledFetcher, retain
from courtlens.services.wikipedia_transactions import ATTRIBUTION as ATTRIBUTION_MOVES
from courtlens.services.wikipedia_transactions import last_checked as moves_checked
from courtlens.services.wikipedia_transactions import load_latest as load_latest_moves
from courtlens.workbench_models import WorkbenchArtifact

VERSION = "courtlens-free-agency-v1"
SOURCE = "nba_free_agent_tracker"
RESOURCE = "free_agency"
ATTRIBUTION = "NBA.com free-agent tracker"
INTERVAL_SECONDS = 3.0
LIMITATIONS = [
    "The free-agent class, UFA/RFA, option flags, age and per-game figures are NBA.com's tracker "
    "as observed. NBA.com records each move once and does not revisit it.",
    "Current status and team apply Wikipedia's dated moves (signings, two-way deals, waivers, "
    "camp cuts, signings abroad, retirements) after NBA.com's tracker, then the newest roster "
    "source (ESPN's 30 team rosters every 6 hours, or else the NBA player index): the roster "
    "decides who is on a team unless Wikipedia's move is dated the same day or later. NBA.com's "
    "own status stays beside the current one.",
    "Wikipedia gives no dates for training-camp cuts; a cut is placed after the player's last "
    "signing with that team. Players whose name matches more than one Wikipedia entry keep "
    "NBA.com's status.",
    "Deal terms are not on the source and stay unknown; they are never zero.",
    "Per-game points, rebounds and assists are NBA.com's prior-season figures on the tracker.",
    "Returned means the same team before and after (re-signed or option exercised); Signed "
    "means a different team.",
    "Retired means NBA.com's note or Wikipedia's retirement list says so; retired players are "
    "left out of the tracked counts.",
]
_RETIRED = re.compile(r"\bretire", re.IGNORECASE)


def validate_tracker_url(source: str, url: str, season: str) -> float:
    match = URL_PATTERN.fullmatch(url)
    if source != SOURCE or match is None or match[1] != season:
        raise ValueError("not an NBA.com free-agent tracker URL for this class")
    return INTERVAL_SECONDS


class TrackerFetcher(ScheduledFetcher):
    def __init__(self, session: Session, root: Path, client: httpx.Client) -> None:
        super().__init__(
            session,
            root,
            client,
            resource=RESOURCE,
            kinds={SOURCE: "free_agent_tracker_page"},
            validate_url=validate_tracker_url,
            max_bytes=3_000_000,
        )


def seal(entry: dict[str, Any], output: Path) -> Path:
    sealed = {
        "version": VERSION,
        "source": {
            "name": ATTRIBUTION,
            "host": "www.nba.com",
            "policy": "courtlens-source-policy-v3",
            "limitations": LIMITATIONS,
        },
        "sealed_at": datetime.now(UTC).isoformat(),
        "entry": entry,
    }
    path, _ = write_artifact(output, sealed)
    return path


def refresh(
    session: Session, root: Path, client: httpx.Client, year: int, output: Path
) -> tuple[Path, dict[str, Any]]:
    url = tracker_url(year)
    receipt = TrackerFetcher(session, root, client).fetch(SOURCE, url, str(year))
    session.commit()
    if receipt.status != "success" or not receipt.artifact_id or receipt.finished_at is None:
        raise ValueError(f"free-agent tracker {year}: {receipt.error_summary}; no bundle sealed")
    artifact = session.get(WorkbenchArtifact, receipt.artifact_id)
    if artifact is None:
        raise ValueError("tracker receipt lost its retained artifact")
    raw = (root / artifact.storage_path).read_bytes()
    if hashlib.sha256(raw).hexdigest() != artifact.sha256:
        raise ValueError("retained tracker bytes changed")
    board = parse_tracker(raw, year)
    entry = {
        **board,
        "url": url,
        "raw_sha256": artifact.sha256,
        "acquisition_id": str(receipt.id),
        "capture": "scheduled_fetch",
        "observed_at": receipt.finished_at.isoformat(),
    }
    counts = {s: sum(p["status"] == s for p in board["players"]) for s in STATUSES}
    return seal(entry, output), {"year": year, "players": len(board["players"]), **counts}


def import_page(
    session: Session, root: Path, page: Path, year: int, observed_at: datetime, output: Path
) -> tuple[Path, dict[str, Any]]:
    """Operator import of the tracker page saved in a browser.

    NBA.com answers CourtLens' identifying user agent with HTTP 403, which ends a scheduled run
    (no evasion). The operator's own saved copy is retained byte for byte and sealed with the
    time it was saved, like the other operator imports from nba.com.
    """
    if observed_at.tzinfo is None:
        raise ValueError("observed_at must include a timezone")
    raw = page.read_bytes()
    board = parse_tracker(raw, year)
    artifact = retain(raw, root, RESOURCE, ATTRIBUTION, session, "text/html")
    session.commit()
    entry = {
        **board,
        "url": tracker_url(year),
        "raw_sha256": artifact.sha256,
        "acquisition_id": None,
        "capture": "operator_import",
        "observed_at": observed_at.isoformat(),
    }
    counts = {s: sum(p["status"] == s for p in board["players"]) for s in STATUSES}
    return seal(entry, output), {"year": year, "players": len(board["players"]), **counts}


STATUSES = ("unsigned", "signed", "returned")
_verified: dict[Path, tuple[tuple[int, int, int], dict[str, Any]]] = {}


def load_free_agency_store() -> dict[str, Any] | None:
    path = get_settings().free_agency_manifest
    if path is None or not path.exists():
        return None
    try:
        stat = path.stat()
        signature = (stat.st_ino, stat.st_size, stat.st_mtime_ns)
        cached = _verified.get(path)
        if cached and cached[0] == signature:
            return cached[1]
        raw = path.read_bytes()
        if hashlib.sha256(raw).hexdigest() != path.stem:
            raise ValueError("free-agency artifact content address changed")
        body: dict[str, Any] = json.loads(raw)
        if body.get("version") != VERSION:
            raise ValueError("unsupported free-agency artifact version")
        _verified[path] = (signature, body)
        return body
    except (ValueError, OSError) as exc:
        raise HTTPException(status_code=503, detail="Free-agency integrity check failed") from exc


def _tricode(team_id: str | None) -> str | None:
    info = get_team_info(team_id) if team_id else None
    return info.tricode if info else None


@dataclass(frozen=True)
class _IndexPeople:
    teams: dict[str, str | None]
    # Active players' names: the population a Wikipedia name is checked against.
    active: dict[str, str]


_index_cache: dict[Any, _IndexPeople] = {}


def _latest_index(session: Session) -> tuple[_IndexPeople, dict[str, Any] | None]:
    index = session.scalars(
        select(PlayerContextDataset)
        .where(PlayerContextDataset.kind == "player_index")
        .order_by(
            PlayerContextDataset.observed_at.desc(), PlayerContextDataset.observation_order.desc()
        )
        .limit(1)
    ).first()
    if index is None:
        return _IndexPeople({}, {}), None
    people = _index_cache.get(index.id)
    if people is None:
        # Datasets are immutable, so one read per sealed index serves every request.
        rows = dataset_rows(session, index)
        people = _IndexPeople(
            teams={str(r["player_id"]): r.get("team_id") or None for r in rows},
            active={
                str(r["player_id"]): r["name"]
                for r in rows
                if r.get("roster_status") == "active" and r.get("name")
            },
        )
        _index_cache.clear()
        _index_cache[index.id] = people
    return people, {
        "source": "NBA player index",
        "dataset_id": index.id,
        "observed_at": index.observed_at.isoformat(),
    }


def _player_index(session: Session) -> tuple[dict[str, str | None], dict[str, Any] | None]:
    """The latest NBA player index: each listed player's roster team (None when on no roster)."""
    people, info = _latest_index(session)
    return people.teams, info


@dataclass(frozen=True)
class Rosters:
    """Who is on which NBA roster now, from the newest of the two roster sources.

    `teams` maps NBA player ids to their roster team (None: listed, on no roster). With
    `complete`, every rostered player is listed, so a player absent from `teams` is on no
    roster, unless their normalized name is among `unresolved` (an ESPN athlete we could not
    match, who might be them).
    """

    teams: dict[str, str | None]
    complete: bool
    unresolved: frozenset[str]
    info: dict[str, Any] | None


def roster_index(session: Session) -> Rosters:
    teams, info = _player_index(session)
    latest = load_latest_rosters()
    checked = last_checked(*latest) if latest is not None else None
    if latest is not None and checked and (info is None or checked > info["observed_at"]):
        path, body = latest
        entry = body["entry"]
        players = entry["players"]
        return Rosters(
            teams={p["player_id"]: p["team_id"] for p in players if p["player_id"]},
            complete=True,
            unresolved=frozenset(p["normalized_name"] for p in players if not p["player_id"]),
            info={
                "source": ATTRIBUTION_ROSTERS,
                "manifest_sha256": path.stem,
                # The last run that confirmed these rosters (unchanged runs seal nothing).
                "observed_at": checked,
                "sealed_at": entry["observed_at"],
                "season": entry["season"],
                "players": len(players),
                "unmatched": sorted(p["name"] for p in players if not p["player_id"]),
            },
        )
    return Rosters(teams=teams, complete=False, unresolved=frozenset(), info=info)


def roster_team(player: dict[str, Any], rosters: Rosters) -> tuple[bool, str | None]:
    """(known, team): whether the roster source speaks for this player, and their team."""
    if player["player_id"] in rosters.teams:
        return True, rosters.teams[player["player_id"]]
    if rosters.complete and normalize_name(player["name"]) not in rosters.unresolved:
        return True, None
    return False, None


def roster_check(player: dict[str, Any], rosters: Rosters) -> str | None:
    """How the roster source compares with NBA.com's status; None when it can't speak for them.

    `agrees`; `not_on_roster` (signed or returned, but on no NBA roster now); `other_team`
    (signed or returned, now on another team); `on_roster` (unsigned, but on a roster now).
    """
    known, team = roster_team(player, rosters)
    if not known:
        return None
    if player["status"] == "unsigned":
        return "on_roster" if team else "agrees"
    if team is None:
        return "not_on_roster"
    return "agrees" if team == player["new_team_id"] else "other_team"


# Same-day order: a signing, then a waiver or cut, then a retirement (a one-day contract to
# retire with a team is a signing and a retirement on the same date). An undated cut sorts
# just after its team's latest signing.
_ORDER = {"signed": 0, "two_way": 0, "abroad": 0, "waived": 1, "cut": 1, "retired": 2}
# ESPN's rosters can trail a move by a day; a Wikipedia move this recent outranks the roster.
ROSTER_LAG = timedelta(days=1)


def latest_move(events: list[dict[str, Any]]) -> dict[str, Any] | None:
    """The player's most recent move on Wikipedia; undated cuts follow their team's signing."""
    signed: dict[str | None, str] = {}
    for event in events:
        if event["kind"] in ("signed", "two_way") and event["date"]:
            team = event["team_id"]
            signed[team] = max(signed.get(team, ""), event["date"])
    ordered = []
    for index, event in enumerate(events):
        if event["kind"] == "unsigned":
            continue
        day = event["date"] or (signed.get(event["team_id"], "") if event["kind"] == "cut" else "")
        ordered.append((day, _ORDER[event["kind"]], index))
    if not ordered:
        return None
    return events[max(ordered)[2]]


@dataclass(frozen=True)
class Moves:
    """Wikipedia moves per normalized player name; names shared by two entries are ambiguous."""

    events: dict[str, list[dict[str, Any]]]
    ambiguous: frozenset[str]
    info: dict[str, Any] | None
    # Each Wikipedia player (article key) by normalized name, for the nickname fallback.
    by_key: dict[str, list[dict[str, Any]]] = field(default_factory=dict)


def moves_index() -> Moves:
    latest = load_latest_moves()
    if latest is None:
        return Moves({}, frozenset(), None, {})
    path, body = latest
    entry = body["entry"]
    keys: dict[str, set[str]] = {}
    by_key: dict[str, list[dict[str, Any]]] = {}
    for event in entry["events"]:
        by_key.setdefault(event["key"], []).append(event)
        for name in (event["key"], event["name"]):
            keys.setdefault(normalize_name(name), set()).add(event["key"])
    events = {name: by_key[next(iter(k))] for name, k in keys.items() if len(k) == 1}
    return Moves(
        events=events,
        ambiguous=frozenset(name for name, k in keys.items() if len(k) > 1),
        info={
            "source": ATTRIBUTION_MOVES,
            "url": entry["url"],
            "revision_id": entry["revision_id"],
            "manifest_sha256": path.stem,
            "observed_at": moves_checked(path, body),
            "sealed_at": entry["observed_at"],
            "events": len(entry["events"]),
        },
        by_key={normalize_name(key): events for key, events in by_key.items()},
    )


# Given names that are the same person but neither starts with the other (prefixes such as
# Herb/Herbert, Nic/Nicolas or Cam/Cameron already match).
NICKNAMES = frozenset(
    frozenset(pair)
    for pair in (
        ("moe", "moritz"),
        ("bub", "carlton"),
        ("nick", "nicolas"),
        ("kenny", "kenneth"),
        ("mike", "michael"),
        ("jimmy", "james"),
        ("jim", "james"),
        ("bill", "william"),
        ("bob", "robert"),
        ("bobby", "robert"),
        ("tony", "anthony"),
    )
)


def _same_given_name(a: str, b: str) -> bool:
    """Whether two first names can be one person: equal, a nickname prefix, or a known pair."""
    if a == b or frozenset((a, b)) in NICKNAMES:
        return True
    short, long = sorted((a, b), key=len)
    return len(short) >= 3 and long.startswith(short)


def _given_and_surname(name: str) -> tuple[str, str] | None:
    tokens = name.split()
    return (tokens[0], " ".join(tokens[1:])) if len(tokens) >= 2 else None


@dataclass(frozen=True)
class MoveMatch:
    """Wikipedia events per NBA player id, and the names left unmatched as ambiguous."""

    events: dict[str, list[dict[str, Any]]]
    ambiguous: list[str]


def match_moves(
    moves: Moves,
    players: dict[str, str],
    population: dict[str, str],
    teams: dict[str, set[str]],
) -> MoveMatch:
    """Give each player (id -> name) their Wikipedia moves, never someone else's.

    Wikipedia has no NBA ids, so moves match by name, guarded both ways:
    - Same name, two players: `population` (id -> name: active players, the tracker class and
      the requested players) holds everyone a name could mean. When it names more than one,
      the moves go to the one whose `teams` (roster and tracker teams) a move names; otherwise
      to no one, and the name is reported.
    - Spelling: with no exact name, a nickname of the same surname (Herb/Herbert, Moe/Moritz)
      matches only when exactly one Wikipedia player and exactly one person in the population
      fit, so a guess between two people is never made.
    """
    by_name: dict[str, set[str]] = {}
    by_surname: dict[str, list[tuple[str, str]]] = {}
    for pid, name in {**population, **players}.items():
        norm = normalize_name(name)
        by_name.setdefault(norm, set()).add(pid)
        if parts := _given_and_surname(norm):
            by_surname.setdefault(parts[1], []).append((pid, parts[0]))
    wiki_by_surname: dict[str, list[tuple[str, str]]] = {}
    for norm in moves.by_key:
        if norm not in moves.ambiguous and (parts := _given_and_surname(norm)):
            wiki_by_surname.setdefault(parts[1], []).append((norm, parts[0]))

    found: dict[str, list[dict[str, Any]]] = {}
    ambiguous: list[str] = []
    for pid, name in players.items():
        norm = normalize_name(name)
        if norm in moves.ambiguous:
            ambiguous.append(name)
            continue
        events = moves.events.get(norm)
        if events is None and (parts := _given_and_surname(norm)):
            given, surname = parts
            fits = [w for w, g in wiki_by_surname.get(surname, []) if _same_given_name(given, g)]
            if len(fits) == 1 and fits[0] not in by_name:
                wiki_given = fits[0].split()[0]
                people = {
                    p for p, g in by_surname.get(surname, []) if _same_given_name(g, wiki_given)
                }
                if people == {pid}:
                    events = moves.by_key[fits[0]]
        if events is None:
            continue
        rivals = by_name.get(norm, set()) - {pid}
        if rivals:
            named = {e["team_id"] for e in events if e.get("team_id")}
            if not (teams.get(pid, set()) & named) or any(
                teams.get(r, set()) & named for r in rivals
            ):
                ambiguous.append(name)
                continue
        found[pid] = events
    return MoveMatch(found, ambiguous)


def _player_moves(
    session: Session,
    moves: Moves,
    rosters: Rosters,
    tracker: list[dict[str, Any]],
    names: dict[str, str],
) -> MoveMatch:
    """`match_moves` with the population and team evidence both pages share."""
    people, _ = _latest_index(session)
    population = {**people.active, **{str(p["player_id"]): p["name"] for p in tracker}}
    teams: dict[str, set[str]] = {}
    for pid in {**population, **names}:
        team = rosters.teams.get(pid) or people.teams.get(pid)
        teams[pid] = {team} if team else set()
    for p in tracker:
        teams[str(p["player_id"])] |= {t for t in (p["old_team_id"], p["new_team_id"]) if t}
    return match_moves(moves, names, population, teams)


def _recent(move: dict[str, Any] | None, rosters: Rosters) -> bool:
    """Whether a Wikipedia move is dated late enough to outrank the roster source."""
    checked = (rosters.info or {}).get("observed_at")
    return (
        move is not None
        and move["date"] is not None
        and checked is not None
        and date.fromisoformat(move["date"]) >= datetime.fromisoformat(checked).date() - ROSTER_LAG
    )


def current_status(
    player: dict[str, Any], move: dict[str, Any] | None, rosters: Rosters
) -> dict[str, Any]:
    """NBA.com's status, then Wikipedia's latest move, then the roster (see LIMITATIONS)."""
    status, team, source = player["status"], player["new_team_id"], "nba"
    retired = False
    if move is not None:
        kind = move["kind"]
        if kind in ("signed", "two_way") and move["team_id"]:
            team, source = move["team_id"], "wikipedia"
            status = "returned" if team == player["old_team_id"] else "signed"
        elif kind in ("waived", "cut"):
            status, team, source = "unsigned", None, "wikipedia"
        elif kind == "abroad":
            status, team, source = "abroad", None, "wikipedia"
        elif kind == "retired":
            retired, source = True, "wikipedia"
    known, roster = roster_team(player, rosters)
    recent = _recent(move, rosters)
    if known and roster != team and not recent and not retired:
        team, source = roster, "roster"
        status = (
            "unsigned"
            if roster is None
            else "returned"
            if roster == player["old_team_id"]
            else "signed"
        )
    return {"status": status, "team_id": team, "source": source, "retired": retired}


def free_agency_view(session: Session) -> dict[str, Any]:
    """The installed snapshot with team codes and the roster cross-check; `not_configured` when
    none is sealed."""
    store = load_free_agency_store()
    path = get_settings().free_agency_manifest
    if store is None or path is None:
        return {"status": "not_configured", "source": ATTRIBUTION, "limitations": LIMITATIONS}
    entry = store["entry"]
    rosters = roster_index(session)
    moves = moves_index()
    players = []
    matched = _player_moves(
        session,
        moves,
        rosters,
        entry["players"],
        {str(p["player_id"]): p["name"] for p in entry["players"]},
    )
    unmatched = matched.ambiguous if moves.info is not None else []
    for p in entry["players"]:
        _, team = roster_team(p, rosters)
        move = latest_move(matched.events.get(str(p["player_id"]), []))
        now = current_status(p, move, rosters)
        players.append(
            {
                **p,
                "old_team_tricode": _tricode(p["old_team_id"]),
                "new_team_tricode": _tricode(p["new_team_id"]),
                "retired": bool(p.get("note") and _RETIRED.search(p["note"])) or now["retired"],
                "roster_team_id": team,
                "roster_team_tricode": _tricode(team),
                "roster_check": roster_check(p, rosters),
                "current_status": now["status"],
                "current_team_id": now["team_id"],
                "current_team_tricode": _tricode(now["team_id"]),
                "status_source": now["source"],
                "changed": (now["status"], now["team_id"]) != (p["status"], p["new_team_id"]),
                "latest_move": (
                    {
                        **{k: move.get(k) for k in ("kind", "date", "club", "country")},
                        "team_id": move["team_id"],
                        "team_tricode": _tricode(move["team_id"]),
                    }
                    if move
                    else None
                ),
            }
        )
    return {
        "status": "available",
        "source": ATTRIBUTION,
        "version": VERSION,
        "manifest_sha256": path.stem,
        "year": entry["year"],
        "url": entry["url"],
        "observed_at": entry["observed_at"],
        "capture": entry["capture"],
        "raw_sha256": entry["raw_sha256"],
        "roster_index": rosters.info,
        "moves": moves.info and {**moves.info, "ambiguous": sorted(unmatched)},
        "limitations": LIMITATIONS,
        "players": players,
    }


def _placement(
    state: str, team: str | None, source: str, move: dict[str, Any] | None, rosters: Rosters
) -> dict[str, Any]:
    roster_source = (rosters.info or {}).get("source")
    return {
        "state": state,
        "team_id": team if state == "team" else None,
        "team_tricode": _tricode(team) if state == "team" else None,
        "source": {
            "wikipedia": ATTRIBUTION_MOVES,
            "roster": roster_source,
            "nba": ATTRIBUTION,
        }.get(source, source),
        "as_of": (rosters.info or {}).get("observed_at") if source == "roster" else None,
        "move": (
            {
                **{k: move.get(k) for k in ("kind", "date", "club", "country")},
                "team_tricode": _tricode(move["team_id"]),
            }
            if move
            else None
        ),
    }


def current_placements(session: Session, names: dict[str, str]) -> dict[str, dict[str, Any]]:
    """Where each player is today, by the free-agency tracker's own evidence and order.

    `names` maps NBA player ids to names (Wikipedia's moves are keyed by name). Each placement's
    `state` is `team` (on an NBA roster), `free_agent` (on no roster), `abroad` or `retired`.
    Tracker players get exactly the tracker's current status; everyone else gets the newest
    roster source, unless a Wikipedia move is dated at or after it. Players no source speaks
    for are left out: unknown, never a free agent.
    """
    if not names:
        return {}
    rosters = roster_index(session)
    moves = moves_index()
    try:
        store = load_free_agency_store()
    except HTTPException:
        store = None
    tracker = {str(p["player_id"]): p for p in store["entry"]["players"]} if store else {}
    matched = _player_moves(session, moves, rosters, list(tracker.values()), names)
    found: dict[str, dict[str, Any]] = {}
    for player_id, name in names.items():
        move = latest_move(matched.events.get(player_id, []))
        tracked = tracker.get(player_id)
        if tracked is not None:
            now = current_status(tracked, move, rosters)
            note = tracked.get("note")
            retired = now["retired"] or bool(note and _RETIRED.search(note))
            state = (
                "retired"
                if retired
                else "abroad"
                if now["status"] == "abroad"
                else "team"
                if now["team_id"]
                else "free_agent"
            )
            found[player_id] = _placement(state, now["team_id"], now["source"], move, rosters)
            continue
        known, team = roster_team({"player_id": player_id, "name": name}, rosters)
        kind = move["kind"] if move else None
        if move is not None and (_recent(move, rosters) or not known):
            if kind in ("signed", "two_way") and move["team_id"]:
                found[player_id] = _placement("team", move["team_id"], "wikipedia", move, rosters)
            elif kind in ("waived", "cut", "abroad", "retired"):
                state = {"abroad": "abroad", "retired": "retired"}.get(kind, "free_agent")
                found[player_id] = _placement(state, None, "wikipedia", move, rosters)
            continue
        if not known:
            continue
        if team is not None:
            found[player_id] = _placement("team", team, "roster", move, rosters)
        else:
            # Off every roster: an older move abroad or into retirement says where they went.
            state = {"abroad": "abroad", "retired": "retired"}.get(kind or "", "free_agent")
            found[player_id] = _placement(state, None, "roster", move, rosters)
    return found
