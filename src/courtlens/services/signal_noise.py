"""Research → Signal vs Noise: served results of courtlens-signal-noise-v1 (R03).

Stabilization points, priors, validation and rim totals come from the frozen results file the
registered runner wrote; nothing is refitted here. The worked example reads one player-season's
game log and applies that season's frozen prior. Shrunk values are always served beside the raw
values, never in place of them.
"""

from __future__ import annotations

import json
import re
from functools import lru_cache
from pathlib import Path
from typing import Any

from sqlalchemy import text
from sqlalchemy.orm import Session

from courtlens.domain import signal_noise as sn

RESULTS_PATH = Path("evaluation/research/frozen/courtlens-signal-noise-v1.json")
SEASON = re.compile(r"^\d{4}-\d{2}$")
EXAMPLE_SEASON = "2025-26"
EXAMPLE_RULE = (
    "Default example: the 2025-26 player with 25 to 100 three-point attempts whose 3P% moves most "
    "under shrinkage (a selection rule to show the method, not a judgement of the player)."
)
SHRUNK_STATS = ("fg3_pct", "ft_pct", "ts_pct", "rim_fg_pct")
COMPONENTS = {"fg2_pct": ("fg2m", "fg2a"), "fg3_pct": ("fg3m", "fg3a"), "ft_pct": ("ftm", "fta")}


@lru_cache(maxsize=1)
def load_results(path: Path = RESULTS_PATH) -> dict[str, Any] | None:
    if not path.exists():
        return None
    data: dict[str, Any] = json.loads(path.read_text())
    return data


def summary() -> dict[str, Any] | None:
    results = load_results()
    if results is None:
        return None
    return {key: value for key, value in results.items() if key not in {"rim_totals", "priors"}} | {
        "priors": _prior_table(results),
        "shrunk_stats": list(SHRUNK_STATS),
    }


def _prior_table(results: dict[str, Any]) -> dict[str, list[dict[str, Any]]]:
    return {
        stat: [{"season": season, **fit} for season, fit in sorted(by_season.items())]
        for stat, by_season in results["priors"].items()
    }


def _unknown(reason: str) -> dict[str, Any]:
    return {"status": "unknown", "reason": reason}


def season_priors(results: dict[str, Any], season: str, phase: str) -> dict[str, Any]:
    """The four binomial priors for a season, or why each is unknown."""
    if phase != "regular_season":
        reason = "Priors are fitted on regular seasons only; playoff values are not shrunk."
        return {stat: _unknown(reason) for stat in sn.BINOMIAL}
    out: dict[str, Any] = {}
    for stat in sn.BINOMIAL:
        fit = results["priors"][stat].get(season)
        if fit is None:
            first = min(results["priors"][stat])
            out[stat] = _unknown(
                f"No prior: it needs an earlier regular season with game-level data, so the first "
                f"season with a {stat.replace('_', ' ')} prior is {first}."
            )
        else:
            out[stat] = {"status": "available", **fit}
    return out


def shrinkage(season: str, phase: str) -> dict[str, Any] | None:
    """What the Stats table's Shrunk toggle needs for one season-phase."""
    results = load_results()
    if results is None:
        return None
    priors = season_priors(results, season, phase)
    rim: dict[str, Any]
    rim_season = results["rim_totals"].get(season)
    rim_prior = priors["rim_fg_pct"]
    if phase != "regular_season":
        rim = _unknown("Rim FG% is served for regular seasons only.")
    elif rim_season is None:
        rim = _unknown(
            "No game-level rim attempts: the retained NBA shot detail covers 2014-15 to 2025-26."
        )
    elif rim_prior["status"] != "available":
        rim = _unknown(rim_prior["reason"])
    else:
        rim = {
            "status": "available",
            "scope": "Whole regular season, all teams; unknown for a team, date or window filter.",
            "players": {
                player: {
                    "makes": made,
                    "attempts": attempts,
                    "raw": made / attempts if attempts else None,
                    "shrunk": sn.posterior(made, attempts, rim_prior["alpha"], rim_prior["beta"]),
                }
                for player, (made, attempts) in rim_season.items()
            },
        }
    return {
        "season": season,
        "phase": phase,
        "registration": results["registration"]["identity"],
        "results_sha256": results["results_sha256"],
        "priors": priors,
        "rim": rim,
        "ts_rule": (
            "Shrunk TS% = (2·2PA·shrunk 2P% + 3·3PA·shrunk 3P% + FTA·shrunk FT%) "
            "/ (2·(FGA + 0.44·FTA)), with the player's own attempt mix."
        ),
    }


