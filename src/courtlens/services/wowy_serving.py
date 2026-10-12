"""Read-only PC11 WOWY serving from the content-addressed artifact (domain/wowy.py, D4)."""

from __future__ import annotations

import hashlib
import json
from functools import lru_cache
from typing import Any

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from courtlens.config import get_settings
from courtlens.domain.context import CapabilityEntry, CapabilityStatus
from courtlens.domain.teams import get_team_info
from courtlens.domain.wowy import CELLS, MIN_POSSESSIONS, VERSION, ratings
from courtlens.workbench_models import WorkbenchIdentity

SOURCE = "CourtLens stints reconstructed from public NBA play-by-play (IM03, event-accepted)"
LIMITATIONS = [
    "Descriptive splits of observed lineups, not causal effects: who else was on the floor, "
    "opponents and game state differ between splits.",
    "Ratings are points per 100 possessions at each end. A split under "
    f"{MIN_POSSESSIONS} possessions at either end is a small sample and is not compared.",
    "Pairs cover each team's ten players with the most on-court time in this season and "
    "phase; a traded player's time counts only for the team it was played for.",
    "Patched lineups keep IM03's documented minute and plus-minus limitations.",
]


@lru_cache(maxsize=2)
def _decode(raw: bytes) -> dict[str, Any]:
    body: dict[str, Any] = json.loads(raw)
    if body.get("version") != VERSION:
        raise ValueError("unsupported WOWY artifact version")
    return body


def load_wowy() -> dict[str, Any]:
    path = get_settings().wowy_manifest
    if path is None or not path.exists():
        raise HTTPException(503, "No WOWY artifact has been built for this deployment.")
    try:
        raw = path.read_bytes()
        # The file name is the external content address; re-hash on every read.
        if hashlib.sha256(raw).hexdigest() != path.stem:
            raise ValueError("WOWY content address changed")
        return _decode(raw)
    except (ValueError, OSError) as exc:
        raise HTTPException(503, "WOWY artifact integrity check failed") from exc


def wowy_capability() -> CapabilityEntry:
    """Catalog entry from the installed artifact; absent or changed artifacts are blocked."""
    try:
        store = load_wowy()
    except HTTPException as exc:
        return CapabilityEntry(
            name="wowy",
            status=CapabilityStatus.SOURCE_BLOCKED,
            limitations=[str(exc.detail)],
        )
    cohorts = store["cohorts"].values()
    return CapabilityEntry(
        name="wowy",
        status=CapabilityStatus.AVAILABLE,
        seasons=sorted({c["season"] for c in cohorts}),
        phases=sorted({c["phase"] for c in cohorts}),
        limitations=LIMITATIONS,
    )


def _names(session: Session, ids: set[str]) -> dict[str, str]:
    rows = session.execute(
        select(WorkbenchIdentity.external_id, WorkbenchIdentity.display_name).where(
            WorkbenchIdentity.kind == "player", WorkbenchIdentity.external_id.in_(sorted(ids))
        )
    ).all()
    return {str(pid): name for pid, name in rows}


def _team(team_id: str) -> dict[str, str]:
    info = get_team_info(team_id)
    return {
        "team_id": team_id,
        "team_tricode": info.tricode if info else team_id,
        "team_name": info.name if info else f"NBA team {team_id}",
    }


def pair_summary(pair: dict[str, Any]) -> dict[str, Any]:
    cells = {name: ratings(pair["cells"][name]) for name in CELLS}
    together, apart = cells["both"]["net_rating"], cells["neither"]["net_rating"]
    comparable = not cells["both"]["small_sample"] and not cells["neither"]["small_sample"]
    return {
        "a": pair["a"],
        "b": pair["b"],
        "cells": {name: {**pair["cells"][name], **cells[name]} for name in CELLS},
        "shared_minutes": cells["both"]["minutes"],
        "net_together_minus_apart": (
            together - apart
            if comparable and isinstance(together, float) and isinstance(apart, float)
            else None
        ),
    }


def wowy_view(
    session: Session,
    season: str | None,
    phase: str | None,
    team_id: str | None,
    a: str | None,
    b: str | None,
) -> dict[str, Any]:
    store = load_wowy()
    cohorts = store["cohorts"]
    scopes = [{"season": c["season"], "phase": c["phase"]} for c in cohorts.values()]
    scopes.sort(key=lambda s: (s["season"], s["phase"] == "regular_season"), reverse=True)
    phase = phase or "regular_season"
    season = season or next(s["season"] for s in scopes if s["phase"] == phase)
    cohort = cohorts.get(f"{season}:{phase}")
    if cohort is None:
        raise HTTPException(404, f"No WOWY splits for {season} {phase}.")
    teams = cohort["teams"]
    rule = None
    if team_id is None or team_id not in teams:
        # C3: the season's minutes leader (on-court time in these stints) and that team's top duo.
        team_id, _ = max(
            ((tid, p) for tid, t in teams.items() for p in t["players"][:1]),
            key=lambda item: (item[1]["seconds"], item[1]["player_id"]),
        )
        a, b = None, None
        rule = "Minutes leader's team, top duo by shared minutes"
    team = teams[team_id]
    pairs = [pair_summary(p) for p in team["pairs"]]
    pairs.sort(key=lambda p: (-p["shared_minutes"], p["a"], p["b"]))
    wanted = {a, b} if a and b and a != b else None
    selected = next((p for p in pairs if {p["a"], p["b"]} == wanted), None) if wanted else None
    if selected is None:
        selected = pairs[0] if pairs else None
        rule = rule or ("Top duo by shared minutes" if wanted is None else "Pair not available")
    ids = {p["player_id"] for p in team["players"]}
    names = _names(session, ids)
    return {
        "version": VERSION,
        "season": season,
        "phase": phase,
        "scopes": scopes,
        "games": cohort["games"],
        "last_game_date": cohort["last_game_date"],
        "team": _team(team_id),
        "teams": sorted((_team(t) for t in teams), key=lambda t: t["team_name"]),
        "players": [
            {
                "player_id": p["player_id"],
                "player_name": names.get(p["player_id"], f"NBA player {p['player_id']}"),
                "minutes": p["seconds"] / 60,
            }
            for p in team["players"]
        ],
        "team_total": {**team["total"], **ratings(team["total"])},
        "selected": selected,
        "pairs": pairs,
        "default_rule": rule,
        "min_possessions": MIN_POSSESSIONS,
        # load_wowy verified that the file name is the content hash.
        "artifact_sha256": get_settings().wowy_manifest.stem,  # type: ignore[union-attr]
        "inputs": store["inputs"],
        "source": SOURCE,
        "limitations": LIMITATIONS,
    }
