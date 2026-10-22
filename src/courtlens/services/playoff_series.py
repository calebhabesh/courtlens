"""Playoff brackets and series for every completed season, from the series file (FH05).

Rounds, matchups, winners and series lengths come from ``playoff_series.json``. Each game links
to the release's own game by date and home franchise wherever the release has it (1983-84 on),
so series pages keep box-score factors and player totals; before that a series has its games'
scores only. Seasons whose game ids carry the round (2001-02 on) keep their NBA series ids and
slugs, so existing links resolve. The current season, not yet in the file, keeps the game-id path.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from courtlens.api.workbench_schemas import (
    PlayerSeriesStats,
    PlayoffBracketResponse,
    PlayoffGameCard,
    PlayoffRoundResponse,
    PlayoffSeedEvidence,
    PlayoffSeriesDetailResponse,
    PlayoffSeriesSummary,
    TeamSeriesHeader,
    TeamSeriesStats,
)
from courtlens.domain.playoff_series import classify_round, season_playoff_series
from courtlens.domain.teams import franchise_of, team_identity
from courtlens.domain.workbench_playoffs import (
    PLAYOFF_CAPABILITIES,
    PLAYOFF_DISCLAIMERS,
    aggregate_player_series_stats,
    aggregate_team_series_factors,
    build_series_slug,
    parse_playoff_game_id,
)
from courtlens.workbench_models import (
    WorkbenchIdentity,
    WorkbenchPlayerGame,
    WorkbenchSchedule,
    WorkbenchTeamGame,
)

# Seeds are reconstructed from regular-season records only where that matches how the NBA
# seeded: before 2000-01 the source lists no seeds and division winners were seeded first.
FIRST_RECONSTRUCTED_SEEDS = "2000-01"
HISTORY_DISCLAIMER = (
    "Rounds, matchups and results come from Basketball-Reference's season page. Series before "
    "1983-84 have game scores only (no box scores); seeds are not shown before 2000-01."
)
_GROUP_ORDER = {"Eastern": 0, "Western": 1, "Central": 2, None: 3}


@dataclass
class SeriesGame:
    number: int
    date: date
    home: str
    visitor: str
    home_points: int | None
    visitor_points: int | None
    game_id: str | None


@dataclass
class SeasonSeries:
    season: str
    ending_year: int
    round_number: int
    round_name: str
    conference: str | None
    matchup_index: int
    best_of: int
    team1: str
    team2: str
    games: list[SeriesGame]
    series_id: str
    slug: str


def franchise(team: str) -> str:
    """The current franchise of a stored id or code (CHH and CHA both name Charlotte)."""
    return franchise_of(team) or team


def _identity(code: str, season: str) -> tuple[str, str, str]:
    info = team_identity(code, season)
    return (info.team_id, info.tricode, info.name) if info else (code, code, code)


def _history_slug(year: int, round_number: int, conference: str | None, t1: str, t2: str) -> str:
    teams = f"{t1.lower()}-{t2.lower()}"
    if round_number == 0:
        return f"{year}-tb-{teams}"
    if round_number == 3:
        return f"{year}-{(conference or 'x')[0].lower()}cf-{teams}"
    return build_series_slug(year, round_number, t1, t2)


def season_series(session: Session, dataset_id: str, season: str) -> list[SeasonSeries] | None:
    """A completed season's series with their games linked; None when the file lacks it."""
    listed = season_playoff_series(season)
    if listed is None:
        return None
    ending_year = int(season[:4]) + 1
    stored = session.execute(
        select(
            WorkbenchSchedule.game_id, WorkbenchSchedule.game_date, WorkbenchSchedule.home_team_id
        ).where(
            WorkbenchSchedule.dataset_id == dataset_id,
            WorkbenchSchedule.season == season,
            WorkbenchSchedule.game_id.like("004%"),
        )
    ).all()
    linked = {(game_date, franchise(home)): game_id for game_id, game_date, home in stored}
    groups: dict[tuple[int, str | None], int] = {}
    built: list[SeasonSeries] = []
    ordered = sorted(
        listed,
        key=lambda s: (
            classify_round(s["round"], season).number,
            _GROUP_ORDER.get(classify_round(s["round"], season).conference, 3),
        ),
    )
    # A league semifinal after division playoffs (1949-50) is played after the division finals.
    divisional = any("Division" in entry["round"] for entry in listed)
    for entry in ordered:
        label = classify_round(entry["round"], season)
        if divisional and entry["round"] == "Semifinals":
            label = type(label)(3, None, "Semifinals")
        games = [
            SeriesGame(
                number=g["number"],
                date=date.fromisoformat(g["date"]),
                home=g["home"],
                visitor=g["visitor"],
                home_points=g["home_points"],
                visitor_points=g["visitor_points"],
                game_id=linked.get((date.fromisoformat(g["date"]), franchise(g["home"]))),
            )
            for g in entry["games"]
        ]
        team1 = games[0].home if games else entry["winner"]
        team2 = entry["loser"] if team1 == entry["winner"] else entry["winner"]
        key = (label.number, label.conference)
        matchup = groups.get(key, 0)
        groups[key] = matchup + 1
        round_number, conference = label.number, label.conference
        _, t1, _ = _identity(team1, season)
        _, t2, _ = _identity(team2, season)
        series_id = f"{ending_year}-{round_number}-{(conference or 'L')[0]}{matchup}"
        slug = _history_slug(ending_year, round_number, conference, t1, t2)
        # Game ids that carry the round (2001-02 on) keep the NBA series id, slug and grouping.
        ids = {g.game_id[:9] for g in games if g.game_id}
        if len(ids) == 1 and all(g.game_id for g in games):
            try:
                info = parse_playoff_game_id(next(g.game_id for g in games if g.game_id))
            except ValueError:
                info = None
            if info is not None and info.canonical_season == season:
                round_number, conference = info.round_number, info.conference
                matchup, series_id = info.matchup_index, info.series_id
                slug = build_series_slug(ending_year, round_number, t1, t2, matchup)
        built.append(
            SeasonSeries(
                season=season,
                ending_year=ending_year,
                round_number=round_number,
                round_name=label.name,
                conference=conference,
                matchup_index=matchup,
                best_of=2 * entry["winner_wins"] - 1,
                team1=team1,
                team2=team2,
                games=games,
                series_id=series_id,
                slug=slug,
            )
        )
    return built