# ---- Worked example -----------------------------------------------------------------------------

_FIELDS_SQL = ", ".join(
    f"(g.stats_json->>'{source}')::double precision AS {key}" for key, source in sn.FIELDS.items()
)


def _games(session: Session, dataset_id: str, player_id: str, season: str) -> list[dict[str, Any]]:
    rows = session.execute(
        text(
            f"""SELECT g.game_id, g.game_date, g.team_id, g.opponent_id, g.minutes_seconds,
                {_FIELDS_SQL}
            FROM workbench_player_games g
            WHERE g.dataset_id = :dataset AND g.player_id = :player AND g.season = :season
                AND g.phase = 'regular_season' AND g.appearance = 'appeared'
                AND g.minutes_seconds > 0
            ORDER BY g.game_date, g.game_id"""
        ),
        {"dataset": dataset_id, "player": player_id, "season": season},
    ).mappings()
    return [dict(row) for row in rows]


def _valid(row: dict[str, Any], *fields: str) -> bool:
    return all(row.get(field) is not None for field in fields)


def _totals(games: list[dict[str, Any]]) -> dict[str, float]:
    """Component makes and attempts over each component's valid games (the runner's rule)."""
    out = dict.fromkeys(("fg2m", "fg2a", "fg3m", "fg3a", "ftm", "fta", "pts", "fga", "fta_ts"), 0.0)
    for g in games:
        if _valid(g, "fgm", "fga", "fg3m", "fg3a"):
            out["fg2m"] += g["fgm"] - g["fg3m"]
            out["fg2a"] += g["fga"] - g["fg3a"]
        if _valid(g, "fg3m", "fg3a"):
            out["fg3m"] += g["fg3m"]
            out["fg3a"] += g["fg3a"]
        if _valid(g, "ftm", "fta"):
            out["ftm"] += g["ftm"]
            out["fta"] += g["fta"]
        if _valid(g, "pts", "fga", "fta"):
            out["pts"] += g["pts"]
            out["fga"] += g["fga"]
            out["fta_ts"] += g["fta"]
    return out


def _estimates(totals: dict[str, float], priors: dict[str, Any]) -> dict[str, Any]:
    available = {k: v for k, v in priors.items() if v.get("status") == "available"}
    out: dict[str, Any] = {}
    for stat, (made, attempts) in COMPONENTS.items():
        prior = available.get(stat)
        raw = totals[made] / totals[attempts] if totals[attempts] > 0 else None
        out[stat] = {
            "makes": totals[made],
            "attempts": totals[attempts],
            "raw": raw,
            "prior": priors[stat],
            "shrunk": sn.posterior(totals[made], totals[attempts], prior["alpha"], prior["beta"])
            if prior and totals[attempts] > 0
            else {"value": None, "low": None, "high": None},
        }
    tsa = totals["fga"] + sn.FTA_WEIGHT * totals["fta_ts"]
    ts_priors = {k: available[k] for k in COMPONENTS if k in available}
    out["ts_pct"] = {
        "points": totals["pts"],
        "attempts": tsa,
        "raw": totals["pts"] / (2 * tsa) if tsa > 0 else None,
        "shrunk": sn.composed_ts_interval(totals, ts_priors)
        if len(ts_priors) == len(COMPONENTS)
        else {"value": None, "low": None, "high": None},
    }
    return out


