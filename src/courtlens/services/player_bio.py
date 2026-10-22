"""Player biography header: listings, draft and combine measurements for one player.

Listings are team-reported (NBA Stats player index and team rosters); combine values are
official Draft Combine measurements. They are never mixed: a listed height is not a
measured one. A season's own roster listing describes the player in that season; the
all-time index supplies what does not change (country, college, draft). The index's current
listing names the team the player belongs to today; it identifies the player and never
re-attributes a season's games. Missing values stay null.
"""

from __future__ import annotations

from datetime import date, timedelta
from typing import Any

from fastapi import HTTPException
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from courtlens.domain.teams import franchise_of, team_identity
from courtlens.reference_models import BbrefPlayerSeason
from courtlens.services.bbref_bio import player_reference
from courtlens.services.player_contracts import enrich_contracts
from courtlens.services.stats_feed_views import _mart, _rows, team_tricode
from courtlens.services.workbench_analytics import resolve_workbench_context
from courtlens.workbench_models import WorkbenchPlayerGame

LIMITATIONS = [
    "Listed height and weight are team-reported (shoes on) and can differ from combine "
    "measurements.",
    "Combine values are the official NBA Draft Combine measurements from the draft year.",
    "Birthplace, high school, shooting hand, debut, honours and season awards are from "
    "Basketball-Reference as of its last crawl; contracts, transactions and game highs also "
    "cover the whole career to date, independently of the basketball cutoff.",
]


def _available(session: Session, mart: str) -> bool:
    return session.scalar(text("SELECT to_regclass(:name)"), {"name": _mart(mart)}) is not None


def age_on(birth_date: date | None, on: date) -> int | None:
    """Whole years of age on a date; unknown birth dates stay unknown."""
    if birth_date is None:
        return None
    return on.year - birth_date.year - ((on.month, on.day) < (birth_date.month, birth_date.day))


def _number(value: Any) -> float | None:
    return None if value is None else float(value)


def _current_team(bio: dict[str, Any]) -> dict[str, Any] | None:
    if not bio["listed_team_id"]:
        return None
    return {
        "team_id": bio["listed_team_id"],
        "team_tricode": team_tricode(bio["listed_team_id"]),
        "listing_season": bio["index_season"],
        "index_refreshed_at": bio.get("index_observed_at"),
        "trade_date": bio.get("trade_date"),
        "trade_source_url": bio.get("trade_source_url"),
    }


def current_teams(session: Session, player_ids: list[str]) -> dict[str, dict[str, Any]]:
    """The team each player is on today (players on no roster are left out)."""
    return current_listings(session, player_ids)[0]


def current_listings(
    session: Session, player_ids: list[str], names: dict[str, str] | None = None
) -> tuple[dict[str, dict[str, Any]], dict[str, dict[str, Any]]]:
    """(teams, statuses): where each player is today, by the free-agency tracker's evidence.

    `teams` holds players on an NBA roster; `statuses` holds players the sources place on no
    roster (`free_agent`, `abroad`, `retired`). The newest roster source and Wikipedia's dated
    moves decide (see free_agency.current_placements); without them the NBA index mart's
    listing serves. A listing names who a player plays for today; it never re-attributes a
    season's games. `names` covers players the index mart does not list.
    """
    from courtlens.services.free_agency import current_placements

    if not player_ids:
        return {}, {}
    rows: list[dict[str, Any]] = []
    if _available(session, "mart_player_bio"):
        rows = _rows(
            session,
            f"""SELECT * FROM {_mart("mart_player_bio")}
            WHERE player_id IN :ids""",
            ids=player_ids,
        )
    by_id = {row["player_id"]: row for row in rows}
    known_names = {
        pid: name
        for pid in player_ids
        if (name := (names or {}).get(pid) or (by_id.get(pid) or {}).get("source_player_name"))
    }
    placements = current_placements(session, known_names)
    teams: dict[str, dict[str, Any]] = {}
    statuses: dict[str, dict[str, Any]] = {}
    for pid in player_ids:
        row = by_id.get(pid)
        place = placements.get(pid)
        if place is not None and place["state"] != "team":
            statuses[pid] = {k: place[k] for k in ("state", "source", "as_of", "move")}
            continue
        if place is not None:
            teams[pid] = {
                "team_id": place["team_id"],
                "team_tricode": place["team_tricode"],
                "listing_season": row["index_season"] if row else None,
                "index_refreshed_at": place["as_of"]
                or (row.get("index_observed_at") if row else None),
                "listing_source": place["source"],
                "trade_date": None,
                "trade_source_url": None,
            }
        elif row is not None and (listed := _current_team(row)) is not None:
            teams[pid] = {**listed, "listing_source": "NBA player index"}
    if teams and _available(session, "mart_player_transactions"):
        trades = _rows(
            session,
            f"""SELECT DISTINCT ON (player_id)
            player_id, type, to_team, date, source_url FROM {_mart("mart_player_transactions")}
            WHERE player_id IN :ids
                AND type IN ('traded', 'signed', 'claimed', 'waived', 'released', 'retired')
                AND date IS NOT NULL
            ORDER BY player_id, date DESC, entry_number DESC""",
            ids=list(teams),
        )
        by_team = {(r["player_id"], r["to_team"]): r for r in trades}
        for pid, team in teams.items():
            tricode = team["team_tricode"]
            code = {"BKN": "BRK", "CHA": "CHO", "PHX": "PHO"}.get(tricode or "", tricode)
            trade = by_team.get((pid, code))
            if trade and trade["type"] == "traded":
                team["trade_date"] = trade["date"]
                team["trade_source_url"] = trade["source_url"]
    return teams, statuses


