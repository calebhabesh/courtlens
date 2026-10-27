"""Release-bound starting-position labels derived from admitted box-score evidence.

The admitted NBA box scores record a G/F/C position only for each game's starters. A
player's label is the position recorded in a strict majority of their starts in the
selected season and phase before the cutoff. Players without such a majority (including
every player with no starts) stay unlabelled; nothing is inferred from names, roles,
assists or current rosters.
"""

from __future__ import annotations

import csv
import threading
from collections import Counter
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

from sqlalchemy import select
from sqlalchemy.orm import Session

from courtlens.config import get_settings
from courtlens.services.workbench_analytics import ResolvedContext
from courtlens.workbench_models import WorkbenchDataset, WorkbenchPlayerGame

POSITION_POLICY = "starting-position-majority-v1"
Position = Literal["guard", "forward", "center"]
POSITION_CODES: dict[Position, str] = {"guard": "G", "forward": "F", "center": "C"}

_lock = threading.Lock()
_verified: dict[tuple[str, tuple[tuple[str, int, int], ...]], bool] = {}
_files: dict[tuple[str, int, int], dict[tuple[str, str], str]] = {}


class PositionEvidenceUnavailable(ValueError):
    """The release's raw box-score evidence cannot be verified or does not cover the season."""


@dataclass(frozen=True)
class PositionCohort:
    policy: str
    season: str
    phase: str
    before_date: str
    labels: dict[str, str]
    starts: dict[str, int]

    def limitation(self, position: Position) -> str:
        return (
            f"Position = the starting position (G/F/C) a player was listed at in more than half "
            f"of their {self.season} {self.phase.replace('_', ' ')} starts before "
            f"{self.before_date}. Box scores record positions only for starters, so players "
            f"without such a majority, including bench-only players, are not counted as "
            f"{position}s. Not an official roster position."
        )


def _stat(path: Path) -> tuple[str, int, int]:
    info = path.stat()
    return (str(path), info.st_mtime_ns, info.st_size)


def _verify(dataset: WorkbenchDataset, years: list[int], root: Path) -> None:
    from courtlens.services.workbench_ingestion import dataset_content_sha256, history_file

    patterns = ("sportsdataverse_*/*", "bbref_history_sealed/*")
    raw = [p for pattern in patterns for p in root.glob(pattern)]
    files = tuple(sorted(_stat(p) for p in raw if p.is_file()))
    key = (dataset.id, files)
    with _lock:
        verified = _verified.get(key)
    if verified is None:
        # A dataset sealed with the pre-2000-01 history names its game-log file; it must still be
        # the newest seal, as it was when the dataset was imported.
        sealed_with = ((dataset.coverage_json or {}).get("history") or {}).get("file")
        history = history_file(root) if sealed_with else None
        verified = (not sealed_with or (history is not None and history.name == sealed_with)) and (
            dataset_content_sha256(years, root, history)[0] == dataset.content_sha256
        )
        with _lock:
            if len(_verified) > 16:
                _verified.clear()
            _verified[key] = verified
    if not verified:
        raise PositionEvidenceUnavailable("raw evidence does not match the release dataset")


def _file_positions(path: Path) -> dict[tuple[str, str], str]:
    key = _stat(path)
    with _lock:
        cached = _files.get(key)
    if cached is not None:
        return cached
    positions: dict[tuple[str, str], str] = {}
    with path.open("r", encoding="utf-8-sig", newline="") as stream:
        for row in csv.DictReader(stream):
            code = (row.get("position") or "").strip().upper()
            if code in ("G", "F", "C"):
                positions[(str(row["game_id"]), str(row["person_id"]))] = code
    with _lock:
        if len(_files) > 8:
            _files.clear()
        _files[key] = positions
    return positions


def starting_positions(session: Session, context: ResolvedContext) -> PositionCohort:
    if context.dataset_type != "workbench":
        raise PositionEvidenceUnavailable("position evidence requires a workbench release")
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
    recorded = _file_positions(path)
    appearances = session.execute(
        select(WorkbenchPlayerGame.game_id, WorkbenchPlayerGame.player_id).where(
            WorkbenchPlayerGame.dataset_id == context.dataset_id,
            WorkbenchPlayerGame.season == context.season,
            WorkbenchPlayerGame.phase == context.phase,
            WorkbenchPlayerGame.game_date < context.before_date,
            WorkbenchPlayerGame.appearance == "appeared",
        )
    )
    counts: dict[str, Counter[str]] = {}
    for game_id, player_id in appearances:
        code = recorded.get((str(game_id), str(player_id)))
        if code:
            counts.setdefault(str(player_id), Counter())[code] += 1
    labels: dict[str, str] = {}
    starts: dict[str, int] = {}
    for player_id, counter in counts.items():
        total = sum(counter.values())
        code, top = counter.most_common(1)[0]
        starts[player_id] = total
        if top * 2 > total:
            labels[player_id] = code
    return PositionCohort(
        POSITION_POLICY,
        context.season,
        context.phase,
        context.before_date.isoformat(),
        labels,
        starts,
    )