def _played(series: SeasonSeries, cutoff: date | None) -> list[SeriesGame]:
    return [
        g
        for g in series.games
        if (cutoff is None or g.date <= cutoff)
        and g.home_points is not None
        and g.visitor_points is not None
    ]


def _wins(series: SeasonSeries, games: list[SeriesGame]) -> tuple[int, int]:
    f1 = franchise(series.team1)
    won1 = sum(
        1
        for g in games
        if ((g.home_points or 0) > (g.visitor_points or 0) and franchise(g.home) == f1)
        or ((g.visitor_points or 0) > (g.home_points or 0) and franchise(g.visitor) == f1)
    )
    return won1, len(games) - won1


def _summary(
    series: SeasonSeries, cutoff: date | None, seeds: dict[str, int]
) -> PlayoffSeriesSummary:
    games = _played(series, cutoff)
    w1, w2 = _wins(series, games)
    need = (series.best_of + 1) // 2
    id1, t1, n1 = _identity(series.team1, series.season)
    id2, t2, n2 = _identity(series.team2, series.season)
    winner = (id1, t1, n1, w1, w2) if w1 >= need else (id2, t2, n2, w2, w1) if w2 >= need else None
    if winner:
        status, score = "finished", f"{winner[1]} wins {winner[3]}-{winner[4]}"
        text = f"{winner[2]} won series {winner[3]}-{winner[4]}"
    elif games:
        status = "in_progress"
        score = (
            f"{t1} {w1}, {t2} {w2}"
            if w1 == w2
            else (f"{t1} leads {w1}-{w2}" if w1 > w2 else f"{t2} leads {w2}-{w1}")
        )
        text = f"Series tied {w1}-{w2}" if w1 == w2 else score
    else:
        status, score, text = "scheduled", f"{t1} vs {t2}", "Series scheduled"
    return PlayoffSeriesSummary(
        series_id=series.series_id,
        slug=series.slug,
        season=series.season,
        round_number=series.round_number,
        round_name=series.round_name,
        conference=series.conference,
        matchup_index=series.matchup_index,
        team1=TeamSeriesHeader(
            team_id=id1, tricode=t1, name=n1, seed=seeds.get(id1, seeds.get(t1)), wins=w1
        ),
        team2=TeamSeriesHeader(
            team_id=id2, tricode=t2, name=n2, seed=seeds.get(id2, seeds.get(t2)), wins=w2
        ),
        series_score=score,
        status=status,
        winner_team_id=winner[0] if winner else None,
        winner_tricode=winner[1] if winner else None,
        games_count=len(games),
        total_scheduled=series.best_of,
        is_sweep=bool(winner) and min(w1, w2) == 0,
        summary_text=text,
    )


