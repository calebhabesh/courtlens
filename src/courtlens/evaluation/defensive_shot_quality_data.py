"""Matchup tables for `courtlens-defensive-shot-quality-v1` (Research R06, Part B).

One content-hashed table per regular season 2017-18 to 2025-26 from the retained shufinskiy
`matchups_<year>` archives (the IM01/R01 pins): one row per (game, shooter, defender) with at
least one field-goal attempt. `person_id` is the shooter and `matchups_person_id` the defender.

    python -m courtlens.evaluation.defensive_shot_quality_data --season 2024-25
"""

from __future__ import annotations

import argparse
import json
from collections import Counter
from pathlib import Path
from typing import Any

import numpy as np

from courtlens.evaluation import expected_shot_v2_data as shots_data

OUTPUT = Path("data/derived/defensive-shot-quality-v1/tables")
SEASONS = tuple(f"{y}-{(y + 1) % 100:02d}" for y in range(2017, 2026))


def archive_pins() -> dict[str, str]:
    pins: dict[str, str] = {}
    for path in shots_data.OBSERVATIONS:
        for asset in json.loads(path.read_text())["assets"]:
            name = asset["name"]
            if name.startswith("datasets/matchups_") and "_po_" not in name:
                year = int(name.removeprefix("datasets/matchups_").removesuffix(".tar.xz"))
                pins[f"{year}-{(year + 1) % 100:02d}"] = asset["sha256"]
    return {s: pins[s] for s in SEASONS}


def count(value: str) -> int:
    number = float(value or 0)
    if number < 0 or number != int(number):
        raise SystemExit(f"invalid matchup count {value!r}")
    return int(number)


def rows_from(source: Any) -> tuple[dict[str, np.ndarray], Counter[str], set[str]]:
    """Validated arrays from archive rows; any impossible row stops the build."""
    columns: dict[str, list[Any]] = {
        k: []
        for k in (
            "game_id",
            "shooter",
            "defender",
            "shooter_team",
            "defender_team",
            "fga2",
            "fgm2",
            "fga3",
            "fgm3",
        )
    }
    counts: Counter[str] = Counter()
    games: set[str] = set()
    seen: set[tuple[str, str, str]] = set()
    for row in source:
        counts["rows"] += 1
        game = row["game_id"].zfill(10)
        games.add(game)
        shooter, defender = row["person_id"], row["matchups_person_id"]
        key = (game, shooter, defender)
        team, home, away = row["team_id"], row["home_team_id"], row["away_team_id"]
        if key in seen or not shooter or not defender or shooter == defender:
            raise SystemExit(f"invalid or duplicate matchup pair {key}")
        if not game.startswith("002") or team not in (home, away):
            raise SystemExit(f"matchup row outside a regular-season pairing {key}")
        seen.add(key)
        fga = count(row["matchup_field_goals_attempted"])
        fgm = count(row["matchup_field_goals_made"])
        fg3a = count(row["matchup_three_pointers_attempted"])
        fg3m = count(row["matchup_three_pointers_made"])
        ftm = count(row["matchup_free_throws_made"])
        if fgm > fga or fg3a > fga or fg3m > fg3a or fg3m > fgm:
            raise SystemExit(f"impossible shooting counts {key}")
        if count(row["player_points"]) != 2 * (fgm - fg3m) + 3 * fg3m + ftm:
            counts["points_differ"] += 1
        counts["help_fga"] += count(row["help_field_goals_attempted"])
        if fga == 0:
            counts["rows_without_fga"] += 1
            continue
        counts["fga"] += fga
        counts["fg_points"] += 2 * (fgm - fg3m) + 3 * fg3m
        counts["fg3a"] += fg3a
        columns["game_id"].append(game)
        columns["shooter"].append(int(shooter))
        columns["defender"].append(int(defender))
        columns["shooter_team"].append(int(team))
        columns["defender_team"].append(int(away if team == home else home))
        columns["fga2"].append(fga - fg3a)
        columns["fgm2"].append(fgm - fg3m)
        columns["fga3"].append(fg3a)
        columns["fgm3"].append(fg3m)
    arrays = {
        k: np.array(v, dtype=np.str_) if k == "game_id" else np.array(v, dtype=np.int64)
        for k, v in columns.items()
    }
    return arrays, counts, games


def build(season: str, output: Path = OUTPUT) -> dict[str, Any]:
    year = int(season[:4])
    sha = archive_pins()[season]
    arrays, counts, games = rows_from(shots_data.archive_csv(sha, f"matchups_{year}"))
    digest = shots_data.content_sha(arrays)
    output.mkdir(parents=True, exist_ok=True)
    np.savez(output / f"{season}.{digest[:16]}.npz", **arrays)  # type: ignore[arg-type]
    receipt = {
        "season": season,
        "content_sha256": digest,
        "archive_sha256": sha,
        "games": len(games),
        "table_rows": len(arrays["shooter"]),
        "counts": dict(sorted(counts.items())),
    }
    (output / f"{season}.receipt.json").write_text(json.dumps(receipt, indent=1, sort_keys=True))
    print(json.dumps(receipt, sort_keys=True), flush=True)
    return receipt


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--season", action="append", choices=SEASONS)
    parser.add_argument("--output", type=Path, default=OUTPUT)
    args = parser.parse_args()
    for season in args.season or SEASONS:
        build(season, args.output)


if __name__ == "__main__":
    main()
