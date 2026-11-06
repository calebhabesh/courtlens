"""Research → Wingspan (`courtlens-wingspan-ddpm-v1`, R10): frozen results, current D-DPM and
nearest builds.

Everything except the current D-DPM comes from the committed frozen results, so the hosted demo
serves it from the image alone. The current D-DPM is DARKO's newest `current` board (refreshed
daily); without one it is unknown, and the rest of the page still works.
"""

from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Any

from courtlens.domain.research_registry import load_registration
from courtlens.evaluation import wingspan_runner as runner
from courtlens.ingestion.native_reconstruction import content_hash

RESULTS_PATH = runner.RESULTS_PATH
_cache: dict[str, dict[str, Any]] = {}

SOURCES = [
    {
        "name": "NBA Draft Combine",
        "detail": "Official combine and anthropometric measurements 2000-2026 via the hoopR "
        "mirror of NBA Stats (sportsdataverse).",
    },
    {
        "name": "DARKO",
        "detail": "Daily Plus-Minus by Kostya Medvedovsky (darko.app): D-DPM from each season's "
        "season-end regular-season board, and the newest daily board for the current rating.",
    },
    {"name": "NBA game logs", "detail": "Regular-season minutes 2000-01 to 2025-26 (NBA.com)."},
]
CREDITS = [
    "Design reference: Databallr's Wingspan page (databallr.com), replicated with its owner's "
    "approval for a non-commercial portfolio.",
    "D-DPM: DARKO by Kostya Medvedovsky.",
    "Measurements: NBA Draft Combine (NBA.com), through hoopR (sportsdataverse).",
]
CAVEATS = [
    "Descriptive association, not a prediction and not a cause. DARKO's season-end boards are "
    "retrospective ratings that include each season's own games.",
    "Career D-DPM is the minutes-weighted mean of season-end D-DPM over seasons with at least 500 "
    "regular-season minutes, 2000-01 to 2025-26.",
    "Only combine participants since 2000 who played a 500-minute season enter the correlations; "
    "players who skipped the combine are absent, so this is not the whole league.",
    "Positions are the first listed combine position (SG-SF is SG), not current roles.",
    "A missing measurement or rating is unknown, never zero.",
    "An r is called positive or negative only when its 95% interval excludes zero.",
]


def _load_results(path: Path = RESULTS_PATH) -> dict[str, Any]:
    stat = path.stat()
    key = f"{path}:{stat.st_mtime_ns}:{stat.st_size}"
    if key in _cache:
        return _cache[key]
    body: dict[str, Any] = json.loads(path.read_bytes())
    claimed = body.pop("results_sha256")
    if content_hash(body) != claimed:
        raise ValueError("wingspan results changed")
    if (
        load_registration(runner.REGISTRATION).content_hash()
        != body["registration"]["content_sha256"]
    ):
        raise ValueError("wingspan registration changed after its results")
    body["results_sha256"] = claimed
    _cache.clear()
    _cache[key] = body
    return body


def current_board() -> dict[str, Any] | None:
    """DARKO's newest `current` board (latest season, latest data date), or None."""
    from courtlens.services.darko import load_darko_store

    try:
        store = load_darko_store()
    except (OSError, ValueError):
        return None
    if store is None:
        return None
    boards = [e for e in store["entries"] if e.get("phase") == "current" and e.get("data_date")]
    if not boards:
        return None
    entry = max(boards, key=lambda e: (e["season"], e["data_date"], e["as_of"]))
    return {
        "season": entry["season"],
        "data_date": entry["data_date"],
        "as_of": entry["as_of"],
        "players": entry["players"],
    }


def _registration(body: dict[str, Any]) -> dict[str, Any]:
    reg = body["registration"]
    return {
        "identity": reg["identity"],
        "registered_on": reg["registered_on"],
        "content_sha256": reg["content_sha256"],
        "results_sha256": body["results_sha256"],
        "parameters": {k: v for k, v in reg["parameters"].items() if k != "table_sha256"},
    }


def _player(row: dict[str, Any], board: dict[str, Any] | None) -> dict[str, Any]:
    rating = board["players"].get(row["player_id"]) if board else None
    return {
        "player_id": row["player_id"],
        "name": row["name"],
        "combine_year": row["combine_year"],
        "position": row["position"],
        "position_label": row["position_label"],
        "height": row["height"],
        "height_shoes": row["height_shoes"],
        "wingspan": row["wingspan"],
        "diff": row["diff"],
        "weight": row["weight"],
        "standing_reach": row["standing_reach"],
        "measured": row["measured"],
        "d_dpm": row["d_dpm"],
        "career_seasons": row["career"]["seasons"],
        "career_minutes": row["career"]["minutes"],
        "first_season": row["career"]["first_season"],
        "last_season": row["career"]["last_season"],
        "photo_season": row["career"]["photo_season"],
        "photo_team": row["career"]["photo_team"],
        "in_population": row["in_population"],
        "exclusion": row["exclusion"],
        "percentiles": row["percentiles"],
        # On DARKO's newest board = active; its D-DPM there is the current rating.
        "active": None if board is None else rating is not None,
        "d_dpm_now": None if rating is None else rating.get("d_dpm"),
    }


def summary() -> dict[str, Any]:
    body = _load_results()
    board = current_board()
    seasons = sorted(body["darko_boards"])
    return {
        "registration": _registration(body),
        "population": body["population"],
        "correlations": body["correlations"],
        "within_position": body["within_position"],
        "partial": body["partial"],
        "positional_averages": body["positional_averages"],
        "nearest": body["nearest"],
        "darko_seasons": [seasons[0], seasons[-1]] if seasons else None,
        "current": (
            {"state": "unavailable", "season": None, "data_date": None}
            if board is None
            else {"state": "ready", "season": board["season"], "data_date": board["data_date"]}
        ),
        "players": [_player(p, board) for p in body["players"]],
        "sources": SOURCES,
        "credits": CREDITS,
        "caveats": CAVEATS,
    }


def nearest(player_id: str) -> dict[str, Any] | None:
    """The k measured players nearest in standardized barefoot height and wingspan."""
    body = _load_results()
    rows = {p["player_id"]: p for p in body["players"]}
    target = rows.get(player_id)
    if target is None:
        return None
    params = body["nearest"]
    base = {
        "player_id": player_id,
        "name": target["name"],
        "inputs": params["inputs"],
        "scaling": params["scaling"],
        "metric": "Euclidean distance on z-scores (value minus mean, over standard deviation, "
        "across every measured player); ties by player ID.",
    }
    if not target["measured"]:
        return {**base, "state": "not_measured", "neighbours": []}
    scale = params["scaling"]

    def z(row: dict[str, Any], key: str) -> float:
        return float((row[key] - scale[key]["mean"]) / scale[key]["sd"])

    origin = [z(target, k) for k in params["inputs"]]
    board = current_board()
    distances = []
    for pid, row in rows.items():
        if pid == player_id or not row["measured"]:
            continue
        point = [z(row, k) for k in params["inputs"]]
        distances.append((math.dist(origin, point), pid))
    distances.sort()
    neighbours = [
        {**_player(rows[pid], board), "distance": round(d, 6)}
        for d, pid in distances[: params["k"]]
    ]
    return {**base, "state": "ready", "neighbours": neighbours}
