"""Read-only Roster Shapes v2: rosters sized by DARKO DPM, shaped by an estimated ease of fit.

Contract: docs/design/roster-shapes-v2.md. Inputs are the pinned NBA player index (2026-27
projected rosters), the published statistics release (minutes, games and teams), the sealed DARKO
bundle (DPM and its playoff snapshots) and the PC09 archetype serving manifest. Nothing is fitted.
"""

from __future__ import annotations

from bisect import bisect_left, bisect_right
from datetime import date
from typing import Any

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from courtlens.archive_models import ArchivePlayerGame
from courtlens.domain.teams import NBA_TEAMS, get_team_info
from courtlens.services.darko import ATTRIBUTION as DARKO_ATTRIBUTION
from courtlens.services.darko import load_darko_store
from courtlens.services.player_context import context_catalog, projected_roster
from courtlens.services.value_archetypes import _archetype, load_value_store
from courtlens.services.workbench_analytics import _load_player_games, resolve_workbench_context
from courtlens.workbench_models import WorkbenchIdentity, WorkbenchPlayerGame

VERSION = "courtlens-roster-shapes-v2"
SEASON = "2026-27"
# Databallr's sizing: DPM above a -2.0 replacement level to the power 2.2, times minutes per game.
REPLACEMENT_LEVEL = -2.0
EXPONENT = 2.2
TEAM_MINUTES = 240.0
# The box is a team whose 240 minutes are all played by +BOX_NET/5 DPM players (Databallr's +17.4).
BOX_NET = 17.4
# Equal-count bands of the fit-ease score, 0 = plugs in anywhere ... 7 = hardest to fit.
FIT_BANDS = 8
# Playoff games of shrinkage toward no shift.
PLAYOFF_PRIOR_GAMES = 10
PROJECTED_GAMES = 82
CREDIT = (
    "After the Wyman diagrams by @taylormetrics and Databallr's Roster Shapes. "
    "Player ratings: DARKO DPM."
)
LIMITATIONS = [
    "Size is (DPM + 2.0)^2.2 x minutes per team game. It is descriptive, not a forecast, a team "
    "rating or a verdict; DPM is a model estimate under lineup confounding, not causal.",
    "Projected rosters use 2025-26 minutes over 82 games; a roster whose minutes add up to more "
    "than 240 a game is scaled down to 240. No 2026-27 minute has been played.",
    "Shape is an estimate of ease of fit: the mean league percentile of DPM, defensive DPM, "
    "three-point rate and inverse usage, in eight equal bands. Read it as a lean, not a stat.",
    "Playoff-adjusted moves each player by his DARKO offensive DPM change across the playoffs "
    f"he played, weighted by playoff games and shrunk by {PLAYOFF_PRIOR_GAMES} games toward no "
    "change. Players without playoff games are not moved. It is a proxy for Databallr's "
    "adjustment and does not model playability.",
    "Derived archetypes describe one season's statistical style, not a listed position.",
    "Players without a DPM or minutes are unknown and never drawn as zero; team fills are lower "
    "bounds.",
    "White is the gap to the box, a +17.4 team: what a perfect team would add, not cap space.",
]


def box_capacity() -> float:
    return float((BOX_NET / 5 - REPLACEMENT_LEVEL) ** EXPONENT * TEAM_MINUTES)


def shape_size(dpm: float | None, minutes_per_game: float | None) -> float | None:
    """Area in box units; unknown when either input is unknown, zero at or below replacement."""
    if dpm is None or minutes_per_game is None:
        return None
    return float(max(0.0, dpm - REPLACEMENT_LEVEL) ** EXPONENT * max(0.0, minutes_per_game))


def rebalance(minutes: dict[str, float]) -> dict[str, float]:
    """Scale a projected roster's minutes per game down to 240 when they add up to more."""
    total = sum(minutes.values())
    if total <= TEAM_MINUTES:
        return dict(minutes)
    return {pid: value * TEAM_MINUTES / total for pid, value in minutes.items()}


def percentile_ranks(values: dict[str, float]) -> dict[str, float]:
    """Mid-rank percentile in [0, 1] of each value within the pool."""
    ordered = sorted(values.values())
    n = len(ordered)
    out: dict[str, float] = {}
    for key, value in values.items():
        out[key] = (bisect_left(ordered, value) + bisect_right(ordered, value)) / 2 / n
    return out


