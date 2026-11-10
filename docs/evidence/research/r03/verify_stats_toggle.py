"""R03: recompute every shrunk cell the Stats table showed (dom-checks.json) from the database.

Totals follow the Stats engine (appeared games before beforeDate, the URL's team filter, makes and
attempts summed over rows where both are present); priors and rim totals come from the frozen
results. A shown cell must equal the expected value rounded to 0.1%, or "—" when it is unknown.

    PYTHONPATH=<worktree>/src python verify_stats_toggle.py dom-checks.json stats-toggle-check.json
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urlsplit

from sqlalchemy import text
from sqlalchemy.orm import Session

from courtlens.database import SessionLocal
from courtlens.domain import signal_noise as sn
from courtlens.services import signal_noise as service
from courtlens.services.workbench_analytics import resolve_workbench_context

PAIRS = {
    "fg": ("field_goals_made", "field_goals_attempted"),
    "fg3": ("three_pointers_made", "three_pointers_attempted"),
    "ft": ("free_throws_made", "free_throws_attempted"),
}


def _pair_sql(key: str, made: str, attempted: str) -> str:
    both = f"g.stats_json->>'{made}' IS NOT NULL AND g.stats_json->>'{attempted}' IS NOT NULL"
    return (
        f"sum((g.stats_json->>'{made}')::float) FILTER (WHERE {both}) AS {key}m, "
        f"sum((g.stats_json->>'{attempted}')::float) FILTER (WHERE {both}) AS {key}a"
    )


def totals(
    session: Session, dataset: str, scope: dict[str, str], players: list[str]
) -> dict[str, dict[str, float]]:
    sums = ", ".join(_pair_sql(k, m, a) for k, (m, a) in PAIRS.items())
    rows = session.execute(
        text(
            f"""SELECT g.player_id, {sums} FROM workbench_player_games g
            WHERE g.dataset_id = :dataset AND g.season = :season AND g.phase = :phase
              AND g.appearance = 'appeared' AND g.game_date < CAST(:before AS date)
              AND (CAST(:team AS text) IS NULL OR g.team_id = :team)
              AND g.player_id = ANY(:players)
            GROUP BY g.player_id"""
        ),
        {"dataset": dataset, **scope, "players": players},
    ).mappings()
    return {
        r["player_id"]: {k: float(v or 0) for k, v in r.items() if k != "player_id"} for r in rows
    }


def pct(value: float | None) -> str:
    return "—" if value is None else f"{value * 100:.1f}%"


def expected(
    t: dict[str, float], priors: dict[str, Any], rim: dict[str, Any] | None
) -> dict[str, str]:
    def rate(made: float, attempts: float, key: str) -> float | None:
        prior = priors.get(key)
        return sn.shrunk_rate(made, attempts, prior["alpha"], prior["beta"]) if prior else None

    p2 = rate(t["fgm"] - t["fg3m"], t["fga"] - t["fg3a"], "fg2_pct")
    p3 = rate(t["fg3m"], t["fg3a"], "fg3_pct")
    pft = rate(t["ftm"], t["fta"], "ft_pct")
    ts = sn.composed_ts(t["fga"] - t["fg3a"], t["fg3a"], t["fta"], p2, p3, pft)
    return {
        "fg3_pct__shrunk": pct(p3),
        "ft_pct__shrunk": pct(pft),
        "ts_pct__shrunk": pct(ts),
        "rim_fg_pct": pct(rim["raw"] if rim else None),
        "rim_fg_pct__shrunk": pct(rim["shrunk"]["value"] if rim else None),
    }


def main() -> None:
    report = json.loads(Path(sys.argv[1]).read_text())
    results = service.load_results()
    assert results is not None
    out: dict[str, object] = {"results_sha256": results["results_sha256"], "scopes": {}}
    with SessionLocal() as session:
        dataset = resolve_workbench_context(session).dataset_id
        for name, scope in report["stats"].items():
            rows = scope.get("rows_on")
            if not rows:
                continue
            q = {k: v[0] for k, v in parse_qs(urlsplit(scope["url_on"]).query).items()}
            season, phase, team = q["season"], q["phase"], q.get("teamId")
            priors = service.season_priors(results, season, phase)
            ok = {k: v for k, v in priors.items() if v["status"] == "available"}
            whole = q.get("window") == "season" and team is None
            whole = whole and season in results["rim_totals"]
            shrinkage = service.shrinkage(season, phase)
            available = shrinkage is not None and shrinkage["rim"]["status"] == "available"
            rim = shrinkage["rim"]["players"] if available and whole and shrinkage else {}
            scope_params = {
                "season": season,
                "phase": phase,
                "before": q["beforeDate"],
                "team": team,
            }
            ids = [r["player_id"] for r in rows]
            data = totals(session, dataset, scope_params, ids)
            compared, mismatches = 0, []
            for row in rows:
                t = data.get(row["player_id"])
                if t is None:
                    mismatches.append({"player": row["player_id"], "missing_totals": True})
                    continue
                want = expected(t, ok, rim.get(row["player_id"]))
                for key, value in want.items():
                    if key not in row["shown"]:
                        continue
                    compared += 1
                    shown = row["shown"][key]
                    unknown = value == "—" and not any(ch.isdigit() for ch in shown)
                    if not (shown.startswith(value) or unknown):
                        mismatches.append(
                            {
                                "player": row["player_id"],
                                "key": key,
                                "shown": shown,
                                "expected": value,
                            }
                        )
            out["scopes"][name] = {
                "season": season,
                "phase": phase,
                "team": team,
                "rows": len(rows),
                "cells_compared": compared,
                "mismatches": mismatches,
            }
    Path(sys.argv[2]).write_text(json.dumps(out, indent=1) + "\n")
    for name, s in out["scopes"].items():
        print(
            name,
            s["rows"],
            "rows,",
            s["cells_compared"],
            "cells,",
            len(s["mismatches"]),
            "mismatches",
        )


if __name__ == "__main__":
    main()
