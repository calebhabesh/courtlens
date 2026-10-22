"""Team seasons before the game logs (1946-47 to 1982-83), for the Teams pages (FH05).

A season the release serves as season totals has each team's regular-season box totals and its
opponents' totals (``bbref_team_seasons``, pinned by SHA-256), and its standings record and the
source's season measures (``team_season_records.json``). Nothing here has game dates, so a
season counts only as a whole: for cutoffs after its 30 June end, regular season only.

Where both teams' box totals are complete (1973-74 on: offensive rebounds and turnovers), the
six and four factors use the same box-score method as game-log seasons, on season totals, which
sum exactly. Before that, possessions cannot be counted: ratings and pace are the source's own
estimates, and every factor that needs turnovers or offensive rebounds is unknown. Anything that
needs games (last ten, streak, close games, trend, schedule strength, home and away) is unknown.
The NBA had no three-point line before 1979-80, so its zero three-pointers are a fact, not a gap.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from courtlens.domain.team_analytics import compute_team_four_factors
from courtlens.domain.team_context import METHOD_VERSION as CONTEXT_METHOD
from courtlens.domain.team_context import expected_wins
from courtlens.domain.team_season_records import team_season_record
from courtlens.domain.team_six_factors import METHOD_VERSION as SIX_FACTOR_METHOD
from courtlens.domain.team_six_factors import (
    box_totals,
    league_rates,
    sum_totals,
    team_six_factors,
)
from courtlens.domain.teams import TeamInfo, team_identity
from courtlens.reference_models import BbrefPlayerSeason, BbrefTeamSeason
from courtlens.services.history_totals import season_end_date
from courtlens.services.workbench_analytics import ResolvedContext

FIRST_THREE_POINT_SEASON = "1979-80"
# The box fields a possession count needs, on both ends.
POSSESSION_FIELDS = (
    "points",
    "field_goals_made",
    "field_goals_attempted",
    "free_throws_made",
    "free_throws_attempted",
    "rebounds_offensive",
    "rebounds_defensive",
    "turnovers",
)
THREE_FIELDS = ("three_pointers_made", "three_pointers_attempted")
SEASON_TOTALS_NOTE = (
    "{season} has season totals only (game logs start in 1983-84): records from the "
    "standings; no last ten, streaks, close games, trend, schedule strength or home and away."
)
ESTIMATED_RATINGS_NOTE = (
    "Turnovers and offensive rebounds were not kept before 1973-74, so possessions cannot be "
    "counted: ratings and pace are Basketball-Reference's estimates, and the six factors are "
    "unknown."
)


@dataclass(frozen=True)
class SeasonTeam:
    """One team's season as totals: its code, identity, record and both box totals."""

    code: str
    identity: TeamInfo | None
    games: int
    wins: int | None
    losses: int | None
    own: dict[str, float]
    opp: dict[str, float]
    record: dict[str, Any]

    @property
    def tricode(self) -> str:
        return self.identity.tricode if self.identity else self.code

    @property
    def team_id(self) -> str:
        return self.identity.team_id if self.identity else self.code

    @property
    def name(self) -> str:
        return self.identity.name if self.identity else self.code


def is_totals_season(context: ResolvedContext) -> bool:
    return context.season in context.totals_seasons


def _known(stats: dict[str, Any], season: str) -> dict[str, float]:
    """The recorded fields; three-pointers are zero before the line existed."""
    known = {k: float(v) for k, v in stats.items() if v is not None and k != "games"}
    if season < FIRST_THREE_POINT_SEASON:
        for field in THREE_FIELDS:
            known.setdefault(field, 0.0)
    return known


def season_teams(session: Session, context: ResolvedContext) -> list[SeasonTeam] | None:
    """Every team's season totals; None when the scope's season has game logs.

    Empty when the cutoff falls inside the season (a total cannot be split) or the phase is not
    the regular season (team playoff totals were not collected).
    """
    if not is_totals_season(context) or not context.totals_sha:
        return None
    if context.phase != "regular_season" or context.before_date <= season_end_date(context.season):
        return []
    rows = session.scalars(
        select(BbrefTeamSeason).where(
            BbrefTeamSeason.source_sha256 == context.totals_sha,
            BbrefTeamSeason.season == context.season,
            BbrefTeamSeason.phase == "regular_season",
        )
    ).all()
    teams: list[SeasonTeam] = []
    for row in rows:
        record = team_season_record(row.team_id, row.season) or {}
        own = row.stats_json or {}
        teams.append(
            SeasonTeam(
                code=row.team_id,
                identity=team_identity(row.team_id, row.season),
                games=int(own.get("games") or 0),
                wins=record.get("wins"),
                losses=record.get("losses"),
                own=_known(own, row.season),
                opp=_known(row.opponent_stats_json or {}, row.season),
                record=record,
            )
        )
    return sorted(teams, key=lambda team: team.code)


