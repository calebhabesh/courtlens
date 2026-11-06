"""Research → Draft Classes (R09): frozen `courtlens-draft-value-v1` results and the rookie tracker.

Value by pick, class retrospectives, steals, misses and combine correlations are read from the
frozen results, refused if their hash or their registration's hash no longer matches. The rookie
tracker applies the registered comparison rule to 2026-27 rookies at request time: each rookie's
published games on or before the comparison date (the newest 2026-27 regular-season game date in
the published logs), DARKO's newest board dated on or before it, and the newest time-decay RAPM
snapshot whose games all precede the day after it. Past rookies come from the pinned rookies table.
"""

from __future__ import annotations

import json
from datetime import date, timedelta
from pathlib import Path
from typing import Any

from sqlalchemy import text
from sqlalchemy.orm import Session

from courtlens.config import get_settings
from courtlens.domain.research_registry import load_registration
from courtlens.evaluation import draft_value_data as data
from courtlens.evaluation import draft_value_runner as runner
from courtlens.ingestion.native_reconstruction import content_hash

RESULTS_PATH = runner.RESULTS_PATH
SEASON = "2026-27"
_cache: dict[str, Any] = {}

SOURCES: tuple[dict[str, Any], ...] = (
    {
        "classes": [1966, 1995],
        "name": "Wikipedia NBA draft articles",
        "license": "CC BY-SA 4.0",
        "note": "Read once on 2026-11-06 (revision IDs kept). NBA Stats' own draft history did "
        "not respond to any client CourtLens has tried.",
    },
    {
        "classes": [1996, 1999],
        "name": "NBA Stats draft history via the sportsdataverse hoopR mirror",
        "license": None,
        "note": "Official files, pinned revision 7f2c0afa.",
    },
    {
        "classes": [2000, 2026],
        "name": "NBA Stats draft history via the sportsdataverse hoopR mirror",
        "license": None,
        "note": "CourtLens's official draft-history mart.",
    },
)

CREDITS = [
    "Win shares: Basketball-Reference (Justin Kubatko's method), read from CourtLens's "
    "full-history season totals.",
    "RAPM: CourtLens's own 1Y fits (R01) after Rosenbaum and Sill; time-decay RAPM for rookies "
    "after Databallr's default.",
    "DARKO Daily Plus-Minus by Kostya Medvedovsky (darko.app).",
    "Draft lists 1966-95: Wikipedia (CC BY-SA 4.0); 1996-2026: NBA Stats via sportsdataverse "
    "hoopR. Combine: NBA Draft Combine via hoopR.",
    "Page reference: Databallr's Draftballr, refactored as Draft Classes; no prospect model.",
]

CAVEATS = [
    "Descriptive only. Value by pick averages what happened at each slot; it mixes team needs, "
    "traded picks, league size (10 to 30 teams) and changing draft rules.",
    "Surplus measures the value a pick returned, not the quality of the decision: a pick can fall "
    "short for reasons nobody controlled. Len Bias (1986, pick 2) died two days after the draft.",
    "NBA value only. Picks who played in the ABA, heavily in 1967 to 1976, are undervalued.",
    "Win shares and minutes measure playing time and box-score production, not impact. RAPM "
    "covers only classes 2014 to 2022.",
    "Classes 2023 to 2025 have fewer than four seasons: shown to date, never redrafted or scored.",
    "Career value uses classes 1966 to 2005; players still active in 2025-26 count to date.",
    "Rookie comparisons are early-season samples; under 100 minutes is flagged. Past rookies "
    "have no DARKO or RAPM at the same point, so ratings are shown, not compared.",
]


