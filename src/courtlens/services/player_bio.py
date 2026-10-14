"""Player biography header: listings, draft and combine measurements for one player.

Listings are team-reported (NBA Stats player index and team rosters); combine values are
official Draft Combine measurements. They are never mixed: a listed height is not a
measured one. A season's own roster listing describes the player in that season; the
all-time index supplies what does not change (country, college, draft). Missing values
stay null.
"""

from __future__ import annotations

from datetime import date, timedelta
from typing import Any

from sqlalchemy import text
from sqlalchemy.orm import Session

from courtlens.services.stats_feed_views import _mart, _rows, team_tricode

LIMITATIONS = [
    "Listed height and weight are team-reported (shoes on) and can differ from combine "
    "measurements.",
    "Combine values are the official NBA Draft Combine measurements from the draft year.",
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
        "limitations": LIMITATIONS,
    }