def find_team(teams: list[SeasonTeam], team_id: str, season: str) -> SeasonTeam | None:
    """The team a page asks for, by franchise id, era code or stored code."""
    wanted = team_identity(team_id, season)
    for team in teams:
        if team_id in (team.code, team.team_id, team.tricode):
            return team
        if wanted and wanted.team_id == team.team_id and wanted.tricode == team.tricode:
            return team
    return None


def box_complete(teams: list[SeasonTeam]) -> bool:
    """Both ends of every team's box carry what a possession count needs."""
    return bool(teams) and all(
        all(field in side for field in (*POSSESSION_FIELDS, *THREE_FIELDS))
        for team in teams
        for side in (team.own, team.opp)
    )


def _per100(points: float | None, rating: float | None) -> float | None:
    """Possessions implied by points and a per-100 rating (the source's estimate)."""
    return 100.0 * points / rating if points is not None and rating else None


def _ratio(num: float | None, den: float | None) -> float | None:
    return num / den if num is not None and den else None


def _ts(side: dict[str, float]) -> float | None:
    if not all(k in side for k in ("points", "field_goals_attempted", "free_throws_attempted")):
        return None
    tsa = side["field_goals_attempted"] + 0.44 * side["free_throws_attempted"]
    return side["points"] / (2.0 * tsa) if tsa > 0 else None


def _estimated_factors(team: SeasonTeam) -> dict[str, Any]:
    """Ratings from the source's estimates; every possession-based factor unknown."""
    ortg, drtg = team.record.get("ortg"), team.record.get("drtg")
    own, opp = team.own, team.opp
    return {
        "possessions": _per100(own.get("points"), ortg),
        "opp_possessions": _per100(opp.get("points"), drtg),
        "points": own.get("points", 0.0),
        "opp_points": opp.get("points", 0.0),
        "ortg": ortg,
        "drtg": drtg,
        "net": ortg - drtg if ortg is not None and drtg is not None else None,
        **dict.fromkeys(("off", "o_ts", "o_tov", "o_orb", "def", "d_ts", "d_tov", "d_drb")),
        "net_eff": None,
        "net_poss": None,
        "off_luck": 0.0,
        "def_luck": 0.0,
        "league_rating": None,
        "rates": {
            "ts_pct": _ts(own),
            "tov_per_100": None,
            "orb_pct": None,
            "ftr": _ratio(own.get("free_throws_attempted"), own.get("field_goals_attempted")),
            "fg3a_per_100": None,
            "fg3_pct": None,
            "opp_ts_pct": _ts(opp),
            "opp_tov_per_100": None,
            "drb_pct": None,
            "opp_ftr": _ratio(opp.get("free_throws_attempted"), opp.get("field_goals_attempted")),
            "opp_fg3a_per_100": None,
            "opp_fg3_pct": None,
        },
    }