def _load_results(path: Path = RESULTS_PATH) -> dict[str, Any]:
    stat = path.stat()
    key = f"results:{path}:{stat.st_mtime_ns}:{stat.st_size}"
    if key in _cache:
        return dict(_cache[key])
    body = json.loads(path.read_bytes())
    claimed = body.pop("results_sha256")
    if content_hash(body) != claimed:
        raise ValueError("draft value results changed")
    registration = load_registration(runner.REGISTRATION)
    if registration.content_hash() != body["registration"]["content_sha256"]:
        raise ValueError("draft value registration changed after its results")
    body["results_sha256"] = claimed
    _cache.clear()
    _cache[key] = body
    return dict(body)


def _tables_dir() -> Path:
    return get_settings().draft_value_tables_dir


def _table(name: str) -> dict[str, Any] | None:
    """A pinned input table, or None when it is not on this host (the tracker is then unknown)."""
    key = f"table:{name}"
    if key in _cache:
        cached: dict[str, Any] = _cache[key]
        return cached
    digest = load_registration(runner.REGISTRATION).parameters["table_sha256"][name]
    try:
        body = data.read_table(_tables_dir(), digest)
    except (OSError, ValueError):
        return None
    _cache[key] = body
    return body


def _first_seasons() -> dict[str, tuple[str, str | None]]:
    """Each drafted player's first NBA season from the draft on, with his (first) team then."""
    if "first_seasons" in _cache:
        cached: dict[str, tuple[str, str | None]] = _cache["first_seasons"]
        return cached
    picks, seasons = _table("picks"), _table("seasons")
    out: dict[str, tuple[str, str | None]] = {}
    if picks and seasons:
        for p in picks["rows"]:
            rows = seasons["players"].get(p["season_id"] or "", {})
            later = sorted(s for s in rows if data.season_start(s) >= p["year"])
            if p["player_id"] and later:
                teams = rows[later[0]].get("teams") or [None]
                out[p["player_id"]] = (later[0], teams[0])
    _cache["first_seasons"] = out
    return out


def source_for(year: int) -> dict[str, Any]:
    return next(s for s in SOURCES if s["classes"][0] <= year <= s["classes"][1])


def _photo(row: dict[str, Any], year: int) -> dict[str, Any]:
    """Season-matched photo: the player's first NBA season and team, else the draft season."""
    first = _first_seasons().get(row.get("player_id") or "")
    if first:
        return {"photo_season": first[0], "photo_team": first[1] or row.get("team")}
    return {"photo_season": data.season_label(year), "photo_team": row.get("team")}


def _row(row: dict[str, Any], year: int) -> dict[str, Any]:
    return {**row, "year": year, **_photo(row, year)}


def registration_info(body: dict[str, Any]) -> dict[str, Any]:
    reg = body["registration"]
    return {
        "identity": reg["identity"],
        "registered_on": reg["registered_on"],
        "content_sha256": reg["content_sha256"],
        "results_sha256": body["results_sha256"],
        "parameters": {
            k: v
            for k, v in reg["parameters"].items()
            if k not in ("table_sha256", "combine_measures", "rookie_stats")
        },
    }


def summary() -> dict[str, Any]:
    body = _load_results()
    classes = [
        {
            "year": int(year),
            "status": c["status"],
            "era": c["era"],
            "seasons_elapsed": c["seasons_elapsed"],
            "picks": c["picks"],
            "played": c["played"],
            "active": c["active"],
            "source": source_for(int(year))["name"],
        }
        for year, c in sorted(body["classes"].items())
    ]
    return {
        "registration": registration_info(body),
        "value_by_pick": body["value_by_pick"],
        "bands": body["bands"],
        "steals": [_row(r, r["year"]) for r in body["steals"]],
        "misses": [_row(r, r["year"]) for r in body["misses"]],
        "classes": classes,
        "combine": {"correlations": body["combine"]["correlations"]},
        "rookie_pool": body["rookie_pool"],
        "sources": list(SOURCES),
        "credits": CREDITS,
        "caveats": CAVEATS,
    }