def series_bracket(
    season: str,
    series: list[SeasonSeries],
    cutoff: date | None,
    seeds: dict[str, list[PlayoffSeedEvidence]],
    seed_lookup: dict[str, int],
) -> PlayoffBracketResponse:
    """The bracket of a season from its series, grouped by round as the page shows them."""
    summaries = [_summary(s, cutoff, seed_lookup) for s in series]
    rounds: list[PlayoffRoundResponse] = []
    for number in sorted({s.round_number for s in summaries}):
        listed = sorted(
            (s for s in summaries if s.round_number == number),
            key=lambda s: (_GROUP_ORDER.get(s.conference, 3), s.matchup_index),
        )
        names = list(dict.fromkeys(s.round_name for s in listed))
        rounds.append(
            PlayoffRoundResponse(
                round_number=number,
                round_name=" / ".join(names),
                eastern_series=[s for s in listed if s.conference == "Eastern"],
                western_series=[s for s in listed if s.conference == "Western"],
                finals_series=[s for s in listed if s.conference is None],
                series=listed,
            )
        )
    disclaimers = list(PLAYOFF_DISCLAIMERS)
    if season < FIRST_RECONSTRUCTED_SEEDS:
        disclaimers.insert(0, HISTORY_DISCLAIMER)
    return PlayoffBracketResponse(
        season=season,
        season_year=int(season[:4]) + 1,
        cutoff_date=str(cutoff) if cutoff else None,
        rounds=rounds,
        seeds=seeds,
        capabilities=dict(PLAYOFF_CAPABILITIES),
        disclaimers=disclaimers,
    )


def find_series(series: list[SeasonSeries], identifier: str) -> SeasonSeries | None:
    wanted = identifier.strip().lower()
    for entry in series:
        t1, t2 = entry.slug.rsplit("-", 2)[-2:] if entry.slug.count("-") >= 3 else ("", "")
        # A game id names its series too ("0042300401" is the 2024 Finals' Game 1).
        aliases = {entry.series_id.lower(), entry.slug.lower()} | {
            g.game_id for g in entry.games if g.game_id
        }
        if entry.round_number == 4:
            aliases.add(f"{entry.ending_year}-finals")
        if t1 and t2:
            aliases.add(entry.slug.lower().replace(f"{t1}-{t2}", f"{t2}-{t1}"))
        if wanted in aliases:
            return entry
    return None


