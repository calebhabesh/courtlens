"""Read-only, hash-checked IM03 input binding for descriptive ratings."""

from __future__ import annotations

import json
import math
from collections import Counter
from datetime import date
from pathlib import Path
from typing import Any

from sqlalchemy import Engine, text

from courtlens.domain.impact_possessions import METHOD_VERSION_V2
from courtlens.domain.impact_verification import GATE_VERSION
from courtlens.evaluation.impact_ratings import Stint, support
from courtlens.ingestion.impact_population import read_json
from courtlens.ingestion.impact_repair_audit import retained_boxes
from courtlens.ingestion.native_reconstruction import content_hash
from courtlens.ingestion.sportsdataverse import hash_file

ACCEPTANCE_SHA256 = "912254343fb563c128327c53b40becada7b912191981a2a7eeda14fa900d5c4d"
BOX_FIELDS = (
    "points",
    "field_goals_attempted",
    "free_throws_attempted",
    "three_pointers_made",
    "assists",
    "turnovers",
    "rebounds_offensive",
    "rebounds_defensive",
    "steals",
    "blocks",
    "fouls_personal",
)


def checked(path: Path, expected: str | None = None) -> dict[str, Any]:
    obj = read_json(path)
    digest = content_hash({k: v for k, v in obj.items() if k != "content_sha256"})
    if obj.get("content_sha256") != digest or (expected is not None and digest != expected):
        raise ValueError(f"changed content: {path}")
    return obj


def read_accepted_inputs(
    acceptance_path: Path, bundle_root: Path, database: Engine | None = None
) -> tuple[dict[str, Any], dict[str, Any]]:
    acceptance = checked(acceptance_path, ACCEPTANCE_SHA256)
    if (
        acceptance["method_version"] != METHOD_VERSION_V2
        or acceptance["gate_version"] != GATE_VERSION
    ):
        raise ValueError("only event-accepted IM03 v2 inputs are eligible")
    for name, receipt in acceptance["evidence"].items():
        if hash_file(acceptance_path.parent / name)[0] != receipt["file_sha256"]:
            raise ValueError("changed sealed IM03 evidence")
    admitted = {d["content_sha256"]: d for d in acceptance["datasets"]}
    paths = {p.stem.removesuffix(".json"): p for p in bundle_root.glob("*.json.gz")}
    if set(paths) != set(admitted):
        raise ValueError("expected exactly six accepted IM03 bundles")
    cohorts: dict[str, Any] = {}
    provenance: dict[str, Any] = {"acceptance_sha256": acceptance["content_sha256"], "cohorts": {}}
    for digest in sorted(admitted):
        bundle = checked(paths[digest], digest)
        if (
            bundle["method_version"] != METHOD_VERSION_V2
            or bundle["gate_version"] != GATE_VERSION
            or not all(bundle["verification_gate"].values())
            or bundle["accepted_im02_sha256"] != acceptance["accepted_im02_sha256"]
            or content_hash({gid: m["content_sha256"] for gid, m in bundle["members"].items()})
            != bundle["membership_sha256"]
        ):
            raise ValueError("unverified or incomplete bundle")
        for field, contract in (
            ("method_contract_sha256", "impact-possession-method-v2.md"),
            ("gate_contract_sha256", "impact-event-verification-v1.md"),
        ):
            if hash_file(Path("docs/design") / contract)[0] != bundle[field]:
                raise ValueError("IM03 contract changed")
        for name, expected in bundle["code_sha256"].items():
            if hash_file(Path(name))[0] != expected:
                raise ValueError("IM03 implementation changed")
        season, phase = bundle["season"], bundle["phase"]
        key = f"{season}:{phase}"
        if key in cohorts:
            raise ValueError("duplicate season/phase")
        stints: list[Stint] = []
        membership = {}
        bodies = []
        for gid, member in sorted(bundle["members"].items()):
            game = checked(Path(member["path"]), member["content_sha256"])
            if game["game_id"] != gid or game["method_version"] != METHOD_VERSION_V2:
                raise ValueError("wrong game or method")
            membership[gid] = {
                "sha256": game["content_sha256"],
                "day": member["schedule"]["game_date"],
                "quality": game["quality"],
            }
            for s in game["stints"]:
                if (
                    content_hash({k: v for k, v in s.items() if k != "source_hash"})
                    != s["source_hash"]
                ):
                    raise ValueError("changed stint")
                bodies.append((gid, s))
                stints.append(
                    Stint(
                        gid,
                        member["schedule"]["game_date"],
                        season,
                        s["home_team_id"],
                        s["away_team_id"],
                        tuple(s["home_lineup_json"]),
                        tuple(s["away_lineup_json"]),
                        s["duration_seconds"],
                        s["home_points"],
                        s["away_points"],
                        s["home_possessions"],
                        s["away_possessions"],
                        s["stats_json"][s["home_team_id"]],
                        s["stats_json"][s["away_team_id"]],
                    )
                )
        if len(stints) != bundle["counts"]["stints"]:
            raise ValueError("incomplete stint membership")
        if database is not None:
            verify_database(database, admitted[digest], bodies)
        cohorts[key] = {"season": season, "phase": phase, "stints": stints, "games": membership}
        provenance["cohorts"][key] = {
            "dataset": admitted[digest],
            "im02_summary": bundle["im02_summary"],
            "box_estimate": bundle["possession_estimate_distribution"],
            "public_diagnostic": bundle["public_possession_crosscheck"],
        }
    return cohorts, provenance