def draft_class(year: int) -> dict[str, Any] | None:
    body = _load_results()
    entry = body["classes"].get(str(year))
    if entry is None:
        return None
    return {
        "year": year,
        **{k: v for k, v in entry.items() if k != "rows"},
        "source": source_for(year),
        "rows": [_row(r, year) for r in entry["rows"]],
    }


def combine() -> dict[str, Any]:
    body = _load_results()
    rows = [_row(r, r["year"]) for r in body["combine"]["rows"]]
    return {"rows": rows, "correlations": body["combine"]["correlations"]}


# ---------------------------------------------------------------------------------------------
# Rookie tracker


def _pool() -> dict[int, dict[str, Any]] | None:
    if "pool" in _cache:
        cached: dict[int, dict[str, Any]] = _cache["pool"]
        return cached
    picks, rookies = _table("picks"), _table("rookies")
    if picks is None or rookies is None:
        return None
    pool = runner.rookie_pool(picks["rows"], rookies["players"])
    _cache["pool"] = pool
    return pool


def comparison_date(session: Session, dataset_id: str) -> date | None:
    value = session.scalar(
        text(
            "select max(game_date) from workbench_player_games where dataset_id = :d "
            "and season = :s and phase = 'regular_season'"
        ),
        {"d": dataset_id, "s": SEASON},
    )
    return value if isinstance(value, date) else None


def rookie_games(
    session: Session, dataset_id: str, ids: list[str], as_of: date
) -> dict[str, list[list[Any]]]:
    rows = session.execute(
        text(
            "select player_id, game_date, game_id, team_id, minutes_seconds, stats_json "
            "from workbench_player_games where dataset_id = :d and season = :s "
            "and phase = 'regular_season' and appearance = 'appeared' and game_date <= :as_of "
            "and player_id = any(:ids) order by player_id, game_date, game_id"
        ),
        {"d": dataset_id, "s": SEASON, "as_of": as_of, "ids": ids},
    ).all()
    out: dict[str, list[list[Any]]] = {}
    for pid, day, game, team, seconds, stats in rows:
        out.setdefault(pid, []).append(
            [
                day.isoformat(),
                game,
                int(seconds or 0),
                *[int((stats or {}).get(k) or 0) for k in data.BOX_KEYS],
                team,
            ]
        )
    return out


def darko_on(as_of: date) -> dict[str, Any] | None:
    from courtlens.services.darko import load_darko_store

    store = load_darko_store()
    if store is None:
        return None
    dated = [
        e
        for e in store["entries"]
        if e.get("phase") == "current"
        and e.get("season") == SEASON
        and e.get("data_date")
        and e["data_date"] <= as_of.isoformat()
    ]
    if not dated:
        return None
    entry = max(dated, key=lambda e: (e["data_date"], e["as_of"]))
    return {"data_date": entry["data_date"], "as_of": entry["as_of"], "players": entry["players"]}


def rapm_snapshot_on(as_of: date) -> dict[str, Any] | None:
    """Newest time-decay snapshot whose cutoff is at most the day after the comparison date."""
    directory = get_settings().win_probability_snapshots_dir
    limit = (as_of + timedelta(days=1)).isoformat()
    best: tuple[str, Path] | None = None
    for path in sorted(directory.glob("*.json")) if directory.exists() else []:
        head = json.loads(path.read_bytes())
        if head.get("kind") != "snapshot" or head["cutoff"] > limit:
            continue
        if not head["latest_game_date"] < head["cutoff"]:
            continue
        if best is None or head["cutoff"] > best[0]:
            best = (head["cutoff"], path)
    if best is None:
        return None
    body = json.loads(best[1].read_bytes())
    if content_hash(body) != best[1].stem:
        raise ValueError("time-decay snapshot changed")
    return {
        "cutoff": body["cutoff"],
        "latest_game_date": body["latest_game_date"],
        "sha256": best[1].stem,
        "players": body["players"],
    }