def series_detail(
    session: Session,
    dataset_id: str,
    series: SeasonSeries,
    cutoff: date | None,
    seed_lookup: dict[str, int],
) -> PlayoffSeriesDetailResponse:
    """One series: its games, team factors and player totals where the release has box scores."""
    summary = _summary(series, cutoff, seed_lookup)
    played = _played(series, cutoff)
    sides = {
        franchise(series.team1): summary.team1.team_id,
        franchise(series.team2): summary.team2.team_id,
    }
    cards = []
    for game in series.games:
        shown = game in played
        home_id, home_tri, _ = _identity(game.home, series.season)
        away_id, away_tri, _ = _identity(game.visitor, series.season)
        hp, vp = (game.home_points, game.visitor_points) if shown else (None, None)
        cards.append(
            PlayoffGameCard(
                game_id=game.game_id or f"{series.series_id}-{game.number}",
                game_number=game.number,
                game_date=game.date.isoformat(),
                home_team_id=home_id,
                home_team_tricode=home_tri,
                away_team_id=away_id,
                away_team_tricode=away_tri,
                home_score=hp,
                away_score=vp,
                status="final" if hp is not None else "scheduled",
                venue=None,
                winner_team_id=(home_id if hp > vp else away_id)
                if hp is not None and vp is not None and hp != vp
                else None,
                margin=abs(hp - vp) if hp is not None and vp is not None else None,
            )
        )
    linked = [g.game_id for g in played if g.game_id]
    team_rows = (
        session.scalars(
            select(WorkbenchTeamGame).where(
                WorkbenchTeamGame.dataset_id == dataset_id, WorkbenchTeamGame.game_id.in_(linked)
            )
        ).all()
        if linked
        else []
    )
    raw = [
        {
            "game_id": row.game_id,
            "team_id": sides.get(franchise(row.team_id), row.team_id),
            "opponent_id": row.opponent_id,
            "points": row.points,
            "opponent_points": row.opponent_points,
            "stats": row.stats_json or {},
        }
        for row in team_rows
    ]
    stats = []
    for header in (summary.team1, summary.team2):
        factors = aggregate_team_series_factors(header.team_id, raw)
        own = [g for g in played if sides.get(franchise(g.home)) == header.team_id]
        away = [g for g in played if sides.get(franchise(g.visitor)) == header.team_id]
        scored = sum(g.home_points or 0 for g in own) + sum(g.visitor_points or 0 for g in away)
        allowed = sum(g.visitor_points or 0 for g in own) + sum(g.home_points or 0 for g in away)
        count = len(played)
        if not raw and count:
            # No box scores (before 1983-84): the scores alone, every rate unknown.
            factors.update(
                points_per_game=round(scored / count, 1),
                opponent_points_per_game=round(allowed / count, 1),
                average_margin=round((scored - allowed) / count, 2),
            )
        stats.append(
            TeamSeriesStats(
                team_id=header.team_id,
                tricode=header.tricode,
                team_name=header.name,
                seed=header.seed,
                wins=header.wins,
                losses=count - header.wins,
                games_played=count,
                points_per_game=factors["points_per_game"],
                opponent_points_per_game=factors["opponent_points_per_game"],
                average_margin=factors["average_margin"],
                pace=factors["pace"],
                off_rating=factors["off_rating"],
                def_rating=factors["def_rating"],
                net_rating=factors["net_rating"],
                efg_pct=factors["efg_pct"],
                tov_pct=factors["tov_pct"],
                oreb_pct=factors["oreb_pct"],
                ftr=factors["ftr"],
                totals=factors["totals"],
            )
        )
    players: list[list[PlayerSeriesStats]] = [[], []]
    if linked:
        rows = session.scalars(
            select(WorkbenchPlayerGame).where(
                WorkbenchPlayerGame.dataset_id == dataset_id,
                WorkbenchPlayerGame.game_id.in_(linked),
            )
        ).all()
        names = {
            ident.external_id: ident.display_name
            for ident in session.scalars(
                select(WorkbenchIdentity).where(
                    WorkbenchIdentity.external_id.in_({r.player_id for r in rows}),
                    WorkbenchIdentity.kind == "player",
                )
            )
        }
        for index, header in enumerate((summary.team1, summary.team2)):
            mine: list[dict[str, Any]] = [
                {
                    "player_id": r.player_id,
                    "team_id": header.team_id,
                    "appearance": r.appearance,
                    "minutes_seconds": r.minutes_seconds,
                    "points": r.points,
                    "stats": r.stats_json or {},
                }
                for r in rows
                if sides.get(franchise(r.team_id)) == header.team_id
            ]
            players[index] = [
                PlayerSeriesStats(**p) for p in aggregate_player_series_stats(mine, names)
            ]
    disclaimers = list(PLAYOFF_DISCLAIMERS)
    if series.season < FIRST_RECONSTRUCTED_SEEDS:
        disclaimers.insert(0, HISTORY_DISCLAIMER)
    return PlayoffSeriesDetailResponse(
        series_id=series.series_id,
        slug=series.slug,
        season=series.season,
        season_year=series.ending_year,
        round_number=series.round_number,
        round_name=series.round_name,
        conference=series.conference,
        matchup_index=series.matchup_index,
        status=summary.status,
        series_score=summary.series_score,
        winner_team_id=summary.winner_team_id,
        winner_tricode=summary.winner_tricode,
        cutoff_date=str(cutoff) if cutoff else None,
        team1=stats[0],
        team2=stats[1],
        game_cards=cards,
        team1_players=players[0],
        team2_players=players[1],
        capabilities=dict(PLAYOFF_CAPABILITIES),
        disclaimers=disclaimers,
    )
