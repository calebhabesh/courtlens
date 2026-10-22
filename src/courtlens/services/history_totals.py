"""Season totals before the game logs (1946-47 to 1982-83), as a release serves them (FH04).

A workbench dataset pins one sealed seasons file by SHA-256 (``coverage_json.history``); its
rows live in ``bbref_player_seasons``. A season counts as season-totals-only when the dataset has
no game rows for it. Such a season has no dates inside it, so its rows stand at a fixed season
end (30 June) and count only for cutoffs after it: a whole season, never part of one.
"""

from __future__ import annotations

from datetime import date
from typing import TYPE_CHECKING, Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from courtlens.reference_models import BbrefPlayerSeason

if TYPE_CHECKING:
    from courtlens.domain.query_spec import QuerySpec
    from courtlens.services.workbench_analytics import ResolvedContext

BASIS_GAMES = "games"
BASIS_TOTALS = "season_totals"
_SEASONS: dict[str, list[tuple[str, str]]] = {}


def season_end_date(season: str) -> date:
    return date(int(season[:4]) + 1, 6, 30)


def season_start_date(season: str) -> date:
    return date(int(season[:4]), 10, 1)


def pinned_sha(dataset: Any) -> str | None:
    history = (getattr(dataset, "coverage_json", None) or {}).get("history") or {}
    sha = history.get("season_totals_sha256")
    return str(sha) if sha else None


def totals_scopes(session: Session, sha: str | None) -> list[tuple[str, str]]:
    """(season, phase) pairs in a sealed seasons file, cached: the file never changes."""
    if not sha:
        return []
    if sha not in _SEASONS:
        _SEASONS[sha] = [
            (str(season), str(phase))
            for season, phase in session.execute(
                select(BbrefPlayerSeason.season, BbrefPlayerSeason.phase)
                .where(BbrefPlayerSeason.source_sha256 == sha)
                .distinct()
                .order_by(BbrefPlayerSeason.season, BbrefPlayerSeason.phase)
            )
        ]
    return _SEASONS[sha]


def totals_seasons_in_scope(context: ResolvedContext, query: QuerySpec) -> list[str]:
    """The query's seasons this release serves as season totals (whole-season windows only)."""
    from courtlens.domain.query_spec import WindowKind

    if not context.totals_sha or query.window.kind != WindowKind.SEASON:
        return []
    seasons = query.season_scope.seasons or [query.season or context.season]
    return sorted(season for season in seasons if season in context.totals_seasons)


def player_team_seasons(
    session: Session,
    sha: str | None,
    seasons: tuple[str, ...] | list[str],
    *,
    player_ids: list[str] | None = None,
    phase: str | None = None,
) -> list[tuple[str, str, str, str, int]]:
    """(player, season, phase, team, games) for each played team-season served as totals."""
    if not sha or not seasons:
        return []
    query = select(
        BbrefPlayerSeason.player_id,
        BbrefPlayerSeason.season,
        BbrefPlayerSeason.phase,
        BbrefPlayerSeason.team_id,
        BbrefPlayerSeason.games,
    ).where(
        BbrefPlayerSeason.source_sha256 == sha,
        BbrefPlayerSeason.is_summary.is_(False),
        BbrefPlayerSeason.games > 0,
        BbrefPlayerSeason.season.in_(list(seasons)),
    )
    if player_ids is not None:
        query = query.where(BbrefPlayerSeason.player_id.in_(player_ids))
    if phase is not None:
        query = query.where(BbrefPlayerSeason.phase == phase)
    return [
        (str(p), str(s), str(ph), str(t), int(g or 0)) for p, s, ph, t, g in session.execute(query)
    ]


# A peak season is a full season's work: 1,500 minutes, or 40 games before minutes were kept.
PEAK_MIN_MINUTES = 1500
PEAK_MIN_GAMES = 40


def _number(value: Any) -> float | None:
    try:
        return None if value is None else float(value)
    except (TypeError, ValueError):
        return None


