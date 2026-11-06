"""Research → ORtg Calculator inputs (`courtlens-four-factors-inputs-v2`, R10).

Serves the committed frozen results: each regular season's league and team inputs to Poropudas
and Halme's four-factor offensive rating, mu, and the rebound rates by miss kind. No database.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from courtlens.domain.research_registry import load_registration
from courtlens.evaluation import four_factors_runner as runner
from courtlens.ingestion.native_reconstruction import content_hash

RESULTS_PATH = runner.RESULTS_PATH
_cache: dict[str, dict[str, Any]] = {}

PAPER = {
    "authors": "Jirka Poropudas and Topi Halme",
    "title": "Decomposing Basketball Team Efficiency Using the Four Factors and Shapley Values",
    "earlier_title": "Dean Oliver's Four Factors Revisited",
    "arxiv": "2305.13032",
    "url": "https://arxiv.org/abs/2305.13032",
    "version": "v2, 13 October 2026 (v1, 22 May 2023)",
    "formula": "ORTG = (1 - TOV%)(FTr + 2 eFG%) / (1 - ORB%(1 - FG%) + mu FTr / FT%)",
    "equation": "Eq. (11), Proposition 1",
    # Appendix A and Appendix B (Remark 2 discussion), NBA 2024-25 league averages.
    "published_2024_25": {"mu": 0.425, "ft_end_make_rate": 0.795, "ft_end_orb_rate": 0.131},
}
CREDITS = [
    "Method: Poropudas and Halme, 'Decomposing Basketball Team Efficiency Using the Four Factors "
    "and Shapley Values' (arXiv:2305.13032; v1 titled 'Dean Oliver's Four Factors Revisited').",
    "Four factors: Dean Oliver, Basketball on Paper (2004).",
    "Design reference: Databallr's ORTG Lab (databallr.com), which credits the same paper.",
    "Play-by-play: NBA PlayByPlayV3 via shufinskiy/nba_data.",
]
CAVEATS = [
    "Regular seasons 2014-15 to 2025-26: the play-by-play archives CourtLens keeps start in "
    "2014-15.",
    "Possessions are the paper's box-score estimate FGA + TOV - ORB + mu FTA, not exact counts, so "
    "ORTG differs a little from NBA.com's.",
    "Offensive rebounds include team rebounds, as the paper requires.",
    "Team inputs use the league's mu for the season.",
    "v1 of these inputs counted no threes before 2024-25 (a rule error); v2 replaced it.",
]


def _load_results(path: Path = RESULTS_PATH) -> dict[str, Any]:
    stat = path.stat()
    key = f"{path}:{stat.st_mtime_ns}:{stat.st_size}"
    if key in _cache:
        return _cache[key]
    body: dict[str, Any] = json.loads(path.read_bytes())
    claimed = body.pop("results_sha256")
    if content_hash(body) != claimed:
        raise ValueError("four-factors results changed")
    if (
        load_registration(runner.REGISTRATION).content_hash()
        != body["registration"]["content_sha256"]
    ):
        raise ValueError("four-factors registration changed after its results")
    body["results_sha256"] = claimed
    _cache.clear()
    _cache[key] = body
    return body


def _season_head(entry: dict[str, Any]) -> dict[str, Any]:
    cov = entry["coverage"]
    return {
        "season": entry["season"],
        "mu": entry["mu"],
        "ft_end_make_rate": entry["ft_end_make_rate"],
        "ft_end_orb_rate": entry["ft_end_orb_rate"],
        "games": cov["games"],
        "games_points_differ": len(cov["games_points_differ_from_final_score"]),
        "unattributed_rows": cov["unattributed_rows"],
    }


def summary() -> dict[str, Any]:
    body = _load_results()
    reg = body["registration"]
    return {
        "registration": {
            "identity": reg["identity"],
            "registered_on": reg["registered_on"],
            "content_sha256": reg["content_sha256"],
            "results_sha256": body["results_sha256"],
        },
        "paper": PAPER,
        "seasons": [
            {**_season_head(e), "league": e["league"]} for _, e in sorted(body["seasons"].items())
        ],
        "credits": CREDITS,
        "caveats": CAVEATS,
    }


def season(label: str) -> dict[str, Any] | None:
    body = _load_results()
    entry = body["seasons"].get(label)
    if entry is None:
        return None
    return {
        **_season_head(entry),
        "coverage": entry["coverage"],
        "league": entry["league"],
        "teams": [{"team": team, **row} for team, row in sorted(entry["teams"].items())],
    }
