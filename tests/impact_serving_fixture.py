"""Small explicit serving fixtures; no owner artifacts or source downloads."""

from copy import deepcopy
from pathlib import Path
from typing import Any

from courtlens.evaluation.impact_rating_inputs import write_artifact
from courtlens.services.impact_serving import VERSION


def make_store(root: Path) -> tuple[Path, dict[str, Any]]:
    sample = {
        "qualified": True,
        "games": 30,
        "covered_games": 30,
        "seconds": 60000,
        "off_opportunities": 1200,
        "def_opportunities": 1100,
    }
    on = {
        "seconds": 60000,
        "off_controls": 1200,
        "def_controls": 1100,
        "points": 1320,
        "allowed": 1100,
        "ortg": 110,
        "drtg": 100,
        "net": 10,
    }
    off = {**on, "points": 1200, "ortg": 100, "net": 0}
    record = {"on": on, "off": off, "difference": {"ortg": 10, "drtg": 0, "net": 10}}
    players = {
        p: {
            "metrics": {"rapm": value},
            "support": {"rapm": deepcopy(sample)},
            "on_off": {"1610612761": deepcopy(record)},
        }
        for p, value in (("a", 2.0), ("b", -1.0), ("c", 2.0))
    }
    players["c"]["on_off"]["1610612738"] = deepcopy(record)
    body = {
        "version": VERSION,
        "entries": [
            {
                "kind": "ratings",
                "sha256": "rating-one",
                "scope": {
                    "season": "2023-24",
                    "seasons": ["2023-24"],
                    "phase": "regular_season",
                    "years": 1,
                    "cutoff": "2024-07-01",
                    "last_included_date": "2024-01-31",
                },
                "coverage": [],
                "players": players,
            },
            {
                "kind": "extras",
                "sha256": "extras-one",
                "scope": {
                    "season": "2023-24",
                    "seasons": ["2023-24"],
                    "phase": "regular_season",
                    "years": 1,
                    "cutoff": "2024-07-01",
                    "last_included_date": "2024-01-31",
                },
                "coverage": [],
                "players": {
                    p: {
                        "metrics": {"pbp_stl_per100": value},
                        "support": {
                            "pbp_stl_per100": {
                                "qualified": p != "b",
                                "numerator": value * 10,
                                "denominator": 1000,
                                "covered_games": 20,
                                "total_games": 30,
                            }
                        },
                        "on_off": {},
                    }
                    for p, value in (("a", 1), ("b", 2), ("c", 3))
                },
            },
        ],
    }
    path, _ = write_artifact(root, body)
    return path, body