def peak_seasons(
    session: Session, sha: str | None, player_ids: list[str]
) -> dict[str, tuple[str, str] | None]:
    """Each player's best regular season by Basketball-Reference's own measures.

    Ranked by BPM when every qualifying season has one (1973-74 on); otherwise by WS/48, or by
    Win Shares before minutes were kept, so one career is ranked by one measure. Ties go to the
    earlier season. Each peak is (season, measure); None when no season qualifies or the release
    pins no seasons file.
    """
    peaks: dict[str, tuple[str, str] | None] = dict.fromkeys(player_ids)
    if not sha or not player_ids:
        return peaks
    rows = session.execute(
        select(
            BbrefPlayerSeason.player_id,
            BbrefPlayerSeason.season,
            BbrefPlayerSeason.is_summary,
            BbrefPlayerSeason.games,
            BbrefPlayerSeason.minutes,
            BbrefPlayerSeason.advanced_json,
        ).where(
            BbrefPlayerSeason.source_sha256 == sha,
            BbrefPlayerSeason.phase == "regular_season",
            BbrefPlayerSeason.player_id.in_(player_ids),
            BbrefPlayerSeason.games > 0,
        )
    ).all()
    # A traded player's season is its summary row (all teams); otherwise the single team row.
    seasons: dict[str, dict[str, tuple[bool, int, float | None, dict[str, Any]]]] = {}
    for pid, season, is_summary, games, minutes, advanced in rows:
        held = seasons.setdefault(str(pid), {}).get(str(season))
        if held is None or (is_summary and not held[0]):
            seasons[str(pid)][str(season)] = (
                bool(is_summary),
                int(games or 0),
                _number(minutes),
                advanced or {},
            )
    for pid, by_season in seasons.items():
        peaks[pid] = peak_of({s: row[1:] for s, row in by_season.items()})
    return peaks


def peak_of(
    by_season: dict[str, tuple[int, float | None, dict[str, Any]]],
) -> tuple[str, str] | None:
    """(season, measure) of one career's best qualifying season, from (games, minutes, advanced)."""
    qualified = {
        season: advanced
        for season, (games, minutes, advanced) in by_season.items()
        if (minutes is not None and minutes >= PEAK_MIN_MINUTES)
        or (minutes is None and games >= PEAK_MIN_GAMES)
    }
    for measure in ("bpm", "ws_per_48", "ws"):
        values = {s: _number(a.get(measure)) for s, a in qualified.items()}
        if values and all(v is not None for v in values.values()):
            # Sorted first, so a tie goes to the earlier season.
            return max(sorted(values), key=lambda s: values[s] or 0.0), measure
    return None


def dataset_totals(session: Session, dataset_id: str | None) -> tuple[str | None, tuple[str, ...]]:
    """The pinned seasons file of a dataset and the seasons it serves only as totals."""
    from courtlens.services.workbench_analytics import _dataset_facts
    from courtlens.workbench_models import WorkbenchDataset

    if dataset_id is None:
        return None, ()
    dataset = session.get(WorkbenchDataset, dataset_id)
    if dataset is None:
        return None, ()
    facts = _dataset_facts(session, dataset)
    return facts["totals_sha"], facts["totals_seasons"]


SUMMARY_FIELDS = (
    "points",
    "rebounds_offensive",
    "rebounds_defensive",
    "rebounds_total",
    "assists",
    "steals",
    "blocks",
    "turnovers",
    "fouls_personal",
    "field_goals_made",
    "field_goals_attempted",
    "three_pointers_made",
    "three_pointers_attempted",
    "free_throws_made",
    "free_throws_attempted",
)


def summary_rows(
    session: Session, context: ResolvedContext, player_id: str
) -> list[dict[str, Any]]:
    """A totals season's team rows as summary input for ``compute_metrics`` (never a game log).

    Every summary value is a sum, a mean of a sum over its known games, a ratio of sums or a
    rate over minutes, so a team-season of G games enters as G rows: the first carries the season
    totals and the others zeros. That reproduces the season's totals exactly; a stat the source
    did not record is null in every row and stays unknown.
    """
    if context.season not in context.totals_seasons or not context.totals_sha:
        return []
    if season_end_date(context.season) >= context.before_date:
        return []  # a cutoff inside the season: the whole-season totals are not admissible
    rows = session.scalars(
        select(BbrefPlayerSeason).where(
            BbrefPlayerSeason.source_sha256 == context.totals_sha,
            BbrefPlayerSeason.season == context.season,
            BbrefPlayerSeason.phase == context.phase,
            BbrefPlayerSeason.player_id == player_id,
            BbrefPlayerSeason.is_summary.is_(False),
            BbrefPlayerSeason.games > 0,
        )
    ).all()
    out: list[dict[str, Any]] = []
    ended = season_end_date(context.season)
    for row in rows:
        stats = row.stats_json or {}
        games = int(row.games or 0)
        for index in range(games):
            first = index == 0
            minutes = None if row.minutes is None else (row.minutes * 60 if first else 0)
            out.append(
                {
                    "game_id": f"S{context.season}:{row.team_id}:{index}",
                    "game_date": ended,
                    "season": context.season,
                    "phase": context.phase,
                    "player_id": player_id,
                    "team_id": row.team_id,
                    "opponent_id": None,
                    "appearance": "appeared",
                    "minutes_seconds": minutes,
                    **{
                        field: None if stats.get(field) is None else (stats[field] if first else 0)
                        for field in SUMMARY_FIELDS
                    },
                }
            )
    return out