def history_six_factors(
    context: ResolvedContext,
    teams: list[SeasonTeam],
    *,
    window_days: int | None,
    offense_luck: float,
    defense_luck: float,
    venue: str | None,
) -> dict[str, Any]:
    """The six-factors response for a season served as totals."""
    warnings = [*context.warnings, SEASON_TOTALS_NOTE.format(season=context.season)]
    if window_days:
        warnings.append("Recent-game windows need game logs; this is the whole season.")
    complete = box_complete(teams)
    if teams and not complete:
        warnings.append(ESTIMATED_RATINGS_NOTE)
    shown = [team for team in teams if team.wins is not None and team.losses is not None]
    for team in teams:
        if team not in shown:
            warnings.append(f"{team.name} has no record in the {context.season} standings.")
    if venue:
        warnings.append("Home and away splits need game logs (1983-84 on).")
        shown = []
    league = sum_totals(box_totals(team.own) for team in teams) if complete else None
    items: list[dict[str, Any]] = []
    for team in shown:
        assert team.wins is not None and team.losses is not None
        games = team.wins + team.losses
        if league is not None:
            factors = team_six_factors(
                box_totals(team.own),
                box_totals(team.opp),
                league,
                offense_luck=offense_luck,
                defense_luck=defense_luck,
            )
        else:
            factors = _estimated_factors(team)
        x_wins = expected_wins(factors["points"], factors["opp_points"], games)
        items.append(
            {
                "team_id": team.team_id,
                "tricode": team.tricode,
                "name": team.name,
                "conference": team.identity.conference if team.identity else None,
                "division": team.identity.division if team.identity else None,
                "games_played": games,
                "wins": team.wins,
                "losses": team.losses,
                **factors,
                "sos": None,
                "adj_net": None,
                "expected_wins": x_wins,
                "win_luck": team.wins - x_wins if x_wins is not None else None,
                "close_wins": None,
                "close_losses": None,
                "standings": {
                    "wins": team.wins,
                    "losses": team.losses,
                    "last10_wins": None,
                    "last10_losses": None,
                    "streak": None,
                },
                "trend": [],
            }
        )
    items.sort(key=lambda t: (t["net"] is None, -(t["net"] or 0.0), t["team_id"]))
    if league is not None:
        league_values = league_rates(league)
    else:
        own_points = sum(item["points"] for item in items)
        poss = [item["possessions"] for item in items]
        estimated = sum(p for p in poss if p is not None) if all(p for p in poss) else None
        league_values = {
            "rating": 100.0 * own_points / estimated if estimated else None,
            "ts_pct": None,
            "tov_per_100": None,
            "orb_pct": None,
            "ftr": None,
            "fg3a_per_100": None,
            "fg3_pct": None,
        }
    return {
        "context": context.to_dict(),
        "teams": items,
        "league": league_values,
        "window": {
            "days": None,
            "start": None,
            "first_game": None,
            "last_game": None,
            "games": sum(team.games for team in teams) // 2,
            "excluded_games": 0,
        },
        "venue": venue,
        "luck": {"offense": offense_luck, "defense": defense_luck},
        "method_version": SIX_FACTOR_METHOD,
        "context_method_version": CONTEXT_METHOD,
        "warnings": warnings,
    }


# Each four-factor value and the box fields it needs: (side, field), side "own" or "opp".
_FOUR_FACTOR_NEEDS: dict[str, tuple[tuple[str, str], ...]] = {
    "fg_pct": (("own", "field_goals_made"), ("own", "field_goals_attempted")),
    "fg3_pct": (("own", "three_pointers_made"), ("own", "three_pointers_attempted")),
    "ft_pct": (("own", "free_throws_made"), ("own", "free_throws_attempted")),
    "opp_fg_pct": (("opp", "field_goals_made"), ("opp", "field_goals_attempted")),
    "opp_fg3_pct": (("opp", "three_pointers_made"), ("opp", "three_pointers_attempted")),
    "opp_ft_pct": (("opp", "free_throws_made"), ("opp", "free_throws_attempted")),
    "efg_pct": (("own", "field_goals_made"), ("own", "field_goals_attempted")),
    "tov_pct": (("own", "turnovers"), ("own", "field_goals_attempted")),
    "oreb_pct": (("own", "rebounds_offensive"), ("opp", "rebounds_defensive")),
    "ftr": (("own", "free_throws_attempted"), ("own", "field_goals_attempted")),
    "opp_efg_pct": (("opp", "field_goals_made"), ("opp", "field_goals_attempted")),
    "opp_tov_pct": (("opp", "turnovers"), ("opp", "field_goals_attempted")),
    "dreb_pct": (("own", "rebounds_defensive"), ("opp", "rebounds_offensive")),
    "opp_oreb_pct": (("opp", "rebounds_offensive"), ("own", "rebounds_defensive")),
    "opp_ftr": (("opp", "free_throws_attempted"), ("opp", "field_goals_attempted")),
}


