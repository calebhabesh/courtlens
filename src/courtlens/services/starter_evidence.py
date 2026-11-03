"""Observed starting units from admitted box-score evidence (Team Comparison's By Position).

Method `courtlens-prototype-observed-starting-unit-v1` (docs/research/courtlens-observed-
starters.md), read live against the current release instead of a release-pinned file, so a
new publication can't silently switch By Position off. A team-game is verified only when every
appeared player has a raw box-score row, every position field is empty or G/F/C, and exactly
five carry a G/F/C starting position. Other games stay unknown, never counted as bench.
The unit is the five-player set that started most verified games; ties pick the most recent
unit, then sorted IDs. Reproduces all 1,192 scopes of the sealed 2026-10-17 snapshot.
"""

from __future__ import annotations

import csv
import threading
from collections import Counter
from datetime import date
from pathlib import Path
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from courtlens.config import get_settings
from courtlens.domain.teams import get_team_info
from courtlens.services.starting_positions import PositionEvidenceUnavailable, _stat, _verify
from courtlens.services.workbench_analytics import ResolvedContext
from courtlens.workbench_models import WorkbenchDataset, WorkbenchPlayerGame

METHOD = "courtlens-prototype-observed-starting-unit-v1"

_lock = threading.Lock()
_rows: dict[tuple[str, int, int], dict[tuple[str, str], str]] = {}


def _raw_rows(path: Path) -> dict[tuple[str, str], str]:
    """(game, person) → the raw position field, empty for non-starters. Missing = no raw row."""
    key = _stat(path)
    with _lock:
        cached = _rows.get(key)
    if cached is not None:
        return cached
    rows: dict[tuple[str, str], str] = {}
    with path.open("r", encoding="utf-8-sig", newline="") as stream:
        for row in csv.DictReader(stream):
            rows[(str(row["game_id"]), str(row["person_id"]))] = (
                (row.get("position") or "").strip().upper()
            )
    with _lock:
        if len(_rows) > 4:
            _rows.clear()
        _rows[key] = rows
    return rows


def observed_unit(
    appearances: list[tuple[str, date, str]], raw: dict[tuple[str, str], str]
) -> dict[str, Any]:
    """One team-scope's unit and counts from (game, date, player) appearances."""
    games: dict[str, tuple[date, list[str]]] = {}
    for game_id, day, player_id in appearances:
        games.setdefault(game_id, (day, []))[1].append(player_id)
    starts: Counter[str] = Counter()
    bench: Counter[str] = Counter()
    unknown: Counter[str] = Counter()
    units: Counter[tuple[str, ...]] = Counter()
    latest: dict[tuple[str, ...], tuple[date, str, dict[str, str]]] = {}
    seen: dict[tuple[str, ...], list[tuple[date, str, dict[str, str]]]] = {}
    verified = 0
    for game_id, (day, players) in games.items():
        fields = [raw.get((game_id, player)) for player in players]
        starters = {p: f for p, f in zip(players, fields, strict=True) if f in ("G", "F", "C")}
        valid = all(f is not None and f in ("", "G", "F", "C") for f in fields)
        if not valid or len(starters) != 5:
            unknown.update(players)
            continue
        verified += 1
        unit = tuple(sorted(starters))
        units[unit] += 1
        seen.setdefault(unit, []).append((day, game_id, starters))
        if unit not in latest or (day, game_id) > latest[unit][:2]:
            latest[unit] = (day, game_id, starters)
        for player in players:
            (starts if player in starters else bench)[player] += 1
    result: dict[str, Any] = {
        "team_games": len(games),
        "verified_games": verified,
        "unknown_games": len(games) - verified,
        "unit_games": 0,
        "unit_ties": 0,
        "unit_players": [],
    }
    if units:
        top = max(units.values())
        tied = [unit for unit, count in units.items() if count == top]
        best = max(
            tied, key=lambda unit: (latest[unit][0], latest[unit][1], [-int(p) for p in unit])
        )
        # Each player's label: the most common across the unit's starts (earliest wins a tie).
        games_of = sorted(seen[best], key=lambda game: (game[0], game[1]))
        positions = {p: Counter(game[2][p] for game in games_of).most_common(1)[0][0] for p in best}
        result |= {
            "unit_games": top,
            "unit_ties": len(tied),
            "unit_players": [{"player_id": p, "position": positions[p]} for p in best],
        }
    everyone = sorted(set(starts) | set(bench) | set(unknown))
    # Like the sealed snapshot: a player never seen in a verified game has unknown counts.
    result["players"] = [
        {
            "player_id": p,
            "starts": starts[p] if p in starts or p in bench else None,
            "bench_appearances": bench[p] if p in starts or p in bench else None,
            "unknown_appearances": unknown[p],
        }
        for p in everyone
    ]
    return result


def team_starters(session: Session, context: ResolvedContext, team_id: str) -> dict[str, Any]:
    if context.dataset_type != "workbench":
        raise PositionEvidenceUnavailable("starter evidence requires a workbench release")
    dataset = session.get(WorkbenchDataset, context.dataset_id)
    years = (dataset.manifest_json or {}).get("admitted_years") if dataset else None
    if dataset is None or not isinstance(years, list):
        raise PositionEvidenceUnavailable("release has no admitted raw manifest")
    year = int(context.season[:4]) + 1
    if year not in years:
        raise PositionEvidenceUnavailable("season is outside the release's raw evidence")
    root = get_settings().raw_store_path
    path = root / f"sportsdataverse_{year}" / f"player_boxscores_{year}.csv"
    if not path.is_file():
        raise PositionEvidenceUnavailable("player box-score evidence is missing")
    _verify(dataset, [int(y) for y in years], root)
    # Franchise id or stored code, as team detail accepts (SEA for the Thunder in 2005-06).
    info = get_team_info(team_id)
    match_ids = {team_id} | ({info.team_id, info.tricode} if info else set())
    appearances = [
        (str(game), day, str(player))
        for game, day, player in session.execute(
            select(
                WorkbenchPlayerGame.game_id,
                WorkbenchPlayerGame.game_date,
                WorkbenchPlayerGame.player_id,
            ).where(
                WorkbenchPlayerGame.dataset_id == context.dataset_id,
                WorkbenchPlayerGame.season == context.season,
                WorkbenchPlayerGame.phase == context.phase,
                WorkbenchPlayerGame.game_date < context.before_date,
                WorkbenchPlayerGame.team_id.in_(match_ids),
                WorkbenchPlayerGame.appearance == "appeared",
            )
        )
    ]
    return {
        "method": METHOD,
        "release_id": context.release_id,
        "dataset_id": context.dataset_id,
        "season": context.season,
        "phase": context.phase,
        "before_date": context.before_date.isoformat(),
        **observed_unit(appearances, _raw_rows(path)),
    }
