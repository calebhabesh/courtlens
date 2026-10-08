"""Read-only IM03 gate replay and exact accounting of retained estimate discrepancies."""

from __future__ import annotations

import argparse
import json
from collections import Counter
from decimal import Decimal
from pathlib import Path
from typing import Any

from courtlens.domain.impact_possessions import build_impact_game
from courtlens.domain.possession_repair import normalize_events, order_same_clock
from courtlens.ingestion.impact_archive import write_json
from courtlens.ingestion.impact_population import read_json
from courtlens.ingestion.native_reconstruction import content_hash
from courtlens.ingestion.sportsdataverse import hash_file


def verified(path: Path) -> dict[str, Any]:
    value = read_json(path)
    if (
        content_hash({k: v for k, v in value.items() if k != "content_sha256"})
        != value["content_sha256"]
    ):
        raise ValueError(f"content hash mismatch: {path}")
    return value


def replay_fixture(path: Path) -> dict[str, Any]:
    fixture = verified(path)
    candidate = fixture["candidate"]
    source = candidate["arbitration"]["selected"]
    events, _ = order_same_clock(
        normalize_events(
            fixture["rows"],
            source=source,
            source_sha256=candidate["input_sha256"][source],
            boxes=fixture["boxes"],
        ),
        candidate["game_id"],
    )
    game = build_impact_game(
        candidate=candidate,
        events=events,
        raw_rows={int(row["_row_index"]): row for row in fixture["rows"]},
        home_team=fixture["schedule"]["home_team_id"],
        away_team=fixture["schedule"]["away_team_id"],
        team_boxes=fixture["team_boxes"],
    )
    if game != fixture["game"]:
        raise ValueError("fixture replay changed retained game")
    return game


def decomposition(game: dict[str, Any], team: str) -> dict[str, str]:
    """Partition an accounting identity; categories do not assert causal defects."""
    terms: Counter[str] = Counter()
    for possession in game["possessions"]:
        if possession["offense_team_id"] != team:
            continue
        stats = possession["stats_json"]
        counted = int(possession["count_as_possession"])
        category = (
            "noncount_records"
            if not counted
            else "counted_with_ft"
            if stats["fta"]
            else "counted_without_ft"
        )
        residual = (
            Decimal(counted - stats["fga"] + stats["orb"] - stats["turnovers"])
            - Decimal("0.44") * stats["fta"]
        )
        terms[category] += residual
    conservation = game["conservation"][team]
    terms["orb_box_correction"] = Decimal(-conservation["orb_box_delta"])
    terms["turnover_box_correction"] = Decimal(conservation["turnovers_box_delta"])
    if sum(terms.values()) != Decimal(str(conservation["delta"])):
        raise ValueError(f"decomposition does not conserve: {game['game_id']}/{team}")
    return {key: str(value) for key, value in sorted(terms.items())}


def audit(report_path: Path) -> dict[str, Any]:
    report = verified(report_path)
    games = 0
    comparisons = 0
    within_two = 0
    categories: Counter[str] = Counter()
    public_exact = 0
    public_exact_failing = 0
    cohorts = {}
    samples = {}
    for name, cohort in sorted(report["cohorts"].items()):
        count = 0
        passed = 0
        for gid, member in sorted(cohort["games"].items()):
            digest = member["content_sha256"]
            game = verified(
                Path("data/derived/impact-population/games") / digest[:2] / f"{digest}.json.gz"
            )
            if (
                game["content_sha256"] != digest
                or game["game_id"] != gid
                or game["candidate_sha256"] != member["candidate_sha256"]
                or game["conservation"] != member["conservation"]
            ):
                raise ValueError(f"retained member differs: {name}/{gid}")
            games += 1
            for team, conservation in game["conservation"].items():
                count += 1
                passed += abs(Decimal(str(conservation["delta"]))) <= 2
                terms = decomposition(game, team)
                categories.update({key: Decimal(value) for key, value in terms.items()})
                crosscheck = member["public_crosscheck"]
                if crosscheck["status"] == "compared" and crosscheck["deltas"][team] == 0:
                    public_exact += 1
                    public_exact_failing += abs(Decimal(str(conservation["delta"]))) > 2
                if gid in {"0022400001", "0022500007"}:
                    samples[f"{gid}:{team}"] = {
                        "game_sha256": digest,
                        "conservation": conservation,
                        "decomposition": terms,
                        "public_crosscheck": crosscheck,
                    }
            if len(cohort["games"]) != cohort["admitted_games"]:
                raise ValueError("coverage membership size differs")
        if passed != cohort["box_estimate_distribution"]["within_two"]:
            raise ValueError("retained gate tally differs")
        comparisons += count
        within_two += passed
        cohorts[name] = {"team_games": count, "within_two": passed}
    return {
        "input_report_sha256": report["content_sha256"],
        "accepted_im02_sha256": report["accepted_im02_sha256"],
        "script_sha256": hash_file(Path(__file__))[0],
        "games": games,
        "team_games": comparisons,
        "within_two": within_two,
        "outside_two": comparisons - within_two,
        "public_exact": public_exact,
        "public_exact_outside_two": public_exact_failing,
        "decomposition_sums": {key: str(value) for key, value in sorted(categories.items())},
        "cohorts": cohorts,
        "samples": samples,
        "gate_passed": within_two == comparisons,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--coverage", action="store_true", help="audit all retained IM03 games")
    parser.add_argument("--output", type=Path, help="new append-only JSON evidence path")
    args = parser.parse_args()
    if args.coverage:
        result = audit(Path("docs/evidence/im03/coverage-and-conservation.json.gz"))
    else:
        game = replay_fixture(Path("tests/fixtures/impact_repair/im03-game.json.gz"))
        result = {
            "game_id": game["game_id"],
            "game_sha256": game["content_sha256"],
            "teams": {
                team: {"conservation": value, "decomposition": decomposition(game, team)}
                for team, value in game["conservation"].items()
            },
            "gate_passed": all(
                abs(Decimal(str(v["delta"]))) <= 2 for v in game["conservation"].values()
            ),
        }
    result["content_sha256"] = content_hash(result)
    if args.output:
        write_json(args.output, result)
    print(json.dumps(result, sort_keys=True))
    return 0 if result["gate_passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
