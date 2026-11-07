"""Team playtype difficulty (RD03, owner-approved descriptive addition to R04's zTS page).

A team-season's mix is the sum of every listed Synergy offensive row its players logged for that
team. Expected TS and Playtype Difficulty then follow R04's player definitions exactly, against the
same frozen league references, so the league's scoring-possession-weighted team difficulty is 0.
Rows under the source's 10-possession floor are absent, so team totals run slightly low. This is
description, not a test: nothing here is registered or compared against a target.
"""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from courtlens.domain import zts


def team_season(
    rows: Mapping[str, Mapping[str, list[zts.TypeRow]]],
    reference: Mapping[str, Any],
) -> dict[str, dict[str, Any]]:
    """Every team's summed mix, Expected TS, difficulty and per-player share of the mix.

    `rows` is player id → team id → that player-team-season's listed rows; `reference` is the
    season's frozen league reference (`ts` and `types[k]["ts"]`).
    """
    teams: dict[str, dict[str, Any]] = {}
    for player, by_team in rows.items():
        for team, type_rows in by_team.items():
            slot = teams.setdefault(team, {"types": {}, "players": {}})
            player_sp = 0.0
            for r in type_rows:
                t = slot["types"].setdefault(
                    r.play_type, {"possessions": 0.0, "scoring_possessions": 0.0, "points": 0.0}
                )
                t["possessions"] += r.possessions
                t["scoring_possessions"] += r.scoring_possessions
                t["points"] += r.points
                player_sp += r.scoring_possessions
            slot["players"][player] = slot["players"].get(player, 0.0) + player_sp
    out: dict[str, dict[str, Any]] = {}
    for team, slot in sorted(teams.items()):
        types = dict(sorted(slot["types"].items()))
        total_sp = sum(v["scoring_possessions"] for v in types.values())
        total_pts = sum(v["points"] for v in types.values())
        if total_sp <= 0:
            raise ValueError(f"team {team} has no scoring possessions")
        expected = zts.expected_ts(zts.shares(types), reference)
        players = sorted(slot["players"].items(), key=lambda kv: (-kv[1], kv[0]))
        out[team] = {
            "scoring_possessions": total_sp,
            "points": total_pts,
            "synergy_ts": total_pts / (2.0 * total_sp),
            "expected_ts": expected,
            "difficulty": float(reference["ts"]) - expected,
            "types": types,
            "players": [
                {"player_id": pid, "scoring_possessions": sp, "share": sp / total_sp}
                for pid, sp in players
            ],
        }
    return out


def league_difficulty(teams: Mapping[str, Mapping[str, Any]]) -> float:
    """Scoring-possession-weighted mean team difficulty; 0 when the teams partition the league."""
    total = sum(t["scoring_possessions"] for t in teams.values())
    if total <= 0:
        raise ValueError("no scoring possessions")
    return float(sum(t["difficulty"] * t["scoring_possessions"] for t in teams.values()) / total)


def spread(values: list[float]) -> float:
    """Population standard deviation (the sigma beside each curve)."""
    if not values:
        raise ValueError("no values")
    mean = sum(values) / len(values)
    return float((sum((v - mean) ** 2 for v in values) / len(values)) ** 0.5)