def fit_ease(inputs: dict[str, dict[str, float]]) -> dict[str, tuple[float, int]]:
    """Ease of fit and its band (0 easiest) for every player with all four inputs."""
    pool = {
        pid: row
        for pid, row in inputs.items()
        if all(key in row for key in ("dpm", "d_dpm", "three_rate", "usg_pct"))
    }
    if not pool:
        return {}
    ranks = {
        key: percentile_ranks({pid: row[key] for pid, row in pool.items()})
        for key in ("dpm", "d_dpm", "three_rate", "usg_pct")
    }
    ease = {
        pid: (
            ranks["dpm"][pid]
            + ranks["d_dpm"][pid]
            + ranks["three_rate"][pid]
            + (1 - ranks["usg_pct"][pid])
        )
        / 4
        for pid in pool
    }
    order = sorted(ease, key=lambda pid: (-ease[pid], pid))
    return {
        pid: (ease[pid], min(FIT_BANDS - 1, position * FIT_BANDS // len(order)))
        for position, pid in enumerate(order)
    }


def playoff_shifts(entries: list[dict[str, Any]], through: str) -> dict[str, tuple[float, int]]:
    """Per player: shrunk games-weighted offensive DPM change across playoffs, and playoff games."""
    regular = {e["season"]: e for e in entries if e["phase"] == "regular_season"}
    totals: dict[str, list[float]] = {}
    for entry in entries:
        if entry["phase"] != "playoffs" or entry["season"] > through:
            continue
        before = regular.get(entry["season"])
        if before is None:
            continue
        for pid, after in entry["players"].items():
            prior = before["players"].get(pid)
            if prior is None or after.get("o_dpm") is None or prior.get("o_dpm") is None:
                continue
            games = int(after.get("career_games") or 0) - int(prior.get("career_games") or 0)
            if games <= 0:
                continue
            row = totals.setdefault(pid, [0.0, 0.0])
            row[0] += (after["o_dpm"] - prior["o_dpm"]) * games
            row[1] += games
    return {pid: (s / (g + PLAYOFF_PRIOR_GAMES), int(g)) for pid, (s, g) in totals.items()}


def continuity(tricode: str, previous: set[str] | None) -> str:
    if not previous:
        return "unknown"
    return "returning" if tricode in previous else "new"


def team_summary(players: list[dict[str, Any]], capacity: float) -> dict[str, Any]:
    sized = [p for p in players if p["size"] is not None and p["size"] > 0]
    total = sum(p["size"] for p in sized)
    playoff = sum(p["size_playoff"] or 0.0 for p in players if p["size_playoff"] is not None)
    eased = [p for p in sized if p["fit_ease"] is not None]
    eased_total = sum(p["size"] for p in eased)
    return {
        "players": len(players),
        "sized_players": len(sized),
        "below_replacement_players": sum(p["size"] == 0 for p in players),
        "unknown_players": sum(p["size"] is None for p in players),
        "size": total,
        "size_playoff": playoff,
        "fill": total / capacity,
        "fill_playoff": playoff / capacity,
        # Size-weighted ease of the drawn players: how easily this roster fits together.
        "fit_ease": sum(p["fit_ease"] * p["size"] for p in eased) / eased_total
        if eased_total > 0
        else None,
    }


def _latest_index(session: Session) -> str:
    catalog = context_catalog(session, SEASON)
    index = next(c for c in catalog["capabilities"] if c["name"] == "player_index")
    if index["dataset"] is None:
        raise HTTPException(503, f"No {SEASON} player index has been admitted.")
    return str(index["dataset"].dataset_id)


def _season_minutes(
    session: Session, release_id: str | None, season: str
) -> tuple[str, dict[tuple[str, str], tuple[float, int, str]], dict[str, int]]:
    """Regular-season (player, team) -> (minutes, games, name) and team games for one season."""
    context = resolve_workbench_context(
        session,
        release_id=release_id,
        requested_season=season,
        requested_phase="regular_season",
        requested_before_date=date(int(season[:4]) + 1, 7, 1),
    )
    rows: dict[tuple[str, str], tuple[float, int, str]] = {}
    team_games: dict[str, set[str]] = {}
    if context.dataset_type == "workbench":
        wpg = WorkbenchPlayerGame
        query = (
            select(
                wpg.player_id,
                wpg.team_id,
                func.sum(wpg.minutes_seconds),
                func.count(),
                func.max(WorkbenchIdentity.display_name),
            )
            .outerjoin(
                WorkbenchIdentity,
                (WorkbenchIdentity.external_id == wpg.player_id)
                & (WorkbenchIdentity.kind == "player"),
            )
            .where(
                wpg.dataset_id == context.dataset_id,
                wpg.season == season,
                wpg.phase == "regular_season",
                wpg.appearance == "appeared",
            )
            .group_by(wpg.player_id, wpg.team_id)
        )
        for pid, team, seconds, games, name in session.execute(query).all():
            rows[(str(pid), str(team))] = ((seconds or 0) / 60, int(games), name or str(pid))
        games_query = (
            select(wpg.team_id, func.count(func.distinct(wpg.game_id)))
            .where(
                wpg.dataset_id == context.dataset_id,
                wpg.season == season,
                wpg.phase == "regular_season",
            )
            .group_by(wpg.team_id)
        )
        return (
            context.release_id,
            rows,
            {str(t): int(n) for t, n in session.execute(games_query).all()},
        )
    totals: dict[tuple[str, str], list[Any]] = {}
    for game in _load_player_games(session, context):
        team_games.setdefault(game["team_id"], set()).add(game["game_id"])
        if game["appearance"] != "appeared":
            continue
        row = totals.setdefault((game["player_id"], game["team_id"]), [0.0, 0, game["player_name"]])
        row[0] += (game["minutes_seconds"] or 0) / 60
        row[1] += 1
    rows = {key: (float(v[0]), int(v[1]), str(v[2])) for key, v in totals.items()}
    return context.release_id, rows, {t: len(g) for t, g in team_games.items()}


def _previous_teams(session: Session, release_id: str | None, season: str) -> dict[str, set[str]]:
    """Team tricodes each player appeared for in a regular season."""
    context = resolve_workbench_context(
        session,
        release_id=release_id,
        requested_season=season,
        requested_phase="regular_season",
        requested_before_date=date(int(season[:4]) + 1, 7, 1),
    )
    model = WorkbenchPlayerGame if context.dataset_type == "workbench" else ArchivePlayerGame
    query = (
        select(model.player_id, model.team_id)
        .where(
            model.dataset_id == context.dataset_id,
            model.season == season,
            model.appearance == "appeared",
        )
        .distinct()
    )
    if context.dataset_type == "workbench":
        query = query.where(WorkbenchPlayerGame.phase == "regular_season")
    teams: dict[str, set[str]] = {}
    for player_id, team_id in session.execute(query).all():
        info = get_team_info(str(team_id))
        teams.setdefault(str(player_id), set()).add(info.tricode if info else str(team_id))
    return teams


def _prior(season: str) -> str:
    start = int(season[:4]) - 1
    return f"{start}-{(start + 1) % 100:02d}"


_cache: dict[tuple[str, str | None, str | None, str | None], dict[str, Any]] = {}


def roster_shapes(
    session: Session,
    dataset_id: str | None,
    statistics_release_id: str | None,
    season: str | None = None,
) -> dict[str, Any]:
    store = load_value_store()
    if store is None:
        raise HTTPException(503, "No sealed value/archetype serving manifest installed.")
    darko = load_darko_store()
    if darko is None:
        raise HTTPException(503, "No sealed DARKO bundle installed.")
    reference_season = _prior(SEASON)
    season = season or SEASON
    if season not in (SEASON, reference_season):
        raise HTTPException(422, f"Roster Shapes cover {SEASON} and {reference_season}.")
    projected = season == SEASON
    index_id = (dataset_id or _latest_index(session)) if projected else None
    # Default to the published public release, as every other workbench page does.
    release_id = statistics_release_id or resolve_workbench_context(session).release_id
    key = (season, index_id, release_id, darko.get("sealed_at"))
    if key in _cache:
        return _cache[key]

    entry = next(
        (
            e
            for e in darko["entries"]
            if e["season"] == reference_season and e["phase"] == "regular_season"
        ),
        None,
    )
    if entry is None:
        raise HTTPException(503, f"No {reference_season} DARKO regular-season snapshot sealed.")
    ratings: dict[str, dict[str, Any]] = entry["players"]
    shifts = playoff_shifts(darko["entries"], reference_season)
    archetypes = store["archetypes"]["players"]
    clusters = store["archetypes"]["names"]["clusters"]
    ease = fit_ease(
        {
            pid: {
                **{k: float(r[k]) for k in ("dpm", "d_dpm") if r.get(k) is not None},
                **{
                    k: float(archetypes[pid]["features"][k])
                    for k in ("three_rate", "usg_pct")
                    if pid in archetypes and archetypes[pid]["features"].get(k) is not None
                },
            }
            for pid, r in ratings.items()
        }
    )

    # Each roster row: (player id, name, listed position, minutes per team game, games).
    rosters: dict[str, list[tuple[str, str, str | None, float | None, int | None]]] = {}
    roster_context: dict[str, Any] | None = None
    label = f"{season} · projected" if projected else season
    if projected:
        assert index_id is not None
        roster = projected_roster(session, index_id, None, release_id)
        release_id = roster["statistics_release_id"]
        roster_context = roster["context"].model_dump(mode="json")
        label = roster["label"]
        previous = _previous_teams(session, release_id, reference_season)
        by_team: dict[str, dict[str, float]] = {}
        for row in roster["players"]:
            reference = row["reference"]
            minutes = reference["metrics"].get("min") if reference else None
            if minutes is not None:
                by_team.setdefault(row["team_tricode"], {})[row["player_id"]] = (
                    float(minutes) / PROJECTED_GAMES
                )
        balanced = {team: rebalance(values) for team, values in by_team.items()}
        for row in roster["players"]:
            reference = row["reference"]
            games = reference["metrics"].get("gp") if reference else None
            rosters.setdefault(row["team_tricode"], []).append(
                (
                    row["player_id"],
                    row["name"],
                    row.get("listed_position"),
                    balanced.get(row["team_tricode"], {}).get(row["player_id"]),
                    int(games) if games is not None else None,
                )
            )
    else:
        release_id, minutes_rows, team_games = _season_minutes(session, release_id, season)
        previous = _previous_teams(session, release_id, _prior(season))
        for (pid, team_id), (minutes, games, name) in minutes_rows.items():
            info = get_team_info(team_id)
            if info is None or not team_games.get(team_id):
                continue
            rosters.setdefault(info.tricode, []).append(
                (pid, name, None, minutes / team_games[team_id], games)
            )

    capacity = box_capacity()
    teams = []
    for info in sorted(NBA_TEAMS.values(), key=lambda t: t.tricode):
        players: list[dict[str, Any]] = []
        for pid, name, position, mpg, games in rosters.get(info.tricode, []):
            rating = ratings.get(pid)
            dpm = float(rating["dpm"]) if rating and rating.get("dpm") is not None else None
            shift, playoff_games = shifts.get(pid, (0.0, 0))
            archetype = _archetype(store, archetypes.get(pid))
            if archetype is not None:
                archetype.pop("features")
            fit = ease.get(pid)
            players.append(
                {
                    "player_id": pid,
                    "player_name": name,
                    "listed_position": position,
                    "dpm": dpm,
                    "o_dpm": rating.get("o_dpm") if rating else None,
                    "d_dpm": rating.get("d_dpm") if rating else None,
                    "playoff_shift": shift if dpm is not None else None,
                    "playoff_games": playoff_games,
                    "minutes_per_game": mpg,
                    "games": games,
                    "size": shape_size(dpm, mpg),
                    "size_playoff": shape_size(None if dpm is None else dpm + shift, mpg),
                    "archetype": archetype,
                    "fit_ease": fit[0] if fit else None,
                    "fit_band": fit[1] if fit else None,
                    "continuity": continuity(info.tricode, previous.get(pid)),
                    "previous_teams": sorted(previous.get(pid, set())),
                    "unknown_reasons": [
                        reason
                        for reason, missing in (
                            (f"No {reference_season} DARKO DPM.", dpm is None),
                            (
                                f"No {reference_season} regular-season minutes."
                                if projected
                                else "No minutes.",
                                mpg is None,
                            ),
                            (
                                "No regular-season feature sample; archetype and fit are unknown.",
                                archetype is None,
                            ),
                        )
                        if missing
                    ],
                }
            )
        players.sort(key=lambda p: (p["size"] is None, -(p["size"] or 0.0), p["player_name"]))
        teams.append(
            {
                "team_id": info.team_id,
                "team_tricode": info.tricode,
                "team_name": info.name,
                "conference": info.conference,
                **team_summary(players, capacity),
                "roster": players,
            }
        )
    result = {
        "version": VERSION,
        "season": season,
        "seasons": [
            {"season": SEASON, "label": f"{SEASON} · projected", "projected": True},
            {"season": reference_season, "label": reference_season, "projected": False},
        ],
        "projected": projected,
        "label": label,
        "reference_season": reference_season,
        "replacement_level": REPLACEMENT_LEVEL,
        "exponent": EXPONENT,
        "box_net": BOX_NET,
        "capacity": capacity,
        "fit_bands": FIT_BANDS,
        "playoff_prior_games": PLAYOFF_PRIOR_GAMES,
        "dpm": {
            "season": entry["season"],
            "as_of": entry["as_of"],
            "data_date": entry["data_date"],
            "raw_sha256": entry["raw_sha256"],
            "source": DARKO_ATTRIBUTION,
        },
        "archetypes": {
            "artifact_sha256": store["archetypes"]["sha256"],
            "names_status": store["archetypes"]["names"]["status"],
            "clusters": [
                {
                    "cluster": i,
                    "name": c["name"],
                    "short": c["short"],
                    "description": c["description"],
                    "color_token": f"--color-category-{i + 1}" if i < 6 else None,
                }
                for i, c in enumerate(clusters)
            ],
        },
        "roster_context": roster_context,
        "statistics_release_id": release_id,
        "credit": CREDIT,
        "limitations": LIMITATIONS,
        "teams": teams,
    }
    _cache[key] = result
    return result
