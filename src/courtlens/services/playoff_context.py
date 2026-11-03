"""Regular-season context for playoff series: records, season series and impact ratings.

Everything here is read strictly before the playoffs began (or the cutoff, if earlier): a team's
record and its season series against the opponent come from the release's regular-season games,
DARKO from its board at the end of the regular season and RAPM from the regular-season fit.
"""

from __future__ import annotations

from collections import Counter
from dataclasses import dataclass, field
from datetime import date
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from courtlens.api.workbench_schemas import (
    PlayerSeriesStats,
    SeasonSeriesGame,
    SeriesImpactBoard,
    SeriesImpactPlayer,
)
from courtlens.domain.teams import franchise_of, team_identity
from courtlens.services.darko import CURRENT as DARKO_CURRENT
from courtlens.services.darko import load_darko_store
from courtlens.services.impact_serving import load_impact_store
from courtlens.workbench_models import WorkbenchTeamGame

IMPACT_ROSTER = 12


def franchise(team: str) -> str:
    return franchise_of(team) or team


@dataclass
class RegularSeason:
    """A season's regular-season games before a date, by franchise."""

    season: str
    wins: Counter[str] = field(default_factory=Counter)
    losses: Counter[str] = field(default_factory=Counter)
    # (game_id, date, home, away, home points, away points) with each team's stored code.
    games: list[tuple[str, date, str, str, int, int]] = field(default_factory=list)

    def record(self, team: str) -> tuple[int | None, int | None]:
        key = franchise(team)
        if not self.games or key not in self.wins.keys() | self.losses.keys():
            return None, None
        return self.wins[key], self.losses[key]

    def between(self, team1: str, team2: str) -> list[tuple[str, date, str, str, int, int]]:
        pair = {franchise(team1), franchise(team2)}
        return [g for g in self.games if {franchise(g[2]), franchise(g[3])} == pair]

    def series_wins(self, team1: str, team2: str) -> tuple[int | None, int | None]:
        """Each team's wins in their regular-season meetings; None when they never met."""
        games = self.between(team1, team2)
        if not games:
            return None, None
        f1 = franchise(team1)
        won = sum(
            1 for _, _, home, away, hp, ap in games if franchise(home if hp > ap else away) == f1
        )
        return won, len(games) - won

    def season_series(self, team1: str, team2: str) -> list[SeasonSeriesGame]:
        """The meetings, with each side named by the id the series uses for it."""
        ids = {franchise(team1): team1, franchise(team2): team2}
        played = []
        for game_id, day, home, away, hp, ap in self.between(team1, team2):
            home_info = team_identity(home, self.season)
            away_info = team_identity(away, self.season)
            home_id = ids[franchise(home)]
            away_id = ids[franchise(away)]
            played.append(
                SeasonSeriesGame(
                    game_id=game_id,
                    game_date=day.isoformat(),
                    home_team_id=home_id,
                    home_tricode=home_info.tricode if home_info else home,
                    away_team_id=away_id,
                    away_tricode=away_info.tricode if away_info else away,
                    home_score=hp,
                    away_score=ap,
                    winner_team_id=home_id if hp > ap else away_id if ap > hp else None,
                )
            )
        return played


def regular_season(
    session: Session, dataset_id: str, season: str, before: date | None
) -> RegularSeason:
    query = select(
        WorkbenchTeamGame.game_id,
        WorkbenchTeamGame.game_date,
        WorkbenchTeamGame.team_id,
        WorkbenchTeamGame.opponent_id,
        WorkbenchTeamGame.side,
        WorkbenchTeamGame.points,
        WorkbenchTeamGame.opponent_points,
    ).where(
        WorkbenchTeamGame.dataset_id == dataset_id,
        WorkbenchTeamGame.season == season,
        WorkbenchTeamGame.phase == "regular_season",
    )
    if before is not None:
        query = query.where(WorkbenchTeamGame.game_date < before)
    context = RegularSeason(season)
    seen: set[str] = set()
    for game_id, day, team, opponent, side, points, allowed in session.execute(query):
        if points > allowed:
            context.wins[franchise(team)] += 1
        elif points < allowed:
            context.losses[franchise(team)] += 1
        if game_id in seen:
            continue
        seen.add(game_id)
        home_first = side == "home"
        context.games.append(
            (
                game_id,
                day,
                team if home_first else opponent,
                opponent if home_first else team,
                points if home_first else allowed,
                allowed if home_first else points,
            )
        )
    context.games.sort(key=lambda g: (g[1], g[0]))
    return context


def _darko_board(season: str) -> dict[str, Any] | None:
    entries = [e for e in (load_darko_store() or {}).get("entries", []) if e["season"] == season]
    return next((e for e in entries if e["phase"] == "regular_season"), None) or next(
        (e for e in entries if e["phase"] == DARKO_CURRENT), None
    )


def _rapm_entry(season: str) -> dict[str, Any] | None:
    entries = [
        e
        for e in (load_impact_store() or {}).get("entries", [])
        if e["kind"] == "ratings"
        and e["scope"]["season"] == season
        and e["scope"]["phase"] == "regular_season"
    ]
    return max(entries, key=lambda e: e["scope"]["years"], default=None)


def _top(players: list[SeriesImpactPlayer], team_ids: tuple[str, str]) -> list[SeriesImpactPlayer]:
    ranked = sorted((p for p in players if p.total is not None), key=lambda p: -(p.total or 0.0))
    return [
        p for team in team_ids for p in [q for q in ranked if q.team_id == team][:IMPACT_ROSTER]
    ]


def impact_boards(
    season: str, roster: list[PlayerSeriesStats], team_ids: tuple[str, str]
) -> list[SeriesImpactBoard]:
    """DARKO and RAPM for the players who appeared in the series, top 12 of each team."""
    boards: list[SeriesImpactBoard] = []
    darko = _darko_board(season)
    if darko is not None:
        rated = darko["players"]
        players = [
            SeriesImpactPlayer(
                player_id=p.player_id,
                player_name=p.player_name,
                team_id=p.team_id,
                total=rated[p.player_id].get("dpm"),
                offense=rated[p.player_id].get("o_dpm"),
                defense=rated[p.player_id].get("d_dpm"),
            )
            for p in roster
            if p.player_id in rated
        ]
        end = darko["phase"] == "regular_season"
        boards.append(
            SeriesImpactBoard(
                metric="darko",
                label="DARKO",
                as_of=darko["data_date"],
                note=(
                    "DARKO DPM at the end of the regular season"
                    if end
                    else "DARKO DPM, latest board (the regular season has no sealed board yet)"
                )
                + " · Kostya Medvedovsky (darko.app)",
                players=_top(players, team_ids),
            )
        )
    rapm = _rapm_entry(season)
    if rapm is not None:
        years = rapm["scope"]["years"]
        rated = rapm["players"]
        suffix = f"_{years}y"
        players = [
            SeriesImpactPlayer(
                player_id=p.player_id,
                player_name=p.player_name,
                team_id=p.team_id,
                total=rated[p.player_id]["metrics"].get(f"rapm{suffix}"),
                offense=rated[p.player_id]["metrics"].get(f"orapm{suffix}"),
                defense=rated[p.player_id]["metrics"].get(f"drapm{suffix}"),
            )
            for p in roster
            if p.player_id in rated
        ]
        boards.append(
            SeriesImpactBoard(
                metric="rapm",
                label="RAPM",
                as_of=rapm["scope"]["last_included_date"],
                note=f"{years}-year regular-season RAPM from public play-by-play (CourtLens fit)",
                players=_top(players, team_ids),
            )
        )
    return boards
