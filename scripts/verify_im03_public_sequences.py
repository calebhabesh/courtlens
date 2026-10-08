"""Inspect retained public possession groups against source-evidenced CourtLens controls."""

from __future__ import annotations

import argparse
from collections import Counter
from pathlib import Path

from courtlens.domain.impact_public_verification import (
    public_sequence_groups,
    review_public_sequences,
)
from courtlens.ingestion.impact_archive import archive_rows, write_json
from courtlens.ingestion.impact_population import read_json
from courtlens.ingestion.impact_repair_audit import retain_candidate, retained_boxes
from courtlens.ingestion.native_reconstruction import content_hash
from courtlens.ingestion.sportsdataverse import hash_file


def seconds(clock):
    minute, second = clock.split(":")
    return int(minute) * 60 + float(second)


def public_signature(row):
    return (
        int(row["PERIOD"]),
        seconds(row["ENDTIME"]),
        int(float(row["FG2A"])) + int(float(row["FG3A"])),
        int(float(row["FG2M"])) + int(float(row["FG3M"])),
        int(float(row["TURNOVERS"])),
    )


def court_signature(possession):
    stats = possession["stats_json"]
    return (
        possession["period"],
        possession["end_seconds_remaining"],
        stats["fga"],
        stats["fgm"],
        stats["turnovers"],
    )


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--coverage",
        type=Path,
        default=Path("docs/evidence/im03/coverage-and-conservation.json.gz"),
    )
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument(
        "--bundle-root",
        type=Path,
        help="compare new immutable bundles instead of historical coverage",
    )
    args = parser.parse_args()
    coverage = read_json(args.coverage)
    if args.bundle_root:
        cohorts = {}
        for bundle_path in sorted((args.bundle_root / "bundles").glob("*.json.gz")):
            bundle = read_json(bundle_path)
            cohorts[f"{bundle['season']}:{bundle['phase']}"] = {
                "bundle_path": str(bundle_path),
                "games": {
                    gid: {"public_crosscheck": member["public_possession_crosscheck"]}
                    for gid, member in bundle["members"].items()
                },
            }
        coverage = {"cohorts": cohorts}
        coverage["content_sha256"] = content_hash(coverage)
    observation = read_json(
        Path("data/raw/impact-archive/observations/068decb9-4599-4385-91dc-a541f1302ff3.json")
    )
    results = {}
    totals = Counter()
    for year in (2023, 2024):
        cohort = coverage["cohorts"][f"{year}-{str(year + 1)[-2:]}:regular_season"]
        asset = next(
            a for a in observation["assets"] if a["name"] == f"datasets/pbpstats_{year}.tar.xz"
        )
        path = Path("data/raw/impact-archive") / asset["object"]
        if hash_file(path)[0] != asset["sha256"]:
            raise ValueError("public archive hash changed")
        groups = public_sequence_groups(archive_rows(path, f"pbpstats_{year}"))
        bundle = read_json(Path(cohort["bundle_path"]))
        _, box_lookup, _ = retained_boxes(Path("data/raw"), year + 1)
        for gid, member in sorted(cohort["games"].items()):
            comparison = member["public_crosscheck"]
            if comparison["status"] != "compared":
                continue
            game = read_json(Path(bundle["members"][gid]["path"]))
            # Team IDs are taken from the independent box excerpt, not name inference.
            for team, delta in comparison["deltas"].items():
                other = next(b["team_tricode"] for b in box_lookup[gid] if b["team_id"] != team)
                public = groups[(gid, other)]
                court = [
                    p
                    for p in game["possessions"]
                    if p["offense_team_id"] == team and p["count_as_possession"]
                ]
                unmatched = list(court)
                public_missing = []
                for row in public:
                    sig = public_signature(row)
                    matches = [p for p in unmatched if court_signature(p) == sig]
                    if not matches:
                        matches = [
                            p
                            for p in unmatched
                            if court_signature(p)[0] == sig[0]
                            and court_signature(p)[2:] == sig[2:]
                            and abs(court_signature(p)[1] - sig[1]) <= 1
                        ]
                    if matches:
                        unmatched.remove(matches[0])
                    else:
                        public_missing.append(row)
                empty = [
                    r
                    for r in public_missing
                    if not r["EVENTS"].strip() and public_signature(r)[2:] == (0, 0, 0)
                ]
                residual_public = [r for r in public_missing if r not in empty]
                late = [
                    p
                    for p in unmatched
                    if p["start_seconds_remaining"] <= 2
                    and p["points"] == 0
                    and p["end_seconds_remaining"] == 0
                ]
                residual_court = [p for p in unmatched if p not in late]
                totals["comparisons"] += 1
                totals["empty_public_controls"] += len(empty)
                totals["late_court_controls"] += len(late)
                totals["unmatched_public_records"] += len(residual_public)
                totals["unmatched_court_records"] += len(residual_court)
                results[f"{gid}:{team}"] = {
                    "delta": delta,
                    "public_sha256": asset["sha256"],
                    "empty_public_controls": [
                        {k: r[k] for k in ("PERIOD", "STARTTIME", "ENDTIME", "EVENTS")}
                        for r in empty
                    ],
                    "late_court_controls": [
                        {
                            k: p[k]
                            for k in (
                                "period",
                                "start_seconds_remaining",
                                "end_seconds_remaining",
                                "points",
                            )
                        }
                        for p in late
                    ],
                    "unmatched_public": residual_public,
                    "unmatched_court": [
                        {
                            k: p[k]
                            for k in (
                                "period",
                                "start_order_index",
                                "end_order_index",
                                "start_seconds_remaining",
                                "end_seconds_remaining",
                                "points",
                                "stats_json",
                            )
                        }
                        for p in residual_court
                    ],
                }
                if "event_verification" in bundle["members"][gid]:
                    review = review_public_sequences(
                        game,
                        read_json(Path(bundle["members"][gid]["event_verification"]["path"]))[
                            "rows"
                        ],
                        public,
                        team,
                    )
                    if review["delta"] != delta:
                        raise ValueError("public count differs from retained cross-check")
                    results[f"{gid}:{team}"]["source_review"] = review
                    totals["source_review_unresolved"] += not review["passed"]
    result = {
        "input_sha256": coverage["content_sha256"],
        "script_sha256": hash_file(Path(__file__))[0],
        "totals": dict(totals),
        "comparisons": results,
    }
    result["content_sha256"] = content_hash(result)
    if args.output.suffix == ".gz":
        retain_candidate(args.output, result)
    else:
        write_json(args.output, result)
    print(dict(totals))


if __name__ == "__main__":
    main()
