"""Independently compare sealed PostgreSQL facts to retained IM03/IM02 members."""

from __future__ import annotations

import argparse
import time
from collections import Counter
from decimal import Decimal
from pathlib import Path

from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from courtlens.database import engine
from courtlens.ingestion.impact_population import read_json, verified_report, verify_event_receipt
from courtlens.ingestion.impact_repair_audit import retain_candidate
from courtlens.ingestion.native_reconstruction import content_hash
from courtlens.ingestion.sportsdataverse import hash_file
from courtlens.workbench_models import (
    WorkbenchDataset,
    WorkbenchDatasetMember,
    WorkbenchLineupStint,
    WorkbenchPossession,
    WorkbenchReconstructionOverride,
    WorkbenchSchedule,
    WorkbenchStintPlayer,
    WorkbenchVersion,
)


def verify(session: Session, path: Path, accepted: dict) -> dict:
    started = time.monotonic()
    bundle = read_json(path)
    assert (
        content_hash({k: v for k, v in bundle.items() if k != "content_sha256"})
        == bundle["content_sha256"]
    )
    assert accepted["content_sha256"] == bundle["accepted_im02_sha256"]
    cohort = accepted["seasons"][f"{bundle['season']}:{bundle['phase']}"]
    assert set(bundle["members"]) == {
        gid for gid, g in cohort["games"].items() if g["quality"] != "excluded"
    }
    assert bundle["im02_summary"] == cohort["summary"]
    assert all(
        m["candidate_sha256"] == cohort["games"][gid]["content_sha256"]
        for gid, m in bundle["members"].items()
    )
    dataset = session.scalar(
        select(WorkbenchDataset).where(WorkbenchDataset.content_sha256 == bundle["content_sha256"])
    )
    assert dataset is not None
    expected_status = "ready" if all(bundle["verification_gate"].values()) else "candidate"
    assert dataset.status == expected_status
    assert dataset.admission_transaction is not None
    assert dataset.membership_sha256 == bundle["membership_sha256"]
    memberships = (
        session.execute(
            select(WorkbenchVersion.content_sha256)
            .join(WorkbenchDatasetMember, WorkbenchDatasetMember.version_id == WorkbenchVersion.id)
            .where(WorkbenchDatasetMember.dataset_id == dataset.id)
        )
        .scalars()
        .all()
    )
    assert sorted(memberships) == sorted(m["content_sha256"] for m in bundle["members"].values())
    counts = Counter()
    event_verified = 0
    minute_errors = []
    orb_deltas = []
    turnover_deltas = []
    for gid, member in sorted(bundle["members"].items()):
        game = read_json(Path(member["path"]))
        candidate = read_json(Path(member["candidate_path"]))
        if bundle.get("gate_version"):
            event_check = verify_event_receipt(member, game)
            assert event_check["passed"] and event_check["public_passed"]
            event_verified += 1
        assert (
            content_hash({k: v for k, v in game.items() if k != "content_sha256"})
            == member["content_sha256"]
        )
        assert (
            content_hash({k: v for k, v in candidate.items() if k != "content_sha256"})
            == member["candidate_sha256"]
        )
        for model, name, index_key in (
            (WorkbenchLineupStint, "stints", "stint_index"),
            (WorkbenchPossession, "possessions", "possession_number"),
        ):
            expected = game[name]
            fields = list(expected[0])
            rows = (
                session.execute(
                    select(*(getattr(model, k) for k in fields))
                    .where(model.dataset_id == dataset.id, model.game_id == gid)
                    .order_by(getattr(model, index_key))
                )
                .mappings()
                .all()
            )
            assert [dict(r) for r in rows] == expected, (gid, name)
            for row in rows:
                assert (
                    content_hash({k: v for k, v in row.items() if k != "source_hash"})
                    == row["source_hash"]
                )
            counts[name] += len(rows)
        repairs = session.scalars(
            select(WorkbenchReconstructionOverride.override_value_json).where(
                WorkbenchReconstructionOverride.dataset_id == dataset.id,
                WorkbenchReconstructionOverride.game_id == gid,
            )
        ).all()
        assert {r["repair_sha256"]: r for r in repairs} == {
            r["repair_sha256"]: r for r in candidate["repairs"] + game.get("method_repairs", [])
        }
        counts["overrides"] += len(repairs)
        rows = session.execute(
            select(WorkbenchStintPlayer.player_id, func.sum(WorkbenchStintPlayer.duration_seconds))
            .where(
                WorkbenchStintPlayer.dataset_id == dataset.id, WorkbenchStintPlayer.game_id == gid
            )
            .group_by(WorkbenchStintPlayer.player_id)
        ).all()
        seconds = {pid: Decimal(str(value)) for pid, value in rows}
        for pid, comparison in candidate["player_comparisons"].items():
            assert abs(seconds.get(pid, Decimal(0)) - Decimal(comparison["seconds"])) < Decimal(
                "0.000001"
            )
            if comparison["box_seconds"] is not None:
                delta = abs(seconds.get(pid, Decimal(0)) - Decimal(comparison["box_seconds"]))
                minute_errors.append(float(delta))
                if candidate["quality"] == "clean":
                    assert delta <= 1
        # Check ten player rows per stint and per-side team point conservation in SQL.
        player_rows = session.execute(
            select(
                WorkbenchStintPlayer.stint_id,
                func.count(),
                func.sum(WorkbenchStintPlayer.duration_seconds),
            )
            .where(
                WorkbenchStintPlayer.dataset_id == dataset.id, WorkbenchStintPlayer.game_id == gid
            )
            .group_by(WorkbenchStintPlayer.stint_id)
        ).all()
        assert all(count == 10 for _, count, _ in player_rows)
        counts["stint_players"] += sum(count for _, count, _ in player_rows)
        assert len(player_rows) == len(game["stints"])
        schedule = session.scalar(
            select(WorkbenchSchedule).where(
                WorkbenchSchedule.dataset_id == dataset.id, WorkbenchSchedule.game_id == gid
            )
        )
        assert (
            schedule is not None
            and schedule.game_date.isoformat() == member["schedule"]["game_date"]
        )
        for side in ("home", "away"):
            team = member["schedule"][f"{side}_team_id"]
            expected_points = int(member["schedule"][f"{side}_pts"])
            assert sum(s[f"{side}_points"] for s in game["stints"]) == expected_points
            assert (
                sum(p["points"] for p in game["possessions"] if p["offense_team_id"] == team)
                == expected_points
            )
            assert schedule.annotations_json["conservation"][team] == game["conservation"][team]
            orb_deltas.append(game["conservation"][team]["orb_box_delta"])
            turnover_deltas.append(game["conservation"][team]["turnovers_box_delta"])
        counts["games"] += 1
        if counts["games"] % 200 == 0:
            print("verified", bundle["season"], bundle["phase"], counts["games"], flush=True)
    assert counts["stints"] == bundle["counts"]["stints"]
    assert counts["possessions"] == bundle["counts"]["possessions"]
    return {
        "dataset_id": dataset.id,
        "status": dataset.status,
        "bundle_path": str(path),
        "content_sha256": bundle["content_sha256"],
        "membership_sha256": dataset.membership_sha256,
        "season": bundle["season"],
        "phase": bundle["phase"],
        "verified_rows": dict(counts),
        "independently_event_verified_games": event_verified,
        "known_minute_comparisons": len(minute_errors),
        "maximum_box_minute_error_seconds": max(minute_errors),
        "orb_box_delta_distribution": {str(k): v for k, v in Counter(orb_deltas).items()},
        "turnover_box_delta_distribution": {str(k): v for k, v in Counter(turnover_deltas).items()},
        "verification_gate": bundle["verification_gate"],
        "box_estimate_distribution": {
            k: v for k, v in bundle["possession_estimate_distribution"].items() if k != "deltas"
        },
        "public_crosscheck": {
            k: v
            for k, v in bundle["public_possession_crosscheck"].items()
            if k != "unavailable_games"
        },
        "elapsed_seconds": round(time.monotonic() - started, 3),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--bundle", type=Path, action="append", required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument(
        "--accepted-report",
        type=Path,
        default=Path("docs/evidence/im02/audit-accepted-first.json.gz"),
    )
    args = parser.parse_args()
    accepted = verified_report(args.accepted_report)
    reports = []
    with Session(engine) as session:
        session.execute(text("SET TRANSACTION READ ONLY"))
        version = session.scalar(text("SELECT version()"))
        for path in args.bundle:
            reports.append(verify(session, path, accepted))
    result = {
        "database_version": version,
        "seasons": reports,
        "accepted_im02_sha256": accepted["content_sha256"],
        "verifier_sha256": hash_file(Path(__file__))[0],
    }
    result["content_sha256"] = content_hash(result)
    retain_candidate(args.output, result)
    print("independent verification retained", args.output, result["content_sha256"], flush=True)


if __name__ == "__main__":
    main()
