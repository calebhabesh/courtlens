"""Team scoring splits on the six-factors response (`courtlens-team-scoring-v1`).

NBA Stats' team Misc season totals (`leaguedashteamstats`, MeasureType=Misc, mirrored by hoopR
and admitted as the `team_misc` stats feed) carry fast-break, paint, second-chance and
off-turnover points, scored and allowed. They are season totals with no game dates, so a team
gets them only when they describe exactly the games in scope:

- no venue split and no recent-game window (both select games the totals cannot), and
- the feed's games played and wins equal the team's games and wins in scope. A scope ending at
  an earlier date is a prefix of the season, and so is the feed (every game played when it was
  mirrored), so equal counts mean the same games. Matching wins also proves the season for the
  mirror's older files, which declare only the start year.

Anything else stays unknown (null), never zero. Pace uses the box-score possession estimate
over the feed's game minutes: 48 * (Poss + Opp Poss) / (2 * MIN).
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping
from typing import Any

from sqlalchemy import text
from sqlalchemy.orm import Session

from courtlens.domain.teams import franchise_of

METHOD_VERSION = "courtlens-team-scoring-v1"
MART = "analytics_marts.mart_stats_team_scoring"
POINT_FIELDS = (
    "pts_fb",
    "pts_paint",
    "pts_2nd_chance",
    "pts_off_tov",
    "opp_pts_fb",
    "opp_pts_paint",
    "opp_pts_2nd_chance",
    "opp_pts_off_tov",
)
LIMITATIONS = [
    "NBA Stats team Misc season totals as mirrored by hoopR (no game dates): fast-break, paint, "
    "second-chance and off-turnover points follow the NBA's own play-by-play tagging.",
    "Shown only when the totals cover exactly the games in scope (same games played and wins, "
    "no venue split or recent window); otherwise unknown, never zero. The mirror starts at "
    "1996-97.",
    "Pace = 48 * (Poss + Opp Poss) / (2 * game minutes), with the box-score possession estimate.",
]


def load_team_scoring(session: Session, season: str, phase: str) -> list[dict[str, Any]]:
    """The admitted rows for one season and phase; empty where the mart is not built."""
    bind = session.get_bind()
    if bind.dialect.name != "postgresql":
        return []
    if session.scalar(text("SELECT to_regclass(:name)"), {"name": MART}) is None:
        return []
    statement = text(
        f"""
        SELECT dataset_id, team_id, observed_at, upstream_revision, gp, w, min,
               {", ".join(POINT_FIELDS)}
        FROM {MART}
        WHERE season = :season AND season_type = :phase
        """
    )
    return [
        dict(row._mapping) for row in session.execute(statement, {"season": season, "phase": phase})
    ]


def _num(value: Any) -> float | None:
    return float(value) if value is not None else None


def _franchise(team_id: str) -> str:
    return franchise_of(team_id) or team_id


def team_scoring(row: Mapping[str, Any], team: Mapping[str, Any]) -> dict[str, Any]:
    """One team's totals and pace from its feed row and six-factors item."""
    minutes = _num(row.get("min"))
    poss, opp_poss = team.get("possessions"), team.get("opp_possessions")
    pace = (
        48.0 * (poss + opp_poss) / (2.0 * minutes)
        if poss is not None and opp_poss is not None and minutes
        else None
    )
    return {
        "games": int(row["gp"]),
        "minutes": minutes,
        "pace": pace,
        **{field: _num(row.get(field)) for field in POINT_FIELDS},
    }


def attach_team_scoring(
    result: dict[str, Any],
    rows: Iterable[Mapping[str, Any]],
    *,
    window_days: int | None,
    venue: str | None,
) -> dict[str, Any]:
    """Add `scoring` to each team (or null) and a response-level `scoring` summary."""
    by_franchise = {
        _franchise(str(row["team_id"])): row for row in rows if row.get("gp") is not None
    }
    teams: list[dict[str, Any]] = result["teams"]
    reason: str | None = None
    if not by_franchise:
        reason = "No team scoring totals are admitted for this season and phase."
    elif venue:
        reason = "Season totals cannot be split by venue."
    elif window_days:
        reason = "Season totals cannot be cut to a recent-game window."
    used: list[Mapping[str, Any]] = []
    for team in teams:
        row = None if reason else by_franchise.get(_franchise(str(team["team_id"])))
        if (
            row is not None
            and int(row["gp"]) == team["games_played"]
            and row.get("w") is not None
            and int(row["w"]) == team["wins"]
        ):
            team["scoring"] = team_scoring(row, team)
            used.append(row)
        else:
            team["scoring"] = None
    if not reason and len(used) < len(teams):
        reason = (
            "The totals cover different games (games played or wins differ) for "
            f"{len(teams) - len(used)} of {len(teams)} teams; those stay unknown."
            if used
            else "The totals cover different games than the scope (for example an earlier date)."
        )
    observed = [row["observed_at"] for row in used if row.get("observed_at") is not None]
    result["scoring"] = {
        "method_version": METHOD_VERSION,
        "status": "complete"
        if used and len(used) == len(teams)
        else "partial"
        if used
        else "unavailable",
        "teams": len(used),
        "reason": reason,
        "dataset_ids": sorted({str(row["dataset_id"]) for row in used}),
        "observed_at": max(observed).isoformat() if observed else None,
        "upstream_revisions": sorted(
            {str(r["upstream_revision"]) for r in used if r.get("upstream_revision")}
        ),
        "limitations": LIMITATIONS,
    }
    return result
