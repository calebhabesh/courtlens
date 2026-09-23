"""Reproducible, read-only validation of the pinned historical archive.

Usage: python scripts/historical_source_spike.py acquire|analyze [--root PATH]
The JSON analysis is written beside the ignored raw files. It is evidence, not import.
"""

from __future__ import annotations

import argparse
import collections
import contextlib
import json
from pathlib import Path

from courtload.ingestion.archive import FILES, SHA256, acquire_archive, hash_file
from courtload.ingestion.archive_normalization import (
    COUNT_FIELDS as COUNT_FIELDS,
)
from courtload.ingestion.archive_normalization import (
    PLAYER_FILES,
    SEASONS,
    TEAM_FILE,
    canonical_hash,
    game_id,
    parse_player,
    parse_team,
    rows,
)


def analyze(root: Path) -> dict[str, object]:
    source_files = {}
    for name, expected in FILES.items():
        digest, size = hash_file(root / name)
        if size != expected or digest != SHA256[name]:
            raise ValueError(f"{name} differs from pinned size or SHA-256")
        source_files[name] = {"bytes": size, "sha256": digest}

    season_rows: dict[str, collections.Counter[str]] = collections.defaultdict(collections.Counter)
    blanks: dict[str, collections.Counter[str]] = collections.defaultdict(collections.Counter)
    invalid: collections.Counter[str] = collections.Counter()
    invalid_examples: dict[str, list[str]] = collections.defaultdict(list)
    duplicates: collections.Counter[str] = collections.Counter()
    players: dict[tuple[str, str], tuple[dict[str, object], list[str]]] = {}
    teams: dict[tuple[str, str], tuple[dict[str, object], list[str]]] = {}
    conflicting_keys: set[tuple[str, str]] = set()
    team_conflicts: set[tuple[str, str]] = set()
    invalid_games: set[str] = set()
    conflicting_games: set[str] = set()
    raw_player_points: collections.Counter[tuple[str, str]] = collections.Counter()
    digest_rows: list[str] = []
    for name in (*PLAYER_FILES, TEAM_FILE):
        is_player = name in PLAYER_FILES
        target = players if is_player else teams
        for line, raw in rows(root / name):
            season = raw["season_year" if is_player else "SEASON_YEAR"]
            season_rows["player" if is_player else "team"][season] += 1
            if season not in SEASONS:
                continue
            blanks["player" if is_player else "team"].update(
                field for field, value in raw.items() if value is None or value == ""
            )
            locator = f"{name}:{line}"
            if is_player and raw["minutes"] and raw["points"].isdigit():
                try:
                    raw_game_id = game_id(raw["gameId"])
                except ValueError:
                    pass  # The parser below records the malformed source row.
                else:
                    raw_player_points[(raw_game_id, raw["teamTricode"])] += int(raw["points"])
            try:
                normalized = parse_player(raw) if is_player else parse_team(raw)
            except (ValueError, KeyError) as exc:
                reason = str(exc)
                invalid[reason] += 1
                if len(invalid_examples[reason]) < 5:
                    invalid_examples[reason].append(locator)
                if is_player:
                    with contextlib.suppress(ValueError):
                        invalid_games.add(game_id(raw["gameId"]))
                continue
            key = (
                str(normalized["game"]),
                str(normalized["player_id" if is_player else "team_id"]),
            )
            content = canonical_hash(normalized)
            digest_rows.append(f"{'P' if is_player else 'T'}:{key[0]}:{key[1]}:{content}")
            if key in target:
                existing, locators = target[key]
                if canonical_hash(existing) == content:
                    duplicates["identical_player" if is_player else "identical_team"] += 1
                else:
                    duplicates["conflicting_player" if is_player else "conflicting_team"] += 1
                    (conflicting_keys if is_player else team_conflicts).add(key)
                    conflicting_games.add(key[0])
                locators.append(locator)
            else:
                target[key] = normalized, [locator]

    game_teams: dict[str, list[dict[str, object]]] = collections.defaultdict(list)
    for key, (record, _) in teams.items():
        if key not in team_conflicts:
            game_teams[str(record["game"])].append(record)
    game_players: dict[str, list[dict[str, object]]] = collections.defaultdict(list)
    for key, (record, _) in players.items():
        if key not in conflicting_keys:
            game_players[str(record["game"])].append(record)

    game_counts: dict[str, collections.Counter[str]] = collections.defaultdict(collections.Counter)
    team_game_counts: dict[str, collections.Counter[str]] = collections.defaultdict(
        collections.Counter
    )
    reconciliation: collections.Counter[str] = collections.Counter()
    mismatch_examples: list[dict[str, object]] = []
    admitted_games: dict[str, list[dict[str, object]]] = {}
    for game, sides in game_teams.items():
        season = str(sides[0]["season"])
        game_counts[season]["team_games"] += 1
        if len(sides) != 2 or {s["side"] for s in sides} != {"home", "away"}:
            reconciliation["bad_team_pair"] += 1
            continue
        a, b = sides
        if (
            a["team"] != b["opponent"]
            or b["team"] != a["opponent"]
            or a["date"] != b["date"]
            or a["season"] != b["season"]
        ):
            reconciliation["bad_team_pair"] += 1
            continue
        game_counts[season]["paired_games"] += 1
        team_game_counts[season][str(a["team"])] += 1
        team_game_counts[season][str(b["team"])] += 1
        player_sides: dict[str, list[dict[str, object]]] = collections.defaultdict(list)
        invalid_member = False
        for player in game_players.get(game, []):
            if (
                player["team"] not in (a["team"], b["team"])
                or player["date"] != a["date"]
                or player["season"] != season
                or player["opponent"] != (b["team"] if player["team"] == a["team"] else a["team"])
            ):
                invalid_member = True
            player_sides[str(player["team"])].append(player)
        if invalid_member:
            reconciliation["bad_player_membership_games"] += 1
            continue
        if game in invalid_games:
            reconciliation["games_with_invalid_player_rows"] += 1
            continue
        if game in conflicting_games:
            reconciliation["games_with_conflicting_rows"] += 1
            continue
        good = True
        for side in sides:
            matching = player_sides[str(side["team"])]
            if not matching:
                reconciliation["no_player_rows"] += 1
                good = False
                continue
            values = [p["stats"]["points"] for p in matching if p["appearance"] == "appeared"]
            if any(value is None for value in values):
                reconciliation["missing_player_points"] += 1
                good = False
                continue
            score = sum(values)
            if score != side["points"]:
                reconciliation["point_mismatch_sides"] += 1
                good = False
                if len(mismatch_examples) < 15:
                    mismatch_examples.append(
                        {
                            "game": game,
                            "team": side["team"],
                            "team_points": side["points"],
                            "player_points": score,
                        }
                    )
            else:
                reconciliation["point_match_sides"] += 1
        if good:
            game_counts[season]["admitted_games"] += 1
            admitted_games[game] = sides

    appearances: collections.Counter[str] = collections.Counter()
    minutes_cases: collections.Counter[str] = collections.Counter()
    player_teams: dict[tuple[str, str], set[str]] = collections.defaultdict(set)
    player_names: dict[tuple[str, str], str] = {}
    for record, _ in players.values():
        appearances[str(record["appearance"])] += 1
        if record["minutes_seconds"] is None:
            minutes_cases["missing"] += 1
        elif record["minutes_seconds"] == 0:
            minutes_cases["zero"] += 1
        if record["appearance"] == "appeared":
            player_key = (str(record["season"]), str(record["player_id"]))
            player_teams[player_key].add(str(record["team"]))
            player_names[player_key] = str(record["player"])
    trades = [
        {"season": key[0], "player_id": key[1], "name": player_names[key], "teams": sorted(values)}
        for key, values in player_teams.items()
        if len(values) > 1
    ]
    trades.sort(key=lambda item: (item["name"], item["player_id"]))
    trade_sample = []
    if trades:
        chosen = trades[0]
        for team in chosen["teams"]:
            matching_rows = [
                (record, locators)
                for record, locators in players.values()
                if record["season"] == chosen["season"]
                and record["player_id"] == chosen["player_id"]
                and record["team"] == team
                and record["appearance"] == "appeared"
            ]
            matching_rows.sort(key=lambda pair: (pair[0]["date"], pair[0]["game"]))
            if matching_rows:
                record, locators = matching_rows[0]
                trade_sample.append(
                    {
                        "player": chosen["name"],
                        "season": chosen["season"],
                        "game": record["game"],
                        "date": record["date"],
                        "team": team,
                        "locator": locators[0],
                    }
                )
    overtime = [
        game
        for game, sides in admitted_games.items()
        if any(float(side["minutes"]) > 48 for side in sides)
    ]
    raw_point_mismatches = [
        {
            "game": record["game"],
            "team": record["team"],
            "team_points": record["points"],
            "raw_player_points": raw_player_points[(str(record["game"]), str(record["team"]))],
        }
        for record, _ in teams.values()
        if raw_player_points[(str(record["game"]), str(record["team"]))] != record["points"]
    ]
    joined_sample = []
    for season in SEASONS:
        candidate_games = sorted(
            game for game, sides in admitted_games.items() if sides[0]["season"] == season
        )
        for game in candidate_games[:10]:
            joined_sample.append(
                {
                    "game": game,
                    "date": admitted_games[game][0]["date"],
                    "season": season,
                    "teams": [s["team"] for s in admitted_games[game]],
                    "team_points": [s["points"] for s in admitted_games[game]],
                    "player_rows": len(game_players[game]),
                }
            )
    return {
        "files": source_files,
        "seasons_scanned": {k: dict(v) for k, v in season_rows.items()},
        "selected_seasons": list(SEASONS),
        "blank_fields": {k: dict(v) for k, v in blanks.items()},
        "invalid_rows": dict(invalid),
        "invalid_examples": dict(invalid_examples),
        "duplicates": dict(duplicates),
        "unique_player_rows": len(players),
        "unique_team_rows": len(teams),
        "appearance": dict(appearances),
        "minutes_cases": dict(minutes_cases),
        "game_counts": {k: dict(v) for k, v in game_counts.items()},
        "team_game_counts": {k: dict(v) for k, v in team_game_counts.items()},
        "reconciliation": dict(reconciliation),
        "mismatch_examples": mismatch_examples,
        "traded_players_count": len(trades),
        "traded_players_sample": trades[:15],
        "traded_player_game_sample": trade_sample,
        "overtime_games_count": len(overtime),
        "overtime_game_sample": sorted(overtime)[:10],
        "raw_point_mismatches": raw_point_mismatches[:15],
        "raw_point_mismatch_count": len(raw_point_mismatches),
        "joined_game_sample": joined_sample,
        "normalized_rows_sha256": canonical_hash(sorted(digest_rows)),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("acquire", "analyze"))
    parser.add_argument("--root", type=Path, default=Path("data/raw/nocturnebear-a5f108b5"))
    parser.add_argument("--local-source", type=Path)
    args = parser.parse_args()
    if args.action == "acquire":
        print(acquire_archive(args.root, local_source=args.local_source))
    else:
        result = analyze(args.root)
        output = args.root / "source-spike.json"
        output.write_text(json.dumps(result, indent=2, sort_keys=True) + "\n")
        print(output)


if __name__ == "__main__":
    main()
