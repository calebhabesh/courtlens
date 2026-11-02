"""Write each season's playoff-series matchups from the retained NBA.com matchup archives.

Offline: reads the `matchups_po_<year>` and `matchups_<year>` archives the impact pipeline
retained (NBA.com `boxscorematchupsv3`, one row per offensive player and defender) and writes
data/derived/series-matchups-v1/<season>.json.gz with every playoff game's pairs and, for each
pair of teams that met in those playoffs, their regular-season games' pairs. No network I/O.

    .venv/bin/python scripts/series_matchups.py
"""

from __future__ import annotations

import gzip
import json
from collections import defaultdict
from pathlib import Path

from courtlens.evaluation.impact_extras_runner import extra_rows
from courtlens.services.series_matchups import FIELDS, VERSION, matchups_dir

ARCHIVE = Path("data/raw/impact-archive")


def assets() -> dict[str, tuple[Path, str]]:
    """Every retained matchup archive by name: (object path, sha256)."""
    found: dict[str, tuple[Path, str]] = {}
    for receipt in sorted((ARCHIVE / "observations").glob("*.json")):
        for asset in json.loads(receipt.read_text()).get("assets", []):
            name = asset["name"].removeprefix("datasets/").removesuffix(".tar.xz")
            path = ARCHIVE / asset.get("object", "")
            if name.startswith("matchups") and asset.get("object") and path.exists():
                found[name] = (path, asset["sha256"])
    return found


def pairs(rows: list[dict[str, str]]) -> list[list[object]]:
    return [
        [
            r["person_id"],
            r["matchups_person_id"],
            r["team_tricode"],
            float(r["partial_possessions"] or 0),
            float(r["matchup_minutes_sort"] or 0),
            *(
                int(float(r[key] or 0))
                for key in (
                    "player_points",
                    "matchup_field_goals_made",
                    "matchup_field_goals_attempted",
                    "matchup_three_pointers_made",
                    "matchup_three_pointers_attempted",
                    "matchup_free_throws_made",
                    "matchup_free_throws_attempted",
                    "matchup_assists",
                    "matchup_turnovers",
                )
            ),
        ]
        for r in rows
    ]


def main() -> None:
    found = assets()
    out = matchups_dir()
    out.mkdir(parents=True, exist_ok=True)
    for name in sorted(n for n in found if n.startswith("matchups_po_")):
        year = int(name.rsplit("_", 1)[1])
        season = f"{year}-{(year + 1) % 100:02d}"
        regular = f"matchups_{year}"
        playoff_rows = extra_rows(found[name][0], name, "game_id")
        met = {frozenset(r["team_tricode"] for r in rows) for rows in playoff_rows.values()}
        regular_rows = extra_rows(found[regular][0], regular, "game_id") if regular in found else {}
        names: dict[str, str] = {}
        games: dict[str, dict[str, object]] = {}
        for phase, grouped in (("playoffs", playoff_rows), ("regular_season", regular_rows)):
            for game_id, rows in sorted(grouped.items()):
                teams = frozenset(r["team_tricode"] for r in rows)
                if phase == "regular_season" and teams not in met:
                    continue
                for r in rows:
                    names[r["person_id"]] = f"{r['first_name']} {r['family_name']}".strip()
                    names[r["matchups_person_id"]] = (
                        f"{r['matchups_first_name']} {r['matchups_family_name']}".strip()
                    )
                games[game_id] = {"phase": phase, "pairs": pairs(rows)}
        body = {
            "version": VERSION,
            "season": season,
            "fields": FIELDS,
            "sources": {n: found[n][1] for n in (name, regular) if n in found},
            "names": dict(sorted(names.items())),
            "games": games,
        }
        path = out / f"{season}.json.gz"
        path.write_bytes(gzip.compress(json.dumps(body, sort_keys=True).encode(), mtime=0))
        counts = defaultdict(int)
        for game in games.values():
            counts[str(game["phase"])] += 1
        print(f"{season}: {dict(counts)} -> {path} ({path.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