def _path(games: list[dict[str, Any]], priors: dict[str, Any]) -> list[dict[str, Any]]:
    """Season-to-date raw and shrunk 3P%, FT% and TS% after each game."""
    running: list[dict[str, Any]] = []
    so_far: list[dict[str, Any]] = []
    for game in games:
        so_far.append(game)
        values = _estimates(_totals(so_far), priors)
        running.append(
            {
                "game_id": game["game_id"],
                "game_date": game["game_date"].isoformat(),
                **{
                    stat: {
                        "attempts": values[stat]["attempts"],
                        "raw": values[stat]["raw"],
                        "shrunk": values[stat]["shrunk"]["value"],
                    }
                    for stat in ("fg3_pct", "ft_pct", "ts_pct")
                },
            }
        )
    return running


def default_example_player(session: Session, dataset_id: str) -> str | None:
    results = load_results()
    if results is None:
        return None
    prior = results["priors"]["fg3_pct"][EXAMPLE_SEASON]
    rows = session.execute(
        text(
            """SELECT g.player_id,
                sum((g.stats_json->>'three_pointers_made')::double precision) AS made,
                sum((g.stats_json->>'three_pointers_attempted')::double precision) AS attempts
            FROM workbench_player_games g
            WHERE g.dataset_id = :dataset AND g.season = :season AND g.phase = 'regular_season'
                AND g.appearance = 'appeared' AND g.minutes_seconds > 0
                AND g.stats_json->>'three_pointers_made' IS NOT NULL
                AND g.stats_json->>'three_pointers_attempted' IS NOT NULL
            GROUP BY g.player_id"""
        ),
        {"dataset": dataset_id, "season": EXAMPLE_SEASON},
    ).all()
    best: tuple[float, str] | None = None
    for player, made, attempts in rows:
        if attempts is None or not 25 <= attempts <= 100:
            continue
        shrunk = sn.shrunk_rate(made, attempts, prior["alpha"], prior["beta"])
        assert shrunk is not None
        move = abs(made / attempts - shrunk)
        if best is None or (move, player) > best:
            best = (move, str(player))
    return best[1] if best else None


def player_example(
    session: Session, dataset_id: str, player_id: str, season: str
) -> dict[str, Any] | None:
    results = load_results()
    if results is None:
        return None
    priors = season_priors(results, season, "regular_season")
    games = _games(session, dataset_id, player_id, season)
    teams: dict[str, int] = {}
    for game in games:
        teams[game["team_id"]] = teams.get(game["team_id"], 0) + 1
    rim_prior = priors["rim_fg_pct"]
    rim_row = (results["rim_totals"].get(season) or {}).get(player_id)
    if season not in results["rim_totals"]:
        rim: dict[str, Any] = _unknown(
            "No game-level rim attempts: the retained NBA shot detail covers 2014-15 to 2025-26."
        )
    elif rim_prior["status"] != "available":
        rim = _unknown(rim_prior["reason"])
    elif rim_row is None or rim_row[1] == 0:
        rim = _unknown("No rim attempts in the shot detail this season.")
    else:
        made, attempts = rim_row
        rim = {
            "status": "available",
            "makes": made,
            "attempts": attempts,
            "raw": made / attempts,
            "prior": rim_prior,
            "shrunk": sn.posterior(made, attempts, rim_prior["alpha"], rim_prior["beta"]),
        }
    return {
        "player_id": player_id,
        "season": season,
        "games": len(games),
        "teams": sorted(teams, key=lambda team: (-teams[team], team)),
        "estimates": _estimates(_totals(games), priors) if games else None,
        "rim": rim,
        "path": _path(games, priors),
        "registration": results["registration"]["identity"],
        "results_sha256": results["results_sha256"],
    }


def valid_season(season: str) -> bool:
    return bool(SEASON.match(season))
