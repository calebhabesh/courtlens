from __future__ import annotations

import hashlib
import json
import math
from collections.abc import Mapping
from typing import SupportsFloat

SUPPORTED_SCORING_STATS = frozenset(
    {
        "points",
        "rebounds",
        "assists",
        "steals",
        "blocks",
        "turnovers",
        "three_pointers_made",
        "field_goals_made",
        "field_goals_attempted",
        "free_throws_made",
        "free_throws_attempted",
        "offensive_rebounds",
        "defensive_rebounds",
        "personal_fouls",
    }
)

DEFAULT_POINTS_RULES: dict[str, float] = {
    "points": 1.0,
    "rebounds": 1.2,
    "assists": 1.5,
    "steals": 3.0,
    "blocks": 3.0,
    "turnovers": -1.0,
    "three_pointers_made": 0.5,
}


def validate_scoring_rules(rules: Mapping[str, float]) -> dict[str, float]:
    if not rules:
        raise ValueError("at least one scoring rule is required")
    unknown = set(rules) - SUPPORTED_SCORING_STATS
    if unknown:
        raise ValueError(f"unsupported scoring stats: {', '.join(sorted(unknown))}")
    normalized = {key: float(value) for key, value in sorted(rules.items())}
    if not all(math.isfinite(value) for value in normalized.values()):
        raise ValueError("scoring weights must be finite")
    if any(abs(value) > 100 for value in normalized.values()):
        raise ValueError("scoring weights must be between -100 and 100")
    return normalized


def scoring_rules_hash(rules: Mapping[str, float]) -> str:
    normalized = validate_scoring_rules(rules)
    canonical = json.dumps(normalized, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def fantasy_points(
    stat_line: Mapping[str, SupportsFloat | None], rules: Mapping[str, float]
) -> float:
    normalized = validate_scoring_rules(rules)
    total = sum(float(stat_line.get(stat) or 0) * weight for stat, weight in normalized.items())
    return round(total, 2)


def scoring_breakdown(
    stat_line: Mapping[str, SupportsFloat | None], rules: Mapping[str, float]
) -> dict[str, dict[str, float]]:
    normalized = validate_scoring_rules(rules)
    return {
        stat: {
            "value": float(stat_line.get(stat) or 0),
            "weight": weight,
            "points": round(float(stat_line.get(stat) or 0) * weight, 2),
        }
        for stat, weight in normalized.items()
    }