def _rookie_rows(session: Session, dataset_id: str) -> dict[str, Any]:
    body = _load_results()
    picks = body["classes"][str(runner.ROOKIE_CLASS)]["rows"]
    as_of = comparison_date(session, dataset_id)
    pool = _pool()
    base = {
        "season": SEASON,
        "class": runner.ROOKIE_CLASS,
        "dataset_id": dataset_id,
        "comparison_date": as_of.isoformat() if as_of else None,
        "rule": "Each rookie after g appearances against every player taken at the same pick "
        "(classes 1983 to 2025) over that player's first min(g, G) first-season appearances.",
    }
    if as_of is None:
        return {**base, "state": "no_games", "darko": None, "rapm": None, "rookies": []}
    if pool is None:
        return {**base, "state": "pool_unavailable", "darko": None, "rapm": None, "rookies": []}
    ids = [p["player_id"] for p in picks if p["player_id"]]
    games = rookie_games(session, dataset_id, ids, as_of)
    darko, rapm = darko_on(as_of), rapm_snapshot_on(as_of)
    rookies = []
    for p in picks:
        mine = games.get(p["player_id"] or "", [])
        same = pool.get(p["pick"], {})
        entry: dict[str, Any] = {
            "pick": p["pick"],
            "round": p["round"],
            "player_id": p["player_id"],
            "name": p["name"],
            "draft_team": p["team"],
            "team": mine[-1][-1] if mine else None,
            "photo_season": SEASON,
            "pool": len(same),
        }
        if not mine:
            rookies.append({**entry, "state": "no_games", "comparison": None})
        else:
            result = runner.rookie_comparison([g[:-1] for g in mine], same)
            result.pop("comparisons")
            rookies.append({**entry, "state": "compared", "comparison": result})
        pid = p["player_id"] or ""
        d = (darko or {}).get("players", {}).get(pid)
        r = (rapm or {}).get("players", {}).get(pid)
        rookies[-1]["darko"] = (
            None if d is None else {k: d.get(k) for k in ("dpm", "o_dpm", "d_dpm")}
        )
        rookies[-1]["rapm"] = (
            None
            if r is None
            else {"rapm": r.get("rapm"), "decayed_seconds": r.get("decayed_seconds")}
        )
    return {
        **base,
        "state": "ok",
        "darko": None
        if darko is None
        else {"data_date": darko["data_date"], "as_of": darko["as_of"]},
        "rapm": None
        if rapm is None
        else {k: rapm[k] for k in ("cutoff", "latest_game_date", "sha256")},
        "rookies": rookies,
        "_games": games,
    }


def rookies(session: Session, dataset_id: str) -> dict[str, Any]:
    out = _rookie_rows(session, dataset_id)
    out.pop("_games", None)
    return out


def rookie(session: Session, dataset_id: str, player_id: str) -> dict[str, Any] | None:
    """One rookie's comparison with every same-pick past rookie, named."""
    out = _rookie_rows(session, dataset_id)
    games = out.pop("_games", {})
    match = next((r for r in out["rookies"] if r["player_id"] == player_id), None)
    if match is None:
        return None
    pool = (_pool() or {}).get(match["pick"], {})
    mine = games.get(player_id, [])
    comparisons = []
    if mine:
        result = runner.rookie_comparison([g[:-1] for g in mine], pool)
        first = _first_seasons()
        for pid, line in result["comparisons"].items():
            past = pool[pid]
            comparisons.append(
                {
                    "player_id": pid,
                    "name": past["name"],
                    "year": past["year"],
                    "first_season": past["season"],
                    "first_season_games": len(past["games"]),
                    "photo_season": past["season"],
                    "photo_team": (first.get(pid) or (None, None))[1],
                    **line,
                }
            )
        comparisons.sort(key=lambda c: (-(c["pts36"] or 0.0), c["year"]))
    return {
        **{k: v for k, v in out.items() if k != "rookies"},
        "rookie": match,
        "comparisons": comparisons,
    }
