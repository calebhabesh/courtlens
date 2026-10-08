"""Independent IM05 artifact arithmetic, box conservation and matchup read-back."""

from __future__ import annotations

import argparse
import gzip
import json
import math
from collections import Counter, defaultdict
from fractions import Fraction
from pathlib import Path

from courtlens.ingestion.impact_archive import archive_rows, write_json
from courtlens.ingestion.impact_repair_audit import retained_boxes
from courtlens.ingestion.native_reconstruction import content_hash
from courtlens.ingestion.sportsdataverse import hash_file
from courtlens.ingestion.workbench_normalization import normalize_game_id

BUCKETS = ("create", "space", "trans", "finish", "unknown")


def ratio(n, d, scale=1):
    return float(Fraction(str(n)) * Fraction(str(scale)) / Fraction(str(d))) if d else None


def assert_number(actual, expected):
    if expected is None:
        if actual is not None:
            raise ValueError("unknown reference became a value")
    elif actual is None or not math.isclose(actual, expected, abs_tol=1e-10, rel_tol=1e-10):
        raise ValueError(f"independent arithmetic differs: {actual} / {expected}")


def verify(first: Path, second: Path, output: Path) -> dict:
    left, right = (json.loads(p.read_text()) for p in (first, second))
    for receipt in (left, right):
        if (
            content_hash({k: v for k, v in receipt.items() if k != "content_sha256"})
            != receipt["content_sha256"]
        ):
            raise ValueError("run receipt hash changed")
    if {k: v for k, v in left.items() if k not in {"elapsed_seconds", "content_sha256"}} != {
        k: v for k, v in right.items() if k not in {"elapsed_seconds", "content_sha256"}
    }:
        raise ValueError("independent replay changed outputs or provenance")
    if not left["database_readback"]:
        raise ValueError("accepted PostgreSQL read-back was not executed")
    for p, h in left["method"]["code_sha256"].items():
        if hash_file(Path(p))[0] != h:
            raise ValueError("runner code changed during verification")
    if hash_file(Path("docs/design/impact-extras-v1.md"))[0] != left["method"]["contract_sha256"]:
        raise ValueError("changed contract")
    observation = json.loads(
        Path(
            "data/raw/impact-archive/observations/068decb9-4599-4385-91dc-a541f1302ff3.json"
        ).read_text()
    )
    assets = {a["name"]: a for a in observation["assets"]}
    bundles = [
        json.loads(gzip.decompress(p.read_bytes()))
        for p in Path("data/derived/impact-event-gate/bundles").glob("*.json.gz")
    ]
    summaries = []
    comparisons = 0
    for receipt in left["artifacts"]:
        path, fact_path = Path(receipt["path"]), Path(receipt["fact_path"])
        body, facts = (json.loads(p.read_text()) for p in (path, fact_path))
        if (
            content_hash(body) != receipt["sha256"]
            or hash_file(path)[0] != receipt["sha256"]
            or content_hash(facts) != receipt["fact_sha256"]
        ):
            raise ValueError("artifact hash mismatch")
        bundle = next(
            b
            for b in bundles
            if b["season"] == receipt["season"] and b["phase"] == receipt["phase"]
        )
        members = {
            g: m
            for g, m in bundle["members"].items()
            if m["schedule"]["game_date"] < body["cutoff"]
        }
        if set(facts) != set(members) or set(body["input"]) != set(members):
            raise ValueError("selected membership differs from IM03")
        year = int(receipt["season"][:4])
        boxes = retained_boxes(Path("data/raw"), year + 1)[0]
        suffix = "_po" if receipt["phase"] == "playoffs" else ""
        name = f"matchups{suffix}_{year}"
        a = assets[f"datasets/{name}.tar.xz"]
        # Independent raw orientation/coverage ledger; never imports game_facts.
        matchup = defaultdict(Counter)
        represented = defaultdict(set)
        invalid_games = set()
        for r in archive_rows(Path("data/raw/impact-archive") / a["object"], name):
            gid = normalize_game_id(r["game_id"])
            if gid not in members:
                continue
            roster = {b["person_id"]: b["team_id"] for b in boxes[gid]}
            off, defender = r["person_id"], r["matchups_person_id"]
            if off not in roster or defender not in roster:
                invalid_games.add(gid)
                continue
            if roster[off] == roster[defender] or roster[off] != r["team_id"]:
                raise ValueError("raw matchup teams disagree")
            matchup[gid][defender] += int(r["matchup_field_goals_attempted"])
            represented[gid].add(defender)
        league_points = 0
        league_tsa = Fraction(0)
        by_player = defaultdict(list)
        league_buckets = {b: Counter() for b in BUCKETS}
        for gid, g in facts.items():
            if (
                g["game_sha256"] != members[gid]["content_sha256"]
                or g["day"] != members[gid]["schedule"]["game_date"]
                or body["input"][gid]["facts_sha256"] != content_hash(g["facts"])
            ):
                raise ValueError("game fact membership changed")
            box_map = {b["person_id"]: b for b in boxes[gid]}
            for p, r in g["facts"]["players"].items():
                by_player[p].append(r)
                expected_matchup = (
                    matchup[gid][p] if gid not in invalid_games and p in represented[gid] else None
                )
                assert_number(r["matchup_fga"], expected_matchup)
                comparisons += 1
                if r["box"] is not None:
                    source = box_map[p]
                    for field, name in (
                        ("points", "points"),
                        ("fga", "field_goals_attempted"),
                        ("fgm", "field_goals_made"),
                        ("fta", "free_throws_attempted"),
                        ("ftm", "free_throws_made"),
                    ):
                        count = int(source[name])
                        if count != r["box"][field] or count != sum(
                            b.get(field, 0) for b in r["buckets"].values()
                        ):
                            raise ValueError("independent player box/bucket conservation failed")
                    league_points += int(source["points"])
                    league_tsa += Fraction(source["field_goals_attempted"]) + Fraction(
                        11, 25
                    ) * int(source["free_throws_attempted"])
                    for b in BUCKETS:
                        league_buckets[b].update(r["buckets"][b])
        league_ts = ratio(league_points, 2 * league_tsa)
        assert_number(body["league"]["ts"], league_ts)
        for p, rows in by_player.items():
            metrics = body["players"][p]["metrics"]
            samples = [r for r in rows if r["box"] is not None]

            def total(group, key, sample=samples):
                return sum(r[group].get(key, 0) for r in sample)

            off, defense = total("support", "off_controls"), total("support", "def_controls")
            pts, fga, fta = total("box", "points"), total("box", "fga"), total("box", "fta")
            tsa = Fraction(str(fga)) + Fraction(11, 25) * Fraction(str(fta))
            ts = ratio(pts, 2 * tsa) if samples else None
            expected = {
                "pbp_stl_per100": ratio(total("box", "steals"), defense, 100),
                "pbp_blk_per100": ratio(total("box", "blocks"), defense, 100),
                "pbp_foul_frequency": ratio(total("box", "pf"), (off + defense) / 2),
                "impact_ts_pct": ts,
                "impact_rts": ts - league_ts if ts is not None and league_ts is not None else None,
                "impact_tsadd_per100": ratio(pts - 2 * float(tsa) * league_ts, off, 100)
                if league_ts is not None and samples
                else None,
                "impact_three_point_rate": ratio(total("box", "fg3a"), fga),
                "impact_ftr": ratio(fta, fga),
                "impact_ast_per100": ratio(total("box", "assists"), off, 100),
                "pbp_bad_pass_tov": total("counts", "bad_pass_tov", rows),
            }
            for k, n, d in (
                ("pbp_drb_pct", "drb", "drb_opportunities"),
                ("pbp_block_recovered_pct", "block_recovered", "block_known"),
                ("pbp_self_miss_orb_pct", "self_orb", "self_opportunities"),
                ("pbp_team_miss_orb_pct", "team_orb", "team_opportunities"),
            ):
                expected[k] = ratio(total("counts", n, rows), total("counts", d, rows))
            subset = [r for r in rows if r["matchup_fga"] is not None]
            expected["matchup_fga_per100"] = ratio(
                sum(r["matchup_fga"] for r in subset), total("support", "def_controls", subset), 100
            )
            for key, gate, numerator in (
                ("pbp_rim_assists", "rim_assists_complete", "rim_assists"),
                ("pbp_charges_drawn", "charges_complete", "charges"),
            ):
                subset = [r for r in rows if r[gate]]
                expected[key] = total("counts", numerator, subset) if subset else None
            subset = [r for r in samples if r["charges_complete"]]
            expected["pbp_credited_ftov_per100"] = ratio(
                total("box", "steals", subset) + total("counts", "charges", subset),
                total("support", "def_controls", subset),
                100,
            )
            for b in BUCKETS:
                c = Counter()
                for r in samples:
                    c.update(r["buckets"][b])
                bt = Fraction(c["fga"]) + Fraction(11, 25) * c["fta"]
                lc = league_buckets[b]
                lt = Fraction(lc["fga"]) + Fraction(11, 25) * lc["fta"]
                bts, lts = ratio(c["points"], 2 * bt), ratio(lc["points"], 2 * lt)
                expected[f"pbp_{b}_tsa"] = float(bt) if samples else None
                expected[f"pbp_{b}_frequency"] = ratio(bt, tsa) if samples else None
                expected[f"pbp_{b}_ts"] = bts
                expected[f"pbp_{b}_rts"] = (
                    bts - lts if bts is not None and lts is not None else None
                )
            if set(expected) != set(metrics):
                raise ValueError("unverified column")
            for key, e in expected.items():
                assert_number(metrics[key]["value"], e)
                comparisons += 1
            frequencies = [metrics[f"pbp_{b}_frequency"]["value"] for b in BUCKETS]
            if all(v is not None for v in frequencies):
                assert_number(sum(frequencies), 1)
        summary = {
            **receipt,
            "invalid_matchup_games": sorted(invalid_games),
            "unknown_tsa_fraction": ratio(
                body["league"]["buckets"]["unknown"]["tsa"], body["league"]["tsa"]
            ),
        }
        summaries.append(summary)
        retained = output.parent / "artifacts" / f"{receipt['sha256']}.json.gz"
        retained.parent.mkdir(exist_ok=True)
        packed = gzip.compress(path.read_bytes(), mtime=0)
        if retained.exists():
            if retained.read_bytes() != packed:
                raise ValueError("retained evidence changed")
        else:
            with retained.open("xb") as stream:
                stream.write(packed)
    report = {
        "reproduced_artifacts": len(summaries),
        "comparisons": comparisons,
        "build_seconds": [left["elapsed_seconds"], right["elapsed_seconds"]],
        "receipts_sha256": [hash_file(first)[0], hash_file(second)[0]],
        "artifacts": summaries,
    }
    report["content_sha256"] = content_hash(report)
    write_json(output, report)
    return report


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--first", type=Path, required=True)
    parser.add_argument("--second", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    print(
        json.dumps(
            {
                k: v
                for k, v in verify(args.first, args.second, args.output).items()
                if k != "artifacts"
            }
        )
    )