def player_bio(session: Session, player_id: str, season: str, before_date: date) -> dict[str, Any]:
    """Biography as of the page's scope: games before ``before_date`` in ``season``."""
    as_of = before_date - timedelta(days=1)
    bio: dict[str, Any] | None = None
    listing: dict[str, Any] | None = None
    if _available(session, "mart_player_bio"):
        found = _rows(
            session,
            f"SELECT * FROM {_mart('mart_player_bio')} WHERE player_id = :pid",
            pid=player_id,
        )
        bio = found[0] if found else None
        # One listing per season; a player on two teams' files keeps the higher-numbered team
        # deterministically (which roster was current is unknown).
        listings = _rows(
            session,
            f"""SELECT * FROM {_mart("mart_player_roster_seasons")}
            WHERE player_id = :pid AND season = :season ORDER BY team_id DESC""",
            pid=player_id,
            season=season,
        )
        listing = listings[0] if listings else None
    draft_rows = _rows(
        session,
        f"""SELECT draft_year, round_number, round_pick, overall_pick, drafting_team_id,
            organization FROM {_mart("mart_stats_draft_history")}
        WHERE player_id = :pid ORDER BY draft_year DESC LIMIT 1""",
        pid=player_id,
    )
    combine_rows = _rows(
        session,
        f"""SELECT draft_year, height_no_shoes_inches, height_shoes_inches, wingspan_inches,
            standing_reach_inches, weight_lbs
        FROM {_mart("mart_stats_draft_combine")}
        WHERE player_id = :pid ORDER BY draft_year DESC LIMIT 1""",
        pid=player_id,
    )

    draft: dict[str, Any] | None = None
    if draft_rows:
        row = draft_rows[0]
        team = row["drafting_team_id"]
        draft = {
            "year": int(row["draft_year"]),
            "round": row["round_number"],
            "pick": row["overall_pick"],
            "team_id": team,
            "team_tricode": team_tricode(team) if team else None,
            "organization": row["organization"],
        }
    elif bio is not None and bio["draft_year"] is not None:
        draft = {
            "year": bio["draft_year"],
            "round": bio["draft_round"],
            "pick": bio["draft_number"],
            "team_id": None,
            "team_tricode": None,
            "organization": None,
        }

    combine = None
    if combine_rows:
        row = combine_rows[0]
        combine = {
            "draft_year": int(row["draft_year"]),
            "height_no_shoes_inches": _number(row["height_no_shoes_inches"]),
            "height_shoes_inches": _number(row["height_shoes_inches"]),
            "wingspan_inches": _number(row["wingspan_inches"]),
            "standing_reach_inches": _number(row["standing_reach_inches"]),
            "weight_lbs": _number(row["weight_lbs"]),
        }

    teams, statuses = current_listings(
        session, [player_id], {player_id: bio["source_player_name"]} if bio else None
    )
    current_team = teams.get(player_id)
    current_status = statuses.get(player_id)

    reference = player_reference(session, player_id)
    if reference is not None:
        enrich_contracts(session, player_id, reference)
    last_team = None
    # Off every roster now: the team of his final season, else the index's last (or listed) team.
    last_id = bio and (bio.get("last_team_id") or bio.get("listed_team_id"))
    if not current_team:
        final = final_season_team(session, player_id, str(last_id) if last_id else None)
        if final is not None:
            last_team = final
        elif bio and last_id and not played_any_season(session, player_id):
            last_team = {
                "team_id": last_id,
                "team_tricode": team_tricode(last_id),
                "listing_season": bio["index_season"],
                "index_refreshed_at": bio.get("index_observed_at"),
            }

    source = listing or bio
    birth_date = bio["birth_date"] if bio else listing["birth_date"] if listing else None
    return {
        "player_id": player_id,
        "season": season,
        "as_of": as_of,
        "listing_source": "season_roster" if listing else "player_index" if bio else None,
        "jersey": source["jersey"] if source else None,
        "listed_position": source["listed_position"] if source else None,
        "listed_height_inches": source["listed_height_inches"] if source else None,
        "listed_weight_lbs": _number(source["listed_weight_lbs"]) if source else None,
        "prior_seasons": listing["prior_seasons"] if listing else None,
        "birth_date": birth_date,
        "age": age_on(birth_date, as_of),
        "country": bio["country"] if bio else None,
        "college": (bio["college"] if bio else None) or (listing["school"] if listing else None),
        "draft": draft,
        "undrafted": bool(bio and bio["draft_year"] is None and draft is None),
        "combine": combine,
        "current_team": current_team,
        "current_status": current_status,
        "last_team": last_team,
        "reference": reference,
        "limitations": LIMITATIONS,
    }