def history_four_factors(teams: list[SeasonTeam]) -> dict[str, dict[str, Any]]:
    """Four factors per team (keyed by tricode) from season totals; unrecorded inputs unknown.

    Possessions, pace and ratings use the box count where both ends are complete, else the
    source's estimates.
    """
    found: dict[str, dict[str, Any]] = {}
    for team in teams:
        if team.wins is None:
            continue
        minutes = team.own.get("minutes")
        factors = compute_team_four_factors(
            team.own, team.opp, games_played=team.games, total_minutes=minutes
        )
        sides = {"own": team.own, "opp": team.opp}
        for key, needs in _FOUR_FACTOR_NEEDS.items():
            if not all(field in sides[side] for side, field in needs):
                factors[key] = None
        if not all(f in side for f in POSSESSION_FIELDS for side in (team.own, team.opp)):
            ortg, drtg = team.record.get("ortg"), team.record.get("drtg")
            factors.update(
                possessions_estimated=_per100(team.own.get("points"), ortg),
                opp_possessions_estimated=_per100(team.opp.get("points"), drtg),
                pace=team.record.get("pace"),
                off_rating=ortg,
                def_rating=drtg,
                net_rating=round(ortg - drtg, 1) if ortg is not None and drtg is not None else None,
            )
        found[team.tricode] = factors
    return found


def history_record(team: SeasonTeam) -> dict[str, Any]:
    """The schedule's overall record for a season served as totals."""
    points, allowed = team.own.get("points"), team.opp.get("points")
    games = team.wins + team.losses if team.wins is not None and team.losses is not None else 0
    return {
        "games_played": games,
        "wins": team.wins,
        "losses": team.losses,
        "win_pct": round(team.wins / games, 3) if team.wins is not None and games else None,
        "differential": round(points - allowed, 1)
        if points is not None and allowed is not None
        else None,
        "current_streak": None,
    }


def history_team_detail(
    session: Session, context: ResolvedContext, team: SeasonTeam
) -> dict[str, Any]:
    """The team detail response for a season served as totals."""
    own, opp = team.own, team.opp
    games = (team.wins or 0) + (team.losses or 0) if team.wins is not None else team.games
    points, allowed = own.get("points"), opp.get("points")
    players = session.scalars(
        select(BbrefPlayerSeason).where(
            BbrefPlayerSeason.source_sha256 == context.totals_sha,
            BbrefPlayerSeason.season == context.season,
            BbrefPlayerSeason.phase == "regular_season",
            BbrefPlayerSeason.team_id == team.code,
            BbrefPlayerSeason.is_summary.is_(False),
            BbrefPlayerSeason.games > 0,
        )
    ).all()

    def per_game(value: Any, played: int | None) -> float | None:
        return round(float(value) / played, 1) if value is not None and played else None

    cohort = [
        {
            "player_id": row.player_id,
            "player_name": row.player_name,
            "games_played": row.games,
            "total_minutes": row.minutes,
            "pts_per_game": per_game(row.points, row.games),
            "reb_per_game": per_game((row.stats_json or {}).get("rebounds_total"), row.games),
            "ast_per_game": per_game((row.stats_json or {}).get("assists"), row.games),
        }
        for row in players
    ]
    cohort.sort(key=lambda x: (x["games_played"], x["pts_per_game"] or 0), reverse=True)
    fgm, fga = own.get("field_goals_made"), own.get("field_goals_attempted")
    fg3m, fg3a = own.get("three_pointers_made"), own.get("three_pointers_attempted")
    return {
        "team": {"id": team.team_id, "tricode": team.tricode, "name": team.name},
        "context": context.to_dict(),
        "record": {
            "games_played": games,
            "wins": team.wins,
            "losses": team.losses,
            "win_pct": round(team.wins / games, 3) if team.wins is not None and games else None,
            "differential": round(points - allowed, 1)
            if points is not None and allowed is not None
            else None,
        },
        "production": {
            "pts_per_game": per_game(points, games),
            "pts_total": points,
            "fg_pct": round(fgm / fga, 4) if fgm is not None and fga else None,
            "fg3_pct": round(fg3m / fg3a, 4) if fg3m is not None and fg3a else None,
            "ft_pct": round(own["free_throws_made"] / own["free_throws_attempted"], 4)
            if own.get("free_throws_made") is not None and own.get("free_throws_attempted")
            else None,
            "efg_pct": round((fgm + 0.5 * (fg3m or 0.0)) / fga, 4)
            if fgm is not None and fga
            else None,
        },
        "allowance": {
            "pts_allowed_per_game": per_game(allowed, games),
            "pts_allowed_total": allowed,
        },
        "home_split": None,
        "away_split": None,
        "current_streak": None,
        "player_cohort": cohort,
        "recent_games": [],
        "warnings": [*context.warnings, SEASON_TOTALS_NOTE.format(season=context.season)],
    }
