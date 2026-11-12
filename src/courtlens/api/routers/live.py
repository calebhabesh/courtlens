"""Live reads: GETs that fetch ESPN on demand when the cached copy is stale (alignment row 7)."""

from datetime import date, datetime, timedelta
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.orm import Session

from courtlens.database import get_db
from courtlens.domain.live import FIRST_STANDINGS_YEAR, SCHEDULE_SEASON_TYPES, LiveCache
from courtlens.domain.live_history import HistoricalSlate
from courtlens.domain.teams import TRICODE_TO_TEAM, franchise_of
from courtlens.ingestion.espn_rosters import ESPN_TEAMS
from courtlens.services.live import (
    EASTERN,
    read,
    schedule_resource,
    season_end_year,
    with_injury_counts,
)
from courtlens.services.live_history import historical_slate
from courtlens.services.live_provider import ESPNLiveProvider
from courtlens.services.workbench_analytics import resolve_workbench_context

router = APIRouter(prefix="/live", tags=["live"])


def get_provider() -> ESPNLiveProvider:
    return ESPNLiveProvider()


@router.get("", response_model=LiveCache)
def live_slate(
    slate_date: date,
    response: Response,
    session: Session = Depends(get_db),
    provider: ESPNLiveProvider = Depends(get_provider),
) -> dict[str, Any]:
    response.headers["Cache-Control"] = "no-store"
    result = read(session, provider, slate_date)
    games = (result.get("data") or {}).get("games") or []
    if any(game["status"] == "scheduled" for game in games):
        result = with_injury_counts(result, read(session, provider, None))
    return result


@router.get("/games/{game_id}", response_model=LiveCache)
def live_game(
    game_id: str,
    slate_date: date,
    response: Response,
    session: Session = Depends(get_db),
    provider: ESPNLiveProvider = Depends(get_provider),
) -> dict[str, Any]:
    if not game_id.isdigit() or len(game_id) > 20:
        raise HTTPException(422, "Invalid ESPN game ID")
    response.headers["Cache-Control"] = "no-store"
    return read(session, provider, slate_date, game_id)


@router.get("/games/{game_id}/win-probability")
def live_game_win_probability(
    game_id: str,
    slate_date: date,
    response: Response,
    session: Session = Depends(get_db),
    provider: ESPNLiveProvider = Depends(get_provider),
) -> dict[str, Any]:
    """The serving CourtLens model's line for one game, with its version and hash (W3b: the
    Market-informed model unless a registered read returned Live to the Original)."""
    from courtlens.services.win_probability_head_to_head import live_probability

    if not game_id.isdigit() or len(game_id) > 20:
        raise HTTPException(422, "Invalid ESPN game ID")
    response.headers["Cache-Control"] = "no-store"
    try:
        return live_probability(game_id, read(session, provider, slate_date, game_id).get("data"))
    except (OSError, ValueError) as error:
        raise HTTPException(503, "Win probability model unavailable") from error


@router.get("/standings", response_model=LiveCache)
def live_standings(
    response: Response,
    season: str | None = Query(None, pattern=r"^[0-9]{4}-[0-9]{2}$"),
    session: Session = Depends(get_db),
    provider: ESPNLiveProvider = Depends(get_provider),
) -> dict[str, Any]:
    """ESPN's standings for a season (1984-85 on, the first ESPN lists in full); default current."""
    today = datetime.now(EASTERN).date()
    current = season_end_year(today)
    year = int(season[:4]) + 1 if season else current
    if not FIRST_STANDINGS_YEAR <= year <= current:
        raise HTTPException(422, "Standings cover 1984-85 to the current season")
    response.headers["Cache-Control"] = "no-store"
    return read(session, provider, None, standings_year=year)


# ESPN keys teams by franchise: the Thunder's id serves the SuperSonics' seasons.
ESPN_BY_FRANCHISE = {
    TRICODE_TO_TEAM[tricode].team_id: source_id
    for source_id, (_, tricode) in ESPN_TEAMS.items()
    if tricode in TRICODE_TO_TEAM
}
FIRST_SCHEDULE_YEAR = 1980


@router.get("/teams/{team}/schedule", response_model=LiveCache)
def live_team_schedule(
    team: str,
    response: Response,
    season: str | None = Query(None, pattern=r"^[0-9]{4}-[0-9]{2}$"),
    phase: str = Query("regular_season", pattern=r"^(regular_season|playoffs)$"),
    session: Session = Depends(get_db),
    provider: ESPNLiveProvider = Depends(get_provider),
) -> dict[str, Any]:
    """ESPN's schedule for one team's season phase: every game listed, played or upcoming."""
    if not team.isalnum() or len(team) > 12:
        raise HTTPException(422, "Invalid team")
    franchise = franchise_of(team)
    source_id = ESPN_BY_FRANCHISE.get(franchise) if franchise else None
    if source_id is None:
        raise HTTPException(404, "ESPN lists no schedule for this team")
    current = season_end_year(datetime.now(EASTERN).date())
    year = int(season[:4]) + 1 if season else current
    if not FIRST_SCHEDULE_YEAR <= year <= current:
        raise HTTPException(422, "Schedules cover 1979-80 to the current season")
    response.headers["Cache-Control"] = "no-store"
    return read(
        session,
        provider,
        None,
        resource=schedule_resource(source_id, year, SCHEDULE_SEASON_TYPES[phase]),
    )


@router.get("/historical", response_model=HistoricalSlate)
def historical_cache(
    slate_date: date,
    response: Response,
    game_id: str | None = Query(None, pattern=r"^[0-9]{1,20}$"),
    release_id: str | None = Query(None, alias="releaseId"),
    season: str | None = None,
    phase: str = "regular_season",
    before_date: date | None = Query(None, alias="beforeDate"),
    session: Session = Depends(get_db),
) -> dict[str, Any]:
    year = slate_date.year if slate_date.month >= 7 else slate_date.year - 1
    context = resolve_workbench_context(
        session,
        release_id=release_id,
        requested_season=season or f"{year}-{str(year + 1)[-2:]}",
        requested_phase=phase,
        requested_before_date=before_date or slate_date + timedelta(days=1),
    )
    response.headers["Cache-Control"] = "no-store"
    return historical_slate(session, context, slate_date, game_id)