def played_any_season(session: Session, player_id: str) -> bool:
    return (
        session.scalar(
            select(BbrefPlayerSeason.id).where(BbrefPlayerSeason.player_id == player_id).limit(1)
        )
        is not None
    )


def final_season_team(
    session: Session, player_id: str, index_team_id: str | None
) -> dict[str, Any] | None:
    """The team of a player's final season in the league's season totals.

    The NBA.com index's team for a retired player is often not his last (about half of players
    whose careers ended before 2000-01). One team that season is his last; a traded player's is
    his playoff team, else the team of his last game (game logs start in 1983-84), else the
    index's team when he played for it that season. Otherwise None: the season totals' row
    order does not say which team came last, so nothing is claimed.
    """
    rows = session.execute(
        select(BbrefPlayerSeason.season, BbrefPlayerSeason.phase, BbrefPlayerSeason.team_id)
        .where(BbrefPlayerSeason.player_id == player_id, BbrefPlayerSeason.is_summary.is_(False))
        .order_by(BbrefPlayerSeason.season.desc())
    ).all()
    if not rows:
        return None
    season = rows[0].season
    regular = {r.team_id for r in rows if r.season == season and r.phase == "regular_season"}
    playoffs = {r.team_id for r in rows if r.season == season and r.phase == "playoffs"}
    if len(regular) == 1:
        code = next(iter(regular))
    elif len(playoffs) == 1:
        code = next(iter(playoffs))
    elif (last_game := _last_game_team(session, player_id, season)) is not None:
        code = last_game
    else:
        matches = [c for c in regular if index_team_id and franchise_of(c) == index_team_id]
        if len(matches) != 1:
            return None
        code = matches[0]
    identity = team_identity(code, season)
    return {
        "team_id": franchise_of(code) or code,
        "team_tricode": identity.tricode if identity else code,
        "listing_season": season,
        "listing_source": "season_totals",
    }


def _last_game_team(session: Session, player_id: str, season: str) -> str | None:
    """The team of a player's last appearance that season in the published release, if any."""
    try:
        dataset_id = resolve_workbench_context(session).dataset_id
    except HTTPException:
        return None
    team = session.scalar(
        select(WorkbenchPlayerGame.team_id)
        .where(
            WorkbenchPlayerGame.dataset_id == dataset_id,
            WorkbenchPlayerGame.player_id == player_id,
            WorkbenchPlayerGame.season == season,
            WorkbenchPlayerGame.appearance == "appeared",
        )
        .order_by(WorkbenchPlayerGame.game_date.desc())
        .limit(1)
    )
    return str(team) if team else None