def verify_database(database: Engine, dataset: dict[str, Any], bodies: list[Any]) -> None:
    with database.connect() as connection:
        connection.execute(text("SET TRANSACTION READ ONLY"))
        row = (
            connection.execute(
                text(
                    "SELECT content_sha256, membership_sha256, status, admission_transaction "
                    "FROM workbench_datasets WHERE id = :id"
                ),
                {"id": dataset["id"]},
            )
            .mappings()
            .one()
        )
        if dict(row) != {k: dataset[k] for k in row}:
            raise ValueError("database identity differs from sealed acceptance")
        expected = {(gid, s["stint_index"]): s for gid, s in bodies}
        fields = list(bodies[0][1])
        columns = ", ".join(["game_id", *fields])
        stored = connection.execute(
            text(f"SELECT {columns} FROM workbench_lineup_stints WHERE dataset_id = :id"),
            {"id": dataset["id"]},
        ).mappings()
        seen = set()
        for row in stored:
            values = dict(row)
            gid = values.pop("game_id")
            key = (gid, values["stint_index"])
            if key in seen or values != expected.get(key):
                raise ValueError("stored stint differs from accepted body")
            seen.add(key)
        if seen != set(expected):
            raise ValueError("missing stored stint")


def select_window(cohorts: list[dict[str, Any]], cutoff: str) -> tuple[list[Stint], dict[str, Any]]:
    date.fromisoformat(cutoff)
    if not cohorts or len({c["phase"] for c in cohorts}) != 1:
        raise ValueError("one competition phase required")
    years = sorted(int(c["season"][:4]) for c in cohorts)
    if years != list(range(years[0], years[0] + len(years))):
        raise ValueError("consecutive unique seasons required")
    selected: dict[str, Any] = {}
    stints: list[Stint] = []
    for c in sorted(cohorts, key=lambda c: c["season"]):
        for gid, info in sorted(c["games"].items()):
            if info["day"] < cutoff:
                if gid in selected:
                    raise ValueError("duplicate game")
                selected[gid] = info
        stints.extend(s for s in c["stints"] if s.day < cutoff)
    stints.sort(key=lambda s: (s.day, s.game))  # stable preserves within-game stint order
    if not stints:
        raise ValueError("no games before cutoff")
    return stints, {
        "games": selected,
        "cutoff": cutoff,
        "phase": cohorts[0]["phase"],
        "seasons": sorted(c["season"] for c in cohorts),
        "quality_counts": dict(Counter(g["quality"] for g in selected.values())),
    }


def box_profiles(cohort: dict[str, Any], raw_root: Path) -> tuple[dict[str, list[float]], str]:
    players, _, receipts = retained_boxes(raw_root, int(cohort["season"][:4]) + 1)
    samples = support(cohort["stints"], "rapm")
    sums: dict[str, list[float]] = {}
    incomplete = set()
    active: dict[str, set[str]] = {}
    for stint in cohort["stints"]:
        active.setdefault(stint.game, set()).update((*stint.home, *stint.away))
    for gid in sorted(cohort["games"]):
        if gid not in players:
            raise ValueError("missing accepted player box game")
        seen = set()
        for row in players[gid]:
            p = row["person_id"]
            if p not in active[gid]:
                continue
            if p in seen:
                raise ValueError("duplicate player box row")
            seen.add(p)
            try:
                values = [float(row[k]) for k in BOX_FIELDS]
                if any(not math.isfinite(v) or v < 0 for v in values):
                    raise ValueError("invalid box count")
            except (ValueError, KeyError):
                incomplete.add(p)
                continue
            totals = sums.setdefault(p, [0.0] * len(BOX_FIELDS))
            for i, v in enumerate(values):
                totals[i] += v
        incomplete.update(active[gid] - seen)
    result = {
        p: [100 * v / samples[p]["off_opportunities"] for v in values]
        for p, values in sums.items()
        if p not in incomplete and samples[p]["off_opportunities"] > 0 and samples[p]["seconds"] > 0
    }
    return result, receipts["player_box"]


def write_artifact(root: Path, obj: dict[str, Any]) -> tuple[Path, str]:
    payload = json.dumps(
        obj, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False
    ).encode()
    digest = content_hash(obj)
    root.mkdir(parents=True, exist_ok=True)
    path = root / f"{digest}.json"
    try:
        with path.open("xb") as stream:
            stream.write(payload)
    except FileExistsError:
        if path.read_bytes() != payload:
            raise ValueError("existing rating artifact changed") from None
    return path, digest
